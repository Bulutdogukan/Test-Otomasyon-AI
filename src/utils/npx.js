const { spawn } = require('child_process');

// Windows'ta npx bir .cmd dosyasıdır ve yalnızca shell üzerinden başlatılabilir.
// Node 24, "shell: true + argüman dizisi" kullanımını (argümanlar kaçışlanmadan
// birleştirildiği için) DEP0190 ile uyarır. Bu yüzden komut satırı burada TEK
// bir metin olarak, her argüman güvenli biçimde tırnaklanarak kurulur.
// Argümanlar hiçbir zaman kullanıcı girdisi değildir (sabitler + sistemin ürettiği
// dosya adları); yine de beklenmedik karakter içeren argüman reddedilir.
const SAFE_ARG = /^[\w.,=:/\\@+-]+$/;

function quoteArg(arg) {
    const s = String(arg);
    if (!SAFE_ARG.test(s)) throw new Error(`Güvensiz komut argümanı reddedildi: ${s}`);
    return `"${s}"`;
}

function spawnNpx(args, options = {}) {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const command = [npx, ...args.map(quoteArg)].join(' ');
    return spawn(command, { ...options, shell: true });
}

module.exports = { spawnNpx, quoteArg };
