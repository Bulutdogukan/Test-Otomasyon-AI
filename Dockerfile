FROM node:18-slim

# Playwright sistem bagimliklarini kur
RUN npx playwright install-deps chromium

WORKDIR /app

# Bagimlik dosyalarini kopyala ve kur
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Playwright Chromium tarayicisini kur
RUN npx playwright install chromium

# Kaynak kodu kopyala
COPY . .

# Uretilen test ve rapor klasorlerini hacimlere birak
VOLUME ["/app/tests/generated", "/app/allure-report"]

EXPOSE 3000

# Headless modda calistir (konteyner icinde ekran yok)
ENV HEADLESS=true
ENV HOST=0.0.0.0

CMD ["node", "server.js"]
