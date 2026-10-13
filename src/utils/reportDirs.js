const fs = require('fs');
const path = require('path');

// Her koşumdan önce temizlenen rapor klasörleri. Temizlenmezse Allure eski ve
// yeni sonuçları karıştırır.
const REPORT_DIRS = ['allure-results', 'allure-report', 'playwright-report', 'test-results'];

// ⚠️ Klasörün KENDİSİ değil İÇERİĞİ silinir: Docker'da allure-report bir hacim
// (bağlama noktası) olarak bağlanır ve bağlama noktası silinemez (EBUSY). Klasörü
// komple silmek, Docker kurulumunda her koşumu çökertiyordu.
function emptyDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath)) {
        fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
    }
}

function cleanReportDirs(rootDir) {
    REPORT_DIRS.forEach(dir => emptyDir(path.join(rootDir, dir)));
}

module.exports = { cleanReportDirs, emptyDir };
