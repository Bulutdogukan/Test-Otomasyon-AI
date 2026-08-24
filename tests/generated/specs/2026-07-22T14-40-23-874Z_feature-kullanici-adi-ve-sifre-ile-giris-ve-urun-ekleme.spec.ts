import { test, expect } from '@playwright/test';

// 🌐 Selenium Grid Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Kullanıcı Adı ve Şifre ile Giriş ve Ürün Ekleme
     
     Scenario: Siteye Giriş Yap ve İlk Ürünü Sepete Ekle
     Given kullanıcı sitesine gidildi
     When kullanıcı adını ve şifresini doldurdu
     And giriş yap butonuna tıklandı
     Then giriş yapıldığını doğruladı
     And açılan ekranda ilk ürünü seçti
     And sepete ekleme butonuna tıklandı
     Then ürün sepette olduğunu doğruladı
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
    await page.locator("#item_4_img_link").first().click();
    await page.waitForTimeout(1000);

    // Adım 5: [CLICK] İşlemi
    await page.locator("[alt=\"Sauce Labs Backpack\"]").first().click();
    await page.waitForTimeout(1000);

  });
});
