@echo off
title Otonom Test Merkezi
color 0E

echo ==================================================
echo        OTONOM TEST MERKEZI BASLATILIYOR
echo ==================================================
echo Lutfen testler bitene kadar bu pencereyi KAPATMAYIN!
echo.

:: Playwright tarayicisini kur (yoksa indirir, varsa atlar)
echo Playwright tarayicisi kontrol ediliyor...
call npx playwright install chromium
echo.

:: Sunucunun ayaga kalkmasi icin 2 saniye bekler ve ardindan tarayiciyi otomatik acar
start cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Arka planda Node.js sunucusunu calistirir
node server.js

pause