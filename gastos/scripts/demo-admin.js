// Demo local del panel /admin con base EN MEMORIA (pg-mem) ya sembrada.
// No requiere Postgres. Levanta el router/UI reales en http://localhost:3100/admin/
// Uso:  cd gastos && node scripts/demo-admin.js
const express = require('express');
const path = require('path');
const { newDb } = require('pg-mem');
const { migrate } = require('../src/db/migrate');
const { createAdminRouter } = require('../src/admin/router');
const { createPanelRouter } = require('../src/panel/router');
const { createEmployee } = require('../src/companies/repo');
const { createExpense } = require('../src/expenses/repo');
const adminRepo = require('../src/admin/repo');

process.env.GASTOS_ADMIN_USER = process.env.GASTOS_ADMIN_USER || 'atiko';
process.env.GASTOS_ADMIN_PASSWORD = process.env.GASTOS_ADMIN_PASSWORD || 'demo1234';
const PORT = process.env.PORT || 3100;

(async () => {
  const mem = newDb();
  mem.public.registerFunction({ name: 'gen_random_uuid', returns: 'uuid', impure: true, implementation: () => require('crypto').randomUUID() });
  const db = new (mem.adapters.createPg().Pool)();
  await migrate(db);

  // --- Seed: cliente principal con productos/canales/burbuja ---
  const r = await adminRepo.crearCliente(db, {
    nombreEmpresa: 'Pizzería Bella Napoli SpA', rut: '77.123.456-9', plan: 'pyme',
    usuario: 'bella', password: 'bella123', nombreContacto: 'Marco Rossi',
    owner_whatsapp: '+56 9 6123 4567', owner_email: 'contacto@bellanapoli.cl',
    productos: ['hashia', 'crm', 'pedidos'], canales: ['whatsapp', 'instagram'],
    burbuja_activa: true, burbuja_apps: ['whatsapp', 'rappi', 'banco estado'],
  });
  const cid = r.empresa.id;
  await db.query("UPDATE companies SET giro=$2 WHERE id=$1", [cid, 'Restaurante - Pizzas']);
  await adminRepo.crearCliente(db, { nombreEmpresa: 'Pastelería Dulce Ltda', rut: '76.555.444-3', plan: 'basico', productos: ['hashia'], owner_whatsapp: '+56 9 8888 7777', owner_email: 'hola@dulce.cl' });

  // Empleados (whitelist)
  await createEmployee(db, { company_id: cid, nombre: 'Juan Pérez', phone: '+56 9 1111 1111', usuario: 'juanp', rol: 'empleado', activo: true });
  await createEmployee(db, { company_id: cid, nombre: 'María González', phone: '+56 9 2222 2222', usuario: 'mariag', rol: 'cajera', activo: true });

  // Movimientos del mes en curso (para el resumen y la ficha)
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const movs = [
    { tipo: 'gasto', proveedor: 'Molinera Lo Valledor', total: 452200, estado_pago: 'pagada', d: '04' },
    { tipo: 'gasto', proveedor: 'Soprole S.A.', total: 618800, estado_pago: 'pendiente', d: '05' },
    { tipo: 'ingreso', proveedor: 'Constructora Andes', total: 380800, estado_pago: 'pagada', d: '06' },
    { tipo: 'gasto', proveedor: 'Copec', total: 40000, estado_pago: 'pagada', d: '08' },
    { tipo: 'ingreso', proveedor: 'Colegio San Marcos', total: 535500, estado_pago: 'pagada', d: '12' },
  ];
  for (const m of movs) {
    const exp = await createExpense(db, { company_id: cid, tipo: m.tipo, proveedor: m.proveedor, total: m.total, estado_pago: m.estado_pago, fecha: ym + '-' + m.d });
    await db.query("UPDATE expenses SET estado='confirmado' WHERE id=$1", [exp.id]); // createExpense no acepta 'estado'
  }

  // --- App: mismos routers y estáticos que server.js ---
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/admin', createAdminRouter({ db }));
  app.use('/api/panel', createPanelRouter({ db }));
  app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  app.use('/panel', express.static(path.join(__dirname, '..', 'public', 'panel'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('/', (_q, res) => res.redirect('/admin/'));

  app.listen(PORT, () => {
    console.log('================================================');
    console.log('  DEMO Hash IA Admin (base en memoria, sembrada)');
    console.log('  → http://localhost:' + PORT + '/admin/');
    console.log('  Usuario: ' + process.env.GASTOS_ADMIN_USER + '   Clave: ' + process.env.GASTOS_ADMIN_PASSWORD);
    console.log('  (cliente sembrado: Pizzería Bella Napoli)');
    console.log('================================================');
  });
})().catch((e) => { console.error('DEMO error:', e); process.exit(1); });
