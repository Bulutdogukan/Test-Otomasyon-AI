Feature: Web Sitesinin Performansı ve Güvenliği Testleri

Scenario: Web Sitesinin Genel Durumu ve Meta Yapısı Kontrolü
Given tarayıcı açılır ve test edilecek URL'e gidilir.
When sayfanın HTTP 200 OK durum kodu ile başarıyla açıldığı doğrulanır.
And tarayıcı geliştirici araçlarındaki Console sekmesi kontrol edilerek herhangi bir 404 Not Found veya Uncaught TypeError hatasının bulunmadığı teyit edilir.

Scenario: Web Sitesinin Meta (SEO ve Görünüm) Yapısı Kontrolü
Given sayfa başlığının "demosite" olarak görüntülendiği doğrulanır.
And sayfa kaynak kodunda karakter setinin UTF-8 olarak tanımlandığı kontrol edilir.
And sekme ikonunda /vite.svg dosyasının başarıyla render edildiği doğrulanır.
And mobil cihaz simülasyonu etkinleştirildiğinde sayfanın viewport ayarları sayesinde initial-scale=1.0 kuralına uygun şekilde ekrana sığdığı gözlemlenir.

Scenario: Statik Vite Derleme Dosyalarının Durumu Kontrolü
Given Network sekmesinde /assets/index-pe2EUVKA.css dosyasının başarılı şekilde indirildiği doğrulanır.
And /assets/index-D_rDx8ml.js dosyasının type="module" niteliğiyle yüklendiği ve çalıştırıldığı kontrol edilir.

Scenario: Üçüncü Ünvan Izleme Kodlarının Çalışırlığı Testi
Given analytics.js dosyasının DOM içerisine asenkron (async) olarak eklendiği doğrulanır.
And sayfa kaynak kodunda G-MVRXK93D28 (Google Analytics 4) ve GTM-MX8DD4S (Google Tag Manager) kimliklerinin bulunduğu kontrol edilir.
And tarayıcı konsolunda window.google_tag_manager komutu çalıştırılarak sonucun undefined yerine dolu bir nesne (object) döndürdüğü doğrulanır.

Scenario: AdBlock (Reklam Engelleme) CSS Kurallarının Aktifliği Testi
Given tarayıcı konsolu aracılığıyla body etiketi içerisine <div class="adsbygoogle">Reklam</div> elementi enjekte edilir.
And bu elementin Computed Style bilgileri incelenerek display özelliğinin none değerini aldığı ve reklam engelleme kuralının başarıyla uygulandığı doğrulanır.