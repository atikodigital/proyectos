// Set fijo chileno → cuenta del plan SII Mipyme. Ver spec §6.1.
const OTROS = { codigo: '4.3.150.1', nombre: 'Otros Gastos de Administración y Venta' };

const CATEGORY_TO_SII = {
  'Mercadería e insumos del giro': { codigo: '4.2.10.1', nombre: 'Costos Directos del Giro' },
  'Alimentación y representación': OTROS,
  'Combustible y transporte': OTROS,
  'Mantención y reparaciones': { codigo: '4.3.40.1', nombre: 'Reparaciones Automóviles' },
  'Arriendos': OTROS,
  'Servicios básicos': { codigo: '4.3.10.1', nombre: 'Gastos Generales' },
  'Útiles de oficina / generales': { codigo: '4.3.10.1', nombre: 'Gastos Generales' },
  'Seguros': OTROS,
  'Publicidad y promoción': { codigo: '4.3.140.1', nombre: 'Gasto Promoción' },
  'Honorarios': { codigo: '4.3.90.1', nombre: 'Honorarios' },
  'Contribuciones, patentes e impuestos': { codigo: '4.3.20.1', nombre: 'Contribuciones' },
  'Gastos financieros': { codigo: '4.5.10.1', nombre: 'Gastos Financieros' },
  'Otros gastos': OTROS,
};

const CATEGORIES = Object.keys(CATEGORY_TO_SII);

function isValidCategory(cat) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_TO_SII, cat);
}

function mapCategoryToSii(cat) {
  return CATEGORY_TO_SII[cat] || OTROS;
}

module.exports = { CATEGORIES, CATEGORY_TO_SII, isValidCategory, mapCategoryToSii };
