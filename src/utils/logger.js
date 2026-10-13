const { redactSecrets } = require('./secrets');

const colors = {
    reset: "\x1b[0m", bright: "\x1b[1m", green: "\x1b[32m", cyan: "\x1b[36m",
    yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m", vakifSari: "\x1b[38;2;255;204;0m"
};

// Loglar arayüze ve terminale akar; .env'deki QA_SECRET_ değerleri hiçbir log
// satırında düz metin görünmesin diye her mesaj maskelenir.
function logInfo(step, message) { console.log(`${colors.magenta}${step} ${redactSecrets(message)}${colors.reset}`); }
function logSuccess(step, message) { console.log(`${colors.green}${step} ${redactSecrets(message)}${colors.reset}`); }
function logWarning(message) { console.log(`\n${colors.yellow}⚠️ ${redactSecrets(message)}${colors.reset}`); }
function logError(message) { console.error(`\n${colors.red}❌ SİSTEM HATASI: ${redactSecrets(message)}${colors.reset}`); }

module.exports = { colors, logInfo, logSuccess, logWarning, logError };
