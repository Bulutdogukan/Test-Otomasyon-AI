const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { spawn } = require('child_process');
const helmet = require('helmet');

// YENİ MİMARİ BAĞLANTISI (Child Process yerine direkt modül çağrısı)
require('dotenv').config();

// Ortam değişkenleri kontrolü
if (!process.env.OLLAMA_URL || !process.env.OLLAMA_MODEL) {
    console.error('❌ HATA: .env dosyasında OLLAMA_URL ve OLLAMA_MODEL tanımlanması gerekli!');
    console.error('   .env.example dosyasını .env olarak kopyalayıp doldurabilirsiniz.');
    process.exit(1);
}

const { executeAutonomousFlow } = require('./src/core/orchestrator');
const { stageSpecTree } = require('./src/utils/staging');
const { sanitizeTargetUrl } = require('./src/utils/url');
const { spawnNpx } = require('./src/utils/npx');
const { cleanReportDirs } = require('./src/utils/reportDirs');

// ⚠️ DÜZELTME: Süreç seviyesinde güvenlik ağı. İşlenmemiş promise reddi veya
// yakalanmamış istisna artık sunucuyu sessizce kilitlemez/çökertmez; loglanır.
process.on('unhandledRejection', (reason) => {
    console.error('\n⚠️ İŞLENMEMİŞ PROMISE REDDİ:', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('\n💥 YAKALANMAMIŞ İSTİSNA:', err && err.stack ? err.stack : err);
});

// ⚠️ DÜZELTME: Eşzamanlılık kilidi. Orchestrator sabit dosya yollarına
// ve global process.env'e yazdığından, paralel akışlar birbirinin durumunu/
// çıktısını bozardı. Aynı anda tek akışa izin veriyoruz.
let isFlowRunning = false;
// Toplu (paralel) koşum için ayrı kilit — AI üretim akışıyla (isFlowRunning) aynı anda
// çalışırsa dosya/rapor klasörleri çakışabilir, bu yüzden ikisi karşılıklı birbirini engeller.
let isBatchRunning = false;

const app = express();
// Proxy arkasındayken (örn. Nginx, load balancer) gerçek istemci IP'si
// X-Forwarded-For başlığından okunur; aksi halde tüm istekler proxy IP'sinden gelir.
app.set('trust proxy', 1);
// 🔒 HTTP güvenlik başlıkları (X-Frame-Options, X-Content-Type-Options, vb.)
// CSP ve COEP kapalı — Socket.io + satır içi script'lerle çakışır.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const server = http.createServer(app);
// ⚠️ DÜZELTME: Uzun keşif+self-healing döngüleri dakikalar sürebilir.
// Varsayılan Socket.io ping timeout (~20sn) bu sürede bağlantıyı koparıyordu.
const io = new Server(server, {
    pingTimeout: 120000,
    pingInterval: 30000,
    // 🔒 CORS: Yalnızca kendi arayüzümüzden gelen bağlantılara izin verilir.
    // Varsayılan "*" tüm origin'lere açıktı; aynı ağdaki başka bir web sayfası
    // tarayıcı üzerinden WebSocket bağlantısı kurabilirdi.
    cors: {
        origin: `http://localhost:${process.env.PORT || 3000}`,
        credentials: true
    }
});

// ==========================================================================
// 🔐 ERİŞİM KORUMASI (APP_TOKEN)
// --------------------------------------------------------------------------
// Sunucu kullanıcının kendi makinesinde çalışır ama README'de anlatılan
// Windows + Mac Mini senaryosunda LAN'a açıktır. Kimlik doğrulama olmadan
// aynı ağdaki herkes test koşturabilir / klasör oluşturabilirdi.
// .env içinde APP_TOKEN tanımlıysa hem Socket.io hem korumalı HTTP uçları
// bu anahtarı ister. Tanımlı değilse (tek makinede lokal kullanım) koruma
// kapalıdır ve açılışta uyarı basılır.
// ==========================================================================
const APP_TOKEN = (process.env.APP_TOKEN || '').trim();
const AUTH_REQUIRED = APP_TOKEN.length > 0;
const AUTH_COOKIE = 'qa_auth';

// Zamanlama saldırılarına kapalı karşılaştırma. Uzunluk sızıntısı olmasın diye
// iki değer de önce sabit uzunlukta hash'lenir.
function tokenMatches(candidate) {
    if (!candidate) return false;
    const a = crypto.createHash('sha256').update(String(candidate)).digest();
    const b = crypto.createHash('sha256').update(APP_TOKEN).digest();
    return crypto.timingSafeEqual(a, b);
}

// cookie-parser bağımlılığı eklemeye değmeyecek kadar basit bir okuma.
function readCookie(header, name) {
    if (!header) return null;
    for (const part of String(header).split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) {
            try {
                return decodeURIComponent(part.slice(idx + 1).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

// 🚦 Kaba kuvvet denemelerine karşı basit, bellek içi hız sınırı.
const authAttempts = new Map(); // ip -> { count, resetAt }
const AUTH_MAX_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 60 * 1000;

function registerFailedAuth(ip) {
    const now = Date.now();
    const rec = authAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
        authAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
        return;
    }
    rec.count += 1;
}

function isAuthBlocked(ip) {
    const rec = authAttempts.get(ip);
    if (!rec) return false;
    if (Date.now() > rec.resetAt) {
        authAttempts.delete(ip);
        return false;
    }
    return rec.count >= AUTH_MAX_ATTEMPTS;
}

function requireAuth(req, res, next) {
    if (!AUTH_REQUIRED) return next();
    const supplied = req.headers['x-app-token'] ||
        readCookie(req.headers.cookie, AUTH_COOKIE) ||
        (req.query && req.query.token);
    if (tokenMatches(supplied)) return next();
    res.status(401).json({ error: 'Yetkisiz istek. Geçerli bir erişim anahtarı gerekli.' });
}

// Socket.io el sıkışmasında anahtar doğrulanır; geçersizse bağlantı hiç kurulmaz.
io.use((socket, next) => {
    if (!AUTH_REQUIRED) return next();
    const supplied = (socket.handshake.auth && socket.handshake.auth.token) ||
        readCookie(socket.handshake.headers && socket.handshake.headers.cookie, AUTH_COOKIE);
    if (tokenMatches(supplied)) return next();
    next(new Error('unauthorized'));
});

// 📁 Yüklenen senaryo dosyaları için MUTLAK yol. Göreli 'uploads/' kullanılırsa
// sunucu farklı bir çalışma dizininden başlatıldığında dosyalar yanlış yere düşer.
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// ⚠️ DÜZELTME: Sunucu çökmesinde finally bloğu çalışmaz, geçici dosyalar birikir.
// Başlangıçta kalan eski dosyalar temizlenir.
try {
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
        fs.unlinkSync(path.join(UPLOAD_DIR, f));
    }
} catch { /* uploads boşsa veya izin yoksa sessizce geç */ }

// 🔒 URL doğrulaması src/utils/url.js içindedir (CLI ile ortak kural).
// İç ağ adresleri varsayılan olarak serbesttir; QA_BLOCK_PRIVATE_URLS / QA_ALLOWED_HOSTS ile kısıtlanır.

const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB üst sınır
    fileFilter: (req, file, cb) => {
        const ok = /\.(txt|feature|md)$/i.test(file.originalname);
        cb(ok ? null : new Error('Sadece .txt, .feature veya .md dosyaları kabul edilir.'), ok);
    }
});

app.use(express.json());
// Arayüzün kendisi (HTML/CSS/JS) gizli bilgi içermez; giriş ekranını gösterebilmesi
// için korumasız servis edilir. Gerçek yetenekler (test koşma, klasör seçme,
// rapor okuma) aşağıda korumalıdır.
app.use(express.static(path.join(__dirname, 'public')));

// Arayüz, giriş ekranı gösterip göstermeyeceğini buradan öğrenir.
app.get('/api/config', (req, res) => {
    res.json({ authRequired: AUTH_REQUIRED });
});

// Anahtar doğrulanırsa cookie yazılır; böylece /allure altındaki onlarca alt kaynak
// (js/css/json) için ayrı ayrı başlık göndermek gerekmez.
// ⚠️ DÜZELTME: POST'a alındı — GET olduğunda token URL'ye (sorgu parametresi) giriyordu,
// sunucu loglarına ve tarayıcı geçmişine düşüyordu.
app.post('/api/auth', (req, res) => {
    if (!AUTH_REQUIRED) return res.json({ ok: true, authRequired: false });

    const ip = req.ip || 'bilinmeyen';
    if (isAuthBlocked(ip)) {
        return res.status(429).json({ error: 'Çok fazla hatalı deneme. Lütfen bir dakika sonra tekrar deneyin.' });
    }

    // Token önce başlıktan, yoksa JSON gövdesinden okunur (query param artık kabul edilmiyor).
    const supplied = req.headers['x-app-token'] || (req.body && req.body.token);
    if (!tokenMatches(supplied)) {
        registerFailedAuth(ip);
        return res.status(401).json({ error: 'Erişim anahtarı hatalı.' });
    }

    authAttempts.delete(ip);
    res.cookie(AUTH_COOKIE, APP_TOKEN, {
        httpOnly: true,
        // ⚠️ DÜZELTME: 'lax' → 'strict'. Strict modda cookie ASLA başka
        // bir domain'in isteğiyle gönderilmez → CSRF saldırıları bloklanır.
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ ok: true, authRequired: true });
});

app.use('/allure', requireAuth, express.static(path.join(__dirname, 'allure-report')));

// Console logları arayüze basmak için process çıktısını hookluyoruz.
// ⚠️ DÜZELTME: Önceden yalnızca stdout hooklanıyordu. logger.logError() ise
// console.error (stderr) kullandığı için KRİTİK satırlar arayüze hiç düşmüyordu.
// ⚠️ DÜZELTME (v2): Önceki yaklaşımda her attachConsoleBridge çağrısı write fonksiyonunu
// tamamen değiştiriyordu; birden fazla socket bağlıyken son bağlanan öncekini ezerdi.
// Şimdi aktif socket referansı tutulur ve detach'te yalnızca eşleşen socket temizlenir.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
let bridgedSocket = null;

process.stdout.write = (chunk, encoding, callback) => {
    if (bridgedSocket) bridgedSocket.emit('log', chunk.toString());
    return originalStdoutWrite(chunk, encoding, callback);
};
process.stderr.write = (chunk, encoding, callback) => {
    if (bridgedSocket) bridgedSocket.emit('log', chunk.toString());
    return originalStderrWrite(chunk, encoding, callback);
};

function attachConsoleBridge(socket) {
    bridgedSocket = socket;
}

function detachConsoleBridge() {
    bridgedSocket = null;
}

// 🔒 İstemciden gelen klasör yolu doğrulanmadan kullanılmaz.
// Boş/undefined -> null (varsayılan klasör). Geçersizse Error fırlatır.
// QA_ALLOWED_ROOT tanımlıysa yol ayrıca o kökün altında olmak ZORUNDADIR.
const ALLOWED_ROOT = process.env.QA_ALLOWED_ROOT ? path.resolve(process.env.QA_ALLOWED_ROOT) : null;

function sanitizeFolderPath(raw) {
    if (raw == null) return null;
    let clean = String(raw).trim().replace(/^"(.*)"$/, '$1').trim(); // yapıştırılan tırnakları soy
    if (!clean) return null;
    // Windows dosya yollarında zaten geçersiz olan karakterler + satır sonları reddedilir.
    if (/["\r\n<>|*?]/.test(clean)) throw new Error('Klasör yolu geçersiz karakter içeriyor.');
    clean = path.normalize(clean);
    if (!path.isAbsolute(clean)) throw new Error('Klasör yolu tam (absolute) olmalı. Örnek: C:\\QA-Testlerim\\Kampanya');
    if (ALLOWED_ROOT) {
        const rel = path.relative(ALLOWED_ROOT, clean);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            throw new Error(`Klasör yolu izin verilen kök dizinin dışında (QA_ALLOWED_ROOT=${ALLOWED_ROOT}).`);
        }
    }
    return clean;
}

// Gerçek "Klasör Seç" diyaloğu: sunucu kullanıcının kendi makinesinde çalıştığı
// için diyalog doğru ekranda belirir. Windows: PowerShell betiği, macOS (Mac mini): osascript.
// NOT: Native klasör diyaloğu arka plan sürecinden açıldığında varsayılan olarak
// tarayıcının ARKASINDA kalır -> kullanıcı "çalışmıyor" sanır. Windows betiği
// (scripts/pick-folder.ps1) diyaloğu bulup HWND_TOPMOST ile öne çeker.
const FOLDER_DIALOG_PS1 = path.join(__dirname, 'scripts', 'pick-folder.ps1');
// macOS: standart Standard Additions komutu; seçilen klasörün POSIX yolunu döner.
// İptalde osascript hata koduyla çıkar (stdout boş -> sunucu cancelled emit eder).
const FOLDER_DIALOG_OSA = 'POSIX path of (choose folder with prompt "Testlerin kaydedilecegi / kosulacagi klasoru secin")';
let isPickingFolder = false;

function spawnFolderDialog() {
    if (process.platform === 'win32') {
        return spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', FOLDER_DIALOG_PS1]);
    }
    if (process.platform === 'darwin') {
        return spawn('osascript', ['-e', FOLDER_DIALOG_OSA]);
    }
    return null;
}

// Ollama'daki kurulu modelleri listelemek için /api/chat -> /api/tags türetilir.
function deriveOllamaTagsUrl() {
    try {
        const u = new URL(process.env.OLLAMA_URL);
        return `${u.origin}/api/tags`;
    } catch {
        return null;
    }
}

// Model adı yalnızca Ollama JSON gövdesine gider ama yine de sıkı doğrulanır.
function sanitizeModelName(raw) {
    if (raw == null || !String(raw).trim()) return null; // boş -> .env varsayılanı
    const clean = String(raw).trim();
    if (!/^[A-Za-z0-9._:\/-]{1,100}$/.test(clean)) throw new Error('Geçersiz model adı.');
    return clean;
}


// 🚦 /upload endpoint'i için hız sınırı (dosya yükleme spam'ini önler).
const uploadAttempts = new Map(); // ip -> { count, resetAt }
const UPLOAD_MAX_ATTEMPTS = 20;
const UPLOAD_WINDOW_MS = 60 * 1000;

function uploadRateLimit(req, res, next) {
    const ip = req.ip || 'bilinmeyen';
    const now = Date.now();
    const rec = uploadAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
        uploadAttempts.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
        return next();
    }
    rec.count += 1;
    if (rec.count > UPLOAD_MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Çok fazla dosya yükleme denemesi. Lütfen bir dakika sonra tekrar deneyin.' });
    }
    return next();
}

app.post('/upload', requireAuth, uploadRateLimit, (req, res) => {
    // multer'ı manuel çağırıp boyut/tip hatalarını 400 ile düzgün döndürüyoruz (aksi halde 500).
    upload.single('scenarioFile')(req, res, (uploadErr) => {
        if (uploadErr) return res.status(400).json({ error: uploadErr.message });
        if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı.' });
        try {
            const fileContent = fs.readFileSync(req.file.path, 'utf-8');
            res.json({ content: fileContent });
        } catch (err) {
            res.status(500).json({ error: 'Dosya okunamadı: ' + err.message });
        } finally {
            // ⚠️ DÜZELTME: Okuma hata verirse de geçici dosya silinsin (uploads/ şişmesin).
            try { fs.unlinkSync(req.file.path); } catch { /* zaten yok */ }
        }
    });
});

// 🚦 Socket başına hız sınırı: test başlatma event'ları için son tetiklenme zamanı
// takip edilir. Kilitler (isFlowRunning) eşzamanlılığı engelliyor olsa da ek
// güvence olarak tek bir socket'ten spam gönderilmesi önlenir.
const socketLastEvent = new Map(); // socketId -> lastEventMs
const SOCKET_EVENT_COOLDOWN_MS = 5000; // 5 saniyede bir başlatma isteği

function checkSocketCooldown(socket, eventName) {
    const key = `${socket.id}:${eventName}`;
    const last = socketLastEvent.get(key) || 0;
    if (Date.now() - last < SOCKET_EVENT_COOLDOWN_MS) return false;
    socketLastEvent.set(key, Date.now());
    return true;
}

io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        // Bağlantı kapanınca ilgili rate limit kayıtları temizlenir (bellek sızıntısı önlenir).
        for (const key of socketLastEvent.keys()) {
            if (key.startsWith(socket.id + ':')) socketLastEvent.delete(key);
        }
    });
    // 📁 Native klasör seçme diyaloğu (Windows: PowerShell, macOS: osascript).
    socket.on('select_folder', () => {
        if (isPickingFolder) {
            // ⚠️ DÜZELTME: Önceden sessizce return ediliyordu; kullanıcı butonun
            // çalışmadığını sanıyordu. Artık nedeni bildiriliyor.
            socket.emit('folder_selected', { error: 'Zaten açık bir klasör seçme penceresi var. Lütfen önce onu tamamlayın.' });
            return;
        }
        const dialog = spawnFolderDialog();
        if (!dialog) {
            socket.emit('folder_selected', { error: 'Klasör seçme diyaloğu bu işletim sisteminde desteklenmiyor. Yolu elle yazabilirsiniz.' });
            return;
        }
        isPickingFolder = true;

        let out = '';
        dialog.stdout.on('data', d => out += d.toString());
        dialog.on('error', (err) => {
            isPickingFolder = false;
            socket.emit('folder_selected', { error: 'Diyalog açılamadı: ' + err.message });
        });
        dialog.on('close', () => {
            isPickingFolder = false;
            // macOS osascript sondaki / ve satır sonunu bırakır; ikisi de temizlenir.
            const selected = out.trim().replace(/\/$/, '');
            if (selected) socket.emit('folder_selected', { path: selected });
            else socket.emit('folder_selected', { cancelled: true });
        });
    });

    // 🧠 Kurulu Ollama modellerini UI'a bildirir (model seçici dropdown için).
    socket.on('get_models', async () => {
        const tagsUrl = deriveOllamaTagsUrl();
        try {
            if (!tagsUrl) throw new Error('OLLAMA_URL çözümlenemedi');
            const res = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
            const data = await res.json();
            const models = (data.models || []).map(m => m.name);
            socket.emit('models_list', { models, current: process.env.OLLAMA_MODEL });
        } catch (e) {
            socket.emit('models_list', { models: [], current: process.env.OLLAMA_MODEL, error: 'Model listesi alınamadı: ' + e.message });
        }
    });

    socket.on('start_test', async (data) => {
        if (!checkSocketCooldown(socket, 'start_test')) {
            socket.emit('log', `\n⛔ Çok hızlı istek. Lütfen birkaç saniye bekleyip tekrar deneyin.\n`);
            socket.emit('test_finished');
            return;
        }
        // ⚠️ DÜZELTME: Bir akış çalışırken gelen ikinci istek, stdout hook'u kurulmadan
        // ÖNCE reddedilir (aksi halde hook'lar çakışır, dosyalar ezişir).
        if (isFlowRunning || isBatchRunning) {
            socket.emit('log', `\n⛔ Şu anda başka bir test akışı çalışıyor. Lütfen tamamlanmasını bekleyip tekrar deneyin.\n`);
            socket.emit('test_finished');
            return;
        }

        const { url, prompt, video, screenshot, useGrid, outputDir, model } = data || {};

        if (!url || !String(url).trim() || !prompt || !String(prompt).trim()) {
            socket.emit('log', `\n❌ Girdi hatası: Hedef URL ve senaryo metni zorunludur.\n`);
            socket.emit('test_finished');
            return;
        }

        // 🔒 URL güvenlik doğrulaması: tehlikeli şemalar ve (açıksa) izin dışı adresler reddedilir.
        let safeUrl;
        try {
            safeUrl = sanitizeTargetUrl(url);
        } catch (e) {
            socket.emit('log', `\n❌ URL hatası: ${e.message}\n`);
            socket.emit('test_finished');
            return;
        }

        // 📁 Kayıt klasörü + 🧠 model seçimi doğrulanır (boşsa varsayılanlar kullanılır).
        let targetDir = null;
        let selectedModel = null;
        try {
            targetDir = sanitizeFolderPath(outputDir);
            if (targetDir && !fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
            selectedModel = sanitizeModelName(model);
        } catch (e) {
            socket.emit('log', `\n❌ Girdi hatası: ${e.message}\n`);
            socket.emit('test_finished');
            return;
        }
        isFlowRunning = true;

        // ☁️ GRID ATAMASI: Derlenen Playwright testi PW_WS_ENDPOINT'i okur.
        // (Keşif fazı doğrudan GRID_WS_ENDPOINT'e bakar; ayrı bir değişkene gerek yok.)
        const gridActive = !!useGrid && !!process.env.GRID_WS_ENDPOINT;
        if (gridActive) {
            process.env.PW_WS_ENDPOINT = process.env.GRID_WS_ENDPOINT;
        } else {
            // Lokal çalışmada önceki akıştan kalan değer karışıklık yaratmasın.
            delete process.env.PW_WS_ENDPOINT;
        }

        process.env.TARGET_URL = safeUrl;
        process.env.SAVE_VIDEO = video ? 'retain-on-failure' : 'off';
        process.env.SAVE_SCREENSHOT = screenshot ? 'only-on-failure' : 'off';

        // ⚠️ DÜZELTME: Aynı bilgiyi iki kez basan tekrarlı banner tek bloğa indirildi.
        socket.emit('log', `\n==================================================\n`);
        socket.emit('log', `🚀 YENİ TEST BAŞLATILDI (Modüler Mimari)\n`);
        socket.emit('log', `🌐 Hedef: ${safeUrl}\n`);
        socket.emit('log', `🖥️ Ortam: ${gridActive ? '☁️ Uzak Sunucu (Grid)' : '💻 Lokal Makine'}\n`);
        socket.emit('log', `📁 Kayıt Klasörü: ${targetDir || 'tests/generated (varsayılan)'}\n`);
        socket.emit('log', `🧠 Model: ${selectedModel || process.env.OLLAMA_MODEL + ' (varsayılan)'}\n`);
        socket.emit('log', `==================================================\n`);

        if (useGrid && !process.env.GRID_WS_ENDPOINT) {
            socket.emit('log', `\n⚠️ "Uzak Sunucuda Çalıştır" seçili ama .env içinde GRID_WS_ENDPOINT tanımlı değil — lokal tarayıcı kullanılacak.\n`);
        }

        attachConsoleBridge(socket);

        try {
            // YENİ MİMARİ: Orchestrator'ı doğrudan çağırıyoruz (Child Process hantallığı bitti)
            const { exitCode, featurePath, specPath } = await executeAutonomousFlow(safeUrl, prompt, gridActive, targetDir, selectedModel);

            socket.emit('log', `\n✅ Test Döngüsü Tamamlandı. (Çıkış Kodu: ${exitCode})\n`);

            let tsCode = "// TS Kodu bulunamadı";
            let featureCode = "// Feature dosyası bulunamadı";

            if (specPath && fs.existsSync(specPath)) tsCode = fs.readFileSync(specPath, 'utf-8');
            if (featurePath && fs.existsSync(featurePath)) featureCode = fs.readFileSync(featurePath, 'utf-8');

            socket.emit('test_code', { ts: tsCode, feature: featureCode });
            socket.emit('test_finished');

        } catch (error) {
            socket.emit('log', `\n❌ AKIŞ DURDURULDU: ${error.message}\n`);
            socket.emit('test_finished'); // Hata alsa bile butonu aktif et
        } finally {
            // Hook'u kapat ve eşzamanlılık kilidini serbest bırak
            detachConsoleBridge();
            isFlowRunning = false;
        }
    });

    socket.on('run_all_tests', (data = {}) => {
        if (!checkSocketCooldown(socket, 'run_all_tests')) {
            socket.emit('log', `\n⛔ Çok hızlı istek. Lütfen birkaç saniye bekleyip tekrar deneyin.\n`);
            socket.emit('all_tests_finished');
            return;
        }
        if (isFlowRunning || isBatchRunning) {
            socket.emit('log', `\n⛔ Şu anda başka bir test akışı çalışıyor. Lütfen tamamlanmasını bekleyip tekrar deneyin.\n`);
            socket.emit('all_tests_finished');
            return;
        }

        // 📁 Kullanıcının seçtiği klasör koşulur; boşsa varsayılan tests/generated.
        // Kullanıcı elindeki hazır bir test klasörünü de seçip toplu koşabilir.
        let batchDir;
        try {
            batchDir = sanitizeFolderPath(data.folder) || path.join(__dirname, 'tests', 'generated');
        } catch (e) {
            socket.emit('log', `\n❌ Klasör hatası: ${e.message}\n`);
            socket.emit('all_tests_finished');
            return;
        }

        if (!fs.existsSync(batchDir)) {
            socket.emit('log', `\n⚠️ Klasör bulunamadı: ${batchDir}\n`);
            socket.emit('all_tests_finished');
            return;
        }

        // Spec'ler proje içi hazırlık klasörüne kopyalanır (bkz. src/utils/staging.js:
        // harici klasörlerde modül çözümlemesi yanlış node_modules'e gidebilir).
        let staged;
        try {
            staged = stageSpecTree(batchDir);
        } catch (e) {
            socket.emit('log', `\n❌ Testler hazırlanamadı: ${e.message}\n`);
            socket.emit('all_tests_finished');
            return;
        }
        if (staged.count === 0) {
            socket.emit('log', `\n⚠️ Bu klasörde koşulabilir test (.spec.ts / .test.ts) bulunamadı: ${batchDir}\n`);
            socket.emit('all_tests_finished');
            return;
        }

        // ☁️ Grid seçimi: toplu koşum da tekil akış gibi Grid'i destekler. Yapışkan
        // global env yerine çocuk sürece ÖZEL env kurulur (önceki akıştan kalan
        // PW_WS_ENDPOINT değeri toplu koşumu asla etkilemez).
        const gridActive = !!data.useGrid && !!process.env.GRID_WS_ENDPOINT;

        isBatchRunning = true;
        socket.emit('log', `\n==================================================\n`);
        socket.emit('log', `🚀 KLASÖRDEKİ TÜM TESTLER PARALEL ÇALIŞTIRILIYOR\n📂 Klasör: ${batchDir}\n🧪 Bulunan test dosyası: ${staged.count}\n🖥️ Ortam: ${gridActive ? '☁️ Uzak Sunucu (Grid)' : '💻 Lokal Makine'}\n`);
        socket.emit('log', `==================================================\n`);

        if (data.useGrid && !process.env.GRID_WS_ENDPOINT) {
            socket.emit('log', `\n⚠️ "Uzak Sunucuda Çalıştır" seçili ama .env içinde GRID_WS_ENDPOINT tanımlı değil — lokal tarayıcı kullanılacak.\n`);
        }

        cleanReportDirs(__dirname);

        // Hazırlık klasörü PW_TEST_DIR env'i ile config'e iletilir; klasör yolu
        // CLI argümanına hiç girmez (boşluklu yol/kaçışlama derdi yok).
        const envVars = { ...process.env, FORCE_COLOR: '1', PW_TEST_DIR: staged.stagingDir };
        if (gridActive) envVars.PW_WS_ENDPOINT = process.env.GRID_WS_ENDPOINT;
        else delete envVars.PW_WS_ENDPOINT; // önceki tekil akıştan kalan değer temizlenir

        // ⚠️ Kilit her çıkış yolunda TAM BİR KEZ bırakılmalı; 'error' ve 'close'
        // birlikte tetiklenebildiği için tek noktadan yönetiliyor.
        let batchFinished = false;
        const finishBatch = () => {
            if (batchFinished) return;
            batchFinished = true;
            socket.emit('all_tests_finished');
            isBatchRunning = false;
        };

        // npx Windows'ta .cmd'dir ve shell ister; komut satırı spawnNpx'te güvenli kurulur.
        const testProcess = spawnNpx(['playwright', 'test', '--reporter=list,allure-playwright'], {
            env: envVars, cwd: __dirname
        });

        testProcess.on('error', (err) => {
            socket.emit('log', `\n❌ Playwright süreci başlatılamadı: ${err.message}\n`);
            finishBatch();
        });

        testProcess.stdout.on('data', (chunk) => socket.emit('log', chunk.toString()));
        testProcess.stderr.on('data', (chunk) => socket.emit('log', chunk.toString()));

        testProcess.on('close', (code) => {
            if (batchFinished) return;
            socket.emit('log', `\n✅ Paralel Koşum Tamamlandı. (Çıkış Kodu: ${code})\n📊 Allure raporu derleniyor...\n`);

            // ⚠️ DÜZELTME: cwd eklendi. Göreli './allure-results' yolları sunucu farklı
            // bir dizinden başlatıldığında yanlış klasöre bakıyordu.
            const allureProcess = spawnNpx(['allure', 'generate', './allure-results', '-o', './allure-report', '--clean'], {
                cwd: __dirname
            });

            allureProcess.on('error', (err) => {
                socket.emit('log', `\n⚠️ Allure raporu üretilemedi (rapor atlanıyor): ${err.message}\n`);
                finishBatch();
            });

            allureProcess.on('close', (allureCode) => {
                if (allureCode === 0) {
                    socket.emit('log', `\n✅ Rapor hazırlandı.\n`);
                } else {
                    socket.emit('log', `\n⚠️ Allure ${allureCode} koduyla bitti; rapor eksik olabilir.\n`);
                }
                finishBatch();
            });
        });
    });

    socket.on('open_report', () => {
        // Rapor henüz üretilmemişse kullanıcıyı boş bir 404'e göndermek yerine bilgilendir.
        if (!fs.existsSync(path.join(__dirname, 'allure-report', 'index.html'))) {
            socket.emit('log', `\n⚠️ Henüz derlenmiş bir Allure raporu yok. Önce bir test koşumu tamamlayın.\n`);
            return;
        }
        socket.emit('log', `\n📊 Rapor tarayıcıda açılıyor...\n`);
        socket.emit('redirect_to_report');
    });
});

const PORT = process.env.PORT || 3000;
// Güvenli varsayılan: yalnızca bu makineden erişilir. Arayüzü ağdaki başka
// makinelere açmak için .env'de HOST=0.0.0.0 VE APP_TOKEN birlikte verilmelidir.
const HOST = process.env.HOST || '127.0.0.1';
const IS_LOOPBACK_HOST = ['127.0.0.1', 'localhost', '::1'].includes(HOST);

server.listen(PORT, HOST, () => {
    console.log(`\n===========================================`);
    console.log(`🌐 QA MANAGEMENT SERVER AKTİF - PORT: ${PORT}`);
    console.log(`   Adres : http://localhost:${PORT}`);
    console.log(`   Erişim: ${IS_LOOPBACK_HOST ? 'yalnızca bu makine' : 'ağa açık (' + HOST + ')'}`);
    if (AUTH_REQUIRED) {
        console.log(`   Koruma: 🔐 APP_TOKEN AKTİF`);
    } else {
        console.log(`   Koruma: ⚠️ YOK — .env içinde APP_TOKEN tanımlayarak koruma açılır`);
        if (!IS_LOOPBACK_HOST) {
            console.warn(`
⚠️ UYARI: Sunucu AĞA AÇIK ve erişim anahtarı YOK. Aynı ağdaki herkes bu makinede`);
            console.warn(`   tarayıcı açtırıp test koşturabilir. .env dosyasına APP_TOKEN ekleyin.`);
        }
    }
    console.log(`===========================================\n`);

    // ⚠️ DÜZELTME: Ollama erişilebilirlik kontrolü — .env'deki URL geçerli ama
    // servis gerçekte çalışmıyorsa ilk test koşumuna kadar fark edilmiyordu.
    const tagsUrl = deriveOllamaTagsUrl();
    if (tagsUrl) {
        fetch(tagsUrl, { signal: AbortSignal.timeout(5000) })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(d => {
                const count = (d.models || []).length;
                console.log(`✅ Ollama bağlantısı başarılı — ${count} model yüklü.`);
            })
            .catch(e => {
                console.warn(`⚠️ Ollama'ya ulaşılamıyor (${tagsUrl}): ${e.message}`);
                console.warn(`   Ollama çalışıyor mu? "ollama serve" komutunu kontrol edin.`);
            });
    }
});

// Ctrl+C / kill sinyallerinde açık bağlantıları düzgün kapat.
['SIGINT', 'SIGTERM'].forEach(sig => {
    process.on(sig, () => {
        console.log(`\n👋 ${sig} alındı, sunucu kapatılıyor...`);
        io.close();
        server.close(() => process.exit(0));
        // Askıda kalan bağlantılar varsa da süreç sonlansın.
        setTimeout(() => process.exit(0), 5000).unref();
    });
});
