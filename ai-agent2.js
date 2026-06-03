require('dotenv').config();
const { executeAutonomousFlow } = require('./src/core/orchestrator');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Kullanım: node ai-agent2.js <url> <prompt>');
  console.error('Örnek: node ai-agent2.js https://www.example.com "Sayfada arama yap"');
  process.exit(1);
}

const url = args[0];
const prompt = args.slice(1).join(' ');

executeAutonomousFlow(url, prompt)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
