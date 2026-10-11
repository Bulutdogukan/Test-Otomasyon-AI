# Katkida Bulunma Rehberi

Bu projeye katkida bulunmak istiyorsaniz asagidaki kurallara uymaniz beklenir.

---

## Gelistirme Ortami Kurulumu

```bash
git clone https://github.com/Bulutdogukan/Test-Otomasyon-AI.git
cd Test-Otomasyon-AI
npm install
npx playwright install
cp .env.example .env   # ardindan .env dosyasini doldurun
```

Ollama'nin kurulu ve calisir durumda olmasi gerekir (`ollama serve`).

---

## Dal (Branch) Kurallari

- `main` dali her zaman calisir ve kararli olmalidir.
- Yeni calismalara `main`'den yeni bir dal acarak baslayin.
- Dal adlandirma: `<tip>/<kisa-aciklama>` (ornek: `feat/docker-support`, `fix/cors-config`).

| Tip        | Kullanim                              |
| ---------- | ------------------------------------- |
| `feat/`    | Yeni ozellik                          |
| `fix/`     | Hata duzeltmesi                       |
| `refactor/`| Davranisi degistirmeyen yeniden yapilandirma |
| `docs/`    | Yalnizca dokumantasyon degisikligi    |
| `test/`    | Test ekleme/duzeltme                  |

---

## Commit Mesaji Formati

```
<tip>: kisa aciklama (Turkce)
```

Ornekler:
- `feat: arayuzden model secimi eklendi`
- `fix: CORS yapilandirmasi duzeltildi`
- `docs: README kurulum adimlari guncellendi`

---

## Pull Request Sureci

1. Degisikliklerinizi kendi dalinizda commit edin.
2. `npm run typecheck` ile tip kontrolunden gectiginden emin olun.
3. PR acmadan once `main`'i daliniza merge edin (catismalari cozun).
4. PR basligini commit mesaji formatinda yazin.
5. PR aciklamasinda **ne degisti** ve **neden degisti** yayin.

---

## Kod Kurallari

- **Dil:** Kod yorumlari, log mesajlari ve arayuz **Turkce**. LLM'e giden sistem prompt'lari **Ingilizce**.
- **LLM ciktisi guvenilmeyen girdidir.** Uretilen koda giren her metin `JSON.stringify()` ile kacislanir.
- **`{ force: true }` kullanilmaz.** Gorunurluk kontrollerini bypass etmek yanlis-pozitif test uretir.
- **Eylem adlari `src/utils/steps.js`'ten normalize edilir.** Yeni eylem ekliyorsaniz tek noktadan ekleyin.
- **Bos beklenen degerli dogrulama uretilmez.** `validateAssert()` bunu hem kesifte hem derlemede reddeder.

Detaylar icin `CLAUDE.md` dosyasindaki "Yerlesik Kurallar" bolumune bakin.

---

## Test Ekleme

- Elle yazilan testler `tests/` altina (ornek: `tests/advanced_scenarios.spec.ts`).
- AI uretimi testler `tests/generated/` altinda otomatik birikir; elle mudahale etmeyin.
- Her PR oncesi `npm run typecheck` gecmelidir.

---

## Guvenlik

- `.env` dosyasini ASLA commit etmeyin.
- Uretilen testlerde gercek kimlik bilgisi bulunmamalidir.
- Yeni endpoint ekliyorsaniz `requireAuth` middleware'ini uygulayin.
