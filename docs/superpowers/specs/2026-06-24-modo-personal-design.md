# Hash IA — Modo Personal: Design Spec

**Fecha:** 2026-06-24  
**Autor:** José Antonio Olguín + Claude

---

## Objetivo

Agregar un modo "persona natural" a Hash IA. La misma app, mismo backend, misma UI — con tres diferencias clave: tarjeta de balance mensual en el espacio vacío del tab Captura, prompt de KALY ajustado para finanzas personales, y auto-registro sin intermediario de Atiko.

---

## Arquitectura general

- **Un solo APK / un solo backend** — no hay app separada.
- `companies.tipo_cuenta` distingue empresa (`'empresa'`) de persona natural (`'personal'`).
- La tabla `expenses` se reutiliza sin cambios — los gastos personales son del mismo tipo.
- MATCH y cartola se mantienen igual (la persona importa su cartola para ver su saldo real).
- Tabs existentes no cambian: Captura / Movimientos / Transaccional / Match.

---

## Sección 1 — Datos y backend

### 1.1 Migración `companies`

```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS tipo_cuenta TEXT DEFAULT 'empresa',
  ADD COLUMN IF NOT EXISTS sueldo_mensual INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dia_pago INTEGER DEFAULT 1;
```

- `tipo_cuenta`: `'empresa'` | `'personal'`
- `sueldo_mensual`: monto bruto mensual en CLP (entero)
- `dia_pago`: día del mes en que cae el depósito (1–31)

La migración es idempotente (`ADD COLUMN IF NOT EXISTS`). No afecta registros existentes — todos quedan con `tipo_cuenta = 'empresa'`.

### 1.2 Auto-registro personal

**Endpoint:** `POST /api/onboarding/register-personal`

Request:
```json
{
  "nombre": "José Antonio",
  "email": "jose@gmail.com",
  "password": "secreto123",
  "sueldo_mensual": 800000,
  "dia_pago": 5
}
```

Flujo:
1. Valida campos (nombre, email, password ≥ 6 chars, sueldo_mensual > 0)
2. Verifica que el email no exista ya en `employees`
3. Crea `company` con `tipo_cuenta='personal'`, `nombre`, `sueldo_mensual`, `dia_pago`
4. Crea suscripción free (`subscriptions`)
5. Crea `employee` vinculado con `usuario = email`, `rol = 'admin'`
6. Devuelve `{ token }` (mismo JWT que el login normal)

**Errores:** `400 email_en_uso`, `400 campos_requeridos`, `400 sueldo_invalido`

### 1.3 Resumen personal

**Endpoint:** `GET /api/app/personal/resumen`  
Auth: Bearer (empleado autenticado, `req.auth.companyId`)

Response:
```json
{
  "sueldo_mensual": 800000,
  "dia_pago": 5,
  "gastado_mes": 457500,
  "disponible": 342500,
  "dias_restantes_mes": 8,
  "porcentaje_gastado": 57,
  "categorias": [
    { "nombre": "Arriendo", "total": 280000 },
    { "nombre": "Comida", "total": 89000 },
    { "nombre": "Transporte", "total": 45000 }
  ]
}
```

Lógica:
- `gastado_mes` = `SUM(total)` de `expenses` donde `company_id`, `tipo='gasto'`, `estado != 'anulado'`, `fecha` en el mes/año actual (NOW())
- `disponible` = `sueldo_mensual - gastado_mes` (puede ser negativo)
- `dias_restantes_mes` = días hasta fin de mes calendario
- `categorias` = top 5 por monto desc, agrupando por `COALESCE(categoria, 'Otros')`

Solo disponible cuando `company.tipo_cuenta = 'personal'`. Si la company es empresa, devuelve `403 solo_para_modo_personal`.

### 1.4 KALY prompt — modo personal

En `gastos/src/agent/prompt.js`, cuando `tipo_cuenta === 'personal'`, se inyecta este bloque de contexto en lugar del contexto contable:

```
Eres KALY, compañera de finanzas personales de {nombre}.
Su sueldo mensual es ${sueldo_mensual}.
Este mes lleva ${gastado_mes} gastado y le quedan ${disponible} disponibles para {dias_restantes_mes} días más.
Sus categorías de gasto más altas son: {top_categorias}.

Reglas:
- Habla siempre en términos simples y cercanos.
- Nunca menciones IVA, folios, libros contables, VARAS ni terminología de empresa.
- Cuando registren un gasto, confirma cuánto queda del presupuesto.
- Si el disponible es bajo o negativo, avisa con tacto.
- Responde preguntas como "¿me alcanza este mes?" con honestidad y contexto.
```

El contexto personal se pasa como parte de `buildPrompt(company, employee)` — la función detecta `company.tipo_cuenta === 'personal'` y usa este bloque en vez del contable.

---

## Sección 2 — App (React / Capacitor)

### 2.1 `RegisterPersonalScreen.jsx`

Pantalla nueva en `gastos-app/src/gastos/RegisterPersonalScreen.jsx`:
- Campo: Nombre completo
- Campo: Email
- Campo: Contraseña
- Campo: Sueldo mensual (`$CLP`, input numérico)
- Botón "Crear mi cuenta" → llama `api.registerPersonal(...)` → guarda token → `setAuthed(true)`

En `LoginScreen.jsx`, agregar debajo del botón de login:
```jsx
<button onClick={() => setModoRegistro('personal')}>
  ¿Persona natural? Crea tu cuenta gratis
</button>
```
Si `modoRegistro === 'personal'`, renderiza `<RegisterPersonalScreen>` en vez del login.

### 2.2 Onboarding personal

`OnboardingPersonal.jsx` — 3 pasos, se muestra cuando `company.tipo_cuenta === 'personal'` y `!company.onboarded_at`:

1. **Paso 1 — Sueldo:** "¿Cuánto es tu sueldo mensual?" → input monto → `PATCH /company { sueldo_mensual }`
2. **Paso 2 — Día de pago:** "¿Qué día te depositan?" → selector 1–31 → `PATCH /company { dia_pago }`  
3. **Paso 3 — Listo:** "¡KALY ya sabe tu presupuesto! Registra tu primer gasto."  
   → `PATCH /company { onboarded_at: new Date() }` → cierra onboarding

El `OnboardingWizard` existente (6 pasos de empresa) no se toca.

### 2.3 `BalanceCard.jsx`

Componente nuevo en `gastos-app/src/gastos/BalanceCard.jsx`:

```jsx
function BalanceCard() {
  const [resumen, setResumen] = useState(null);
  useEffect(() => { api.personalResumen().then(setResumen).catch(() => {}); }, []);
  if (!resumen) return null;
  // Renderiza: disponible (verde grande), barra progreso, top 3 categorías
}
```

Estilos: idéntico al mockup — fondo `linear-gradient(135deg,#0b2a18,#0f3a20)`, borde `#1a4a28`, monto en `#7CFC9B`, categorías en `#E7C46B`.

### 2.4 `GastosApp.jsx`

Único cambio: en el bloque `tab === 'capturar'`:

```jsx
: tab === 'capturar' ? (
  busy ? <div className="p-6">Procesando…</div>
       : <div className="h-full overflow-y-auto p-4">
           <p className="px-2 mb-2 opacity-70 text-xs font-bold">
             {esPersonal ? 'Registra tu gasto:' : 'Captura la boleta, factura o comprobante:'}
           </p>
           <EvidenceIntake maxEvidence={1} value={[]} onChange={onChange} showNativeCapture />
           {esPersonal && <BalanceCard key={refreshKey} />}
         </div>
```

Donde `esPersonal = company?.tipo_cuenta === 'personal'` (ya se carga en el `useEffect` de `getCompany`). `refreshKey` se incrementa cada vez que un gasto se registra exitosamente (en `setPending` tras submit OK).

### 2.5 `api.js` — nuevos métodos

```js
registerPersonal({ nombre, email, password, sueldo_mensual, dia_pago }) {
  return req('/api/onboarding/register-personal', { method: 'POST', auth: false, body: {...} });
},
personalResumen() { return req('/api/app/personal/resumen'); },
```

---

## Flujo completo — persona nueva

1. Abre la app → pantalla Login
2. Toca "¿Persona natural? Crea tu cuenta"
3. Rellena nombre, email, contraseña, sueldo → "Crear mi cuenta"
4. Backend crea company + employee + suscripción free → devuelve JWT
5. App entra autenticada → `getCompany()` → `tipo_cuenta: 'personal'`  
6. Aparece `OnboardingPersonal`: confirma sueldo + día de pago → listo
7. Tab Captura: orbe KALY (con prompt personal) + botones captura + `BalanceCard` abajo
8. Registra un gasto (foto/archivo/voz) → `BalanceCard` se refresca → muestra nuevo saldo

---

## Scope fuera de v1

- Ingresos extra ocasionales (se registran como `tipo='ingreso'` en `expenses` pero no aparecen en `BalanceCard` v1 — se suman en v2)
- Metas de ahorro
- Notificaciones push cuando el disponible baja de umbral
- Ocultar tabs Transaccional/VARAS para cuentas personales

---

## Tests

- `tests/personal/register.test.js` — registro personal: OK, email duplicado, sueldo inválido
- `tests/personal/resumen.test.js` — resumen: cálculo correcto, empresa devuelve 403
- `tests/personal/prompt.test.js` — `buildPrompt` con `tipo_cuenta='personal'` incluye sueldo/disponible, no incluye IVA/VARAS

---

## Deploy

1. Migración SQL (idempotente, sin downtime)
2. Deploy backend (`deploy-gastos-wt.js`)
3. Build + sync APK (`vite build && cap sync && gradlew assembleRelease`)
4. Upload APK (`upload-apk.js`)
