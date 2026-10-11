# Kullanim Kilavuzu — AI Test Otomasyon Platformu

Bu belge, projeyi ilk kez kullanan birinin sifirdan kurulumu yapip test uretebilmesini
hedefler. Adim adim anlatim ve sik sorulan sorulari icerir.

---

## Icindekiler

1. [Hizli Baslangic (5 Dakikada Calistir)](#1-hizli-baslangic)
2. [Web Arayuzu ile Test Uretme](#2-web-arayuzu-ile-test-uretme)
3. [Terminal (CLI) ile Test Uretme](#3-terminal-cli-ile-test-uretme)
4. [Toplu Test Kosumu](#4-toplu-test-kosumu)
5. [Allure Raporlarini Goruntuleme](#5-allure-raporlarini-goruntuleme)
6. [Docker ile Calistirma](#6-docker-ile-calistirma)
7. [Coklu Makine Kurulumu (Windows + Mac Mini)](#7-coklu-makine-kurulumu)
8. [Yapilandirma Rehberi (.env)](#8-yapilandirma-rehberi)
9. [Sorun Giderme (Troubleshooting)](#9-sorun-giderme)
10. [Sik Sorulan Sorular (SSS)](#10-sik-sorulan-sorular)

---

## 1. Hizli Baslangic

### On Kosullar

| Arac       | Minimum Surum | Kurulum                        |
| ---------- | ------------- | ------------------------------ |
| Node.js    | 18+           | https://nodejs.org             |
| Ollama     | herhangi      | https://ollama.com             |
| Git        | herhangi      | https://git-scm.com            |

### Adimlar

```bash
# 1. Projeyi klonla
git clone https://github.com/Bulutdogukan/Test-Otomasyon-AI.git
cd Test-Otomasyon-AI

# 2. Bagimliliklari kur
npm install

# 3. Playwright tarayicisini yukle
npx playwright install chromium

# 4. Ollama modelini indir ve baslat
ollama pull qwen2.5-coder:7b
ollama serve                    # ayri bir terminalde acik birakin

# 5. Ortam degiskenlerini ayarla
cp .env.example .env            # Windows PowerShell: copy .env.example .env
# .env dosyasini acip kontrol edin (varsayilanlar cogu ortam icin yeterlidir)

# 6. Sunucuyu baslat
node server.js
```

Tarayicinizda `http://localhost:3000` adresine gidin — arayuz hazir.

> **Windows kullanicilari:** Alternatif olarak `Vakifbank_QA_Baslat.bat` dosyasina
> cift tiklayarak tum adimlari otomatik calistirabilirsniniz.
>
> **macOS kullanicilari:** `chmod +x MacMini_QA_Baslat.command` ve ardindan cift tiklayin.

---

## 2. Web Arayuzu ile Test Uretme

### Arayuz Yapisi

Arayuz iki bolumden olusur:

- **Sol panel (Sidebar):** Test ayarlari ve baslat butonlari
- **Sag panel:** Canli konsol loglari ve uretilen kod

### Adim Adim Test Uretme

**Adim 1 — Hedef URL girin**

`Hedef URL` alanina test edilecek web sitesinin adresini yazin.

```
https://www.saucedemo.com
```

**Adim 2 — Senaryo yazin**

`Senaryo` alanina dogal dilde ne yapilmasini istediginizi yazin.

```
standard_user kullanici adiyla ve secret_sauce sifresiyle giris yap,
urunler sayfasinin acildigini dogrula
```

Alternatif olarak Gherkin formatinda da yazabilirsiniz:

```gherkin
Feature: Giris Testi
  Scenario: Basarili giris
    Given kullanici giris sayfasinda
    When standard_user ve secret_sauce ile giris yapar
    Then urunler sayfasi gorunur olmali
```

**Adim 3 — Opsiyonel ayarlar**

- **AI Modeli:** Ollama'da birden fazla model kuruluysa acilir listeden secim yapin.
  Varsayilan `.env` dosyasindaki modeldir.
- **Test Klasoru:** Testlerin kaydedilecegi klasor. Bos birakilirsa `tests/generated/`
  kullanilir. "Klasor Sec" butonuyla native diyalog acilir.
- **Uzak Sunucuda Calistir:** Grid/uzak tarayici kullanmak icin isaretleyin
  (`.env`'de `GRID_WS_ENDPOINT` tanimli olmalidir).
- **Hatada Video / Ekran Goruntusu:** Test basarisiz olursa medya kaydeder.

**Adim 4 — Testi baslatin**

`Testi Baslat` butonuna basin. Sag panelde canli loglar akmaya baslar:

1. **Planlama** — Dogal dil BDD/Gherkin'e cevrilir
2. **Kesif** — Gercek tarayici acilir, DOM taranir, AI adim adim eylemleri uygular
3. **Derleme** — Basarili adimlar `.spec.ts` Playwright testine donusturulur
4. **Kosum** — Derlenen test calistirilir
5. **Rapor** — Allure raporu uretilir

Test tamamlaninca:
- Uretilen Playwright kodu ve Gherkin dosyasi alt panelde gorunur
- `Indir` butonuyla dosyalari bilgisayariniza indirebilirsiniz
- `Rapor` butonu belirir — tiklayinca Allure raporu yeni sekmede acilir

**Adim 5 — Dosyadan yukleme (Opsiyonel)**

Uzun veya hazir senaryolari dosyadan da yukleyebilirsiniz:
- Sidebar'in altindaki "Dosya yukle" alanina `.txt`, `.feature` veya `.md` dosyasi
  surukleyin veya tiklayarak secin
- Icerik otomatik olarak senaryo alanina yazilir
- URL zaten doluysa test otomatik baslar

---

## 3. Terminal (CLI) ile Test Uretme

Web arayuzu olmadan dogrudan terminalden test uretebilirsiniz:

```bash
node ai-agent2.js <URL> "<senaryo>"
```

### Ornekler

```bash
# Temel kullanim
node ai-agent2.js https://www.saucedemo.com "standard_user ile giris yap"

# Uzak tarayicida (Grid) calistir
node ai-agent2.js https://www.saucedemo.com "arama yap ve sonuclari kontrol et" --grid

# Yardim
node ai-agent2.js --help
```

### CLI Ciktisi

CLI ayni boru hattini kullanir: planlama → kesif → derleme → kosum → rapor.
Sonuclar `tests/generated/` altina kaydedilir.

---

## 4. Toplu Test Kosumu

Biriken tum testleri tek seferde paralel calistirmak icin:

### Web arayuzunden

`Toplu Kos` butonuna tiklayin. Secili klasordeki (veya varsayilan `tests/generated/`)
tum `.spec.ts` dosyalari paralel kosar.

### Terminalden

```bash
# Varsayilan klasor (tests/generated/specs)
npm run test:all

# Belirli bir klasor
npx playwright test <klasor-yolu>
```

### Paralellik Ayari

`.env` dosyasinda `PW_WORKERS` ile ayarlanir:

```env
PW_WORKERS=4      # 4 paralel worker
```

Bos birakilirsa Playwright, makinenin CPU sayisina gore otomatik secer.

---

## 5. Allure Raporlarini Goruntuleme

### Web arayuzunden

Test tamamlandiktan sonra beliren `Rapor` butonuna tiklayin.
Rapor yeni bir tarayici sekmesinde acilir.

### Terminalden

```bash
# Rapor uret ve ac
npm run report

# Sadece uret (acmadan)
npx allure generate ./allure-results -o ./allure-report --clean

# Mevcut raporu ac
npx allure open ./allure-report
```

### Rapor Icerigi

- **Overview:** Genel basari/basarisizlik ozeti
- **Suites:** Test gruplarina gore sonuclar
- **Timeline:** Her testin ne kadar surdugu
- **Hatali testler:** Hatada video ve ekran goruntusu (etkinse)

---

## 6. Docker ile Calistirma

Ollama dahil tum sistemi tek komutla ayaga kaldirabilirsiniz:

```bash
docker compose up
```

Bu komut:
1. Ollama konteynerini baslatir
2. QA sunucusunu derleyip baslatir (headless modda)
3. `http://localhost:3000` adresinde arayuzu sunar

### Ilk calistirmada model indirme

Ollama konteyneri bosta gelir; modeli bir kez cekmeniz gerekir:

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

### Olceklendirme

```bash
# Arka planda calistir
docker compose up -d

# Loglari izle
docker compose logs -f qa-server

# Durdur
docker compose down
```

### Hacimler (Volumes)

| Hacim                    | Aciklama                                    |
| ------------------------ | ------------------------------------------- |
| `./tests/generated`     | Uretilen testler (host ile paylasimli)      |
| `./allure-report`       | Derlenmis rapor (host ile paylasimli)       |
| `ollama_data`           | Ollama modelleri (konteyner yeniden baslarsa korunur) |

---

## 7. Coklu Makine Kurulumu

Iki makine (ornegin Windows masaustu + Mac Mini) koordineli calisabilir.

### Senaryo 1: Mac Mini'nin guclu modelini kullanma

Mac Mini'de:
```bash
OLLAMA_HOST=0.0.0.0 ollama serve
ollama pull qwen2.5-coder:32b
```

Windows `.env` dosyasinda:
```env
OLLAMA_MODEL=qwen2.5-coder:32b
OLLAMA_URL=http://<mac-mini-ip>:11434/api/chat
```

### Senaryo 2: Mac Mini'nin tarayicisini kullanma (Grid)

Mac Mini'de:
```bash
npx playwright run-server --port 4444
```

Windows `.env` dosyasinda:
```env
GRID_WS_ENDPOINT=ws://<mac-mini-ip>:4444/
```

Arayuzde "Uzak Sunucuda Calistir" isaretleyin veya CLI'da `--grid` bayragi ekleyin.

### Senkronizasyon

```bash
# Windows'ta test uret
node ai-agent2.js https://... "..." 

# Git ile paylas
git add tests/generated && git commit -m "yeni test" && git push

# Mac Mini'de cek ve kos
git pull && npm run test:all
```

---

## 8. Yapilandirma Rehberi

Tum ayarlar `.env` dosyasinda yapilir. `.env.example` icinde her degisken aciklamalidir.

### Zorunlu Ayarlar

| Degisken       | Aciklama                                | Varsayilan                              |
| -------------- | --------------------------------------- | --------------------------------------- |
| `OLLAMA_MODEL` | Kullanilacak AI modeli                  | `qwen2.5-coder:7b`                     |
| `OLLAMA_URL`   | Ollama API adresi                       | `http://127.0.0.1:11434/api/chat`       |

### Guvenlik Ayarlari

| Degisken          | Aciklama                                              |
| ----------------- | ----------------------------------------------------- |
| `APP_TOKEN`       | Erisim anahtari. Tanimliysa arayuz sifre sorar        |
| `HOST`            | `127.0.0.1` = sadece lokal, `0.0.0.0` = aga acik     |
| `QA_ALLOWED_ROOT` | Secilebilecek klasorleri tek bir koke kisitlar         |

### Test Kosumu Ayarlari

| Degisken          | Aciklama                              | Varsayilan          |
| ----------------- | ------------------------------------- | ------------------- |
| `SAVE_VIDEO`      | `off`, `on`, `retain-on-failure`      | `off`               |
| `SAVE_SCREENSHOT` | `off`, `on`, `only-on-failure`        | `only-on-failure`   |
| `PW_WORKERS`      | Paralel worker sayisi                 | otomatik (CPU)      |
| `HEADLESS`        | `true` = ekransiz tarayici            | `false` (gorunur)   |

### AI Kesif Ayarlari

| Degisken              | Aciklama                              | Varsayilan |
| --------------------- | ------------------------------------- | ---------- |
| `MAX_DOM_ELEMENTS`    | LLM'e gonderilecek maks eleman sayisi | `60`       |
| `MAX_HEAL_ATTEMPTS`   | Self-healing kurtarma turu            | `2`        |
| `MAX_DISCOVERY_LOOPS` | Kesif dongusunun maks adim sayisi     | `15`       |

### Grid / Uzak Tarayici

| Degisken             | Aciklama                                     |
| -------------------- | -------------------------------------------- |
| `GRID_WS_ENDPOINT`   | Playwright protokolu WebSocket adresi        |

> **Onemli:** `chromium.connect` Playwright protokolu ister. Vanilla Selenium Grid 4
> calisMAZ. `npx playwright run-server` veya Aerokube Moon kullanin.

---

## 9. Sorun Giderme

### "OLLAMA_URL ve OLLAMA_MODEL tanimlanmasi gerekli" hatasi

`.env` dosyasi olusturulmanis veya degiskenler bos. Cozum:

```bash
cp .env.example .env
```

### "Ollama'ya ulasilamiyor" uyarisi

Ollama servisi calismiyor. Cozum:

```bash
ollama serve          # ayri terminalde
ollama list           # modelleri kontrol et
```

### "No tests found" hatasi

- `.spec.ts` dosyalarinin `tests/` altinda oldugundan emin olun
- `PW_TEST_DIR` yanlis bir klasore isaret ediyor olabilir
- Dosyanin `.batch-staging/`'e dogru kopyalandigini kontrol edin

### Tarayici acilmiyor (headless ortam)

SSH, Docker veya ekransiz sunucuda calisiyorsaniz:

```env
HEADLESS=true
```

### Grid baglantisi basarisiz

- `GRID_WS_ENDPOINT`'in dogru oldugunu kontrol edin
- Uzak makinede `npx playwright run-server --port 4444` calistigindan emin olun
- Vanilla Selenium Grid 4 Playwright protokolunu desteklemez

### Test yesillenip ama hicbir sey dogrulamiyor

Bu, modelin yeterince guclenmediginin isaretidir. Cozumler:
- Daha buyuk model kullanin (`qwen2.5-coder:7b` yerine `32b`)
- Senaryo metnini daha acik yazin: "giris yap" yerine
  "standard_user ve secret_sauce ile giris yap, urunler sayfasinin gorunur oldugunu dogrula"
- `MAX_DISCOVERY_LOOPS` degerini artirin

### Windows'ta "Klasor Sec" calismadi

PowerShell execution policy'si engelliyor olabilir:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Port 3000 zaten kullanimda

Baska bir port belirleyin:

```env
PORT=3001
```

---

## 10. Sik Sorulan Sorular

**S: Hangi sitelerde calisir?**

Tum halka acik web sitelerinde calisir. Ozel/ic ag siteleri icin `PRIVATE_IP_RE`
kontrolu devredisidir (SSRF korumsai nedeniyle loopback/ic ag adresleri engellenir).
`.env`'de `HOST=127.0.0.1` ile yalnizca lokal erisim saglayabilirsiniz.

**S: Hangi Ollama modelini kullanmaliyim?**

| Model                    | RAM   | Kalite   | Hiz       |
| ------------------------ | ----- | -------- | --------- |
| `qwen2.5:3b`            | 4 GB  | Dusuk    | Hizli     |
| `qwen2.5-coder:7b`      | 8 GB  | Iyi      | Orta      |
| `qwen2.5-coder:32b`     | 32 GB | Cok iyi  | Yavas     |

Onerilen: `qwen2.5-coder:7b` (en iyi kalite/hiz dengesi).

**S: Uretilen testler nereye kaydedilir?**

- Feature dosyalari: `tests/generated/features/`
- Spec dosyalari: `tests/generated/specs/`
- Her ikisi de git'e dahildir (baska makinede de kosubilmek icin).

**S: Uretilen testleri elle duzenleyebilir miyim?**

Evet, `.spec.ts` dosyalari standart Playwright testleridir. Istediginiz gibi
duzenleyebilirsiniz. Ancak `.feature` dosyasini elle degistirmenin bir etkisi yoktur —
test kosmasi `.spec.ts`'e bakar.

**S: CI/CD'de test kosabilir miyim?**

Hayir (bilerek). Testler canli Ollama ve gercek hedef sitelere erisim gerektirir.
CI yalnizca tip kontrolu (`tsc --noEmit`) ve sozdizimi dogrulamasi yapar.
Toplu kosumu kendi makinenizde `npm run test:all` ile yapin.

**S: Birden fazla kisi ayni anda kullanabilir mi?**

Hayir. Orchestrator global duruma yazdiginden ayni anda tek akis calisabilir.
Ikinci istek otomatik olarak reddedilir. Farkli kullanicilar sirayla calisir.

**S: Bulut LLM (OpenAI, Claude vb.) kullanabilir miyim?**

Suanki surum yalnizca Ollama destekler. Coklu LLM destegi gelecek planlarindadir.

**S: Test basarisiz olursa ne olur?**

- Self-healing mekanizmasi devreye girer: DOM yeniden taranir, AI alternatif locator uretir
- Self-healing de basarisiz olursa kesif durur ve o ana kadarki adimlar kaydedilir
- Basarisiz testler Allure raporunda detaylandirilirir (trace + screenshot + video)

**S: `force: true` neden kullanilmiyor?**

`{ force: true }` Playwright'in gorunurluk/etkilesilebirlik kontrollerini bypass eder.
Bu, gercekte tiklanamayan bir butona tiklayip testin yesil yanmasina neden olur —
yanlis-pozitif. Proje bilingli olarak bunu reddeder.

---

## Hizli Referans Kartlari

### Komutlar

```bash
node server.js                  # Sunucu + arayuz baslat
node ai-agent2.js <url> "<s>"   # CLI ile test uret
npm run test:all                # Tum testleri paralel kos
npm run report                  # Allure raporu uret ve ac
npm run typecheck               # TypeScript tip kontrolu
docker compose up               # Docker ile tam kurulum
```

### Dosya Yapisi (Kullanicinin Bilmesi Gerekenler)

```
.env                 → Tum ayarlar burada
tests/generated/     → AI'in urettigi testler (feature + spec)
allure-report/       → Son kosmun raporu
public/index.html    → Web arayuzu
```
