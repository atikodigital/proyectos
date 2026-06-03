#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ATIKO AGENT · Setup automático en VPS Ubuntu
# ⚠️  NO instala Nginx — el VPS usa Caddy como proxy inverso
# Ejecutar como root en el VPS
# ═══════════════════════════════════════════════════════════════
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ATIKO AGENT · Setup VPS             ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Actualizar sistema ──────────────────────────────────────
echo "[1/4] Actualizando sistema..."
apt-get update -qq

# ── 2. Instalar Node.js 20 ────────────────────────────────────
echo "[2/4] Instalando Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
  echo "      Node.js $(node --version) instalado"
else
  echo "      Node.js ya instalado: $(node --version)"
fi

# ── 3. Instalar PM2 (proceso permanente) ──────────────────────
echo "[3/4] Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2 > /dev/null 2>&1
  echo "      PM2 instalado"
else
  echo "      PM2 ya instalado"
fi

# ── 4. Instalar dependencias e iniciar agente ─────────────────
echo "[4/4] Instalando dependencias e iniciando agente..."
cd /root/atiko-agent
npm install --omit=dev > /dev/null 2>&1
echo "      Dependencias instaladas"

pm2 delete atiko-agent > /dev/null 2>&1 || true
pm2 start server.js --name atiko-agent
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Agente corriendo en puerto 3000      ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Próximo paso: configurar Caddy para HTTPS"
echo "  Ejecuta en tu PC: .\\fix-caddy.ps1"
echo ""
echo "  Comandos útiles:"
echo "  pm2 status               → ver estado"
echo "  pm2 logs atiko-agent     → logs en tiempo real"
echo "  pm2 restart atiko-agent  → reiniciar"
echo "  curl http://localhost:3000/health  → probar local"
echo ""

# Verificar que está corriendo
sleep 2
if curl -s http://localhost:3000/health | grep -q "ok"; then
  echo "  Estado: ONLINE ✓"
  curl -s http://localhost:3000/health
else
  echo "  ADVERTENCIA: el agente no responde. Revisa: pm2 logs atiko-agent"
fi
echo ""
