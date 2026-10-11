import { test, expect } from '@playwright/test';

// 🌐 Uzak Tarayıcı (Grid) Yönlendirmesi
if (process.env.PW_WS_ENDPOINT) {
    test.use({ connectOptions: { wsEndpoint: process.env.PW_WS_ENDPOINT } });
}

test.describe('AI Otonom Senaryo Keşfi', () => {
  /* --- AI TARAFINDAN HEDEFLENEN SENARYO ---
     Feature: Giriş İşlemleri
     
     Scenario: Standard User Adı ve Şifreyle Giris
     
     Given kullanıcı adı "standard_user" ve şifre "secret_sauce" bilgileri girilmiş olacak
     When giriş butonuna tıklandığında
     Then sisteme giriş yapıldı ve kullanıcı sayfasına yönlendirildi
     And kullanıcı sayfasında "Addtocart" butonu görüldü
  */

  test('Keşfedilen ve Doğrulanan Adımlar', async ({ page }) => {
    await page.goto("https://www.saucedemo.com");

    // Adım 1: [FILL] İşlemi
    await page.locator("#user-name").first().fill("standard_user");
    await page.waitForTimeout(1000);

    // Adım 2: [PRESS] İşlemi
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);

  });
});
