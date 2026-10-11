import { test, expect } from '@playwright/test';

// 🌐 Uzak Tarayıcı (Grid) Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Kullanıcı Girişi ve Ürünler Sayfası Doğrulaması
     
     Scenario: Standart Kullanıcı Adı ve Şifre ile Giriş Yap ve Ürünler Sayfasının Açılıp Açılmadığını Doğrula
     Given standart kullanıcı adı ve secret_sauce şifresi ile giriş yapıldığında
     When giriş işlemi başarılı olduğunda
     Then ürünler sayfasının açıldığını doğrulayın
  */

  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {
    await page.goto("https://www.saucedemo.com");

    // Adım 1: [FILL] İşlemi
    await page.locator("#user-name").first().fill("standard_user");
    await page.waitForLoadState('domcontentloaded');

    // Adım 2: [FILL] İşlemi
    await page.locator("#password").first().fill("secret_sauce");
    await page.waitForLoadState('domcontentloaded');

    // Adım 3: [CLICK] İşlemi
    await page.locator("#login-button").first().click();
    await page.waitForLoadState('domcontentloaded');

    // Adım 4: [ASSERT] İşlemi
    await expect(page.locator("#inventory_container").first()).toBeVisible();
    await page.waitForLoadState('domcontentloaded');

  });
});
