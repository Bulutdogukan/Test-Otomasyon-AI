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
npm run test:all    # tests/generated/specs altındaki tüm testleri paralel koş
npm run report      # Allure raporu üret ve aç
node ai-agent2.js <url> "<senaryo>" [--grid]   # CLI modu
```

Ön koşullar: Node 18+, `npx playwright install`, çalışan bir Ollama örneği.
`.env` yoksa `.env.example` kopyalanır — tüm değişkenler orada açıklamalı.

---

## Mimari: Boru Hattı

`src/core/orchestrator.js` → `executeAutonomousFlow()` her şeyi sırayla yürütür:

1. **Planlama** — `agentPlanTest()` doğal dili BDD/Gherkin `.feature` metnine çevirir.
2. **Keşif** — Gerçek tarayıcı açılır. Döngü: canlı DOM taranır → alaka sırasına göre
   kırpılır → LLM'den TEK bir sonraki adım istenir → adım uygulanır → tekrar.
   Adım başarısız olursa **self-healing** devreye girer: DOM yeniden taranır, LLM'den
   aynı niyete uyan alternatif locator istenir, yeniden denenir.
3. **Derleme** — Biriken adım geçmişi `compiler.service.js` ile statik `.spec.ts`'e çevrilir.
4. **Koşum + Rapor** — Spec `.batch-staging/`'e kopyalanıp Playwright ile koşulur, Allure üretilir.

| Dosya | Sorumluluk |
| --- | --- |
| `server.js` | Express + Socket.io, erişim koruması, eşzamanlılık kilitleri, canlı log köprüsü |
| `src/core/orchestrator.js` | Keşif döngüsü, self-healing, boru hattı orkestrasyonu |
| `src/services/ai.service.js` | Ollama çağrıları (planner / locator / self-healing), timeout + retry |
| `src/services/compiler.service.js` | Adım geçmişi → `.spec.ts` kod üretimi |
| `src/services/dom.ranker.js` | DOM kırpma (bağımlılıksız, deterministik "fakir adamın RAG'ı") |
| `src/utils/steps.js` | Eylem normalizasyonu + doğrulama kuralları (keşif ve derleme paylaşır) |
| `src/utils/staging.js` | Koşum öncesi spec kopyalama — modül çözümlemesi için kritik |
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

**Klasör yolları CLI argümanına girmez.** `PW_TEST_DIR` env'i ile config'e iletilir
(boşluklu yol / kaçışlama sorunu yaşanmaz).

---

## Güvenlik

`.env` içindeki `APP_TOKEN` tanımlıysa Socket.io el sıkışması, `/upload` ve `/allure`
bu anahtarı ister; arayüz giriş ekranı gösterir. Tanımlı değilse koruma kapalıdır ve
sunucu açılışta uyarır (tek makinede lokal kullanım için kabul edilebilir).

Ek sıkılaştırma: `HOST=127.0.0.1` (ağa hiç açma), `QA_ALLOWED_ROOT` (seçilebilecek
klasörleri tek köke kısıtla).

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

CI (`.github/workflows/ci.yml`) yalnızca tip kontrolü + sözdizimi kapısıdır. Gerçek test
koşumu bilinçli olarak CI'da yapılmaz: canlı Ollama ve gerçek hedef sitelere erişim gerekir.

---

## Bilinen Açık Maddeler

- `tests/generated/features/2026-07-08T11-23-03-923Z_feature-kullanici-login-ekranina-giris-yapma.feature`
  eski koddan kalma **yetim** bir dosya (eşi olan `.spec.ts` yok). Silinebilir.
- 22 Temmuz 2026 tarihli 4 üretilmiş test dosyası henüz commit edilmemiş olabilir.
- `linkedin-gorseller/` klasörü proje dışı içerik; git'e eklenmemeli.
- Gelecek planları: çoklu LLM desteği, Selenium fallback, Docker/K8s, AI destekli hata analizi.
