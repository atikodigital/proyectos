---
name: voucher-to-sheets
description: Playbook tÃ©cnico completo para implementar la automatizaciÃ³n "Voucher WhatsApp â†’ Google Sheets" â€” el caso estrella de Atiko. Cubre arquitectura, stack, configuraciÃ³n paso a paso de Twilio + Claude Vision API + Google Sheets API + n8n, manejo de errores, deduplicaciÃ³n y entrega al cliente. Se activa con "implementar voucher", "automatizaciÃ³n voucher", "voucher sheets", "extracciÃ³n de comprobantes WhatsApp", "construir automatizaciÃ³n pagos".
version: 1.0
author: Atiko
---

# Voucher WhatsApp â†’ Google Sheets â€” Playbook tÃ©cnico

## Resumen del producto

**Lo que ve el cliente:**
- Sus clientes envÃ­an foto/PDF del voucher de transferencia a su WhatsApp
- El sistema reconoce el voucher automÃ¡ticamente
- Extrae: monto, fecha, banco, nÂº operaciÃ³n, RUT
- Lo registra en su Google Sheets de cobros
- Detecta duplicados (mismo nÂº operaciÃ³n = ya estaba)
- Responde al cliente "âœ“ Pago recibido por $XXX, fue registrado"

**Lo que Atiko entrega:**
- Sistema funcionando 100% automatizado
- Acceso al cliente para ver Sheets cuando quiera
- CapacitaciÃ³n de 30 min
- Soporte y monitoreo del flujo

**Precio sugerido:**
- Setup Ãºnico: **$390.000 CLP** (8-12 horas de implementaciÃ³n Atiko)
- MantenciÃ³n: **$29.000 CLP/mes** (monitoreo + correcciones + retraining si cambia el formato de voucher)

## CuÃ¡ndo usar esta skill

Triggers:
- "implementar voucher a sheets"
- "construir la automatizaciÃ³n para [cliente]"
- "voucher to sheets"
- "el cliente firmÃ³ automatizaciÃ³n vouchers"
- "necesito implementar el flow de comprobantes"
- "cÃ³mo armo lo del voucher"

## Stack tÃ©cnico (decisiÃ³n rÃ¡pida)

**Recomendado para Atiko: n8n self-hosted.**

| Componente | TecnologÃ­a | Costo |
|------------|------------|-------|
| Orquestador de flujo | n8n self-hosted en VPS | USD $6/mes (DigitalOcean) |
| RecepciÃ³n WhatsApp | Twilio WhatsApp Business API | USD $0.05 por conversaciÃ³n iniciada por el negocio |
| OCR + extracciÃ³n de datos | Claude Vision API (Anthropic) | USD ~$0.005 por imagen (mÃ¡s preciso que Gemini en espaÃ±ol) |
| Almacenamiento | Google Sheets API | Gratis |
| AlmacÃ©n de imÃ¡genes | Google Drive del cliente | Gratis (15GB) |
| NotificaciÃ³n cliente final | Twilio Send Message | USD $0.005 por mensaje |
| Monitoreo | n8n Error Trigger + WhatsApp a Atiko | Gratis |

**Costo operacional cliente:** ~USD $20-40/mes (Twilio + Anthropic + servidor). Atiko cobra $29k mantenciÃ³n = USD ~$30. Margen positivo desde mes 1.

## Arquitectura del flujo

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Cliente final    â”‚
â”‚ envÃ­a foto/PDF   â”‚
â”‚ del voucher a    â”‚
â”‚ WhatsApp negocio â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Twilio recibe    â”‚
â”‚ mensaje +media   â”‚ â† webhook a n8n
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Webhook node                    â”‚
â”‚ - Recibe el payload                  â”‚
â”‚ - Filtra: solo imÃ¡genes y PDFs       â”‚
â”‚ - Descarga el archivo desde Twilio   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: HTTP request a Anthropic API    â”‚
â”‚ - Claude Vision (claude-sonnet-4-6)  â”‚
â”‚ - Prompt estructurado pidiendo JSON  â”‚
â”‚ - Extrae: monto, fecha, banco, ID,   â”‚
â”‚   RUT, nombre titular                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: ValidaciÃ³n                      â”‚
â”‚ - Â¿JSON vÃ¡lido?                      â”‚
â”‚ - Â¿Monto > 0?                        â”‚
â”‚ - Â¿Fecha parseable?                  â”‚
â”‚ - Â¿NÂº operaciÃ³n presente?            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚ NO â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
         â”‚ â”€â†’ â”‚ Avisar Atiko (WA) + log     â”‚
         â”‚    â”‚ Cliente recibe "estamos     â”‚
         â”‚    â”‚ revisando tu pago"          â”‚
         â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚ SÃ
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Lookup en Google Sheets         â”‚
â”‚ - Buscar si nÂº operaciÃ³n ya existe   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚ EXISTE â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
         â”‚ â”€â”€â”€â”€â”€â†’ â”‚ Responder cliente "Ese pago    â”‚
         â”‚        â”‚ ya estaba registrado el [fecha]â”‚
         â”‚        â”‚ por $XXX"                      â”‚
         â”‚        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚ NO EXISTE
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Append row to Sheets            â”‚
â”‚ Columnas: timestamp, monto, fecha    â”‚
â”‚ pago, banco, nÂº op, RUT, nombre,     â”‚
â”‚ link foto Drive, telÃ©fono que enviÃ³  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Subir foto a Drive del cliente  â”‚
â”‚ Carpeta: /Vouchers/{aÃ±o}/{mes}/      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
         â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ n8n: Twilio send message             â”‚
â”‚ "âœ“ Pago recibido por $XXX           â”‚
â”‚  fue registrado en tu cuenta.        â”‚
â”‚  Gracias!"                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## ImplementaciÃ³n paso a paso

### Setup previo (solo primera vez por cliente nuevo)

#### 1. Twilio WhatsApp Business

- [ ] Crear cuenta en [twilio.com](https://www.twilio.com) (si no hay)
- [ ] Solicitar WhatsApp Business Sender (proceso de aprobaciÃ³n con Meta, 24-72h)
- [ ] Configurar template message para confirmaciones (Meta requiere templates aprobados para mensajes proactivos)
- [ ] Anotar credenciales: Account SID + Auth Token

#### 2. Anthropic API key

- [ ] Crear cuenta en [console.anthropic.com](https://console.anthropic.com)
- [ ] Generar API key especÃ­fico para este cliente (anotar con etiqueta `atiko-[cliente]-voucher`)
- [ ] Cargar crÃ©dito mÃ­nimo $20 USD para empezar

#### 3. Google Sheets + Drive del cliente

- [ ] Pedir al cliente: invitar a `[email de servicio Atiko]` como editor a un Sheet llamado "Cobros [Empresa] 2026"
- [ ] Estructurar el Sheet con columnas exactas:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Monto | Fecha Pago | Banco | NÂº OperaciÃ³n | RUT Pagador | Nombre Pagador | Link Voucher | TelÃ©fono Origen | Estado |

- [ ] Crear carpeta en Drive del cliente: `/Vouchers/2026/`
- [ ] Compartirla con la cuenta de servicio

#### 4. n8n self-hosted (Atiko)

Si todavÃ­a no estÃ¡ instalado:

- [ ] Crear droplet en DigitalOcean: Ubuntu 22.04, 2GB RAM, 1 vCPU = USD $12/mes (o $6 con 1GB)
- [ ] Instalar Docker: `apt install docker.io docker-compose`
- [ ] Bajar `docker-compose.yml` para n8n con PostgreSQL
- [ ] Asignar subdominio: `automations.atikodigital.cl` (o equivalente)
- [ ] Caddy/nginx + Let's Encrypt para SSL
- [ ] Login n8n y configurar credenciales (Twilio, Anthropic, Google)

### ConstrucciÃ³n del flujo en n8n

#### Nodo 1: Webhook trigger

```
Tipo: Webhook
Path: /atiko/voucher/[cliente-slug]
Method: POST
Authentication: Header Auth (token Ãºnico por cliente)
```

#### Nodo 2: FunciÃ³n â€” Filtrar y normalizar

```javascript
// Solo procesar si tiene media
if (!$input.item.json.MediaUrl0) {
  return [{json: {skip: true, reason: 'no_media'}}];
}

const mediaType = $input.item.json.MediaContentType0;
if (!mediaType.includes('image') && !mediaType.includes('pdf')) {
  return [{json: {skip: true, reason: 'wrong_type'}}];
}

return [{json: {
  mediaUrl: $input.item.json.MediaUrl0,
  mediaType: mediaType,
  fromPhone: $input.item.json.From,
  timestamp: new Date().toISOString()
}}];
```

#### Nodo 3: HTTP â€” Descargar imagen de Twilio

```
URL: {{ $json.mediaUrl }}
Authentication: Basic (Twilio SID + Token)
Method: GET
Response format: File
```

#### Nodo 4: HTTP â€” Claude Vision

```
URL: https://api.anthropic.com/v1/messages
Method: POST
Headers:
  x-api-key: {{ $env.ANTHROPIC_API_KEY }}
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "messages": [{
    "role": "user",
    "content": [
      {
        "type": "image",
        "source": {
          "type": "base64",
          "media_type": "{{ $json.mediaType }}",
          "data": "{{ $('Descargar imagen').item.binary.data.data }}"
        }
      },
      {
        "type": "text",
        "text": "Esta es la imagen de un voucher de transferencia o pago bancario chileno. Extrae los datos en JSON con esta estructura exacta. Si algÃºn campo no se ve, ponlo como null:\n\n{\n  \"monto\": <number sin separadores>,\n  \"moneda\": \"CLP\",\n  \"fecha_pago\": \"YYYY-MM-DD\",\n  \"banco\": \"<nombre del banco>\",\n  \"numero_operacion\": \"<string>\",\n  \"rut_pagador\": \"<formato XX.XXX.XXX-X>\",\n  \"nombre_pagador\": \"<string>\",\n  \"tipo_transaccion\": \"transferencia | depÃ³sito | webpay | otro\"\n}\n\nResponde SOLO el JSON. Nada mÃ¡s."
      }
    ]
  }]
}
```

#### Nodo 5: FunciÃ³n â€” Parsear JSON

```javascript
const response = $input.item.json.content[0].text;
let parsed;
try {
  parsed = JSON.parse(response.trim());
} catch (e) {
  return [{json: {error: 'invalid_json', raw: response}}];
}

// Validaciones
if (!parsed.monto || parsed.monto <= 0) {
  return [{json: {error: 'invalid_amount', data: parsed}}];
}
if (!parsed.numero_operacion) {
  return [{json: {error: 'no_operation_id', data: parsed}}];
}

return [{json: parsed}];
```

#### Nodo 6: Google Sheets â€” Lookup duplicado

```
Operation: Lookup
Sheet: Cobros [Empresa] 2026
Lookup column: "NÂº OperaciÃ³n"
Lookup value: {{ $json.numero_operacion }}
```

#### Nodo 7: IF â€” Si duplicado, responder y terminar

```
Condition: {{ $('Lookup').item.json.length > 0 }}

TRUE branch â†’ Twilio send "Ese pago ya estaba registrado..."
FALSE branch â†’ continuar al append
```

#### Nodo 8: Google Drive â€” Upload voucher

```
Operation: Upload File
Folder: /Vouchers/{{ $now.format('yyyy/MM') }}
File name: voucher-{{ $json.numero_operacion }}.{{ ext }}
File contents: binary del nodo 3
```

#### Nodo 9: Google Sheets â€” Append row

```
Operation: Append
Sheet: Cobros [Empresa] 2026
Columns: {
  Timestamp: {{ $now }},
  Monto: {{ $json.monto }},
  "Fecha Pago": {{ $json.fecha_pago }},
  Banco: {{ $json.banco }},
  "NÂº OperaciÃ³n": {{ $json.numero_operacion }},
  "RUT Pagador": {{ $json.rut_pagador }},
  "Nombre Pagador": {{ $json.nombre_pagador }},
  "Link Voucher": {{ $('Drive upload').item.json.webViewLink }},
  "TelÃ©fono Origen": {{ $('Filtrar').item.json.fromPhone }},
  Estado: "Registrado"
}
```

#### Nodo 10: Twilio â€” Responder confirmaciÃ³n

```
To: {{ $('Filtrar').item.json.fromPhone }}
From: whatsapp:[nÃºmero Twilio del cliente]
Body: âœ“ Pago recibido por ${{ $json.monto | locale-chile }}.
      Fue registrado correctamente.
      Gracias por tu compra!
```

#### Nodo 11 (paralelo): Error handler

Si cualquier nodo falla:

```
Twilio mensaje a Atiko (WhatsApp +56 9 2713 0792):
"âš ï¸ Error en flow voucher-[cliente]: [error]. Revisa logs."
```

Y al cliente final:

```
"Recibimos tu comprobante. Lo estamos revisando manualmente.
Te confirmamos en un rato."
```

## CapacitaciÃ³n al cliente

SesiÃ³n de 30 minutos con el dueÃ±o del negocio. Cubrir:

1. **CÃ³mo ver los pagos del dÃ­a** â€” abrir Sheets, filtrar por fecha
2. **CÃ³mo buscar un pago especÃ­fico** â€” Ctrl+F con nÂº operaciÃ³n
3. **CÃ³mo marcar un pago como conciliado** â€” columna "Estado" â†’ cambiar a "Conciliado"
4. **QuÃ© hacer si un cliente reclama** â€” buscar nÂº operaciÃ³n, mostrarle el row + link al voucher
5. **A quiÃ©n avisar si algo no funciona** â€” WhatsApp Atiko, response time <2h hÃ¡biles
6. **Reporte mensual** â€” explicar que llegarÃ¡ el Ãºltimo dÃ­a del mes con mÃ©tricas

## KPIs a monitorear (Atiko interno)

Por cliente:

- **Tasa de Ã©xito:** vouchers procesados sin error / total recibidos â‰¥ 95%
- **Tiempo de procesamiento:** desde recibir mensaje hasta confirmar al cliente â‰¤ 30 segundos
- **Tasa de duplicados:** deberÃ­a ser <5% (si es mÃ¡s alta, los clientes estÃ¡n reenviando, mejorar el feedback)
- **Errores de OCR:** monto/fecha/op mal extraÃ­do â†’ <2%

Alertas automÃ¡ticas:

- Si tasa de error >10% en 24h â†’ revisar manualmente
- Si Anthropic API gasta >$10 USD/dÃ­a â†’ verificar (probable bot o spam)
- Si volumen baja a 0 por >12h en horario laboral â†’ algo se rompiÃ³, intervenir

## Mantenimiento mensual

Lo que Atiko hace para justificar los $29.000/mes:

- [ ] Revisar logs de n8n cada lunes (15 min)
- [ ] Verificar dashboard del cliente con mÃ©tricas (10 min)
- [ ] Hacer 1 muestreo aleatorio: tomar 5 vouchers del mes, verificar que el dato extraÃ­do coincide con el voucher real (15 min)
- [ ] Verificar que el saldo de Anthropic + Twilio no se haya agotado (5 min)
- [ ] Generar reporte para el cliente con `reporte-mensual-cliente` (30 min)
- [ ] Si nuevo banco aparece con formato diferente: actualizar prompt de Claude Vision con ejemplos
- [ ] Total: ~1.5 horas/mes/cliente Ã— $15.000 efectivo = MUY rentable

## Errores comunes y soluciones

### El cliente recibe duplicados de la confirmaciÃ³n

â†’ Twilio reintenta webhooks si no devolvÃ©s 200 OK rÃ¡pido. SoluciÃ³n: en el primer nodo de n8n, devolver inmediatamente 200 y procesar async despuÃ©s.

### El OCR confunde el monto

â†’ Caso tÃ­pico: voucher dice "$ 89.000" o "$89.000.-" o "89000". SoluciÃ³n: en el prompt de Claude pedir "monto en CLP como nÃºmero entero sin separadores", y validar en cÃ³digo que sea > 0.

### El cliente quiere recibir un mensaje distinto al final

â†’ El nodo 10 tiene el template hardcodeado. SoluciÃ³n: hacer el mensaje configurable en una variable de entorno por cliente.

### Cliente cambiÃ³ de banco y vouchers se ven distintos

â†’ Re-entrenar el prompt mostrando un ejemplo nuevo. Esto puede ser parte del mantenimiento $29k/mes o cobrarse como "ajuste tÃ©cnico" $50k extra una vez.

## PrÃ³ximos pasos al cerrar venta de este servicio

Cuando un cliente firma:

1. Crear carpeta `04-Automatizaciones/voucher-to-sheets/` en su carpeta cliente
2. Documentar specs del cliente: banco usado, ejemplo voucher, volumen esperado
3. Ejecutar el flujo del skill `onboarding-cliente`
4. Programar instalaciÃ³n en n8n para los prÃ³ximos 3-5 dÃ­as hÃ¡biles
5. CapacitaciÃ³n 30 min dÃ­a 5
6. PerÃ­odo de prueba 7 dÃ­as (Atiko vigila)
7. Pasar a "producciÃ³n" dÃ­a 12
8. Primer reporte mensual dÃ­a 30 con `reporte-mensual-cliente`

