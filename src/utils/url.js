// Hedef URL doğrulaması — sunucu (arayüz) ve CLI AYNI kuralları kullanır.
// ------------------------------------------------------------------
// Araç kurumun kendi makinesinde çalışır ve asıl kullanım amacı kurumun iç
// ağdaki test/staging ortamlarını test etmektir. Bu yüzden iç ağ adresleri
// VARSAYILAN olarak SERBESTTİR. Sunucu ağa açılıp paylaşılıyorsa iki
// sıkılaştırma seçeneği vardır:
//   QA_BLOCK_PRIVATE_URLS=true  -> localhost / 10.x / 192.168.x / 172.16-31.x reddedilir
//   QA_ALLOWED_HOSTS=a.com,*.kurum.local -> yalnızca listedeki alan adlarına izin verilir

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

function parseAllowedHosts(raw) {
    return String(raw || '')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);
}

// "*.kurum.local" hem "test.kurum.local" hem "kurum.local" ile eşleşir.
function hostMatches(hostname, pattern) {
    const host = hostname.toLowerCase();
    if (pattern.startsWith('*.')) {
        const base = pattern.slice(2);
        return host === base || host.endsWith('.' + base);
    }
    return host === pattern;
}

/**
 * @param {string} raw  kullanıcının yazdığı adres (şema yoksa https:// eklenir)
 * @param {object} [env] test edilebilirlik için; varsayılan process.env
 * @returns {string} normalize edilmiş URL
 */
function sanitizeTargetUrl(raw, env = process.env) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) throw new Error('Hedef URL boş olamaz.');
    let parsed;
    try {
        parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed);
    } catch {
        throw new Error('Geçersiz URL formatı.');
    }
    // file://, javascript:, data: gibi şemalar tarayıcıya yerel dosya / betik açtırır.
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Yalnızca http/https şemasına izin verilir (alınan: ${parsed.protocol}).`);
    }

    const allowed = parseAllowedHosts(env.QA_ALLOWED_HOSTS);
    if (allowed.length > 0 && !allowed.some(p => hostMatches(parsed.hostname, p))) {
        throw new Error(`Bu alan adı izin listesinde değil: ${parsed.hostname} (QA_ALLOWED_HOSTS).`);
    }

    if (String(env.QA_BLOCK_PRIVATE_URLS || '').toLowerCase() === 'true' && PRIVATE_HOST_RE.test(parsed.hostname)) {
        throw new Error(`İç ağ / loopback adresleri bu kurulumda kapalı (${parsed.hostname}). ` +
            `.env içindeki QA_BLOCK_PRIVATE_URLS ayarına bakın.`);
    }
    return parsed.href;
}

module.exports = { sanitizeTargetUrl, hostMatches };
