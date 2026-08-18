@echo off
rem Arranca el agente de impresion sin pasar por PowerShell.
rem
rem Sirve cuando la computadora tiene deshabilitada la ejecucion de scripts y no
rem se puede (o no se quiere) cambiar la politica: los .cmd no dependen de ella.
rem
rem Para que arranque solo con Windows: teclea  shell:startup  en el menu Inicio
rem y deja ahi un acceso directo a este archivo.

title Impresora Turkana
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias...
  call npm.cmd install --omit=dev
)

if not exist .env (
  echo.
  echo FALTA EL ARCHIVO .env
  echo Copia .env.example como .env y llenalo. Ver README.md.
  echo.
  pause
  exit /b 1
)

echo  IMPRESORA TURKANA - deja esta ventana abierta.
echo  Aqui se ve cada ticket que sale. Para cerrarla, Ctrl+C.
echo.

:bucle
node agent.mjs
echo.
echo El agente se detuvo. Reintentando en 10 segundos... (Ctrl+C para salir)
timeout /t 10 /nobreak >nul
goto bucle
