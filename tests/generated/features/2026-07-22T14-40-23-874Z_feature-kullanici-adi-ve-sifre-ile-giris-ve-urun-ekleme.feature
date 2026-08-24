Feature: Kullanıcı Adı ve Şifre ile Giriş ve Ürün Ekleme

Scenario: Siteye Giriş Yap ve İlk Ürünü Sepete Ekle
Given kullanıcı sitesine gidildi
When kullanıcı adını ve şifresini doldurdu
And giriş yap butonuna tıklandı
Then giriş yapıldığını doğruladı
And açılan ekranda ilk ürünü seçti
And sepete ekleme butonuna tıklandı
Then ürün sepette olduğunu doğruladı