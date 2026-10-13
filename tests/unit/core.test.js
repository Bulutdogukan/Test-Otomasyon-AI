// Ollama ve tarayıcı gerektirmeyen saf mantık testleri (npm run test:unit).
// CI her push'ta bunları koşar; yerleşik kuralların (CLAUDE.md) bozulmasını yakalar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { sanitizeTargetUrl } = require('../../src/utils/url');
const { splitFrameChain, locatorExpression } = require('../../src/utils/locator');
const secrets = require('../../src/utils/secrets');
const { normalizeAction, normalizeAssertType, validateAssert } = require('../../src/utils/steps');
const { selectRelevantElements } = require('../../src/services/dom.ranker');

// ---------------------------------------------------------------- URL
test('url: iç ağ adresleri varsayılan olarak serbest', () => {
    assert.equal(sanitizeTargetUrl('http://localhost:8080/app', {}), 'http://localhost:8080/app');
    assert.equal(sanitizeTargetUrl('10.1.2.3/giris', {}), 'https://10.1.2.3/giris');
});

test('url: QA_BLOCK_PRIVATE_URLS=true iç ağı engeller', () => {
    const env = { QA_BLOCK_PRIVATE_URLS: 'true' };
    assert.throws(() => sanitizeTargetUrl('http://192.168.1.10', env), /İç ağ/);
    assert.equal(sanitizeTargetUrl('https://www.saucedemo.com', env), 'https://www.saucedemo.com/');
});

test('url: tehlikeli şemalar her zaman reddedilir', () => {
    assert.throws(() => sanitizeTargetUrl('file:///etc/passwd', {}), /http\/https/);
    assert.throws(() => sanitizeTargetUrl('javascript://alert(1)', {}), /http\/https/);
    assert.throws(() => sanitizeTargetUrl('', {}), /boş/);
});

test('url: QA_ALLOWED_HOSTS joker karakterli izin listesi', () => {
    const env = { QA_ALLOWED_HOSTS: '*.kurum.local, ornek.com' };
    assert.ok(sanitizeTargetUrl('https://test.kurum.local', env));
    assert.ok(sanitizeTargetUrl('https://kurum.local', env));
    assert.ok(sanitizeTargetUrl('https://ornek.com', env));
    assert.throws(() => sanitizeTargetUrl('https://kotukurum.local', env), /izin listesinde/);
});

// ---------------------------------------------------------------- iframe locator
test('locator: çerçeve zinciri ayrıştırılır ve koda dökülür', () => {
    assert.deepEqual(splitFrameChain('#user'), { frames: [], selector: '#user' });
    assert.deepEqual(splitFrameChain('iframe#a |> iframe[name="b"] |> #x'),
        { frames: ['iframe#a', 'iframe[name="b"]'], selector: '#x' });
    assert.equal(locatorExpression('iframe#odeme |> #kart'),
        'page.frameLocator("iframe#odeme").locator("#kart")');
});

test('locator: LLM kaynaklı locator kod enjekte edemez', () => {
    const expr = locatorExpression('#a"); process.exit(1); ("');
    assert.equal(expr, 'page.locator("#a\\"); process.exit(1); (\\"")');
});

// ---------------------------------------------------------------- gizli veriler
const ENV = { QA_SECRET_PASSWORD: 'S3cret!Pass', QA_SECRET_PIN: '12', OTHER: 'x' };

test('secrets: yer tutucu çözülür, tanımsızsa açık hata verir', () => {
    assert.equal(secrets.resolveSecretValue('{{QA_SECRET_PASSWORD}}', ENV), 'S3cret!Pass');
    assert.equal(secrets.resolveSecretValue('düz değer', ENV), 'düz değer');
    assert.throws(() => secrets.resolveSecretValue('{{QA_SECRET_YOK}}', ENV), /tanımlı değil/);
});

test('secrets: düz yazılmış gizli değer yer tutucuya çevrilir, kısa değerlere dokunulmaz', () => {
    assert.equal(secrets.toStoredValue('S3cret!Pass', ENV), '{{QA_SECRET_PASSWORD}}');
    assert.equal(secrets.toStoredValue('12', ENV), '12');
    assert.equal(secrets.redactSecrets('şifre S3cret!Pass ile gir', ENV), 'şifre {{QA_SECRET_PASSWORD}} ile gir');
});

// ---------------------------------------------------------------- adım kuralları
test('steps: eylem normalizasyonu (Türkçe İ dahil)', () => {
    assert.equal(normalizeAction('CLICK'), 'click');
    assert.equal(normalizeAction('drag_and_drop'), 'dragAndDrop');
    assert.equal(normalizeAction('BİTTİ'), 'DONE');
    assert.equal(normalizeAction('uçur'), null);
    assert.equal(normalizeAssertType('URL'), 'url');
});

test('steps: boş beklenen değerli doğrulama reddedilir', () => {
    assert.ok(validateAssert('url', '', null));
    assert.ok(validateAssert('text', '   ', '#x'));
    assert.equal(validateAssert('visible', undefined, '#x'), null);
});

// ---------------------------------------------------------------- açık beklentiler
test('beklenti: tırnaklı metinler çıkarılır, Türkçe ek kesmeleri karışmaz', () => {
    const { extractQuotedExpectations } = require('../../src/core/orchestrator');
    assert.deepEqual(
        extractQuotedExpectations("Ali'nin sepetine 'Çanta' ekle ve \"Sepette 1 ürün\" yazısını Ankara'dan doğrula"),
        ['Çanta', 'Sepette 1 ürün']);
});

test('beklenti: doğrulanmamış açık beklenti tespit edilir', () => {
    const { missingExpectations } = require('../../src/core/orchestrator');
    const q = ['Hoş geldiniz, veli', 'standard_user'];
    // Model ekranda gördüğünü doğruladı ama kullanıcının beklediğini değil:
    assert.deepEqual(missingExpectations(q, [
        { action: 'fill', value: 'standard_user' },
        { action: 'assert', expected: 'Hoş geldiniz, ali' }
    ]), ['Hoş geldiniz, veli']);
    assert.deepEqual(missingExpectations(q, [
        { action: 'fill', value: 'standard_user' },
        { action: 'assert', expected: 'hoş geldiniz, VELİ' }
    ]), []);
});

// ---------------------------------------------------------------- DOM kırpma
test('ranker: sınır altında dokunmaz, üstünde alakalı elemanları tutar', () => {
    const small = { '[Buton] Giriş': '#login' };
    assert.equal(selectRelevantElements(small, 'giriş', [], 5), small);

    const big = {};
    for (let i = 0; i < 50; i++) big[`[Link] Kategori ${i}`] = `#k${i}`;
    big['[Şifre Kutusu] Parola'] = '#pass';
    const out = selectRelevantElements(big, 'parola ile giriş yap', [], 10);
    assert.equal(Object.keys(out).length, 10);
    assert.equal(out['[Şifre Kutusu] Parola'], '#pass');
});

// ---------------------------------------------------------------- derleyici
test('compiler: iframe, gizli değer ve RANDOM_EMAIL doğru koda dökülür', () => {
    process.env.QA_SECRET_UNITTEST = 'CokGizli123';
    const { compilePlaywrightCode } = require('../../src/services/compiler.service');
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-unit-')), 'x.spec.ts');
    const plan = 'Feature: Ödeme */ kaçış\n  Scenario: Kartla öde\n    Then onay görünür';
    const { assertCount } = compilePlaywrightCode([
        { action: 'fill', locator: '#email', value: 'RANDOM_EMAIL' },
        { action: 'fill', locator: '#pass', value: 'CokGizli123' },
        { action: 'click', locator: 'iframe#odeme |> button[name="ode"]' },
        { action: 'assert', assertType: 'text', locator: 'h1', expected: 'Onaylandı' }
    ], 'https://ornek.com', plan, out);
    const code = fs.readFileSync(out, 'utf8');
    delete process.env.QA_SECRET_UNITTEST;

    assert.equal(assertCount, 1);
    assert.ok(!code.includes('CokGizli123'), 'gizli değer spec içine düz yazılmamalı');
    assert.match(code, /secret\("QA_SECRET_UNITTEST"\)/);
    assert.match(code, /function secret\(name: string\)/);
    assert.match(code, /fill\(`test_\$\{Date\.now\(\)\}@mail\.com`\)/);
    assert.match(code, /page\.frameLocator\("iframe#odeme"\)\.locator\("button\[name=\\"ode\\"\]"\)/);
    // Başlık bir string literal'dır ("*/" orada zararsız); blok yorumdaki plan ise zararsızlaştırılır.
    assert.match(code, /test\.describe\("Ödeme \*\/ kaçış"/);
    assert.match(code, /Feature: Ödeme \*∕ kaçış/);
    assert.match(code, /test\("Kartla öde"/);
    assert.ok(!code.includes('force: true'));
});

test('compiler: doğrulamasız adım listesi bilinçli olarak kırmızı test üretir', () => {
    const { compilePlaywrightCode } = require('../../src/services/compiler.service');
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-unit-')), 'y.spec.ts');
    compilePlaywrightCode([{ action: 'click', locator: '#a' }], 'https://ornek.com', 'Feature: X', out);
    assert.match(fs.readFileSync(out, 'utf8'), /throw new Error\('Bu test hiçbir doğrulama/);
});
