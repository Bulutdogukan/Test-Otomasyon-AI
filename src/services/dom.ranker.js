// FAZ 2 — DOM Chunking / Alaka Sıralaması
// ------------------------------------------------------------------
// LLM'e gönderilecek element sözlüğünü (label -> locator), token patlamasını
// önlemek için hedefe (test planı + son adımlar) göre EN ALAKALI N eleman ile
// sınırlar. Bağımlılıksız ve deterministik bir "fakir adamın RAG'ı":
// embedding yerine anahtar-kelime örtüşmesi + element tipi ağırlığı kullanır.
// (İleride nomic-embed-text ile gerçek embedding tabanlı retrieval'a yükseltilebilir.)

// BDD/Gherkin gürültü kelimeleri ve yaygın TR/EN dolgu kelimeleri elenir.
const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'feature', 'scenario',
    'given', 'when', 'then', 'should', 'must', 'page', 'user',
    'ile', 've', 'bir', 'için', 'olan', ' then', 'veya', 'gibi', 'daha'
]);

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// Etkileşim olasılığı yüksek elemanlar (input/buton) düşük alaka skorunda bile
// elenmesin diye küçük bir taban ağırlık alır.
// Etiket önekleri src/services/dom.scanner.js ile aynıdır.
const TYPE_BONUS = {
    '[Giriş Kutusu]': 3, '[Şifre Kutusu]': 3, '[Açılır Liste]': 3,
    '[Buton]': 2, '[Seçim Kutusu]': 2,
    '[Link]': 1, '[Başlık]': 1, '[Uyarı]': 1
};

function typeBonus(label) {
    const prefix = label.slice(0, label.indexOf(']') + 1);
    return TYPE_BONUS[prefix] || 0;
}

/**
 * @param {Object} kvMap         scanLivePage çıktısı: { label: cssLocator }
 * @param {string} contextText   test planı (hedef bağlamı)
 * @param {Array}  stepHistory   şimdiye kadarki adımlar (yakın bağlam)
 * @param {number} maxElements   LLM'e gönderilecek azami eleman sayısı
 * @returns {Object} kırpılmış kvMap (özgün DOM sırasını korur)
 */
function selectRelevantElements(kvMap, contextText, stepHistory = [], maxElements = 60) {
    const entries = Object.entries(kvMap || {});
    // Zaten sınır altındaysa dokunma — gereksiz iş yapma.
    if (entries.length <= maxElements) return kvMap || {};

    const historyText = (stepHistory || [])
        .slice(-3)
        .map(s => `${s.locator || ''} ${s.value || ''} ${s.expected || ''}`)
        .join(' ');
    const contextTokens = new Set([...tokenize(contextText), ...tokenize(historyText)]);

    const scored = entries.map(([label, locator], idx) => {
        const labelTokens = tokenize(label);
        let overlap = 0;
        for (const t of labelTokens) if (contextTokens.has(t)) overlap += 1;
        // Anahtar-kelime örtüşmesi baskın sinyal; tip ağırlığı eşitlik bozucu.
        const score = overlap * 5 + typeBonus(label);
        return { label, locator, score, idx };
    });

    // Skora göre azalan; eşitlikte özgün sırayı koru (kararlı/deterministik).
    scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

    const top = scored.slice(0, maxElements);
    // LLM'in ekranı okuması doğal kalsın diye özgün DOM sırasına geri döndür.
    top.sort((a, b) => a.idx - b.idx);

    const trimmed = {};
    for (const e of top) trimmed[e.label] = e.locator;
    return trimmed;
}

module.exports = { selectRelevantElements };
