require('dotenv').config();

// Sunucu tarafıyla aynı ön koşul kontrolü: eksik yapılandırmada anlaşılmaz bir
// bağlantı hatası yerine net bir mesajla çıkılır.
if (!process.env.OLLAMA_URL || !process.env.OLLAMA_MODEL) {
  console.error('❌ HATA: .env dosyasında OLLAMA_URL ve OLLAMA_MODEL tanımlanması gerekli!');
  console.error('   .env.example dosyasını .env olarak kopyalayıp doldurabilirsiniz.');
  process.exit(1);
}

const { executeAutonomousFlow } = require('./src/core/orchestrator');

const args = process.argv.slice(2);
const useGrid = args.includes('--grid');
const wantsHelp = args.includes('--help') || args.includes('-h');
const positional = args.filter(a => !a.startsWith('-'));

function printUsage(stream = console.error) {
  stream('Kullanım: node ai-agent2.js <url> <senaryo> [--grid]');
  stream('');
  stream('  <url>      Hedef sayfa adresi (zorunlu). Şema yazılmazsa https:// eklenir.');
  stream('  <senaryo>  Doğal dil veya Gherkin senaryo metni (zorunlu).');
  stream('  --grid     .env içindeki GRID_WS_ENDPOINT üzerinden uzak tarayıcıda koşar.');
  stream('');
  stream('Örnek: node ai-agent2.js https://www.saucedemo.com "standard_user ile giriş yap ve ilk ürünü sepete ekle"');
}

if (wantsHelp) {
  printUsage(console.log);
  process.exit(0);
}

if (positional.length < 2) {
  console.error('❌ Eksik argüman: hem hedef URL hem senaryo metni verilmelidir.\n');
  printUsage();
  process.exit(1);
}

const url = positional[0];
const prompt = positional.slice(1).join(' ');

// CLI modunda da Grid desteği: --grid verildiğinde derlenen Playwright testinin
// okuduğu PW_WS_ENDPOINT kurulur. (Keşif fazı doğrudan GRID_WS_ENDPOINT'e bakar.)
const gridActive = useGrid && !!process.env.GRID_WS_ENDPOINT;
if (gridActive) {
  process.env.PW_WS_ENDPOINT = process.env.GRID_WS_ENDPOINT;
} else {
  delete process.env.PW_WS_ENDPOINT;
  if (useGrid) {
    console.warn('⚠️ --grid verildi ama .env içinde GRID_WS_ENDPOINT tanımlı değil; lokal tarayıcı kullanılacak.');
  }
}

executeAutonomousFlow(url, prompt, gridActive)
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((err) => {
    console.error(`\n❌ AKIŞ DURDURULDU: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
