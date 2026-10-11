Feature: Standard User Giriş İşleme

Scenario: Standard User Giriş Yapma

  * Given standard_user kullanıcı adı ve şifresi girilmiş
  * When standard_user giriş işlemi yapılır
  * Then standard_user hesabına giriş yapıldı
  * And standard_user hesabının durumu aktif olmalı
  * And standard_user hesabının bilgileri doğru olmalı