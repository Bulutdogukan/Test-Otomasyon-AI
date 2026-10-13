#!/bin/bash
# macOS (Mac mini) başlatıcı — Windows'taki Vakifbank_QA_Baslat.bat karşılığı.
# İlk kullanımdan önce: chmod +x MacMini_QA_Baslat.command

cd "$(dirname "$0")"

echo "=================================================="
echo "       OTONOM TEST MERKEZI BASLATILIYOR (macOS)"
echo "=================================================="
echo "Lütfen testler bitene kadar bu pencereyi KAPATMAYIN!"
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js bulunamadı. https://nodejs.org adresinden 22 LTS veya üzerini kurun."
    read -r -p "Kapatmak için Enter'a basın..."
    exit 1
fi

# Bağımlılıklar kurulu değilse kur (ilk çalıştırma için)
if [ ! -d "node_modules" ]; then
    echo "📦 İlk kurulum: bağımlılıklar yükleniyor..."
    npm ci || { echo "❌ npm ci başarısız oldu."; exit 1; }
fi

# .env yoksa örnekten oluştur
if [ ! -f ".env" ]; then
    echo "📝 .env bulunamadı, .env.example kopyalanıyor..."
    cp .env.example .env
fi

# Playwright tarayıcısı (yoksa indirir, varsa atlar)
npx playwright install chromium

# Ollama erişilebilir mi? (uzak Ollama kullanılıyorsa uyarı yok sayılabilir)
if ! curl -s -m 3 http://127.0.0.1:11434/api/tags >/dev/null; then
    echo "⚠️ Ollama'ya ulaşılamadı. Ollama uygulamasını açın veya 'ollama serve' çalıştırın."
fi

# Sunucu ayağa kalkınca tarayıcıyı otomatik aç
( sleep 2 && open "http://localhost:${PORT:-3000}" ) &

node server.js
