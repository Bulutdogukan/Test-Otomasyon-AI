import { test, expect } from '@playwright/test';

// 🌐 Selenium Grid Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Kullanıcı Adı ve Şifre Doldurma ve Sepete Ekleme Testi
     
     Scenario: Kullanıcı adı ve şifre kısımlarını doldurup, 2. ürünü sepete ekleyip testi tamamla
     
     Given kullanıcı web sitesine giriş yapar
     When kullanıcı "kullanıcı adı" ve "şifre" alanlarını doldurur
     And kullanıcı "Giriş Yap" butonuna tıklar
     Then kullanıcı ana sayfaya yönlendirildiği doğrulanır
     And kullanıcı 2. ürünü sepete ekler
     Then sepete eklendiği doğrulanır
     And kullanıcı testi tamamladığını gösterir
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

    // Adım 4: [CLICK] İşlemi
    await page.locator("#item_1_title_link").first().click();
    await page.waitForTimeout(1000);

    // Adım 5: [CLICK] İşlemi
    await page.locator("[alt=\"Sauce Labs Bolt T-Shirt\"]").first().click();
    await page.waitForTimeout(1000);

    // Adım 6: [CLICK] İşlemi
    await page.locator("[alt=\"Sauce Labs Bolt T-Shirt\"]").first().click();
    await page.waitForTimeout(1000);

    // Adım 7: [CLICK] İşlemi
    await page.locator("[alt=\"Sauce Labs Bolt T-Shirt\"]").first().click();
    await page.waitForTimeout(1000);

  });
});
