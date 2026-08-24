Feature: Kullanıcı Girişi ve Ürünler Sayfası Doğrulaması

Scenario: Standard Kullanıcı ile Giriş ve Ürünler Sayfası Doğrulaması
Given standard_user kullanıcı adı ve secret_sauce şifresi ile giriş yap
When login butonuna tıkla
Then ürünler sayfasının (Products başlığı) göründüğünü doğrula