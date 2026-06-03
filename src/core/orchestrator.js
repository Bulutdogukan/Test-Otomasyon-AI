const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { logInfo, logSuccess, logError } = require('../utils/logger');
const { discoverAndSaveDOM } = require('../services/dom.service');
const { agentPlanTest, agentGenerateJSON } = require('../services/ai.service');
const { compilePlaywrightCode } = require('../services/compiler.service');

// Ortam Ayarları ve Yollar
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b"; 
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const PROJECT_ROOT = path.join(__dirname, '../../');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');

// Dosya Yolları
const TEST_FILE = path.join(TESTS_DIR, 'ai_generated.spec.ts');
const FEATURE_FILE = path.join(TESTS_DIR, 'ai_generated.feature');

// Temizlik Fonksiyonu
function cleanPreviousState() {
    const dirsToClean = ['allure-results', 'allure-report', 'playwright-report', 'test-results'];
    dirsToClean.forEach(dir => {
        const dirPath = path.join(PROJECT_ROOT, dir);
        if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    });
    if (fs.existsSync(FEATURE_FILE)) fs.unlinkSync(FEATURE_FILE);
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
}

// Ana Boru Hattı (Pipeline)
async function executeAutonomousFlow(url, userPrompt) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

        // 1. Temizlik
        cleanPreviousState();
        
        // 2. DOM Çekimi (YENİ: server.js ile uyumlu GRID_URL kullanılıyor)
        const gridEndpoint = process.env.GRID_URL || process.env.SELENIUM_GRID_URL;
        const liveDOM = await discoverAndSaveDOM(url, gridEndpoint);
        
        // 3. AI Planlama (Gherkin)
        const testPlan = await agentPlanTest(userPrompt, OLLAMA_MODEL, OLLAMA_URL);
        
        // Gherkin dosyasını fiziksel olarak diske yaz.
        fs.writeFileSync(FEATURE_FILE, testPlan);
        
        // ------------------------------------------------------------------
        // YENİ MİMARİ: Güvenli, Hızlı ve Fallback Destekli Sıralı İşleme
        // ------------------------------------------------------------------
        const scenarioRegex = /(?:Scenario|Senaryo):[\s\S]*?(?=(?:\n\s*(?:Scenario|Senaryo):|$))/gi;
        let scenarios = testPlan.match(scenarioRegex);
        let combinedTests = [];

        if (!scenarios || scenarios.length === 0) scenarios = [testPlan];

        logInfo('🔄 [3.5/5]', `Toplam ${scenarios.length} senaryo bulundu. SIRALI işleme başlıyor...`);

        // JSON ayıklama işlemini kod tekrarını önlemek için metoda aldık
        const processJSONData = (jsonCode, index) => {
            const cleanJson = jsonCode.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanJson);

            if (parsedData.tests && Array.isArray(parsedData.tests)) {
                combinedTests.push(...parsedData.tests);
            } else if (parsedData.steps) {
                combinedTests.push({ title: `Senaryo ${index + 1}`, steps: parsedData.steps });
            } else if (Array.isArray(parsedData)) {
                combinedTests.push({ title: `Senaryo ${index + 1}`, steps: parsedData });
            }
        };

        // Belleği (VRAM) şişirmemek için istekleri sırayla (await) atıyoruz.
        for (let i = 0; i < scenarios.length; i++) {
            logInfo('🧠', `=> İşlenen Senaryo ${i + 1}/${scenarios.length}`);
            const singleScenario = scenarios[i].trim();

            try {
                // 1. DENEME: Ana Model (Örn: 32B veya 7B)
                const jsonCode = await agentGenerateJSON(singleScenario, liveDOM, OLLAMA_MODEL, OLLAMA_URL);
                processJSONData(jsonCode, i);
            } catch (e) {
                logError(`❌ Ana model senaryoyu çözemedi. Yedek modele (14B) geçiliyor... Hata: ${e.message}`);
                
                try {
                    // 2. DENEME: Fallback Mekanizması (Graceful Degradation)
                    const fallbackModel = "qwen2.5-coder:14b"; // Donanımını yormayacak cankurtaran model
                    const jsonCodeFallback = await agentGenerateJSON(singleScenario, liveDOM, fallbackModel, OLLAMA_URL);
                    processJSONData(jsonCodeFallback, i);
                    logSuccess('🛟', `Senaryo ${i + 1} yedek model (${fallbackModel}) ile başarıyla kurtarıldı!`);
                } catch (fallbackErr) {
                    logError(`❌ Yedek model de başarısız oldu. Senaryo ${i + 1} atlanıyor.`);
                }
            }
        }

        if (combinedTests.length === 0) throw new Error("Hiçbir senaryo çözülemedi.");
        const finalJSON = JSON.stringify({ tests: combinedTests });
        
        // 5. Derleme (TS Code)
        compilePlaywrightCode(finalJSON, url, TEST_FILE);

        // 6. Test Koşusu
        logInfo('⚙️ [5/5]', `Playwright Test Runner Başlatılıyor...`);
        return new Promise((resolve, reject) => {
            // Çevre değişkenleri Playwright ve Grid için dinamik olarak besleniyor
            const envVars = { ...process.env, FORCE_COLOR: "1" };
            
            const testProcess = spawn('npx', ['playwright', 'test', 'tests/ai_generated.spec.ts', '--reporter=line,allure-playwright', '--workers=1'], {
                env: envVars
            });

            testProcess.stdout.on('data', (data) => process.stdout.write(data.toString()));
            testProcess.stderr.on('data', (data) => process.stderr.write(data.toString()));

            testProcess.on('close', (code) => {
                logInfo('📊', `Allure raporu derleniyor...`);
                const allureProcess = spawn('npx', ['allure', 'generate', './allure-results', '-o', './allure-report', '--clean']);
                
                allureProcess.on('close', () => {
                    logSuccess('✅', `Rapor hazırlandı. Döngü tamamlandı.`);
                    resolve(code);
                });
            });
        });

    } catch (err) { 
        logError(err.message); 
        throw err; 
    }
}

module.exports = { executeAutonomousFlow };