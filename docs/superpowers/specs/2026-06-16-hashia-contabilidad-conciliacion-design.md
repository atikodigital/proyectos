# Hash IA — VARAS: Módulo de Contabilidad y Conciliación (Match) — Diseño

**Fecha:** 2026-06-16
**Producto:** Hash IA Finanzas (ver `atiko-gastos`)
**Branch:** `claude/dazzling-driscoll-78a112` (worktree — fuente del APK y de los deploys de gastos)
**Estado:** diseño aprobado, pendiente plan de implementación (writing-plans)

> **VARAS** es el agente contable de Hash IA — el "Controlador Financiero Autónomo".
> Es un agente **nuevo y separado de K.A.L.Y.** (que sigue siendo el asistente de
> captura/voz general). VARAS es el dueño de todo este módulo: genera la
> contabilidad en automático ("trabaja solo"), concilia banco/SII componiendo las
> diferencias, y responde preguntas en lenguaje natural (chat y voz). Ver §3bis.

## 1. Objetivo

Convertir la pestaña **Match** de un cruce línea-a-línea ("marcar pagado") en un
**módulo contable completo** con contabilidad de partida doble y conciliación de
tres fuentes de verdad.

El usuario (dueño PyME, sin saber contabilidad) escanea documentos por foto o
captura de pantalla; el sistema genera la contabilidad automáticamente y permite
**cuadrar el banco contable contra el banco real (cartola)** y contra el **SII**,
reconociendo y **componiendo las diferencias**.

Match pasa a ser el hogar del agente **VARAS** — un hub "VARAS · Contabilidad" con cinco vistas:

```
[ 🔄 Conciliación ] [ 📓 Libro Diario ] [ 📘 Libro Mayor ] [ ⚖️ Balance de Comprobación ] [ 💵 Flujo de Caja ]
```

## 2. Las tres fuentes de verdad

| Fuente | Qué representa | Cómo entra |
|---|---|---|
| 🧮 **Contabilidad (lo registrado)** | Lo que la empresa capturó/escaneó → sus asientos | App / WhatsApp / captura |
| 🏦 **Cartola bancaria** | Lo realmente pagado/cobrado (la plata que se movió) | Foto/PDF de la cartola |
| 🏛️ **Libro de Compras y Ventas SII** | Lo realmente emitido por y a la empresa (DTE oficiales) | Foto/captura/PDF del libro SII |

La conciliación trabaja en **dos ejes**, ambos con la lógica "reconocer diferencia → componer las partidas que la explican":

- **Eje 1 — Bancario:** Contabilidad ↔ Cartola.
- **Eje 2 — Tributario/SII:** Contabilidad ↔ Libro Compras/Ventas SII (cuadratura de IVA y de documentos faltantes).

El OCR ya detecta los tipos `cartola` y `libro_compra_venta` y los enruta a Match.

## 3. Decisiones de alcance (aprobadas)

1. **Partida doble real**, con asientos **auto-generados** + **asientos manuales** (estos últimos en la última fase).
2. **Devengado + pago vía Match:** al registrar una factura nace el asiento por emisión (devengo); cuando Match concilia, nace el asiento de pago. El Flujo de Caja sale de lo realmente pagado/conciliado.
3. **App + Panel web:** sub-menú en Match (app, resumido y mobile-friendly) + tablas completas y Excel en el panel.
4. **Plan de cuentas SII Mipyme fijo + editable por empresa.**
5. **Arquitectura Enfoque C (híbrido):** motor puro de mapeo movimiento→asiento + contabilizador idempotente que persiste en tablas de asientos.
6. **Rol de la IA (decisión F2, 2026-06-16): "IA revisa todo".** La capa determinística (match exacto + tolerancias + pagos masivos, ya existentes) corre primero como **pre-proceso y red de seguridad**, pero luego VARAS manda **la cartola completa + el libro auxiliar de banco a Gemini en UNA sola llamada** (no una por línea) y Gemini produce el informe completo (Controlador Financiero Autónomo, §6.5). Costo razonable: 1 llamada por conciliación (~miles de tokens = fracción de CLP).
7. **Asientos sugeridos (decisión F2): VARAS propone, el dueño confirma.** Las diferencias (comisión, interés, abono no identificado) se muestran como borrador de asiento; se contabilizan SOLO tras confirmación del dueño (un toque). Nada se asienta automático en conciliación.
8. **Informe de conciliación en app + panel** (decisión F2): app = tarjeta SCA vs SBA + partidas por tipo con botón confirmar; panel = workpaper completo.
7. **Saldo inicial:** la contabilidad arranca en cero el día que se enciende el módulo (asiento de apertura simple); no se carga historia previa.
8. **Flujo de Caja = solo lo conciliado/pagado** (plata real), no lo devengado.
9. **VARAS** es el agente que gobierna el módulo (ver §3bis): agente nuevo, separado de K.A.L.Y., dueño de toda la contabilidad.

## 3bis. El agente VARAS

VARAS es la identidad del módulo contable. Tiene **dos modos**:

### Modo autónomo ("trabaja solo")
- **Contabiliza:** al registrar/editar/anular un movimiento, VARAS genera o actualiza el asiento (el contabilizador de §5.2). El dueño no ve contabilidad; VARAS la arma sola.
- **Concilia:** procesa cartola/SII, calcula SCA/SBA, compone las partidas conciliatorias y propone asientos (§6). Es el "Controlador Financiero Autónomo" del system prompt de 5 bloques (§6.5).

### Modo conversacional (chat de texto **y** voz)
- Responde en lenguaje natural: "¿cuánto debo?", "¿qué falta conciliar?", "gastos por categoría del mes", "¿cuál es mi flujo de caja?".
- **Tools** (read-only sobre la contabilidad): consultar saldos por cuenta (Mayor), Balance, Flujo de Caja, deudas (Proveedores/Clientes), estado de conciliación.
- **Reusa la infraestructura de agente de K.A.L.Y.** (`kaly/live.js`, orb, tools, sesión efímera Gemini Live) pero con **personalidad, voz y esfera propias** — VARAS es serio/contable, distinto del tono de KALY. Voz y texto desde F4.

### Relación con K.A.L.Y.
Conviven como dos agentes distintos. KALY = captura/registro/voz general (el de la barra superior actual). VARAS = contabilidad/conciliación, vive dentro de Match. No comparten prompt ni voz; sí comparten la infra técnica de Gemini Live y el patrón de tools.

## 4. Modelo de datos

Migración **aditiva** (idempotente en `migrate.js`, mismo patrón que la v2). Nada se borra.

### 4.1 Plan de cuentas — tabla `cuentas`

```
cuentas (
  id          uuid PK,
  company_id  uuid FK companies,
  codigo      text,           -- código plan SII Mipyme
  nombre      text,
  tipo        text,           -- activo | pasivo | patrimonio | resultado_ganancia | resultado_perdida
  imputable   boolean,        -- true = recibe movimientos; false = cuenta título
  activo      boolean DEFAULT true,
  created_at  timestamptz
)
```

Se **siembra** por empresa con el plan SII Mipyme extendido con las cuentas mínimas
para que todo cuadre: **Caja, Banco, IVA Crédito Fiscal, IVA Débito Fiscal,
Proveedores (por pagar), Clientes (por cobrar), Ventas/Ingresos del giro**, más las
cuentas de gasto que ya existen en `domain/categories.js` (el mapeo `CATEGORY_TO_SII`
queda como la cuenta de gasto por defecto). Cada empresa puede agregar/renombrar
cuentas (editable, F-posterior; la siembra y lectura están desde F1).

### 4.2 Asientos — tablas `asientos` y `asiento_lineas`

```
asientos (
  id           uuid PK,
  company_id   uuid FK companies,
  fecha        date,
  glosa        text,
  origen       text,    -- expense | pago | conciliacion | manual | sii | apertura
  origen_ref   text,    -- id del expense / conciliación que lo generó (idempotencia)
  tipo_asiento text,    -- devengo | pago | ajuste | apertura
  estado       text,    -- borrador | confirmado | anulado
  created_at   timestamptz
)

asiento_lineas (
  id         uuid PK,
  asiento_id uuid FK asientos ON DELETE CASCADE,
  cuenta_id  uuid FK cuentas,
  debe       bigint DEFAULT 0,
  haber      bigint DEFAULT 0,
  glosa      text
)
```

**Invariante sagrada:** por asiento `Σ debe == Σ haber`. Un asiento descuadrado no se persiste (lo valida el motor antes de escribir).

Índices: `asientos(company_id)`, `asientos(company_id, fecha)`, único parcial sobre
`(company_id, origen, origen_ref, tipo_asiento)` para la idempotencia del contabilizador.

### 4.3 Conciliaciones — tabla `conciliaciones`

Guarda el resultado/workpaper de cada Match para auditoría:

```
conciliaciones (
  id                  uuid PK,
  company_id          uuid FK companies,
  tipo                text,    -- bancaria | sii
  fecha               date,
  saldo_inicial       bigint,
  saldo_final_cartola bigint,
  saldo_contable      bigint,
  sca                 bigint,  -- Saldo Contable Ajustado
  sba                 bigint,  -- Saldo Bancario Ajustado
  cuadrado            boolean, -- SCA == SBA
  partidas            jsonb,   -- partidas conciliatorias + excepciones (audit-ready workpaper)
  created_at          timestamptz
)
```

### 4.4 Libro SII — almacenamiento de lo leído del SII

El detalle del libro de compras/ventas leído del SII se guarda en `conciliaciones.partidas`
(o, si crece, una tabla `sii_documentos` en F3). Para F1/F2 no es necesario.

## 5. Motor contable (Fase 1)

### 5.1 `contabilidad/asientos.js` — puro, testeable

`asientoDeMovimiento(expense, cuentas)` → devuelve el asiento balanceado según el tipo:

- **Gasto a crédito (devengo):** Debe Gasto(cuenta SII) `neto` + IVA Crédito `iva` / Haber Proveedores `total`.
- **Pago de gasto (al conciliar):** Debe Proveedores `total` / Haber Banco `total`.
- **Ingreso/venta (devengo):** Debe Clientes `total` / Haber Ventas `neto` + IVA Débito `iva`.
- **Cobro de venta (al conciliar):** Debe Banco `total` / Haber Clientes `total`.
- **Nota de débito banco (comisión/impuesto):** Debe Gastos Financieros / Haber Banco.
- **Nota de crédito banco (abono):** Debe Banco / Haber Clientes o Ingreso según corresponda.
- **Apertura:** asiento simple inicial (saldos en cero) al encender el módulo.

Valida `Σdebe==Σhaber` antes de devolver; si no cuadra, lanza error (no se persiste).

### 5.2 `contabilidad/contabilizar.js` — contabilizador idempotente

Persiste/actualiza/anula el asiento de un movimiento, con clave
`(company_id, origen, origen_ref, tipo_asiento)`:

- Registrar gasto → crea asiento devengo.
- Editar gasto → regenera (reemplaza) su asiento devengo.
- Anular gasto → marca su(s) asiento(s) `anulado`.
- Conciliar pago en Match → crea asiento pago.

Garantiza que el Libro Diario siempre refleja el estado real, sin duplicar.

### 5.3 Reportes = consultas sobre `asiento_lineas` (no tablas nuevas)

| Reporte | Definición |
|---|---|
| 📓 **Libro Diario** | Asientos en orden cronológico (filtro de período YYYY-MM). |
| 📘 **Libro Mayor** | Agrupado por cuenta: movimientos + saldo por cuenta (cuenta-T). |
| ⚖️ **Balance de Comprobación** | Por cuenta: Σdebe, Σhaber, saldo deudor/acreedor; valida `Σdebe total == Σhaber total`. |
| 💵 **Flujo de Caja** | Movimientos de Caja+Banco (entradas/salidas), solo de asientos pago/conciliados → flujo real. |

Todos respetan `periodoRange` (YYYY-MM, ya existe en `expenses/query.js`) y excluyen asientos `anulado`.

## 6. Motor de conciliación (Fase 2 bancaria, Fase 3 SII)

Basado en el documento de arquitectura del agente de conciliación. Tres capas:

### 6.1 Capa 1 — Ingestión y estandarización canónica — `match/canonical.js` (puro)

- Fechas → ISO 8601 (reusa `toDate`/`parseFecha` de `domain/normalize`).
- Polaridad: `+` ingresos / `−` egresos (formaliza el actual `linea.tipo` cargo/abono a signo).
- **Saneo de glosas (anti prompt-injection):** la glosa del banco es texto de terceros, no confiable. Se limpia con regex/NER **antes** de tocar cualquier prompt (mitigación de la sección "defensa sistémica" del documento; principle of least privilege para el agente IA).
- El OCR de cartola debe leer también el **saldo inicial/final** (no solo las líneas) — extender `ocr/cartola.js`.

### 6.2 Capa 2 — Motor inferencial determinístico, 3 niveles — extiende `match/engine.js`

| Nivel | Qué hace | Estado actual |
|---|---|---|
| **N1** Exacto 1:1 | monto + fecha + referencia (n° operación) idénticos | ✅ `n_operacion +100` |
| **N2** Lógica difusa | tolerancia ±3 días hábiles, redondeo (unos pesos), similitud de glosa | 🟡 `d<=3` ya; falta redondeo y similitud mejor |
| **N3** Desagregación | 1:N (un cargo = varias facturas), ingeniería inversa de comisiones | ✅ `matchBulkPayment` (subset-sum) |

### 6.3 Capa 3 — Resolución de excepciones y composición — `match/conciliacion.js` (nuevo)

Lo no resuelto se clasifica en la **taxonomía de 6 partidas conciliatorias**:

| Partida | Lado | Acción sugerida |
|---|---|---|
| Cheque girado no cobrado | Empresa, no banco | marca *en tránsito*, deduce del saldo banco |
| Depósito en tránsito | Empresa, no banco | *en tránsito*, suma al saldo banco |
| Nota de débito (comisión/impuesto) | Banco, no empresa | propone asiento de gasto (borrador) |
| Nota de crédito (abono no id.) | Banco, no empresa | cruza con cuentas por cobrar, propone asiento de ingreso |
| Error interno (transposición/duplicado) | Falla | proximidad numérica + Levenshtein → propone corrección |
| Error del banco | Falla | reporte de excepción para reclamo formal |

### 6.4 Modelo matemático — método de saldos correctos

- **SCA** = Saldo Contable Inicial + Notas Crédito − Notas Débito ± errores empresa.
- **SBA** = Saldo Bancario Inicial + Depósitos en tránsito − Cheques en tránsito ± errores banco.
- **Regla de convergencia:** `SCA == SBA` → ✅ conciliado. Si no cuadra → ⚠️ escala a revisión humana (*human-in-the-loop*) con el detalle de la brecha. **Nunca inventa para cuadrar** ("cero conjeturas").

### 6.5 Capa IA — `match/componer.js` ("IA revisa todo")

`componerConciliacion()` arma el prompt con los **5 bloques** del documento:
1. Identidad: "Controlador Financiero Autónomo", determinístico, cero conjeturas.
2. Comprensión de datos: Libro_Auxiliar_Empresa + Cartola_Bancaria_Externa, valores absolutos y polaridad.
3. Algoritmo y tolerancias: cruce determinístico → tolerancia temporal (3 días) → redondeo → consolidación N:1 → tránsitos.
4. Validar `SCA == SBA`.
5. **Salida JSON estricta:** `reconciliation_status`, `matched_transactions`, `reconciling_items_in_transit`, `suggested_journal_entries`, `exceptions_for_review`.

**"IA revisa todo" (decisión F2):** se le pasa **TODA la cartola + el libro auxiliar de banco** (más las pre-coincidencias de la capa determinística como pistas) en **UNA sola llamada**, y Gemini devuelve el informe completo. La capa determinística NO descarta líneas antes de la IA — corre como pre-proceso/red de seguridad y para validar el resultado. Modelo: Gemini OpenAI-compat (mismo patrón que `ocr/gemini.js` / `pedidos/suggest.js`). Las glosas se **sanean** (§6.1) antes de entrar al prompt (anti prompt-injection). Costo: 1 llamada por conciliación.

**Asientos sugeridos = propone y confirma:** los `suggested_journal_entries` se muestran como borrador; se contabilizan (vía `aplicarContabilidad`) **solo tras confirmación del dueño**. Nada se asienta automático.

### 6.6 Eje 2 — SII (Fase 3)

Mismo pipeline (capas 1→2→3) pero compara *contabilidad ↔ DTE del libro de compras/ventas SII*. El OCR ya detecta `libro_compra_venta` y lo enruta a Match (sub-pestaña Conciliación). Decisiones F3 (2026-06-16):
- **Parseo del libro SII** (`ocr/libro-sii.js`): lista de DTE con `tipo_doc`, `rut`, `folio`, `fecha`, `neto`, `iva`, `total`, y `clase` (compra|venta). Compras → eje IVA crédito; ventas → eje IVA débito.
- **Cruce documento a documento:** match por `rut+folio` (y tipo) contra los `expenses` registrados. Resultado:
  - **En SII, no en contabilidad** → "falta capturar" → **VARAS propone crear el movimiento** (gasto si compra / ingreso si venta) con los datos del DTE; el dueño confirma (un toque) → `intake`/`createExpense` + contabiliza. (Paralelo a F2 propone-y-confirma.)
  - **En contabilidad, no en SII** → lo lista para revisión (puede ser boleta sin DTE, o error).
- **Cuadre de IVA (resumen F29):** por período, VARAS calcula IVA crédito (compras) e IVA débito (ventas) **según contabilidad** vs **según SII**, y el **IVA a pagar/favor** (débito − crédito). Muestra las diferencias.
- **IA "revisa todo"** igual que F2 (1 llamada con el libro SII + el registro contable). Persistir en `conciliaciones` con `tipo='sii'`.
- **UI:** la sub-pestaña Conciliación de la app maneja AMBOS (cartola → bancaria; libro SII → tributaria) según lo que se sube; el panel muestra el resumen de IVA + faltantes.

## 7. UI

### 7.1 App — Match como hub "VARAS · Contabilidad"

- La pestaña Match se presenta bajo la identidad **VARAS** (encabezado "VARAS · Contabilidad", branding/color propio, distinto del dorado de KALY).
- Sub-menú horizontal con scroll (segmented control, estética actual) con las 5 vistas.
- **Conciliación:** captura (cartola o libro SII; el OCR los distingue) → tarjeta superior con **SCA vs SBA** y ✅/⚠️ de convergencia → partidas agrupadas por tipología (en tránsito; notas débito/crédito con botón **"Crear asiento sugerido"**; excepciones). Mantiene lo actual (conciliadas/sugeridas/pagos masivos).
- **Diario / Mayor / Balance / Flujo:** versión **resumida mobile-friendly** (tarjetas/listas con saldos y totales, filtro período mes/año).
- La barra inferior de 6 botones **no cambia**; todo lo contable vive dentro de Match.

### 7.2 Panel web (`/panel`)

- Sección **"Contabilidad"** con **tablas completas** de Diario/Mayor/Balance/Flujo + filtro período.
- **Descarga Excel** de cada libro (reusa `exceljs` de `panel/excel.js`).
- Conciliación con el workpaper completo (SCA/SBA + partidas + excepciones).

## 8. Faseo

| Fase | Entrega | Razón |
|---|---|---|
| **F1 — Contabilidad base (VARAS trabaja solo)** | tablas `cuentas`+`asientos`+`asiento_lineas`, plan SII sembrado, motor `asientos.js` + `contabilizar.js`, reportes Diario/Mayor/Balance/Flujo en panel y app bajo la marca "VARAS · Contabilidad" | Cimiento; sin asientos no hay "banco contable" que conciliar. **Se construye primero.** |
| **F2 — Conciliación bancaria (VARAS Controlador Financiero)** | `canonical.js`, extensión de `engine.js` (redondeo, similitud), `conciliacion.js` (6 partidas, SCA/SBA, convergencia), `componer.js` (IA solo-anomalías con el system prompt de 5 bloques), saldo en `ocr/cartola.js`, UI informe | El corazón del pedido; se apoya en F1 |
| **F3 — Conciliación SII** | mismo motor sobre Libro Compras/Ventas SII + cuadratura de IVA | Reusa F2 |
| **F4 — VARAS conversacional (chat de texto **y** voz)** | endpoint de sesión/chat de VARAS + tools read-only (saldos, Balance, Flujo, deudas, estado de conciliación) + UI; reusa la infra de agente de KALY (`kaly/live.js`, orb, tools) con personalidad, voz y esfera propias | La cara conversacional de VARAS; se apoya en F1-F3 (necesita los datos contables para responder) |
| **F5 — Asientos manuales** | crear/editar asientos manuales (ajustes, sueldos, depreciación) en app y panel | Va al final porque F1-F4 ya entregan valor |

Cada fase tendrá su propio plan de implementación (spec→plan→TDD).

## 9. Testing (estilo actual del proyecto)

- **Motores puros** (`asientos.js`, `engine.js` extendido, `canonical.js`, `conciliacion.js`, ecuaciones SCA/SBA): tests unitarios sin DB, con un caso por cada una de las 6 partidas y por convergencia/no-convergencia.
- **Contabilizador idempotente:** registrar→editar→anular no duplica ni descuadra.
- **Invariante `Σdebe==Σhaber`:** test en cada tipo de asiento.
- **Reportes:** con `pg-mem` (como el resto del proyecto).
- **Saneo de glosa anti-inyección:** test con glosa maliciosa.

## 10. Integración con lo existente

- **No rompe** la captura/registro actual: el contabilizador se engancha en el alta/edición/anulación de `expenses` que ya existen (`expenses/intake.js`, `app/router.js`).
- **Match actual** (conciliadas/sugeridas/pagos masivos) se conserva y se enriquece con el informe SCA/SBA y la confirmación de pago genera el asiento de pago.
- Multi-tenant: todo scoped por `company_id` (igual que el resto).
- Deploy: backend con `deploy-gastos-wt.js` (worktree), migración `scripts/migrate.js` en el VPS, APK rebuild para los cambios de app.
