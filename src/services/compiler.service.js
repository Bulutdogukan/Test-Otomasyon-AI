const fs = require('fs');
const { logInfo, logSuccess } = require('../utils/logger');

// URL assertion'ı için kullanıcı/LLM metnini güvenli bir regex literaline çevirir.
function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePlaywrightCode(stepHistory, url, testPlan, testFilePath) {
    logInfo('🧹', `Adım hafızası Playwright betiğine dönüştürülüyor...`);
    
    let tsCode = `import { test, expect } from '@playwright/test';\n\n`;
    
    tsCode += `// 🌐 Selenium Grid Yönlendirmesi\n`;
    tsCode += `if (process.env.PW_WS_ENDPOINT) {\n`;
    tsCode += `    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });\n`;
    tsCode += `}\n\n`;

    tsCode += `test.describe('AI Otonom Senaryo Keşfi', () => {\n`;
    
    tsCode += `  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---\n`;
    testPlan.split('\n').forEach(line => {
        tsCode += `     ${line}\n`;
    });
    tsCode += `  */\n\n`;
    
    tsCode += `  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {\n`;
    tsCode += `    await page.goto(${JSON.stringify(url)});\n\n`;

    stepHistory.forEach((step, index) => {
        tsCode += `    // Adım ${index + 1}: [${step.action.toUpperCase()}] İşlemi\n`;
        // ⚠️ DÜZELTME: LLM çıktısı GÜVENİLMEYEN girdidir. Tek tırnak değiştirme yetersizdi
        // (backtick, newline, ') ile betiğe kod enjekte edilebilirdi). JSON.stringify ile
        // tam kaçışlı, geçerli bir string literal üretiyoruz.
        const locLit = JSON.stringify(step.locator || 'body');

        // ⚠️ DÜZELTME: { force: true } kaldırıldı. Görünürlük/etkileşilebilirlik
        // kontrollerini bypass etmek yanlış-pozitif (false positive) testler üretiyordu.
        if (step.action === 'click') {
            tsCode += `    await page.locator(${locLit}).first().click();\n`;
        } else if (step.action === 'hover') {
            tsCode += `    await page.locator(${locLit}).first().hover();\n`;
        } else if (step.action === 'fill') {
            const valLit = JSON.stringify(step.value || '');
            tsCode += `    await page.locator(${locLit}).first().fill(${valLit});\n`;
        } else if (step.action === 'press') {
            const keyLit = JSON.stringify(step.value || 'Enter');
            tsCode += `    await page.keyboard.press(${keyLit});\n`;
        } else if (step.action === 'select') {
            const valLit = JSON.stringify(step.value || '');
            tsCode += `    await page.locator(${locLit}).first().selectOption(${valLit});\n`;
        } else if (step.action === 'dragAndDrop') {
            // FAZ 3.2: kaynak -> hedef sürükle-bırak (iki selector alır).
            const targetLit = JSON.stringify(step.target || 'body');
            tsCode += `    await page.dragAndDrop(${locLit}, ${targetLit});\n`;
        } else if (step.action === 'assert') {
            // ⚡ FAZ 2: Otomatik doğrulama (assertion). Test artık sadece akışı
            // simüle etmiyor; sonucu gerçekten doğruluyor.
            const assertType = step.assertType || 'visible';
            const expLit = JSON.stringify(step.expected || '');
            if (assertType === 'url') {
                tsCode += `    await expect(page).toHaveURL(new RegExp(${JSON.stringify(escapeRegExp(step.expected || ''))}));\n`;
            } else if (assertType === 'text') {
                tsCode += `    await expect(page.locator(${locLit}).first()).toContainText(${expLit});\n`;
            } else if (assertType === 'value') {
                tsCode += `    await expect(page.locator(${locLit}).first()).toHaveValue(${expLit});\n`;
            } else {
                tsCode += `    await expect(page.locator(${locLit}).first()).toBeVisible();\n`;
            }
        }
        tsCode += `    await page.waitForTimeout(1000);\n\n`;
    });

    tsCode += `  });\n`;
    tsCode += `});\n`;

    fs.writeFileSync(testFilePath, tsCode);
    logSuccess('📂', `Temiz ve kalıcı statik Playwright betiği (.ts) başarıyla oluşturuldu!`);
}

module.exports = { compilePlaywrightCode };