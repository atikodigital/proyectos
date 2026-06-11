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
  listExpenses() { return req('/api/app/expenses'); },
};
