@echo off
chcp 65001 >nul
title مختبر الصيدلي - الوسيط المحلي + المتصفح العادي
cd /d "%~dp0"

set "HTML=%CD%\dist-apk\pharmacy-lab-html\pharmacy-lab.html"
if not exist "%HTML%" set "HTML=%CD%\dist-standalone\pharmacy-lab.html"
if not exist "%HTML%" (
  echo [!] لم أجد ملف pharmacy-lab.html
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js غير مثبّت. استخدم ملف "تشغيل-بنقرة-واحدة.cmd" بدلاً منه.
  pause
  exit /b 1
)

echo [i] أشغّل الوسيط المحلي على المنفذ 8787 ... (اترك هذه النافذة مفتوحة)
start "pharmacy-lab-relay" /min cmd /c "node ""%CD%\standalone\local-relay.mjs"" & pause"
timeout /t 3 >nul

echo [OK] الوسيط يعمل. افتح التطبيق وضع كرابط: http://127.0.0.1:8787/v1
start "" "%HTML%"
echo.
echo [i] للاستخدام من متصفح الهاتف على نفس الواي فاي: استخدم عنوان جهازك من ipconfig بدل 127.0.0.1
timeout /t 10 >nul
