# Diseño — Agente omnicanal multi-tenant (SaaS, una sola app de Meta)

Fecha: 2026-06-15 · Estado: diseño aprobado (modelo SaaS multi-tenant + auto-conexión)

## Objetivo
Pasar del agente omnicanal **single-tenant** (un negocio, tokens fijos en `.env`) a un **SaaS
multi-tenant**: **una sola app de Meta** sirve a N clientes, cada uno conecta **solo** su WhatsApp /
Página de Facebook / Instagram vía **Embedded Signup**. Reusa el cerebro (NEXO/ai.js) y el CRM ya
existentes.

## El cambio central: routing por DESTINO
Hoy el webhook asume un negocio. Multi-tenant = **un único webhook** para todos; se enruta por el id
de destino que viene en el payload:
- WhatsApp → `entry[].changes[].value.metadata.phone_number_id` → tenant dueño de ese número.
- Messenger → `entry[].id` (page id) → tenant dueño de esa página.
- Instagram → `entry[].id` (ig account id) → tenant.
→ `aiService.chat(sessionId, msg, { channel, tenant })` carga el **prompt/config del tenant** (de la
DB, no de un archivo).

## Modelo de datos (nuevas tablas)
- `tenants`: id, nombre, dominio, plan, estado, branding, **config_negocio** (prompt/FAQs/productos), created_at.
- `tenant_channels`: tenant_id, channel (whatsapp|messenger|instagram), external_id
  (phone_number_id | page_id | ig_id), waba_id, token (cifrado), estado, connected_at.
- `tenant_usuarios`: login del cliente al portal (email/clave) ↔ tenant.
- (Reusar el CRM existente: conversaciones/mensajes/pedidos **scoped por tenant_id**.)

## Componentes
1. **Backend multi-tenant** (sobre `atiko-agent`): resolver tenant por destino, cargar su config,
   responder con su cerebro. Tokens por tenant (no en `.env`).
2. **Embedded Signup** (lo nuevo grande): flujo web con **Facebook Login for Business** + el JS SDK
   de WhatsApp Embedded Signup → el cliente autoriza → backend intercambia por tokens, registra el
   WABA/página, **suscribe los webhooks** de ESE cliente, guarda en `tenant_channels`.
3. **Portal del cliente** (extiende el portal Atiko): el cliente entra, llena su info de negocio,
   conecta sus canales (botón "Conectar WhatsApp/Facebook/Instagram"), y ve su CRM/conversaciones.
4. **Admin Atiko**: alta de tenants, planes, estado de canales, uso.
5. **Billing por tenant**: WhatsApp es **pago por conversación** (Meta cobra) → medir y cobrar por
   plan; límites por plan.

## Prerrequisitos de Meta (lo MÁS LENTO — arrancar YA, en paralelo)
- **Business Verification** de la app de Meta.
- **App Review / Acceso Avanzado** de: `whatsapp_business_messaging`, `whatsapp_business_management`,
  `pages_messaging`, `instagram_manage_messages`. Sin esto solo funcionan TUS cuentas/testers.
- Registrarse como **Tech Provider / Solution Partner** (para WhatsApp Embedded Signup).
- ⚠️ **WhatsApp Cloud API**: el número del cliente **migra a la WhatsApp Business Platform** y deja
  de servir como WhatsApp app normal. Solo para clientes con **número dedicado**. (Para el pyme con
  WhatsApp normal → el producto "Chat" por notificaciones, no esto.)
- Messenger/Instagram NO migran número: el cliente solo conecta su página/cuenta.

## Roadmap por fases
| Fase | Qué | Depende de Meta | Construible hoy |
|---|---|---|---|
| **F0** | Business Verification + App Review + alta Tech Provider | ✅ (semanas) | arrancar trámite YA |
| **F1** | Backend multi-tenant: tablas + routing por destino + config por tenant | ❌ | ✅ (con tus cuentas en dev) |
| **F2** | Cerebro por tenant (prompt/negocio desde DB) + CRM scoped por tenant | ❌ | ✅ |
| **F3** | Embedded Signup (FB Login for Business + WABA onboarding + suscripción webhooks) | ✅ (necesita app aprobada para clientes reales; dev con tus cuentas) | parcial |
| **F4** | Portal del cliente (config negocio + conectar canales + CRM) | ❌ | ✅ |
| **F5** | Billing/planes + admin Atiko | ❌ | ✅ |

**Orden recomendado:** F0 (trámite) en paralelo desde ya · luego F1→F2 (backend, testeable con tus
cuentas) · F4 (portal) · F3 (embedded signup, se prueba con tus cuentas y queda listo para cuando
Meta apruebe) · F5.

## Estrategia de producto (dos carriles, complementarios)
- **Agente omnicanal multi-tenant (esto)** → clientes que quieren un **bot que vende/responde** en
  número/página dedicada. Pago por conversación + mensualidad.
- **"Chat" por notificaciones** (ya hecho) → pyme con **WhatsApp normal** que solo arma pedidos. Sin
  migración, sin App Review.

## Riesgos / decisiones abiertas
- WhatsApp Embedded Signup exige Tech Provider + el caveat de migración de número.
- Cifrado de tokens por tenant en la DB.
- Aislamiento estricto por tenant (no filtrar conversaciones entre clientes).
- Costos de conversación de Meta → definir markup y planes.
