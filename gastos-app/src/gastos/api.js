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

export const api = {
  async login(usuario, password) {
    const data = await req('/api/app/login', { method: 'POST', body: { usuario, password }, auth: false });
    setToken(data.token);
    return data;
  },
  createExpense(imageBase64, mimeType = 'image/jpeg', override = false) {
    const body = { imageBase64, mimeType };
    if (override) body.override = true;
    return req('/api/app/expenses', { method: 'POST', body });
  },
  confirmExpense(id) { return req(`/api/app/expenses/${id}/confirm`, { method: 'POST' }); },
  updateExpense(id, patch) { return req(`/api/app/expenses/${id}`, { method: 'PATCH', body: patch }); },
  rejectExpense(id) { return req(`/api/app/expenses/${id}/reject`, { method: 'POST' }); },
  annulExpense(id) { return req(`/api/app/expenses/${id}/anular`, { method: 'POST' }); },
  listExpenses() { return req('/api/app/expenses'); },
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
  pagarExpense(id) { return req(`/api/app/expenses/${id}/pagar`, { method: 'PATCH' }); },
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

  // Chat (bandeja CRM omnicanal)
  chatConversaciones() { return req('/api/app/chat/conversaciones'); },
  chatMensajes(channel, contact) { return req(`/api/app/chat/conversacion?channel=${encodeURIComponent(channel || '')}&contact=${encodeURIComponent(contact || '')}`); },
  pedidoDesdeConversacion(channel, contact, conversation) {
    return req('/api/app/overlay/pedido/suggest', { method: 'POST', body: { channel, contact: { name: contact }, conversation } });
  },

  // Catálogo de productos
  listProducts(incluirPausados = false) { return req('/api/app/products' + (incluirPausados ? '?incluirPausados=1' : '')); },
  getProduct(id) { return req(`/api/app/products/${id}`); },
  createProduct(data) { return req('/api/app/products', { method: 'POST', body: data }); },
  updateProduct(id, patch) { return req(`/api/app/products/${id}`, { method: 'PATCH', body: patch }); },
  setProductoActivo(id, activo) { return req(`/api/app/products/${id}/activo`, { method: 'PATCH', body: { activo } }); },

  // Catálogo desde foto
  catalogExtraer(imageBase64, mimeType = 'image/jpeg') { return req('/api/app/catalog/extraer', { method: 'POST', body: { imageBase64, mimeType } }); },
  crearProductosBulk(productos) { return req('/api/app/products/bulk', { method: 'POST', body: { productos } }); },

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
};
