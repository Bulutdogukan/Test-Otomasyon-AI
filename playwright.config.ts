import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// .env dosyasındaki değişkenleri projeye dahil eder
dotenv.config();

export default defineConfig({
  // Kullanıcı UI'dan kendi test klasörünü seçebilir; sunucu PW_TEST_DIR env'i ile
  // buraya iletir. Böylece klasör yolu komut satırı argümanına hiç girmez
  // (boşluklu yol / kaçışlama sorunları oluşmaz). Boşsa proje içi ./tests kullanılır.
  testDir: process.env.PW_TEST_DIR || './tests',

  // Kalıcı olarak biriken tests/generated/specs klasöründeki tüm testlerin
  // tek tıkla paralel koşulabilmesi için. PW_WORKERS ile makineye göre
  // (örn. daha güçlü Mac Mini'de yüksek, gündelik makinede düşük) ayarlanabilir.
  fullyParallel: true,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : undefined,

  /* --- EKLENEN KISIM --- */
  timeout: 60000, // Test başına maksimum süre (60 saniye)
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