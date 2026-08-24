// Adım (step) normalizasyonu ve ortak metin yardımcıları.
// ------------------------------------------------------------------
// Hem keşif (orchestrator) hem derleme (compiler.service) aynı kuralları
// kullanmalı: aksi halde keşifte çalışan bir eylem, derlenen teste hiç
// yazılmayabilir (veya tersi). Tek kaynak burada tutuluyor.

// Regex literaline gömülecek kullanıcı/LLM metnini güvenli hale getirir.
function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Küçük modeller eylem adını "CLICK", "Click", "drag_and_drop", "BİTTİ" gibi
// serbest biçimlerde döndürebiliyor. Karşılaştırmadan önce tek biçime indiriyoruz.
// NFKD + birleşen işaret temizliği, Türkçe "İ" harfinin toLowerCase() sonrası
// bıraktığı U+0307 noktasını da eler.
function canonicalKey(raw) {
    return String(raw)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}

// Desteklenen eylemler ve yaygın eşanlamlıları.
const ACTION_ALIASES = {
    click: 'click',
    tap: 'click',
    fill: 'fill',
    type: 'fill',
    input: 'fill',
    press: 'press',
    key: 'press',
    keypress: 'press',
    select: 'select',
    selectoption: 'select',
    hover: 'hover',
    mouseover: 'hover',
    draganddrop: 'dragAndDrop',
    drag: 'dragAndDrop',
    dragdrop: 'dragAndDrop',
    assert: 'assert',
    verify: 'assert',
    expect: 'assert',
    check: 'assert'
};

// Senaryonun tamamlandığını bildiren kelimeler (TR + EN).
const DONE_KEYS = new Set(['done', 'bitti', 'tamam', 'tamamlandi', 'finish', 'finished', 'complete', 'completed', 'end']);

// Self-Healing ajanının "bu ekranda çare yok" yanıtı.
const GIVEUP_KEYS = new Set(['giveup', 'abort', 'cancel', 'vazgec']);

// Locator gerektirmeyen eylemler (klavye tuşu, URL doğrulaması vb.).
const ACTIONS_WITHOUT_LOCATOR = new Set(['press']);

/**
 * Serbest biçimli LLM eylemini kanonik forma çevirir.
 * @returns {'DONE'|'GIVEUP'|'click'|'fill'|'press'|'select'|'hover'|'dragAndDrop'|'assert'|null}
 */
function normalizeAction(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const key = canonicalKey(raw);
    if (DONE_KEYS.has(key)) return 'DONE';
    if (GIVEUP_KEYS.has(key)) return 'GIVEUP';
    return ACTION_ALIASES[key] || null;
}

// Desteklenen assertion tipleri; tanınmayan tip 'visible'a düşer.
const ASSERT_TYPES = new Set(['visible', 'text', 'value', 'url']);

function normalizeAssertType(raw) {
    if (typeof raw !== 'string') return 'visible';
    const key = canonicalKey(raw);
    return ASSERT_TYPES.has(key) ? key : 'visible';
}

/**
 * ⚠️ Boş "expected" ile üretilen doğrulamalar SESSİZ YANLIŞ-POZİTİFTİR:
 *  - url    -> new RegExp('') her URL ile eşleşir
 *  - text   -> toContainText('') her metinle eşleşir
 *  - value  -> toHaveValue('') sadece boş input ile eşleşir (yanlış geçme/kalma)
 * Bu yüzden beklenen değer gerektiren tipler değer olmadan teste yazılmaz.
 * @returns {string|null} sorun varsa açıklama, yoksa null
 */
function validateAssert(assertType, expected, locator) {
    const needsExpected = assertType === 'url' || assertType === 'text' || assertType === 'value';
    if (needsExpected && (expected == null || String(expected).trim() === '')) {
        return `"${assertType}" doğrulaması beklenen bir değer gerektirir ama boş geldi`;
    }
    if (assertType !== 'url' && (locator == null || String(locator).trim() === '')) {
        return `"${assertType}" doğrulaması bir locator gerektirir ama boş geldi`;
    }
    return null;
}

module.exports = {
    escapeRegExp,
    normalizeAction,
    normalizeAssertType,
    validateAssert,
    ACTIONS_WITHOUT_LOCATOR
};
