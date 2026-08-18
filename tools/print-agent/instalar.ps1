# Deja el agente de impresión arrancando solo en esta PC.
#
# Intenta primero una tarea programada, que es lo más robusto: se levanta sola si
# el agente se cae. Pero registrarla pide permisos de administrador en muchas
# máquinas, y la computadora de una tienda no siempre los tiene a la mano; en ese
# caso cae a un acceso directo en la carpeta de Inicio de Windows, que no pide
# nada. Las dos rutas dejan el agente andando al prender la computadora.
#
# En las dos deja también un ícono en el escritorio, para que si alguien cierra
# la ventana por accidente pueda volver a arrancarlo con doble clic, sin abrir
# ninguna terminal.
#
# Uso (PowerShell, parado en esta carpeta):
#   .\instalar.ps1
#   .\instalar.ps1 -Quitar     para desinstalarlo

param([switch]$Quitar)

$ErrorActionPreference = "Stop"
$nombre = "Turkana - Agente de impresion"
$visible = "Impresora Turkana"        # el nombre que ve la gente de la tienda
$carpeta = $PSScriptRoot
$cmd = Join-Path $carpeta "iniciar-agente.cmd"
$icono = Join-Path $carpeta "turkana.ico"
$acceso = Join-Path ([Environment]::GetFolderPath("Startup")) "$visible.lnk"
$escritorio = Join-Path ([Environment]::GetFolderPath("Desktop")) "$visible.lnk"
# La primera versión usaba el nombre interno; se limpia para no dejar dos accesos
# en Inicio y acabar con dos agentes corriendo.
$accesoViejo = Join-Path ([Environment]::GetFolderPath("Startup")) "$nombre.lnk"

function Nuevo-Acceso($ruta, $minimizada) {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($ruta)
  $lnk.TargetPath = $cmd
  $lnk.WorkingDirectory = $carpeta
  $lnk.WindowStyle = if ($minimizada) { 7 } else { 1 }
  $lnk.Description = "Imprime los tickets de Turkana en la impresora del mostrador"
  if (Test-Path $icono) { $lnk.IconLocation = $icono }
  $lnk.Save()
}

function Quitar-Tarea {
  try {
    Get-ScheduledTask -TaskName $nombre -ErrorAction Stop | Out-Null
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
    Write-Host "Tarea programada eliminada." -ForegroundColor Yellow
  } catch {
    # No estaba registrada: nada que hacer.
  }
}

if ($Quitar) {
  Quitar-Tarea
  foreach ($r in $acceso, $escritorio, $accesoViejo) {
    if (Test-Path $r) { Remove-Item $r -Force; Write-Host "Quitado: $r" -ForegroundColor Yellow }
  }
  Write-Host "El agente ya no arrancará solo." -ForegroundColor Yellow
  return
}

# ── Comprobaciones ──────────────────────────────────────────────────────────
# Más vale fallar aquí que descubrirlo el día que no salga un ticket.
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "No encuentro Node.js. Instálalo desde https://nodejs.org y vuelve a correr esto." }

if (-not (Test-Path (Join-Path $carpeta ".env"))) {
  throw "Falta el archivo .env. Copia .env.example a .env y llénalo (ver README.md)."
}

if (-not (Test-Path $cmd)) {
  throw "Falta iniciar-agente.cmd. Baja la versión más reciente del repositorio (git pull)."
}

if (-not (Test-Path (Join-Path $carpeta "node_modules"))) {
  Write-Host "Instalando dependencias..." -ForegroundColor Cyan
  Push-Location $carpeta
  try { & npm.cmd install --omit=dev } finally { Pop-Location }
}

# ── 1) Tarea programada ─────────────────────────────────────────────────────
$conTarea = $false

try {
  $accion = New-ScheduledTaskAction -Execute $node -Argument "agent.mjs" -WorkingDirectory $carpeta
  $disparador = New-ScheduledTaskTrigger -AtLogOn
  $opciones = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -StartWhenAvailable

  Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador `
    -Settings $opciones -Description "Imprime los tickets de Turkana en la impresora del mostrador" `
    -Force -ErrorAction Stop | Out-Null

  Start-ScheduledTask -TaskName $nombre -ErrorAction Stop
  $conTarea = $true
}
catch {
  Write-Host ""
  Write-Host "No se pudo registrar la tarea programada: $($_.Exception.Message)" -ForegroundColor DarkYellow
  Write-Host "Casi siempre es que Windows la pide con permisos de administrador." -ForegroundColor DarkYellow
  Write-Host "Se usará la carpeta de Inicio, que no los necesita." -ForegroundColor DarkYellow
  # Si quedó registrada a medias, se quita: dos agentes a la vez no rompen nada
  # —el reclamo de cada ticket es atómico— pero confunden al depurar.
  Quitar-Tarea
}

# ── 2) Respaldo: acceso directo en la carpeta de Inicio ─────────────────────
if (Test-Path $accesoViejo) { Remove-Item $accesoViejo -Force }

if (-not $conTarea) {
  Nuevo-Acceso $acceso $true
  # Y se arranca ya, para no tener que reiniciar la computadora.
  Start-Process -FilePath $cmd -WorkingDirectory $carpeta -WindowStyle Minimized
}

# ── 3) Ícono en el escritorio, siempre ──────────────────────────────────────
# Para que reiniciar el agente sea doble clic en un logo y no abrir una terminal.
Nuevo-Acceso $escritorio $false

# ── Resultado ───────────────────────────────────────────────────────────────
Write-Host ""
if ($conTarea) {
  Write-Host "Listo. El agente quedó como tarea de Windows y ya está corriendo." -ForegroundColor Green
  Write-Host "  Ver si corre:     Get-ScheduledTask -TaskName '$nombre'"
  Write-Host "  Detenerlo:        Stop-ScheduledTask -TaskName '$nombre'"
} else {
  Write-Host "Listo. El agente quedó en la carpeta de Inicio y ya está corriendo." -ForegroundColor Green
  Write-Host "Queda una ventana minimizada: ahí se ve lo que va imprimiendo. No la cierres."
  Write-Host "  Ver el acceso:    explorer shell:startup"
  Write-Host ""
  Write-Host "Si prefieres la tarea programada, abre PowerShell como administrador" -ForegroundColor DarkGray
  Write-Host "y vuelve a correr este script: se cambia sola." -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "En el escritorio quedó el ícono '$visible': doble clic lo vuelve a arrancar" -ForegroundColor Green
Write-Host "si alguien cierra la ventana por error."
Write-Host "  Desinstalar todo: .\instalar.ps1 -Quitar"
Write-Host ""
Write-Host "Comprueba en el POS que el icono de impresora esté en verde." -ForegroundColor Cyan
