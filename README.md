# AI Destekli Test Otomasyon Ajanı

Bu proje, modern web uygulamalarının test süreçlerini optimize etmek amacıyla geliştirilmiş, **Yapay Zeka (Qwen 2.5 Coder)** destekli otonom bir test otomasyon mimarisidir.

Doğal dil ile verilen test senaryolarını analiz eder, hedef web sayfasının DOM yapısını yorumlar ve **Playwright** üzerinden dinamik olarak çalıştırılabilir test kodları (Strict Assertion destekli) oluşturarak otomatik test süreçlerini yürütür.

---

# 🌟 Temel Özellikler

## 🤖 Otonom Kod Üretimi

Test senaryoları manuel ve statik şekilde yazılmaz. Sistem, hedef sayfanın canlı DOM yapısını okuyarak anlık duruma uygun dinamik Playwright adımları oluşturur.

## 🌐 Uzak Sunucu (Grid) Desteği

Selenium Grid 4 veya Playwright Grid altyapıları üzerinden CDP (Chrome DevTools Protocol) desteği ile uzak tarayıcıları yönetebilir.

## 🖥️ Dahili Web Arayüzü (UI)

Teknik olmayan kullanıcıların da kolayca test başlatabilmesi için `Socket.io` tabanlı canlı log akışına sahip bir kontrol paneli sunar.

## 📊 Gelişmiş Raporlama

Her test çalıştırmasının ardından otomatik olarak detaylı **Allure Reports** oluşturulur ve tarayıcı üzerinden görüntülenebilir.

## 🚫 Reklam ve Pop-up Engelleme

Google Ads, üçüncü parti iframe’ler ve pop-up içerikleri otomatik olarak engellenerek test stabilitesi artırılır.

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

## 1. Repository'yi Klonlayın

```bash
git clone <repo-url>
cd <repo-folder>
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

Proje ana dizininde `.env` dosyası oluşturup aşağıdaki ayarları yapılandırın:

```env
# AI MODEL AYARLARI
OLLAMA_MODEL=qwen2.5-coder:7b
# İsteğe bağlı olarak daha güçlü modeller kullanılabilir.

OLLAMA_URL=http://127.0.0.1:11434/api/chat

# GRID AYARLARI
# GRID_URL=ws://localhost:4444/

# MEDYA KAYIT AYARLARI
SAVE_VIDEO=off
SAVE_SCREENSHOT=only-on-failure
```

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

Doğrudan terminal üzerinden test çalıştırmak için:

```bash
node ai-agent2.js "Arama kutusuna 'telefon' yaz ve enter tuşuna bas"
```

Örnek:

```bash
node ai-agent2.js "Login butonuna tıkla ve kullanıcı girişini doğrula"
```

---

## 3. Kalıcı Test Kütüphanesi ve Tek Tık Paralel Koşum

Her üretilen test artık üzerine yazılmaz; `tests/generated/features/` altında BDD/Gherkin
`.feature` dosyası, `tests/generated/specs/` altında eşleşen Playwright betiği olarak kalıcı biriktirilir.

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
git clone <repo-url>
cd <repo-folder>
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
├── server.js
├── ai-agent2.js
├── playwright.config.ts
├── public/
│   └── index.html
├── tests/
│   └── generated/
│       ├── features/   # Kalıcı .feature dosyaları
│       └── specs/      # Kalıcı, derlenmiş .spec.ts dosyaları
├── reports/
├── .env
└── .env.example
```

## Dosya Açıklamaları

| Dosya                          | Açıklama                                    |
| ------------------------------ | -------------------------------------------- |
| `server.js`                    | Express & Socket.io tabanlı ana sunucu       |
| `ai-agent2.js`                 | Yapay zeka destekli otomasyon ajanı          |
| `playwright.config.ts`         | Playwright yapılandırmaları                  |
| `public/index.html`            | Kullanıcı arayüzü                            |
| `tests/generated/features/`    | Kalıcı BDD/Gherkin senaryo kütüphanesi       |
| `tests/generated/specs/`       | Kalıcı, koşulabilir Playwright betikleri     |
| `reports/`                     | Allure rapor çıktıları                       |
| `.env.example`                 | Ortam değişkeni şablonu (çoklu makine kurulumu için) |

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

# 📌 Gelecek Planları

* Çoklu LLM desteği
* Selenium fallback sistemi
* Docker & Kubernetes deployment
* AI destekli hata analizi
