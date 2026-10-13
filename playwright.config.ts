import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// .env dosyasındaki değişkenleri projeye dahil eder
dotenv.config();

export default defineConfig({
  // Kullanıcı UI'dan kendi test klasörünü seçebilir; sunucu PW_TEST_DIR env'i ile
  // buraya iletir. Böylece klasör yolu komut satırı argümanına hiç girmez
  // (boşluklu yol / kaçışlama sorunları oluşmaz). Boşsa proje içi ./tests kullanılır.
  testDir: process.env.PW_TEST_DIR || './tests',
  // tests/unit altındaki dosyalar Node'un kendi test koşucusuyla (npm run test:unit) koşar.
  testIgnore: '**/unit/**',

  // Kalıcı olarak biriken tests/generated/specs klasöründeki tüm testlerin
  // tek tıkla paralel koşulabilmesi için. PW_WORKERS ile makineye göre
  // (örn. daha güçlü Mac Mini'de yüksek, gündelik makinede düşük) ayarlanabilir.
  fullyParallel: true,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : undefined,

  /* --- EKLENEN KISIM --- */
  timeout: 60000, // Test başına maksimum süre (60 saniye)
  // Kararsız ağ/ortamlar için yeniden deneme sayısı (varsayılan 0: hata gizlenmesin).
  retries: process.env.PW_RETRIES ? Number(process.env.PW_RETRIES) : 0,
  expect: {
    timeout: 10000, // Assertion beklemeleri için (10 saniye)
  },
  /* --------------------- */

  reporter: [ //
    ['html', { open: 'never' }], //
    ['allure-playwright'] //
  ], 
  use: {
    baseURL: process.env.BASE_URL,
    // SSO / MFA ile korunan uygulamalar: önceden kaydedilmiş oturumla başla
    // (npx playwright codegen --save-storage=auth/oturum.json <adres>).
    ...(process.env.STORAGE_STATE ? { storageState: process.env.STORAGE_STATE } : {}),
    // Kendinden imzalı sertifikalı iç ortamlar için (keşif fazıyla aynı kural).
    ignoreHTTPSErrors: String(process.env.IGNORE_HTTPS_ERRORS || '').toLowerCase() === 'true',
    // ☁️ Grid yönlendirmesi config seviyesinde: PW_WS_ENDPOINT ayarlıysa TÜM testler
    // (elle yazılmış olanlar dahil) uzak tarayıcıdan koşar. AI'ın ürettiği spec'lerdeki
    // test.use bloğu aynı değeri kullandığından çakışma olmaz.
    ...(process.env.PW_WS_ENDPOINT ? { connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } } : {}),
    trace: 'retain-on-failure', // Ölçeklenmede 'on' ağır disk/performans yükü yaratır
    // AI-Agent'tan gelen E/H komutlarını doğrudan Playwright'a bağlıyoruz
    video: (['on', 'off', 'retain-on-failure', 'on-first-retry'].includes(process.env.SAVE_VIDEO || '')
      ? process.env.SAVE_VIDEO as 'on' | 'off' | 'retain-on-failure' | 'on-first-retry'
      : 'off'),
    screenshot: (['on', 'off', 'only-on-failure'].includes(process.env.SAVE_SCREENSHOT || '')
      ? process.env.SAVE_SCREENSHOT as 'on' | 'off' | 'only-on-failure'
      : 'only-on-failure'),
  },

  /* 🌍 KAPSAMLI TEST MATRİSİ */
  projects: [
    // ── MASAÜSTÜ TARAYICILAR ──
    {
      name: 'Chromium',
      // Paketli Chromium — orchestrator keşif motoruyla tutarlı; harici Google Chrome kurulumu gerektirmez.
      use: { ...devices['Desktop Chrome'] },
    },
    /*
    {
      name: 'Mozilla Firefox',
      use: { ...devices['Desktop Firefox'] }, // Gecko motoru
    },
    {
      name: 'Apple Safari',
      use: { ...devices['Desktop Safari'] }, // WebKit motoru
    },
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' }, // Edge motoru
    },

    // ── MOBİL TELEFONLAR ──
    {
      name: 'Mobile Android (Pixel 5)',
      use: { ...devices['Pixel 5'] }, // Dar ekran Chromium testi
    },
    {
      name: 'Mobile iPhone (iPhone 12)',
      use: { ...devices['iPhone 12'] }, // Dar ekran WebKit testi
    },

    // ── TABLETLER ──
    {
      name: 'Tablet iPad Pro 11',
      use: { ...devices['iPad Pro 11'] }, // Geniş dokunmatik ekran testi
    },
    {
      name: 'Tablet Galaxy Tab S4',
      use: { ...devices['Galaxy Tab S4'] }, // Geniş Android tablet testi
    },
    */
  ],
});