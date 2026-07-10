const fs = require('fs');
const path = require('path');

// Kullanıcının seçtiği klasör proje DIŞINDA olabilir. Spec'ler doğrudan oradan
// koşulursa Node, @playwright/test'i o klasörün üst dizinlerindeki rastgele bir
// node_modules'ten çözebilir (iki farklı Playwright kopyası -> "No tests found").
// Çözüm: koşumdan önce spec'ler proje içindeki bu hazırlık klasörüne kopyalanır;
// modül çözümlemesi böylece HER ZAMAN projenin node_modules'üne gider ve
// kullanıcının klasörüne hiçbir dosya yazılmaz.
const PROJECT_ROOT = path.join(__dirname, '../../');
const STAGING_DIR = path.join(PROJECT_ROOT, '.batch-staging');

function clearStaging() {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    fs.mkdirSync(STAGING_DIR, { recursive: true });
}

// Tek bir spec dosyasını koşum için hazırlar (AI üretim akışının 4. fazı).
function stageSpecFile(absSpecPath) {
    clearStaging();
    fs.copyFileSync(absSpecPath, path.join(STAGING_DIR, path.basename(absSpecPath)));
    return STAGING_DIR;
}

// Seçilen klasördeki TÜM test dosyalarını (alt klasör yapısını koruyarak) hazırlar.
// node_modules ve gizli klasörler atlanır. Kopyalanan dosya sayısını döndürür.
function stageSpecTree(rootDir) {
    clearStaging();
    let count = 0;
    (function walk(dir, rel) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                walk(full, path.join(rel, e.name));
            } else if (/\.(spec|test)\.(ts|js|mjs)$/i.test(e.name)) {
                const destDir = path.join(STAGING_DIR, rel);
                fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(full, path.join(destDir, e.name));
                count++;
            }
        }
    })(rootDir, '');
    return { stagingDir: STAGING_DIR, count };
}

module.exports = { stageSpecFile, stageSpecTree };
