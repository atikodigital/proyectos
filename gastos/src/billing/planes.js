// Definición de planes y pesos de consumo de IA. Pesos INICIALES — se calibran
// con el costo real de la API más adelante antes de cobrar.
const PLANES = {
  free:      { nombre: 'free',      creditos: 30,        precio: 0     },
  basico:    { nombre: 'basico',    creditos: 100,       precio: 9900  },
  pyme:      { nombre: 'pyme',      creditos: 210,       precio: 24900 },
  empresa:   { nombre: 'empresa',   creditos: 600,       precio: 49900 },
  ilimitado: { nombre: 'ilimitado', creditos: 100000000, precio: 0     },
};

const PLAN_LABELS = {
  free:      'Hash IA Free',
  basico:    'Hash IA Básico',
  pyme:      'Hash IA Pyme',
  empresa:   'Hash IA Empresa',
  ilimitado: 'Hash IA Especial',
};

// Cuántos créditos cuesta una unidad de cada operación. Provisional (calibrar).
const PESOS = {
  imagen: 1,    // 1 imagen interpretada (boleta, cartola, catálogo)
  voz_min: 3,   // 1 minuto de voz (Gemini Live) — el más caro
  texto: 0,     // chat/Match/parsing — incluido por ahora (subir tras calibrar)
};

function getPlan(nombre) {
  return PLANES[nombre] || PLANES.free;
}

function creditosDe(tipo, cantidad = 1) {
  const peso = PESOS[tipo];
  if (!peso) return 0;
  return Math.ceil(peso * cantidad);
}

module.exports = { PLANES, PESOS, getPlan, creditosDe, PLAN_LABELS };
