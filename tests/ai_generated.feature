Feature: Akakce Ürün Arama ve İnceleme Fonksiyonları

  Background:
    Given kullanıcının ana sayfada olduğundan emin olun

  Scenario: Kullanıcı arama kutusunu kullanarak spesifik bir ürünü arayabilmeli
    When kullanıcı arama kutusuna "iPhone 15" yazar
    And kullanıcı "Ara" butonuna tıklar
    Then arama sonuçlarında listelenen ürünlerin başlıklarında "iPhone 15" kelimesinin geçtiği doğrulanmalıdır
    And sayfanın "iPhone 15 Fiyatları" başlığını içerdiği görülmelidir

  Scenario: Kullanıcı geçersiz bir kelime arattığında sonuç bulunamadığını görmeli
    When kullanıcı arama kutusuna "xyzabctest123999" yazar
    And kullanıcı "Ara" butonuna tıklar
    Then sayfada "aradığınız kriterlere uygun ürün bulunamadı" veya benzeri bir uyarı mesajı görülmelidir

  Scenario: Kullanıcı kategori menüsünden seçim yaparak ilerleyebilmeli
    When kullanıcı üst menüdeki "Elektronik" kategorisinin üzerine gelir
    And kullanıcı açılan menüden "Cep Telefonu" alt kategorisine tıklar
    Then kullanıcının cep telefonu kategorisi sayfasına yönlendirildiği doğrulanmalıdır
    And sayfada cep telefonu markalarının listelendiği filtreleme alanı görülmelidir

  Scenario: Kullanıcı arama sonuçlarında en ucuz fiyata git butonunu kullanabilmeli
    When kullanıcı arama kutusuna "Macbook Air M2" yazar
    And kullanıcı "Ara" butonuna tıklar
    And kullanıcı listelenen ilk ürünün detayına tıklar
    And kullanıcı "Ürüne Git" veya "Satıcıya Git" butonuna tıklar
    Then kullanıcının ilgili satıcının sayfasına veya yönlendirme paneline geçtiği doğrulanmalıdır