@echo off
chcp 65001 >nul
title Otonom Test Merkezi
color 0E
cd /d "%~dp0"

echo ==================================================
echo        OTONOM TEST MERKEZI BASLATILIYOR
echo ==================================================
echo Lutfen testler bitene kadar bu pencereyi KAPATMAYIN!
echo.

:: 1. Node.js kurulu mu?
where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden 22 LTS veya uzeri surumu kurun.
    pause
    exit /b 1
)

:: 2. Ilk kurulum: bagimliliklar
if not exist "node_modules" (
    echo Ilk kurulum: bagimliliklar yukleniyor, bu birkac dakika surebilir...
    call npm ci
    if errorlevel 1 (
        echo [HATA] npm ci basarisiz oldu. Internet / proxy ayarlarini kontrol edin.
        pause
        exit /b 1
    )
)

:: 3. .env yoksa ornekten olustur
if not exist ".env" (
    echo .env dosyasi bulunamadi, .env.example kopyalaniyor...
    copy ".env.example" ".env" >nul
)

:: 4. Playwright tarayicisi (yoksa indirir, varsa atlar)
echo Playwright tarayicisi kontrol ediliyor...
call npx playwright install chromium
echo.

:: 5. Ollama calisiyor mu? (calismiyorsa uyar, yine de devam et)
curl -s -m 3 http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 (
    echo [UYARI] Ollama'ya ulasilamadi. Ollama uygulamasini baslatin veya ayri bir pencerede "ollama serve" calistirin.
    echo         Uzak bir Ollama kullaniyorsaniz .env icindeki OLLAMA_URL dogruysa bu uyariyi yok sayin.
    echo.
)

:: Sunucunun ayaga kalkmasi icin 2 saniye bekler ve ardindan tarayiciyi otomatik acar
start cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Node.js sunucusunu calistirir
node server.js

pause
