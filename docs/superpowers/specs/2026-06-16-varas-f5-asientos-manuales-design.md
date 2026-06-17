# VARAS — F5: Asientos manuales — Diseño

**Fecha:** 2026-06-16
**Producto:** Hash IA Finanzas / VARAS (módulo Contabilidad)
**Repo:** `HASH IA\` (canónico, rama master)
**Estado:** diseño aprobado, pendiente plan (writing-plans)

## 1. Objetivo

Cerrar el roadmap contable (F1→F5): permitir al dueño/contador **crear asientos
manuales** (ajustes, sueldos, depreciación, provisiones) — partida doble libre que
debe **cuadrar** (Σdebe = Σhaber) — y **anularlos**. Aparecen automáticamente en
Libro Diario / Mayor / Balance.

## 2. Decisiones (aprobadas vía AskUserQuestion, 2026-06-16)

1. **Dónde: app + panel** (formulario en ambos; el panel es el principal por ser más cómodo para varias líneas).
2. **Asiento manual genérico primero** (sin plantillas pre-armadas; las plantillas de sueldos/depreciación quedan como mejora posterior).
3. **Anular, no editar** (un asiento contable no muta: se anula —queda registro— y se rehace). Reusa la anulación de asientos de F1.

## 3. Motor / backend

`gastos/src/contabilidad/manual.js`:
- `validarAsientoManual({ lineas })` (PURO): exige ≥2 líneas con `cuenta_id`, montos enteros ≥0, y **Σdebe == Σhaber > 0**. Devuelve `{ ok, error }` (error legible: `descuadrado` / `min_lineas` / `sin_cuenta`).
- `crearAsientoManual(db, companyId, { fecha, glosa, lineas })`: valida (lanza si no cuadra), verifica que **cada `cuenta_id` pertenezca a la empresa** (vía `cuentas`), y persiste con `repo.guardarAsiento` con `origen='manual'`, `tipo_asiento='ajuste'`, `estado='confirmado'`, `fecha`, `glosa`. Devuelve el asiento.
- `anularAsientoManual(db, companyId, asientoId)`: scoped por empresa (verifica que el asiento sea de la empresa) → `repo.anularAsiento`. (Funciona para cualquier asiento, pero el botón Anular se ofrece en el Libro Diario.)

Reusa F1: `contabilidad/repo.js` (`guardarAsiento`, `anularAsiento`, `buscarAsientoVivo`), `contabilidad/asientos.js` (`asientoBalanceado`), `contabilidad/cuentas.js` (`listCuentas`, `getCuentaId`). No cambia el contabilizador automático ni los reportes.

## 4. API (app y panel, multi-tenant por company_id)

- `GET /cuentas` → lista de cuentas imputables (para el selector). App: `/api/app/cuentas`; panel: `/api/panel/cuentas`.
- `POST /asientos/manual` `{ fecha, glosa, lineas:[{cuenta_id, debe, haber, glosa}] }` → 201 con el asiento, o 400 `{error}` si no cuadra / faltan líneas / cuenta ajena.
- `POST /asientos/:id/anular` → marca el asiento `anulado` (scoped). 404 si no es de la empresa.

(El Libro Diario, `GET /contabilidad/diario`, ya devuelve los asientos con su `id` para el botón Anular.)

## 5. UI

### 5.1 Panel (principal)
En la sección Contabilidad: formulario **"Nuevo asiento manual"** — fecha, glosa, y filas `cuenta (select) · debe · haber` con botón **"+ línea"**; un **indicador de cuadre en vivo** (Σdebe vs Σhaber, ✓/⚠) que habilita "Guardar" solo si cuadra. Tras guardar, recarga el Libro Diario. En el Libro Diario, **botón "Anular"** por asiento.

### 5.2 App
El mismo formulario, más compacto, dentro del hub **VARAS · Contabilidad** (una sub-vista "Asiento manual" o un botón en la vista Diario): fecha, glosa, filas cuenta·debe·haber, indicador de cuadre, guardar. Anular desde la vista Diario.

## 6. Reportes / integración

- El asiento manual (estado `confirmado`, no `anulado`) aparece automáticamente en **Libro Diario, Mayor y Balance** (ya consultan todos los asientos vivos). En **Flujo de Caja** solo si alguna línea toca Caja/Banco (los reportes ya filtran por `tipo_asiento='pago'`, así que un `ajuste` manual NO entra al Flujo salvo que se decida lo contrario — correcto: los ajustes no son movimientos de caja).
- **Balance de Comprobación** sigue cuadrando porque cada asiento manual está balanceado (validación en el alta).

## 7. Faseo

| Fase | Entrega |
|---|---|
| **F5a — Backend** | `manual.js` (validar + crear + anular scoped), endpoints `GET /cuentas`, `POST /asientos/manual`, `POST /asientos/:id/anular` en app y panel. |
| **F5b — UI** | Panel: formulario asiento manual (cuadre en vivo) + botón Anular en Diario. App: mismo formulario en el hub VARAS. |

Cada fase: spec→plan→TDD. F5a primero (sin backend no hay nada que cablear).

## 8. Testing

- **Puro:** `validarAsientoManual` (cuadra / descuadrado / <2 líneas / sin cuenta).
- **Repo/creación:** `crearAsientoManual` con pg-mem (persiste balanceado; rechaza cuenta ajena; rechaza descuadre).
- **Anular:** scoped por empresa (404 cross-tenant); el asiento anulado desaparece de Diario/Balance.
- **API:** endpoints app+panel (auth, tenant, 400 en descuadre).
- **UI:** panel lib (cuadre en vivo / habilitar guardar); app RTL (form + cuadre).
- Multi-tenant en todo.

## 9. No rompe lo existente

- El contabilizador automático (F1) y la conciliación (F2/F3) no cambian.
- Los asientos manuales conviven con los `origen='expense'|'pago'|'conciliacion'` en la misma tabla; los reportes ya los incluyen.
