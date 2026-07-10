#!/bin/bash
# macOS (Mac mini) başlatıcı — Windows'taki Vakifbank_QA_Baslat.bat karşılığı.
# İlk kullanımdan önce: chmod +x MacMini_QA_Baslat.command

cd "$(dirname "$0")"

echo "=================================================="
echo "       OTONOM TEST MERKEZI BASLATILIYOR (macOS)"
echo "=================================================="
echo "Lütfen testler bitene kadar bu pencereyi KAPATMAYIN!"
echo ""

# Bağımlılıklar kurulu değilse kur (ilk çalıştırma için)
if [ ! -d "node_modules" ]; then
    echo "📦 İlk kurulum: bağımlılıklar yükleniyor..."
    npm install
    npx playwright install chromium
fi

# Sunucu ayağa kalkınca tarayıcıyı otomatik aç
( sleep 2 && open "http://localhost:${PORT:-3000}" ) &

node server.js
