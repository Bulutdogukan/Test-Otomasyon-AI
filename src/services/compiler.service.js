const fs = require('fs');
const { logInfo, logSuccess } = require('../utils/logger');

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
    tsCode += `    await page.goto('${url}');\n\n`;

    stepHistory.forEach((step, index) => {
        tsCode += `    // Adım ${index + 1}: [${step.action.toUpperCase()}] İşlemi\n`;
        let loc = step.locator ? step.locator.replace(/'/g, "\\'") : 'body'; 
        
        if (step.action === 'click') {
            tsCode += `    await page.locator('${loc}').first().click({ force: true });\n`;
        } else if (step.action === 'hover') {
            tsCode += `    await page.locator('${loc}').first().hover({ force: true });\n`;
        } else if (step.action === 'fill') {
            let val = step.value ? step.value.replace(/'/g, "\\'") : '';
            tsCode += `    await page.locator('${loc}').first().fill('${val}', { force: true });\n`;
        } else if (step.action === 'press') {
            tsCode += `    await page.keyboard.press('${step.value}');\n`;
        } else if (step.action === 'select') {
            let val = step.value ? step.value.replace(/'/g, "\\'") : '';
            tsCode += `    await page.locator('${loc}').first().selectOption('${val}');\n`;
        }
        tsCode += `    await page.waitForTimeout(1000);\n\n`;
    });

    tsCode += `  });\n`;
    tsCode += `});\n`;

    fs.writeFileSync(testFilePath, tsCode);
    logSuccess('📂', `Temiz ve kalıcı statik Playwright betiği (.ts) başarıyla oluşturuldu!`);
}

module.exports = { compilePlaywrightCode };