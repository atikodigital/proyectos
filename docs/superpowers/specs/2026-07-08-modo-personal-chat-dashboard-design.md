# Hash IA — Modo Personal: Chat KALY + Panel de Control (Dashboard)

**Fecha:** 2026-07-08
**Autor:** José Antonio Olguín + Claude
**Rama de trabajo:** `claude/modo-personal-chat-dashboard` (base: `master`, APK v3.81)

---

## Objetivo

Mejorar el modo persona natural (`companies.tipo_cuenta = 'personal'`) del APK Hash IA con dos cambios de UX, **sin tocar el modo empresa**:

1. **Captura → chat con KALY estilo WhatsApp.** Quitar la tarjeta de saldo y convertir la pestaña en una conversación con burbujas (KALY izquierda, usuario derecha), dándole el protagonismo al chat.
2. **Tercer tab → "Panel de Control" (Dashboard).** En modo personal, reemplazar la pestaña "Transaccional" (hoy `VarasChat`, que no aporta a una persona natural) por un panel mensual de ingresos/gastos con un filtro igual al de Movimientos.

El modo empresa conserva todo: Captura con tarjeta + `EvidenceIntake`, pestaña Transaccional con VARAS, etc.

---

## Alcance / no-alcance

- **Solo aplica cuando** `esPersonal = company?.tipo_cuenta === 'personal'`.
- **No se toca** el modo empresa ni el backend (los datos ya existen: `api.listExpenses()`, `api.personalResumen()`).
- **No** se agregan metas de ahorro, notificaciones ni edición de movimientos en el dashboard (fuera de v1).

---

## Cambio 1 — Captura como chat de KALY (solo personal)

### Estado actual (`gastos-app/src/gastos/GastosApp.jsx`)
- `main` monta la franja `<KalyAgent />` arriba (fija, `shrink-0`) cuando `tab==='capturar' || tab==='chat'` (líneas 183-187).
- El contenido de `tab==='capturar'` es texto + `<EvidenceIntake/>` + `{esPersonal && <BalanceCard/>}` (líneas 242-250).
- `KalyAgent` ya mantiene TODO el historial en `messages` (`{ sender:'user'|'kaly', text, isSystem? }`), pero la UI solo pinta la **última** frase de KALY (`ultimaKaly`) en una línea.

### Diseño (personal, tab Captura), de arriba hacia abajo
1. **Orbe KALY** (chico) + botón silenciar — cabecera `shrink-0`.
2. **Burbujas del chat** — área `flex-1` scrollable, auto-scroll al último mensaje:
   - KALY: izquierda, fondo blanco + borde (`borderRadius: 16px 16px 16px 4px`).
   - Usuario: derecha, fondo dorado tenue (`borderRadius: 16px 16px 4px 16px`).
   - Mensajes `isSystem` → pill gris centrada (estilo aviso de WhatsApp).
   - Vacío → hint "Escríbele o háblale a KALY".
3. **Bloque de captura + texto abajo** (`shrink-0`): el campo de texto + enviar (chat de KALY) y los botones de captura (foto/archivo, `EvidenceIntake`).

### Implementación
- **`KalyAgent`** gana una prop `chat` (bool):
  - `chat=false` (default): comportamiento actual compacto (empresa Captura, Movimientos).
  - `chat=true`: contenedor `h-full flex flex-col`; cabecera orbe+mute; lista de burbujas (`flex-1 overflow-y-auto`, `ref` + `useEffect` para auto-scroll); barra de texto abajo. Reusa el `messages`, `handleSendText`, `handleTap`, `toggleMute` existentes.
- **`GastosApp.jsx`**:
  - La franja superior de KALY (líneas 183-187) deja de mostrarse para `esPersonal && tab==='capturar'` (personal maneja KALY en su propio branch).
  - El branch `tab==='capturar'`: si `esPersonal`, renderiza el layout chat:
    ```
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0"><KalyAgent chat /></div>
      <div className="shrink-0 border-t p-3"><EvidenceIntake .../></div>
    </div>
    ```
    y **sin** `BalanceCard`. Si es empresa, queda EXACTAMENTE como hoy (franja KALY arriba + EvidenceIntake).
  - `BalanceCard` deja de usarse en Captura personal → se elimina el import y el uso (queda disponible por si se reusa en el dashboard; ver Cambio 2).

---

## Cambio 2 — Pestaña "Panel de Control" (Dashboard) en personal

### Navegación (`GastosApp.jsx`, tercer botón del `nav`, líneas 275-277)
- El tercer botón pasa a ser condicional:
  - **personal**: label `t('app.tab_panel')` ("Panel de Control"), `onClick={() => setTab('dashboard')}`, activo cuando `tab==='dashboard'`.
  - **empresa**: sigue igual → `t('app.tab_transaccional')`, `setTab('transaccional')`.
- Contenido: se agrega `tab==='dashboard' ? <PersonalDashboard/> :` antes del branch `tab==='transaccional'`. Empresa no cambia.

### Componente nuevo `gastos-app/src/gastos/PersonalDashboard.jsx`
Datos: `api.listExpenses()` (movimientos con `tipo`, `total`, `fecha/created_at`, `categoria`, `estado`) + `api.personalResumen()` (sueldo/disponible). Escucha `hash:data-changed` para refrescar (mismo patrón que `MyExpenses`/`BalanceCard`).

Layout (arriba → abajo):
1. **Fila de tarjetas del mes**: **Ingresos** (verde `#7CFC9B`), **Gastos** (rojo/ámbar), **Balance** (= ingresos − gastos). Se calculan en el front con `enPeriodo(e,'mes')` + suma por `tipo` (excluyendo `estado==='anulado'`).
2. **Barra de presupuesto** (reusa el estilo de `BalanceCard`): Sueldo mensual, Disponible y barra `porcentaje_gastado` desde `personalResumen()`.
3. **Filtro tipo Movimientos** + lista: período (hoy/mes/año/rango/todos), tipo, categoría, búsqueda; totales del filtro. Reusa `MovimientosCards` para la lista.

### Reutilización del filtro (evitar duplicar lógica)
- Extraer las funciones puras de `MyExpenses.jsx` a un módulo nuevo **`gastos-app/src/gastos/movimientosFiltro.js`**: `FILTRO_INICIAL`, `fechaDe`, `enPeriodo`, `pasaFiltros`.
- `MyExpenses.jsx` se refactoriza para **importarlas** (borra sus copias locales; comportamiento idéntico, cubierto por `MyExpenses.test.jsx`).
- `PersonalDashboard.jsx` importa las mismas funciones y arma su panel de filtro (botones de período + panel expandible), con los mismos textos i18n `exp.filtro.*`.

---

## Cambio 3 — Modo empresa: intacto

- Captura empresa: franja KALY arriba + `EvidenceIntake` (sin cambios).
- Tercer tab empresa: "Transaccional" → `VarasChat` (sin cambios).
- `BalanceCard` solo se mostraba en personal, así que quitarla de Captura no afecta empresa.

---

## i18n (`gastos-app/src/gastos/i18n-extra.js`)

Agregar en los 3 idiomas (es/en/pt), junto a `app.tab_transaccional`:
- `app.tab_panel`: "Panel de Control" / "Dashboard" / "Painel".
- Claves del dashboard: `app.panel.ingresos`, `app.panel.gastos`, `app.panel.balance`, `app.panel.titulo_mes`, etc.
- Hint del chat vacío: `app.chat_vacio_hint`.
Se reutilizan las claves existentes `exp.filtro.*`, `exp.balance.*`, `exp.tipo.*`.

---

## Tests (Jest + @testing-library/react)

- **Baseline primero:** correr `jest tests/gastos/{GastosApp,MyExpenses,KalyAgent}.test.jsx` y registrar qué pasa/falla ANTES de cambiar (hay tests desactualizados, p.ej. GastosApp espera "Próximamente" en Transaccional).
- `movimientosFiltro.test.js` (nuevo): `enPeriodo`/`pasaFiltros` con casos mes/tipo/categoría/búsqueda.
- `PersonalDashboard.test.jsx` (nuevo): con `listExpenses` mockeado, muestra Ingresos/Gastos/Balance del mes correctos; el filtro por tipo cambia la lista.
- `KalyAgent.test.jsx`: `chat` prop pinta burbujas de `messages` (user derecha / kaly izquierda).
- `GastosApp.test.jsx`: con `getCompany → tipo_cuenta:'personal'`, el tercer tab dice "Panel de Control" y NO "Transaccional"; con empresa sigue "Transaccional". Actualizar el test stale de "Próximamente".
- `MyExpenses.test.jsx` debe seguir verde tras el refactor de helpers.

---

## Deploy (igual que siempre, solo APK)

1. `npm test` verde en `gastos-app`.
2. `vite build && npx cap sync android`.
3. `cd android && gradlew assembleRelease` → subir APK.
4. No requiere deploy de backend (sin cambios de API/SQL).
