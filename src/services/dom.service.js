const { chromium } = require('@playwright/test');
const { logInfo, logSuccess } = require('../utils/logger');

async function discoverAndSaveDOM(url, gridUrl) {
    let browser;
    if (gridUrl) {
        logInfo('☁️ [1/5]', `Uzak Sunucuya (Grid) bağlanılıyor...`);
        browser = await chromium.connect({ wsEndpoint: gridUrl });
    } else {
        logInfo('🔍 [1/5]', `${url} anlamsal (Key-Value) taranıyor...`);
        const isHeadless = process.env.HEADLESS !== 'false';
        browser = await chromium.launch({ headless: isHeadless, args: ['--start-maximized'] });
    }
    
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
        await page.waitForTimeout(1000);

        const scanResults = await page.evaluate(() => {
            const selectors = 'input, button, a, select, textarea, [role="button"], [role="link"], [onclick], [data-test]';
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
                    if (tag === 'input' || tag === 'textarea') {
                        label = placeholder || ariaLabel || title || name || id || el.type || 'Giriş Alanı';
                        label = `[Giriş Kutusu] ${label}`;
                    } else if (tag === 'button' || role === 'button' || el.getAttribute('onclick')) {
                        label = text || ariaLabel || title || id || name || 'Buton';
                        label = `[Buton] ${label}`;
                    } else if (tag === 'a' || role === 'link') {
                        label = text || ariaLabel || title || href || 'Link';
                        label = `[Link] ${label}`;
                    } else if (tag === 'select') {
                        label = title || name || id || 'Açılır Menü';
                        label = `[Seçim Kutusu] ${label}`;
                    } else {
                        label = title || ariaLabel || placeholder || text || alt || id || name || `${tag}`;
                        label = `[Element] ${label}`;
                    }

                    label = label.slice(0, 80).replace(/\n/g, ' ').trim();
                    if (locator && !kvMap[label]) {
                        kvMap[label] = locator;
                    }
                }
            });

            return {
                domList: JSON.stringify(kvMap, null, 2),
                count: Object.keys(kvMap).length
            };
        });

        await browser.close();
        logSuccess('✅ [1/5]', `Key-Value Sözlüğü çıkarıldı! Toplam: ${scanResults.count} benzersiz element.`);
        return scanResults.domList;
    } catch (err) {
        await browser.close();
        throw new Error(`DOM Çekilemedi: ${err.message}`);
    }
}

module.exports = { discoverAndSaveDOM };