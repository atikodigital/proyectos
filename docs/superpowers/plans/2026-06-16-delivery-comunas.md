# Delivery por zonas de comunas (Hash IA · Chat #3) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **WORKTREE GUARD (cada subagente):** trabaja SOLO en `C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112`. Toda ruta debe contener `.claude\worktrees\dazzling-driscoll-78a112`. Antes de commitear: `git rev-parse --show-toplevel && git branch --show-current` → toplevel termina en `dazzling-driscoll-78a112`, branch `claude/dazzling-driscoll-78a112`. `gastos/` y `gastos-app/` también existen en `main` — NO tocar eso. Nunca `git add -A`.

**Goal:** Cobrar el despacho en el pedido según zonas de comunas (oficiales de Chile) que el negocio configura, con envío gratis sobre un monto.

**Architecture:** Dataset estático de comunas servido por endpoint. Config `delivery` (zonas + gratis_desde) en `companies`, reusando el patrón `pedido-config`. Una función pura `costoEnvio(delivery, comuna, subtotal)` resuelve el costo. El endpoint `from-catalog` lo suma al total y `pedidoToText` lo muestra. La app elige comuna (selector) y la suma en vivo; el panel arma las zonas.

**Tech Stack:** Node/Express, jest + pg-mem; Capacitor/React/Vite, jest + RTL; panel estático. TDD. Spec: `docs/superpowers/specs/2026-06-16-delivery-comunas-design.md`.

---

## Task 1: Dataset comunas-chile.js + endpoints GET /comunas

**Files:**
- Create: `gastos/src/pedidos/comunas-chile.js`
- Modify: `gastos/src/app/router.js`, `gastos/src/panel/router.js`
- Test: `gastos/tests/pedidos/comunas.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/pedidos/comunas.test.js`:

```js
process.env.JWT_SECRET = 'test-secret';
const express = require('express');
const request = require('supertest');
const { newDb } = require('pg-mem');
const { migrate } = require('../../src/db/migrate');
const { hashPassword } = require('../../src/auth/password');
const { createAppRouter } = require('../../src/app/router');
const { REGIONES_COMUNAS, comunaExiste, TODAS_LAS_COMUNAS } = require('../../src/pedidos/comunas-chile');

test('dataset: 16 regiones, >300 comunas, comunaExiste insensible a acento/mayúsculas', () => {
  expect(REGIONES_COMUNAS).toHaveLength(16);
  expect(TODAS_LAS_COMUNAS.length).toBeGreaterThan(300);
  expect(comunaExiste('Providencia')).toBe(true);
  expect(comunaExiste('providencia')).toBe(true);
  expect(comunaExiste('ÑUÑOA')).toBe(true);
  expect(comunaExiste('nunoa')).toBe(true);   // sin acento/ñ
  expect(comunaExiste('Comuna Inventada')).toBe(false);
});

async function freshDb() {
  const mem = newDb();
  let n = 0;
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}` });
  mem.public.registerFunction({ name: 'now', returns: 'timestamptz', impure: true, implementation: () => new Date() });
  const pg = mem.adapters.createPg();
  const db = new pg.Pool();
  await migrate(db).catch(() => {});
  return db;
}

test('GET /api/app/comunas devuelve el dataset (con token)', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const hash = await hashPassword('clave');
  await db.query("INSERT INTO employees(company_id, nombre, usuario, password_hash) VALUES($1,'J','juan',$2)", [c.rows[0].id, hash]);
  const app = express(); app.use(express.json()); app.use('/api/app', createAppRouter({ db }));
  const t = (await request(app).post('/api/app/login').send({ usuario: 'juan', password: 'clave' })).body.token;
  const r = await request(app).get('/api/app/comunas').set('Authorization', `Bearer ${t}`).expect(200);
  expect(Array.isArray(r.body)).toBe(true);
  expect(r.body).toHaveLength(16);
  expect(r.body[0]).toHaveProperty('region');
  expect(Array.isArray(r.body[0].comunas)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/comunas.test.js`
Expected: FAIL — módulo no existe / endpoint 404.

- [ ] **Step 3: Write minimal implementation** — create `gastos/src/pedidos/comunas-chile.js` con el dataset COMPLETO (16 regiones, División Político-Administrativa de Chile). Usar EXACTAMENTE:

```js
// Regiones y comunas de Chile (DPA oficial). Para configurar zonas de despacho.
const REGIONES_COMUNAS = [
  { region: 'Arica y Parinacota', comunas: ['Arica', 'Camarones', 'Putre', 'General Lagos'] },
  { region: 'Tarapacá', comunas: ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'] },
  { region: 'Antofagasta', comunas: ['Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama', 'Ollagüe', 'San Pedro de Atacama', 'Tocopilla', 'María Elena'] },
  { region: 'Atacama', comunas: ['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen', 'Freirina', 'Huasco'] },
  { region: 'Coquimbo', comunas: ['La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paihuano', 'Vicuña', 'Illapel', 'Canela', 'Los Vilos', 'Salamanca', 'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado'] },
  { region: 'Valparaíso', comunas: ['Valparaíso', 'Casablanca', 'Concón', 'Juan Fernández', 'Puchuncaví', 'Quintero', 'Viña del Mar', 'Isla de Pascua', 'Los Andes', 'Calle Larga', 'Rinconada', 'San Esteban', 'La Ligua', 'Cabildo', 'Papudo', 'Petorca', 'Zapallar', 'Quillota', 'La Calera', 'Hijuelas', 'La Cruz', 'Nogales', 'San Antonio', 'Algarrobo', 'Cartagena', 'El Quisco', 'El Tabo', 'Santo Domingo', 'San Felipe', 'Catemu', 'Llaillay', 'Panquehue', 'Putaendo', 'Santa María', 'Quilpué', 'Limache', 'Olmué', 'Villa Alemana'] },
  { region: 'Metropolitana de Santiago', comunas: ['Santiago', 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central', 'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón', 'Vitacura', 'Puente Alto', 'Pirque', 'San José de Maipo', 'Colina', 'Lampa', 'Tiltil', 'San Bernardo', 'Buin', 'Calera de Tango', 'Paine', 'Melipilla', 'Alhué', 'Curacaví', 'María Pinto', 'San Pedro', 'Talagante', 'El Monte', 'Isla de Maipo', 'Padre Hurtado', 'Peñaflor'] },
  { region: "Libertador General Bernardo O'Higgins", comunas: ['Rancagua', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'Las Cabras', 'Machalí', 'Malloa', 'Mostazal', 'Olivar', 'Peumo', 'Pichidegua', 'Quinta de Tilcoco', 'Rengo', 'Requínoa', 'San Vicente', 'Pichilemu', 'La Estrella', 'Litueche', 'Marchihue', 'Navidad', 'Paredones', 'San Fernando', 'Chépica', 'Chimbarongo', 'Lolol', 'Nancagua', 'Palmilla', 'Peralillo', 'Placilla', 'Pumanque', 'Santa Cruz'] },
  { region: 'Maule', comunas: ['Talca', 'Constitución', 'Curepto', 'Empedrado', 'Maule', 'Pelarco', 'Pencahue', 'Río Claro', 'San Clemente', 'San Rafael', 'Cauquenes', 'Chanco', 'Pelluhue', 'Curicó', 'Hualañé', 'Licantén', 'Molina', 'Rauco', 'Romeral', 'Sagrada Familia', 'Teno', 'Vichuquén', 'Linares', 'Colbún', 'Longaví', 'Parral', 'Retiro', 'San Javier', 'Villa Alegre', 'Yerbas Buenas'] },
  { region: 'Ñuble', comunas: ['Chillán', 'Bulnes', 'Chillán Viejo', 'El Carmen', 'Pemuco', 'Pinto', 'Quillón', 'San Ignacio', 'Yungay', 'Quirihue', 'Cobquecura', 'Coelemu', 'Ninhue', 'Portezuelo', 'Ránquil', 'Treguaco', 'San Carlos', 'Coihueco', 'Ñiquén', 'San Fabián', 'San Nicolás'] },
  { region: 'Biobío', comunas: ['Concepción', 'Coronel', 'Chiguayante', 'Florida', 'Hualqui', 'Lota', 'Penco', 'San Pedro de la Paz', 'Santa Juana', 'Talcahuano', 'Tomé', 'Hualpén', 'Lebu', 'Arauco', 'Cañete', 'Contulmo', 'Curanilahue', 'Los Álamos', 'Tirúa', 'Los Ángeles', 'Antuco', 'Cabrero', 'Laja', 'Mulchén', 'Nacimiento', 'Negrete', 'Quilaco', 'Quilleco', 'San Rosendo', 'Santa Bárbara', 'Tucapel', 'Yumbel', 'Alto Biobío'] },
  { region: 'La Araucanía', comunas: ['Temuco', 'Carahue', 'Cholchol', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche', 'Melipeuco', 'Nueva Imperial', 'Padre Las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Saavedra', 'Teodoro Schmidt', 'Toltén', 'Vilcún', 'Villarrica', 'Angol', 'Collipulli', 'Curacautín', 'Ercilla', 'Lonquimay', 'Los Sauces', 'Lumaco', 'Purén', 'Renaico', 'Traiguén', 'Victoria'] },
  { region: 'Los Ríos', comunas: ['Valdivia', 'Corral', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli', 'La Unión', 'Futrono', 'Lago Ranco', 'Río Bueno'] },
  { region: 'Los Lagos', comunas: ['Puerto Montt', 'Calbuco', 'Cochamó', 'Fresia', 'Frutillar', 'Los Muermos', 'Llanquihue', 'Maullín', 'Puerto Varas', 'Castro', 'Ancud', 'Chonchi', 'Curaco de Vélez', 'Dalcahue', 'Puqueldón', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao', 'Osorno', 'Puerto Octay', 'Purranque', 'Puyehue', 'Río Negro', 'San Juan de la Costa', 'San Pablo', 'Chaitén', 'Futaleufú', 'Hualaihué', 'Palena'] },
  { region: 'Aysén del General Carlos Ibáñez del Campo', comunas: ['Coyhaique', 'Lago Verde', 'Aysén', 'Cisnes', 'Guaitecas', 'Cochrane', "O'Higgins", 'Tortel', 'Chile Chico', 'Río Ibáñez'] },
  { region: 'Magallanes y de la Antártica Chilena', comunas: ['Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio', 'Cabo de Hornos', 'Antártica', 'Porvenir', 'Primavera', 'Timaukel', 'Natales', 'Torres del Paine'] },
];

function _norm(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');
}
const TODAS_LAS_COMUNAS = REGIONES_COMUNAS.flatMap((r) => r.comunas);
const _SET = new Set(TODAS_LAS_COMUNAS.map(_norm));
function comunaExiste(nombre) { return _SET.has(_norm(nombre)); }

module.exports = { REGIONES_COMUNAS, TODAS_LAS_COMUNAS, comunaExiste, _norm };
```

Luego, en `gastos/src/app/router.js`, agregar el require junto a los otros (cerca de `const pedidosRepo = require('../pedidos/repo');`):
```js
const { REGIONES_COMUNAS } = require('../pedidos/comunas-chile');
```
y una ruta DESPUÉS del middleware de auth (p. ej. junto a `/pedido-config`):
```js
  router.get('/comunas', (req, res) => res.json(REGIONES_COMUNAS));
```
Igual en `gastos/src/panel/router.js`: agregar el require `const { REGIONES_COMUNAS } = require('../pedidos/comunas-chile');` y `router.get('/comunas', (req, res) => res.json(REGIONES_COMUNAS));` después de su auth.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/comunas.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/pedidos/comunas-chile.js gastos/src/app/router.js gastos/src/panel/router.js gastos/tests/pedidos/comunas.test.js && git commit -m "feat(delivery): dataset comunas-chile + endpoints GET /comunas"
```

---

## Task 2: Config delivery en pedido-config

**Files:**
- Modify: `gastos/src/pedidos/repo.js`
- Test: `gastos/tests/pedidos/pedido-config.test.js` (añadir)

- [ ] **Step 1: Write the failing test** — APPEND a `gastos/tests/pedidos/pedido-config.test.js`:

```js
test('getPedidoConfig incluye delivery (default vacío); setPedidoConfig guarda zonas + gratis_desde', async () => {
  const db = await freshDb();
  const c = await db.query("INSERT INTO companies(nombre) VALUES('X') RETURNING id");
  const id = c.rows[0].id;

  const def = await repo.getPedidoConfig(db, id);
  expect(def.delivery).toEqual({ zonas: [], gratis_desde: null });

  await repo.setPedidoConfig(db, id, { delivery: {
    zonas: [{ nombre: 'RM cercana', costo: 2500, comunas: ['Providencia', 'Ñuñoa'] }],
    gratis_desde: 30000,
  } });
  const upd = await repo.getPedidoConfig(db, id);
  expect(upd.delivery.gratis_desde).toBe(30000);
  expect(upd.delivery.zonas).toHaveLength(1);
  expect(upd.delivery.zonas[0]).toMatchObject({ nombre: 'RM cercana', costo: 2500 });
  expect(upd.delivery.zonas[0].comunas).toEqual(['Providencia', 'Ñuñoa']);
  expect(upd.delivery.zonas[0].id).toBeTruthy();
});
```
(El archivo ya tiene `freshDb`/`repo` del test existente de pedido-config.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/pedido-config.test.js -t delivery`
Expected: FAIL — `def.delivery` undefined.

- [ ] **Step 3: Write minimal implementation** en `gastos/src/pedidos/repo.js`:

(a) En `ensurePedidosTable`, junto a los otros ALTER de `companies`, agregar:
```js
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS delivery_zonas jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS delivery_gratis_desde integer;
```

(b) Helper de normalización de zonas (antes de `getPedidoConfig`), reusando `crypto`:
```js
const crypto = require('crypto');
function _intDelivery(v) { const n = Math.round(Number(v) || 0); return Number.isFinite(n) ? n : 0; }
function normalizeZonas(zonas) {
  return (Array.isArray(zonas) ? zonas : []).slice(0, 40).map((z) => ({
    id: (z && z.id) ? String(z.id) : crypto.randomUUID().slice(0, 8),
    nombre: String((z && z.nombre) || '').trim().slice(0, 60) || 'Zona',
    costo: Math.max(0, _intDelivery(z && z.costo)),
    comunas: Array.isArray(z && z.comunas) ? z.comunas.slice(0, 400).map((x) => String(x).trim()).filter(Boolean) : [],
  }));
}
```
(Si `crypto` ya está requerido arriba en el archivo, no lo dupliques.)

(c) En `getPedidoConfig`, leer las columnas nuevas y devolver `delivery`:
```js
async function getPedidoConfig(db, companyId) {
  await ensurePedidosTable(db);
  const r = await db.query('SELECT pedido_pie, pedido_iva_incluido, delivery_zonas, delivery_gratis_desde FROM companies WHERE id = $1', [companyId]);
  const row = r.rows[0] || {};
  return {
    pie: row.pedido_pie || null,
    iva_incluido: row.pedido_iva_incluido === undefined || row.pedido_iva_incluido === null ? true : !!row.pedido_iva_incluido,
    delivery: {
      zonas: Array.isArray(row.delivery_zonas) ? row.delivery_zonas : [],
      gratis_desde: (row.delivery_gratis_desde === undefined || row.delivery_gratis_desde === null) ? null : Number(row.delivery_gratis_desde),
    },
  };
}
```

(d) En `setPedidoConfig`, aceptar `delivery`:
```js
async function setPedidoConfig(db, companyId, cfg = {}) {
  await ensurePedidosTable(db);
  if (cfg.pie !== undefined) {
    await db.query('UPDATE companies SET pedido_pie = $2 WHERE id = $1', [companyId, cfg.pie ? String(cfg.pie).slice(0, 1000) : null]);
  }
  if (cfg.iva_incluido !== undefined) {
    await db.query('UPDATE companies SET pedido_iva_incluido = $2 WHERE id = $1', [companyId, !!cfg.iva_incluido]);
  }
  if (cfg.delivery !== undefined) {
    const zonas = normalizeZonas(cfg.delivery && cfg.delivery.zonas);
    const gratis = (cfg.delivery && cfg.delivery.gratis_desde != null && cfg.delivery.gratis_desde !== '') ? Math.max(0, _intDelivery(cfg.delivery.gratis_desde)) : null;
    await db.query('UPDATE companies SET delivery_zonas = $2::jsonb, delivery_gratis_desde = $3 WHERE id = $1', [companyId, JSON.stringify(zonas), gratis]);
  }
  return getPedidoConfig(db, companyId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/pedido-config.test.js` then `npx jest tests/pedidos/`
Expected: PASS.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/pedidos/repo.js gastos/tests/pedidos/pedido-config.test.js && git commit -m "feat(delivery): config delivery (zonas + gratis_desde) en pedido-config"
```

---

## Task 3: costoEnvio (puro)

**Files:**
- Modify: `gastos/src/pedidos/repo.js`
- Test: `gastos/tests/pedidos/delivery-costo.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/pedidos/delivery-costo.test.js`:

```js
const repo = require('../../src/pedidos/repo');

const delivery = {
  zonas: [
    { id: 'z1', nombre: 'RM cercana', costo: 2500, comunas: ['Providencia', 'Ñuñoa'] },
    { id: 'z2', nombre: 'RM lejana', costo: 4500, comunas: ['Maipú', 'Puente Alto'] },
  ],
  gratis_desde: 30000,
};

test('costoEnvio: comuna en zona → costo de la zona', () => {
  expect(repo.costoEnvio(delivery, 'Providencia', 10000)).toMatchObject({ ok: true, costo: 2500, gratis: false });
  expect(repo.costoEnvio(delivery, 'Maipú', 10000)).toMatchObject({ ok: true, costo: 4500 });
});

test('costoEnvio: comuna insensible a acento', () => {
  expect(repo.costoEnvio(delivery, 'nunoa', 10000)).toMatchObject({ ok: true, costo: 2500 });
});

test('costoEnvio: subtotal >= gratis_desde → 0 / gratis', () => {
  expect(repo.costoEnvio(delivery, 'Providencia', 30000)).toMatchObject({ ok: true, costo: 0, gratis: true });
});

test('costoEnvio: comuna sin zona → ok:false', () => {
  expect(repo.costoEnvio(delivery, 'Arica', 10000)).toMatchObject({ ok: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/delivery-costo.test.js`
Expected: FAIL — `repo.costoEnvio is not a function`.

- [ ] **Step 3: Write minimal implementation** en `gastos/src/pedidos/repo.js`, agregar antes de `module.exports` (reusa `_norm` del dataset de comunas):

```js
const { _norm: _normComuna } = require('./comunas-chile');

// Resuelve el costo de envío de una comuna. PURO.
function costoEnvio(delivery, comuna, subtotal) {
  const cfg = delivery || {};
  const zonas = Array.isArray(cfg.zonas) ? cfg.zonas : [];
  const target = _normComuna(comuna);
  const zona = zonas.find((z) => (z.comunas || []).some((c) => _normComuna(c) === target));
  if (!zona) return { ok: false };
  if (cfg.gratis_desde != null && Number(subtotal) >= Number(cfg.gratis_desde)) {
    return { ok: true, costo: 0, gratis: true, zona };
  }
  return { ok: true, costo: Math.max(0, Math.round(Number(zona.costo) || 0)), gratis: false, zona };
}
```
Agregar `costoEnvio,` al `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/delivery-costo.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/pedidos/repo.js gastos/tests/pedidos/delivery-costo.test.js && git commit -m "feat(delivery): costoEnvio (resuelve comuna→zona→costo, puro)"
```

---

## Task 4: pedido suma envío (createPedido + from-catalog + pedidoToText)

**Files:**
- Modify: `gastos/src/pedidos/repo.js`, `gastos/src/app/router.js`
- Test: `gastos/tests/pedidos/from-catalog.test.js` (añadir)

- [ ] **Step 1: Write the failing test** — APPEND a `gastos/tests/pedidos/from-catalog.test.js` (ya tiene `freshDb`/`seed`/`buildApp`/`token`/imports):

```js
test('despacho con comuna en zona suma el envío al total y lo muestra', async () => {
  const db = await freshDb(); const { companyId, tortaId } = await seed(db);
  await pedidos.setPedidoConfig(db, companyId, { delivery: {
    zonas: [{ nombre: 'RM', costo: 3000, comunas: ['Providencia'] }], gratis_desde: null,
  } });
  const app = buildApp(db); const t = await token(app);
  const r = await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: tortaId, opciones: { g1: 'o1' }, cantidad: 1 }], entrega: 'despacho', comuna: 'Providencia', direccion: 'Calle 1' }).expect(201);
  expect(Number(r.body.pedido.envio_costo)).toBe(3000);
  expect(r.body.pedido.envio_zona).toBe('RM');
  expect(r.body.pedido.comuna).toBe('Providencia');
  expect(Number(r.body.pedido.total)).toBe(18000 + 3000);   // IVA incluido (impuesto 0) + envío
  expect(r.body.text).toContain('Providencia');
});

test('despacho a comuna sin zona → 400 sin_despacho_comuna', async () => {
  const db = await freshDb(); const { companyId, tortaId } = await seed(db);
  await pedidos.setPedidoConfig(db, companyId, { delivery: { zonas: [{ nombre: 'RM', costo: 3000, comunas: ['Providencia'] }] } });
  const app = buildApp(db); const t = await token(app);
  await request(app).post('/api/app/pedido/from-catalog').set('Authorization', `Bearer ${t}`)
    .send({ lineas: [{ productId: tortaId, opciones: { g1: 'o1' }, cantidad: 1 }], entrega: 'despacho', comuna: 'Arica' }).expect(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/from-catalog.test.js -t despacho`
Expected: FAIL — el envío no se suma / no hay 400.

- [ ] **Step 3: Write minimal implementation:**

(a) `gastos/src/pedidos/repo.js`: en `ensurePedidosTable`, junto al CREATE TABLE de `pedidos` o como ALTER idempotente, agregar columnas:
```js
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comuna text;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_costo integer NOT NULL DEFAULT 0;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_zona text;
```
En `createPedido`, leer `d.comuna`/`d.envio_costo`/`d.envio_zona`, sumar el envío al total, y guardarlos. Cambiar el INSERT para incluir las 3 columnas y el total con envío. Concretamente, tras `const t = computeTotals(items, d.impuesto_pct);` calcular:
```js
  const envio_costo = Math.max(0, Math.round(Number(d.envio_costo) || 0));
  const totalConEnvio = t.total + envio_costo;
```
y en el INSERT agregar `comuna, envio_costo, envio_zona` a las columnas y `total` usar `totalConEnvio`. Es decir el INSERT pasa a:
```js
  const r = await db.query(
    `INSERT INTO pedidos (company_id, channel, contact_name, contact_phone, items, moneda,
       subtotal, impuesto_pct, impuesto, total, entrega, direccion, nota, comuna, envio_costo, envio_zona)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [companyId, d.channel || 'whatsapp', d.contact_name || null, d.contact_phone || null,
     JSON.stringify(items), d.moneda || 'CLP', t.subtotal, t.impuesto_pct, t.impuesto, totalConEnvio,
     entrega, direccion, d.nota || null, d.comuna || null, envio_costo, d.envio_zona || null]
  );
```
En `pedidoToText`, donde hoy muestra la entrega, si `ped.comuna` existe y entrega es despacho, mostrar la línea de comuna + envío. Reemplazar el bloque de entrega por:
```js
  if (ped.entrega === 'retiro') txt += '\n\n🏬 Entrega: Retiro en tienda';
  else if (ped.entrega === 'despacho') {
    if (ped.comuna) txt += '\n\n🚚 Despacho a ' + ped.comuna + ': ' + (Number(ped.envio_costo) > 0 ? fmtCLP(ped.envio_costo) : 'Gratis');
    else txt += '\n\n📦 Entrega: Despacho a domicilio';
  }
```
(Mantener la línea de `direccion` que ya existe debajo.)

(b) `gastos/src/app/router.js`: en `POST /pedido/from-catalog`, después de armar `items` y antes de crear el pedido, calcular el envío cuando es despacho con comuna. Tras `const cfg = await pedidosRepo.getPedidoConfig(db, req.auth.companyId);` y antes de `createPedido`, agregar:
```js
      let comuna = null, envio_costo = 0, envio_zona = null;
      if (b.entrega === 'despacho' && b.comuna) {
        const subtotalProductos = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
        const env = pedidosRepo.costoEnvio(cfg.delivery, b.comuna, subtotalProductos);
        if (!env.ok) return res.status(400).json({ error: 'sin_despacho_comuna' });
        comuna = b.comuna; envio_costo = env.costo; envio_zona = env.zona ? env.zona.nombre : null;
      }
```
y pasar `comuna, envio_costo, envio_zona` al objeto de `createPedido` (junto a `entrega`, `direccion`, etc.).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/pedidos/from-catalog.test.js` then `npx jest`
Expected: PASS — todo verde.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/src/pedidos/repo.js gastos/src/app/router.js gastos/tests/pedidos/from-catalog.test.js && git commit -m "feat(delivery): from-catalog suma el envío por comuna (total + pedidoToText)"
```

---

## Task 5: App — cart.js costoEnvioLocal + api.comunas + PedidoBuilder comuna

**Files:**
- Modify: `gastos-app/src/gastos/pedido/cart.js`, `gastos-app/src/gastos/api.js`, `gastos-app/src/gastos/pedido/PedidoBuilder.jsx`
- Test: `gastos-app/tests/gastos/cart.test.js` (añadir), `gastos-app/tests/gastos/PedidoBuilder.test.jsx` (añadir)

- [ ] **Step 1: Write the failing test**

(5a) APPEND a `gastos-app/tests/gastos/cart.test.js`:
```js
import { costoEnvioLocal } from '../../src/gastos/pedido/cart';

const delivery = { zonas: [{ id: 'z1', nombre: 'RM', costo: 2500, comunas: ['Providencia'] }], gratis_desde: 30000 };

test('costoEnvioLocal: comuna en zona, gratis sobre X, comuna sin zona', () => {
  expect(costoEnvioLocal(delivery, 'Providencia', 10000)).toMatchObject({ ok: true, costo: 2500, gratis: false });
  expect(costoEnvioLocal(delivery, 'Providencia', 30000)).toMatchObject({ ok: true, costo: 0, gratis: true });
  expect(costoEnvioLocal(delivery, 'Arica', 10000)).toMatchObject({ ok: false });
});
```

(5b) APPEND a `gastos-app/tests/gastos/PedidoBuilder.test.jsx` — agregar `comunas` y `getPedidoConfig` al mock de api (si no están) y un test. El mock de api del archivo: añadir `comunas: jest.fn()`. Test:
```js
test('despacho + comuna en zona suma el envío al total', async () => {
  api.listProducts.mockResolvedValue([torta]);
  api.getPedidoConfig.mockResolvedValue({ iva_incluido: true, delivery: { zonas: [{ id: 'z1', nombre: 'RM', costo: 2500, comunas: ['Providencia'] }], gratis_desde: null } });
  api.comunas.mockResolvedValue([{ region: 'Metropolitana de Santiago', comunas: ['Providencia', 'Ñuñoa'] }]);

  render(<PedidoBuilder channel="whatsapp" contact="Ana" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Torta')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Torta'));
  fireEvent.click(screen.getByText('Agregar al carrito'));
  await waitFor(() => expect(screen.getByText('Generar pedido')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Despacho'));
  await waitFor(() => expect(screen.getByLabelText('Comuna de despacho')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Comuna de despacho'), { target: { value: 'Providencia' } });
  await waitFor(() => expect(screen.getByText(/Env[íi]o/i)).toBeInTheDocument());
  // total = 18000 + 2500
  expect(screen.getByText(/\$20\.500/)).toBeInTheDocument();
});
```
(Si `torta` no existe en ese archivo, reusa el objeto producto del test existente.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/cart.test.js tests/gastos/PedidoBuilder.test.jsx`
Expected: FAIL — `costoEnvioLocal` no existe / no hay selector de comuna.

- [ ] **Step 3: Write minimal implementation:**

(a) `gastos-app/src/gastos/pedido/cart.js`: agregar al final:
```js
function _normC(s) { return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n'); }
export function costoEnvioLocal(delivery, comuna, subtotal) {
  const cfg = delivery || {};
  const zonas = Array.isArray(cfg.zonas) ? cfg.zonas : [];
  const target = _normC(comuna);
  const zona = zonas.find((z) => (z.comunas || []).some((c) => _normC(c) === target));
  if (!zona) return { ok: false };
  if (cfg.gratis_desde != null && Number(subtotal) >= Number(cfg.gratis_desde)) return { ok: true, costo: 0, gratis: true, zona };
  return { ok: true, costo: Math.max(0, Math.round(Number(zona.costo) || 0)), gratis: false, zona };
}
```

(b) `gastos-app/src/gastos/api.js`: agregar dentro del objeto `api`:
```js
  comunas() { return req('/api/app/comunas'); },
```

(c) `gastos-app/src/gastos/pedido/PedidoBuilder.jsx`: 
- Importar `costoEnvioLocal`: cambiar `import { cartTotal } from './cart';` por `import { cartTotal, costoEnvioLocal } from './cart';`.
- Estados nuevos: `const [comunas, setComunas] = useState([]);` `const [comuna, setComuna] = useState('');`.
- En el `useEffect` de carga, agregar `api.comunas().then((r) => setComunas(Array.isArray(r) ? r : [])).catch(() => {});`.
- Importar también `linePrice`: la línea de import queda `import { cartTotal, costoEnvioLocal, linePrice } from './cart';`.
- Calcular el subtotal de productos y el envío (después de definir `lineas` y `total`):
```js
  const subtotalProductos = lineas.reduce((s, l) => s + linePrice(l.product, { opciones: l.opciones, extras: l.extras }) * l.cantidad, 0);
  const env = (entrega === 'despacho' && comuna) ? costoEnvioLocal(cfg.delivery, comuna, subtotalProductos) : null;
  const envioCosto = env && env.ok ? env.costo : 0;
  const totalConEnvio = total + envioCosto;
```
- En el bloque de entrega (cuando `entrega === 'despacho'`), DESPUÉS del input de dirección, agregar el selector de comuna + la línea de envío:
```jsx
          {entrega === 'despacho' ? (
            <>
              <input placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, padding: 8, marginBottom: 8 }} />
              <select aria-label="Comuna de despacho" value={comuna} onChange={(e) => setComuna(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                <option value="">Comuna…</option>
                {comunas.map((g) => (
                  <optgroup key={g.region} label={g.region}>
                    {g.comunas.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
              {comuna ? (
                env && env.ok
                  ? <div style={{ fontSize: 12, opacity: 0.8 }}>Envío: {env.gratis ? 'Gratis' : clp(env.costo)}</div>
                  : <div style={{ fontSize: 12, color: '#ff6b6b' }}>No tienes envío a esa comuna.</div>
              ) : null}
            </>
          ) : null}
```
- Cambiar el render del total para usar `totalConEnvio`: donde dice `{clp(total)}` en la fila de Total, usar `{clp(totalConEnvio)}`.
- En `generar()`, agregar `comuna: entrega === 'despacho' ? comuna : null,` al payload de `api.pedidoFromCatalog`.

(NOTA: el `entrega === 'despacho' ? <input .../> : null` actual se reemplaza por el bloque `<>...</>` de arriba.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos-app" && npx jest tests/gastos/cart.test.js tests/gastos/PedidoBuilder.test.jsx` then `cd gastos-app && npx jest`
Expected: PASS — toda la suite app verde. Si el assert del total `$20.500` no calza por formato, ajustar SOLO la implementación (no el contrato) hasta que el total sume el envío.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos-app/src/gastos/pedido/cart.js gastos-app/src/gastos/api.js gastos-app/src/gastos/pedido/PedidoBuilder.jsx gastos-app/tests/gastos/cart.test.js gastos-app/tests/gastos/PedidoBuilder.test.jsx && git commit -m "feat(delivery-app): selector de comuna + envío en el total del PedidoBuilder"
```

---

## Task 6: Panel Ajustes — armador de zonas de despacho

**Files:**
- Modify: `gastos/public/panel/index.html`
- Test: `gastos/tests/panel/delivery-static.test.js`

- [ ] **Step 1: Write the failing test** — create `gastos/tests/panel/delivery-static.test.js`:

```js
const request = require('supertest');
const { app } = require('../../src/server');

test('Ajustes incluye el armador de Zonas de despacho + envío gratis', async () => {
  const res = await request(app).get('/panel/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Zonas de despacho');
  expect(res.text).toContain('id="deliveryGratis"');
  expect(res.text).toContain('id="zonasLista"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/panel/delivery-static.test.js`
Expected: FAIL — el html no tiene el bloque.

- [ ] **Step 3: Write minimal implementation** — en `gastos/public/panel/index.html`, dentro de `settingsSection` (Ajustes), agregar un bloque (usa el mismo estilo `card` y el helper `apiFetch` que ya usa Ajustes; READ el archivo para cablear el guardado igual que `loadCompany`/el toggle de IVA). Agregar:
```html
<div class="card">
  <h3 style="margin:0 0 8px;color:var(--gold)">Zonas de despacho</h3>
  <div id="zonasLista" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
  <div class="row">
    <div><label>Nombre de zona</label><input id="zonaNombre" placeholder="RM cercana" /></div>
    <div><label>Costo</label><input id="zonaCosto" type="number" placeholder="2500" /></div>
    <div style="flex:1"><label>Comunas</label>
      <select id="zonaComunas" multiple size="6" style="width:100%"></select>
    </div>
    <div><button id="zonaAgregar" class="btn-gold btn-sm">+ Zona</button></div>
  </div>
  <div class="row" style="margin-top:8px">
    <div><label>Envío gratis desde $</label><input id="deliveryGratis" type="number" placeholder="(opcional)" /></div>
    <div><button id="deliveryGuardar" class="btn-gold btn-sm">Guardar envío</button></div>
  </div>
</div>
```
En el `<script>`, dentro de `loadCompany` (o donde Ajustes carga), agregar la carga del `delivery` y poblar el `<select>` de comunas desde `GET /pedido-config` y `GET /comunas`, y el guardado con `PATCH /pedido-config` (`delivery`). Implementar (matcheando el contrato de `apiFetch` que devuelve `Response`):
```js
let _zonas = [];
async function loadDelivery() {
  try {
    const cr = await apiFetch('/comunas'); const regs = await cr.json();
    const sel = document.getElementById('zonaComunas');
    if (sel && !sel.dataset.loaded) {
      sel.innerHTML = regs.map(g => '<optgroup label="' + PanelLib.escapeHtml(g.region) + '">' + g.comunas.map(c => '<option value="' + PanelLib.escapeHtml(c) + '">' + PanelLib.escapeHtml(c) + '</option>').join('') + '</optgroup>').join('');
      sel.dataset.loaded = '1';
    }
    const pr = await apiFetch('/pedido-config'); const cfg = await pr.json();
    _zonas = (cfg.delivery && cfg.delivery.zonas) || [];
    document.getElementById('deliveryGratis').value = (cfg.delivery && cfg.delivery.gratis_desde != null) ? cfg.delivery.gratis_desde : '';
    renderZonas();
  } catch (e) {}
}
function renderZonas() {
  document.getElementById('zonasLista').innerHTML = _zonas.length
    ? _zonas.map((z, i) => '<div class="emp"><div><b>' + PanelLib.escapeHtml(z.nombre) + '</b> · ' + PanelLib.fmtClp(z.costo) + ' · ' + (z.comunas || []).length + ' comunas</div><span data-delz="' + i + '" style="cursor:pointer;color:#ff6b6b">✕</span></div>').join('')
    : '<div class="muted" style="font-size:12px">Sin zonas. Agrega una abajo (si solo despachas plano, crea una sola zona).</div>';
  document.querySelectorAll('[data-delz]').forEach(el => { el.onclick = async () => { _zonas.splice(Number(el.dataset.delz), 1); await saveDelivery(); renderZonas(); }; });
}
async function saveDelivery() {
  const gratis = document.getElementById('deliveryGratis').value;
  await apiFetch('/pedido-config', { method: 'PATCH', body: JSON.stringify({ delivery: { zonas: _zonas, gratis_desde: gratis === '' ? null : Number(gratis) } }) });
}
document.getElementById('zonaAgregar').onclick = async () => {
  const nombre = document.getElementById('zonaNombre').value.trim();
  const costo = Number(document.getElementById('zonaCosto').value) || 0;
  const comunas = Array.from(document.getElementById('zonaComunas').selectedOptions).map(o => o.value);
  if (!nombre || !comunas.length) return;
  _zonas.push({ nombre, costo, comunas });
  await saveDelivery(); renderZonas();
  document.getElementById('zonaNombre').value = ''; document.getElementById('zonaCosto').value = '';
};
document.getElementById('deliveryGuardar').onclick = saveDelivery;
```
Llamar `loadDelivery()` cuando se abre la pestaña Ajustes (junto a `loadCompany()` o en el mismo punto que se carga el toggle de IVA).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112\gastos" && npx jest tests/panel/delivery-static.test.js` then `npx jest tests/panel/`
Expected: PASS — panel verde.

- [ ] **Step 5: GUARD then commit**

```bash
cd "C:\Users\josea\Desktop\proyectos\paginas web\atiko\.claude\worktrees\dazzling-driscoll-78a112" && git rev-parse --show-toplevel && git branch --show-current && git add gastos/public/panel/index.html gastos/tests/panel/delivery-static.test.js && git commit -m "feat(delivery): armador de zonas de despacho en Ajustes del panel"
```

---

## Task 7: Verificación final (suites + build)

- [ ] **Step 1: Backend completo** — `cd gastos && npx jest` → PASS (203 + nuevos de delivery).
- [ ] **Step 2: App completa** — `cd gastos-app && npx jest` → PASS.
- [ ] **Step 3: Build app** — `cd gastos-app && npm run build` → OK.

(Todos los comandos con el prefijo del worktree.)

---

## Notas de despliegue (con el usuario después)
- Backend: `node deploy-gastos-wt.js` (sube worktree, no toca .env; migraciones idempotentes). App: rebuild APK (→ v3.3) + `upload-apk-wt.js`.
- ⚠️ Al desplegar el backend se subiría TODO el `gastos/` del worktree, incluyendo el trabajo "varas"/contabilidad (que está sin desplegar). Confirmar con el usuario antes de desplegar backend, o coordinar.

## Self-review (hecho)
- **Cobertura del spec:** dataset 16 regiones + comunaExiste ✅(T1) + endpoints /comunas ✅(T1); config delivery zonas+gratis_desde ✅(T2); costoEnvio puro ✅(T3); pedidos columnas + total con envío + from-catalog (400 sin zona) + pedidoToText ✅(T4); app cart.costoEnvioLocal + api.comunas + PedidoBuilder selector comuna + total ✅(T5); panel armador de zonas ✅(T6). Tenant scoping (cfg por companyId) ✅.
- **Sin placeholders:** dataset completo; código completo. (El comentario "placeholder" en T5 step3 se reemplaza explícitamente por el cálculo real con `linePrice` en las líneas siguientes — el implementador usa esas líneas, no el placeholder.)
- **Consistencia:** `costoEnvio`/`costoEnvioLocal` mismo contrato `{ok,costo,gratis,zona}` (T3/T5); `delivery: {zonas:[{id,nombre,costo,comunas}], gratis_desde}` igual en T2/T3/T5/T6; payload `from-catalog` agrega `comuna` (T4 endpoint, T5 app); `_norm` del dataset reusado por `costoEnvio` (T3).
