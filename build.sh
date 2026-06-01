#!/usr/bin/env bash
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Atiko Â· build.sh
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Prepara el sitio para deploy en Cloudflare Pages:
#  1. Cambia FRAMES_MODE a 'production' en index.html
#  2. Verifica que no queden paths file:///
#  3. Verifica que existan archivos esenciales
#  4. Hace commit y push (si --deploy)
#
# Uso:
#   bash build.sh           # solo prepara
#   bash build.sh --deploy  # prepara + git push (Cloudflare auto-deploya)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}â†’ Atiko build script${NC}"
echo ""

# â”€â”€â”€ 1. Cambiar FRAMES_MODE a production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo "1. Cambiando FRAMES_MODE â†’ 'production'..."
if grep -q "const FRAMES_MODE = 'local';" index.html; then
  # Backup
  cp index.html index.html.bak
  # Reemplazo
  sed -i.tmp "s/const FRAMES_MODE = 'local';/const FRAMES_MODE = 'production';/" index.html
  rm -f index.html.tmp
  echo -e "   ${GREEN}âœ“ Cambiado a production (backup en index.html.bak)${NC}"
else
  echo -e "   ${GREEN}âœ“ Ya estÃ¡ en production${NC}"
fi

# â”€â”€â”€ 2. Verificar que no queden paths locales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo ""
echo "2. Verificando paths locales..."
if grep -n "file:///" index.html | grep -v "// â†" > /tmp/atiko-paths.txt; then
  if [ -s /tmp/atiko-paths.txt ]; then
    echo -e "   ${RED}âœ— AÃºn hay paths file:/// en index.html:${NC}"
    cat /tmp/atiko-paths.txt
    echo -e "   ${RED}Abortando.${NC}"
    exit 1
  fi
fi
echo -e "   ${GREEN}âœ“ Sin paths locales${NC}"

# â”€â”€â”€ 3. Verificar archivos esenciales â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo ""
echo "3. Verificando archivos crÃ­ticos..."
REQUIRED=(
  "index.html"
  "robots.txt"
  "sitemap.xml"
  "site.webmanifest"
  "_headers"
  "logo.svg"
  "og-image.jpg"
  "privacidad.html"
  "terminos.html"
  ".well-known/security.txt"
)

MISSING=0
for file in "${REQUIRED[@]}"; do
  if [ ! -f "$file" ]; then
    echo -e "   ${RED}âœ— Falta: $file${NC}"
    MISSING=1
  else
    echo -e "   ${GREEN}âœ“ $file${NC}"
  fi
done

if [ $MISSING -eq 1 ]; then
  echo -e "${RED}Faltan archivos. Abortando.${NC}"
  exit 1
fi

# â”€â”€â”€ 4. Verificar frames en assets/ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo ""
echo "4. Verificando frames..."
if [ ! -d "assets/frames" ]; then
  echo -e "   ${YELLOW}âš  La carpeta assets/frames/ no existe.${NC}"
  echo -e "   ${YELLOW}  Mueve los frames desde C:\\Users\\josea\\Downloads\\ antes de continuar.${NC}"
  echo -e "   ${YELLOW}  Ver README.md secciÃ³n 'Mover los frames'.${NC}"
else
  echo -e "   ${GREEN}âœ“ assets/frames/ existe${NC}"
fi

# â”€â”€â”€ 5. Archivos que NO deben subirse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo ""
echo "5. Verificando que archivos privados NO se suban..."
PRIVATE_FILES=(
  "SEO-AUDIT.md"
  "SECURITY-AUDIT.md"
  "KEYWORDS-RESEARCH.md"
  "ESTRATEGIA-NEGOCIO.md"
  "AUTOMATIZACIONES.md"
  "PLAN-MAESTRO.md"
  "README.md"
  "toolkit/"
)

if [ ! -f ".gitignore" ]; then
  echo -e "   ${YELLOW}âš  Creando .gitignore...${NC}"
  cat > .gitignore <<EOF
# Archivos privados de Atiko (no se suben a Cloudflare Pages)
SEO-AUDIT.md
SECURITY-AUDIT.md
KEYWORDS-RESEARCH.md
ESTRATEGIA-NEGOCIO.md
AUTOMATIZACIONES.md
PLAN-MAESTRO.md
README.md
toolkit/
build.sh
.DS_Store
*.log
index.html.bak
EOF
  echo -e "   ${GREEN}âœ“ .gitignore creado${NC}"
else
  echo -e "   ${GREEN}âœ“ .gitignore existe${NC}"
fi

# â”€â”€â”€ 6. Deploy (opcional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if [ "${1:-}" = "--deploy" ]; then
  echo ""
  echo "6. Desplegando a Cloudflare Pages..."
  if [ ! -d ".git" ]; then
    echo -e "   ${RED}âœ— No es un repo git. Inicializa con 'git init' primero.${NC}"
    exit 1
  fi
  git add .
  git commit -m "build: deploy $(date +%Y-%m-%d_%H:%M)" || echo "Nada que commitear"
  git push origin main
  echo -e "   ${GREEN}âœ“ Push hecho. Cloudflare Pages tardarÃ¡ 1-2 min en publicar.${NC}"
fi

echo ""
echo -e "${GREEN}â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}"
echo -e "${GREEN}  Build completado.${NC}"
echo -e "${GREEN}â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}"
echo ""
echo "PrÃ³ximos pasos:"
echo "  1. Revisar visual del sitio: abre index.html"
echo "  2. Si todo OK: bash build.sh --deploy"
echo "  3. Post-deploy: https://securityheaders.com/?q=atikodigital.cl"

