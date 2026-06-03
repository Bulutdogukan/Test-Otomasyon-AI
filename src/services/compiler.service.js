const fs = require('fs');
const path = require('path');
const { logInfo, logSuccess, logError } = require('../utils/logger');

function compilePlaywrightCode(jsonOutput, url, testFilePath) {
    logInfo('🧹 [4/5]', `Otomasyon kodları derleniyor (.ts)...`);
    
    let scenarios = [];
    try { 
        const cleanJson = jsonOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson); 
        
        // Çoklu senaryo desteği kontrolü
        if (parsedData.tests && Array.isArray(parsedData.tests)) {
            scenarios = parsedData.tests;
        } else if (parsedData.steps) {
            scenarios = [{ title: 'Otonom QA Testi', steps: parsedData.steps }]; // Eski formata uyumluluk
        } else if (Array.isArray(parsedData)) {
            scenarios = [{ title: 'Otonom QA Testi', steps: parsedData }];
        } else {
            throw new Error("Beklenen 'tests' dizisi bulunamadı.");
        }
    } catch (e) { 
        logError(`Geçerli JSON üretilemedi. Raw Çıktı: \n${jsonOutput}`);
        throw new Error("AI, işlenebilir formatta bir JSON üretemedi.");
    }

    // 1. AŞAMA: Dosya başlıkları ve Grid yönlendirmesi
    let tsCode = `import { test, expect, Page, Locator } from '@playwright/test';

// 🌐 YENİ: Selenium Grid Yönlendirmesi
// Eğer orchestrator process.env.PW_WS_ENDPOINT gönderdiyse, Playwright lokal browser açmaz, Grid'e bağlanır.
if (process.env.PW_WS_ENDPOINT) {
    test.use({ 
        connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } 
    });
}

// 2. AŞAMA: Yardımcı Fonksiyonlar (Aynı Bırakıldı)
async function scanCurrentPage(activePage: Page): Promise<Record<string, string>> {
    const domMap = await activePage.evaluate(() => {
        const selectors = 'input, button, a, select, textarea, [role="button"], [role="link"], [onclick], [data-test], [data-testid], [data-qa], [aria-label], [placeholder], [title]';
        const elements = Array.from(document.querySelectorAll(selectors));
        const kvMap: Record<string, string> = {};

        elements.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            const isAd = el.closest('[id*=\\"ad\\"], [class*=\\"ad-\\"], [class*=\\"sponsored\\"], [class*=\\"promo\\"], [class*=\\"reklam\\"]');
            if (rect.width > 5 && rect.height > 5 && el.offsetParent !== null && !isAd) {
                const tag = el.tagName.toLowerCase();
                const role = el.getAttribute('role') || '';
                const text = (el.innerText || '').trim().replace(/\\n/g, ' ').slice(0, 60);
                const ariaLabel = el.getAttribute('aria-label') || '';
                const title = el.getAttribute('title') || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const alt = el.getAttribute('alt') || '';
                const name = el.getAttribute('name') || '';
                const id = el.id || '';
                const href = el.getAttribute('href') || '';

                let locator = '';
                if (id) locator = \`#\${id}\`;
                else if (name) locator = \`[name="\\${name}\\"]\`;
                else if (placeholder) locator = \`[placeholder="\\${placeholder}\\"]\`;
                else if (ariaLabel) locator = \`[aria-label="\\${ariaLabel}\\"]\`;
                else if (title) locator = \`[title="\\${title}\\"]\`;
                else if (tag === 'a' && href) locator = \`a[href="\\${href}\\"]\`;
                else if (text) locator = \`text="\\${text}\\"\`;
                else locator = \`:nth-match(\${tag}, \${index + 1})\`;

                let label = '';
                if (tag === 'input' || tag === 'textarea') {
                    label = placeholder || ariaLabel || title || name || id || el.getAttribute('type') || 'Giriş Alanı';
                    label = \`[Giriş Kutusu] \${label}\`;
                } else if (tag === 'button' || role === 'button' || el.getAttribute('onclick')) {
                    label = text || ariaLabel || title || id || name || 'Buton';
                    label = \`[Buton] \${label}\`;
                } else if (tag === 'a' || role === 'link') {
                    label = text || ariaLabel || title || href || 'Link';
                    label = \`[Link] \${label}\`;
                } else if (tag === 'select') {
                    label = title || name || id || 'Açılır Menü';
                    label = \`[Seçim Kutusu] \${label}\`;
                } else {
                    label = title || ariaLabel || placeholder || text || alt || id || name || \`\${tag}\`;
                    label = \`[Element] \${label}\`;
                }

                label = label.slice(0, 80).replace(/\\n/g, ' ').trim();
                if (locator && !kvMap[label]) {
                    kvMap[label] = locator;
                }
            }
        });

        return kvMap;
    });

    console.log(\`📌 Sayfa tarandı. Bulunan locator sayısı: \${Object.keys(domMap).length}\`);
    return domMap;
}

async function ensureVisible(activePage: Page, selector: string): Promise<Locator> {
    let loc = activePage.locator(selector);
    let count = await loc.count();
    if (count === 0) {
        console.log(\`🔎 Locator bulunamadı. Sayfa yeniden taranıyor: \${selector}\`);
        await scanCurrentPage(activePage);
        loc = activePage.locator(selector);
        count = await loc.count();
    }
    if (count === 0) throw new Error('Locator bulunamadı: ' + selector);

    for (let i = 0; i < count; i++) {
        const item = loc.nth(i);
        if (await item.isVisible()) {
            await expect(item).toBeVisible({ timeout: 10000 });
            await expect(item).toBeEnabled({ timeout: 10000 });
            return item;
        }
    }
    throw new Error('Görünür eleman bulunamadı: ' + selector);
}

async function safeClick(activePage: Page, selector: string) {
    const item = await ensureVisible(activePage, selector);
    await item.click({ force: true, timeout: 5000 });
    try { await activePage.waitForLoadState('networkidle', { timeout: 5000 }); } catch (e) { }
}

async function safeFill(activePage: Page, selector: string, value: string) {
    const item = await ensureVisible(activePage, selector);
    await item.fill(value, { force: true, timeout: 5000 });
    const tagName = await item.evaluate(el => el.tagName.toLowerCase());
    if (['input', 'textarea', 'select'].includes(tagName)) {
        await expect(item).toHaveValue(value, { timeout: 5000 });
    }
}

async function safeSelect(activePage: Page, selector: string, value: string) {
    const item = await ensureVisible(activePage, selector);
    await item.selectOption({ label: value, timeout: 5000 }).catch(async () => {
        await item.selectOption({ value, timeout: 5000 });
    });
    await expect(item).toHaveValue(value, { timeout: 5000 });
}

async function safePress(activePage: Page, key: string) {
    await activePage.keyboard.press(key);
    await activePage.waitForTimeout(1000);
}

// Reklam engelleyici - tüm testlerde kullanılır
function setupAdBlocker(context: any) {
    return context.route('**/*', route => {
        const blocked = ['googleads', 'doubleclick', 'adservice', 'pubmatic', 'criteo', 'taboola', 'analytics'];
        if (blocked.some(domain => route.request().url().includes(domain))) route.abort();
        else route.continue();
    });
}
\n`;
    
    // 3. AŞAMA: Senaryoların Dinamik Olarak Yazdırılması
    tsCode += `test.describe.serial('AI Otonom Senaryo Seti', () => {\n`;
    
    scenarios.forEach((scenario, index) => {
        tsCode += `  test('Test ${index + 1}: ${scenario.title || 'Otonom Senaryo'}', async ({ context, page }) => {\n`;
        tsCode += `    setupAdBlocker(context);\n\n`;
        tsCode += `    let activePage: Page = page;\n`;
        tsCode += `    context.on('page', async newPage => {\n`;
        tsCode += `      await newPage.waitForLoadState();\n`;
        tsCode += `      activePage = newPage;\n`;
        tsCode += `      await scanCurrentPage(activePage);\n`;
        tsCode += `    });\n\n`;
        tsCode += `    await activePage.goto('${url}');\n`;
        tsCode += `    await activePage.waitForLoadState('domcontentloaded');\n`;
        tsCode += `    await scanCurrentPage(activePage);\n\n`;

        scenario.steps.forEach((step, stepIndex) => {
            tsCode += `    // Step ${stepIndex + 1}: ${step.action}\n`;
            let safeLocator = step.locator ? JSON.stringify(step.locator) : '"body"'; 
            
            if (step.action === 'click') {
                tsCode += `    await safeClick(activePage, ${safeLocator});\n    await activePage.waitForTimeout(2000);\n    await scanCurrentPage(activePage);\n`;
            } else if (step.action === 'fill') {
                let safeValue = (step.value === 'RANDOM_EMAIL') ? `('test_' + Date.now() + '@mail.com')` : JSON.stringify(step.value);
                tsCode += `    await safeFill(activePage, ${safeLocator}, ${safeValue});\n    await activePage.waitForTimeout(500);\n    await scanCurrentPage(activePage);\n`;
            } else if (step.action === 'press') {
                tsCode += `    await safePress(activePage, ${JSON.stringify(step.value || 'Enter')});\n    await scanCurrentPage(activePage);\n`;
            } else if (step.action === 'select') {
                tsCode += `    await safeSelect(activePage, ${safeLocator}, ${JSON.stringify(step.value)});\n    await activePage.waitForTimeout(500);\n    await scanCurrentPage(activePage);\n`;
            }
            tsCode += `\n`;
        });

        tsCode += `  });\n\n`;
    });

    tsCode += `});\n`;
    
    fs.writeFileSync(testFilePath, tsCode);
    logSuccess('📂 [4/5]', `Dinamik Playwright betiği (.ts) oluşturuldu. Toplam ${scenarios.length} senaryo.`);
}

module.exports = { compilePlaywrightCode };