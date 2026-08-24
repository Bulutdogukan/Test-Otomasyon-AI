const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium, expect } = require('@playwright/test');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');
const { agentPlanTest, agentGetNextStep, agentHealStep } = require('../services/ai.service');
const { compilePlaywrightCode } = require('../services/compiler.service');
const { selectRelevantElements } = require('../services/dom.ranker');
const { stageSpecFile } = require('../utils/staging');
const { escapeRegExp, normalizeAction, normalizeAssertType, validateAssert } = require('../utils/steps');

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
// FAZ 2: LLM'e gönderilecek azami DOM eleman sayısı (token patlaması koruması)
const MAX_DOM_ELEMENTS = parseInt(process.env.MAX_DOM_ELEMENTS, 10) || 60;
// FAZ 3: Self-Healing azami kurtarma turu (her tur: DOM yeniden tara + LLM'den alternatif iste)
const MAX_HEAL_ATTEMPTS = parseInt(process.env.MAX_HEAL_ATTEMPTS, 10) || 2;
// Keşif döngüsünün azami adım sayısı (sonsuz döngü koruması)
const MAX_DISCOVERY_LOOPS = parseInt(process.env.MAX_DISCOVERY_LOOPS, 10) || 15;

const PROJECT_ROOT = path.join(__dirname, '../../');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');

// Kullanıcı klasör seçmediyse üretilen senaryolar varsayılan olarak burada birikir.
// Kullanıcı UI'dan kendi klasörünü seçtiyse (çok kullanıcılı izolasyon) o klasör kullanılır;
// her iki durumda da <kök>/features ve <kök>/specs alt yapısı kurulur.
const DEFAULT_GENERATED_DIR = path.join(TESTS_DIR, 'generated');

function resolveOutputDirs(outputDir) {
    const baseDir = outputDir || DEFAULT_GENERATED_DIR;
    const featuresDir = path.join(baseDir, 'features');
    const specsDir = path.join(baseDir, 'specs');
    [featuresDir, specsDir].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
    return { baseDir, featuresDir, specsDir };
}

// Senaryo başlığından + zaman damgasından benzersiz, okunabilir bir dosya adı üretir.
function slugify(text) {
    const base = String(text || 'senaryo')
        .split('\n')[0]
        .toLowerCase()
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'senaryo';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${timestamp}_${base}`;
}

function cleanPreviousState() {
    const dirsToClean = ['allure-results', 'allure-report', 'playwright-report', 'test-results'];
    dirsToClean.forEach(dir => {
        const dirPath = path.join(PROJECT_ROOT, dir);
        if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
    });
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
                else if (alt) locator = `[alt="${alt}"]`;
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

// FAZ 3: Eylem yürütme tek yere toplandı — ilk deneme ve self-healing retry'ı
// aynı kodu paylaşır (davranış sapması / çift bakım riski ortadan kalkar).
async function executeAction(page, action, locator, value, opts = {}) {
    if (action === 'click') {
        await page.click(locator, { timeout: 10000 });
    } else if (action === 'fill') {
        await page.fill(locator, value, { timeout: 10000 });
    } else if (action === 'press') {
        await page.keyboard.press(value || 'Enter'); // "Control+A" gibi kombinasyonları da destekler
    } else if (action === 'select') {
        await page.selectOption(locator, value, { timeout: 10000 });
    } else if (action === 'hover') {
        await page.hover(locator, { timeout: 10000 });
    } else if (action === 'dragAndDrop') {
        await page.dragAndDrop(locator, opts.target, { timeout: 10000 });
    } else {
        throw new Error(`Bilinmeyen eylem tipi: ${action}`);
    }
}

async function executeAutonomousFlow(url, userPrompt, useGrid = false, outputDir = null, modelOverride = null) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        cleanPreviousState();

        // Kullanıcının seçtiği (veya varsayılan) kayıt klasörü ve AI modeli hazırlanır.
        const { baseDir, featuresDir, specsDir } = resolveOutputDirs(outputDir);
        const activeModel = modelOverride || OLLAMA_MODEL;
        logInfo('📁', `Kayıt Klasörü: ${baseDir}`);
        logInfo('🧠', `Kullanılan Model: ${activeModel}`);

        // 1. Planlama
        const testPlan = await agentPlanTest(userPrompt, activeModel, OLLAMA_URL);
        const slug = slugify(testPlan);
        const featurePath = path.join(featuresDir, `${slug}.feature`);
        const specPath = path.join(specsDir, `${slug}.spec.ts`);
        // ⚠️ DÜZELTME: .feature dosyası ARTIK BURADA YAZILMIYOR.
        // Önceden plan üretilir üretilmez diske yazılıyordu; keşif/derleme yarıda
        // kalırsa (hata, timeout, self-healing tükenmesi) kalıcı kütüphanede
        // karşılığı olmayan "yetim" .feature dosyaları birikiyordu. Artık ikili
        // (feature + spec) yalnızca keşif gerçekten adım ürettiğinde BİRLİKTE yazılır.

        // 2. KEŞİF (EXPLORATION) AŞAMASI
        let browser;
        const gridEndpoint = process.env.GRID_WS_ENDPOINT;
        const stepHistory = [];

        // ⚠️ DÜZELTME: Tüm keşif fazı try/finally ile sarıldı. AI timeout'u veya
        // beklenmedik bir hata olsa bile tarayıcı/grid bağlantısı GARANTİ kapatılır.
        try {
        if (useGrid && gridEndpoint) {
            logInfo('☁️', `Selenium Grid'e bağlanılıyor... Adres: ${gridEndpoint}`);
            browser = await chromium.connect({ wsEndpoint: gridEndpoint });
        } else {
            // Keşif normalde GÖRÜNÜR tarayıcıda koşar (kullanıcı ne olduğunu izleyebilsin).
            // Ekransız ortamlarda (SSH ile bağlanılan Mac Mini, CI, Docker) görünür mod
            // hiç açılamaz; bu yüzden .env'deki HEADLESS=true ile kapatılabilir.
            const headless = String(process.env.HEADLESS || '').toLowerCase() === 'true';
            logInfo('🕵️', `Lokal AI Keşif Modu Başlatılıyor... (${headless ? 'headless' : 'görünür tarayıcı'})`);
            browser = await chromium.launch({ headless, args: ['--start-maximized'] });
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
                // ⚠️ DÜZELTME: Timeout olsa bile yeni sekmeye geçiyoruz; aksi halde
                // ajan açılmamış sayfada işlem yapmaya devam eder.
                logError(`Yeni sekme yüklenirken süre aşımı oluştu — yine de yeni sekmeye geçiliyor.`);
                activePage = newPage;
            }
        });

        await activePage.goto(url, { waitUntil: 'domcontentloaded' });

        let isDone = false;
        let loopCount = 0;
        const maxLoops = MAX_DISCOVERY_LOOPS;
        let lastActionKey = null;
        let repeatCount = 0;
        // Model üst üste anlamsız eylem adı üretirse döngü boşa dönmesin.
        let invalidActionCount = 0;

        while (!isDone && loopCount < maxLoops) {
            logInfo('🔍', `[Adım ${loopCount + 1}] Canlı Ekran DOM Haritası Çıkarılıyor...`);
            // Her döngüde activePage taranıyor (Sekme değiştiyse yeni sekme taranır!)
            const domMap = await scanLivePage(activePage);
            // FAZ 2: Token patlamasını önlemek için DOM, hedefe göre en alakalı
            // MAX_DOM_ELEMENTS elemana indirgenir. Tam domMap ters-arama için saklanır.
            const rankedMap = selectRelevantElements(domMap, testPlan, stepHistory, MAX_DOM_ELEMENTS);
            const totalEls = Object.keys(domMap).length;
            if (totalEls > MAX_DOM_ELEMENTS) {
                logInfo('✂️', `DOM kırpıldı: ${totalEls} elemandan en alakalı ${MAX_DOM_ELEMENTS} tanesi LLM'e gönderiliyor.`);
            }
            const domData = JSON.stringify(rankedMap, null, 2);

            logInfo('🧠', `Agent 2 (Locator) hedefe ulaşmak için Düşünüyor...`);
            const nextStep = await agentGetNextStep(testPlan, domData, stepHistory, activeModel, OLLAMA_URL);
            
            // ⚠️ DÜZELTME: Eylem adı artık tek noktadan normalize ediliyor.
            // Önceden "Click"/"CLICK"/"drag_and_drop" gibi biçimler tanınmıyor,
            // doğrudan "Bilinmeyen eylem tipi" hatasına düşüyordu.
            const action = normalizeAction(nextStep.action);

            if (action === 'DONE') {
                logSuccess('✅', 'AI: Senaryo hedefine ulaşıldı!');
                break;
            }

            if (!action) {
                invalidActionCount++;
                logWarning(`Model tanınmayan bir eylem üretti: ${JSON.stringify(nextStep.action)}. Atlanıyor.`);
                if (invalidActionCount >= 3) {
                    logError('Model üst üste geçerli bir eylem üretemedi. Keşif durduruluyor.');
                    break;
                }
                loopCount++;
                continue;
            }
            invalidActionCount = 0;

            // Otonom Çevirici: AI Label verirse CSS'e çevirir
            let safeLocator = domMap[nextStep.locator] ? domMap[nextStep.locator] : nextStep.locator;
            // FAZ 3.2: dragAndDrop hedef locator'ı da label->CSS çevrilir.
            let safeTarget = nextStep.target ? (domMap[nextStep.target] || nextStep.target) : undefined;
            logInfo('🎯', `Eylem Uygulanıyor: [${action.toUpperCase()}] -> ${safeLocator}`);

            // İlerleme kontrolü: aynı (aksiyon+locator) art arda tekrar ediyorsa
            // sayfa hiç değişmiyor demektir — tüm adım bütçesini harcamadan hemen dur.
            const actionKey = `${action}:${safeLocator}`;
            if (actionKey === lastActionKey) {
                repeatCount++;
                // Aynı assert'in tekrarı = model DONE diyemiyor ama hedef doğrulandı.
                // 2. kez YÜRÜTMEDEN başarıyla bitir (gereksiz LLM turu + çift assert önlenir).
                if (action === 'assert') {
                    logSuccess('✅', 'Doğrulama zaten yapıldı; hedefe ulaşıldı kabul ediliyor (DONE).');
                    break;
                }
                if (repeatCount >= 2) {
                    logError(`Aynı eylem (${actionKey}) art arda ilerleme sağlamadan tekrarlandı. Keşif durduruluyor.`);
                    break;
                }
            } else {
                repeatCount = 0;
                lastActionKey = actionKey;
            }

            // ⚡ FAZ 2: ASSERTION (Doğrulama) — locator hatasından farklı ele alınır.
            // Canlı doğrulanır; sonuç ne olursa olsun teste kaydedilir (gerçek bir hata ise
            // derlenen testin de patlaması GEREKİR). Başarısız assert döngüyü kırmaz.
            if (action === 'assert') {
                const assertType = normalizeAssertType(nextStep.assertType);
                const expected = nextStep.expected != null ? nextStep.expected : (nextStep.value || '');

                // ⚠️ DÜZELTME: Beklenen değeri boş gelen url/text doğrulaması SESSİZ
                // YANLIŞ-POZİTİFTİR (new RegExp('') her URL'yi, toContainText('') her
                // metni eşler). Böyle bir "doğrulama" teste hiç yazılmamalı.
                const assertProblem = validateAssert(assertType, expected, safeLocator);
                if (assertProblem) {
                    logWarning(`Doğrulama ATLANDI — ${assertProblem}. Teste yazılmayacak (yanlış-pozitif önlendi).`);
                    loopCount++;
                    continue;
                }

                try {
                    if (assertType === 'url') {
                        await expect(activePage).toHaveURL(new RegExp(escapeRegExp(expected)), { timeout: 8000 });
                    } else if (assertType === 'text') {
                        await expect(activePage.locator(safeLocator).first()).toContainText(expected, { timeout: 8000 });
                    } else if (assertType === 'value') {
                        await expect(activePage.locator(safeLocator).first()).toHaveValue(expected, { timeout: 8000 });
                    } else {
                        await expect(activePage.locator(safeLocator).first()).toBeVisible({ timeout: 8000 });
                    }
                    logSuccess('✔️', `Doğrulama BAŞARILI: [${assertType}] ${expected || safeLocator}`);
                } catch (assertErr) {
                    logWarning(`Doğrulama BAŞARISIZ (yine de teste kaydediliyor): [${assertType}] ${expected || safeLocator}`);
                }
                stepHistory.push({ action: 'assert', locator: safeLocator, assertType, expected });
                loopCount++;
                await activePage.waitForTimeout(1000);
                continue;
            }

            // FAZ 3: Değer çözümleme (RANDOM_EMAIL -> benzersiz e-posta) tek yerde.
            let resolvedValue = nextStep.value;
            if (action === 'fill' && nextStep.value === 'RANDOM_EMAIL') {
                resolvedValue = `test_${Date.now()}@mail.com`;
            }
            nextStep.value = resolvedValue;

            // dragAndDrop hedefsiz gelirse Playwright çağrısı anlamsız bir hata verir;
            // niyeti baştan reddedip self-healing turunu boşa harcamıyoruz.
            if (action === 'dragAndDrop' && !safeTarget) {
                logWarning('dragAndDrop için "target" verilmedi, adım atlanıyor.');
                loopCount++;
                continue;
            }

            try {
                await executeAction(activePage, action, safeLocator, resolvedValue, { target: safeTarget });
            } catch (err) {
                // ⚡ FAZ 3: GERÇEK SELF-HEALING (sabit text-fallback yerine adaptif kurtarma).
                // DOM YENİDEN taranır, LLM'den aynı niyete uyan alternatif locator istenir,
                // eylem tekrar denenir. Sınırlı tur; tümü başarısızsa keşif durur.
                const reason = (err.message || 'bilinmeyen hata').split('\n')[0].slice(0, 200);
                logWarning(`Eylem başarısız: ${reason}`);
                logInfo('🩹', `Self-Healing devrede...`);

                let healed = false;
                const triedLocators = new Set([safeLocator]);
                for (let healAttempt = 1; healAttempt <= MAX_HEAL_ATTEMPTS && !healed; healAttempt++) {
                    try {
                        const freshMap = await scanLivePage(activePage);
                        const freshRanked = selectRelevantElements(freshMap, testPlan, stepHistory, MAX_DOM_ELEMENTS);
                        const healedStep = await agentHealStep(
                            testPlan,
                            { action, locator: safeLocator, value: resolvedValue },
                            reason,
                            JSON.stringify(freshRanked, null, 2),
                            activeModel, OLLAMA_URL
                        );

                        // GIVEUP / DONE de aynı normalizasyondan geçer ("Give up", "vazgeç" ...).
                        const healedAction = healedStep ? normalizeAction(healedStep.action) : null;
                        if (!healedStep || healedAction === 'GIVEUP' || healedAction === 'DONE') {
                            logWarning(`Self-Healing: bu ekranda uygun alternatif bulunamadı.`);
                            break;
                        }

                        const healedLocator = freshMap[healedStep.locator] ? freshMap[healedStep.locator] : healedStep.locator;

                        // Aynı kırık locator tekrar önerildiyse denemeden geç (döngüde takılmayı önler).
                        if (triedLocators.has(healedLocator)) {
                            logWarning(`Self-Healing: aynı locator (${healedLocator}) tekrar önerildi, atlanıyor.`);
                            continue;
                        }
                        triedLocators.add(healedLocator);
                        const healedValue = healedStep.value != null ? healedStep.value : resolvedValue;
                        const healedTarget = (healedStep.target != null) ? (freshMap[healedStep.target] || healedStep.target) : safeTarget;
                        logInfo('🩹', `Self-Healing denemesi ${healAttempt}: yeni locator -> ${healedLocator}`);

                        await executeAction(activePage, action, healedLocator, healedValue, { target: healedTarget });

                        // Başarılı: ÇALIŞAN locator/değer kaydedilir (derlenen test doğru olanı alır).
                        safeLocator = healedLocator;
                        nextStep.value = healedValue;
                        safeTarget = healedTarget;
                        healed = true;
                        logSuccess('✅', `Self-Healing BAŞARILI! Adım kurtarıldı.`);
                    } catch (healErr) {
                        logWarning(`Self-Healing denemesi ${healAttempt} başarısız: ${(healErr.message || '').split('\n')[0].slice(0, 150)}`);
                    }
                }

                if (!healed) {
                    logError('Adım self-healing ile de yürütülemedi. Keşif durduruluyor.');
                    break;
                }
            }

            stepHistory.push({ action, locator: safeLocator, value: nextStep.value, target: safeTarget });
            loopCount++;
            
            // Sayfanın kendine gelmesi ve yeni elementlerin oturması için bekleme süresi
            await activePage.waitForTimeout(3000); 
        }

        } finally {
            // ⚠️ DÜZELTME: Hata/timeout/break — hangi yolla çıkılırsa çıkılsın tarayıcı kapatılır.
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) {
                    logWarning(`Tarayıcı kapatılırken hata oluştu (yok sayılıyor): ${closeErr.message}`);
                }
            }
        }

        // 3. DERLEME (COMPILATION) AŞAMASI
        // ⚠️ DÜZELTME: Keşif hiç adım üretemediyse kalıcı kütüphaneye HİÇBİR ŞEY
        // yazılmaz. Aksi halde sadece page.goto() içeren, hiçbir şey doğrulamayan
        // "boş" bir spec (ve eşi olmayan bir .feature) git ile iki makineye yayılırdı.
        if (stepHistory.length === 0) {
            throw new Error('Keşif hiçbir uygulanabilir adım üretemedi; kalıcı test kütüphanesine kayıt yapılmadı. ' +
                'Hedef URL, senaryo metni ve Ollama modelini kontrol edip tekrar deneyin.');
        }

        logInfo('🧹', `Keşif tamamlandı (${stepHistory.length} adım). Kalıcı test senaryosu derleniyor...`);
        // Feature ve spec BİRLİKTE yazılır: kütüphanede daima eşleşen ikili bulunur.
        fs.writeFileSync(featurePath, testPlan);
        compilePlaywrightCode(stepHistory, url, testPlan, specPath);
        logSuccess('📚', `Kalıcı kütüphaneye eklendi: ${path.basename(specPath)}`);

        // 4. TEST KOŞUSU VE RAPORLAMA
        logInfo('⚙️', `Playwright Statik Test Runner Başlatılıyor...`);
        // Seçilen klasör proje DIŞINDA olabilir: spec, proje içindeki hazırlık
        // klasörüne kopyalanıp oradan koşulur (bkz. src/utils/staging.js — modül
        // çözümlemesi her zaman projenin node_modules'üne gider). Klasör yolu
        // PW_TEST_DIR env'i ile config'e iletilir; CLI'ya yol hiç girmez.
        const stagingDir = stageSpecFile(specPath);
        const specFileName = path.basename(specPath);
        return new Promise((resolve, reject) => {
            const envVars = { ...process.env, FORCE_COLOR: "1", PW_TEST_DIR: stagingDir };
            const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

            const testProcess = spawn(npxCmd, ['playwright', 'test', specFileName, '--reporter=list,allure-playwright', '--workers=1'], {
                env: envVars, shell: true, cwd: PROJECT_ROOT
            });

            // ⚠️ DÜZELTME: spawn 'error' olayı (örn. npx PATH'te yok, izin hatası) artık
            // sessizce askıda kalmaz; Promise reject edilip akış temiz şekilde sonlanır.
            testProcess.on('error', (err) => {
                logError(`Playwright süreci başlatılamadı: ${err.message}`);
                reject(new Error(`Playwright süreci başlatılamadı: ${err.message}`));
            });

            testProcess.stdout.on('data', (data) => process.stdout.write(data.toString()));
            testProcess.stderr.on('data', (data) => process.stderr.write(data.toString()));

            testProcess.on('close', (code) => {
                logInfo('📊', `Allure raporu derleniyor...`);
                // ⚠️ DÜZELTME: cwd eklendi — göreli './allure-results' yolu, süreç
                // farklı bir çalışma dizininden başlatıldığında yanlış klasöre bakıyordu.
                const allureProcess = spawn(npxCmd, ['allure', 'generate', './allure-results', '-o', './allure-report', '--clean'], {
                    shell: true, cwd: PROJECT_ROOT
                });

                // ⚠️ DÜZELTME: Allure başlatılamazsa AKIŞ ÇÖKMEZ; testin gerçek sonucu
                // raporlama hatasıyla maskelenmemeli, test exit kodu yine de döndürülür.
                allureProcess.on('error', (err) => {
                    logWarning(`Allure raporu üretilemedi (rapor atlanıyor): ${err.message}`);
                    resolve({ exitCode: code, featurePath, specPath });
                });

                allureProcess.on('close', (allureCode) => {
                    if (allureCode === 0) {
                        logSuccess('✅', `Rapor hazırlandı. Boru Hattı (Pipeline) tamamlandı.`);
                    } else {
                        logWarning(`Allure ${allureCode} koduyla bitti; rapor eksik olabilir ama akış tamamlandı.`);
                    }
                    resolve({ exitCode: code, featurePath, specPath });
                });
            });
        });

    } catch (err) { 
        logError(err.message); 
        throw err; 
    }
}

module.exports = { executeAutonomousFlow };