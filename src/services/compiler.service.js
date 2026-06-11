const fs = require('fs');
const { logInfo, logSuccess } = require('../utils/logger');

function compilePlaywrightCode(stepHistory, url, testPlan, testFilePath) {
    logInfo('🧹', `Adım hafızası (Step History) Playwright betiğine (.ts) dönüştürülüyor...`);
    
    let tsCode = `import { test, expect } from '@playwright/test';\n\n`;
    tsCode += `test.describe('AI Otonom Senaryo Keşfi', () => {\n`;
    
    // Gherkin planını koda yorum olarak ekler
    tsCode += `  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---\n`;
    testPlan.split('\n').forEach(line => {
        tsCode += `     ${line}\n`;
    });
    tsCode += `  */\n\n`;
    
    tsCode += `  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {\n`;
    tsCode += `    await page.goto('${url}');\n\n`;

    stepHistory.forEach((step, index) => {
        tsCode += `    // Adım ${index + 1}: [${step.action.toUpperCase()}] İşlemi\n`;
        
        // Tırnak işaretlerinden kaynaklı TypeScript syntax hatalarını önleme
        let loc = step.locator.replace(/'/g, "\\'"); 
        
        if (step.action === 'click') {
            tsCode += `    await page.locator('${loc}').first().click();\n`;
        } else if (step.action === 'fill') {
            let val = step.value.replace(/'/g, "\\'");
            tsCode += `    await page.locator('${loc}').first().fill('${val}');\n`;
        } else if (step.action === 'press') {
            tsCode += `    await page.keyboard.press('${step.value}');\n`;
        } else if (step.action === 'select') {
            let val = step.value.replace(/'/g, "\\'");
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