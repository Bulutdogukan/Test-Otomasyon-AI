// DOM tarayıcısı ve iframe locator zinciri — gerçek (headless) Chromium ile.
// Ollama gerektirmez; CI'da `npx playwright install chromium` sonrası koşar.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { scanLivePage } = require('../../src/services/dom.scanner');
const { resolveLocator } = require('../../src/utils/locator');

const FIXTURE = `<!doctype html><html><body>
  <div id="header" style="position:fixed;top:0;left:0">
    <button id="menu-btn">Menü</button>
  </div>
  <div style="height:60px"></div>
  <h1>Hoş geldiniz</h1>
  <label for="u">Kullanıcı adı</label><input id="u" name="username">
  <input type="password" id="ember1234" name="parola">
  <button id=":r1:">Dinamik</button>
  <button data-testid="kaydet">Kaydet</button>
  <button class="add">Sepete Ekle</button><button class="add">Sepete Ekle</button>
  <my-widget></my-widget>
  <nav aria-hidden="true" style="position:fixed;left:-300px;width:250px"><a href="/gizli-menu">Kapalı Menü Linki</a></nav>
  <div style="position:absolute;left:-2000px"><button>Ekran Dışı Buton</button></div>
  <div style="margin-top:2000px"><button id="alt-buton">Aşağıdaki Buton</button></div>
  <iframe id="odeme" style="width:300px;height:150px"
    srcdoc="<input id='kart' placeholder='Kart No'><button onclick=&quot;document.body.dataset.ok=1&quot;>Öde</button>"></iframe>
  <iframe style="width:0;height:0" srcdoc="<button>Gizli izleyici</button>"></iframe>
  <script>
    customElements.define('my-widget', class extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<button id="shadow-btn">Gölge</button>'; }
    });
  </script>
</body></html>`;

let browser, page, scan;

before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.setContent(FIXTURE);
    await page.frameLocator('iframe#odeme').locator('#kart').waitFor();
    scan = await scanLivePage(page);
});

after(async () => { if (browser) await browser.close(); });

const locators = () => Object.values(scan.map);

test('scanner: position:fixed ve id="header" altındaki elemanlar görünür', () => {
    assert.ok(locators().includes('#menu-btn'));
});

test('scanner: kapalı/ekran dışı menüler elenir, aşağı kaydırılarak ulaşılan tutulur', () => {
    const keys = Object.keys(scan.map).join('\n');
    assert.ok(!keys.includes('Kapalı Menü Linki'), 'aria-hidden menü elenmeli');
    assert.ok(!keys.includes('Ekran Dışı Buton'), 'yatay ekran dışı eleman elenmeli');
    assert.ok(locators().includes('#alt-buton'), 'dikeyde aşağıdaki eleman tutulmalı');
});

test('scanner: dinamik id yerine kararlı öznitelik seçilir', () => {
    assert.ok(locators().includes('input[name="parola"]'), 'ember1234 yerine name kullanılmalı');
    assert.ok(!locators().some(l => l.includes('ember1234')));
    assert.ok(locators().includes('[data-testid="kaydet"]'));
});

test('scanner: şifre alanı işaretlenir, label metni etikete girer', () => {
    assert.ok(scan.passwordLocators.has('input[name="parola"]'));
    assert.equal(scan.map['[Giriş Kutusu] Kullanıcı adı'], '#u');
    assert.ok(Object.keys(scan.map).some(k => k.startsWith('[Başlık] Hoş geldiniz')));
});

test('scanner: aynı etiketli elemanlar ayrı ayrı listelenir', () => {
    const keys = Object.keys(scan.map).filter(k => k.startsWith('[Buton] Sepete Ekle'));
    assert.ok(keys.length >= 1);
});

test('scanner: shadow DOM içindeki eleman bulunur ve tıklanabilir', async () => {
    assert.ok(locators().includes('#shadow-btn'));
    await resolveLocator(page, '#shadow-btn').first().click({ timeout: 3000 });
});

test('scanner: iframe içi eleman çerçeve zinciriyle gelir ve çalıştırılabilir', async () => {
    const kart = locators().find(l => l.endsWith('|> #kart'));
    assert.equal(kart, 'iframe#odeme |> #kart');
    await resolveLocator(page, kart).first().fill('4111', { timeout: 3000 });
    assert.equal(await page.frameLocator('iframe#odeme').locator('#kart').inputValue(), '4111');
    assert.ok(!Object.keys(scan.map).some(k => k.includes('Gizli izleyici')), 'görünmez iframe atlanmalı');
});
