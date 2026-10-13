const fs = require('fs');
const { logInfo, logSuccess, logWarning } = require('../utils/logger');
// Keşif (orchestrator) ve derleme AYNI kuralları kullanmalı; ortak yardımcılar
// tek dosyada tutulur, böylece iki taraf zamanla birbirinden ayrışmaz.
const { escapeRegExp, normalizeAction, normalizeAssertType, validateAssert } = require('../utils/steps');
const { locatorExpression } = require('../utils/locator');
const { toStoredValue, secretNameFromPlaceholder } = require('../utils/secrets');

// Test planı üretilen betiğe blok yorum olarak gömülür. LLM metninde "*/" geçerse
// yorum erkenden kapanır ve dosya DERLENMEZ; bu yüzden dizi zararsızlaştırılır.
function safeForBlockComment(text) {
    return String(text == null ? '' : text).replace(/\*\//g, '*∕');
}

// Gherkin planından Allure raporunda okunur test adları çıkarır.
function extractTitles(testPlan) {
    const text = String(testPlan || '');
    const feature = (text.match(/^\s*Feature:\s*(.+)$/m) || [])[1];
    const scenario = (text.match(/^\s*Scenario(?: Outline)?:\s*(.+)$/m) || [])[1];
    return {
        describe: (feature || 'AI Otonom Senaryo Keşfi').trim().slice(0, 150),
        test: (scenario || 'Keşfedilen ve Doğrulanan Adımlar').trim().slice(0, 150)
    };
}

// Değeri koda döker. Gizli değerler (.env QA_SECRET_*) düz metin olarak ASLA
// yazılmaz; process.env'den okuyan secret() çağrısına dönüşür. RANDOM_EMAIL her
// koşumda yeni bir adres üretir (kayıt testleri ikinci koşumda patlamasın).
function valueExpression(value, ctx) {
    const stored = toStoredValue(value == null ? '' : String(value));
    const secretName = secretNameFromPlaceholder(stored);
    if (secretName) {
        ctx.usesSecret = true;
        return `secret(${JSON.stringify(secretName)})`;
    }
    if (stored === 'RANDOM_EMAIL') return '`test_${Date.now()}@mail.com`';
    return JSON.stringify(stored);
}

const SECRET_HELPER = [
    '// Gizli test verileri .env dosyasından okunur (QA_SECRET_ önekli); bu dosyada düz metin bulunmaz.',
    'function secret(name: string): string {',
    '  const value = process.env[name];',
    '  if (!value) throw new Error(`${name} ortam değişkeni tanımlı değil (.env dosyasına ekleyin).`);',
    '  return value;',
    '}',
    ''
].join('\n') + '\n';

function compilePlaywrightCode(stepHistory, url, testPlan, testFilePath) {
    logInfo('🧹', `Adım hafızası Playwright betiğine dönüştürülüyor...`);

    const ctx = { usesSecret: false };
    const titles = extractTitles(testPlan);
    let tsCode = '';

    tsCode += `test.describe(${JSON.stringify(titles.describe)}, () => {\n`;

    tsCode += `  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---\n`;
    safeForBlockComment(testPlan).split('\n').forEach(line => {
        tsCode += `     ${line}\n`;
    });
    tsCode += `  */\n\n`;

    tsCode += `  test(${JSON.stringify(titles.test)}, async ({ page }) => {\n`;
    tsCode += `    await page.goto(${JSON.stringify(url)});\n\n`;

    // Ardışık ÖZDEŞ adımlar tekilleştirilir (küçük modeller bazen aynı assert'i
    // tekrarlar; derlenen teste bir kez yazılması yeterlidir).
    const dedupedSteps = stepHistory.filter((s, i) => {
        if (i === 0) return true;
        const p = stepHistory[i - 1];
        return !(s.action === p.action && s.locator === p.locator && s.value === p.value &&
                 s.target === p.target && s.assertType === p.assertType && s.expected === p.expected);
    });

    let emitted = 0;
    let assertsEmitted = 0;
    dedupedSteps.forEach((step) => {
        const action = normalizeAction(step.action);
        if (!action || action === 'DONE' || action === 'GIVEUP') {
            // Tanınmayan eylem için sessiz boş adım üretilmez; açıkça atlanır.
            logWarning(`Derleme: tanınmayan eylem atlandı -> ${JSON.stringify(step.action)}`);
            return;
        }

        // ⚠️ LLM çıktısı GÜVENİLMEYEN girdidir. Her parça JSON.stringify ile tam
        // kaçışlanır (backtick, newline, ' ile betiğe kod enjekte edilemez).
        // Locator iframe zinciri taşıyabilir: page.frameLocator(...).locator(...)
        const loc = locatorExpression(step.locator || 'body');

        let line = '';

        // ⚠️ { force: true } kullanılmaz. Görünürlük/etkileşilebilirlik kontrollerini
        // bypass etmek yanlış-pozitif (false positive) testler üretiyordu.
        if (action === 'click') {
            line = `    await ${loc}.first().click();\n`;
        } else if (action === 'hover') {
            line = `    await ${loc}.first().hover();\n`;
        } else if (action === 'fill') {
            line = `    await ${loc}.first().fill(${valueExpression(step.value, ctx)});\n`;
        } else if (action === 'press') {
            line = `    await page.keyboard.press(${JSON.stringify(step.value || 'Enter')});\n`;
        } else if (action === 'select') {
            line = `    await ${loc}.first().selectOption(${valueExpression(step.value, ctx)});\n`;
        } else if (action === 'dragAndDrop') {
            // FAZ 3.2: kaynak -> hedef sürükle-bırak (iframe içinde de çalışır).
            if (!step.target) {
                logWarning('Derleme: hedefi (target) olmayan dragAndDrop adımı atlandı.');
                return;
            }
            line = `    await ${loc}.first().dragTo(${locatorExpression(step.target)}.first());\n`;
        } else if (action === 'assert') {
            // ⚡ FAZ 2: Otomatik doğrulama. Test artık sadece akışı simüle etmiyor;
            // sonucu gerçekten doğruluyor.
            const assertType = normalizeAssertType(step.assertType);

            // Beklenen değeri boş olan doğrulama SESSİZ YANLIŞ-POZİTİFTİR:
            // new RegExp('') her URL'yi, toContainText('') her metni eşler.
            const problem = validateAssert(assertType, step.expected, step.locator);
            if (problem) {
                logWarning(`Derleme: doğrulama atlandı — ${problem}.`);
                return;
            }

            const expLit = valueExpression(step.expected, ctx);
            if (assertType === 'url') {
                line = `    await expect(page).toHaveURL(new RegExp(${JSON.stringify(escapeRegExp(step.expected))}));\n`;
            } else if (assertType === 'text') {
                line = `    await expect(${loc}.first()).toContainText(${expLit});\n`;
            } else if (assertType === 'value') {
                line = `    await expect(${loc}.first()).toHaveValue(${expLit});\n`;
            } else {
                line = `    await expect(${loc}.first()).toBeVisible();\n`;
            }
            assertsEmitted++;
        }

        emitted++;
        tsCode += `    // Adım ${emitted}: [${action.toUpperCase()}] İşlemi\n`;
        tsCode += line;
        tsCode += `    await page.waitForLoadState('domcontentloaded');\n\n`;
    });

    if (emitted === 0 || assertsEmitted === 0) {
        // Buraya normalde düşülmez (orchestrator doğrulamasız keşfi zaten reddeder) ama
        // derlenen dosyanın "hiçbir şey doğrulamayan yeşil test" olmasına izin verilmez.
        tsCode += `    throw new Error('Bu test hiçbir doğrulama (assert) içermiyor; yeşil geçmesi bir şey kanıtlamaz.');\n`;
        logWarning('Derleme: geçerli doğrulama üretilemedi; test bilinçli olarak başarısız olacak şekilde yazıldı.');
    }

    tsCode += `  });\n`;
    tsCode += `});\n`;

    // Başlık en sonda kurulur: secret() yardımcısı yalnızca kullanılıyorsa eklenir.
    let header = `import { test, expect } from '@playwright/test';\n\n`;
    if (ctx.usesSecret) header += SECRET_HELPER;
    header += `// 🌐 Uzak Tarayıcı (Grid) Yönlendirmesi\n`;
    header += `if (process.env.PW_WS_ENDPOINT) {\n`;
    header += `    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });\n`;
    header += `}\n\n`;
    tsCode = header + tsCode;

    fs.writeFileSync(testFilePath, tsCode);
    logSuccess('📂', `Temiz ve kalıcı statik Playwright betiği (.ts) oluşturuldu (${emitted} adım, ${assertsEmitted} doğrulama).`);
    return { stepCount: emitted, assertCount: assertsEmitted };
}

module.exports = { compilePlaywrightCode };
