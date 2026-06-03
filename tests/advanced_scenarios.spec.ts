import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';

// -------------------------------------------------------------
// SENARYO 1: UÇTAN UCA (E2E) SATIN ALMA AKIŞI
// -------------------------------------------------------------
test('Başarılı E2E Sipariş Tamamlama Akışı', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const inventoryPage = new InventoryPage(page);
  const cartPage = new CartPage(page);
  const checkoutPage = new CheckoutPage(page);

  // 1. Login
  await loginPage.goto();
  await loginPage.login('standard_user', 'secret_sauce');

  // 2. Ürün Seçimi
  await inventoryPage.addFirstItemToCart();
  await inventoryPage.goToCart();

  // 3. Sepet Onayı
  await cartPage.proceedToCheckout();

  // 4. Müşteri Bilgileri ve Ödeme
  await checkoutPage.fillPersonalInfo('John', 'Doe', '34000');
  await checkoutPage.finishOrder();

  // 5. Sipariş Onayı Doğrulaması
  await checkoutPage.verifyOrderSuccess();
});

// -------------------------------------------------------------
// SENARYO 2: VERİ ODAKLI TEST (DATA-DRIVEN TESTING - DDT)
// -------------------------------------------------------------
// Test verilerimizi bir dizi (array) içinde tanımlıyoruz.
const hataliKullanicilar = [
  { 
    username: 'locked_out_user', 
    password: 'secret_sauce', 
    expectedError: 'Epic sadface: Sorry, this user has been locked out.' 
  },
  { 
    username: 'standard_user', 
    password: 'yanlis_sifre', 
    expectedError: 'Epic sadface: Username and password do not match any user in this service' 
  },
  { 
    username: '', 
    password: 'secret_sauce', 
    expectedError: 'Epic sadface: Username is required' 
  }
];

// Döngü kurarak Playwright'a 1 test yazıp 3 farklı senaryo çalıştırtıyoruz!
for (const data of hataliKullanicilar) {
  test(`Negatif Login Testi: Kullanıcı -> ${data.username}`, async ({ page }) => {
    const loginPage = new LoginPage(page);
    
    await loginPage.goto();
    await loginPage.login(data.username, data.password);
    
    // Hata mesajını yakalayıp doğruluyoruz
    const errorMessage = page.locator('[data-test="error"]');
    await expect(errorMessage).toHaveText(data.expectedError);
  });
}