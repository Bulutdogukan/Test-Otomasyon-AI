Feature: Kullanıcı oturum açıp Twitter bağlantısını test eder

Scenario: Başarılı kullanıcı giriş ve Twitter bağlantısı
Given kullanıcı adı kutusuna "standard_user" yazar
And şifre kutusuna "secret_sauce" yazar
When login butonuna tıklar
Then sayfadaki Twitter linkine tıklar
And Twitter sayfasına yönlendirildiğini doğrular