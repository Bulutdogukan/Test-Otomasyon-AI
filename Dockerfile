FROM node:18-slim

WORKDIR /app

# Bagimlik dosyalarini kopyala ve kur
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Playwright sistem bagimliklari + Chromium tarayicisi
RUN npx playwright install-deps chromium && npx playwright install chromium

# Kaynak kodu kopyala
COPY . .

# Uretilen test ve rapor klasorlerini hacimlere birak
VOLUME ["/app/tests/generated", "/app/allure-report"]

EXPOSE 3000

# Headless modda calistir (konteyner icinde ekran yok)
ENV HEADLESS=true
ENV HOST=0.0.0.0

CMD ["node", "server.js"]
