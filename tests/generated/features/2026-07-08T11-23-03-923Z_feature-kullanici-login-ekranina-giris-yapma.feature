Feature: Kullanıcı Login Ekranına Giriş Yapma

Scenario: Admin Kullanıcısı ile Başarıyla Giriş Yapma ve Personal Bölgesine Tıklama

Given kullanıcı açılan sayfada "Sign In" butonuna tıkladığında
When login ekranına giriş yapmak için kullanıcı adı ve şifre kısımlarını "admin" olarak doldurduğunda
And PERSONAL kısmına tıklandığında
Then testi bitirmek için kullanıcı onaylaması beklenir.