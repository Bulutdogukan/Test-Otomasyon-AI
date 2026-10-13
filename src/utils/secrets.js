// Gizli test verileri (şifre, PIN, API anahtarı) yönetimi.
// ------------------------------------------------------------------
// Üretilen spec'ler git'e commit edilir; şifrelerin düz metin olarak oraya
// düşmesi kabul edilemez. Kural:
//   - Gizli değerler .env içinde QA_SECRET_ önekiyle tanımlanır
//     (örn. QA_SECRET_PASSWORD=...).
//   - Senaryoda ve LLM'e giden her yerde yalnızca yer tutucu görünür:
//     {{QA_SECRET_PASSWORD}}
//   - Keşifte yer tutucu gerçek değere SADECE tarayıcıya yazılırken çözülür.
//   - Derlenen spec gerçek değeri değil process.env referansını içerir.
//   - Kullanıcı şifreyi senaryoya düz yazmış olsa bile, değer bir QA_SECRET_
//     değeriyle eşleşiyorsa feature/spec/log çıktılarında yer tutucuya çevrilir.

const SECRET_PREFIX = 'QA_SECRET_';
const PLACEHOLDER_RE = /^\{\{\s*(QA_SECRET_[A-Z0-9_]+)\s*\}\}$/;
// Çok kısa değerler ("a", "123") metinde rastgele geçebilir; maskelenmez.
const MIN_REDACT_LENGTH = 4;

function listSecretNames(env = process.env) {
    return Object.keys(env).filter(k => k.startsWith(SECRET_PREFIX) && env[k]).sort();
}

function placeholderFor(name) {
    return `{{${name}}}`;
}

// "{{QA_SECRET_X}}" -> "QA_SECRET_X", değilse null.
function secretNameFromPlaceholder(value) {
    if (typeof value !== 'string') return null;
    const m = value.trim().match(PLACEHOLDER_RE);
    return m ? m[1] : null;
}

// Değer bir yer tutucuysa VEYA bir gizli değerin kendisiyse ilgili adı döndürür.
function secretNameForValue(value, env = process.env) {
    const fromPlaceholder = secretNameFromPlaceholder(value);
    if (fromPlaceholder) return fromPlaceholder;
    if (typeof value !== 'string' || value.length < MIN_REDACT_LENGTH) return null;
    return listSecretNames(env).find(n => env[n] === value) || null;
}

// Geçmişe/LLM'e/derleyiciye gidecek biçim: gizli ise yer tutucu, değilse aynen.
function toStoredValue(value, env = process.env) {
    const name = secretNameForValue(value, env);
    return name ? placeholderFor(name) : value;
}

// Tarayıcıya yazılacak gerçek değer. Tanımsız gizli değer sessizce boş
// yazılmaz — açık bir hata verilir.
function resolveSecretValue(value, env = process.env) {
    const name = secretNameFromPlaceholder(value);
    if (!name) return value;
    if (env[name] == null || env[name] === '') {
        throw new Error(`${name} .env dosyasında tanımlı değil (senaryo ${placeholderFor(name)} kullanıyor).`);
    }
    return env[name];
}

// Serbest metindeki (Gherkin planı, log satırı) gizli değerleri yer tutucuya çevirir.
function redactSecrets(text, env = process.env) {
    let out = String(text == null ? '' : text);
    for (const name of listSecretNames(env)) {
        const val = env[name];
        if (val.length < MIN_REDACT_LENGTH) continue;
        out = out.split(val).join(placeholderFor(name));
    }
    return out;
}

module.exports = {
    SECRET_PREFIX,
    listSecretNames,
    placeholderFor,
    secretNameFromPlaceholder,
    secretNameForValue,
    toStoredValue,
    resolveSecretValue,
    redactSecrets
};
