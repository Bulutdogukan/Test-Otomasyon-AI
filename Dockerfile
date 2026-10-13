# Resmi Playwright imajı: Node.js + Chromium + tüm sistem bağımlılıkları hazır gelir.
# Sürüm package-lock.json'daki playwright sürümüyle AYNI olmalıdır (tarayıcı uyumu).
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

# Allure rapor üretimi Java ister (allure-commandline bir Java uygulamasıdır).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıklar. Çalışma anında @playwright/test ve allure gerektiği için bunlar
# "dependencies" altındadır; --omit=dev yalnızca typescript/@types'ı dışarıda bırakır.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Kaynak kodu kopyala
COPY . .

# Üretilen test ve rapor klasörlerini hacimlere bırak
VOLUME ["/app/tests/generated", "/app/allure-report"]

EXPOSE 3000

# Konteyner içinde ekran yok; port yayını docker-compose.yml'de yalnızca
# 127.0.0.1'e yapılır (konteyner içi 0.0.0.0 dışarıya açık demek değildir).
ENV HEADLESS=true
ENV HOST=0.0.0.0

CMD ["node", "server.js"]
