# Kullanım Kılavuzu — AI Test Otomasyon Platformu

Bu belge, projeyi ilk kez kullanan birinin sıfırdan kurulum yapıp güvenilir test
üretebilmesini hedefler. Kurulumun yanında **aracın neyi yapıp neyi yapamadığını**,
iyi senaryonun nasıl yazıldığını ve sonuçların nasıl yorumlanacağını da anlatır.

---

## İçindekiler

1. [Bu Araç Nedir, Ne Değildir](#1-bu-araç-nedir-ne-değildir)
2. [Sistem Gereksinimleri ve Beklenen Süreler](#2-sistem-gereksinimleri-ve-beklenen-süreler)
3. [Hızlı Başlangıç](#3-hızlı-başlangıç)
4. [Web Arayüzü ile Test Üretme](#4-web-arayüzü-ile-test-üretme)
5. [İyi Senaryo Nasıl Yazılır](#5-iyi-senaryo-nasıl-yazılır)
6. [Şifreler ve Gizli Test Verileri](#6-şifreler-ve-gizli-test-verileri)
7. [SSO / MFA / SMS-OTP ile Korunan Uygulamalar](#7-sso--mfa--sms-otp-ile-korunan-uygulamalar)
8. [İç Ağ Uygulamaları ve iframe İçeren Sayfalar](#8-iç-ağ-uygulamaları-ve-iframe-içeren-sayfalar)
9. [Sonuçları Yorumlama ve Üretilen Testi Gözden Geçirme](#9-sonuçları-yorumlama-ve-üretilen-testi-gözden-geçirme)
10. [Terminal (CLI) ile Test Üretme](#10-terminal-cli-ile-test-üretme)
11. [Toplu Test Koşumu](#11-toplu-test-koşumu)
12. [Allure Raporları](#12-allure-raporları)
13. [Docker ile Çalıştırma](#13-docker-ile-çalıştırma)
14. [Çoklu Makine Kurulumu](#14-çoklu-makine-kurulumu)
15. [Yapılandırma Rehberi (.env)](#15-yapılandırma-rehberi-env)
16. [Sorun Giderme](#16-sorun-giderme)
17. [Bilinen Sınırlamalar](#17-bilinen-sınırlamalar)
18. [Sık Sorulan Sorular](#18-sık-sorulan-sorular)
19. [Sürüm Notları](#19-sürüm-notları)

---

## 1. Bu Araç Nedir, Ne Değildir

**Nedir:** Doğal dilde yazdığınız bir senaryoyu (“standart kullanıcıyla giriş yap,
ürünler sayfasının açıldığını doğrula”) gerçek bir tarayıcıda adım adım deneyerek
**standart, düzenlenebilir bir Playwright testine** (`.spec.ts`) dönüştürür. Yapay zekâ
modeli (Ollama) tamamen **kendi bilgisayarınızda** çalışır; senaryolarınız, ekran
içerikleriniz ve şifreleriniz hiçbir bulut servisine gönderilmez.

**Ne değildir:**

- **İnsan incelemesinin yerine geçmez.** Üretilen her test, kütüphaneye alınmadan
  önce bir test mühendisi tarafından okunmalıdır (bkz. [Bölüm 9](#9-sonuçları-yorumlama-ve-üretilen-testi-gözden-geçirme)).
  Yapay zekâ modelleri zaman zaman yanlış elemanı seçebilir veya beklentinizi yanlış
  yorumlayabilir.
- **Her senaryoyu otomatikleştiremez.** CAPTCHA, dosya yükleme, tarayıcı onay
  pencereleri gibi durumlar desteklenmez (bkz. [Bölüm 17](#17-bilinen-sınırlamalar)).
- **Deterministik değildir.** Aynı senaryo iki kez çalıştırıldığında farklı (ama
  ikisi de geçerli) adımlarla test üretilebilir. Bir kez üretilip onaylanan `.spec.ts`
  ise tamamen deterministiktir ve yapay zekâ olmadan koşar.

**Güvenlik ağları:** Araç, “yeşil yanan ama hiçbir şey kanıtlamayan” test üretmemek
için bilinçli olarak tutucu davranır:

- Senaryonun hedefine ulaşamayan keşif **kaydedilmez** (yarım test yeşil geçerdi).
- En az bir doğrulama (assert) içermeyen test **kaydedilmez**.
- Senaryoda tırnak içinde yazdığınız beklenti (`'Sipariş alındı'`) doğrulanmadan
  senaryo bitmiş sayılmaz.
- Keşif sırasında başarısız olan bir doğrulama teste olduğu gibi yazılır; test
  dürüstçe **kırmızı** yanar.

---

## 2. Sistem Gereksinimleri ve Beklenen Süreler

### Yazılım

| Araç | Sürüm | Not |
| --- | --- | --- |
| Node.js | **22 LTS** veya üzeri | https://nodejs.org |
| Ollama | güncel | https://ollama.com |
| Java (JRE) | 11 veya üzeri | **Yalnızca Allure raporu için.** Yoksa testler yine koşar, rapor üretilmez. |
| Git | herhangi | Test kütüphanesini makineler arasında paylaşmak için |

### Donanım ve model seçimi

| Model | Gereken RAM / VRAM | Kalite | Not |
| --- | --- | --- | --- |
| `qwen2.5:3b` | ~4 GB | Düşük | Yalnızca deneme amaçlı; sayfada olmayan eleman uydurabiliyor |
| `qwen2.5-coder:7b` | ~8 GB | İyi | **Önerilen varsayılan** |
| `qwen2.5-coder:14b` | ~16 GB | Çok iyi | Karmaşık formlar ve uzun akışlar için |
| `qwen2.5-coder:32b` | ~24-32 GB | En iyi | Güçlü bir sunucuda, ağ üzerinden kullanım için (bkz. Bölüm 14) |

### Ölçülmüş süreler

Aşağıdaki değerler 4 GB VRAM'li dizüstü bir ekran kartı (RTX 3050 Laptop), i7-11800H
ve 16 GB RAM ile `qwen2.5-coder:7b` kullanılarak ölçülmüştür:

| Senaryo | Adım | Toplam süre (plan + keşif + koşum + rapor) |
| --- | --- | --- |
| Giriş yap + sayfa doğrula | 4 | ~50-60 sn |
| Giriş yap + sepete ekle + sayaç doğrula | 5 | ~50-65 sn |
| iframe içinde giriş + mesaj doğrula | 4-5 | ~50-80 sn |

- **GPU'suz** bir makinede süreler belirgin şekilde uzar (adım başına 30-90 sn
  olabilir). Böyle makinelerde `.env` içinde `LLM_TIMEOUT_MS` değerini artırın veya
  modeli güçlü bir sunucuda çalıştırıp ağ üzerinden kullanın.
- Süre, AI'ın **testi üretme** süresidir. Üretilen test daha sonra yapay zekâ
  olmadan, birkaç saniyede koşar.

---

## 3. Hızlı Başlangıç

```bash
# 1. Projeyi klonla
git clone https://github.com/Bulutdogukan/Test-Otomasyon-AI.git
cd Test-Otomasyon-AI

# 2. Bağımlılıkları kur (package-lock.json'daki birebir sürümler)
npm ci

# 3. Playwright tarayıcısını yükle
npx playwright install chromium

# 4. Ollama modelini indir (Ollama uygulaması açık olmalı)
ollama pull qwen2.5-coder:7b

# 5. Ayar dosyasını oluştur
cp .env.example .env            # Windows: copy .env.example .env

# 6. Sunucuyu başlat
npm start
```

Tarayıcıda `http://localhost:3000` adresini açın.

> **Windows:** `Vakifbank_QA_Baslat.bat` dosyasına çift tıklamanız yeterlidir. Betik;
> Node.js'i kontrol eder, ilk çalıştırmada bağımlılıkları kurar, `.env` yoksa
> oluşturur, Chromium'u indirir, Ollama'ya ulaşılıp ulaşılamadığını kontrol eder ve
> arayüzü açar. **Ollama modelini (`ollama pull`) bir kez elle indirmeniz gerekir.**
>
> **macOS:** İlk seferde `chmod +x MacMini_QA_Baslat.command`, ardından çift tıklayın.
> Aynı adımları yapar.

Kurulumun doğru olduğunu Ollama gerektirmeden kontrol etmek için:

```bash
npm run test:unit     # 21 birim testi; tamamı geçmeli
```

---

## 4. Web Arayüzü ile Test Üretme

### Arayüz yapısı

- **Sol panel:** Hedef URL, senaryo, model, kayıt klasörü ve seçenekler
- **Sağ panel:** Canlı loglar ve üretilen kod (`.spec.ts` / `.feature` sekmeleri)

### Adım adım

1. **Hedef URL:** Test edilecek sayfanın adresi. İç ağ adresleri de kabul edilir
   (`http://localhost:8080`, `https://test.kurum.local`).
2. **Senaryo:** Ne yapılacağını ve **neyin doğrulanacağını** yazın (bkz. Bölüm 5).
   Gherkin formatında da yazabilirsiniz.
3. **Opsiyonel ayarlar:**
   - **AI Modeli:** Ollama'da kurulu modeller listelenir; boşsa `.env`'deki model.
   - **Test Klasörü:** Testlerin kaydedileceği klasör. Boşsa `tests/generated/`.
   - **Uzak Sunucuda Çalıştır:** `.env`'de `GRID_WS_ENDPOINT` tanımlıysa keşif ve
     koşum uzak tarayıcıda yapılır.
   - **Hatada Video / Ekran Görüntüsü:** Başarısız testlerde medya kaydı.
4. **Testi Başlat.** Sağ panelde sırasıyla şunlar görünür:
   1. **Planlama:** Senaryo Gherkin'e çevrilir.
   2. **Keşif:** Tarayıcı açılır, AI her adımda ekranı okuyup bir sonraki eylemi seçer.
   3. **Derleme:** Başarılı adımlar `.spec.ts` dosyasına dönüştürülür.
   4. **Koşum:** Üretilen test, yapay zekâ olmadan baştan çalıştırılır.
   5. **Rapor:** Allure raporu üretilir.

Bitince kod alt panelde görünür, **İndir** ile kaydedilebilir, **Rapor** ile Allure açılır.

**Dosyadan yükleme:** `.txt`, `.feature` veya `.md` dosyasını sürükleyip bırakın; içerik
senaryo alanına yazılır, URL doluysa test otomatik başlar.

> Aynı anda **tek bir** test üretimi veya toplu koşum çalışabilir. İkinci istek,
> ilki bitene kadar reddedilir.

---

## 5. İyi Senaryo Nasıl Yazılır

Küçük yerel modeller, açık ve somut senaryolarda çok daha başarılıdır.

### Kurallar

1. **Somut değerler verin.** Kullanıcı adı, ürün adı, aranacak kelime vb.
2. **Beklenen sonucu açıkça yazın ve tırnak içine alın.** Araç, tırnak içindeki
   beklentiyi doğrulamadan senaryoyu bitmiş saymaz.
3. **Bir senaryo = bir iş akışı.** “Giriş yap, profil güncelle, çıkış yap, tekrar
   giriş yap, sipariş ver” gibi uzun zincirleri bölün.
4. **Şifreleri senaryoya yazmayın**, yer tutucu kullanın (Bölüm 6).
5. **Ekrandaki metinleri ekranda yazdığı gibi kullanın** (“Giriş Yap” butonu).

### Örnekler

| ❌ Zayıf | ✅ İyi |
| --- | --- |
| `giriş yap` | `standard_user kullanıcı adı ve {{QA_SECRET_PASSWORD}} şifresiyle giriş yap, 'Products' başlığının göründüğünü doğrula` |
| `sepeti test et` | `ilk ürünü sepete ekle ve sepet simgesinde '1' yazdığını doğrula` |
| `arama çalışıyor mu bak` | `arama kutusuna 'kredi kartı' yaz, Enter'a bas ve sonuç sayfasında 'kredi kartı' metninin geçtiğini doğrula` |
| `kayıt ol` | `kayıt formunu RANDOM_EMAIL e-postası ve 'Test Kullanıcı' adıyla doldur, 'Kaydınız alındı' mesajını doğrula` |

### Özel değerler

| Değer | Anlamı |
| --- | --- |
| `{{QA_SECRET_XXX}}` | `.env`'deki gizli değer (Bölüm 6) |
| `RANDOM_EMAIL` | Her koşumda benzersiz bir e-posta (`test_<zaman>@mail.com`); kayıt testleri ikinci koşumda “e-posta zaten kayıtlı” hatası vermez |

---

## 6. Şifreler ve Gizli Test Verileri

Üretilen testler git'e commit edildiği için şifreler **asla** testlerin içine düz
metin olarak yazılmamalıdır.

**1. Gizli değeri `.env` dosyasına ekleyin** (`QA_SECRET_` önekiyle):

```env
QA_SECRET_PASSWORD=GercekSifre123
QA_SECRET_ADMIN_PASSWORD=BaskaSifre456
```

**2. Senaryoda yer tutucuyu kullanın:**

```
ali kullanıcı adı ve {{QA_SECRET_PASSWORD}} şifresiyle giriş yap, 'Hoş geldiniz' mesajını doğrula
```

**Sonuç:**

- Yapay zekâ modeli şifreyi hiç görmez, yalnızca yer tutucuyu görür.
- Tarayıcıya gerçek şifre yazılır.
- Üretilen test şifre yerine `secret("QA_SECRET_PASSWORD")` içerir ve koşarken değeri
  `.env`'den okur. `.env`'de tanımlı değilse test açık bir hata mesajıyla durur.
- Arayüz ve terminal loglarında gizli değerler `{{QA_SECRET_PASSWORD}}` olarak maskelenir.

> **Şifreyi senaryoya yanlışlıkla düz yazarsanız:** Değer `.env`'deki bir
> `QA_SECRET_` değeriyle eşleşiyorsa araç onu otomatik olarak yer tutucuya çevirir.
> Eşleşmiyorsa ve bir şifre alanına yazılıyorsa logda **uyarı** görürsünüz; o test
> şifreyi düz metin olarak içerecektir. Commit etmeden önce düzeltin.

---

## 7. SSO / MFA / SMS-OTP ile Korunan Uygulamalar

Kurumsal tek oturum açma (SSO), iki faktörlü doğrulama veya SMS kodu otomatikleştirilemez.
Bunun yerine **bir kez elle giriş yapıp oturumu kaydedersiniz**; keşif ve üretilen tüm
testler bu oturumla, giriş yapılmış olarak başlar.

**1. Oturumu kaydedin.** Açılan tarayıcıda normal şekilde giriş yapın (SSO, MFA dahil),
ardından pencereyi kapatın:

```bash
npx playwright codegen --save-storage=auth/oturum.json https://uygulama.kurum.local
```

**2. `.env` dosyasına ekleyin:**

```env
STORAGE_STATE=auth/oturum.json
```

**3.** Senaryolarınızı artık giriş yapılmış ekrandan başlayacak şekilde yazın.

> - `auth/` klasörü `.gitignore`'dadır. Oturum dosyası çerez/token içerir; **paylaşmayın,
>   commit etmeyin.**
> - Oturumların bir ömrü vardır. Testler giriş ekranına düşmeye başlarsa 1. adımı
>   tekrarlayın.
> - Mümkünse bu iş için MFA'sı test ortamında kapatılmış ayrı bir **test kullanıcısı**
>   kullanın.

---

## 8. İç Ağ Uygulamaları ve iframe İçeren Sayfalar

**İç ağ:** `localhost`, `10.x.x.x`, `192.168.x.x` ve kurum içi alan adları varsayılan
olarak **serbesttir**. Sunucu ağa açılıp başkalarıyla paylaşılıyorsa iki kısıt
uygulanabilir:

```env
# Yalnızca bu alan adlarına izin ver (*. joker desteklenir)
QA_ALLOWED_HOSTS=*.kurum.local,test.ornek.com.tr

# İç ağ / loopback adreslerini tamamen kapat
QA_BLOCK_PRIVATE_URLS=true
```

`file://`, `javascript:` gibi tehlikeli adres şemaları her durumda reddedilir.

**Kendinden imzalı sertifika:** İç test ortamı tarayıcıda “bağlantınız gizli değil” uyarısı
veriyorsa (self-signed sertifika) keşif ve testler sayfayı açamaz. Yalnızca güvendiğiniz iç
ortamlar için `.env` dosyasına `IGNORE_HTTPS_ERRORS=true` ekleyin. Daha doğru çözüm, kurum
kök sertifikasını işletim sistemine tanıtmaktır.

**iframe ve shadow DOM:** Sayfadaki görünür iframe'lerin (ödeme formları, eski portal
ekranları) ve açık shadow DOM'un (web component'ler) içi otomatik taranır. Üretilen
testte iframe içindeki adımlar şöyle görünür:

```ts
await page.frameLocator("iframe#odeme").locator("input[name=\"kartNo\"]").first().fill("...");
```

**Dinamik id'ler:** `ember1234`, `ctl00_...`, `j_idt12`, `:r1:` gibi her yüklemede
değişen id'ler otomatik tanınır. Bunların yerine `data-testid`, `name`, `aria-label`
gibi kararlı öznitelikler tercih edilir. Uygulamanıza `data-testid` öznitelikleri
eklemek, üretilen testlerin kalıcılığını en çok artıran tek adımdır.

---

## 9. Sonuçları Yorumlama ve Üretilen Testi Gözden Geçirme

Bir üretim üç şekilde sonuçlanabilir:

| Sonuç | Logda görünen | Anlamı | Ne yapmalı |
| --- | --- | --- | --- |
| ✅ **Yeşil** | `1 passed` | Test üretildi, kaydedildi ve AI olmadan baştan koşturulup geçti. | Testi gözden geçirip commit edin. |
| ❌ **Kırmızı** | `1 failed` + “doğrulama keşif sırasında BAŞARISIZ oldu” uyarısı | Test kaydedildi ama bir doğrulama tutmuyor. Ya uygulamada gerçek bir hata var ya da AI yanlış bir beklenti / yanlış veri kullandı. | Allure raporundaki ekran görüntüsüne bakın. Gerçek hata ise kaydedin; değilse senaryoyu netleştirip yeniden üretin. |
| ⛔ **Kaydedilmedi** | `Keşif tamamlanamadı: ...` + başarıyla uygulanan adımların listesi | AI senaryoyu sonuna kadar götüremedi. Yarım bir test kaydedilmedi. | Nedeni logda yazar. Senaryoyu netleştirin, daha büyük bir model seçin veya `MAX_DISCOVERY_LOOPS` değerini artırın. |

### Gözden geçirme kontrol listesi (commit etmeden önce)

- [ ] Doğrulamalar (`expect(...)`) **sizin beklediğiniz** sonucu mu kontrol ediyor, yoksa
      yalnızca “ekranda bir şey var” mı diyor?
- [ ] Doldurulan değerler senaryodakiyle aynı mı (büyük/küçük harf dahil)?
- [ ] Test içinde düz metin şifre, token veya kişisel veri var mı? (`secret(...)` olmalı)
- [ ] Locator'lar kararlı mı? (`data-testid`, `name` iyi; uzun metin eşleşmeleri ve
      `nth=` kırılgandır)
- [ ] Test, başka bir testin bıraktığı veriye (sepette ürün, kayıtlı kullanıcı) bağlı mı?

Üretilen `.spec.ts` dosyaları standart Playwright testleridir; elle düzenlenebilir.
`.feature` dosyası yalnızca belgeleme amaçlıdır, koşumu etkilemez.

---

## 10. Terminal (CLI) ile Test Üretme

```bash
node ai-agent2.js <URL> "<senaryo>" [--grid]
```

```bash
node ai-agent2.js https://www.saucedemo.com "standard_user ve {{QA_SECRET_PASSWORD}} ile giriş yap, 'Products' başlığını doğrula"
node ai-agent2.js http://localhost:8080 "..." --grid
node ai-agent2.js --help
```

CLI arayüzle aynı boru hattını ve aynı URL kurallarını kullanır. Sonuçlar
`tests/generated/` altına kaydedilir. Çıkış kodu: `0` = test geçti, `1` = test
kırmızı ya da üretilemedi (CI betiklerinde kullanılabilir).

---

## 11. Toplu Test Koşumu

Biriken tüm testleri tek seferde paralel çalıştırmak için:

- **Arayüzden:** “Tüm Testleri Paralel Çalıştır”. Seçili klasördeki (alt klasörler dahil)
  veya varsayılan `tests/generated/` altındaki tüm `.spec.ts` dosyaları koşulur.
- **Terminalden:**

```bash
npm run test:all                  # tests/generated/specs
npx playwright test <klasör>      # belirli bir klasör
```

Paralellik `.env` içindeki `PW_WORKERS` ile, kararsız ortamlar için yeniden deneme
`PW_RETRIES` ile ayarlanır. Toplu koşum yapay zekâ kullanmaz; Ollama kapalıyken de çalışır.

---

## 12. Allure Raporları

Rapor üretimi için bilgisayarda **Java (JRE 11+)** kurulu olmalıdır. Java yoksa testler
yine koşar; logda “Allure ... koduyla bitti” uyarısı görünür ve rapor üretilmez.

- **Arayüzden:** Koşum bitince beliren **Rapor** butonu.
- **Terminalden:**

```bash
npm run report                                         # üret ve aç
npx allure generate ./allure-results -o ./allure-report --clean
npx allure open ./allure-report
```

Rapor; genel özet, test adı (Gherkin'deki `Scenario` başlığı), süre, başarısız testlerde
ekran görüntüsü, trace ve (açıksa) video içerir. Trace dosyası adım adım ekran
kaydıdır: `npx playwright show-trace <dosya>.zip`.

---

## 13. Docker ile Çalıştırma

```bash
docker compose up --build
```

Bu komut Ollama'yı ve QA sunucusunu (resmi Playwright imajı + Java) birlikte başlatır.
Arayüz `http://localhost:3000` adresinde açılır. Varsayılan olarak **yalnızca bu
makineden** erişilebilir.

**İlk çalıştırmada model indirme** (Ollama konteyneri boş gelir):

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

| Konu | Açıklama |
| --- | --- |
| Ayarlar | Proje klasöründeki `.env` (varsa) konteynere okunur; `QA_SECRET_*`, `APP_TOKEN` vb. buradan gelir. |
| Ağa açmak | `docker-compose.yml` içinde `"127.0.0.1:3000:3000"` → `"3000:3000"` yapın **ve** `.env`'de `APP_TOKEN` tanımlayın. |
| GPU | Varsayılan Ollama konteyneri CPU'da çalışır (yavaş). NVIDIA GPU'lu Linux sunucuda `docker-compose.yml` içindeki `deploy` bloğunu açın. macOS'ta Docker GPU kullanamaz; Mac'te Ollama'yı Docker dışında çalıştırın. |
| Klasör seçimi | Konteyner içinde “Klasör Seç” diyaloğu çalışmaz; testler `tests/generated/` altına yazılır. |

```bash
docker compose up -d                 # arka planda
docker compose logs -f qa-server     # logları izle
docker compose down                  # durdur
```

| Hacim | Açıklama |
| --- | --- |
| `./tests/generated` | Üretilen testler (bilgisayarınızla paylaşımlı) |
| `./allure-report` | Derlenmiş rapor |
| `ollama_data` | Ollama modelleri (konteyner silinse de korunur) |

---

## 14. Çoklu Makine Kurulumu

### Güçlü bir makinenin modelini kullanma

Güçlü makinede (ör. Mac Mini / GPU sunucusu):

```bash
OLLAMA_HOST=0.0.0.0 ollama serve
ollama pull qwen2.5-coder:32b
```

Kullanıcı makinesinin `.env` dosyasında:

```env
OLLAMA_MODEL=qwen2.5-coder:32b
OLLAMA_URL=http://<sunucu-ip>:11434/api/chat
```

> Ollama'nın kendi kimlik doğrulaması yoktur. `OLLAMA_HOST=0.0.0.0` yalnızca güvenilir
> iç ağda kullanılmalı, güvenlik duvarıyla ilgili makinelere kısıtlanmalıdır.

### Uzak tarayıcı (Grid)

Uzak makinede `npx playwright run-server --port 4444`, kullanıcı makinesinde:

```env
GRID_WS_ENDPOINT=ws://<sunucu-ip>:4444/
```

Arayüzde “Uzak Sunucuda Çalıştır” işaretleyin veya CLI'da `--grid` ekleyin.
Vanilla Selenium Grid 4 Playwright protokolünü **desteklemez**.

### Arayüzü ağa açma

```env
HOST=0.0.0.0
APP_TOKEN=<openssl rand -hex 24 çıktısı>
```

`APP_TOKEN` olmadan ağa açılan sunucu açılışta büyük bir uyarı basar: aynı ağdaki herkes
o makinede tarayıcı açtırıp test koşturabilir.

### Test kütüphanesini paylaşma

```bash
git add tests/generated && git commit -m "test: yeni giriş senaryosu" && git push
# diğer makinede
git pull && npm run test:all
```

---

## 15. Yapılandırma Rehberi (.env)

Tüm değişkenler `.env.example` içinde açıklamalıdır. Özet:

### Zorunlu

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `OLLAMA_MODEL` | Kullanılacak model | `qwen2.5-coder:7b` |
| `OLLAMA_URL` | Ollama API adresi | `http://127.0.0.1:11434/api/chat` |

### Güvenlik ve erişim

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `HOST` | `127.0.0.1` yalnızca bu makine, `0.0.0.0` ağa açık | `127.0.0.1` |
| `APP_TOKEN` | Arayüz erişim anahtarı (ağa açıkken zorunlu tutun) | boş (kapalı) |
| `QA_ALLOWED_ROOT` | Seçilebilecek klasörleri tek köke kısıtlar | boş |
| `QA_ALLOWED_HOSTS` | İzin verilen hedef alan adları (`*.kurum.local`) | boş (hepsi) |
| `QA_BLOCK_PRIVATE_URLS` | `true`: iç ağ / localhost hedeflerini engeller | `false` |
| `QA_SECRET_*` | Gizli test verileri (Bölüm 6) | — |
| `STORAGE_STATE` | Kayıtlı oturum dosyası (Bölüm 7) | boş |
| `IGNORE_HTTPS_ERRORS` | `true`: kendinden imzalı sertifikaları kabul et (yalnızca iç ortam) | `false` |

### Test koşumu

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `SAVE_VIDEO` | `off`, `on`, `retain-on-failure` | `off` |
| `SAVE_SCREENSHOT` | `off`, `on`, `only-on-failure` | `only-on-failure` |
| `PW_WORKERS` | Paralel worker sayısı | CPU'ya göre |
| `PW_RETRIES` | Başarısız testi yeniden deneme sayısı | `0` |
| `HEADLESS` | `true`: ekransız tarayıcı | `false` |

### AI keşif ve performans

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `MAX_DISCOVERY_LOOPS` | Keşfin azami adım sayısı | `25` |
| `MAX_DOM_ELEMENTS` | Modele gönderilen azami eleman | `60` |
| `MAX_HEAL_ATTEMPTS` | Self-healing tur sayısı | `2` |
| `OLLAMA_NUM_CTX` | Model bağlam penceresi (token) | `8192` |
| `LLM_TIMEOUT_MS` | Tek LLM çağrısı zaman aşımı | `120000` |
| `STEP_SETTLE_MS` | Eylem sonrası sayfanın durulması için azami bekleme | `3000` |
| `ACTION_TIMEOUT_MS` | Tek tıklama/doldurma zaman aşımı | `10000` |

### Grid

| Değişken | Açıklama |
| --- | --- |
| `GRID_WS_ENDPOINT` | Playwright protokolü WebSocket adresi |

---

## 16. Sorun Giderme

**“OLLAMA_URL ve OLLAMA_MODEL tanımlanması gerekli”**
`.env` yok veya eksik: `cp .env.example .env`

**“Ollama'ya ulaşılamıyor”**
Ollama uygulamasını açın veya `ollama serve` çalıştırın; `ollama list` ile modelin
indirildiğini kontrol edin.

**“model 'xxx' not found”**
`ollama pull <model-adı>` ile modeli indirin.

**“Agent 2 timeout yedi”**
Model, zaman aşımı içinde yanıt veremedi (genellikle GPU'suz makine). `LLM_TIMEOUT_MS`
değerini artırın, daha küçük bir model seçin veya modeli güçlü bir sunucuda çalıştırın.

**“Keşif tamamlanamadı: ...”**
Yarım test kaydedilmedi. Logdaki nedene göre:
- *self-healing ile de yürütülemedi* → Eleman ekranda yok veya AI yanlış elemanı arıyor.
  Senaryodaki buton/alan adını ekrandaki gibi yazın.
- *daha önce yapılmış bir adımı tekrarlıyor* → Senaryo belirsiz. Beklenen sonucu tırnak
  içinde açıkça yazın.
- *Azami adım sayısına ulaşıldı* → Senaryoyu bölün veya `MAX_DISCOVERY_LOOPS` değerini artırın.
- *açıkça beklenen ... hiçbir doğrulamayla kontrol edilmedi* → Tırnak içindeki metin
  ekranda hiç görünmüyor olabilir. Yazımı kontrol edin.

**Test keşifte geçti, koşumda kırmızı**
Allure raporundaki ekran görüntüsüne ve trace'e bakın. Sık nedenler: sayfanın geç
yüklenmesi (`PW_RETRIES=1` deneyin), testin önceki bir koşumun bıraktığı veriye bağlı
olması, oturum dosyasının süresinin dolması.

**“QA_SECRET_XXX .env dosyasında tanımlı değil”**
Senaryo veya test bir yer tutucu kullanıyor ama değer `.env`'de yok. Ekleyin.

**“STORAGE_STATE dosyası bulunamadı”**
Bölüm 7'deki `codegen --save-storage` komutunu çalıştırın veya yolu düzeltin.

**“İç ağ / loopback adresleri bu kurulumda kapalı”**
`.env`'de `QA_BLOCK_PRIVATE_URLS=true` tanımlı. İç ağ testi yapacaksanız kaldırın.

**“No tests found”**
`.spec.ts` dosyalarının seçtiğiniz klasörde olduğundan emin olun. Spec'ler koşumdan
önce `.batch-staging/` klasörüne kopyalanır; bu klasörü elle düzenlemeyin.

**Tarayıcı açılmıyor (SSH, sunucu, Docker)**
`.env` dosyasına `HEADLESS=true` ekleyin.

**Rapor üretilmiyor**
Java kurulu mu? `java -version`

**Windows'ta “Klasör Seç” çalışmıyor**
Yolu metin kutusuna elle yazabilirsiniz. PowerShell betik politikası engelliyorsa:
`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

**“net::ERR_CERT_AUTHORITY_INVALID” / sertifika hatası**
İç ortam kendinden imzalı sertifika kullanıyor. Bölüm 8'deki `IGNORE_HTTPS_ERRORS` ayarına bakın.

**Port 3000 kullanımda**
`.env` içinde `PORT=3001`.

---

## 17. Bilinen Sınırlamalar

Bu maddeler bilinçli kapsam dışıdır veya henüz desteklenmemektedir. Kurumsal kullanım
öncesi değerlendirilmelidir.

| Konu | Durum | Geçici çözüm |
| --- | --- | --- |
| CAPTCHA | Desteklenmez | Test ortamında CAPTCHA'yı kapatın |
| SSO / MFA / SMS-OTP | Otomatik yapılamaz | Kayıtlı oturum (Bölüm 7) |
| Dosya yükleme, indirme | Desteklenmez | Üretilen teste elle `setInputFiles` ekleyin |
| Tarayıcı onay pencereleri (`alert`, `confirm`) | Playwright varsayılan olarak **reddeder**: “Silmek istediğinize emin misiniz?” iptal edilir | Teste elle `page.on('dialog', d => d.accept())` ekleyin |
| Çift tıklama, sağ tık, klavye ile tablo gezme | Desteklenmez | Elle ekleyin |
| Aynı butona art arda birden çok basma (“+” ile adet artırma) | Döngü koruması bunu tekrar sayabilir | Adımları ayrı senaryolara bölün veya testi elle düzenleyin |
| Kapalı (`closed`) shadow DOM, canvas/harita/grafik içerikleri | Görülemez | `data-testid` ile erişilebilir bir alternatif eklenmeli |
| Görünmez (0×0) iframe'ler | Bilinçli olarak taranmaz (izleme/analitik çerçeveleri) | — |
| Tarayıcı | Keşif ve varsayılan koşum yalnızca Chromium | `playwright.config.ts` içindeki diğer projeleri açın (Firefox/WebKit tarayıcılarını kurmak gerekir) |
| Eşzamanlılık | Bir sunucuda aynı anda tek üretim/koşum | Kullanıcı başına ayrı kurulum |
| Test verisi hazırlama / temizleme | Yok; testler uygulamanın o anki verisine bağlıdır | Testleri bağımsız veriyle tasarlayın (`RANDOM_EMAIL`) |
| Uzun iş akışları | Varsayılan 25 adım | Senaryoyu bölün veya `MAX_DISCOVERY_LOOPS` |
| AI belirsizliği | Model yanlış eleman seçebilir, ekranda gördüğünü doğrulayabilir | Bölüm 9 kontrol listesi; tırnaklı beklentiler |
| Dil | Arayüz ve loglar Türkçe; hedef sitenin dili serbesttir | — |

---

## 18. Sık Sorulan Sorular

**Verilerimiz dışarı çıkıyor mu?**
Hayır. Model Ollama ile yerelde (veya sizin belirlediğiniz bir iç sunucuda) çalışır.
Proje hiçbir bulut LLM servisine bağlanmaz. Tarayıcı yalnızca sizin verdiğiniz hedef
adrese gider.

**Hangi sitelerde çalışır?**
Halka açık siteler ve kurum içi uygulamalar (iç ağ varsayılan olarak serbesttir).
Erişimi kısıtlamak için Bölüm 8'deki ayarlara bakın.

**Üretilen testleri elle düzenleyebilir miyim?**
Evet. `.spec.ts` dosyaları standart Playwright testleridir. `.feature` dosyası yalnızca
belgeleme amaçlıdır.

**CI/CD'de koşabilir miyim?**
**Üretilmiş** testler evet: standart Playwright testleri oldukları için `npx playwright test`
ile herhangi bir CI'da koşar (CI ortamına `.env` içindeki `QA_SECRET_*` değerlerini
gizli değişken olarak tanımlayın). **Test üretimi** (AI keşfi) ise canlı Ollama gerektirdiği
için CI'da değil, geliştirici makinesinde yapılır. Projenin kendi CI'ı tip kontrolü,
sözdizimi kontrolü ve birim testlerini koşar.

**Birden fazla kişi aynı sunucuyu kullanabilir mi?**
Sırayla, evet; aynı anda hayır. Aynı anda gelen ikinci istek reddedilir. Yoğun ekip
kullanımında her kullanıcı kendi makinesinde çalıştırmalıdır.

**Bulut LLM (OpenAI, Claude vb.) kullanabilir miyim?**
Şu anki sürüm yalnızca Ollama destekler.

**Self-healing nedir?**
Keşif sırasında bir eleman bulunamaz veya tıklanamazsa ekran yeniden taranır ve modelden
aynı amaca uyan alternatif bir eleman istenir (en fazla `MAX_HEAL_ATTEMPTS` tur). Bu
yalnızca **üretim** sırasında çalışır; kaydedilen test sabittir.

**`force: true` neden kullanılmıyor?**
Playwright'ın görünürlük ve tıklanabilirlik kontrollerini atlar. Gerçekte tıklanamayan
bir butona tıklanıp testin yeşil yanmasına yol açar. Proje bunu bilinçli olarak reddeder.

---

## 19. Sürüm Notları

### v2.1.0 — Kurumsal kullanıma hazırlık

**Yeni kabiliyetler**

| Özellik | Açıklama | Ayrıntı |
| --- | --- | --- |
| İç ağ hedefleri | `localhost`, `10.x`, `192.168.x` ve kurum içi alan adları test edilebilir; `QA_ALLOWED_HOSTS` / `QA_BLOCK_PRIVATE_URLS` ile kısıtlanabilir | Bölüm 8 |
| iframe ve shadow DOM | İçleri taranır; testler `frameLocator` zinciri kullanır | Bölüm 8 |
| Kararlı locator'lar | `data-testid` > kararlı `id` > `name` > `aria-label`; dinamik id'ler (`ember1234`, `ctl00_`, `:r1:`) son çare | Bölüm 8 |
| Gizli test verileri | `QA_SECRET_*` + `{{QA_SECRET_X}}` yer tutucusu; testlerde, feature dosyalarında ve loglarda düz metin yok | Bölüm 6 |
| SSO / MFA / OTP | Kayıtlı oturum (`STORAGE_STATE`) | Bölüm 7 |
| Kendinden imzalı sertifika | İsteğe bağlı `IGNORE_HTTPS_ERRORS` | Bölüm 8 |
| `RANDOM_EMAIL` | Derlenen testte her koşumda yeni e-posta üretilir | Bölüm 5 |
| Okunur rapor adları | Allure'da test adı Gherkin'deki `Feature` / `Scenario` başlığıdır | Bölüm 12 |
| Birim testleri | 22 test, Ollama gerektirmez, CI'da koşar | `npm run test:unit` |

**Güvenilirlik (yanlış-pozitif test önleme)**

- Hedefe ulaşmayan keşif ve doğrulama içermeyen test **kaydedilmez**.
- Tırnak içindeki beklentiler doğrulanmadan senaryo bitmiş sayılmaz.
- Keşif ajanı, planlayıcının yeniden yazdığı metnin yanında kullanıcının özgün metnini de görür
  (değerler bozulmaz: “ali” → “Ali” hatası giderildi).
- Model daha önce yaptığı adımları tekrarlarsa uyarılır; ısrar ederse döngü tespit edilir.
- Modele sayfanın adresi ve başlığı ile her doğrulamanın geçip geçmediği bildirilir.
- Kapalı yan menüler (`aria-hidden`, `inert`, ekran dışı) ve tıklanamaz kapsayıcılar (`[Bölüm]`)
  ayrıştırılır; sayfada olmayan locator 10 sn beklenmeden self-healing'e devredilir.

**Düzeltilen hatalar**

- Docker kurulumu açılışta çöküyordu (`@playwright/test` dev bağımlılığıydı, Java yoktu,
  rapor hacmi silinmeye çalışılıyordu).
- `[id*="ad"]` reklam filtresi `header`, `loading` gibi id'lerin altındaki elemanları eliyordu.
- `position: fixed` elemanlar (sabit menüler, modal butonları) görünmez sayılıyordu.
- Ollama bağlam penceresi (4096) uzun istemleri sessizce kırpıyordu; varsayılan 8192 oldu.
  Geçersiz `max_tokens` yerine `num_predict` kullanılıyor; Ollama JSON modu açık.
- Uzun metinli eleman locator'ları 60 karakterde kesildiği için hiç bulunamıyordu.
- Node 24'teki DEP0190 (`shell: true` + argüman dizisi) uyarısı giderildi.

**Varsayılan değişiklikleri (yükseltirken dikkat)**

| Ayar | Eski | Yeni |
| --- | --- | --- |
| `HOST` | `0.0.0.0` (ağa açık) | `127.0.0.1` (yalnızca bu makine) |
| İç ağ hedefleri | Engelli | Serbest |
| `MAX_DISCOVERY_LOOPS` | 15 | 25 |
| LLM zaman aşımı | 60 sn | 120 sn (`LLM_TIMEOUT_MS`) |
| Adım sonrası bekleme | Sabit 3 sn | Sayfa durulunca (en fazla `STEP_SETTLE_MS`) |
| Node.js | 18+ | 22+ |
| Docker portları | Tüm arayüzler | Yalnızca `127.0.0.1` |

**Doğrulama:** Bu sürüm, `qwen2.5-coder:7b` ile saucedemo.com (giriş, sepete ekleme) ve
localhost üzerinde iframe içinde giriş formu bulunan, dinamik id'li örnek bir portalda uçtan
uca denenmiştir. Bilerek yanlış beklenti verilen senaryonun kırmızı test ürettiği, arayüz
üzerinden yapılan koşumda ve Docker konteynerinde tam boru hattının (rapor dahil) çalıştığı
doğrulanmıştır. Kurumun kendi uygulamalarında sistematik deneme yapılmamıştır; bkz. Bölüm 17.

---

## Hızlı Referans

```bash
npm start                         # Sunucu + arayüz (http://localhost:3000)
node ai-agent2.js <url> "<s>"     # CLI ile test üret
npm run test:all                  # Kütüphanedeki tüm testleri paralel koş
npm run report                    # Allure raporu üret ve aç (Java gerekir)
npm run test:unit                 # Birim testleri (Ollama gerekmez)
npm run typecheck                 # TypeScript tip kontrolü
docker compose up --build         # Docker ile tam kurulum
npx playwright codegen --save-storage=auth/oturum.json <url>   # SSO oturumu kaydet
```

```
.env                    → Tüm ayarlar ve gizli test verileri
tests/generated/        → AI'ın ürettiği testler (feature + spec) — git'e dahil
auth/                   → Kayıtlı oturumlar — git'e DAHİL DEĞİL
allure-report/          → Son koşumun raporu
```
