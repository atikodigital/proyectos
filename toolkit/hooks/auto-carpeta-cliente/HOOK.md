# Hook: auto-carpeta-cliente

**Tipo:** Hook de evento (post-create CRM)
**Trigger:** Cada vez que se crea un contacto con estado "Cliente activo" en HubSpot/Notion
**AcciÃ³n:** Crea automÃ¡ticamente la estructura de carpetas en Google Drive del cliente
**Esfuerzo de implementaciÃ³n:** ~2 horas
**Costo operacional:** $0 (Google Drive es gratis hasta 15GB)

## Por quÃ© este hook

Cada vez que cierras un cliente, hay que crear:
- Carpeta principal en Drive
- 8 subcarpetas (00-Contrato, 01-Brief, etc.)
- Documento de bienvenida
- Compartir con la cuenta del cliente

Si lo haces manual = 10-15 min por cliente nuevo. Si lo automatizas = 0 min + 0 errores + estructura consistente siempre.

## Arquitectura

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ CRM (HubSpot / Notion)     â”‚
â”‚ Evento: contact.created    â”‚
â”‚ Filtro: stage = "Customer" â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚ webhook
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Webhook trigger       â”‚
â”‚ Recibe: nombre, empresa,   â”‚
â”‚   email, plan contratado   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Google Drive â€” Create folder  â”‚
â”‚ Folder name: "[Empresa] - [YYYY]"  â”‚
â”‚ Parent: /Atiko/03-Clientes/        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Loop: crear 8 subcarpetas:         â”‚
â”‚ 00-Contrato                        â”‚
â”‚ 01-Brief-y-assets                  â”‚
â”‚ 02-DiseÃ±o                          â”‚
â”‚ 03-Desarrollo                      â”‚
â”‚ 04-Automatizaciones                â”‚
â”‚ 05-Facturas-emitidas               â”‚
â”‚ 06-Reportes-mensuales              â”‚
â”‚ 07-Comunicacion                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Google Docs: crear "Bienvenida"    â”‚
â”‚ Templating con datos del cliente   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Drive: compartir con email cliente â”‚
â”‚ Permiso: editor en 01-Brief-y-...  â”‚
â”‚         viewer en otras            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Twilio: WhatsApp a JosÃ©            â”‚
â”‚ "âœ“ Carpeta creada para [Empresa]"  â”‚
â”‚ "Link: [URL]"                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## ImplementaciÃ³n paso a paso

### 1. Pre-requisitos

- [ ] n8n self-hosted corriendo (ver MCP n8n)
- [ ] Credenciales Google Drive en n8n (OAuth 2.0)
- [ ] Credenciales Twilio en n8n
- [ ] CRM elegido (recomendado: HubSpot Free)

### 2. Configurar el trigger del CRM

**Si usas HubSpot:**

1. HubSpot â†’ Settings â†’ Integrations â†’ Webhooks
2. Crear webhook con:
   - Event: `contact.propertyChange`
   - Property: `lifecyclestage`
   - URL: `https://automations.atikodigital.cl/webhook/auto-carpeta-cliente`
3. Solo gatillar cuando `lifecyclestage = customer`

**Si usas Notion:**

1. Notion API key (Settings â†’ Integrations)
2. n8n: Notion trigger node con poll de 5 min sobre vista filtrada
3. Filtro: status = "Cliente activo"

### 3. Flujo n8n (resumido)

```javascript
// Nodo 1: Webhook receiver
{
  path: "/webhook/auto-carpeta-cliente",
  authentication: "Header Auth",
  token: env.HOOK_TOKEN
}

// Nodo 2: Validar payload
if (!input.empresa || !input.email) {
  throw new Error("Datos insuficientes");
}

// Nodo 3: Crear carpeta principal
const folderName = `${input.empresa} - ${new Date().getFullYear()}`;
const parentId = env.DRIVE_CLIENTES_FOLDER_ID;

const mainFolder = await googleDrive.create({
  name: folderName,
  parents: [parentId],
  mimeType: "application/vnd.google-apps.folder"
});

// Nodo 4: Loop crear 8 subcarpetas
const subfolders = [
  "00-Contrato",
  "01-Brief-y-assets",
  "02-DiseÃ±o",
  "03-Desarrollo",
  "04-Automatizaciones",
  "05-Facturas-emitidas",
  "06-Reportes-mensuales",
  "07-Comunicacion"
];

for (const sf of subfolders) {
  await googleDrive.create({
    name: sf,
    parents: [mainFolder.id],
    mimeType: "application/vnd.google-apps.folder"
  });
}

// Nodo 5: Crear doc bienvenida usando template
const welcomeDoc = await googleDocs.create({
  template: env.TEMPLATE_BIENVENIDA_ID,
  parent: mainFolder.id,
  replacements: {
    "{{NOMBRE}}": input.nombre,
    "{{EMPRESA}}": input.empresa,
    "{{PLAN}}": input.plan,
    "{{FECHA_INICIO}}": new Date().toLocaleDateString("es-CL")
  }
});

// Nodo 6: Compartir con cliente
await googleDrive.permissions.create({
  fileId: mainFolder.id,
  requestBody: {
    role: "reader",
    type: "user",
    emailAddress: input.email
  },
  sendNotificationEmail: false  // Atiko envÃ­a su propio mensaje
});

// Brief subfolder con editor permission
await googleDrive.permissions.create({
  fileId: briefFolderId,
  requestBody: {
    role: "writer",
    type: "user",
    emailAddress: input.email
  }
});

// Nodo 7: Notificar a JosÃ© por WhatsApp
await twilio.messages.create({
  from: "whatsapp:+14155238886",
  to: "whatsapp:+56927130792",
  body: `âœ“ Carpeta creada para ${input.empresa}\nLink: ${mainFolder.webViewLink}\n\nSiguiente paso: enviar carta de bienvenida con \`onboarding-cliente\`.`
});
```

### 4. Variables de entorno necesarias

```
DRIVE_CLIENTES_FOLDER_ID=<ID de /Atiko/03-Clientes/>
TEMPLATE_BIENVENIDA_ID=<ID del doc plantilla>
HOOK_TOKEN=<token random para autenticar webhook>
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

### 5. Testing

Antes de activar en producciÃ³n:

- [ ] Crear contacto de prueba en CRM con stage = customer
- [ ] Verificar que llegÃ³ el webhook a n8n
- [ ] Verificar que se creÃ³ carpeta + 8 subcarpetas
- [ ] Verificar que el doc de bienvenida tiene los datos correctos
- [ ] Verificar que el cliente recibiÃ³ el share por email
- [ ] Verificar que JosÃ© recibiÃ³ el WhatsApp

## Variantes/extensiones futuras

### V2: Crear board de Trello/Linear automÃ¡ticamente

DespuÃ©s del Nodo 6, gatillar:
- Crear board nuevo "Atiko - [Empresa]"
- Copiar template de tareas (las 16 del PLAN-MAESTRO Fase 7.1)
- Invitar a JosÃ©

### V3: Crear ficha en Notion

Si JosÃ© usa Notion para gestionar proyectos, crear una pÃ¡gina automÃ¡ticamente con toda la info del cliente.

### V4: Email de bienvenida con Gmail API

Reemplazar el WhatsApp a JosÃ© por un email automÃ¡tico al cliente con link de la carpeta + carta de bienvenida.

## CÃ³mo desactivar el hook

Si algo sale mal:

1. n8n â†’ flow "auto-carpeta-cliente" â†’ Toggle "Active" off
2. O bien: en HubSpot/Notion eliminar el webhook
3. La carpeta queda en Drive (no se borra automÃ¡ticamente)

## ROI del hook

- **Tiempo ahorrado:** 10-15 min Ã— cliente nuevo
- **Errores reducidos:** 100% (estructura siempre consistente)
- **Bonus:** JosÃ© nunca olvida crear carpeta porque el sistema lo hace solo
- **InversiÃ³n:** 2 horas implementaciÃ³n + USD $0/mes

A partir del cliente nÂº 5 ya pagÃ³ la inversiÃ³n en tiempo de JosÃ©.

