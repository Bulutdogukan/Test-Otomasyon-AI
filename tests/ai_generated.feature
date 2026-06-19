Feature: Kullanıcı sisteme giriş yaparak ürünleri sepete ekleyebilir

Scenario: Standard kullanıcı sisteme giriş yapar ve ilk ürünü sepete ekler
    Given standard_user adı ve secret_sauce şifresi ile sistemde oturum açılır
    When ilk ürünü 'Add to cart' butonuna tıklanır
    Then ürün sepete eklendiğini doğrulanır
    And test sonlandırılır