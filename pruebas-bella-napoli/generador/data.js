// ============================================================================
//  LIBRO MAESTRO DE DATOS — Pizzería Bella Napoli SpA  (Junio 2026)
//  Fuente única de verdad para generar documentos coherentes entre sí.
//  RUTs válidos (mód-11), neto+IVA=total, y la cartola cuadra con las
//  ventas/compras/sueldos salvo 3 diferencias deliberadas de conciliación.
// ============================================================================

// --- Helpers -------------------------------------------------------------
function dv(body) {
  let s = 1, m = 0;
  let n = body;
  while (n > 0) {
    s = (s + (n % 10) * (9 - (m++ % 6))) % 11;
    n = Math.floor(n / 10);
  }
  return s ? String(s - 1) : 'K';
}
function rut(body) {
  const b = String(body).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${b}-${dv(body)}`;
}
function clp(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
const iva = (neto) => Math.round(neto * 0.19);
// boleta: total con IVA incluido -> desglosar
const netoDe = (total) => Math.round(total / 1.19);
const ivaDe = (total) => total - netoDe(total);

// --- Empresa (emisor de ventas / receptor de compras) --------------------
const EMPRESA = {
  razon: 'PIZZERÍA BELLA NAPOLI SpA',
  fantasia: 'Bella Napoli',
  rutBody: 77123456,
  giro: 'Restaurante - Elaboración y venta de pizzas',
  dir: 'Av. Italia 1234, Providencia, Santiago',
  comuna: 'Providencia',
  ciudad: 'Santiago',
  fono: '+56 2 2987 6543',
  email: 'contacto@bellanapoli.cl',
  duenoNombre: 'Marco Rossi',
  duenoWsp: '+56 9 6123 4567',
  banco: 'Banco de Chile',
  cuenta: '000-12345-67',
  cuentaTipo: 'Cuenta Corriente',
};
EMPRESA.rut = rut(EMPRESA.rutBody);

// --- Empleados (remuneraciones) ------------------------------------------
const EMPLEADOS = [
  { nombre: 'Juan Pérez Muñoz',     cargo: 'Pizzero',     rutBody: 15234567, liquido: 620000 },
  { nombre: 'Carlos Soto Vega',     cargo: 'Pizzero',     rutBody: 16345678, liquido: 560000 },
  { nombre: 'María González Rojas', cargo: 'Cajera',      rutBody: 17456789, liquido: 480000 },
  { nombre: 'Pedro Ramírez Díaz',   cargo: 'Repartidor',  rutBody: 18567890, liquido: 450000 },
];
EMPLEADOS.forEach(e => (e.rut = rut(e.rutBody)));

// --- Proveedores (emisores de compras) -----------------------------------
const PROV = {
  molinera: { razon: 'COMERCIAL MOLINERA LO VALLEDOR LTDA', rutBody: 78901234, giro: 'Venta de harinas y abarrotes', dir: 'Av. Lo Valledor 2200, Pedro Aguirre Cerda', comuna: 'P.A. Cerda' },
  soprole:  { razon: 'SOPROLE S.A.',                        rutBody: 90876000, giro: 'Distribución de productos lácteos', dir: 'Av. Vitacura 4465, Vitacura', comuna: 'Vitacura' },
  vega:     { razon: 'DISTRIBUIDORA VEGA CENTRAL LTDA',     rutBody: 76543210, giro: 'Venta de frutas y verduras', dir: 'Nueva Matucana 1, Santiago', comuna: 'Santiago' },
  andina:   { razon: 'EMBOTELLADORA ANDINA S.A.',           rutBody: 91041000, giro: 'Distribución de bebidas', dir: 'Av. El Golf 99, Las Condes', comuna: 'Las Condes' },
  abastible:{ razon: 'ABASTIBLE S.A.',                       rutBody: 91806000, giro: 'Distribución de gas licuado', dir: 'Camino Melipilla 8501, Maipú', comuna: 'Maipú' },
  envases:  { razon: 'ENVASES DEL PACÍFICO SpA',            rutBody: 76998877, giro: 'Fabricación de envases de cartón', dir: 'El Salto 4001, Recoleta', comuna: 'Recoleta' },
  inmob:    { razon: 'INMOBILIARIA PROVIDENCIA LTDA',       rutBody: 77665544, giro: 'Arriendo de bienes inmuebles', dir: 'Av. Providencia 2020, Providencia', comuna: 'Providencia' },
  enel:     { razon: 'ENEL DISTRIBUCIÓN CHILE S.A.',        rutBody: 96800570, giro: 'Distribución de energía eléctrica', dir: 'Santa Rosa 76, Santiago', comuna: 'Santiago' },
  aguas:    { razon: 'AGUAS ANDINAS S.A.',                  rutBody: 61808000, giro: 'Servicios sanitarios', dir: 'Av. Balmaceda 1398, Santiago', comuna: 'Santiago' },
  movistar: { razon: 'TELEFÓNICA MÓVILES CHILE S.A.',       rutBody: 87845500, giro: 'Telecomunicaciones', dir: 'Av. Providencia 111, Providencia', comuna: 'Providencia' },
  copec:    { razon: 'COMPAÑÍA DE PETRÓLEOS DE CHILE COPEC S.A.', rutBody: 99520000, giro: 'Venta de combustibles', dir: 'Estación Av. Italia, Providencia', comuna: 'Providencia' },
};
Object.values(PROV).forEach(p => (p.rut = rut(p.rutBody)));

// --- Clientes empresa (receptores de facturas emitidas) ------------------
const CLI = {
  constructora: { razon: 'CONSTRUCTORA ANDES LTDA',        rutBody: 79123456, giro: 'Construcción', dir: 'Av. Apoquindo 5500, Las Condes', comuna: 'Las Condes' },
  colegio:      { razon: 'CORPORACIÓN EDUCACIONAL SAN MARCOS', rutBody: 65123456, giro: 'Educación', dir: 'Pocuro 2300, Providencia', comuna: 'Providencia' },
  ti:           { razon: 'SOLUCIONES TI SpA',              rutBody: 76112233, giro: 'Servicios informáticos', dir: 'Av. Vitacura 2900, Las Condes', comuna: 'Las Condes' },
  clinica:      { razon: 'CLÍNICA VIDA PLENA S.A.',        rutBody: 96112334, giro: 'Servicios de salud', dir: 'Av. Salvador 200, Providencia', comuna: 'Providencia' },
  muni:         { razon: 'I. MUNICIPALIDAD DE PROVIDENCIA', rutBody: 69070100, giro: 'Administración pública', dir: 'Av. Pedro de Valdivia 963, Providencia', comuna: 'Providencia' },
  bancoe:       { razon: 'BANCO DEL ESTADO DE CHILE',      rutBody: 97030000, giro: 'Banca', dir: 'Av. Providencia 2153, Providencia', comuna: 'Providencia' },
};
Object.values(CLI).forEach(c => (c.rut = rut(c.rutBody)));

// ============================================================================
//  TRANSACCIONES
// ============================================================================

// --- COMPRAS (facturas/boletas recibidas) → se cargan como GASTOS ----------
// tipoDoc: 'factura' | 'boleta'  ·  foto: true = estilo "foto de papel"
const COMPRAS = [
  { folio: 1287, fecha: '2026-06-04', prov: PROV.molinera, glosa: 'Harina panadera 25 kg x 20 sacos', cat: 'Mercadería e insumos del giro',  neto: 380000, foto: false },
  { folio: 1342, fecha: '2026-06-18', prov: PROV.molinera, glosa: 'Harina panadera 25 kg x 18 sacos', cat: 'Mercadería e insumos del giro',  neto: 360000, foto: false },
  { folio: 88231, fecha: '2026-06-05', prov: PROV.soprole, glosa: 'Queso mozzarella 5 kg x 24',        cat: 'Mercadería e insumos del giro',  neto: 520000, foto: false },
  { folio: 88944, fecha: '2026-06-19', prov: PROV.soprole, glosa: 'Queso mozzarella 5 kg x 22',        cat: 'Mercadería e insumos del giro',  neto: 480000, foto: false },
  { folio: 4521,  fecha: '2026-06-02', prov: PROV.vega,    glosa: 'Verduras varias (tomate, albahaca, cebolla)', cat: 'Mercadería e insumos del giro', neto: 120000, foto: true,  tipoDoc: 'boleta' },
  { folio: 4612,  fecha: '2026-06-12', prov: PROV.vega,    glosa: 'Verduras varias', cat: 'Mercadería e insumos del giro', neto: 115000, foto: true,  tipoDoc: 'boleta' },
  { folio: 4733,  fecha: '2026-06-23', prov: PROV.vega,    glosa: 'Verduras varias', cat: 'Mercadería e insumos del giro', neto: 130000, foto: true,  tipoDoc: 'boleta' },
  { folio: 220145, fecha: '2026-06-06', prov: PROV.andina, glosa: 'Bebidas 1.5L y latas (surtido)', cat: 'Mercadería e insumos del giro', neto: 240000, foto: false },
  { folio: 221890, fecha: '2026-06-20', prov: PROV.andina, glosa: 'Bebidas 1.5L y latas (surtido)', cat: 'Mercadería e insumos del giro', neto: 220000, foto: false },
  { folio: 7781,  fecha: '2026-06-07', prov: PROV.abastible, glosa: 'Gas licuado cilindro 45 kg x 2', cat: 'Servicios básicos', neto: 95000, foto: false },
  { folio: 7990,  fecha: '2026-06-21', prov: PROV.abastible, glosa: 'Gas licuado cilindro 45 kg x 2', cat: 'Servicios básicos', neto: 95000, foto: false },
  { folio: 3312,  fecha: '2026-06-10', prov: PROV.envases, glosa: 'Cajas pizza 33cm x 1000 + servilletas', cat: 'Mercadería e insumos del giro', neto: 180000, foto: false },
  { folio: 9001,  fecha: '2026-06-05', prov: PROV.inmob,   glosa: 'Arriendo local comercial junio 2026', cat: 'Arriendos', neto: 1200000, foto: false },
  { folio: 550321, fecha: '2026-06-11', prov: PROV.enel,   glosa: 'Suministro eléctrico - mayo 2026', cat: 'Servicios básicos', total: 200000, foto: false },
  { folio: 770445, fecha: '2026-06-11', prov: PROV.aguas,  glosa: 'Servicio agua potable - mayo 2026', cat: 'Servicios básicos', total: 65000, foto: false },
  { folio: 660112, fecha: '2026-06-09', prov: PROV.movistar, glosa: 'Plan internet + teléfono local', cat: 'Servicios básicos', total: 35000, foto: false },
  { folio: 30551, fecha: '2026-06-08', prov: PROV.copec,   glosa: 'Bencina 93 - delivery', cat: 'Combustible y transporte', total: 40000, foto: true,  tipoDoc: 'boleta' },
  { folio: 31002, fecha: '2026-06-22', prov: PROV.copec,   glosa: 'Bencina 93 - delivery', cat: 'Combustible y transporte', total: 35000, foto: true,  tipoDoc: 'boleta' },
];

// --- VENTAS: facturas emitidas a empresas → se cargan como INGRESOS --------
const FACTURAS_EMITIDAS = [
  { folio: 121, fecha: '2026-06-06', cli: CLI.constructora, glosa: 'Almuerzo equipo obra - 25 pizzas familiares', neto: 320000 },
  { folio: 122, fecha: '2026-06-12', cli: CLI.colegio,      glosa: 'Evento aniversario - 40 pizzas + bebidas',   neto: 450000 },
  { folio: 123, fecha: '2026-06-17', cli: CLI.ti,           glosa: 'Almuerzo corporativo - 20 pizzas',            neto: 280000 },
  { folio: 124, fecha: '2026-06-24', cli: CLI.clinica,      glosa: 'Coffee/almuerzo jornada - 35 pizzas',         neto: 510000 },
  { folio: 125, fecha: '2026-06-27', cli: CLI.muni,         glosa: 'Evento comunitario - 55 pizzas + bebidas',    neto: 680000 },
  { folio: 126, fecha: '2026-06-30', cli: CLI.bancoe,       glosa: 'Almuerzo sucursal - 18 pizzas',               neto: 240000 },
];

// --- VENTAS: boletas a público (muestras) → se cargan como INGRESOS --------
const BOLETAS_EMITIDAS = [
  { folio: 1001, fecha: '2026-06-02', glosa: '2 Pizza Familiar + 2 Bebida 1.5L', total: 45900, foto: true },
  { folio: 1027, fecha: '2026-06-09', glosa: '1 Pizza Mediana + 1 Bebida',       total: 28900, foto: true },
  { folio: 1055, fecha: '2026-06-15', glosa: '2 Pizza Familiar + Pan ajo + Bebida', total: 52400, foto: true },
  { folio: 1089, fecha: '2026-06-22', glosa: '1 Pizza Familiar + Bebida 1.5L',   total: 33800, foto: true },
  { folio: 1124, fecha: '2026-06-29', glosa: '1 Pizza Familiar + Postre + Bebida', total: 41200, foto: false },
];

// --- COMPROBANTES DE TRANSFERENCIA (Banco de Chile) ------------------------
// Incluyen sueldos, arriendo, y los 2 ítems "en libros pero no en banco aún".
const TRANSFERENCIAS = [
  ...EMPLEADOS.map((e, i) => ({
    nop: 8810045 + i, fecha: '2026-06-30', destNombre: e.nombre, destRut: e.rut,
    destBanco: 'Banco Estado', glosa: `Sueldo junio 2026 - ${e.cargo}`, monto: e.liquido, foto: i === 3,
  })),
  { nop: 8809912, fecha: '2026-06-10', destNombre: PROV.inmob.razon, destRut: PROV.inmob.rut, destBanco: 'Banco Santander', glosa: 'Arriendo local junio 2026', monto: 1428000, foto: false },
  { nop: 8810099, fecha: '2026-06-30', destNombre: PROV.envases.razon, destRut: PROV.envases.rut, destBanco: 'BCI', glosa: 'Pago factura 3312 - cajas pizza', monto: 214200, foto: false, nota: 'NO COBRADO AÚN (diferencia conciliación)' },
];

// --- DEPÓSITO EN TRÁNSITO (comprobante de depósito) ------------------------
const DEPOSITO_TRANSITO = {
  fecha: '2026-06-30', glosa: 'Depósito ventas efectivo fin de semana', monto: 720000,
  nota: 'Depositado 30/06, el banco acredita 01/07 (diferencia conciliación)',
};

// --- CARTOLA BANCARIA (Banco de Chile) -------------------------------------
// Movimientos reales del banco en junio. El generador calcula el saldo.
// Las 3 diferencias: (1) comisión $9.500 está aquí pero no se registra como
// gasto; (2) depósito en tránsito $720.000 NO aparece aquí; (3) pago Envases
// $214.200 NO aparece aquí (girado, no cobrado).
const SALDO_INICIAL = 3200000;
const CARTOLA = [
  { fecha: '2026-06-06', desc: 'ABONO TRANSBANK VENTAS TARJETA (BRUTO)', abono: 1885000 },
  { fecha: '2026-06-06', desc: 'COMISION TRANSBANK + IVA',               cargo: 35000   },
  { fecha: '2026-06-06', desc: 'TRANSF RECIBIDA CONSTRUCTORA ANDES',    abono: 380800  },
  { fecha: '2026-06-10', desc: 'PAGO PROVEEDOR MOLINERA LO VALLEDOR',   cargo: 452200  },
  { fecha: '2026-06-10', desc: 'PAGO ARRIENDO INMOB PROVIDENCIA',       cargo: 1428000 },
  { fecha: '2026-06-12', desc: 'PAGO PROVEEDOR SOPROLE SA',             cargo: 618800  },
  { fecha: '2026-06-12', desc: 'PAC MOVISTAR',                          cargo: 35000   },
  { fecha: '2026-06-13', desc: 'ABONO TRANSBANK VENTAS TARJETA (BRUTO)', abono: 1956000 },
  { fecha: '2026-06-13', desc: 'COMISION TRANSBANK + IVA',               cargo: 36000   },
  { fecha: '2026-06-15', desc: 'PAGO PROVEEDOR EMBOT ANDINA',           cargo: 285600  },
  { fecha: '2026-06-15', desc: 'PAC ENEL DISTRIBUCION',                 cargo: 200000  },
  { fecha: '2026-06-15', desc: 'PAC AGUAS ANDINAS',                     cargo: 65000   },
  { fecha: '2026-06-16', desc: 'DEPOSITO EFECTIVO VENTAS',              abono: 650000  },
  { fecha: '2026-06-18', desc: 'PAGO PROVEEDOR ABASTIBLE SA',           cargo: 113050  },
  { fecha: '2026-06-20', desc: 'ABONO TRANSBANK VENTAS TARJETA (BRUTO)', abono: 2089000 },
  { fecha: '2026-06-20', desc: 'COMISION TRANSBANK + IVA',               cargo: 39000   },
  { fecha: '2026-06-20', desc: 'TRANSF RECIBIDA COLEGIO SAN MARCOS',    abono: 535500  },
  { fecha: '2026-06-24', desc: 'PAGO PROVEEDOR MOLINERA LO VALLEDOR',   cargo: 428400  },
  { fecha: '2026-06-25', desc: 'TRANSF RECIBIDA SOLUCIONES TI',         abono: 333200  },
  { fecha: '2026-06-26', desc: 'PAGO PROVEEDOR SOPROLE SA',             cargo: 571200  },
  { fecha: '2026-06-27', desc: 'ABONO TRANSBANK VENTAS TARJETA (BRUTO)', abono: 1814000 },
  { fecha: '2026-06-27', desc: 'COMISION TRANSBANK + IVA',               cargo: 34000   },
  { fecha: '2026-06-30', desc: 'TRANSF RECIBIDA CLINICA VIDA PLENA',    abono: 606900  },
  { fecha: '2026-06-30', desc: 'PAGO SUELDO JUAN PEREZ',               cargo: 620000  },
  { fecha: '2026-06-30', desc: 'PAGO SUELDO CARLOS SOTO',              cargo: 560000  },
  { fecha: '2026-06-30', desc: 'PAGO SUELDO MARIA GONZALEZ',           cargo: 480000  },
  { fecha: '2026-06-30', desc: 'PAGO SUELDO PEDRO RAMIREZ',            cargo: 450000  },
  { fecha: '2026-06-30', desc: 'COMISION MANTENCION CUENTA',          cargo: 9500    }, // ← DIFERENCIA 1
];

module.exports = {
  dv, rut, clp, iva, netoDe, ivaDe,
  EMPRESA, EMPLEADOS, PROV, CLI,
  COMPRAS, FACTURAS_EMITIDAS, BOLETAS_EMITIDAS, TRANSFERENCIAS,
  DEPOSITO_TRANSITO, CARTOLA, SALDO_INICIAL,
};
