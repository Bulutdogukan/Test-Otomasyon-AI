@echo off
title Vakifbank QA AI Panel
color 0E

echo ==================================================
echo       VAKIFBANK OTONOM TEST MERKEZI BASLATILIYOR
echo ==================================================
echo Lutfen testler bitene kadar bu pencereyi KAPATMAYIN!
echo.

:: Sunucunun ayaga kalkmasi icin 2 saniye bekler ve ardindan tarayiciyi otomatik acar
start cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Arka planda Node.js sunucusunu calistirir
node server.js

pause