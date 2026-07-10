const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');

// YENİ MİMARİ BAĞLANTISI (Child Process yerine direkt modül çağrısı)
require('dotenv').config();

// Ortam değişkenleri kontrolü
if (!process.env.OLLAMA_URL || !process.env.OLLAMA_MODEL) {
    console.error('❌ HATA: .env dosyasında OLLAMA_URL ve OLLAMA_MODEL tanımlanması gerekli!');
    process.exit(1);
}

const { executeAutonomousFlow } = require('./src/core/orchestrator');
const { stageSpecTree } = require('./src/utils/staging');

// ⚠️ DÜZELTME: Süreç seviyesinde güvenlik ağı. İşlenmemiş promise reddi veya
// yakalanmamış istisna artık sunucuyu sessizce kilitlemez/çökertmez; loglanır.
process.on('unhandledRejection', (reason) => {
    console.error('\n⚠️ İŞLENMEMİŞ PROMISE REDDİ:', reason instanceof Error ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('\n💥 YAKALANMAMIŞ İSTİSNA:', err && err.stack ? err.stack : err);
});

// ⚠️ DÜZELTME: Eşzamanlılık kilidi. Orchestrator sabit dosya yollarına
// (ai_generated.spec.ts) ve global process.env'e yazdığından, paralel akışlar
// birbirinin durumunu/çıktısını bozardı. Aynı anda tek akışa izin veriyoruz.
let isFlowRunning = false;
// Toplu (paralel) koşum için ayrı kilit — AI üretim akışıyla (isFlowRunning) aynı anda
// çalışırsa dosya/rapor klasörleri çakışabilir, bu yüzden ikisi karşılıklı birbirini engeller.
let isBatchRunning = false;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB üst sınır
    fileFilter: (req, file, cb) => {
        const ok = /\.(txt|feature|md)$/i.test(file.originalname);
        cb(ok ? null : new Error('Sadece .txt, .feature veya .md dosyaları kabul edilir.'), ok);
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/allure', express.static(path.join(__dirname, 'allure-report')));
app.use(express.json());

// Console logları arayüze basmak için process.stdout'u hookluyoruz (Geçici yönlendirme)
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// 🔒 İstemciden gelen klasör yolu doğrulanmadan kullanılmaz.
// Boş/undefined -> null (varsayılan klasör). Geçersizse Error fırlatır.
function sanitizeFolderPath(raw) {
    if (raw == null) return null;
    let clean = String(raw).trim().replace(/^"(.*)"$/, '$1').trim(); // yapıştırılan tırnakları soy
    if (!clean) return null;
    // Windows dosya yollarında zaten geçersiz olan karakterler + satır sonları reddedilir.
    if (/["\r\n<>|*?]/.test(clean)) throw new Error('Klasör yolu geçersiz karakter içeriyor.');
    clean = path.normalize(clean);
    if (!path.isAbsolute(clean)) throw new Error('Klasör yolu tam (absolute) olmalı. Örnek: C:\\QA-Testlerim\\Kampanya');
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

app.post('/upload', (req, res) => {
    // multer'ı manuel çağırıp boyut/tip hatalarını 400 ile düzgün döndürüyoruz (aksi halde 500).
    upload.single('scenarioFile')(req, res, (uploadErr) => {
        if (uploadErr) return res.status(400).json({ error: uploadErr.message });
        if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı.' });
        try {
            const fileContent = fs.readFileSync(req.file.path, 'utf-8');
            fs.unlinkSync(req.file.path);
            res.json({ content: fileContent });
        } catch (err) {
            res.status(500).json({ error: 'Dosya okunamadı: ' + err.message });
        }
    });
});

io.on('connection', (socket) => {
    // 📁 Native klasör seçme diyaloğu (Windows: PowerShell, macOS: osascript).
    socket.on('select_folder', () => {
        if (isPickingFolder) return; // zaten açık bir diyalog var
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
            const data = await res.json();
            const models = (data.models || []).map(m => m.name);
            socket.emit('models_list', { models, current: process.env.OLLAMA_MODEL });
        } catch (e) {
            socket.emit('models_list', { models: [], current: process.env.OLLAMA_MODEL, error: 'Model listesi alınamadı: ' + e.message });
        }
    });

    socket.on('start_test', async (data) => {
        // ⚠️ DÜZELTME: Bir akış çalışırken gelen ikinci istek, stdout hook'u kurulmadan
        // ÖNCE reddedilir (aksi halde hook'lar çakışır, dosyalar ezişir).
        if (isFlowRunning || isBatchRunning) {
            socket.emit('log', `\n⛔ Şu anda başka bir test akışı çalışıyor. Lütfen tamamlanmasını bekleyip tekrar deneyin.\n`);
            socket.emit('test_finished');
            return;
        }

        const { url, prompt, video, screenshot, useGrid, outputDir, model } = data;

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

        // BÜTÜNLEŞTİRİCİ GRID ATAMASI: Hem DOM (orchestrator) hem Playwright (compiler) için
        if (useGrid && process.env.GRID_WS_ENDPOINT) {
            process.env.PW_WS_ENDPOINT = process.env.GRID_WS_ENDPOINT; // Playwright Compiler için
            process.env.GRID_URL = process.env.GRID_WS_ENDPOINT;       // DOM Extractor (orchestrator) için
        } else {
            // Lokal çalışmada kafasının karışmaması için değişkenleri temizliyoruz
            delete process.env.PW_WS_ENDPOINT;
            delete process.env.GRID_URL;
        }
        
        socket.emit('log', `🚀 YENİ TEST BAŞLATILDI\n🌐 Hedef: ${url}`);
        socket.emit('log', `🖥️ Ortam: ${useGrid ? '☁️ Uzak Sunucu (Selenium Grid)' : '💻 Lokal Makine'}`);
        socket.emit('log', `📁 Kayıt Klasörü: ${targetDir || 'tests/generated (varsayılan)'}`);
        socket.emit('log', `🧠 Model: ${selectedModel || process.env.OLLAMA_MODEL + ' (varsayılan)'}\n`);
        
        // Node terminaline yazılan her şeyi arayüze (Socket) basan hook
        process.stdout.write = (chunk, encoding, callback) => {
            socket.emit('log', chunk.toString());
            originalStdoutWrite(chunk, encoding, callback);
        };

        socket.emit('log', `\n==================================================\n`);
        socket.emit('log', `🚀 YENİ TEST BAŞLATILDI (Modüler Mimari)\n🌐 Hedef: ${url}\n`);
        socket.emit('log', `==================================================\n`);

        process.env.TARGET_URL = url;
        process.env.SAVE_VIDEO = video ? 'retain-on-failure' : 'off';
        process.env.SAVE_SCREENSHOT = screenshot ? 'only-on-failure' : 'off';

        try {
            // YENİ MİMARİ: Orchestrator'ı doğrudan çağırıyoruz (Child Process hantallığı bitti)
            const { exitCode, featurePath, specPath } = await executeAutonomousFlow(url, prompt, useGrid, targetDir, selectedModel);

            socket.emit('log', `\n✅ Test Döngüsü Tamamlandı. (Çıkış Kodu: ${exitCode})\n`);

            let tsCode = "// TS Kodu bulunamadı";
            let featureCode = "// Feature dosyası bulunamadı";

            if (fs.existsSync(specPath)) tsCode = fs.readFileSync(specPath, 'utf-8');
            if (fs.existsSync(featurePath)) featureCode = fs.readFileSync(featurePath, 'utf-8');

            socket.emit('test_code', { ts: tsCode, feature: featureCode });
            socket.emit('test_finished');

        } catch (error) {
            socket.emit('log', `\n❌ AKIŞ DURDURULDU: ${error.message}\n`);
            socket.emit('test_finished'); // Hata alsa bile butonu aktif et
        } finally {
            // Hook'u kapat ve eşzamanlılık kilidini serbest bırak
            process.stdout.write = originalStdoutWrite;
            isFlowRunning = false;
        }
    });

    socket.on('run_all_tests', (data = {}) => {
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
        const useGrid = !!data.useGrid && !!process.env.GRID_WS_ENDPOINT;

        isBatchRunning = true;
        socket.emit('log', `\n==================================================\n`);
        socket.emit('log', `🚀 KLASÖRDEKİ TÜM TESTLER PARALEL ÇALIŞTIRILIYOR\n📂 Klasör: ${batchDir}\n🧪 Bulunan test dosyası: ${staged.count}\n🖥️ Ortam: ${useGrid ? '☁️ Uzak Sunucu (Selenium Grid)' : '💻 Lokal Makine'}\n`);
        socket.emit('log', `==================================================\n`);

        // Önceki (tekil veya toplu) koşumdan kalan rapor klasörleri temizlenir; aksi halde
        // Allure raporu eski ve yeni sonuçları karıştırır.
        ['allure-results', 'allure-report', 'playwright-report', 'test-results'].forEach(dir => {
            const dirPath = path.join(__dirname, dir);
            if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
        });

        // Hazırlık klasörü PW_TEST_DIR env'i ile config'e iletilir; klasör yolu
        // CLI argümanına hiç girmez (boşluklu yol/kaçışlama derdi yok).
        const envVars = { ...process.env, FORCE_COLOR: '1', PW_TEST_DIR: staged.stagingDir };
        if (useGrid) envVars.PW_WS_ENDPOINT = process.env.GRID_WS_ENDPOINT;
        else delete envVars.PW_WS_ENDPOINT; // önceki tekil akıştan kalan değer temizlenir
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

        const testProcess = spawn(npxCmd, ['playwright', 'test', '--reporter=list,allure-playwright'], {
            env: envVars, shell: true, cwd: __dirname
        });

        testProcess.on('error', (err) => {
            socket.emit('log', `\n❌ Playwright süreci başlatılamadı: ${err.message}\n`);
            socket.emit('all_tests_finished');
            isBatchRunning = false;
        });

        testProcess.stdout.on('data', (data) => socket.emit('log', data.toString()));
        testProcess.stderr.on('data', (data) => socket.emit('log', data.toString()));

        testProcess.on('close', (code) => {
            socket.emit('log', `\n✅ Paralel Koşum Tamamlandı. (Çıkış Kodu: ${code})\n📊 Allure raporu derleniyor...\n`);

            const allureProcess = spawn(npxCmd, ['allure', 'generate', './allure-results', '-o', './allure-report', '--clean'], { shell: true });

            allureProcess.on('error', (err) => {
                socket.emit('log', `\n⚠️ Allure raporu üretilemedi (rapor atlanıyor): ${err.message}\n`);
                socket.emit('all_tests_finished');
                isBatchRunning = false;
            });

            allureProcess.on('close', (allureCode) => {
                if (allureCode === 0) {
                    socket.emit('log', `\n✅ Rapor hazırlandı.\n`);
                } else {
                    socket.emit('log', `\n⚠️ Allure ${allureCode} koduyla bitti; rapor eksik olabilir.\n`);
                }
                socket.emit('all_tests_finished');
                isBatchRunning = false;
            });
        });
    });

    socket.on('open_report', () => {
        socket.emit('log', `\n📊 Rapor tarayıcıda açılıyor...\n`);
        socket.emit('redirect_to_report'); 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`🌐 QA MANAGEMENT SERVER AKTİF - PORT: ${PORT}`);
    console.log(`===========================================\n`);
});