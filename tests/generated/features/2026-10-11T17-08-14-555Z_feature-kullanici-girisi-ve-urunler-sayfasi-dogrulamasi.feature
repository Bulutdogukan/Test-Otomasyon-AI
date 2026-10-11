Feature: Kullanıcı Girişi ve Ürünler Sayfası Doğrulaması

Scenario: Standart Kullanıcı Adı ve Şifre ile Giriş Yap ve Ürünler Sayfasının Açılıp Açılmadığını Doğrula
Given standart kullanıcı adı ve secret_sauce şifresi ile giriş yapıldığında
When giriş işlemi başarılı olduğunda
Then ürünler sayfasının açıldığını doğrulayın