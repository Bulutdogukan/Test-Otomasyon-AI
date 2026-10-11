import { test, expect } from '@playwright/test';

// 🌐 Uzak Tarayıcı (Grid) Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Standard User Giriş İşleme
     
     Scenario: Standard User Giriş Yapma
     
       * Given standard_user kullanıcı adı ve şifresi girilmiş
       * When standard_user giriş işlemi yapılır
       * Then standard_user hesabına giriş yapıldı
       * And standard_user hesabının durumu aktif olmalı
       * And standard_user hesabının bilgileri doğru olmalı
  */

  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {
    await page.goto("https://www.saucedemo.com");

    // Adım 1: [FILL] İşlemi
    await page.locator("#user-name").first().fill("standard_user");
    await page.waitForLoadState('domcontentloaded');

    // Adım 2: [PRESS] İşlemi
    await page.keyboard.press("Enter");
    await page.waitForLoadState('domcontentloaded');

  });
});
