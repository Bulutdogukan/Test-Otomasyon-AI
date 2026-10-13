const fs = require('fs');
const path = require('path');
const { chromium, expect } = require('@playwright/test');
const { logInfo, logSuccess, logError, logWarning } = require('../utils/logger');
const { agentPlanTest, agentGetNextStep, agentHealStep } = require('../services/ai.service');
const { compilePlaywrightCode } = require('../services/compiler.service');
const { selectRelevantElements } = require('../services/dom.ranker');
const { scanLivePage } = require('../services/dom.scanner');
const { stageSpecFile } = require('../utils/staging');
const { spawnNpx } = require('../utils/npx');
const { cleanReportDirs } = require('../utils/reportDirs');
const { resolveLocator } = require('../utils/locator');
const { escapeRegExp, normalizeAction, normalizeAssertType, validateAssert } = require('../utils/steps');
const { toStoredValue, resolveSecretValue, secretNameFromPlaceholder, redactSecrets } = require('../utils/secrets');

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/chat";
// FAZ 2: LLM'e gönderilecek azami DOM eleman sayısı (token patlaması koruması)
const MAX_DOM_ELEMENTS = parseInt(process.env.MAX_DOM_ELEMENTS, 10) || 60;
// FAZ 3: Self-Healing azami kurtarma turu (her tur: DOM yeniden tara + LLM'den alternatif iste)
const MAX_HEAL_ATTEMPTS = parseInt(process.env.MAX_HEAL_ATTEMPTS, 10) || 2;
// Keşif döngüsünün azami adım sayısı (sonsuz döngü koruması)
const MAX_DISCOVERY_LOOPS = parseInt(process.env.MAX_DISCOVERY_LOOPS, 10) || 25;
// Her eylemden sonra sayfanın ağ trafiğinin durulması için beklenecek azami süre.
const STEP_SETTLE_MS = parseInt(process.env.STEP_SETTLE_MS, 10) || 3000;
// Tek bir tıklama/doldurma işleminin azami süresi.
const ACTION_TIMEOUT_MS = parseInt(process.env.ACTION_TIMEOUT_MS, 10) || 10000;

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

// SSO / MFA / OTP gibi otomatikleştirilemeyen girişler için: kullanıcı bir kez
// elle giriş yapıp oturumu kaydeder (npx playwright codegen --save-storage=...),
// keşif ve derlenen testler bu oturumla başlar. playwright.config.ts de aynı
// değişkeni okur.
function resolveStorageState() {
    const raw = (process.env.STORAGE_STATE || '').trim();
    if (!raw) return undefined;
    const abs = path.resolve(PROJECT_ROOT, raw);
    if (!fs.existsSync(abs)) {
        throw new Error(`STORAGE_STATE dosyası bulunamadı: ${abs}. ` +
            `Oturumu kaydetmek için: npx playwright codegen --save-storage=${raw} <giriş-adresi>`);
    }
    return abs;
}

// Eylem sonrası bekleme: sabit 3 sn yerine sayfa durulunca devam edilir.
// Kısa taban bekleme, sayfa yenilemesi olmayan (SPA) geçişlerde arayüzün
// güncellenmesine fırsat verir.
async function settle(page) {
    try { await page.waitForLoadState('domcontentloaded', { timeout: ACTION_TIMEOUT_MS }); } catch { /* yine de devam */ }
    await page.waitForTimeout(500);
    try { await page.waitForLoadState('networkidle', { timeout: STEP_SETTLE_MS }); } catch { /* sürekli açık bağlantılı sayfalar */ }
}

// FAZ 3: Eylem yürütme tek yere toplandı — ilk deneme ve self-healing retry'ı
// aynı kodu paylaşır (davranış sapması / çift bakım riski ortadan kalkar).
// Locator'lar iframe zinciri taşıyabilir; resolveLocator bunu çözer.
async function executeAction(page, action, locator, value, opts = {}) {
    const timeout = ACTION_TIMEOUT_MS;
    if (action === 'click') {
        await resolveLocator(page, locator).first().click({ timeout });
    } else if (action === 'fill') {
        await resolveLocator(page, locator).first().fill(value == null ? '' : String(value), { timeout });
    } else if (action === 'press') {
        await page.keyboard.press(value || 'Enter'); // "Control+A" gibi kombinasyonları da destekler
    } else if (action === 'select') {
        await resolveLocator(page, locator).first().selectOption(String(value == null ? '' : value), { timeout });
    } else if (action === 'hover') {
        await resolveLocator(page, locator).first().hover({ timeout });
    } else if (action === 'dragAndDrop') {
        await resolveLocator(page, locator).first().dragTo(resolveLocator(page, opts.target).first(), { timeout });
    } else {
        throw new Error(`Bilinmeyen eylem tipi: ${action}`);
    }
}

// LLM'in önerdiği değer -> (geçmişe kaydedilecek değer, tarayıcıya yazılacak değer).
// Gizli değerler geçmişte yer tutucu olarak kalır, yalnızca tarayıcıya çözülerek yazılır.
// RANDOM_EMAIL derlenen testte her koşumda yeniden üretilir (kayıt testleri 2. koşumda
// "bu e-posta zaten kayıtlı" hatası vermesin).
function prepareValue(action, rawValue) {
    const stored = toStoredValue(rawValue);
    if (action === 'fill' && stored === 'RANDOM_EMAIL') {
        return { stored, exec: `test_${Date.now()}@mail.com` };
    }
    return { stored, exec: resolveSecretValue(stored) };
}

// Senaryoda tırnak içinde yazılmış metinler ('Hoş geldiniz, ali' / "Sipariş alındı")
// kullanıcının AÇIK beklentileridir. Model ekranda gördüğünü doğrulayıp bitirmeye
// eğilimlidir; bu beklentiler bir doğrulamada (veya girdi değeri olarak) geçmeden
// senaryo bitmiş sayılmaz.
function extractQuotedExpectations(text) {
    const out = new Set();
    // Tek tırnak yalnızca kelime dışında açılıp kapanıyorsa tırnaktır: Türkçe ek
    // kesmeleri ("Ali'nin", "Ankara'dan") beklenti sanılmaz.
    const re = /(?<![\p{L}\p{N}])'([^'\n]{2,120})'(?![\p{L}\p{N}])|"([^"\n]{2,120})"|“([^”\n]{2,120})”|‘([^’\n]{2,120})’/gu;
    let m;
    while ((m = re.exec(String(text || ''))) !== null) {
        const v = (m[1] || m[2] || m[3] || m[4]).trim();
        if (v.length >= 2) out.add(v);
    }
    return [...out];
}

function missingExpectations(expectations, stepHistory) {
    const norm = v => String(v == null ? '' : v).trim().toLocaleLowerCase('tr');
    const inputs = stepHistory.filter(s => s.action !== 'assert').map(s => norm(s.value));
    const asserted = stepHistory.filter(s => s.action === 'assert').map(s => norm(s.expected)).filter(a => a.length > 2);
    return expectations.filter(q => {
        const n = norm(q);
        return !inputs.includes(n) && !asserted.some(a => a.includes(n) || n.includes(a));
    });
}

function describeStep(s) {
    if (s.action === 'assert') return `assert(${s.assertType}) ${s.expected || s.locator}`;
    return `${s.action} ${s.locator || ''}${s.value != null ? ' = ' + s.value : ''}`.trim();
}

async function executeAutonomousFlow(url, userPrompt, useGrid = false, outputDir = null, modelOverride = null) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
        cleanReportDirs(PROJECT_ROOT);

        // Kullanıcının seçtiği (veya varsayılan) kayıt klasörü ve AI modeli hazırlanır.
        const { baseDir, featuresDir, specsDir } = resolveOutputDirs(outputDir);
        const activeModel = modelOverride || OLLAMA_MODEL;
        const storageState = resolveStorageState();
        logInfo('📁', `Kayıt Klasörü: ${baseDir}`);
        logInfo('🧠', `Kullanılan Model: ${activeModel}`);
        if (storageState) logInfo('🔑', `Kayıtlı oturum kullanılıyor: ${storageState}`);

        // 1. Planlama — senaryoya düz yazılmış gizli değerler (.env'deki QA_SECRET_*)
        // LLM'e gitmeden önce yer tutucuya çevrilir.
        const safeRequest = redactSecrets(userPrompt);
        const testPlan = await agentPlanTest(safeRequest, activeModel, OLLAMA_URL);
        const slug = slugify(testPlan);
        // Keşif ajanlarının hedefi: Gherkin planı + kullanıcının ÖZGÜN metni. Planlayıcı
        // değerleri bozabiliyor (örn. "ali" -> "Ali"); kesin değerler özgün metinden alınır.
        const goalText = `${testPlan}

ORIGINAL USER REQUEST (take exact values such as usernames and expected texts from here):
${safeRequest}`;
        const featurePath = path.join(featuresDir, `${slug}.feature`);
        const specPath = path.join(specsDir, `${slug}.spec.ts`);
        // Feature ve spec yalnızca keşif HEDEFE ULAŞTIĞINDA birlikte yazılır (bkz. 3. faz).

        // 2. KEŞİF (EXPLORATION) AŞAMASI
        let browser;
        const gridEndpoint = process.env.GRID_WS_ENDPOINT;
        const stepHistory = [];
        // Keşfin nasıl bittiği: yalnızca goalReached=true ise kalıcı test üretilir.
        let goalReached = false;
        let stopReason = `Azami adım sayısına (${MAX_DISCOVERY_LOOPS}) ulaşıldı; senaryo bitirilemedi (MAX_DISCOVERY_LOOPS)`;
        let assertCount = 0;
        let failedAssertCount = 0;

        // Tüm keşif fazı try/finally ile sarılı: hangi yolla çıkılırsa çıkılsın tarayıcı kapanır.
        try {
        const headless = String(process.env.HEADLESS || '').toLowerCase() === 'true';
        if (useGrid && gridEndpoint) {
            logInfo('☁️', `Uzak tarayıcıya bağlanılıyor... Adres: ${gridEndpoint}`);
            browser = await chromium.connect({ wsEndpoint: gridEndpoint });
        } else {
            // Keşif normalde GÖRÜNÜR tarayıcıda koşar (kullanıcı ne olduğunu izleyebilsin).
            // Ekransız ortamlarda (SSH ile bağlanılan Mac Mini, CI, Docker) görünür mod
            // hiç açılamaz; bu yüzden .env'deki HEADLESS=true ile kapatılabilir.
            logInfo('🕵️', `Lokal AI Keşif Modu Başlatılıyor... (${headless ? 'headless' : 'görünür tarayıcı'})`);
            browser = await chromium.launch({ headless, args: headless ? [] : ['--start-maximized'] });
        }

        // Görünür modda pencere boyutu kullanılır; headless/uzak modda derlenen testle
        // (Desktop Chrome, 1280x720) aynı görüntü alanı — keşifte görünen eleman testte de görünsün.
        const useWindowViewport = !headless && !(useGrid && gridEndpoint);
        const context = await browser.newContext({
            viewport: useWindowViewport ? null : { width: 1280, height: 720 },
            storageState,
            // Kurum içi staging ortamları sık sık kendinden imzalı sertifika kullanır.
            // Yalnızca açıkça istenirse sertifika hataları yok sayılır (config ile aynı kural).
            ignoreHTTPSErrors: String(process.env.IGNORE_HTTPS_ERRORS || '').toLowerCase() === 'true'
        });
        // Dinamik Aktif Sekme Yönetimi
        let activePage = await context.newPage();

        context.on('page', async newPage => {
            logWarning(`✨ Yeni bir sekme/pencere açıldı! Ajanın odak noktası yeni sekmeye kaydırılıyor.`);
            try {
                await newPage.waitForLoadState('domcontentloaded', { timeout: 10000 });
            } catch (e) {
                // Timeout olsa bile yeni sekmeye geçilir; aksi halde ajan eski sayfada kalır.
                logError(`Yeni sekme yüklenirken süre aşımı oluştu — yine de yeni sekmeye geçiliyor.`);
            }
            activePage = newPage;
        });

        await activePage.goto(url, { waitUntil: 'domcontentloaded' });
        await settle(activePage);

        let loopCount = 0;
        const maxLoops = MAX_DISCOVERY_LOOPS;
        let repeatCount = 0;
        // Yürütülmüş eylemler ve GEÇEN doğrulamalar (döngü tespiti için).
        const executedActionKeys = new Set();
        const passedAssertKeys = new Set();
        const failedAssertKeys = new Set();
        // Model üst üste anlamsız eylem adı üretirse döngü boşa dönmesin.
        let invalidActionCount = 0;
        // Model doğrulama eklemeden DONE derse bir kez uyarılır.
        let nudgedForAssert = false;
        let hint = null;
        let warnedPlainPassword = false;
        const quotedExpectations = extractQuotedExpectations(safeRequest);
        let nudgedForExpectation = false;
        // Senaryoyu bitirmeden önceki son kontrol: 'finish' | 'retry' | 'stop'.
        const checkFinish = () => {
            const missing = missingExpectations(quotedExpectations, stepHistory);
            if (missing.length === 0) return 'finish';
            const list = missing.map(m => JSON.stringify(m)).join(', ');
            if (!nudgedForExpectation) {
                nudgedForExpectation = true;
                hint = `The user EXPLICITLY expects ${list}, but no assert in HISTORY checks it. ` +
                    'Return an "assert" (assertType "text" or "url") that verifies exactly this expectation now.';
                logWarning(`Senaryodaki açık beklenti henüz doğrulanmadı (${list}); modelden doğrulama isteniyor.`);
                return 'retry';
            }
            stopReason = `Senaryoda açıkça beklenen ${list} hiçbir doğrulamayla kontrol edilmedi`;
            return 'stop';
        };

        while (loopCount < maxLoops) {
            logInfo('🔍', `[Adım ${loopCount + 1}] Canlı Ekran DOM Haritası Çıkarılıyor...`);
            // Her döngüde activePage taranıyor (sekme değiştiyse yeni sekme; iframe'ler dahil).
            const { map: domMap, passwordLocators } = await scanLivePage(activePage);
            // FAZ 2: Token patlamasını önlemek için DOM, hedefe göre en alakalı
            // MAX_DOM_ELEMENTS elemana indirgenir. Tam domMap ters-arama için saklanır.
            const rankedMap = selectRelevantElements(domMap, goalText, stepHistory, MAX_DOM_ELEMENTS);
            const totalEls = Object.keys(domMap).length;
            if (totalEls > MAX_DOM_ELEMENTS) {
                logInfo('✂️', `DOM kırpıldı: ${totalEls} elemandan en alakalı ${MAX_DOM_ELEMENTS} tanesi LLM'e gönderiliyor.`);
            }
            const domData = JSON.stringify(rankedMap, null, 2);

            logInfo('🧠', `Agent 2 (Locator) hedefe ulaşmak için Düşünüyor...`);
            const pageInfo = { url: activePage.url(), title: await activePage.title().catch(() => '') };
            const nextStep = await agentGetNextStep(goalText, domData, stepHistory, activeModel, OLLAMA_URL, hint, pageInfo);
            hint = null;

            // Eylem adı tek noktadan normalize edilir ("Click", "drag_and_drop", "BİTTİ" ...).
            const action = normalizeAction(nextStep.action);

            if (action === 'DONE') {
                if (assertCount > 0) {
                    const verdict = checkFinish();
                    if (verdict === 'finish') {
                        goalReached = true;
                        logSuccess('✅', 'AI: Senaryo hedefine ulaşıldı!');
                        break;
                    }
                    if (verdict === 'stop') break;
                    loopCount++;
                    continue;
                }
                // Doğrulamasız test "hep yeşil" yanar; model bir kez uyarılır.
                if (!nudgedForAssert) {
                    nudgedForAssert = true;
                    hint = 'You returned DONE, but HISTORY contains NO "assert" step. A test without verification is worthless. ' +
                        'Return an "assert" step now that verifies the final outcome of the scenario.';
                    logWarning('Model doğrulama (assert) eklemeden bitirmek istedi; bir doğrulama adımı isteniyor.');
                    loopCount++;
                    continue;
                }
                stopReason = 'Model senaryoyu hiçbir doğrulama (assert) eklemeden bitirdi';
                break;
            }

            if (!action) {
                invalidActionCount++;
                logWarning(`Model tanınmayan bir eylem üretti: ${JSON.stringify(nextStep.action)}. Atlanıyor.`);
                if (invalidActionCount >= 3) {
                    stopReason = 'Model üst üste 3 kez geçerli bir eylem üretemedi';
                    break;
                }
                loopCount++;
                continue;
            }
            invalidActionCount = 0;

            // Otonom Çevirici: AI etiket (KEY) verirse locator'a (VALUE) çevrilir.
            let safeLocator = domMap[nextStep.locator] ? domMap[nextStep.locator] : nextStep.locator;
            // FAZ 3.2: dragAndDrop hedef locator'ı da etiket->locator çevrilir.
            let safeTarget = nextStep.target ? (domMap[nextStep.target] || nextStep.target) : undefined;
            const expectedRaw = nextStep.expected != null ? nextStep.expected : nextStep.value;
            const actionKey = `${action}:${safeLocator}:${toStoredValue(expectedRaw)}`;
            const lastStep = stepHistory[stepHistory.length - 1];
            const lastAssertPassed = !!(lastStep && lastStep.action === 'assert' && lastStep.passed);

            // İlerleme / döngü kontrolü (küçük modeller hedefi doğruladıktan sonra
            // DONE demek yerine adımları baştan tekrarlayabiliyor):
            // 1) Daha önce GEÇEN bir doğrulamanın aynısı -> hedef doğrulanmış, bitir.
            if (action === 'assert' && passedAssertKeys.has(actionKey)) {
                const verdict = checkFinish();
                if (verdict === 'finish') {
                    goalReached = true;
                    logSuccess('✅', 'Doğrulama zaten yapıldı ve geçti; hedefe ulaşıldı kabul ediliyor (DONE).');
                    break;
                }
                if (verdict === 'stop') break;
                loopCount++;
                continue;
            }
            //    Daha önce BAŞARISIZ olan doğrulamanın aynısı: sayfa değişmediği için yine
            //    başarısız olur. Senaryo bu beklentiyle bitirilir; derlenen test dürüstçe
            //    KIRMIZI yanar (uygulama hatası ya da yanlış beklenti — insan incelemeli).
            if (action === 'assert' && failedAssertKeys.has(actionKey)) {
                const verdict = checkFinish();
                if (verdict === 'finish') {
                    goalReached = true;
                    logWarning('Aynı doğrulama yeniden önerildi ve daha önce BAŞARISIZ olmuştu; senaryo bu beklentiyle bitiriliyor.');
                    break;
                }
                if (verdict === 'stop') break;
                loopCount++;
                continue;
            }
            // 2) Daha önce yürütülmüş bir eylem yeniden öneriliyor (ardışık ya da değil).
            //    Eylem tekrar YÜRÜTÜLMEZ; model önce uyarılır, ısrar ederse döngü kabul edilir.
            if (action !== 'assert' && executedActionKeys.has(actionKey)) {
                repeatCount++;
                if (repeatCount >= 2) {
                    if (!lastAssertPassed) {
                        stopReason = `Model daha önce yapılmış bir adımı (${action} ${safeLocator}) ilerleme sağlamadan tekrarlıyor`;
                        break;
                    }
                    const verdict = checkFinish();
                    if (verdict === 'finish') {
                        goalReached = true;
                        logWarning('Model, hedef doğrulandıktan sonra önceki adımları tekrarlamaya başladı; ' +
                            'senaryo son BAŞARILI doğrulamada bitirildi. Derlenen testi gözden geçirin.');
                        break;
                    }
                    if (verdict === 'stop') break;
                    loopCount++;
                    continue;
                }
                hint = lastAssertPassed
                    ? `The step ${JSON.stringify({ action, locator: safeLocator })} is ALREADY in HISTORY and the last assert PASSED. ` +
                      'If the GOAL is achieved, return { "action": "DONE" } now. Otherwise choose the next NEW step.'
                    : `The step ${JSON.stringify({ action, locator: safeLocator })} was ALREADY executed (see HISTORY). Do not redo it. ` +
                      'Choose the next NEW step toward the GOAL (e.g. a [Buton] instead of a [Bölüm] container), or an "assert".';
                logWarning(`Daha önce yapılmış adım tekrar önerildi (${action} ${safeLocator}); model uyarılıyor.`);
                loopCount++;
                continue;
            }
            repeatCount = 0;
            logInfo('🎯', `Eylem Uygulanıyor: [${action.toUpperCase()}] -> ${safeLocator || '(sayfa)'}`);

            // ⚡ FAZ 2: ASSERTION (Doğrulama) — locator hatasından farklı ele alınır.
            // Canlı doğrulanır; sonuç ne olursa olsun teste kaydedilir (gerçek bir hata ise
            // derlenen testin de patlaması GEREKİR). Başarısız assert döngüyü kırmaz.
            if (action === 'assert') {
                const assertType = normalizeAssertType(nextStep.assertType);
                const expected = toStoredValue(expectedRaw != null ? String(expectedRaw) : '');

                // Beklenen değeri boş gelen url/text doğrulaması SESSİZ YANLIŞ-POZİTİFTİR
                // (new RegExp('') her URL'yi, toContainText('') her metni eşler).
                const assertProblem = validateAssert(assertType, expected, safeLocator);
                if (assertProblem) {
                    logWarning(`Doğrulama ATLANDI — ${assertProblem}. Teste yazılmayacak (yanlış-pozitif önlendi).`);
                    loopCount++;
                    continue;
                }

                const liveExpected = resolveSecretValue(expected);
                let passed = false;
                try {
                    if (assertType === 'url') {
                        await expect(activePage).toHaveURL(new RegExp(escapeRegExp(liveExpected)), { timeout: 8000 });
                    } else if (assertType === 'text') {
                        await expect(resolveLocator(activePage, safeLocator).first()).toContainText(liveExpected, { timeout: 8000 });
                    } else if (assertType === 'value') {
                        await expect(resolveLocator(activePage, safeLocator).first()).toHaveValue(liveExpected, { timeout: 8000 });
                    } else {
                        await expect(resolveLocator(activePage, safeLocator).first()).toBeVisible({ timeout: 8000 });
                    }
                    passed = true;
                    logSuccess('✔️', `Doğrulama BAŞARILI: [${assertType}] ${expected || safeLocator}`);
                } catch (assertErr) {
                    failedAssertCount++;
                    logWarning(`Doğrulama BAŞARISIZ (yine de teste kaydediliyor): [${assertType}] ${expected || safeLocator}`);
                }
                assertCount++;
                (passed ? passedAssertKeys : failedAssertKeys).add(actionKey);
                // "passed" yalnızca modele geri bildirimdir; derleyici bu alanı kullanmaz.
                stepHistory.push({ action: 'assert', locator: safeLocator, assertType, expected, passed });
                loopCount++;
                continue;
            }

            let { stored: storedValue, exec: execValue } = prepareValue(action, nextStep.value);

            // Şifre alanına .env'deki bir QA_SECRET_ değeri yerine düz metin yazılıyorsa
            // bu değer git'e girecek spec'e açıkça düşer — kullanıcı uyarılır.
            if (action === 'fill' && !warnedPlainPassword && passwordLocators.has(safeLocator) &&
                !secretNameFromPlaceholder(storedValue)) {
                warnedPlainPassword = true;
                logWarning('Şifre alanına DÜZ METİN yazılıyor; bu değer derlenen teste açıkça girecek. ' +
                    '.env dosyasına QA_SECRET_PASSWORD=... ekleyip senaryoda {{QA_SECRET_PASSWORD}} kullanın.');
            }

            // dragAndDrop hedefsiz gelirse Playwright çağrısı anlamsız bir hata verir;
            // niyeti baştan reddedip self-healing turunu boşa harcamıyoruz.
            if (action === 'dragAndDrop' && !safeTarget) {
                logWarning('dragAndDrop için "target" verilmedi, adım atlanıyor.');
                loopCount++;
                continue;
            }

            try {
                // Sayfada hiç karşılığı olmayan (modelin uydurduğu) locator için 10 sn
                // timeout beklenmez; doğrudan self-healing'e geçilir.
                if (action !== 'press' && await resolveLocator(activePage, safeLocator).count() === 0) {
                    throw new Error(`Element not found on the current page: ${safeLocator}`);
                }
                await executeAction(activePage, action, safeLocator, execValue, { target: safeTarget });
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
                        const { map: freshMap } = await scanLivePage(activePage);
                        const freshRanked = selectRelevantElements(freshMap, goalText, stepHistory, MAX_DOM_ELEMENTS);
                        const healedStep = await agentHealStep(
                            goalText,
                            { action, locator: safeLocator, value: storedValue },
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
                        const healedValues = healedStep.value != null
                            ? prepareValue(action, healedStep.value)
                            : { stored: storedValue, exec: execValue };
                        const healedTarget = (healedStep.target != null) ? (freshMap[healedStep.target] || healedStep.target) : safeTarget;
                        logInfo('🩹', `Self-Healing denemesi ${healAttempt}: yeni locator -> ${healedLocator}`);

                        await executeAction(activePage, action, healedLocator, healedValues.exec, { target: healedTarget });

                        // Başarılı: ÇALIŞAN locator/değer kaydedilir (derlenen test doğru olanı alır).
                        safeLocator = healedLocator;
                        storedValue = healedValues.stored;
                        safeTarget = healedTarget;
                        healed = true;
                        logSuccess('✅', `Self-Healing BAŞARILI! Adım kurtarıldı.`);
                    } catch (healErr) {
                        logWarning(`Self-Healing denemesi ${healAttempt} başarısız: ${(healErr.message || '').split('\n')[0].slice(0, 150)}`);
                    }
                }

                if (!healed) {
                    stopReason = `"${action} ${safeLocator}" adımı self-healing ile de yürütülemedi (${reason})`;
                    break;
                }
            }

            stepHistory.push({ action, locator: safeLocator, value: storedValue, target: safeTarget });
            executedActionKeys.add(actionKey);
            // Self-healing locator'ı değiştirdiyse yeni hâli de "yapıldı" sayılır.
            executedActionKeys.add(`${action}:${safeLocator}:${storedValue}`);
            loopCount++;

            // Sayfanın kendine gelmesi ve yeni elemanların oturması için bekleme
            await settle(activePage);
        }

        } finally {
            // Hata/timeout/break — hangi yolla çıkılırsa çıkılsın tarayıcı kapatılır.
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) {
                    logWarning(`Tarayıcı kapatılırken hata oluştu (yok sayılıyor): ${closeErr.message}`);
                }
            }
        }

        // 3. DERLEME (COMPILATION) AŞAMASI
        // ⚠️ Yalnızca hedefe ULAŞAN ve en az bir doğrulama içeren keşif kalıcı teste
        // dönüşür. Yarıda kalan bir keşif derlenseydi, sadece başarılı ilk adımları
        // içeren ve senaryonun asıl hedefini hiç doğrulamayan "yeşil" bir test
        // kütüphaneye (ve git ile diğer makinelere) yayılırdı.
        if (!goalReached) {
            const done = stepHistory.length
                ? stepHistory.map((s, i) => `   ${i + 1}. ${describeStep(s)}`).join('\n')
                : '   (hiç adım uygulanamadı)';
            throw new Error(`Keşif tamamlanamadı: ${stopReason}.\n` +
                `Yarım kalan test kalıcı kütüphaneye KAYDEDİLMEDİ. Başarıyla uygulanan adımlar:\n${done}\n` +
                'Senaryoyu daha açık yazmayı, daha büyük bir model seçmeyi veya MAX_DISCOVERY_LOOPS değerini artırmayı deneyin.');
        }

        logInfo('🧹', `Keşif tamamlandı (${stepHistory.length} adım, ${assertCount} doğrulama). Kalıcı test senaryosu derleniyor...`);
        if (failedAssertCount > 0) {
            logWarning(`${failedAssertCount} doğrulama keşif sırasında BAŞARISIZ oldu. Derlenen test büyük olasılıkla ` +
                'kırmızı yanacak: ya uygulamada gerçek bir hata var ya da model yanlış bir beklenti üretti — testi gözden geçirin.');
        }
        // Feature ve spec BİRLİKTE yazılır: kütüphanede daima eşleşen ikili bulunur.
        const safePlan = redactSecrets(testPlan);
        fs.writeFileSync(featurePath, safePlan);
        compilePlaywrightCode(stepHistory, url, safePlan, specPath);
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

            // npx Windows'ta .cmd'dir ve shell ister; komut satırı spawnNpx'te güvenli kurulur.
            const testProcess = spawnNpx(['playwright', 'test', specFileName, '--reporter=list,allure-playwright', '--workers=1'], {
                env: envVars, cwd: PROJECT_ROOT
            });

            // spawn 'error' olayı (örn. npx PATH'te yok, izin hatası) sessizce askıda kalmaz.
            testProcess.on('error', (err) => {
                logError(`Playwright süreci başlatılamadı: ${err.message}`);
                reject(new Error(`Playwright süreci başlatılamadı: ${err.message}`));
            });

            testProcess.stdout.on('data', (data) => process.stdout.write(data.toString()));
            testProcess.stderr.on('data', (data) => process.stderr.write(data.toString()));

            testProcess.on('close', (code) => {
                logInfo('📊', `Allure raporu derleniyor...`);
                // cwd: göreli './allure-results' yolu her zaman proje köküne göre çözülür.
                const allureProcess = spawnNpx(['allure', 'generate', './allure-results', '-o', './allure-report', '--clean'], {
                    cwd: PROJECT_ROOT
                });

                // Allure başlatılamazsa AKIŞ ÇÖKMEZ; testin gerçek sonucu
                // raporlama hatasıyla maskelenmemeli, test exit kodu yine de döndürülür.
                allureProcess.on('error', (err) => {
                    logWarning(`Allure raporu üretilemedi (rapor atlanıyor): ${err.message}`);
                    resolve({ exitCode: code, featurePath, specPath });
                });

                allureProcess.on('close', (allureCode) => {
                    if (allureCode === 0) {
                        logSuccess('✅', `Rapor hazırlandı. Boru Hattı (Pipeline) tamamlandı.`);
                    } else {
                        logWarning(`Allure ${allureCode} koduyla bitti; rapor eksik olabilir ama akış tamamlandı. ` +
                            '(Allure rapor üretimi için bilgisayarda Java kurulu olmalıdır.)');
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

module.exports = { executeAutonomousFlow, extractQuotedExpectations, missingExpectations };
