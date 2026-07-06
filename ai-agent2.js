require('dotenv').config();
const { executeAutonomousFlow } = require('./src/core/orchestrator');

const args = process.argv.slice(2);
const useGrid = args.includes('--grid');
const positional = args.filter(a => a !== '--grid');

if (positional.length < 2) {
  console.error('Kullanım: node ai-agent2.js <url> <prompt> [--grid]');
  console.error('Örnek: node ai-agent2.js https://www.example.com "Sayfada arama yap"');
  process.exit(1);
}

const url = positional[0];
const prompt = positional.slice(1).join(' ');

// CLI modunda da Grid desteği: --grid verildiğinde env değişkenleri server.js ile aynı şekilde kurulur.
if (useGrid && process.env.GRID_WS_ENDPOINT) {
  process.env.PW_WS_ENDPOINT = process.env.GRID_WS_ENDPOINT; // Derlenen test (compiler) için
  process.env.GRID_URL = process.env.GRID_WS_ENDPOINT;       // Keşif (orchestrator) için
}

executeAutonomousFlow(url, prompt, useGrid)
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
