function fmtClp(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('es-CL');
}

function formatConfirmation(e) {
  const tipo = (e.tipo_documento || 'documento');
  const partes = [
    `🧾 ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`,
    e.proveedor || 's/proveedor',
    fmtClp(e.total),
    e.fecha || 's/fecha',
    e.categoria || 'Otros gastos',
  ];
  return (
    partes.join(' · ') +
    `\nIVA ${fmtClp(e.iva)}.` +
    `\n¿Está correcto? Responde *SÍ* para guardar, o dime qué corregir ` +
    `(ej: "monto 30000" o "categoría comida"). Responde *NO* para descartar.`
  );
}

function formatSummary(s) {
  const lineas = (s.porCategoria || []).map((c) => `• ${c.categoria}: ${fmtClp(c.total)}`);
  return (
    `📊 Gastos ${s.periodo} (${s.count || 0})\n` +
    `Total: ${fmtClp(s.total)}\n` +
    (lineas.length ? lineas.join('\n') : 'Sin gastos en el período.')
  );
}

function formatDuplicateBlock(e) {
  const cuando = e.created_at ? new Date(e.created_at).toLocaleDateString('es-CL') : 's/fecha';
  return (
    `⚠️ Esto ya fue registrado (${e.proveedor || 's/proveedor'} · ${fmtClp(e.total)} · ${e.fecha || 's/fecha'}) el ${cuando}. ` +
    `No lo registré de nuevo para no duplicar el pago. Si de verdad es otro, avísale al dueño.`
  );
}

module.exports = { formatConfirmation, formatSummary, formatDuplicateBlock, fmtClp };
