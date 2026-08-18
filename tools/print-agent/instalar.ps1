# Deja el agente de impresión corriendo solo en esta PC.
#
# Registra una tarea programada que arranca al iniciar sesión en Windows y se
# vuelve a levantar si el programa se cae. Se eligió tarea programada y no un
# servicio porque no necesita permisos de administrador ni programas de terceros.
#
# Uso (PowerShell, en esta carpeta):
#   .\instalar.ps1
#   .\instalar.ps1 -Quitar     para desinstalarla

param([switch]$Quitar)

$ErrorActionPreference = "Stop"
$nombre = "Turkana - Agente de impresion"
$carpeta = $PSScriptRoot

if ($Quitar) {
  Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
  Write-Host "Tarea eliminada. El agente ya no arrancará solo." -ForegroundColor Yellow
  return
}

# Comprobaciones antes de registrar nada: más vale fallar aquí que descubrirlo
# el día que no salga un ticket.
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "No encuentro Node.js. Instálalo desde https://nodejs.org y vuelve a correr esto." }

if (-not (Test-Path (Join-Path $carpeta ".env"))) {
  throw "Falta el archivo .env. Copia .env.example a .env y llénalo (ver README.md)."
}

if (-not (Test-Path (Join-Path $carpeta "node_modules"))) {
  Write-Host "Instalando dependencias..." -ForegroundColor Cyan
  Push-Location $carpeta
  npm install --omit=dev
  Pop-Location
}

$accion = New-ScheduledTaskAction -Execute $node -Argument "agent.mjs" -WorkingDirectory $carpeta
$disparador = New-ScheduledTaskTrigger -AtLogOn
$opciones = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
  -StartWhenAvailable

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador `
  -Settings $opciones -Description "Imprime los tickets de Turkana en la impresora del mostrador" -Force | Out-Null

Start-ScheduledTask -TaskName $nombre

Write-Host ""
Write-Host "Listo. El agente arranca solo con Windows." -ForegroundColor Green
Write-Host "Para ver si está corriendo:  Get-ScheduledTask -TaskName '$nombre'"
Write-Host "Para detenerlo un rato:      Stop-ScheduledTask -TaskName '$nombre'"
