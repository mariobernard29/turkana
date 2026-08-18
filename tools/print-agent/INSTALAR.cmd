@echo off
rem Instalador de un solo doble clic para la computadora de la tienda.
rem
rem Existe porque instalar.ps1 se topa con dos muros distintos en una maquina
rem recien puesta: la politica de ejecucion de scripts, y la marca de "este
rem archivo vino de internet" que Windows le pone a todo lo que llega en un ZIP
rem o una USB —con esa marca, PowerShell dice que el script no esta firmado
rem digitalmente aunque la politica ya se haya cambiado.
rem
rem Los .cmd no pasan por esa politica, asi que este archivo si arranca siempre,
rem quita la marca de la carpeta entera y corre el instalador de verdad.

title Instalar Impresora Turkana
cd /d "%~dp0"

echo.
echo   INSTALADOR DE LA IMPRESORA TURKANA
echo   ----------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   Falta Node.js.
  echo   Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo   Falta el archivo .env con la configuracion.
  echo   Copia .env.example como .env y llenalo. Ver README.md.
  echo.
  pause
  exit /b 1
)

echo   Preparando...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & '%~dp0instalar.ps1'"

echo.
pause
