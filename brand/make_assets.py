# Genera todos los assets de marca de Hash IA desde el logo (S azul metálica).
from PIL import Image, ImageDraw, ImageFont
import os

SRC = r"C:/Users/josea/Downloads/WhatsApp Image 2026-06-18 at 11.53.15.jpeg"
BRAND = os.path.dirname(os.path.abspath(__file__))
APP_ASSETS = os.path.join(BRAND, "..", "gastos-app", "assets")
LAND_PUB = os.path.join(BRAND, "..", "landing", "public")
NAVY = (20, 33, 61)        # #14213D (brand navy)
os.makedirs(APP_ASSETS, exist_ok=True)
os.makedirs(LAND_PUB, exist_ok=True)

def clean_to_alpha(im):
    """Devuelve RGBA: el fondo claro/neutro → transparente; el logo azul se conserva."""
    im = im.convert("RGB")
    px = im.load()
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            lum = 0.299*r + 0.587*g + 0.114*b
            chroma = max(r, g, b) - min(r, g, b)
            if lum > 212 and chroma < 18:   # fondo claro y neutro → fuera
                continue
            op[x, y] = (r, g, b, 255)
    return out

def bbox_trim(rgba):
    bb = rgba.getbbox()
    return rgba.crop(bb) if bb else rgba

def fit_on(canvas_size, logo, frac, bg=None, offset=(0, 0)):
    """Pega el logo centrado ocupando `frac` del lado menor, sobre `bg` (o transparente)."""
    W = H = canvas_size
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0)) if bg is None else Image.new("RGBA", (W, H), bg + (255,))
    lw, lh = logo.size
    target = int(min(W, H) * frac)
    scale = target / max(lw, lh)
    nlw, nlh = max(1, int(lw*scale)), max(1, int(lh*scale))
    rz = logo.resize((nlw, nlh), Image.LANCZOS)
    x = (W - nlw)//2 + offset[0]
    y = (H - nlh)//2 + offset[1]
    base.alpha_composite(rz, (x, y))
    return base

src = Image.open(SRC)
logo = bbox_trim(clean_to_alpha(src))   # logo recortado, fondo transparente
logo.save(os.path.join(BRAND, "logo-transparent.png"))

# ── App (Capacitor assets inputs) ──
fit_on(1024, logo, 0.86, bg=(255, 255, 255)).convert("RGB").save(os.path.join(APP_ASSETS, "icon-only.png"))
fit_on(1024, logo, 0.62, bg=None).save(os.path.join(APP_ASSETS, "icon-foreground.png"))
Image.new("RGB", (1024, 1024), (255, 255, 255)).save(os.path.join(APP_ASSETS, "icon-background.png"))
fit_on(2732, logo, 0.26, bg=(255, 255, 255)).convert("RGB").save(os.path.join(APP_ASSETS, "splash.png"))
fit_on(2732, logo, 0.26, bg=NAVY).convert("RGB").save(os.path.join(APP_ASSETS, "splash-dark.png"))

# ── Landing: favicons + pwa + apple-touch ──
for size in (16, 32, 48, 64, 180, 192, 512):
    name = {180: "apple-touch-icon.png", 192: "icon-192.png", 512: "icon-512.png"}.get(size, f"favicon-{size}.png")
    fit_on(size, logo, 0.92, bg=(255, 255, 255)).convert("RGB").save(os.path.join(LAND_PUB, name))
# favicon.ico multi-size
icoims = [fit_on(s, logo, 0.92, bg=(255, 255, 255)).convert("RGB") for s in (16, 32, 48)]
icoims[0].save(os.path.join(LAND_PUB, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

# ── OG (1200x630): logo + wordmark "Hash IA" sobre blanco ──
og = Image.new("RGB", (1200, 630), (255, 255, 255))
lg = logo.copy(); s = int(470/max(lg.size)); lg = lg.resize((int(lg.size[0]*470/max(lg.size)), int(lg.size[1]*470/max(lg.size))), Image.LANCZOS)
og.paste(lg.convert("RGB"), (150, (630-lg.size[1])//2), lg)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 130)
    fsub = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 44)
except Exception:
    font = ImageFont.load_default(); fsub = font
d = ImageDraw.Draw(og)
d.text((660, 235), "Hash IA", fill=NAVY, font=font)
d.text((664, 380), "Cuentas y ventas con IA", fill=(90, 100, 120), font=fsub)
og.save(os.path.join(LAND_PUB, "og.jpg"), quality=90)

print("OK assets generados en:", os.path.abspath(APP_ASSETS), "y", os.path.abspath(LAND_PUB))
