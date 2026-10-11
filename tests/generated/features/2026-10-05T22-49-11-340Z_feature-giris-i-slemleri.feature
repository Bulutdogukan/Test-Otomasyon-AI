Feature: Giriş İşlemleri

Scenario: Standard User Adı ve Şifreyle Giris

Given kullanıcı adı "standard_user" ve şifre "secret_sauce" bilgileri girilmiş olacak
When giriş butonuna tıklandığında
Then sisteme giriş yapıldı ve kullanıcı sayfasına yönlendirildi
And kullanıcı sayfasında "Addtocart" butonu görüldü