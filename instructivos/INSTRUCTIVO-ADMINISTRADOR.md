# 🛠️ Hash IA — Guía para el administrador (Atiko)

Esta guía es para ti, que instalas y administras los clientes de Hash IA. Cubre cómo **dar de alta un cliente nuevo**, usar el **panel/dashboard del dueño** y mantener la operación.

---

## 0. Accesos (URLs)

El backend de Hash IA corre en `https://gastos.atikodigital.cl` (VPS, puerto 3100). Hay **dos páginas** distintas:

| Página | URL | Para quién | Login |
|---|---|---|---|
| **Admin (Atiko)** — *la tuya* | `https://gastos.atikodigital.cl/admin/` | Tú (la agencia) | usuario `atiko` + contraseña (variable `GASTOS_ADMIN_PASSWORD` del servidor) |
| **Panel del dueño** | `https://gastos.atikodigital.cl/panel/` | El cliente (dueño) | email + contraseña del dueño |

> El usuario admin se define en `GASTOS_ADMIN_USER` (por defecto `atiko`) y la clave en `GASTOS_ADMIN_PASSWORD`, ambas en el `.env` del servidor. Si la página dice "admin_no_configurado", es que falta setear `GASTOS_ADMIN_PASSWORD`.

### Qué hace tu página de Admin (`/admin`)
Es el panel de **gestión de clientes de la agencia**:
- **Ver todos tus clientes** con sus estadísticas del mes. (`GET /api/admin/clientes`)
- **Crear un cliente nuevo** (empresa). (`POST /api/admin/clientes`)
- **Asignar/cambiar el plan** de un cliente. (`PATCH /api/admin/clientes/:id/plan`)
- **Crear el login del dueño** (usuario y clave para que entre a su panel). (`POST /api/admin/clientes/:id/login`)

---

## 1. Roles y accesos

La plataforma tiene dos tipos de inicio de sesión:

| Tipo | Quién | Dónde entra | Para qué |
|---|---|---|---|
| **Empleado** (`employee`) | Cajeros, garzones, etc. | La **app** del celular | Capturar y dictar movimientos |
| **Usuario** (`user`) | Dueño (`owner`) y tú (`atiko_admin`) | El **Panel web** | Reportes, conciliación, gestión, Excel |

- Los **empleados** deben estar en la *whitelist* (tabla `employees`) para poder usar la app o mandar fotos por WhatsApp. Si no están, el sistema los ignora.
- El **dueño** ve solo su empresa. Tú, como `atiko_admin`, administras la cuenta.

---

## 2. Instalar un cliente nuevo — paso a paso

> 🔁 Si vas a montar el agente omnicanal completo (web + voz + WhatsApp + Messenger + Instagram) usa la skill **`deploy-omnichannel-agent`**, que es el playbook de despliegue probado en producción. Esta guía cubre la parte de **Hash IA** (contabilidad).

1. **Crear la empresa** — registra: razón social, **RUT**, **giro/rubro**, WhatsApp del dueño. (Tabla `companies`; en el panel: *Empresa*.)
2. **Cargar el giro** — define el rubro (ej. "restaurante", "pastelería"). Esto alimenta las sugerencias de categoría y la semilla de insumos.
3. **Sembrar auxiliares por rubro** — en el panel, *Auxiliares → Sembrar*: crea los insumos típicos del giro (harina, queso, etc.) para los reportes de consumo. (`POST /auxiliares/sembrar`).
4. **Dar de alta a los empleados** (whitelist) — por cada uno: nombre, teléfono (E.164), usuario, contraseña y **rol** (`empleado` o `admin`). (Panel: *Empleados*; `POST /employees`.)
5. **Configurar WhatsApp** (si aplica) — registra el número Business del cliente (`wa_phone_number_id` + token). Sin esto, el resumen por WhatsApp y la captura por WhatsApp no funcionan.
6. **Configurar catálogo y despacho** (opcional, para pedidos) — productos, costo de delivery, comunas. (Panel: *Catálogo* y *Pedido-config*.)
7. **Onboarding del dueño con Kaly** — al primer arranque, Kaly hace el onboarding: pregunta el nombre, deduce el trato y explica las 4 pantallas. Asegúrate de que el dueño lo complete (queda registrado en `onboarded_at`).
8. **Prueba end-to-end** — captura 1 boleta, dicta 1 gasto a Kaly, sube 1 cartola y revisa los reportes. (Tienes un set de prueba completo en `pruebas-bella-napoli/`.)

### ✅ Checklist de instalación
- [ ] Empresa creada (RUT + giro)
- [ ] Auxiliares sembrados por rubro
- [ ] Empleados en la whitelist con sus credenciales
- [ ] WhatsApp configurado (si aplica)
- [ ] Catálogo/despacho (si aplica)
- [ ] Onboarding de Kaly completado por el dueño
- [ ] Prueba end-to-end OK (captura, dictado, conciliación, reporte)

---

## 3. El Panel web del dueño (dashboard)

Lo que el dueño (y tú) pueden hacer desde el panel:

### 📊 Contabilidad (reportes VARAS)
- **Libro Diario** — todos los asientos del período.
- **Libro Mayor** — saldo por cuenta.
- **Balance de comprobación** — totales debe/haber y si cuadra.
- **Flujo de caja** — entradas, salidas y neto.
- Cada uno se **exporta a Excel** (`/contabilidad/*.xlsx`).

### 🔴 Conciliación
- Ver la **última conciliación** bancaria o SII (cuadrado, SCA/SBA). (`/contabilidad/conciliacion?tipo=bancaria|sii`.)

### 💸 Gastos / Movimientos
- Listar con **filtros** (fecha, empleado, categoría, estado, estado de pago, tipo, proveedor).
- **Marcar pagado**, **editar**, **anular**, ver la **foto** del documento.
- Exportar todo a **Excel**.

### 👥 Empleados
- Crear, editar, **desactivar** empleados y asignar roles.

### 🧾 Auxiliares (insumos)
- Listar, crear, editar, fusionar y ver **consumo** por insumo (ej. cuánta harina se consumió).

### 📲 Resumen por WhatsApp
- Enviar el **resumen de caja del mes** al WhatsApp del dueño con un clic (`POST /whatsapp/resumen`).

### ✍️ Asientos manuales
- Crear/anular asientos manuales y ver el plan de **cuentas**. (Para ajustes que VARAS proponga.)

> ⚠️ El **Panel web del dueño (Plan 5)** está en construcción: algunas vistas pueden estar parciales. Los **endpoints** ya existen; la UI se completa por fases.

---

## 4. Operación y soporte

- **Fotos:** se guardan en el VPS y se borran automáticamente a los ~2 meses. Si el cliente necesita el respaldo, que exporte a Excel.
- **Deduplicación:** el sistema bloquea documentos repetidos (mismo folio + RUT, o misma foto). Si el cliente reclama un "duplicado", revisa si subió la misma boleta dos veces.
- **Conciliación que no cuadra:** revisa comisiones bancarias, depósitos en tránsito y cheques no cobrados — son las diferencias típicas que VARAS propone ajustar.
- **Cliente nuevo de prueba:** usa la pizzería ficticia **Bella Napoli** (`pruebas-bella-napoli/`) para entrenar al cliente sin tocar datos reales.

---

## 5. Qué les enseñas a Kaly y VARAS

Para que en cada instalación los agentes **guíen solos** al cliente (qué/cómo/cuándo usar la app), revisa [CONOCIMIENTO-AGENTES.md](CONOCIMIENTO-AGENTES.md): contiene el conocimiento de uso listo para inyectar en sus prompts.
