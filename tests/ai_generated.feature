Feature: Form Authentikasyonu Testi

Scenario: Kullanıcı Girişi ve Çıkışı
Given Ana sayfada "Form Authentication" linkine tıkladığında
When açılan login sayfasına 'tomsmith' kullanıcı adı ve 'SuperSecretPassword!' şifresini yazıp login butonuna tıkladığında
Then giriş başarılı mesajının göründüğünü doğrulayın
And "Logout" butonuna tıklayarak login sayfasına geri dönün
Then login sayfasının açıldığını doğrulayın