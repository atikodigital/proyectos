import { getToken, setToken } from './session';

/* eslint-disable no-undef */
// In Vite builds VITE_API_BASE is injected; in Jest/Node we fall back to process.env or the default.
const API_BASE =
  (typeof __VITE_API_BASE__ !== 'undefined' ? __VITE_API_BASE__ : undefined) ||
  (typeof process !== 'undefined' && process.env && process.env.VITE_API_BASE) ||
  'https://gastos.atikodigital.cl';
/* eslint-enable no-undef */

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) { const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error) || `http_${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

// Blob → base64 (sin el prefijo data:...;base64,) para escribir con Filesystem.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => { const s = String(r.result || ''); const i = s.indexOf(','); resolve(i >= 0 ? s.slice(i + 1) : s); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export const api = {
  async login(usuario, password) {
    const data = await req('/api/app/login', { method: 'POST', body: { usuario, password }, auth: false });
    setToken(data.token);
    return data;
  },
  createExpense(imageBase64, mimeType = 'image/jpeg', override = false, overrideReceptor = false, forceIngreso = false) {
    const body = { imageBase64, mimeType };
    if (override) body.override = true;
    if (overrideReceptor) body.override_receptor = true;
    if (forceIngreso) body.force_ingreso = true;
    return req('/api/app/expenses', { method: 'POST', body });
  },
  confirmExpense(id) { return req(`/api/app/expenses/${id}/confirm`, { method: 'POST' }); },
  updateExpense(id, patch) { return req(`/api/app/expenses/${id}`, { method: 'PATCH', body: patch }); },
  rejectExpense(id) { return req(`/api/app/expenses/${id}/reject`, { method: 'POST' }); },
  annulExpense(id) { return req(`/api/app/expenses/${id}/anular`, { method: 'POST' }); },
  listExpenses() { return req('/api/app/expenses'); },
  // Descarga a Excel los movimientos filtrados (manda los IDs visibles). Abre el .xlsx.
  async exportExpensesAbrir(ids) {
    const t = getToken();
    const res = await fetch(`${API_BASE}/api/app/expenses/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({ ids: ids || [] }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const fileName = 'movimientos.xlsx';

    // ¿App nativa (Android/Capacitor)? El WebView NO descarga blobs: escribimos el
    // archivo con Filesystem y abrimos el diálogo de compartir/abrir (Sheets, Drive…).
    let isNative = false;
    try { const { Capacitor } = await import('@capacitor/core'); isNative = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (_) {}

    if (isNative) {
      try {
        const base64 = await blobToBase64(blob);
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        try { await Share.share({ title: 'Movimientos', text: 'Movimientos exportados (Excel)', url: written.uri }); }
        catch (_e) { /* el usuario cerró el diálogo: el archivo ya quedó guardado */ }
        return true;
      } catch (_e) { return false; }
    }

    // Navegador (localhost / web): descarga clásica.
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (_e) {
      try { window.open(url, '_blank'); } catch (_e2) { window.location.href = url; }
    }
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 4000);
    return true;
  },
  async fotoUrl(id) {
    const t = getToken();
    const res = await fetch(`${API_BASE}/api/app/expenses/${id}/foto`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // K.A.L.Y. agent endpoints
  agentSession() { return req('/api/app/agent/session', { method: 'POST', body: {} }); },
  agentPrefs(patch) { return req('/api/app/agent/prefs', { method: 'PATCH', body: patch }); },
  getAgentPrefs() { return req('/api/app/agent/prefs'); },
  pagarExpense(id) { return req(`/api/app/expenses/${id}/pagar`, { method: 'PATCH' }); },
  // Cambia estado de pago en ambos sentidos: pagada <-> pendiente de pago.
  setPagoEstado(id, pagada) { return req(`/api/app/expenses/${id}/pago`, { method: 'PATCH', body: { pagada } }); },
  resumenWhatsapp() { return req('/api/app/agent/resumen-whatsapp', { method: 'POST', body: {} }); },
  createManualExpense(data) { return req('/api/app/expenses/manual', { method: 'POST', body: data }); },

  // Match (conciliación de cartola)
  matchCartola(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/match/cartola', { method: 'POST', body: { imageBase64, mimeType } }); },
  matchConfirmar(ids) { return req('/api/app/match/confirmar', { method: 'POST', body: { ids } }); },
  matchConfirmarAsiento(asiento) { return req('/api/app/match/asiento/confirmar', { method: 'POST', body: asiento }); },
  matchLibroSii(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/match/libro-sii', { method: 'POST', body: { imageBase64, mimeType } }); },
  matchCrearMovimiento(doc) { return req('/api/app/match/sii/crear-movimiento', { method: 'POST', body: doc }); },

  // VARAS — reportes contables (lectura)
  contabilidadDiario(periodo) { return req('/api/app/contabilidad/diario?periodo=' + encodeURIComponent(periodo || '')); },
  contabilidadMayor(periodo) { return req('/api/app/contabilidad/mayor?periodo=' + encodeURIComponent(periodo || '')); },
  contabilidadBalance(periodo) { return req('/api/app/contabilidad/balance?periodo=' + encodeURIComponent(periodo || '')); },
  contabilidadFlujo(periodo) { return req('/api/app/contabilidad/flujo?periodo=' + encodeURIComponent(periodo || '')); },

  // VARAS — chat conversacional
  varasChat(messages) { return req('/api/app/varas/chat', { method: 'POST', body: { messages } }); },
  varasAccion(tipo, args) { return req('/api/app/varas/accion', { method: 'POST', body: { tipo, args } }); },
  varasTool(name, args) { return req('/api/app/varas/tool', { method: 'POST', body: { name, args } }); },

  // VARAS — asientos manuales
  listCuentasApp() { return req('/api/app/cuentas'); },
  crearAsientoManual(body) { return req('/api/app/asientos/manual', { method: 'POST', body }); },
  anularAsiento(id) { return req(`/api/app/asientos/${id}/anular`, { method: 'POST' }); },

  // Chat (bandeja CRM omnicanal)
  chatConversaciones() { return req('/api/app/chat/conversaciones'); },
  chatMensajes(channel, contact) { return req(`/api/app/chat/conversacion?channel=${encodeURIComponent(channel || '')}&contact=${encodeURIComponent(contact || '')}`); },
  chatContacto(channel, contact) { return req(`/api/app/chat/contacto?channel=${encodeURIComponent(channel || '')}&contact=${encodeURIComponent(contact || '')}`); },
  chatContactoGuardar({ channel, contact, email, ubicacion, notas }) { return req('/api/app/chat/contacto', { method: 'PATCH', body: { channel, contact, email, ubicacion, notas } }); },
  chatResponderImagen({ channel, contact, imageBase64, mimeType, caption }) { return req('/api/app/chat/responder-imagen', { method: 'POST', body: { channel, contact, imageBase64, mimeType, caption } }); },
  pedidoDesdeConversacion(channel, contact, conversation) {
    return req('/api/app/overlay/pedido/suggest', { method: 'POST', body: { channel, contact: { name: contact }, conversation } });
  },

  // Onboarding / empresa
  getCompany() { return req('/api/app/company'); },
  updateCompany(patch) { return req('/api/app/company', { method: 'PATCH', body: patch }); },

  // Catálogo de productos
  listProducts(incluirPausados = false) { return req('/api/app/products' + (incluirPausados ? '?incluirPausados=1' : '')); },
  getProduct(id) { return req(`/api/app/products/${id}`); },
  createProduct(data) { return req('/api/app/products', { method: 'POST', body: data }); },
  updateProduct(id, patch) { return req(`/api/app/products/${id}`, { method: 'PATCH', body: patch }); },
  setProductoActivo(id, activo) { return req(`/api/app/products/${id}/activo`, { method: 'PATCH', body: { activo } }); },

  // Catálogo desde foto
  catalogExtraer(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/catalog/extraer', { method: 'POST', body: { imageBase64, mimeType } }); },
  crearProductosBulk(productos) { return req('/api/app/products/bulk', { method: 'POST', body: { productos } }); },

  // VARAS — Auxiliares (insumos) por línea
  getExpenseLineas(id) { return req(`/api/app/expenses/${id}/lineas`); },
  listAuxiliaresApp() { return req('/api/app/auxiliares'); },
  setLineaAuxiliar(lineaId, auxiliar_id) { return req(`/api/app/lineas/${lineaId}`, { method: 'PATCH', body: { auxiliar_id } }); },

  // KALY — chat de texto (HTTP, no la sesión de voz) + memoria personalizada
  kalyChat(messages) { return req('/api/app/kaly/chat', { method: 'POST', body: { messages } }); },
  kalyMemorias() { return req('/api/app/kaly/memoria'); },
  kalyRecordar(m) { return req('/api/app/kaly/memoria', { method: 'POST', body: m }); },
  kalyBorrarMemoria(id) { return req(`/api/app/kaly/memoria/${id}`, { method: 'DELETE' }); },
  kalyAprender(payload) { return req('/api/app/kaly/aprender', { method: 'POST', body: payload }); },

  // Pedido desde catálogo
  pedidoFromCatalog(payload) { return req('/api/app/pedido/from-catalog', { method: 'POST', body: payload }); },
  getPedidoConfig() { return req('/api/app/pedido-config'); },
  setPedidoConfig(cfg) { return req('/api/app/pedido-config', { method: 'PATCH', body: cfg }); },
  comunas() { return req('/api/app/comunas'); },

  // PDF del pedido
  async pedidoPdfBlob(id) {
    const t = getToken();
    const res = await fetch(`${API_BASE}/api/app/pedido/${id}/pdf`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) return null;
    return res.blob();
  },
  async pedidoPdfAbrir(id) {
    const blob = await this.pedidoPdfBlob(id);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    try { window.open(url, '_blank'); } catch (_e) { window.location.href = url; }
    return true;
  },

  // ── BSP / Onboarding (Hash IA como Tech Provider de WhatsApp) ───
  async register({ nombre_negocio, nombre_owner, email, password, owner_whatsapp }) {
    const data = await req('/api/onboarding/register', {
      method: 'POST', auth: false,
      body: { nombre_negocio, nombre_owner, email, password, owner_whatsapp },
    });
    if (data && data.token) setToken(data.token);
    return data;
  },
  registerPersonal({ nombre, email, password, sueldo_mensual, dia_pago }) {
    return req('/api/onboarding/register-personal', { method: 'POST', auth: false, body: { nombre, email, password, sueldo_mensual, dia_pago } });
  },
  personalResumen() {
    return req('/api/app/personal/resumen');
  },
  async loginOwner(email, password) {
    // Login del owner (usuario tabla `users`, no tabla `employees`).
    const data = await req('/api/panel/login', { method: 'POST', body: { email, password }, auth: false });
    if (data && data.token) setToken(data.token);
    return data;
  },
  // Suscripción (solo lectura — para gestionar ir al panel web)
  suscripcion() { return req('/api/app/suscripcion'); },

  // Recuperación de contraseña: envía el link por correo y/o WhatsApp. Cubre tanto
  // cuentas de empresa (owner) como personales (empleado). Siempre responde ok.
  forgotPassword(identificador) {
    return req('/api/onboarding/forgot-password', { method: 'POST', auth: false, body: { identificador } });
  },
  // Login social nativo: el plugin obtiene el token del proveedor en el teléfono y
  // el backend lo verifica (mismo endpoint que usa la web). Crea/encuentra la cuenta.
  async loginGoogle(idToken, tipo) {
    const data = await req('/api/onboarding/oauth/google', { method: 'POST', auth: false, body: { idToken, tipo } });
    if (data && data.token) setToken(data.token);
    return data;
  },
  async loginFacebook(accessToken, tipo) {
    const data = await req('/api/onboarding/oauth/facebook', { method: 'POST', auth: false, body: { accessToken, tipo } });
    if (data && data.token) setToken(data.token);
    return data;
  },
  // Guarda el ingreso de una cuenta personal creada por login social (saltable).
  personalIncome(sueldo_mensual) {
    return req('/api/onboarding/personal-income', { method: 'POST', body: { sueldo_mensual } });
  },
  bspStatus() { return req('/api/onboarding/bsp-status'); },
  connectWhatsApp({ code, phone_number_id, waba_id, register, pin, label }) {
    return req('/api/onboarding/connect/whatsapp', {
      method: 'POST',
      body: { code, phone_number_id, waba_id, register, pin, label },
    });
  },
  connectFacebook({ userToken, code }) {
    return req('/api/onboarding/connect/facebook', { method: 'POST', body: { userToken, code } });
  },
};
