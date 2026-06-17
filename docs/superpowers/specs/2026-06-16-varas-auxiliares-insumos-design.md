# VARAS — Auxiliares de insumos analíticos — Diseño

**Fecha:** 2026-06-16
**Producto:** Hash IA Finanzas / VARAS (ver `varas-contabilidad-conciliacion`)
**Repo:** `HASH IA\` (repo canónico)
**Estado:** diseño aprobado, pendiente plan de implementación (writing-plans)

## 1. Objetivo

Que cada **línea** de una factura recibida (gasto) quede asociada, además de a su
cuenta contable, a un **auxiliar** (insumo de naturaleza similar: harina, levadura,
electricidad, agua…) con **cantidad + unidad**. Así el dueño puede preguntarle a VARAS:
- "¿cuánta harina consumimos? (en kilos)"
- "¿cuánto gastamos en harina ($)?"
- "dame la evolución de la harina / de la electricidad"
- "¿cuántos kWh / m³ consumimos?"

Los auxiliares **cambian según el rubro** (peluquería ≠ pastelería ≠ pizzería), por eso
deben ser **dinámicos por empresa**, generados/sugeridos por IA y curados por el dueño —
no hardcodeados.

## 2. Decisiones (aprobadas vía AskUserQuestion, 2026-06-16)

1. **Granularidad: línea por línea con cantidades.** El OCR lee cada ítem de la factura (descripción, cantidad, unidad, monto) y mapea cada línea a un auxiliar. (Permite "cuántos kilos".)
2. **Gobierno de auxiliares: VARAS propone, el dueño cura.** La IA detecta el rubro, crea/sugiere auxiliares al leer facturas, **normaliza/agrupa** ("harina 1kg" y "harina 100kg" → "Harina"), y el dueño puede renombrar/fusionar/borrar.
3. **Confirmación: resumen confirmable.** VARAS muestra el desglose líneas→auxiliar→cantidad+unidad+monto en la pantalla de confirmar; el dueño aprueba de un toque o corrige una línea.

## 3. Enfoque

**Líneas + catálogo de auxiliares** (descartados: 1-auxiliar-por-documento porque una
factura de distribuidor trae varios insumos; dimensiones analíticas genéricas = YAGNI).

## 4. Modelo de datos (migración aditiva, idempotente en `migrate.js`)

### 4.1 `auxiliares` — catálogo de insumos por empresa
```
auxiliares (
  id              uuid PK,
  company_id      uuid NOT NULL,
  nombre          text NOT NULL,      -- canónico: "Harina"
  cuenta_id       uuid,               -- a qué cuenta contable cuelga (FK cuentas; nullable al sugerir)
  naturaleza      text,               -- insumo | servicio | energia | otro
  unidad_principal text,              -- kg | L | kWh | m3 | un | fijo
  sinonimos       jsonb DEFAULT '[]', -- ["harina de trigo","harina 0000","saco harina"...]
  estado          text DEFAULT 'sugerido', -- sugerido | confirmado
  activo          boolean DEFAULT true,
  created_at      timestamptz
)
```
- Cada auxiliar cuelga de UNA cuenta contable (ej. "Harina" → "Costos Directos del Giro"; "Electricidad" → "Servicios básicos"). La IA sugiere la cuenta; si no, hereda la cuenta del gasto.
- `sinonimos` es la clave de la normalización: mapear variantes de la descripción al mismo auxiliar canónico.
- `estado='sugerido'` cuando la IA lo crea; pasa a `confirmado` cuando el dueño lo valida/usa.

### 4.2 `expense_lineas` — detalle por ítem de la factura
```
expense_lineas (
  id          uuid PK,
  expense_id  uuid NOT NULL,   -- FK expenses ON DELETE CASCADE
  orden       int,
  descripcion text,            -- texto crudo de la línea
  auxiliar_id uuid,            -- FK auxiliares (nullable)
  cantidad    numeric,
  unidad      text,
  neto        bigint DEFAULT 0,
  iva         bigint DEFAULT 0,
  total       bigint DEFAULT 0
)
```
- Una `expenses` (cabecera) → N `expense_lineas`. La cabecera mantiene sus totales y su cuenta (como hoy). La **suma de líneas = total del documento** (con tolerancia de redondeo; si no detalla líneas, queda una sola línea = el total).
- Índices: `expense_lineas(expense_id)`, `auxiliares(company_id)`, `auxiliares(company_id, nombre)`.

## 5. El protocolo (flujo al leer una factura recibida)

1. **OCR línea-a-línea** (`ocr/gemini.js` extendido): además de los totales, Gemini devuelve `lineas: [{descripcion, cantidad, unidad, neto, total}]`.
2. **Mapeo + normalización por línea** (`auxiliares/mapear.js`, IA): con el **rubro de la empresa + catálogo de auxiliares existente**, para cada línea:
   - mapea la descripción a un auxiliar EXISTENTE (por nombre/sinónimos), o
   - propone uno NUEVO canónico ("Harina") con naturaleza + unidad_principal + cuenta sugerida;
   - normaliza cantidad/unidad (2 sacos de 25 kg → 50 kg);
   - agrupa lo similar bajo el mismo auxiliar (agrega la variante a `sinonimos`).
3. **Resumen confirmable** (app): desglose líneas→auxiliar→cantidad·unidad·monto; el dueño aprueba o corrige (reasignar auxiliar, fusionar, ajustar cantidad/unidad). Los auxiliares nuevos se crean `sugerido` y se confirman al aprobar.
4. **Persiste** `expenses` + `expense_lineas`. La contabilidad (asiento) sigue por cuenta (sin cambios); el detalle analítico queda en las líneas.

## 6. Semilla por rubro

Al activar la empresa (o primera factura), VARAS **genera con IA** un set inicial de
auxiliares típicos del **giro** (pizzería: harina, levadura, queso, mozzarella, salsa,
cajas, gas, electricidad, agua, arriendo; peluquería: shampoo, tinte, agua, electricidad…).
Dinámico, no hardcodeado. El dueño lo ajusta. El giro se toma de la empresa (campo
existente o se pregunta una vez).

## 7. Reportes / consultas

- `GET /api/app/auxiliares` (lista, con consumo del período) y `GET /api/app/auxiliares/:id/consumo?periodo=YYYY-MM` → `{ cantidadPorUnidad: {kg: N, ...}, monto, serie: [{ym, cantidad, monto}] }`.
- "¿cuánta harina?" → Σ cantidad por unidad + Σ monto del período. "evolución" → serie mensual.
- **VARAS conversacional (F4)** consume estas consultas como **tools** por voz/chat: `consumo_auxiliar(nombre, periodo)`, `evolucion_auxiliar(nombre)`, `gasto_por_auxiliar(periodo)`.
- **Panel:** vista de auxiliares con consumo (cantidad + monto) y evolución; CRUD (renombrar/fusionar/borrar/recolgar a otra cuenta).

## 8. Unidades heterogéneas

Cada línea guarda cantidad+unidad tal cual se leyó (kg, L, kWh, m³, un, fijo). El auxiliar
tiene una `unidad_principal`. Si llegan unidades mezcladas para el mismo auxiliar, el
reporte agrupa **por unidad** (`cantidadPorUnidad`) y normaliza a la principal solo cuando
hay factor conocido. Energía/agua: kWh y m³ vienen de la boleta (líneas de servicio).

## 9. Faseo

| Fase | Entrega |
|---|---|
| **A1 — Modelo + OCR líneas** | tablas `auxiliares` + `expense_lineas`; OCR línea-a-línea (`gemini.js` devuelve `lineas`); persistencia de líneas en intake. |
| **A2 — Mapeo IA + normalización + semilla** | `auxiliares/repo.js` (CRUD + normalize + dedup por sinónimos), `auxiliares/mapear.js` (línea→auxiliar, IA inyectable), semilla por rubro. |
| **A3 — Confirmación + CRUD** | desglose confirmable en la app (ConfirmScreen) + sección Auxiliares en el panel (renombrar/fusionar/borrar). |
| **A4 — Reportes + VARAS** | endpoints de consumo/evolución + tools conversacionales de VARAS. |

Cada fase: spec→plan→TDD. A1 primero (sin líneas no hay nada que mapear).

## 10. Testing

- **Puro:** normalización (descripción→auxiliar canónico, agrupar sinónimos, normalizar unidad/cantidad), suma de líneas vs total (tolerancia).
- **Mapeo IA** con http/IA inyectable (tests sin red), incluyendo "auxiliar nuevo" y "auxiliar existente por sinónimo".
- **Repo** con pg-mem (crear/listar/fusionar auxiliares; líneas por expense).
- **Reportes:** consumo por unidad + serie temporal con datos sembrados.
- Multi-tenant: todo scoped por `company_id`.

## 11. Integración con lo existente

- **No rompe** el flujo actual: si una factura no detalla líneas, se guarda 1 línea = el total con su categoría/cuenta (comportamiento equivalente al de hoy). El auxiliar es opcional por línea.
- La **contabilidad (asientos, F1)** no cambia: sigue por cuenta. Los auxiliares son una dimensión analítica adicional, no contable.
- Reusa el patrón de OCR (`ocr/gemini.js`), intake (`expenses/intake.js`), cuentas (`contabilidad/cuentas.js`) y el agente conversacional de VARAS (F4).
