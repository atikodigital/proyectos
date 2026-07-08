// Definición de planes y pesos de consumo de IA. Pesos INICIALES — se calibran
// con el costo real de la API más adelante antes de cobrar.
const PLANES = {
  free:      { nombre: 'free',      creditos: 30,        precios: { CLP: 0,     USD: 0,  EUR: 0  } },
  basico:    { nombre: 'basico',    creditos: 100,       precios: { CLP: 9900,  USD: 15, EUR: 15 } },
  pyme:      { nombre: 'pyme',      creditos: 210,       precios: { CLP: 24900, USD: 35, EUR: 35 } },
  empresa:   { nombre: 'empresa',   creditos: 600,       precios: { CLP: 49900, USD: 69, EUR: 69 } },
  ilimitado: { nombre: 'ilimitado', creditos: 100000000, precios: { CLP: 0,     USD: 0,  EUR: 0  } },
};

// Prueba gratis para cuentas nuevas: regala el plan Pyme completo por N días.
// Al vencer, la suscripción se degrada sola a Free (ver billing/repo.expireTrialIfDue).
const TRIAL_PLAN = 'pyme';
const TRIAL_DIAS = 14;

const PLAN_LABELS = {
  free:      'Hash IA Free',
  basico:    'Hash IA Básico',
  pyme:      'Hash IA Pyme',
  empresa:   'Hash IA Empresa',
  ilimitado: 'Hash IA Especial',
};

// Cuántos créditos cuesta una unidad de cada operación. Provisional (calibrar).
// Regla unificada de cara al cliente: "1 shot = 1 movimiento registrado por la IA
// (foto, voz o texto)". Por eso `imagen` y `movimiento` valen ambos 1.
const PESOS = {
  imagen: 1,     // 1 imagen interpretada (boleta, cartola, catálogo) = 1 movimiento
  movimiento: 1, // 1 gasto/ingreso registrado por KALY por voz o texto = 1 movimiento
  voz_min: 3,    // 1 minuto de conversación Live EXTENDIDA (tras el 1º minuto gratis)
  texto: 0,      // chat/Match/parsing SIN registrar movimiento — incluido por ahora
};

function getPlan(nombre) {
  return PLANES[nombre] || PLANES.free;
}

function creditosDe(tipo, cantidad = 1) {
  const peso = PESOS[tipo];
  if (!peso) return 0;
  return Math.ceil(peso * cantidad);
}

// Devuelve el precio de un plan en la moneda dada, o null si el plan no existe.
function precioDe(plan, moneda) {
  return PLANES[plan]?.precios?.[moneda] ?? null;
}

// Devuelve el procesador de pago para la moneda dada.
// CLP → MercadoPago ('mp'), cualquier otra → Lemon Squeezy ('lemonsqueezy').
function procesadorPara(moneda) {
  return moneda === 'CLP' ? 'mp' : 'lemonsqueezy';
}

// Lista de monedas soportadas en el sistema de billing.
function monedasSoportadas() {
  return ['CLP', 'USD', 'EUR'];
}

module.exports = { PLANES, PESOS, getPlan, creditosDe, PLAN_LABELS, precioDe, procesadorPara, monedasSoportadas, TRIAL_PLAN, TRIAL_DIAS };
