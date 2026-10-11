const fs = require('fs');
const { logInfo, logSuccess, logWarning } = require('../utils/logger');
// Keşif (orchestrator) ve derleme AYNI kuralları kullanmalı; ortak yardımcılar
// tek dosyada tutulur, böylece iki taraf zamanla birbirinden ayrışmaz.
const { escapeRegExp, normalizeAction, normalizeAssertType, validateAssert } = require('../utils/steps');

// Test planı üretilen betiğe blok yorum olarak gömülür. LLM metninde "*/" geçerse
// yorum erkenden kapanır ve dosya DERLENMEZ; bu yüzden dizi zararsızlaştırılır.
function safeForBlockComment(text) {
    return String(text == null ? '' : text).replace(/\*\//g, '*∕');
}

function compilePlaywrightCode(stepHistory, url, testPlan, testFilePath) {
    logInfo('🧹', `Adım hafızası Playwright betiğine dönüştürülüyor...`);

    let tsCode = `import { test, expect } from '@playwright/test';\n\n`;

    tsCode += `// 🌐 Uzak Tarayıcı (Grid) Yönlendirmesi\n`;
    tsCode += `if (process.env.PW_WS_ENDPOINT) {\n`;
    tsCode += `    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });\n`;
    tsCode += `}\n\n`;

    tsCode += `test.describe('AI Otonom Senaryo Keşfi', () => {\n`;

    tsCode += `  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---\n`;
    safeForBlockComment(testPlan).split('\n').forEach(line => {
        tsCode += `     ${line}\n`;
    });
    tsCode += `  */\n\n`;

    tsCode += `  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {\n`;
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
    dedupedSteps.forEach((step) => {
        const action = normalizeAction(step.action);
        if (!action || action === 'DONE' || action === 'GIVEUP') {
            // ⚠️ DÜZELTME: Tanınmayan eylem için önceden hiçbir kod satırı yazılmadan
            // sadece bir yorum + waitForTimeout üretiliyordu (sessiz boş adım).
            logWarning(`Derleme: tanınmayan eylem atlandı -> ${JSON.stringify(step.action)}`);
            return;
        }

        // ⚠️ LLM çıktısı GÜVENİLMEYEN girdidir. Tek tırnak değiştirme yetersizdi
        // (backtick, newline, ') ile betiğe kod enjekte edilebilirdi). JSON.stringify ile
        // tam kaçışlı, geçerli bir string literal üretiyoruz.
        const locLit = JSON.stringify(step.locator || 'body');

        let line = '';

        // ⚠️ { force: true } kullanılmaz. Görünürlük/etkileşilebilirlik kontrollerini
        // bypass etmek yanlış-pozitif (false positive) testler üretiyordu.
        if (action === 'click') {
            line = `    await page.locator(${locLit}).first().click();\n`;
        } else if (action === 'hover') {
            line = `    await page.locator(${locLit}).first().hover();\n`;
        } else if (action === 'fill') {
            line = `    await page.locator(${locLit}).first().fill(${JSON.stringify(step.value || '')});\n`;
        } else if (action === 'press') {
            line = `    await page.keyboard.press(${JSON.stringify(step.value || 'Enter')});\n`;
        } else if (action === 'select') {
            line = `    await page.locator(${locLit}).first().selectOption(${JSON.stringify(step.value || '')});\n`;
        } else if (action === 'dragAndDrop') {
            // FAZ 3.2: kaynak -> hedef sürükle-bırak (iki selector alır).
            if (!step.target) {
                logWarning('Derleme: hedefi (target) olmayan dragAndDrop adımı atlandı.');
                return;
            }
            line = `    await page.dragAndDrop(${locLit}, ${JSON.stringify(step.target)});\n`;
        } else if (action === 'assert') {
            // ⚡ FAZ 2: Otomatik doğrulama. Test artık sadece akışı simüle etmiyor;
            // sonucu gerçekten doğruluyor.
            const assertType = normalizeAssertType(step.assertType);

            // ⚠️ DÜZELTME: Beklenen değeri boş olan doğrulama SESSİZ YANLIŞ-POZİTİFTİR:
            // new RegExp('') her URL'yi, toContainText('') her metni eşler. Böyle bir
            // "doğrulama" teste yazılırsa test her koşulda yeşil yanar ve hiçbir şey
            // güvence altına almaz. Bu yüzden üretilmez.
            const problem = validateAssert(assertType, step.expected, step.locator);
            if (problem) {
                logWarning(`Derleme: doğrulama atlandı — ${problem}.`);
                return;
            }

            const expLit = JSON.stringify(step.expected);
            if (assertType === 'url') {
                line = `    await expect(page).toHaveURL(new RegExp(${JSON.stringify(escapeRegExp(step.expected))}));\n`;
            } else if (assertType === 'text') {
                line = `    await expect(page.locator(${locLit}).first()).toContainText(${expLit});\n`;
            } else if (assertType === 'value') {
                line = `    await expect(page.locator(${locLit}).first()).toHaveValue(${expLit});\n`;
            } else {
                line = `    await expect(page.locator(${locLit}).first()).toBeVisible();\n`;
            }
        }

        emitted++;
        tsCode += `    // Adım ${emitted}: [${action.toUpperCase()}] İşlemi\n`;
        tsCode += line;
        tsCode += `    await page.waitForLoadState('domcontentloaded');\n\n`;
    });

    if (emitted === 0) {
        // Buraya normalde düşülmez (orchestrator boş geçmişi zaten reddeder) ama
        // derlenen dosyanın "hiçbir şey doğrulamayan yeşil test" olmasına izin verilmez.
        tsCode += `    throw new Error('Bu senaryo için uygulanabilir hiçbir adım derlenemedi.');\n`;
        logWarning('Derleme: hiçbir geçerli adım üretilemedi; test bilinçli olarak başarısız olacak şekilde yazıldı.');
    }

    tsCode += `  });\n`;
    tsCode += `});\n`;

    fs.writeFileSync(testFilePath, tsCode);
    logSuccess('📂', `Temiz ve kalıcı statik Playwright betiği (.ts) oluşturuldu (${emitted} adım).`);
    return { stepCount: emitted };
}

module.exports = { compilePlaywrightCode };
