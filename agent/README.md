# 🤖 Atiko AI Agent

Agente de IA multi-propósito para Atiko Digital.  
Funciona como **chat widget en el sitio web** y como **bot de WhatsApp Business** (Meta).

---

## Estructura de archivos

```
agent/
├── server.js                 ← Servidor Express (entry point)
├── package.json
├── .env.example              ← Copia como .env y rellena
│
├── config/
│   └── prompt.js             ← System prompt de Kai (personalidad + info Atiko)
│
├── routes/
│   ├── chat.js               ← POST /api/chat  (chat widget web)
│   └── webhook.js            ← GET/POST /api/whatsapp/webhook
│
├── services/
│   ├── claude.js             ← Llamadas a Anthropic API + memoria de conversación
│   └── whatsapp.js           ← Envío/recepción mensajes WhatsApp Business
│
└── public/
    └── atiko-chat-widget.js  ← Widget embebible en el sitio HTML
```

---

## Setup inicial

### 1. Instalar dependencias

```bash
cd agent
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus keys
```

**Variables requeridas:**

| Variable | Dónde obtenerla |
|----------|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `WHATSAPP_TOKEN` | [developers.facebook.com](https://developers.facebook.com) |
| `WHATSAPP_PHONE_ID` | Meta Business → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Lo inventas tú (ej: `atiko_2026_secret`) |

### 3. Iniciar en desarrollo

```bash
npm run dev
# o
node server.js
```

El servidor arranca en `http://localhost:3000`

---

## Embeber el widget en el sitio web

Agrega esto **antes de `</body>`** en cada página HTML de Atiko:

```html
<!-- Atiko Chat Widget (reemplaza el widget de WhatsApp anterior) -->
<script src="https://agent.atikodigital.cl/widget/atiko-chat-widget.js"></script>
```

En desarrollo local puedes usar:
```html
<script src="/agent/public/atiko-chat-widget.js"></script>
```

> **Nota:** El widget detecta automáticamente si el servidor no responde y muestra un mensaje de fallback con contacto directo.

---

## Configurar WhatsApp Business API (Meta)

### Paso 1: Crear App en Meta Developers

1. Ir a [developers.facebook.com](https://developers.facebook.com)
2. Crear una nueva App → tipo **"Business"**
3. Agregar el producto **WhatsApp**
4. En "Getting Started": copiar el **Phone Number ID** y el **Temporary Token**

### Paso 2: Webhook en Meta

Tu servidor necesita una URL pública. Opciones:
- **En VPS Hostinger:** `https://agent.atikodigital.cl`
- **En desarrollo:** usar [ngrok](https://ngrok.com) para exponer localhost

Con el servidor corriendo, registra el webhook:
1. Meta Developers → WhatsApp → Configuration → Webhook
2. **Callback URL:** `https://TU_SERVIDOR/api/whatsapp/webhook`
3. **Verify Token:** el mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
4. Suscribir al evento: `messages`
5. Click **Verify and Save**

### Paso 3: Número de producción

El número gratuito de prueba de Meta solo envía a números autorizados.  
Para producción real necesitas una **cuenta de Meta Business** verificada y un número aprobado.

---

## Deploy en VPS Hostinger

El servidor Express NO puede correr en el hosting compartido de Hostinger.  
Necesitas el **plan VPS** (ya tienes IP: `72.60.245.87`).

### En el VPS:

```bash
# Conectar por SSH
ssh root@72.60.245.87

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Clonar o subir el proyecto
# Opción A: git clone desde GitHub
git clone https://github.com/atikodigital/proyectos.git
cd proyectos/agent

# Opción B: subir via SCP
scp -r ./agent root@72.60.245.87:/root/atiko-agent

# Instalar y arrancar
cd /root/atiko-agent
npm install
cp .env.example .env
nano .env  # Rellena las variables

# Mantener el proceso vivo con PM2
npm install -g pm2
pm2 start server.js --name atiko-agent
pm2 save
pm2 startup
```

### Nginx como proxy inverso (para HTTPS)

```nginx
# /etc/nginx/sites-available/agent.atikodigital.cl
server {
    server_name agent.atikodigital.cl;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Habilitar SSL con Certbot
certbot --nginx -d agent.atikodigital.cl
```

---

## Endpoints disponibles

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET`  | `/health` | Estado del servidor |
| `POST` | `/api/chat` | Chat widget (body: `{message, sessionId?}`) |
| `POST` | `/api/chat/tts` | Texto → audio MP3 (voz natural) |
| `POST` | `/api/chat/tts/stream` | Texto → stream PCM 24kHz (reproducción inmediata) |
| `POST` | `/api/chat/stt` | Audio → texto (Whisper) |
| `WS`   | `/api/voice/live` | **Voz en tiempo real** (OpenAI Realtime, estilo J.A.R.V.I.S.) |
| `GET`  | `/api/whatsapp/webhook` | Verificación Meta |
| `POST` | `/api/whatsapp/webhook` | Mensajes entrantes WhatsApp |

### Ejemplo POST /api/chat

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Cuánto cuesta el plan Pro?"}'
```

Respuesta:
```json
{
  "reply": "El Plan PRO tiene un costo de $190.000/mes...",
  "sessionId": "uuid-de-la-sesion"
}
```

---

## 🎙️ Voz (J.A.R.V.I.S.)

Dos niveles de voz, ambos con **OpenAI** (la misma `OPENAI_API_KEY`):

### 1. TTS natural (chat normal)
El chat escrito responde con audio usando **`gpt-4o-mini-tts`** (mucho más natural que el viejo `tts-1`), con voz e instrucciones de tono configurables:

```env
AGENT_TTS_MODEL=gpt-4o-mini-tts
AGENT_TTS_VOICE=onyx          # onyx (grave/JARVIS), ash, ballad, sage, verse...
AGENT_TTS_INSTRUCTIONS=       # vacío = tono J.A.R.V.I.S. por defecto del código
```

> El servidor **ignora** la voz `nova` hardcodeada de widgets antiguos, así que la mejora aplica sin redesplegar el widget.

### 2. Conversación en tiempo real (Realtime API)
Hablar e interrumpir en vivo, voz nativa, como el JARVIS de escritorio (Mark XXXIX). Endpoint **WebSocket** `/api/voice/live` que hace de relay entre el navegador y la **OpenAI Realtime API** (GA). La API key vive solo en el servidor.

```env
REALTIME_MODEL=gpt-realtime
REALTIME_VOICE=ballad         # ballad (británica/JARVIS), ash, verse, marin, cedar...
```

**Flujo:** mic del navegador (PCM16 24kHz vía AudioWorklet) → WS → servidor → OpenAI → audio de vuelta. Incluye barge-in (interrumpir hablando), transcripción y orbe reactivo a la amplitud real de la voz. En el widget, el botón 🎤 inicia/detiene la sesión.

> **Requisitos del navegador:** HTTPS (o localhost), micrófono permitido, y soporte de `AudioWorklet` (Chrome/Edge/Safari modernos). Si no, el widget cae al flujo texto + TTS.

> ⚠️ **Proxy inverso debe permitir WebSocket.** El bloque Nginx de arriba ya lo hace (`Upgrade`/`Connection`). Si usas **Caddy**, `reverse_proxy localhost:3000` ya soporta WebSocket automáticamente:
> ```caddy
> agent.atikodigital.cl {
>     reverse_proxy localhost:3000
> }
> ```

> 💰 **Costo:** la Realtime API se cobra por audio (entrada+salida), bastante más cara que el TTS normal. Úsala como modo premium opcional, no por defecto.

---

## Personalizar el agente (Kai)

Para cambiar la personalidad, servicios o precios que conoce Kai:

1. Editar `config/prompt.js`
2. Modificar el `SYSTEM_PROMPT` con la información actualizada
3. Reiniciar el servidor: `pm2 restart atiko-agent`

---

## Costos estimados

| Servicio | Costo aprox |
|----------|------------|
| Anthropic Claude Haiku | ~$0.25 / millón tokens input |
| WhatsApp Business API | Gratis primeras 1000 conversaciones/mes |
| VPS Hostinger (para el servidor) | ~$7-15 USD/mes |

Con 500 conversaciones/mes de ~10 mensajes c/u, el costo de Claude Haiku es < $5 USD.

---

## 📤 Redes sociales — Publicador Meta (Fase 1)

Conecta y publica en Facebook + Instagram de clientes desde el agente.

### Endpoints
| Método | URL | Descripción |
|--------|-----|-------------|
| `GET`  | `/api/social/connect/meta?clientId=casaluxe` | Redirige al OAuth de Meta |
| `GET`  | `/api/social/callback/meta` | Callback: guarda tokens del cliente |
| `POST` | `/api/social/publish` | Publica `{clientId, platform, videoUrl/message/imageUrl, caption}` |

### Requisitos
- App de Meta con permisos `pages_manage_posts`, `instagram_content_publish` (App Review + Advanced Access para cuentas de terceros).
- Cuenta IG del cliente: Business/Creator vinculada a Página de FB.
- `DATABASE_URL` (Postgres atiko-db) para persistir tokens.

### Probar en local (modo desarrollo, sin App Review)
Usa una cuenta donde TÚ eres admin de la app de Meta. Ejemplo de publicación IG Reel:
```bash
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d '{"clientId":"atiko","platform":"instagram","videoUrl":"https://.../reel.mp4","caption":"prueba"}'
```

---

*Atiko Digital · atikodigital@gmail.com · +56 9 2713 0792*
