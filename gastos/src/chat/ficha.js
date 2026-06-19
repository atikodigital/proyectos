function telefonoDeContacto(contact) {
  const s = String(contact || '').trim();
  // If the contact string looks like a phone (only digits, spaces, +, -, parentheses)
  // and has at least 4 digits, treat it as a phone number.
  if (!/[a-zA-Z]/.test(s)) {
    const d = s.replace(/[^0-9+]/g, '');
    if (d.replace(/[^0-9]/g, '').length >= 4) return d;
  }
  return '';
}

function fichaDerivada(mensajes) {
  const arr = Array.isArray(mensajes) ? mensajes : [];
  if (!arr.length) return { nombre: '', channel: '', telefono: '', nMensajes: 0, primerContacto: null, ultimoContacto: null };
  const fechas = arr.map((m) => m.created_at).filter(Boolean).sort();
  const last = arr[arr.length - 1];
  return {
    nombre: last.contact || '',
    channel: last.channel || '',
    telefono: telefonoDeContacto(last.contact),
    nMensajes: arr.length,
    primerContacto: fechas[0] || null,
    ultimoContacto: fechas[fechas.length - 1] || null,
  };
}

module.exports = { fichaDerivada, telefonoDeContacto };
