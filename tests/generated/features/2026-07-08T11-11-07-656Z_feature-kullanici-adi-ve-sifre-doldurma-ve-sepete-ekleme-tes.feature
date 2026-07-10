Feature: Kullanıcı Adı ve Şifre Doldurma ve Sepete Ekleme Testi

Scenario: Kullanıcı adı ve şifre kısımlarını doldurup, 2. ürünü sepete ekleyip testi tamamla

Given kullanıcı web sitesine giriş yapar
When kullanıcı "kullanıcı adı" ve "şifre" alanlarını doldurur
And kullanıcı "Giriş Yap" butonuna tıklar
Then kullanıcı ana sayfaya yönlendirildiği doğrulanır
And kullanıcı 2. ürünü sepete ekler
Then sepete eklendiği doğrulanır
And kullanıcı testi tamamladığını gösterir