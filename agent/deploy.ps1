# ═══════════════════════════════════════════════════════════════
# ATIKO AGENT · Deploy al VPS de Hostinger
# ───────────────────────────────────────────────────────────────
# Cómo usar:
#   1. Abre PowerShell
#   2. cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\agent"
#   3. .\deploy.ps1
# ───────────────────────────────────────────────────────────────

$VPS = "root@72.60.245.87"
$AGENT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  ATIKO AGENT - Deploy a VPS" -ForegroundColor Cyan
Write-Host "  Necesitaras ingresar la contrasena del VPS 3 veces" -ForegroundColor DarkGray
Write-Host ""

# ── Paso 1: Crear carpeta en el VPS ──────────────────────────
Write-Host "[1/3] Creando carpeta en el VPS..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no $VPS "mkdir -p /root/atiko-agent/routes /root/atiko-agent/services /root/atiko-agent/config /root/atiko-agent/public"

if ($LASTEXITCODE -ne 0) { Write-Host "Error de conexion. Verifica la IP y contrasena." -ForegroundColor Red; exit 1 }
Write-Host "   OK" -ForegroundColor Green

# ── Paso 2: Copiar archivos ──────────────────────────────────
Write-Host "[2/3] Copiando archivos..." -ForegroundColor Yellow

# Archivos raíz
scp -o StrictHostKeyChecking=no `
  "$AGENT_DIR\server.js" `
  "$AGENT_DIR\package.json" `
  "$AGENT_DIR\.env" `
  "$AGENT_DIR\setup-vps.sh" `
  "${VPS}:/root/atiko-agent/"

# Subcarpetas
scp -o StrictHostKeyChecking=no -r `
  "$AGENT_DIR\routes" `
  "$AGENT_DIR\services" `
  "$AGENT_DIR\config" `
  "$AGENT_DIR\public" `
  "${VPS}:/root/atiko-agent/"

if ($LASTEXITCODE -ne 0) { Write-Host "Error copiando archivos." -ForegroundColor Red; exit 1 }
Write-Host "   OK" -ForegroundColor Green

# ── Paso 3: Ejecutar setup en el VPS ─────────────────────────
Write-Host "[3/3] Ejecutando setup (puede tardar 2 minutos)..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no $VPS "chmod +x /root/atiko-agent/setup-vps.sh && bash /root/atiko-agent/setup-vps.sh"

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "  Deploy exitoso!" -ForegroundColor Green
  Write-Host "  Prueba en: http://72.60.245.87/health" -ForegroundColor Cyan
  Write-Host "  Logs: ssh $VPS 'pm2 logs atiko-agent'" -ForegroundColor DarkGray
} else {
  Write-Host "Hubo un error. Ve la salida arriba para mas detalles." -ForegroundColor Red
}
