# Script para configurar Caddy con el agente Atiko
# Ejecutar: .\fix-caddy.ps1

$VPS = "root@72.60.245.87"

Write-Host ""
Write-Host "  Configurando Caddy para agent.atikodigital.cl..." -ForegroundColor Cyan
Write-Host ""

# ── Paso 1: Ver el Caddyfile actual ──────────────────────────
Write-Host "[1/3] Leyendo Caddyfile actual..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no $VPS "docker exec caddy cat /etc/caddy/Caddyfile 2>/dev/null || cat /etc/caddy/Caddyfile 2>/dev/null || echo 'NO SE ENCONTRO CADDYFILE'"
Write-Host ""

# ── Paso 2: Crear script bash temporal y ejecutarlo ──────────
Write-Host "[2/3] Agregando bloque del agente..." -ForegroundColor Yellow

# Escribimos el script en el VPS para evitar problemas de escape en PowerShell
$bashScript = @'
#!/bin/bash
CADDYFILE=""

# Detectar donde esta el Caddyfile
if docker exec caddy cat /etc/caddy/Caddyfile > /dev/null 2>&1; then
  CADDY_CMD="docker exec caddy"
  CADDYFILE="/etc/caddy/Caddyfile"
  echo "Caddy encontrado en Docker"
elif [ -f /etc/caddy/Caddyfile ]; then
  CADDY_CMD=""
  CADDYFILE="/etc/caddy/Caddyfile"
  echo "Caddy encontrado nativo"
else
  echo "ERROR: no se encontro Caddy. Revisa con: docker ps"
  exit 1
fi

# Verificar si ya existe el bloque del agente
if docker exec caddy cat /etc/caddy/Caddyfile 2>/dev/null | grep -q "agent.atikodigital" || grep -q "agent.atikodigital" /etc/caddy/Caddyfile 2>/dev/null; then
  echo "El bloque agent.atikodigital.cl ya existe en el Caddyfile"
  exit 0
fi

# Agregar bloque al Caddyfile dentro del contenedor
docker exec caddy sh -c 'echo "" >> /etc/caddy/Caddyfile && echo "agent.atikodigital.cl {" >> /etc/caddy/Caddyfile && echo "    reverse_proxy host.docker.internal:3000" >> /etc/caddy/Caddyfile && echo "}" >> /etc/caddy/Caddyfile' 2>/dev/null

if [ $? -ne 0 ]; then
  echo "ERROR: no se pudo escribir en el Caddyfile del contenedor"
  exit 1
fi

echo "Bloque agregado OK"

# Recargar Caddy
docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>&1
echo "Caddy recargado"
'@

# Subir script al VPS y ejecutarlo
$bashScript | ssh -o StrictHostKeyChecking=no $VPS "cat > /tmp/fix-caddy.sh && chmod +x /tmp/fix-caddy.sh && bash /tmp/fix-caddy.sh"

Write-Host ""

# ── Paso 3: Verificar ────────────────────────────────────────
Write-Host "[3/3] Verificando..." -ForegroundColor Yellow
Write-Host ""

# Test directo al puerto 3000
Write-Host "  Test localhost:3000 (directo):" -ForegroundColor DarkGray
ssh -o StrictHostKeyChecking=no $VPS "curl -s http://localhost:3000/health"
Write-Host ""

# Mostrar Caddyfile final
Write-Host "  Caddyfile final:" -ForegroundColor DarkGray
ssh -o StrictHostKeyChecking=no $VPS "docker exec caddy cat /etc/caddy/Caddyfile 2>/dev/null || cat /etc/caddy/Caddyfile 2>/dev/null"
Write-Host ""

Write-Host "  Listo! Prueba en: https://agent.atikodigital.cl/health" -ForegroundColor Green
Write-Host "  (puede tardar 1-2 min en activar el certificado SSL)" -ForegroundColor DarkGray
Write-Host ""
