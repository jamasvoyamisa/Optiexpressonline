/**
 * API HTTP para modo web (mismo origen que el servidor Express).
 * Si Electron ya expuso window.api (preload), no hace nada.
 */
(function () {
  if (window.api && typeof window.api.login === 'function') {
    return;
  }

  /** Tras nginx en /cotizaciones/, las peticiones van a /cotizaciones/api/... */
  const BASE = (function () {
    try {
      const p = (window.location.pathname || '').toLowerCase();
      if (p === '/cotizaciones' || p.startsWith('/cotizaciones/')) return '/cotizaciones';
    } catch (_) {}
    return '';
  })();

  async function apiJson(path, init = {}) {
    const headers = { ...(init.headers || {}) };
    if (init.body !== undefined && typeof init.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(BASE + path, {
      ...init,
      credentials: 'include',
      headers,
    });
    const ct = r.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) {
      data = await r.json();
    } else {
      data = await r.text();
    }
    if (!r.ok) {
      const err = typeof data === 'object' && data && data.error ? data.error : (typeof data === 'string' ? data : r.statusText);
      throw new Error(err);
    }
    return data;
  }

  window.__cotizLogEs = null;
  window.__cotizLogCallback = null;

  window.api = {
    getSession: () => apiJson('/api/auth/session'),
    login: (username, password) => apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => apiJson('/api/auth/logout', { method: 'POST' }),

    getProducts: (category, search) =>
      apiJson(`/api/products/${encodeURIComponent(category)}?search=${encodeURIComponent(search || '')}`),

    addProduct: (category, product) =>
      apiJson(`/api/products/${encodeURIComponent(category)}`, { method: 'POST', body: JSON.stringify(product) }),

    updateProduct: (category, product) =>
      apiJson(`/api/products/${encodeURIComponent(category)}/${product.id}`, { method: 'PUT', body: JSON.stringify(product) }),

    deleteProduct: (category, id) =>
      apiJson(`/api/products/${encodeURIComponent(category)}/${id}`, { method: 'DELETE' }),

    searchClients: (query) =>
      apiJson(`/api/clients/search?q=${encodeURIComponent(query || '')}`),

    addClient: (client) => apiJson('/api/clients', { method: 'POST', body: JSON.stringify(client) }),
    updateClient: (client) => apiJson(`/api/clients/${client.id}`, { method: 'PUT', body: JSON.stringify(client) }),
    deleteClient: (id) => apiJson(`/api/clients/${id}`, { method: 'DELETE' }),

    quotationAddItem: (item) => apiJson('/api/quotation/add-item', { method: 'POST', body: JSON.stringify(item) }),
    quotationRemoveItem: (index) => apiJson('/api/quotation/remove-item', { method: 'POST', body: JSON.stringify({ index }) }),
    quotationSetClient: (client) => apiJson('/api/quotation/set-client', { method: 'POST', body: JSON.stringify(client) }),
    quotationSetAsesor: (asesor) =>
      apiJson('/api/quotation/set-asesor', {
        method: 'POST',
        body: JSON.stringify({ asesor: typeof asesor === 'string' ? asesor : String(asesor ?? '') }),
      }),
    quotationSetOptions: (options) => apiJson('/api/quotation/set-options', { method: 'POST', body: JSON.stringify(options) }),
    quotationGet: () => apiJson('/api/quotation'),
    quotationReset: () => apiJson('/api/quotation/reset', { method: 'POST' }),
    quotationGetNextId: () => apiJson('/api/quotation/next-id'),
    quotationFinalize: (data) => apiJson('/api/quotation/finalize', { method: 'POST', body: JSON.stringify(data) }),

    quotationExportPDF: async (data) => {
      const r = await fetch(BASE + '/api/quotation/export-pdf', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        let msg = r.statusText;
        try {
          const j = await r.json();
          msg = j.error || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      const cd = r.headers.get('Content-Disposition') || '';
      let filename = 'cotizacion.pdf';
      const m = /filename="([^"]+)"/.exec(cd) || /filename=([^;]+)/.exec(cd);
      if (m) filename = m[1].trim().replace(/^["']|["']$/g, '');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      const idH = r.headers.get('X-Cotizacion-Id');
      const id = idH ? Number(idH) : null;
      return { path: null, id, canceled: false, downloaded: true };
    },

    getCotizaciones: () => apiJson('/api/cotizaciones'),
    getCotizacion: (id) => apiJson(`/api/cotizaciones/${id}`),
    deleteCotizacion: (id) => apiJson(`/api/cotizaciones/${id}`, { method: 'DELETE' }),

    importProducts: (category, items) =>
      apiJson('/api/import/products', { method: 'POST', body: JSON.stringify({ category, items }) }),

    importProductsXLSX: async (category, arrayBuffer) => {
      const r = await fetch(BASE + `/api/import/products-xlsx/${encodeURIComponent(category)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: arrayBuffer,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    },

    importClientes: (items) =>
      apiJson('/api/import/clientes', { method: 'POST', body: JSON.stringify({ items }) }),

    importClientesXLSX: async (arrayBuffer) => {
      const r = await fetch(BASE + '/api/import/clientes-xlsx', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: arrayBuffer,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    },

    usersList: (query) => apiJson(`/api/users?q=${encodeURIComponent(query || '')}`),
    usersCreate: (user) => apiJson('/api/users', { method: 'POST', body: JSON.stringify(user) }),
    usersUpdate: (user) => apiJson(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(user) }),
    usersDelete: (id) => apiJson(`/api/users/${id}`, { method: 'DELETE' }),

    systemGetLogs: () => apiJson('/api/system/logs'),
    systemClearLogs: () => apiJson('/api/system/logs/clear', { method: 'POST' }),

    systemSubscribeLogs: () => {
      if (window.__cotizLogEs) return;
      window.__cotizLogEs = new EventSource(BASE + '/api/system/logs/stream');
      window.__cotizLogEs.onmessage = (ev) => {
        try {
          const entry = JSON.parse(ev.data);
          window.__cotizLogCallback?.(entry);
        } catch (_) {}
      };
      window.__cotizLogEs.onerror = () => {
        try { window.__cotizLogEs?.close(); } catch (_) {}
        window.__cotizLogEs = null;
      };
    },

    systemUnsubscribeLogs: () => {
      try { window.__cotizLogEs?.close(); } catch (_) {}
      window.__cotizLogEs = null;
    },

    onSystemLogAppended: (cb) => {
      window.__cotizLogCallback = cb;
    },

    getAppVersion: async () => {
      const j = await apiJson('/api/app/version');
      return typeof j === 'object' && j && j.version ? j.version : String(j || '1.1.0');
    },

    /** Público: indica si hay variables MySQL sin exponer secretos */
    getConfigStatus: () => apiJson('/api/config/status'),

    configGetEnv: () => apiJson('/api/config/env'),
    configTestDB: (cfg) => apiJson('/api/config/test-db', { method: 'POST', body: JSON.stringify(cfg) }),
    configSaveEnv: (cfg) => apiJson('/api/config/save-env', { method: 'POST', body: JSON.stringify(cfg) }),
  };
})();
