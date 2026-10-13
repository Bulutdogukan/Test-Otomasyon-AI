# Katkıda Bulunma Rehberi

Bu projeye katkıda bulunmak istiyorsanız aşağıdaki kurallara uymanız beklenir.

---

## Geliştirme Ortamı Kurulumu

```bash
git clone https://github.com/Bulutdogukan/Test-Otomasyon-AI.git
cd Test-Otomasyon-AI
npm ci
npx playwright install chromium
cp .env.example .env   # ardından .env dosyasını doldurun
```

Node.js 22 LTS veya üzeri gerekir. Test üretimini denemek için Ollama'nın çalışıyor
olması gerekir; birim testleri ve tip kontrolü Ollama olmadan çalışır.

---

## Dal (Branch) Kuralları

- `main` dalı her zaman çalışır ve kararlı olmalıdır.
- Yeni çalışmalara `main`'den yeni bir dal açarak başlayın.
- Dal adlandırma: `<tip>/<kısa-açıklama>` (örnek: `feat/dosya-yukleme`, `fix/iframe-locator`).

| Tip | Kullanım |
| --- | --- |
| `feat/` | Yeni özellik |
| `fix/` | Hata düzeltmesi |
| `refactor/` | Davranışı değiştirmeyen yeniden yapılandırma |
| `docs/` | Yalnızca dokümantasyon değişikliği |
| `test/` | Test ekleme/düzeltme |

---

## Commit Mesajı Formatı

```
<tip>: kısa açıklama (Türkçe)
```

Örnekler:
- `feat: arayüzden model seçimi eklendi`
- `fix: iframe içindeki şifre alanı maskelenmiyordu`
- `docs: kılavuza SSO bölümü eklendi`

---

## Pull Request Süreci

1. Değişikliklerinizi kendi dalınızda commit edin.
2. Aşağıdaki üç kontrolün yerelde geçtiğinden emin olun (CI de aynılarını koşar):
   ```bash
   npm run typecheck
   npm run test:unit
   node --check server.js ai-agent2.js src/**/*.js
   ```
3. Keşif / derleme davranışını değiştirdiyseniz en az bir senaryoyu gerçek Ollama ile
   uçtan uca deneyin ve sonucu PR açıklamasına yazın.
4. PR açmadan önce `main`'i dalınıza alın (çakışmaları çözün).
5. PR açıklamasında **ne değişti** ve **neden değişti** yazın.

---

## Kod Kuralları

- **Dil:** Kod yorumları, log mesajları ve arayüz **Türkçe**. LLM'e giden sistem prompt'ları **İngilizce**.
- **LLM çıktısı güvenilmeyen girdidir.** Üretilen koda giren her metin `JSON.stringify()` ile
  kaçışlanır; locator'lar `locatorExpression()` üzerinden koda dökülür.
- **`{ force: true }` kullanılmaz.** Görünürlük kontrollerini atlamak yanlış-pozitif test üretir.
- **Eylem adları `src/utils/steps.js`'ten normalize edilir.** Yeni eylemi tek noktadan ekleyin;
  keşif (`orchestrator.js`) ve derleme (`compiler.service.js`) aynı kuralları paylaşmalıdır.
- **Boş beklenen değerli doğrulama üretilmez.** `validateAssert()` bunu hem keşifte hem derlemede reddeder.
- **Hedefe ulaşmayan keşif kaydedilmez.** Yarım veya doğrulamasız bir testin kütüphaneye
  girmesine yol açacak değişiklik yapmayın.
- **Gizli değerler düz metin olarak hiçbir yere yazılmaz.** Spec, feature ve loglar
  `src/utils/secrets.js` üzerinden geçer.
- **Hedef URL kuralı tek yerdedir** (`src/utils/url.js`); arayüz ve CLI aynı fonksiyonu kullanır.

Ayrıntılar için `CLAUDE.md` dosyasındaki "Yerleşik Kurallar" bölümüne bakın.

---

## Test Ekleme

- Saf mantık ve DOM tarayıcı testleri `tests/unit/` altına (`node:test`, `npm run test:unit`).
  Bu testler Ollama gerektirmemelidir.
- Elle yazılan Playwright testleri `tests/` altına (örnek: `tests/advanced_scenarios.spec.ts`).
- AI üretimi testler `tests/generated/` altında otomatik birikir. Gözden geçirilip
  onaylanmadan commit edilmemelidir.

---

## Güvenlik

- `.env` dosyasını ve `auth/` klasörünü ASLA commit etmeyin.
- Üretilen testlerde gerçek kimlik bilgisi bulunmamalıdır (`secret("QA_SECRET_...")` kullanılmalı).
- Yeni bir HTTP ucu veya Socket.io olayı ekliyorsanız `requireAuth` / el sıkışma
  korumasının kapsamında olduğundan emin olun.
