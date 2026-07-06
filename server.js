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
    socket.on('start_test', async (data) => {
        // ⚠️ DÜZELTME: Bir akış çalışırken gelen ikinci istek, stdout hook'u kurulmadan
        // ÖNCE reddedilir (aksi halde hook'lar çakışır, dosyalar ezişir).
        if (isFlowRunning || isBatchRunning) {
            socket.emit('log', `\n⛔ Şu anda başka bir test akışı çalışıyor. Lütfen tamamlanmasını bekleyip tekrar deneyin.\n`);
            socket.emit('test_finished');
            return;
        }
        isFlowRunning = true;

        const { url, prompt, video, screenshot, useGrid } = data;

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
        socket.emit('log', `🖥️ Ortam: ${useGrid ? '☁️ Uzak Sunucu (Selenium Grid)' : '💻 Lokal Makine'}\n`);
        
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
            const { exitCode, featurePath, specPath } = await executeAutonomousFlow(url, prompt, useGrid);

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

    socket.on('run_all_tests', () => {
        if (isFlowRunning || isBatchRunning) {
            socket.emit('log', `\n⛔ Şu anda başka bir test akışı çalışıyor. Lütfen tamamlanmasını bekleyip tekrar deneyin.\n`);
            socket.emit('all_tests_finished');
            return;
        }

        const specsDir = path.join(__dirname, 'tests', 'generated', 'specs');
        if (!fs.existsSync(specsDir) || fs.readdirSync(specsDir).length === 0) {
            socket.emit('log', `\n⚠️ Henüz koşulacak üretilmiş test bulunamadı. Önce en az bir test üretin.\n`);
            socket.emit('all_tests_finished');
            return;
        }

        isBatchRunning = true;
        socket.emit('log', `\n==================================================\n`);
        socket.emit('log', `🚀 TÜM TESTLER PARALEL ÇALIŞTIRILIYOR\n📂 Klasör: tests/generated/specs\n`);
        socket.emit('log', `==================================================\n`);

        // Önceki (tekil veya toplu) koşumdan kalan rapor klasörleri temizlenir; aksi halde
        // Allure raporu eski ve yeni sonuçları karıştırır.
        ['allure-results', 'allure-report', 'playwright-report', 'test-results'].forEach(dir => {
            const dirPath = path.join(__dirname, dir);
            if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
        });

        const envVars = { ...process.env, FORCE_COLOR: '1' };
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

        const testProcess = spawn(npxCmd, ['playwright', 'test', 'tests/generated/specs', '--reporter=list,allure-playwright'], {
            env: envVars, shell: true
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

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`🌐 QA MANAGEMENT SERVER AKTİF - PORT: ${PORT}`);
    console.log(`===========================================\n`);
});