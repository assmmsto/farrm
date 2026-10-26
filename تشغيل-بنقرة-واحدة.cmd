@echo off
chcp 65001 >nul
title مختبر الصيدلي - تشغيل بنقرة واحدة (بلا قيود CORS)
cd /d "%~dp0"

set "HTML=%CD%\dist-apk\pharmacy-lab-html\pharmacy-lab.html"
if not exist "%HTML%" set "HTML=%CD%\dist-standalone\pharmacy-lab.html"
if not exist "%HTML%" (
  echo [!] لم أجد ملف pharmacy-lab.html
  echo     ضع هذا الملف بجانب مجلد dist-apk أو شغّل: npm run build:standalone
  pause
  exit /b 1
)

set "PROFILE=%TEMP%\pharmacy-lab-nosec"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%EDGE%" (
  echo [!] لم أجد Edge أو Chrome. افتح الملف يدوياً في المتصفح.
  pause
  exit /b 1
)

echo [i] أشغّل المتصفح بملف تعريف مؤقت معطّل فيه فحص CORS محلياً فقط...
echo [i] هذا الملف المؤقت منفصل تماماً عن متصفحك الشخصي.
start "" "%EDGE%" --user-data-dir="%PROFILE%" --disable-web-security --no-first-run --new-window "file:///%HTML:\=/%"

echo.
echo [OK] فُتح التطبيق. من زر "إعداد المزوّد" ضع رابط بروكسيك ومفتاحك ثم اضغط فحص الاتصال.
timeout /t 8 >nul
