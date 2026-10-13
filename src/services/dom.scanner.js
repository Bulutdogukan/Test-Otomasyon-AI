// Canlı sayfadan etkileşilebilir eleman haritası çıkarır: { etiket -> locator }.
// ------------------------------------------------------------------
// - Ana sayfanın yanında TÜM iframe'ler taranır (ödeme formları, eski kurumsal
//   portallar). iframe içindeki elemanların locator'ı " |> " çerçeve zinciri
//   taşır (bkz. src/utils/locator.js).
// - Açık (open) shadow DOM köklerine inilir (web component tabanlı arayüzler).
//   Playwright CSS motoru shadow DOM'u kendiliğinden deldiği için locator'a ek
//   bir şey gerekmez.
// - Locator önceliği kararlılığa göredir: test id'leri > kararlı id > name >
//   aria-label > placeholder > title > href > metin. Framework'lerin ürettiği
//   dinamik id'ler (ember123, ctl00_..., :r1:, j_idt12) yalnızca son çare olur.

const { joinFrameChain } = require('../utils/locator');

// Aynı etiketi taşıyan farklı elemanlardan (örn. 6 adet "Sepete Ekle") en
// fazla bu kadarı "#2", "#3" ekiyle ayrı ayrı listelenir.
const MAX_DUPLICATE_LABELS = 6;

// ⚠️ Bu fonksiyon TARAYICI İÇİNDE çalışır (frame.evaluate). Dışarıdaki hiçbir
// değişkene/yardımcıya erişemez; her şey kendi içinde tanımlı olmalıdır.
function collectElementsInPage() {
    const SELECTOR = [
        'input', 'button', 'a', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
        '[role="checkbox"]', '[role="radio"]', '[role="option"]', '[role="combobox"]', '[role="switch"]',
        '[onclick]', '[data-test]', '[data-testid]', '[data-qa]', '[data-cy]',
        '[aria-label]', '[placeholder]', '[title]',
        // Doğrulama (assert) hedefleri: başlıklar ve uyarı/hata mesajları.
        'h1', 'h2', 'h3', '[role="heading"]', '[role="alert"]', '[role="status"]'
    ].join(', ');

    // Reklam kapsayıcıları. Kalıplar bilinçli olarak dar tutulur: "[id*=ad]"
    // gibi geniş bir kalıp header/loading/address id'lerini de eliyordu.
    const AD_SELECTOR = '[id^="ad-"], [id^="ad_"], [id*="google_ads"], ins.adsbygoogle, ' +
        '[class*="advert"], [class*="sponsored"], [class*="reklam"], [data-ad-slot]';

    const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-qa', 'data-cy'];

    const quote = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ') + '"';
    const clean = v => String(v || '').trim().replace(/\s+/g, ' ');

    // Framework'lerin her yüklemede değişen otomatik id'leri.
    const isDynamicId = id =>
        /\d{4,}/.test(id) || /^[\d:]/.test(id) || id.includes(':') ||
        /^(ember|ctl\d|j_id|mui-|radix-|headlessui-|react-select-|rc-|downshift-|cdk-|mat-)/i.test(id) ||
        /[0-9a-f]{8}-?[0-9a-f]{4}/i.test(id);

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const isVisible = el => {
        if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false;
        // Kapalı yan menüler / modallar çoğunlukla aria-hidden veya inert ile gizlenir;
        // CSS açısından "görünür" oldukları için ayrıca elenir.
        if (el.closest('[aria-hidden="true"], [inert]')) return false;
        const rect = el.getBoundingClientRect();
        // Yatayda ekran dışına itilmiş (off-canvas) eleman kullanıcıya görünmez.
        // Dikeyde ekran dışı olanlar tutulur: kaydırarak ulaşılabilirler.
        if (rect.right <= 0 || rect.left >= viewportWidth) return false;
        // offsetParent kontrolü position:fixed elemanlarda her zaman null döndüğü için
        // (sabit üst menü, modal butonları) kullanılmıyor.
        return rect.width > 5 && rect.height > 5;
    };

    // Belge + açık shadow root'lar.
    const found = [];
    const seen = new Set();
    (function walk(root) {
        root.querySelectorAll(SELECTOR).forEach(el => {
            if (!seen.has(el)) { seen.add(el); found.push(el); }
        });
        root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot); });
    })(document);

    const items = [];
    for (const el of found) {
        if (!isVisible(el) || el.closest(AD_SELECTOR)) continue;

        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'input' && type === 'hidden') continue;
        const role = el.getAttribute('role') || '';
        const id = el.id || '';
        const name = el.getAttribute('name') || '';
        const ariaLabel = clean(el.getAttribute('aria-label'));
        const placeholder = clean(el.getAttribute('placeholder'));
        const title = clean(el.getAttribute('title'));
        const alt = clean(el.getAttribute('alt'));
        const href = el.getAttribute('href') || '';
        const fullText = tag === 'select' ? '' : clean(el.innerText || el.textContent ||
            (tag === 'input' && ['submit', 'button', 'reset'].includes(type) ? el.value : ''));
        const text = fullText.slice(0, 60);
        const fieldLabel = el.labels && el.labels[0] ? clean(el.labels[0].innerText).slice(0, 60) : '';

        // --- Locator (kararlılık sırasına göre) ---
        let locator = '';
        for (const attr of TEST_ID_ATTRS) {
            const v = el.getAttribute(attr);
            if (v) { locator = `[${attr}=${quote(v)}]`; break; }
        }
        if (!locator && id && !isDynamicId(id)) locator = '#' + CSS.escape(id);
        if (!locator && name) locator = `${tag}[name=${quote(name)}]`;
        if (!locator && ariaLabel) locator = `[aria-label=${quote(ariaLabel)}]`;
        if (!locator && placeholder) locator = `[placeholder=${quote(placeholder)}]`;
        if (!locator && title) locator = `[title=${quote(title)}]`;
        if (!locator && tag === 'a' && href && !/^(javascript:|#$)/i.test(href)) locator = `a[href=${quote(href)}]`;
        if (!locator && text) {
            // 60 karakterde kesilmiş metin TAM eşleşme ile aranırsa hiç bulunamaz;
            // uzun metinlerde "içerir" eşleşmesine geçilir.
            locator = fullText.length > 60 ? `${tag}:has-text(${JSON.stringify(text)})` : `text=${JSON.stringify(text)}`;
        }
        if (!locator && alt) locator = `[alt=${quote(alt)}]`;
        if (!locator && id) locator = '#' + CSS.escape(id); // dinamik de olsa son çare
        if (!locator) {
            const cls = Array.from(el.classList).find(c => !/\d{3,}/.test(c));
            if (cls) locator = `${tag}.${CSS.escape(cls)}`;
        }
        if (!locator) continue; // tanımlanamayan eleman LLM'e verilmez

        // --- İnsan/LLM okunur etiket ---
        let kind = '[Element]';
        let desc = title || ariaLabel || placeholder || text || alt || id || name;
        if (tag === 'input' && type === 'password') {
            kind = '[Şifre Kutusu]';
            desc = fieldLabel || placeholder || ariaLabel || name || id || 'Şifre';
        } else if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
            kind = '[Seçim Kutusu]';
            desc = fieldLabel || ariaLabel || name || id;
        } else if (tag === 'input' && ['submit', 'button', 'reset'].includes(type)) {
            kind = '[Buton]';
            desc = text || ariaLabel || title || id || name;
        } else if (tag === 'input' || tag === 'textarea') {
            kind = '[Giriş Kutusu]';
            desc = fieldLabel || placeholder || ariaLabel || title || name || id || 'Alan';
        } else if (tag === 'select' || role === 'combobox') {
            kind = '[Açılır Liste]';
            const opts = tag === 'select'
                ? Array.from(el.options).slice(0, 8).map(o => clean(o.label || o.text)).filter(Boolean).join(', ')
                : '';
            desc = (fieldLabel || ariaLabel || name || id || 'Liste') + (opts ? ` (seçenekler: ${opts})` : '');
        } else if (tag === 'button' || role === 'button') {
            kind = '[Buton]';
            desc = text || ariaLabel || title || id || name;
        } else if (tag === 'a' || role === 'link') {
            kind = '[Link]';
            desc = text || ariaLabel || title || href;
        } else if (/^h[1-3]$/.test(tag) || role === 'heading') {
            kind = '[Başlık]';
        } else if (role === 'alert' || role === 'status') {
            kind = '[Uyarı]';
        } else if (!el.hasAttribute('onclick') && !/^(tab|menuitem|checkbox|radio|option|switch)$/.test(role)) {
            // aria-label / data-test taşıyan kapsayıcılar (form, div, section...): tıklanacak
            // şey değil, doğrulama hedefi. "[Element] Login" (form) ile "[Buton] Login"
            // küçük modellerde karışıyordu; ayrı etiket bunu önler.
            kind = '[Bölüm]';
        }

        items.push({
            label: `${kind} ${clean(desc)}`.slice(0, 110).trim(),
            locator,
            password: tag === 'input' && type === 'password'
        });
    }
    return items;
}

// iframe elemanı için frameLocator'a verilecek seçici (tarayıcı içinde çalışır).
// Görünmez (izleme/analitik) iframe'ler için null döner ve atlanır.
function iframeSelectorInPage(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return null;
    const tag = el.tagName.toLowerCase();
    const quote = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    if (el.id && !/\d{4,}/.test(el.id) && !el.id.includes(':')) return `${tag}#${CSS.escape(el.id)}`;
    const name = el.getAttribute('name');
    if (name) return `${tag}[name=${quote(name)}]`;
    const title = el.getAttribute('title');
    if (title) return `${tag}[title=${quote(title)}]`;
    const src = el.getAttribute('src');
    if (src && !src.startsWith('data:') && src.length < 200) return `${tag}[src=${quote(src)}]`;
    const all = Array.from(el.ownerDocument.querySelectorAll(tag));
    return `${tag} >> nth=${all.indexOf(el)}`;
}

// Ana sayfadan bu frame'e uzanan seçici zinciri. Görünmez bir halka varsa null.
async function frameChainFor(frame) {
    const chain = [];
    let current = frame;
    while (current.parentFrame()) {
        const handle = await current.frameElement();
        try {
            const sel = await handle.evaluate(iframeSelectorInPage);
            if (!sel) return null;
            chain.unshift(sel);
        } finally {
            await handle.dispose();
        }
        current = current.parentFrame();
    }
    return chain;
}

/**
 * @returns {Promise<{ map: Object<string,string>, passwordLocators: Set<string> }>}
 */
async function scanLivePage(page) {
    const map = {};
    const passwordLocators = new Set();
    const labelCounts = {};

    for (const frame of page.frames()) {
        if (frame.isDetached()) continue;
        let chain;
        let items;
        try {
            chain = await frameChainFor(frame);
            if (chain === null) continue;
            items = await frame.evaluate(collectElementsInPage);
        } catch {
            // Tarama sırasında yeniden yüklenen / kapanan çerçeve: bu turda atlanır.
            continue;
        }
        const frameNote = chain.length ? ` (çerçeve: ${chain[chain.length - 1]})` : '';

        for (const item of items) {
            const locator = joinFrameChain(chain, item.locator);
            let label = item.label + frameNote;
            if (map[label] !== undefined && map[label] !== locator) {
                const n = (labelCounts[label] || 1) + 1;
                labelCounts[label] = n;
                if (n > MAX_DUPLICATE_LABELS) continue;
                label = `${label} #${n}`;
            }
            if (map[label] === undefined) map[label] = locator;
            if (item.password) passwordLocators.add(locator);
        }
    }
    return { map, passwordLocators };
}

module.exports = { scanLivePage };
