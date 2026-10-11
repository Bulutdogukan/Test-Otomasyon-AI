# AI Destekli Test Otomasyon Ajanı

Bu proje, modern web uygulamalarının test süreçlerini optimize etmek amacıyla geliştirilmiş, **Yapay Zeka (Qwen 2.5 Coder)** destekli otonom bir test otomasyon mimarisidir.

Doğal dil ile verilen test senaryolarını analiz eder, hedef web sayfasının DOM yapısını yorumlar ve **Playwright** üzerinden çalıştırılabilir, doğrulama (assertion) içeren test kodları üreterek otomatik test süreçlerini yürütür.

Üretilen doğrulamalar boş beklenen değerle yazılmaz: beklenen değeri olmayan bir `url`/`text` doğrulaması her koşulda geçeceği için teste hiç eklenmez, böylece "hep yeşil yanan ama hiçbir şey güvence altına almayan" testler oluşmaz.

---

# 🌟 Temel Özellikler

## 🤖 Otonom Kod Üretimi

Test senaryoları manuel ve statik şekilde yazılmaz. Sistem, hedef sayfanın canlı DOM yapısını okuyarak anlık duruma uygun dinamik Playwright adımları oluşturur.

## 🌐 Uzak Sunucu (Grid) Desteği

Playwright protokolü konuşan bir uzak tarayıcı sunucusuna (`npx playwright run-server` veya Aerokube Moon) bağlanarak hem keşif fazını hem derlenen testlerin koşumunu başka bir makinede yürütebilir.

## 🖥️ Dahili Web Arayüzü (UI)

Teknik olmayan kullanıcıların da kolayca test başlatabilmesi için `Socket.io` tabanlı canlı log akışına sahip bir kontrol paneli sunar.

## 📊 Gelişmiş Raporlama

Her test çalıştırmasının ardından otomatik olarak detaylı **Allure Reports** oluşturulur ve tarayıcı üzerinden görüntülenebilir.

## 🚫 Reklam Gürültüsünün Elenmesi

DOM taranırken reklam/sponsorlu görünen elemanlar (`[id*="ad"]`, `[class*="sponsored"]`, `[class*="promo"]`, `[class*="reklam"]` altındakiler) ile görünmeyen elemanlar dışarıda bırakılır. Böylece modele yalnızca gerçekten etkileşilebilir elemanlar gider; hem token tüketimi hem yanlış locator seçme riski düşer. Yeni açılan sekmeler otomatik olarak takip edilir ve ajan odağını yeni sekmeye kaydırır.

## 📁 Kullanıcıya Özel Test Klasörü

Her kullanıcı, üretilen testlerin kaydedileceği klasörü arayüzden kendisi seçer ("Klasör Seç" ile native diyalog — Windows ve macOS). Seçim tarayıcıda saklanır; farklı kullanıcıların testleri birbirine karışmaz. Elinizdeki hazır bir test klasörünü seçip içindeki **tüm testleri tek tıkla paralel** koşabilirsiniz (alt klasörler dahil). Koşum öncesi spec'ler proje içindeki `.batch-staging/` klasörüne kopyalanır; böylece modül çözümlemesi her zaman projenin `node_modules`'üne gider.

## 🧠 Arayüzden Model Seçimi

Ollama'da kurulu modeller arayüzdeki açılır listeden seçilebilir; daha güçlü bir donanımda daha büyük bir modelle çalışmak için `.env` düzenlemek gerekmez.

> **Grid notu:** `chromium.connect` **Playwright protokolü** ister. Vanilla Selenium Grid 4 `/playwright/...` endpoint'i sunmaz; merkezi makinede **Aerokube Moon** ya da `npx playwright run-server --port 4444 --path /playwright/chromium` kullanın ve `.env`'deki `GRID_WS_ENDPOINT` adresini buna göre ayarlayın.

---

# 📋 Gereksinimler

Projeyi yerel ortamda çalıştırabilmek için aşağıdaki araçların kurulu olması gerekir:

* **Node.js** (v18 veya üzeri)
* **Ollama**
* **Playwright**
* **Qwen 2.5 Coder Modeli**

Önerilen model (isteğe bağlı olarak Ollama üzerinden daha güçlü modeller kullanılabilir):

```bash
ollama run qwen2.5-coder:7b
```

---

# 🛠️ Kurulum

**Windows:** `Vakifbank_QA_Baslat.bat` · **macOS (Mac mini):** `MacMini_QA_Baslat.command` (ilk seferde `chmod +x MacMini_QA_Baslat.command`; betik bağımlılıkları otomatik kurar)

## 1. Repository'yi Klonlayın

```bash
git clone https://github.com/Bulutdogukan/Test-Otomasyon-AI.git
cd Test-Otomasyon-AI
```

## 2. Bağımlılıkları Kurun

```bash
npm install
```

## 3. Playwright Tarayıcılarını Yükleyin

```bash
npx playwright install
```

## 4. Ollama Modelini Başlatın

```bash
ollama run qwen2.5-coder:7b
```

## 5. `.env` Dosyasını Oluşturun

En kolayı şablonu kopyalamaktır — tüm değişkenler açıklamalarıyla birlikte `.env.example` içindedir:

```bash
cp .env.example .env     # Windows PowerShell: copy .env.example .env
```

Asgari yapılandırma:

```env
# AI MODEL AYARLARI (ZORUNLU — ikisi de tanımlı değilse sunucu açılmaz)
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_URL=http://127.0.0.1:11434/api/chat

# ERİŞİM KORUMASI (ağa açık kullanımda MUTLAKA doldurun — bkz. "Güvenlik")
APP_TOKEN=

# UZAK TARAYICI / GRID (opsiyonel)
# GRID_WS_ENDPOINT=ws://localhost:4444/playwright/chromium

# MEDYA KAYIT AYARLARI
SAVE_VIDEO=off
SAVE_SCREENSHOT=only-on-failure
```

> Keşif fazı varsayılan olarak **görünür** bir tarayıcı açar. Ekransız bir ortamda
> (SSH ile bağlanılan Mac Mini, Docker, CI) çalıştıracaksanız `.env` dosyasına
> `HEADLESS=true` ekleyin.

## 6. Sunucuyu Başlatın

```bash
node server.js
```

---

# 🚀 Kullanım

## 1. Web Arayüzü (UI) ile Kullanım

Kontrol panelini başlatmak için:

```bash
node server.js
```

Ardından tarayıcıdan aşağıdaki adrese gidin:

```txt
http://localhost:3000
```

Canlı loglar ve test süreçleri gerçek zamanlı olarak arayüz üzerinden takip edilebilir.

---

## 2. Terminal (CLI) Üzerinden Kullanım

Doğrudan terminal üzerinden test çalıştırmak için **hedef URL ve senaryo metni birlikte** verilir:

```bash
node ai-agent2.js <url> "<senaryo>" [--grid]
```

Örnekler:

```bash
node ai-agent2.js https://www.saucedemo.com "standard_user ile giriş yap ve ilk ürünü sepete ekle"
node ai-agent2.js https://www.example.com "Arama kutusuna 'telefon' yaz ve enter tuşuna bas"
```

Kullanım özetini görmek için: `node ai-agent2.js --help`

---

## 3. Kalıcı Test Kütüphanesi ve Tek Tık Paralel Koşum

Her üretilen test artık üzerine yazılmaz; `tests/generated/features/` altında BDD/Gherkin
`.feature` dosyası, `tests/generated/specs/` altında eşleşen Playwright betiği olarak kalıcı biriktirilir.
İkisi **birlikte** yazılır: keşif hiçbir uygulanabilir adım üretemezse kütüphaneye hiçbir şey
eklenmez, böylece eşi olmayan `.feature` ya da hiçbir şey doğrulamayan boş `.spec.ts` birikmez.

Biriken tüm testleri paralel çalıştırmak için:

* **UI'dan:** "▶▶ Tüm Testleri Paralel Çalıştır" butonuna tıklayın.
* **CLI'dan:**

```bash
npm run test:all
```

Paralellik derecesi `.env` dosyasındaki `PW_WORKERS` ile ayarlanır (boş bırakılırsa Playwright,
makinenin CPU sayısına göre otomatik seçer).

---

# 🖥️ Çoklu Makine (Windows + Mac Mini) ile Koordineli Çalışma

Proje, tek makineyle sınırlı değildir; kod ve `tests/generated/` altındaki test kütüphanesi Git
üzerinden senkronize edilerek iki makine arasında koordineli çalışılabilir.

## Kurulum (ikinci makinede, örn. Mac Mini)

```bash
git clone https://github.com/Bulutdogukan/Test-Otomasyon-AI.git
cd Test-Otomasyon-AI
npm install
npx playwright install --with-deps
cp .env.example .env   # ardından .env dosyasını doldurun
```

## Güçlü Makinenin (Mac Mini) Kaynaklarını Ağ Üzerinden Kullanma

Zip ile dosya taşımaya gerek kalmadan, Mac Mini'nin donanımı ağ üzerinden Windows makineden de
kullanılabilir:

* **Daha güçlü LLM modeli:** Mac Mini'de `OLLAMA_HOST=0.0.0.0 ollama serve` ile Ollama LAN'a açılır
  ve 64 GB RAM'e uygun daha büyük bir model (örn. `qwen2.5-coder:32b`) çekilir. Windows'taki `.env`
  dosyasında `OLLAMA_URL=http://<mac-mini-ip>:11434/api/chat` ayarlanarak üretim sırasında Mac
  Mini'nin modeli kullanılır.
* **Uzak tarayıcı (Grid):** Mac Mini'de `npx playwright run-server --port 4444` çalıştırılıp,
  Windows'ta `.env` dosyasında `GRID_WS_ENDPOINT=ws://<mac-mini-ip>:4444/` ayarlanarak, arayüzdeki
  "Uzak Sunucuda Çalıştır" seçeneği (veya `--grid` bayrağı) ile keşif Mac Mini üzerinde yürütülür.
* **Yüksek paralellik:** `npm run test:all` doğrudan Mac Mini'de çalıştırılırken `PW_WORKERS` yüksek
  tutulabilir (örn. 8-12); Windows'ta düşük tutulması önerilir (örn. 2-4).

Her iki makine de `git push` / `git pull` ile aynı `tests/generated/` kütüphanesini paylaşır — biri
yeni senaryo üretirken diğeri mevcut kütüphaneyi paralel koşabilir.

---

# 🧠 Sistem Mimarisi

Bu yapı aşağıdaki temel bileşenlerden oluşur:

* **LLM Katmanı** → Doğal dili analiz eder.
* **DOM Analyzer** → Sayfa yapısını semantik olarak inceler.
* **Playwright Engine** → Dinamik test scriptlerini çalıştırır.
* **Socket.io Logger** → Gerçek zamanlı log aktarımı sağlar.
* **Allure Reporter** → Test raporlarını üretir.

---

# 📁 Proje Yapısı

```bash
.
├── server.js                 # Express & Socket.io sunucusu, erişim koruması
├── ai-agent2.js              # CLI giriş noktası
├── playwright.config.ts
├── public/
│   └── index.html            # Kontrol paneli (tek dosya arayüz)
├── src/
│   ├── core/
│   │   └── orchestrator.js   # Keşif döngüsü + self-healing + derleme boru hattı
│   ├── services/
│   │   ├── ai.service.js     # Ollama çağrıları (planner, locator, self-healing)
│   │   ├── compiler.service.js # Adım geçmişi -> .spec.ts üretimi
│   │   └── dom.ranker.js     # DOM kırpma / alaka sıralaması
│   └── utils/
│       ├── logger.js
│       ├── staging.js        # Koşum öncesi spec kopyalama (.batch-staging/)
│       └── steps.js          # Eylem normalizasyonu + doğrulama kuralları
├── pages/                    # Elle yazılmış Page Object örnekleri
├── tests/
│   ├── advanced_scenarios.spec.ts   # Elle yazılmış örnek testler
│   └── generated/
│       ├── features/         # Kalıcı .feature dosyaları
│       └── specs/            # Kalıcı, derlenmiş .spec.ts dosyaları
├── scripts/pick-folder.ps1   # Windows native klasör seçme diyaloğu
├── .github/workflows/ci.yml  # Tip kontrolü + sözdizimi kapısı
├── .env
└── .env.example
```

Koşum çıktıları (`allure-results/`, `allure-report/`, `playwright-report/`,
`test-results/`, `.batch-staging/`, `uploads/`) her koşumda yeniden üretilir ve
`.gitignore` içindedir.

## Dosya Açıklamaları

| Dosya                          | Açıklama                                             |
| ------------------------------ | ---------------------------------------------------- |
| `server.js`                    | Express & Socket.io tabanlı ana sunucu               |
| `ai-agent2.js`                 | Yapay zeka destekli otomasyon ajanı (CLI)            |
| `src/core/orchestrator.js`     | Keşif → self-healing → derleme → koşum boru hattı    |
| `src/services/`                | LLM çağrıları, kod üretimi, DOM sıralaması           |
| `src/utils/steps.js`           | Keşif ve derlemenin paylaştığı eylem kuralları       |
| `playwright.config.ts`         | Playwright yapılandırmaları                          |
| `public/index.html`            | Kullanıcı arayüzü                                    |
| `tests/generated/features/`    | Kalıcı BDD/Gherkin senaryo kütüphanesi               |
| `tests/generated/specs/`       | Kalıcı, koşulabilir Playwright betikleri             |
| `allure-report/`               | Derlenmiş Allure rapor çıktısı (arayüzden açılır)    |
| `.env.example`                 | Ortam değişkeni şablonu (tüm değişkenler açıklamalı) |

---

# 📈 Öne Çıkan Teknolojiler

* Node.js
* Playwright
* Socket.io
* Express.js
* Allure Reports
* Ollama
* Qwen 2.5 Coder

---

# 🔥 Projenin Sağladığı Avantajlar

* Test yazım süresini ciddi ölçüde azaltır
* Teknik olmayan ekiplerin test oluşturmasını kolaylaştırır
* Dinamik DOM değişikliklerine daha dayanıklıdır
* CI/CD süreçlerine kolay entegre olur
* İnsan hatasını minimize eder

---

# 🔒 Güvenlik

Sunucu, kullanıcının kendi makinesinde çalışır ama yukarıdaki Windows + Mac Mini
senaryosunda **LAN'a açıktır**. Kimlik doğrulama olmadan aynı ağdaki herkes test
koşturabilir, klasör oluşturabilir ve raporları okuyabilir.

**Erişim anahtarı (`APP_TOKEN`)**

`.env` dosyasında `APP_TOKEN` tanımlıysa arayüz bir giriş ekranı gösterir; Socket.io
bağlantısı, dosya yükleme (`/upload`) ve Allure raporu (`/allure`) bu anahtar olmadan
reddedilir. Anahtar tarayıcıda saklanır, her seferinde yeniden girmek gerekmez.

```bash
# Rastgele bir anahtar üretin ve .env dosyasına yazın
openssl rand -hex 24
```

`APP_TOKEN` boş bırakılırsa koruma **kapalıdır** ve sunucu açılışta bunu uyarı olarak
basar. Tek makinede lokal kullanım için sorun değildir; bu durumda `HOST=127.0.0.1`
ayarlayarak sunucuyu ağa hiç açmamanız önerilir.

**Ek sıkılaştırma (opsiyonel)**

* `HOST=127.0.0.1` → sunucu yalnızca kendi makinesinden erişilebilir olur.
* `QA_ALLOWED_ROOT=C:\QA-Testlerim` → arayüzden seçilebilecek test klasörlerini tek bir
  kök dizinin altına kısıtlar; bu kökün dışındaki yollar reddedilir.

---

# ✅ Kod Kalitesi

```bash
npm run typecheck      # TypeScript tip kontrolü (tsc --noEmit)
```

`.github/workflows/ci.yml`, her push ve pull request'te bağımlılıkları kurup tip
kontrolü (`tsc --noEmit`) ile Node sözdizimi kontrolünü (`node --check`) çalıştırır.
Gerçek test koşumu CI'da bilinçli olarak yapılmaz — testler canlı bir Ollama örneği
ve gerçek hedef sitelere erişim ister.

---

# 📌 Gelecek Planları

* Çoklu LLM desteği
* Selenium fallback sistemi
* Docker & Kubernetes deployment
* AI destekli hata analizi

---

# 🌿 Geliştirme Dalları (Branch'ler)

| Dal                             | Durum                 | Açıklama                                                                 |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `main`                            | **Güncel / yayın**    | Bu belgede anlatılan tüm özellikleri içeren güncel sürüm.                |
| `fix/security-and-cleanup`        | `main` ile eşit       | Güvenlik/temizlik düzeltmeleri, self-healing ve keşif döngüsü iyileştirmeleri, kalıcı Gherkin kütüphanesi ve çoklu makine desteği bu dalda geliştirildi; `main`'e alındı. |
| `refactor/stability-self-healing` | Geçmiş geliştirme     | Kararlılık düzeltmeleri, DOM chunking, self-healing ve eylem repertuarı (hover/dragAndDrop) çalışmalarının yapıldığı dal. |

`main` ve `fix/security-and-cleanup` şu anda **aynı commit'i** gösteriyor; geliştirme
tamamlanıp birleştirildiği için ikisi arasında fark yoktur. Yeni bir çalışmaya
başlarken `main`'den yeni bir dal açmanız önerilir.
