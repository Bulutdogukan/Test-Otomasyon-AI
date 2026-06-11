const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');
const { agentPlanTest, agentGetNextStep } = require('../services/ai.service');
const { compilePlaywrightCode } = require('../services/compiler.service');

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b"; 
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
const PROJECT_ROOT = path.join(__dirname, '../../');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');

const TEST_FILE = path.join(TESTS_DIR, 'ai_generated.spec.ts');
const FEATURE_FILE = path.join(TESTS_DIR, 'ai_generated.feature');

function cleanPreviousState() {
    const dirsToClean = ['allure-results', 'allure-report', 'playwright-report', 'test-results'];
    dirsToClean.forEach(dir => {
        const dirPath = path.join(PROJECT_ROOT, dir);
        if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    });
    if (fs.existsSync(FEATURE_FILE)) fs.unlinkSync(FEATURE_FILE);
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
}

// Canlı sayfadan DOM çıkartan sistem fonksiyonu
async function scanLivePage(page) {
    return await page.evaluate(() => {
        const selectors = 'input, button, a, select, textarea, [role="button"], [role="link"], [onclick], [data-test], [data-testid], [data-qa], [aria-label], [placeholder], [title]';
        const elements = Array.from(document.querySelectorAll(selectors));
        const kvMap = {};

        elements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const isAd = el.closest('[id*="ad"], [class*="ad-"], [class*="sponsored"], [class*="promo"], [class*="reklam"]');
            if (rect.width > 5 && rect.height > 5 && el.offsetParent !== null && !isAd) {
                const tag = el.tagName.toLowerCase();
                const role = el.getAttribute('role') || '';
                const text = (el.innerText || '').trim().replace(/\n/g, ' ').slice(0, 60);
                const ariaLabel = el.getAttribute('aria-label') || '';
                const title = el.getAttribute('title') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const alt = el.getAttribute('alt') || '';
                const name = el.getAttribute('name') || '';
                const id = el.id || '';
                const href = el.getAttribute('href') || '';

                let locator = '';
                if (id) locator = `#${id}`;
                else if (name) locator = `[name="${name}"]`;
                else if (placeholder) locator = `[placeholder="${placeholder}"]`;
                else if (ariaLabel) locator = `[aria-label="${ariaLabel}"]`;
                else if (title) locator = `[title="${title}"]`;
                else if (tag === 'a' && href) locator = `a[href="${href}"]`;
                else if (text) locator = `text="${text}"`;
                else locator = `:nth-match(${tag}, ${index + 1})`;

                let label = '';
                if (tag === 'input' || tag === 'textarea') label = `[Giriş Kutusu] ${placeholder || ariaLabel || title || name || id || 'Alan'}`;
                else if (tag === 'button' || role === 'button') label = `[Buton] ${text || ariaLabel || title || id || name}`;
                else if (tag === 'a' || role === 'link') label = `[Link] ${text || ariaLabel || title || href}`;
                else label = `[Element] ${title || ariaLabel || placeholder || text || alt || id || name}`;

                label = label.slice(0, 80).replace(/\n/g, ' ').trim();
                if (locator && !kvMap[label]) kvMap[label] = locator;
            }
        });
        return kvMap;
    });
}

async function executeAutonomousFlow(url, userPrompt, useGrid = false) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        cleanPreviousState();
        
        // 1. Planlama
        const testPlan = await agentPlanTest(userPrompt, OLLAMA_MODEL, OLLAMA_URL);
        fs.writeFileSync(FEATURE_FILE, testPlan);

        // 2. KEŞİF (EXPLORATION) AŞAMASI
        let browser;
        const gridEndpoint = process.env.GRID_WS_ENDPOINT;

        if (useGrid && gridEndpoint) {
            logInfo('☁️', `Selenium Grid'e bağlanılıyor... Adres: ${gridEndpoint}`);
            browser = await chromium.connect({ wsEndpoint: gridEndpoint });
        } else {
            logInfo('🕵️', `Lokal AI Keşif Modu Başlatılıyor... Tarayıcı bağlanıyor.`);
            browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
        }
        
        const context = await browser.newContext({ viewport: null });
        // ⚠️ YENİ: Dinamik Aktif Sekme Yönetimi
        let activePage = await context.newPage();
        
        context.on('page', async newPage => {
            logWarning(`✨ Yeni bir sekme/pencere açıldı! Ajanın odak noktası yeni sekmeye kaydırılıyor.`);
            try {
                await newPage.waitForLoadState('domcontentloaded', { timeout: 10000 });
                activePage = newPage; // Otonom şef artık yeni sayfayı yönetecek
            } catch(e) {
                logError(`Yeni sekme yüklenirken süre aşımı oluştu.`);
            }
        });

        await activePage.goto(url, { waitUntil: 'domcontentloaded' });

        let isDone = false;
        let loopCount = 0;
        const maxLoops = 15;
        const stepHistory = [];

        while (!isDone && loopCount < maxLoops) {
            logInfo('🔍', `[Adım ${loopCount + 1}] Canlı Ekran DOM Haritası Çıkarılıyor...`);
            // Her döngüde activePage taranıyor (Sekme değiştiyse yeni sekme taranır!)
            const domMap = await scanLivePage(activePage);
            const domData = JSON.stringify(domMap, null, 2);

            logInfo('🧠', `Agent 2 (Locator) hedefe ulaşmak için Düşünüyor...`);
            const nextStep = await agentGetNextStep(testPlan, domData, stepHistory, OLLAMA_MODEL, OLLAMA_URL);
            
            if (nextStep.action === 'DONE' || nextStep.action === 'done' || nextStep.action === 'BİTTİ') {
                logSuccess('✅', 'AI: Senaryo hedefine ulaşıldı!');
                break;
            }

            // Otonom Çevirici: AI Label verirse CSS'e çevirir
            let safeLocator = domMap[nextStep.locator] ? domMap[nextStep.locator] : nextStep.locator;
            logInfo('🎯', `Eylem Uygulanıyor: [${nextStep.action.toUpperCase()}] -> ${safeLocator}`);

            try {
                if (nextStep.action === 'click') {
                    await activePage.click(safeLocator, { timeout: 10000 });
                } else if (nextStep.action === 'fill') {
                    let val = nextStep.value === 'RANDOM_EMAIL' ? `test_${Date.now()}@mail.com` : nextStep.value;
                    await activePage.fill(safeLocator, val, { timeout: 10000 });
                    nextStep.value = val; 
                } else if (nextStep.action === 'press') {
                    await activePage.keyboard.press(nextStep.value || 'Enter');
                } else if (nextStep.action === 'select') {
                    await activePage.selectOption(safeLocator, nextStep.value, { timeout: 10000 });
                }
            } catch (err) {
                logWarning(`Elemente doğrudan müdahale edilemedi. Alternatif metin araması deneniyor...`);
                try {
                    if (nextStep.action === 'click') await activePage.click(`text="${safeLocator}"`, { timeout: 5000 });
                } catch (fallbackErr) {
                    logError('Adım yürütülemedi. Keşif durduruluyor.');
                    break; 
                }
            }

            stepHistory.push({ action: nextStep.action, locator: safeLocator, value: nextStep.value });
            loopCount++;
            
            // Sayfanın kendine gelmesi ve yeni elementlerin oturması için bekleme süresi
            await activePage.waitForTimeout(3000); 
        }

        await browser.close();

        // 3. DERLEME (COMPILATION) AŞAMASI
        logInfo('🧹', 'Keşif tamamlandı. Hızlı ve Kalıcı Test Senaryosu derleniyor...');
        compilePlaywrightCode(stepHistory, url, testPlan, TEST_FILE);

        // 4. TEST KOŞUSU VE RAPORLAMA
        logInfo('⚙️', `Playwright Statik Test Runner Başlatılıyor...`);
        return new Promise((resolve, reject) => {
            const envVars = { ...process.env, FORCE_COLOR: "1" };
            const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            
            const testProcess = spawn(npxCmd, ['playwright', 'test', 'tests/ai_generated.spec.ts', '--reporter=list,allure-playwright', '--workers=1'], {
                env: envVars, shell: true 
            });

            testProcess.stdout.on('data', (data) => process.stdout.write(data.toString()));
            testProcess.stderr.on('data', (data) => process.stderr.write(data.toString()));

            testProcess.on('close', (code) => {
                logInfo('📊', `Allure raporu derleniyor...`);
                const allureProcess = spawn(npxCmd, ['allure', 'generate', './allure-results', '-o', './allure-report', '--clean'], { shell: true });
                allureProcess.on('close', () => {
                    logSuccess('✅', `Rapor hazırlandı. Boru Hattı (Pipeline) tamamlandı.`);
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