# AI Destekli Test Otomasyon Ajanı

Bu proje, modern web uygulamalarının test süreçlerini optimize etmek amacıyla geliştirilmiş, **Yapay Zeka (Qwen 2.5 Coder)** destekli otonom bir test otomasyon mimarisidir.

Doğal dil ile verilen test senaryolarını analiz eder, hedef web sayfasının DOM yapısını yorumlar ve **Playwright** üzerinden çalıştırılabilir, doğrulama (assertion) içeren test kodları üreterek otomatik test süreçlerini yürütür.

Yapay zekâ modeli (Ollama) tamamen yerelde çalışır; senaryolar, ekran içerikleri ve şifreler hiçbir bulut servisine gönderilmez.

Araç, "hep yeşil yanan ama hiçbir şey güvence altına almayan" test üretmemek için bilinçli olarak tutucudur:

* Senaryonun hedefine ulaşamayan keşif **kaydedilmez** (yarım test yeşil geçerdi).
* En az bir doğrulama (assert) içermeyen test **kaydedilmez**.
* Senaryoda tırnak içinde yazılan beklenti (`'Sipariş alındı'`) doğrulanmadan senaryo bitmiş sayılmaz.
* Boş beklenen değerli doğrulama (her URL'yi / her metni eşleyen) teste yazılmaz.
* Keşifte başarısız olan doğrulama teste olduğu gibi yazılır; test dürüstçe kırmızı yanar.

> 📘 Kurulum, iyi senaryo yazımı, sonuçların yorumlanması ve **bilinen sınırlamalar** için
> [KULLANIM_KILAVUZU.md](KULLANIM_KILAVUZU.md) dosyasına bakın.

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

## 🏢 Kurumsal Uygulamalara Uygun DOM Taraması

* **iframe ve shadow DOM:** Görünür iframe'lerin (ödeme formları, eski portal ekranları) ve açık shadow DOM'un (web component'ler) içi taranır; üretilen test `page.frameLocator(...)` zinciri kullanır.
* **Kararlı locator önceliği:** `data-testid` > kararlı `id` > `name` > `aria-label` > `placeholder` > metin. Framework'lerin her yüklemede değiştirdiği id'ler (`ember1234`, `ctl00_...`, `j_idt12`, `:r1:`) tanınır ve yalnızca son çare olarak kullanılır.
* **Gürültü eleme:** Reklam kapsayıcıları, görünmez elemanlar, kapalı yan menüler (`aria-hidden`, `inert`, ekran dışı) ve 0×0 izleme iframe'leri modele gönderilmez.
* **İç ağ:** `localhost`, `10.x`, `192.168.x` ve kurum içi alan adları varsayılan olarak serbesttir; `QA_ALLOWED_HOSTS` / `QA_BLOCK_PRIVATE_URLS` ile kısıtlanabilir.
* Yeni açılan sekmeler otomatik olarak takip edilir.

## 🔑 Gizli Veriler ve Kurumsal Giriş

* **Şifreler testlere yazılmaz:** `.env` içindeki `QA_SECRET_*` değerleri senaryoda `{{QA_SECRET_PASSWORD}}` olarak kullanılır. Model yalnızca yer tutucuyu görür, üretilen test değeri `process.env`'den okur, loglarda maskelenir.
* **SSO / MFA / SMS-OTP:** Bir kez elle giriş yapılıp oturum kaydedilir (`STORAGE_STATE`); keşif ve tüm testler giriş yapılmış olarak başlar.

## 📁 Kullanıcıya Özel Test Klasörü

Her kullanıcı, üretilen testlerin kaydedileceği klasörü arayüzden kendisi seçer ("Klasör Seç" ile native diyalog — Windows ve macOS). Seçim tarayıcıda saklanır; farklı kullanıcıların testleri birbirine karışmaz. Elinizdeki hazır bir test klasörünü seçip içindeki **tüm testleri tek tıkla paralel** koşabilirsiniz (alt klasörler dahil). Koşum öncesi spec'ler proje içindeki `.batch-staging/` klasörüne kopyalanır; böylece modül çözümlemesi her zaman projenin `node_modules`'üne gider.

## 🧠 Arayüzden Model Seçimi

Ollama'da kurulu modeller arayüzdeki açılır listeden seçilebilir; daha güçlü bir donanımda daha büyük bir modelle çalışmak için `.env` düzenlemek gerekmez.

> **Grid notu:** `chromium.connect` **Playwright protokolü** ister. Vanilla Selenium Grid 4 `/playwright/...` endpoint'i sunmaz; merkezi makinede **Aerokube Moon** ya da `npx playwright run-server --port 4444 --path /playwright/chromium` kullanın ve `.env`'deki `GRID_WS_ENDPOINT` adresini buna göre ayarlayın.

---

# 📋 Gereksinimler

Projeyi yerel ortamda çalıştırabilmek için aşağıdaki araçların kurulu olması gerekir:

* **Node.js** (22 LTS veya üzeri)
* **Java** (JRE 11+, yalnızca Allure raporu için)
* **Ollama**
* **Playwright**
* **Qwen 2.5 Coder Modeli**

Önerilen model (isteğe bağlı olarak Ollama üzerinden daha güçlü modeller kullanılabilir):

```bash
ollama pull qwen2.5-coder:7b
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
npm ci
```

## 3. Playwright Tarayıcılarını Yükleyin

```bash
npx playwright install
```

## 4. Ollama Modelini İndirin

```bash
ollama pull qwen2.5-coder:7b
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

Her üretilen test üzerine yazılmaz; `tests/generated/features/` altında BDD/Gherkin
`.feature` dosyası, `tests/generated/specs/` altında eşleşen Playwright betiği olarak kalıcı biriktirilir.
İkisi **birlikte** ve yalnızca keşif senaryonun hedefine en az bir doğrulamayla ulaştığında yazılır;
yarım kalan keşifler kütüphaneye girmez.

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
npm ci
npx playwright install --with-deps chromium
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
│   │   ├── dom.scanner.js    # Canlı DOM taraması (iframe + shadow DOM)
│   │   └── dom.ranker.js     # DOM kırpma / alaka sıralaması
│   └── utils/
│       ├── locator.js        # iframe locator zinciri (keşif + derleme ortak)
│       ├── secrets.js        # QA_SECRET_* yer tutucuları ve maskeleme
│       ├── url.js            # Hedef URL politikası (arayüz + CLI ortak)
│       ├── npx.js            # Güvenli npx süreç başlatma
│       ├── reportDirs.js     # Rapor klasörlerini temizleme
│       ├── logger.js
│       ├── staging.js        # Koşum öncesi spec kopyalama (.batch-staging/)
│       └── steps.js          # Eylem normalizasyonu + doğrulama kuralları
├── pages/                    # Elle yazılmış Page Object örnekleri
├── tests/
│   ├── advanced_scenarios.spec.ts   # Elle yazılmış örnek testler
│   ├── unit/                 # Birim testleri (Ollama gerektirmez, npm run test:unit)
│   └── generated/
│       ├── features/         # Kalıcı .feature dosyaları
│       └── specs/            # Kalıcı, derlenmiş .spec.ts dosyaları
├── scripts/pick-folder.ps1   # Windows native klasör seçme diyaloğu
├── .github/workflows/ci.yml  # Tip kontrolü + sözdizimi + birim testleri
├── Dockerfile                # Konteyner imajı tanımı
├── docker-compose.yml        # Ollama + QA sunucusu tek komutla
├── CONTRIBUTING.md           # Katkıda bulunma rehberi
├── KULLANIM_KILAVUZU.md      # Kapsamlı kullanıcı kılavuzu
├── LICENSE                   # ISC lisansı
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

| Teknoloji | Projedeki rolü |
| --- | --- |
| **Node.js 22 LTS** | Sunucu, CLI ve keşif motoru |
| **Playwright** | Canlı keşif tarayıcısı ve üretilen testlerin koşumu (`frameLocator` ile iframe desteği) |
| **Ollama + Qwen 2.5 Coder (7B)** | Yerel LLM — planlama, adım seçimi, self-healing (JSON modu ile) |
| **Express.js + Socket.io** | Web arayüzü ve canlı log akışı |
| **Helmet** | HTTP güvenlik başlıkları |
| **Allure Reports** (+ Java JRE) | Ekran görüntüsü, trace ve video içeren raporlar |
| **Node.js test koşucusu (`node:test`)** | Ollama gerektirmeyen birim testleri (`npm run test:unit`) |
| **TypeScript** | Üretilen ve elle yazılan testlerin tip kontrolü |
| **Docker + resmi Playwright imajı** | Ollama ve QA sunucusunu tek komutla çalıştırma |
| **GitHub Actions** | Tip kontrolü + sözdizimi + birim testleri |

Bu sürümle eklenen kabiliyetler: iframe ve shadow DOM taraması, `QA_SECRET_*` ile gizli
test verileri, kayıtlı oturumla SSO/MFA desteği (`STORAGE_STATE`), iç ağ hedefleri,
kendinden imzalı sertifika desteği ve "yarım test kaydetmeme" güvenlik ağları. Ayrıntılar
için kılavuzdaki [Sürüm Notları](KULLANIM_KILAVUZU.md#19-sürüm-notları) bölümüne bakın.

---

# 🔥 Projenin Sağladığı Avantajlar

* Test yazım süresini ciddi ölçüde azaltır
* Teknik olmayan ekiplerin test oluşturmasını kolaylaştırır
* Dinamik DOM değişikliklerine daha dayanıklıdır
* Üretilen testler standart Playwright testleri olduğu için CI/CD'de AI olmadan koşar
* İnsan hatasını minimize eder

---

# 🔒 Güvenlik

Sunucu varsayılan olarak **yalnızca kendi makinesinden** erişilebilir (`HOST=127.0.0.1`).
Arayüzü ağdaki başka makinelere açmak için `HOST=0.0.0.0` **ve** `APP_TOKEN` birlikte
verilmelidir; anahtarsız açılan sunucu açılışta uyarı basar.

**Erişim anahtarı (`APP_TOKEN`)**

`.env` dosyasında `APP_TOKEN` tanımlıysa arayüz bir giriş ekranı gösterir; Socket.io
bağlantısı, dosya yükleme (`/upload`) ve Allure raporu (`/allure`) bu anahtar olmadan
reddedilir. Anahtar tarayıcıda saklanır, her seferinde yeniden girmek gerekmez.

```bash
# Rastgele bir anahtar üretin ve .env dosyasına yazın
openssl rand -hex 24
```

`APP_TOKEN` boş bırakılırsa koruma **kapalıdır**. Varsayılan `HOST=127.0.0.1` ile tek
makinede lokal kullanım için sorun değildir.

**Ek sıkılaştırma (opsiyonel)**

* `QA_ALLOWED_HOSTS=*.kurum.local` → test edilebilecek hedef alan adlarını kısıtlar.
* `QA_BLOCK_PRIVATE_URLS=true` → iç ağ / localhost hedeflerini tamamen kapatır.
* Gizli test verileri yalnızca `.env` içinde (`QA_SECRET_*`), kayıtlı oturumlar `auth/` altında tutulur; ikisi de git'e girmez.
* `QA_ALLOWED_ROOT=C:\QA-Testlerim` → arayüzden seçilebilecek test klasörlerini tek bir
  kök dizinin altına kısıtlar; bu kökün dışındaki yollar reddedilir.

---

# ✅ Kod Kalitesi

```bash
npm run typecheck      # TypeScript tip kontrolü (tsc --noEmit)
npm run test:unit      # Birim testleri: URL politikası, gizli veri maskeleme, iframe locator,
                       # derleyici çıktısı, DOM tarayıcı (headless Chromium) — Ollama gerekmez
```

`.github/workflows/ci.yml`, her push ve pull request'te tip kontrolü, Node sözdizimi
kontrolü ve birim testlerini çalıştırır. AI ile test **üretimi** CI'da bilinçli olarak
yapılmaz — canlı bir Ollama örneği ve gerçek hedef sitelere erişim ister.

---

# 📌 Gelecek Planları

* Çoklu LLM desteği
* Çok kullanıcılı eşzamanlı çalışma (iş kuyruğu)
* Dosya yükleme / tarayıcı onay penceresi eylemleri
* AI destekli hata analizi

---

# 🌿 Katkıda Bulunma

Dal adlandırma, commit formatı ve kod kuralları için [CONTRIBUTING.md](CONTRIBUTING.md)
dosyasına bakın. Yeni bir çalışmaya `main`'den yeni bir dal açarak başlayın.
