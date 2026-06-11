const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// YENİ MİMARİ BAĞLANTISI (Child Process yerine direkt modül çağrısı)
require('dotenv').config();

// Ortam değişkenleri kontrolü
if (!process.env.OLLAMA_URL || !process.env.OLLAMA_MODEL) {
    console.error('❌ HATA: .env dosyasında OLLAMA_URL ve OLLAMA_MODEL tanımlanması gerekli!');
    process.exit(1);
}

const { executeAutonomousFlow } = require('./src/core/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ dest: 'uploads/' });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/allure', express.static(path.join(__dirname, 'allure-report')));
app.use(express.json());

// Console logları arayüze basmak için process.stdout'u hookluyoruz (Geçici yönlendirme)
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

app.post('/upload', upload.single('scenarioFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı.' });
    try {
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        fs.unlinkSync(req.file.path); 
        res.json({ content: fileContent });
    } catch (err) {
        res.status(500).json({ error: 'Dosya okunamadı: ' + err.message });
    }
});

io.on('connection', (socket) => {
    socket.on('start_test', async (data) => {
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
            const exitCode = await executeAutonomousFlow(url, prompt, useGrid);
            
            socket.emit('log', `\n✅ Test Döngüsü Tamamlandı. (Çıkış Kodu: ${exitCode})\n`);
            
            const testFilePath = path.join(__dirname, 'tests', 'ai_generated.spec.ts');
            const featureFilePath = path.join(__dirname, 'tests', 'ai_generated.feature');
            
            let tsCode = "// TS Kodu bulunamadı";
            let featureCode = "// Feature dosyası bulunamadı";

            if (fs.existsSync(testFilePath)) tsCode = fs.readFileSync(testFilePath, 'utf-8');
            if (fs.existsSync(featureFilePath)) featureCode = fs.readFileSync(featureFilePath, 'utf-8');

            socket.emit('test_code', { ts: tsCode, feature: featureCode }); 
            socket.emit('test_finished');

        } catch (error) {
            socket.emit('log', `\n❌ AKIŞ DURDURULDU: ${error.message}\n`);
            socket.emit('test_finished'); // Hata alsa bile butonu aktif et
        } finally {
            // Hook'u kapat
            process.stdout.write = originalStdoutWrite;
        }
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