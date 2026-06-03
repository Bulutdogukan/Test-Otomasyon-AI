const colors = {
    reset: "\x1b[0m", bright: "\x1b[1m", green: "\x1b[32m", cyan: "\x1b[36m",
    yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m", vakifSari: "\x1b[38;2;255;204;0m"
};

function logInfo(step, message) { console.log(`${colors.magenta}${step} ${message}${colors.reset}`); }
function logSuccess(step, message) { console.log(`${colors.green}${step} ${message}${colors.reset}`); }
function logWarning(message) { console.log(`\n${colors.yellow}⚠️ ${message}${colors.reset}`); }
function logError(message) { console.error(`\n${colors.red}❌ SİSTEM HATASI: ${message}${colors.reset}`); }

module.exports = { colors, logInfo, logSuccess, logWarning, logError };