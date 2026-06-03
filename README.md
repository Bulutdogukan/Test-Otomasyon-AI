# VakıfBank Otomasyon Ajanı 

Bu proje, VakıfBank test süreçlerini optimize etmek amacıyla geliştirilmiş, **Yapay Zeka (Qwen 2.5 Coder)** destekli otonom bir test otomasyon mimarisidir. 

Doğal dil ile verilen test senaryolarını anlar, hedef web sayfasının DOM yapısını analiz eder ve **Playwright** üzerinden dinamik olarak çalıştırılabilir kod (Strict Assertion) üreterek testi gerçekleştirir.

## 🌟 Temel Özellikler
* **Otonom Kod Üretimi:** Test senaryoları statik olarak yazılmaz. Ajan, hedef sayfanın canlı DOM yapısını okuyarak o anki duruma göre dinamik Playwright adımları oluşturur.
* **Uzak Sunucu (Grid) Desteği:** Selenium Grid 4 veya Playwright Grid üzerinden CDP (Chrome DevTools Protocol) ile uzak sunuculardaki tarayıcıları yönetebilir.
* **Dahili Web Arayüzü (UI):** Teknik olmayan kullanıcıların (Product Owner, İş Analisti) tarayıcı üzerinden senaryo girip test başlatabilmesi için `Socket.io` tabanlı canlı log akan bir kontrol paneli.
* **Gelişmiş Raporlama:** Her test koşumunun ardından otomatik olarak detaylı **Allure Reports** üretilir ve tarayıcıda sunulur.
* **Reklam ve Pop-up Engelleyici:** Testin stabilitesini korumak için Google Ads ve üçüncü parti iFrame'leri otomatik engeller.

## 📋 Gereksinimler
Sistemi yerel ortamda çalıştırmak için aşağıdaki araçların kurulu olması gerekmektedir:
* **Node.js** (v18 veya üzeri)
* **Ollama** (Yerel AI modeli çalıştırmak için)
* **Qwen 7B Modeli** (Daha hafif bir yerel model için `qwen2.5-coder:7b` kullanabilirsiniz; örnek: `ollama run qwen2.5-coder:7b`)

## 🛠️ Kurulum
1. `npm install`
2. `npx playwright install`
3. Ollama üzerinden `qwen2.5-coder:7b` modelini ayağa kaldırın.
4. `.env` dosyasını oluşturup `OLLAMA_URL` ve şifre bilgilerini girin.
5. `node server.js` ile başlatın.

## 🚀 Öne Çıkan Özellikler
- **Otonom Kod Üretimi:** BDD Gherkin senaryolarını otomatik olarak Playwright scriptlerine dönüştürür.
- **Key-Value Eşleştirme:** Sayfa DOM yapısını semantik olarak analiz eder.
- **Canlı Loglama:** Socket.io ile test sürecini arayüzden anlık takip imkanı.
- **Görsel Raporlama:** Allure Report entegrasyonu.

3. Çevresel değişkenleri (\`.env\`) ayarlayın:
   Proje ana dizininde bir \`.env\` dosyası oluşturun ve aşağıdaki şablonu kendi yapınıza göre doldurun:
   \`\`\`env
   # AI MODEL AYARLARI
   OLLAMA_MODEL=qwen2.5-coder:7b
   OLLAMA_URL=http://127.0.0.1:11434/api/chat

   # UZAK SUNUCU (GRID) AYARLARI
   # Şirket içi Grid kullanılacaksa yorum satırını kaldırın:
   # GRID_URL=ws://<sunucu-ip>:4444/

   # VİDEO VE EKRAN GÖRÜNTÜSÜ
   SAVE_VIDEO=off
   SAVE_SCREENSHOT=only-on-failure
   \`\`\`

## 💻 Kullanım

### 1. Web Arayüzü (UI) ile Kullanım
Görsel kontrol panelini başlatmak için:
\`\`\`bash
node server.js
\`\`\`
Tarayıcınızdan \`http://localhost:3000\` adresine giderek testi başlatabilirsiniz. Canlı sistem logları arayüze anlık olarak yansıyacaktır.

### 2. Terminal (CLI) üzerinden Kullanım
Hızlı test koşumları veya CI/CD entegrasyonu için doğrudan terminal komutu verilebilir:
\`\`\`bash
node ai-agent2.js "Arama kutusuna 'ihtiyaç kredisi' yaz ve enter tuşuna bas"
\`\`\`

## 📁 Proje Yapısı
* \`server.js\` : Web arayüzünü (Express & Socket.io) ayağa kaldıran ana sunucu dosyası.
* \`ai-agent2.js\` : DOM X-Ray, LLM prompt mühendisliği ve test orkestrasyonunu yöneten çekirdek ajan.
* \`public/index.html\` : Sistemin kullanıcı arayüzü (Frontend).
* \`playwright.config.ts\` : Tarayıcı matrisi, timeout ve Allure yapılandırmaları.
