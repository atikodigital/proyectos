---
name: emision-boleta-sii
description: Guía paso a paso para emitir boleta o factura electrónica (DTE) en el SII de Chile. Cubre el sistema gratuito del SII, ayuda a llenar campos correctamente, calcular IVA, registrar el asiento contable y archivar el PDF. Se activa con "emitir boleta", "emitir factura", "DTE", "factura SII", "cobrar a cliente", "boleta electrónica chile".
version: 1.0
author: Atiko
---

# Emisión Boleta/Factura Electrónica SII Chile — Skill

## Cuándo usar esta skill

Cada vez que cobres a un cliente. Por ley en Chile, todo servicio prestado requiere emitir DTE (Documento Tributario Electrónico) dentro del mes calendario.

Triggers:
- "emite boleta a [cliente]"
- "factura para [empresa]"
- "DTE [empresa]"
- "cobra a [cliente]"
- "cómo emito boleta SII"
- "necesito facturar a [cliente]"

## Decisión inicial: Boleta o Factura

| | Boleta de Servicios | Factura Electrónica |
|---|---------------------|---------------------|
| **Cliente final** | Personas naturales sin giro | Empresas con RUT activo en SII |
| **IVA** | NO afecto (servicios profesionales) | Afecto IVA 19% |
| **Documento** | Boleta Honorarios o Boleta Servicios Electrónica | Factura Electrónica |
| **Retención** | 12.25% del bruto (2026, sube cada año hasta 17% en 2028) | No hay retención |
| **Quién recibe el dinero** | Tú menos retención | Tú entero (IVA queda separado para devolver al SII) |

**Para Atiko, en general:**
- Cliente persona natural pyme → Boleta Honorarios (12.25% retención)
- Cliente empresa con RUT → **Factura Electrónica afecta a IVA 19%** ← lo más común

## Información requerida del cliente

Antes de emitir, asegúrate de tener:

1. **Razón social** completa (sin abreviaciones)
2. **RUT** con verificador (XX.XXX.XXX-X)
3. **Giro comercial** de la empresa (lo que vende)
4. **Dirección comercial completa** (calle, número, comuna, ciudad)
5. **Email para recepción del DTE** (obligatorio enviar el XML por mail)
6. **Forma de pago** (transferencia / Khipu / efectivo / 30 días)

Si falta alguno: solicitarlo al cliente ANTES de intentar emitir. Sin esto el SII rechaza el DTE.

## Paso a paso · Sistema gratuito SII

### A. Acceso

1. Ir a [sii.cl](https://www.sii.cl)
2. Login con Clave Única o Clave Tributaria
3. Menú: "Servicios Online" → "Factura electrónica" → "Sistema de facturación gratuito del SII"
4. Click en "Emisión de documentos tributarios electrónicos"

### B. Tipo de documento

Para Atiko, normalmente:

- **33** — Factura Electrónica (con IVA, para empresa B2B) ← lo más común
- **34** — Factura No Afecta o Exenta de IVA (servicios profesionales con honorarios)
- **39** — Boleta Electrónica (consumidor final persona natural)

### C. Llenar emisor (auto-rellena con tus datos)

Verificar que aparezcan correctamente:
- Tu RUT
- Tu razón social: "[Tu nombre completo] EIRL" o tu RUT persona natural
- Giro: el que registraste en inicio de actividades
- Dirección
- Teléfono / email

### D. Llenar receptor (datos del cliente)

Pegar los datos requeridos del cliente. Cuidado con:
- RUT formato correcto: `12345678-9` (sin puntos)
- Razón social EXACTA al SII (el cliente puede dártela; si no, consultar en [SII consulta RUT](https://zeus.sii.cl/cvc_cgi/dte/ce_consulta_rut))

### E. Detalle del servicio

Línea de detalle estándar para Atiko:

```
Descripción: Servicios de [Plan Atiko Start / Pro / 360°] - Mes [mes año]
Cantidad: 1
Unidad: SERV (Servicios)
Precio unitario neto: $[monto neto]
```

**Cálculo del monto:**

Si vendes a $89.000 CLP (precio mostrado al cliente, IVA incluido), el desglose es:

- **Neto:** $89.000 / 1.19 = **$74.790** (lo que va en "Precio unitario neto")
- **IVA 19%:** $89.000 - $74.790 = **$14.210**
- **Total:** $89.000

El SII calcula automáticamente IVA si pones bien el neto.

⚠️ **Error común:** poner el precio FINAL como "precio neto". Si tu plan se publicita a $89.000, ese es el TOTAL — no el neto.

### F. Glosa adicional (opcional pero recomendado)

Añadir en el campo "Glosa" o referencias:

```
Servicios de agencia digital según contrato [N° contrato] del [fecha contrato].
Período facturado: [01-mes-año] al [último-mes-año].
Incluye: [3 bullets resumidos del plan].
```

### G. Forma de pago

- "Contado" si es transferencia inmediata
- "Crédito 30 días" si es pago al final del mes
- "Otros" + nota si es Khipu

### H. Validación pre-emisión

Antes de "Emitir":

- [ ] RUT receptor verificado
- [ ] Monto neto correcto (no confundir con total con IVA)
- [ ] Período en glosa
- [ ] Forma de pago coherente con lo acordado

### I. Emisión

- Click en "Emitir"
- El SII genera el DTE con folio único
- Descargar PDF
- El SII envía automáticamente XML al email del receptor (verificar que sí lo recibió)

### J. Post-emisión

1. **Guardar PDF** en `03-Clientes/[Empresa]/05-Facturas-emitidas/factura-[YYYY-MM]-folio[N].pdf`
2. **Enviar PDF al cliente** por WhatsApp (no solo confiar en XML automático):
   ```
   Hola [Nombre], te adjunto la factura del mes.
   Te llegó el XML por email también.
   Vencimiento: [fecha]. Te dejo link de pago aquí: [Khipu]
   Cualquier cosa avísame.
   ```
3. **Registrar asiento contable** (ver sección abajo)
4. **Actualizar CRM:** Estado factura "Emitida · pendiente pago"
5. **Crear recordatorio:** si no paga en 7 días post-vencimiento, gatillar `invoice-chase`

## Asiento contable a registrar

Para una factura de $89.000 (neto $74.790 + IVA $14.210):

```
DEBE                          $ Neto       IVA        Total
  Cliente x cobrar (asset)    $89.000
HABER
  Ingresos por servicios                              $74.790
  IVA débito fiscal                       $14.210

Concepto: Factura electrónica N°[folio] al cliente [Empresa] · Período [mes]
```

Cuando el cliente pague:

```
DEBE
  Banco / Efectivo            $89.000
HABER
  Cliente x cobrar                                    $89.000

Concepto: Pago factura [folio] por [Empresa]
```

## Errores comunes y cómo solucionarlos

### Error: "RUT del receptor no se encuentra"
→ El cliente NO está habilitado para recibir factura electrónica en SII.
→ Solución: Pedirle al cliente que vaya al SII → "Postular a sistema gratuito de facturación" → habilita recepción.
→ Mientras tanto: emitir Boleta de Servicios (34) en lugar de Factura (33).

### Error: "Folio agotado"
→ Solo aplica si usas software pagado con folios comprados.
→ En sistema SII gratis no pasa (folios ilimitados).

### Error: "El cliente dice que no le llegó la factura"
→ Verificar email del receptor (caso típico: típico de Gmail al spam)
→ Reenviar manualmente el XML descargado del SII
→ Documentar en CRM el reenvío

### Cliente quiere ANULAR factura ya emitida
→ NO se puede anular en SII (solo cliente final con boleta dentro del mes)
→ Emitir **Nota de Crédito (61)** por el mismo monto que neutraliza la factura
→ Si corresponde, emitir factura corregida

## Calendario fiscal mensual SII

Cada mes Atiko debe:

- **Día 12 del mes siguiente:** Presentar F29 (declaración mensual IVA y retenciones)
  - El sistema gratuito SII tiene F29 propuesto pre-llenado
  - Solo confirmar y pagar el saldo (si lo hay)

- **Día 1-12 del mes siguiente:** Pagar PPM (Pago Provisional Mensual) — 1% de ingresos brutos
  - Se paga junto con F29

- **Abril año siguiente:** Presentar F22 (Operación Renta anual)

### Estimación mensual para Atiko

Si facturas $1.000.000 CLP/mes neto (≈ 5 clientes Plan Pro):

| Concepto | Monto |
|---|---|
| Ingresos brutos | $1.000.000 |
| IVA débito | $190.000 (lo debes al SII) |
| IVA crédito (gastos: hosting, dominio, Workspace, etc.) | ~$30.000 |
| **IVA neto a pagar día 12** | **~$160.000** |
| PPM 1% sobre brutos | $10.000 |
| **Total a pagar al SII mes siguiente** | **~$170.000** |

⚠️ **Regla de oro:** apartar el 20% de cada cobro en una cuenta separada para impuestos. Cuenta vista "IVA-Atiko" automatizada.

## Recordatorio: Boleta Honorarios vs Factura

Si Atiko opera como **persona natural** (Fase 0 del PLAN-MAESTRO), inicialmente puedes usar **Boleta de Honorarios** electrónica.

### Boleta de Honorarios (BHE)

- Solo para servicios profesionales personales (no empresa)
- Sin IVA
- **Retención 12.25%** (2026, sube progresivamente):
  - 2026: 12.25%
  - 2027: 13.75%
  - 2028: 17%
- Lo retiene el cliente PJ. Lo declaras anualmente como crédito.

Si cobras $89.000 con BHE:
- Cliente paga: $89.000
- Cliente retiene: $10.903 (12.25%) → lo paga al SII por ti
- Tú recibes: $78.097

Después en F22 anual recuperas la retención si gastos superan ingresos, o usas el 12.25% como crédito contra tu impuesto a la renta.

**Recomendación:** apenas tengas 3 clientes recurrentes, constituir EIRL y pasar a Factura Electrónica con IVA. Te queda más limpio fiscalmente.

## Después de emitir

Recordar a José:

1. ✅ DTE emitido en SII
2. ✅ PDF guardado en carpeta cliente
3. ✅ Email/WhatsApp al cliente con factura adjunta
4. ✅ Asiento contable registrado
5. ✅ CRM actualizado
6. ✅ 20% del bruto reservado para impuestos
7. ⏰ Recordatorio día 12 para F29
