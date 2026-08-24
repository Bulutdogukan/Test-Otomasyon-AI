import { test, expect } from '@playwright/test';

// 🌐 Selenium Grid Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Kullanıcı Girişi Testi
     
     Scenario: Siteye Giriş Yapma ve Test Bitirme
     Given kullanıcı sitesine gidildiğinde
     When kullanıcı adı ve şifresini doğru olarak doldurduğunda
     And giriş yap butonuna tıklandığında
     Then kullanıcı ana sayfaya yönlendirildiğini doğrulayın
     And testin başarıyla bitirdiğini doğrulayın
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
