function cleanRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function normalizeRut(rut) {
  const c = cleanRut(rut);
  if (c.length < 2) return '';
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${body}-${dv}`;
}

function computeDv(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return String(res);
}

function isValidRut(rut) {
  const c = cleanRut(rut);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  return computeDv(body) === dv;
}

function parseAmountClp(s) {
  const digits = String(s || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseFecha(s) {
  const str = String(s || '').trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

module.exports = { normalizeRut, isValidRut, parseAmountClp, parseFecha };
