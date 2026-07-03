import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// .env dosyasındaki değişkenleri projeye dahil eder
dotenv.config();

export default defineConfig({
  testDir: './tests', //
  
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
    trace: 'retain-on-failure', // Ölçeklenmede 'on' ağır disk/performans yükü yaratır
    // AI-Agent'tan gelen E/H komutlarını doğrudan Playwright'a bağlıyoruz
    video: (process.env.SAVE_VIDEO as any) || 'off',
    screenshot: (process.env.SAVE_SCREENSHOT as any) || 'only-on-failure',
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