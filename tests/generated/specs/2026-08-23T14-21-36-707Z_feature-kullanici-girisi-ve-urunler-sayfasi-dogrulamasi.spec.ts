import { test, expect } from '@playwright/test';

// 🌐 Uzak Tarayıcı (Grid) Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Kullanıcı Girişi ve Ürünler Sayfası Doğrulaması
     
     Scenario: Standard Kullanıcı ile Giriş ve Ürünler Sayfası Doğrulaması
     Given standard_user kullanıcı adı ve secret_sauce şifresi ile giriş yap
     When login butonuna tıkla
     Then ürünler sayfasının (Products başlığı) göründüğünü doğrula
  */

  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {
    await page.goto("https://www.saucedemo.com");

    // Adım 1: [FILL] İşlemi
    await page.locator("#user-name").first().fill("standard_user");
    await page.waitForTimeout(1000);

    // Adım 2: [FILL] İşlemi
    await page.locator("#password").first().fill("secret_sauce");
    await page.waitForTimeout(1000);

    // Adım 3: [CLICK] İşlemi
    await page.locator("#login-button").first().click();
    await page.waitForTimeout(1000);

    // Adım 4: [ASSERT] İşlemi
    await expect(page.locator("#inventory_container").first()).toBeVisible();
    await page.waitForTimeout(1000);

  });
});
