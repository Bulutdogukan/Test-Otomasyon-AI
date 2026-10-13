# CLAUDE.md — Proje Rehberi

Bu dosya, Claude Code'un projeyi her oturumda sıfırdan keşfetmek zorunda kalmaması için
yazılmıştır. Mimari kararları, yerleşik kuralları ve bilinen açık maddeleri içerir.

---

## Proje Nedir

Doğal dilde yazılmış test senaryolarını, hedef sayfanın **canlı DOM'unu okuyarak**
çalıştırılabilir Playwright testlerine çeviren otonom bir test otomasyon platformu.
LLM olarak yerel **Ollama** (varsayılan `qwen2.5-coder:7b`) kullanılır; hiçbir bulut
LLM servisine bağımlılık yoktur.

**Çalışma dili:** Kod yorumları, log mesajları, arayüz ve dokümantasyon **Türkçe**.
LLM'e giden sistem promptları İngilizce (küçük modeller İngilizce talimatlara daha
tutarlı uyuyor). Bu ayrımı koru.

---

## Komutlar

```bash
npm start           # Sunucu + arayüz  -> http://localhost:3000
npm run typecheck   # tsc --noEmit (CI'ın da çalıştırdığı kapı)
npm run test:unit   # tests/unit — Ollama gerektirmez (DOM testleri headless Chromium)
npm run test:all    # tests/generated/specs altındaki tüm testleri paralel koş
npm run report      # Allure raporu üret ve aç
node ai-agent2.js <url> "<senaryo>" [--grid]   # CLI modu
```

Ön koşullar: Node 22+, `npx playwright install`, çalışan bir Ollama örneği.
`.env` yoksa `.env.example` kopyalanır — tüm değişkenler orada açıklamalı.

---

## Mimari: Boru Hattı

`src/core/orchestrator.js` → `executeAutonomousFlow()` her şeyi sırayla yürütür:

1. **Planlama** — `agentPlanTest()` doğal dili BDD/Gherkin `.feature` metnine çevirir.
2. **Keşif** — Gerçek tarayıcı açılır. Döngü: canlı DOM taranır (iframe + açık shadow DOM dahil) → alaka sırasına göre
   kırpılır → LLM'den TEK bir sonraki adım istenir → adım uygulanır → tekrar.
   Adım başarısız olursa **self-healing** devreye girer: DOM yeniden taranır, LLM'den
   aynı niyete uyan alternatif locator istenir, yeniden denenir.
3. **Derleme** — Keşif hedefe ulaştıysa (DONE + en az bir assert) adım geçmişi `compiler.service.js`
   ile statik `.spec.ts`'e çevrilir. Ulaşmadıysa hiçbir şey yazılmaz, akış hata ile biter.
4. **Koşum + Rapor** — Spec `.batch-staging/`'e kopyalanıp Playwright ile koşulur, Allure üretilir.

| Dosya | Sorumluluk |
| --- | --- |
| `server.js` | Express + Socket.io, erişim koruması, eşzamanlılık kilitleri, canlı log köprüsü |
| `src/core/orchestrator.js` | Keşif döngüsü, self-healing, boru hattı orkestrasyonu |
| `src/services/ai.service.js` | Ollama çağrıları (planner / locator / self-healing), timeout + retry |
| `src/services/compiler.service.js` | Adım geçmişi → `.spec.ts` kod üretimi |
| `src/services/dom.scanner.js` | Canlı DOM taraması: iframe zinciri, shadow DOM, kararlı locator önceliği, gürültü eleme |
| `src/services/dom.ranker.js` | DOM kırpma (bağımlılıksız, deterministik "fakir adamın RAG'ı") |
| `src/utils/steps.js` | Eylem normalizasyonu + doğrulama kuralları (keşif ve derleme paylaşır) |
| `src/utils/staging.js` | Koşum öncesi spec kopyalama — modül çözümlemesi için kritik |
| `src/utils/locator.js` | iframe locator zinciri (`a |> b`) — keşif çalıştırır, derleyici koda döker |
| `src/utils/secrets.js` | `QA_SECRET_*` yer tutucuları, çözümleme ve maskeleme |
| `src/utils/url.js` | Hedef URL politikası — arayüz ve CLI ortak |
| `src/utils/npx.js` | npx süreçlerini tek metin komutla başlatır (Node 24 DEP0190) |
| `src/utils/reportDirs.js` | Rapor klasörlerinin İÇERİĞİNİ temizler (Docker hacmi silinemez) |
| `public/index.html` | Tek dosya arayüz (harici bağımlılık yok) |

---

## Yerleşik Kurallar — Bunları Bozma

Aşağıdakiler bilinçli kararlardır; her biri gerçek bir hatanın sonucudur.

**LLM çıktısı güvenilmeyen girdidir.** Üretilen koda giren her metin `JSON.stringify()`
ile kaçışlanır. Elle tırnak değiştirme YAPMA — backtick/newline ile kod enjekte edilebilir.
Test planı blok yoruma gömülürken `*/` dizisi zararsızlaştırılır (`safeForBlockComment`).

**Boş beklenen değerli doğrulama üretilmez.** `new RegExp('')` her URL'yi,
`toContainText('')` her metni eşler — yani "hep yeşil yanan ama hiçbir şey doğrulamayan"
test. `validateAssert()` bunu hem keşifte hem derlemede reddeder.

**Feature ve spec birlikte yazılır.** İkisi de yalnızca keşif gerçekten adım ürettiğinde,
boru hattının 3. adımında diske düşer. Erken yazmak, keşif yarıda kalınca kalıcı
kütüphanede eşi olmayan `.feature` dosyaları bırakıyordu.

**Hedefe ulaşmayan keşif kaydedilmez.** `goalReached` yalnızca model DONE dediğinde, geçen bir
assert tekrarlandığında veya hedef doğrulandıktan sonra döngüye girildiğinde true olur; her
durumda en az bir assert şarttır. Self-healing tükenmesi, adım sınırı, döngü → feature/spec
YAZILMAZ. Eskiden yarım keşif derlenip yeşil geçiyordu.

**Tırnaklı beklentiler doğrulanmadan bitirilmez.** Kullanıcı senaryosundaki '...' / "..." metinleri
`missingExpectations()` ile kontrol edilir (Türkçe ek kesmeleri hariç). Model ekranda gördüğünü
doğrulayıp bitirmeye eğilimli; bu kontrol onu engeller.

**Keşif ajanı özgün metni de görür.** Planlayıcı değerleri bozabiliyor ("ali" → "Ali");
`goalText` = Gherkin planı + kullanıcının özgün (maskelenmiş) metni.

**Gizli değerler düz metin olarak hiçbir yere yazılmaz.** LLM ve stepHistory yalnızca
`{{QA_SECRET_X}}` görür; tarayıcıya yazarken `resolveSecretValue`, spec'te `secret("QA_SECRET_X")`,
feature/log'da `redactSecrets`. Literal gizli değerler de `toStoredValue` ile yer tutucuya çevrilir.

**İç ağ varsayılan olarak serbesttir.** Araç kurumun kendi staging ortamlarını test etmek için var;
eski SSRF engeli asıl kullanımı engelliyordu. Kısıtlama yalnızca `QA_BLOCK_PRIVATE_URLS` /
`QA_ALLOWED_HOSTS` ile. Arayüz ve CLI `src/utils/url.js`'i paylaşır.

**Rapor klasörlerinin kendisi silinmez, içi boşaltılır.** Docker'da `allure-report` bir hacimdir;
`rmSync(dir)` EBUSY ile her koşumu çökertiyordu.

**`{ force: true }` kullanılmaz.** Görünürlük/etkileşilebilirlik kontrollerini bypass
etmek yanlış-pozitif test üretir.

**Eylem adları `src/utils/steps.js`'ten normalize edilir.** Keşif ve derleme aynı
kuralları paylaşmalı; iki tarafa ayrı ayrı `if (action === 'click')` yazma.
Türkçe `İ` harfinin `toLowerCase()` tuzağı `canonicalKey()` içinde çözülmüştür.

**Aynı anda tek akış.** `isFlowRunning` / `isBatchRunning` kilitleri; orchestrator
global `process.env`'e ve sabit klasörlere yazdığı için paralel akışlar birbirini bozar.

**Log köprüsü hem stdout hem stderr'ı hooklar.** `logger.logError()` stderr'a yazar;
yalnızca stdout hooklanırsa kritik hatalar arayüze hiç düşmez.

**Spec'ler `.batch-staging/`'e kopyalanıp oradan koşulur.** Kullanıcının seçtiği klasör
proje dışında olabilir; doğrudan koşulursa Node `@playwright/test`'i yanlış bir
`node_modules`'ten çözer ve "No tests found" hatası verir.

**npx yalnızca `spawnNpx` ile başlatılır.** Windows'ta .cmd için shell gerekir; argüman dizisi +
`shell: true` Node 24'te DEP0190 verir. Komut tek metin olarak, güvenli karakter kontrolüyle kurulur.

**Klasör yolları CLI argümanına girmez.** `PW_TEST_DIR` env'i ile config'e iletilir
(boşluklu yol / kaçışlama sorunu yaşanmaz).

---

## Güvenlik

Sunucu varsayılan olarak `HOST=127.0.0.1` dinler (yalnızca bu makine). `.env` içindeki `APP_TOKEN` tanımlıysa Socket.io el sıkışması, `/upload` ve `/allure`
bu anahtarı ister; arayüz giriş ekranı gösterir. Tanımlı değilse koruma kapalıdır ve
sunucu açılışta uyarır (tek makinede lokal kullanım için kabul edilebilir).

Ağa açmak için `HOST=0.0.0.0` + `APP_TOKEN` birlikte verilir. Ek sıkılaştırma: `QA_ALLOWED_ROOT`
(seçilebilecek klasörleri tek köke kısıtla), `QA_ALLOWED_HOSTS`, `QA_BLOCK_PRIVATE_URLS`.
Kayıtlı oturumlar (`STORAGE_STATE`) `auth/` altındadır ve gitignore'dadır.

`.env` asla commit edilmez. Üretilen testlerde gerçek kimlik bilgisi bulunmamalı.

---

## Test Kütüphanesi

`tests/generated/features/` ve `tests/generated/specs/` **kasıtlı olarak git'e dahildir**
(`.gitignore` içinde bu not vardır). `.spec.ts` canlı DOM keşfinden derlendiği için
`.feature`'dan tek başına yeniden üretilemez; iki makinenin aynı test setini koşabilmesi
için ikisi de commit edilir.

`tests/advanced_scenarios.spec.ts` ve `pages/` ise elle yazılmış, AI'dan bağımsız
örneklerdir (saucedemo.com üzerinde Page Object deseni).

---

## Ortam Notları

Keşif fazı varsayılan olarak **görünür** tarayıcı açar. Ekransız ortamda (SSH ile
bağlanılan Mac Mini, Docker, CI) `.env` dosyasına `HEADLESS=true` ekle.

Grid: `chromium.connect` **Playwright protokolü** ister. Vanilla Selenium Grid 4 uymaz —
`npx playwright run-server` veya Aerokube Moon kullan.

CI (`.github/workflows/ci.yml`) tip kontrolü (`tsc --noEmit`) + sözdizimi (`node --check`) +
birim testleri (`npm run test:unit`, headless Chromium ile) koşar. AI ile test üretimi bilinçli olarak CI'da yapılmaz:
canlı Ollama ve gerçek hedef sitelere erişim gerekir.

Docker: resmi Playwright imajı (`mcr.microsoft.com/playwright`, sürüm package-lock ile aynı
olmalı) + Allure için JRE. `@playwright/test` ve allure paketleri çalışma anında gerektiği
için `dependencies` altındadır (`npm ci --omit=dev` onları atlamamalı). Portlar varsayılan
olarak yalnızca 127.0.0.1'e yayınlanır. Compose, `OLLAMA_MODEL`'i projedeki `.env`'den okur.

---

## Bilinen Açık Maddeler

- Eşzamanlılık: orchestrator global `process.env`'e ve sabit klasörlere yazar; çok kullanıcı
  için iş kuyruğu + akış başına izole çalışma dizini gerekir.
- Desteklenmeyen eylemler: dosya yükleme, tarayıcı dialog'ları (Playwright varsayılanı reddeder),
  çift/sağ tık. Aynı eylemin bilinçli tekrarı döngü korumasına takılır.
- LLM kalitesi: 3B modeller sayfada olmayan eleman uydurur; 7B önerilen alt sınır.
- Gelecek planları: çoklu LLM desteği, AI destekli hata analizi.
