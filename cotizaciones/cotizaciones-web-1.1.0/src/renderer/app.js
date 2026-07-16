(() => {
  // Opcional: Eliminar el elemento 'brand' con JavaScript al cargar la app
  document.querySelector('.sidebar .brand')?.remove();

  const navButtons = document.querySelectorAll('nav button');
  const modules = document.querySelectorAll('.module');
  const modalAdd = document.getElementById('modal-add-product');
  const formAdd = document.getElementById('form-add-product');
  const saveProductBtn = document.getElementById('save-product');
  const formImageInput = () => document.querySelector('#form-add-product input[name="imagen"]');
  const addProductTitle = () => document.querySelector('#form-add-product h3');
  const removeImageInput = () => document.querySelector('#form-add-product input[name="removeImage"]');
  const clientModal = document.getElementById('modal-client');
  const clientSearch = document.getElementById('client-search');
  const clientList = document.getElementById('client-list');
  const clientHeader = document.querySelector('#modal-client .client-list-header');
  const newClientBtn = document.getElementById('new-client-btn');
  const newClientModal = document.getElementById('modal-new-client');
  const newClientForm = document.getElementById('form-new-client');
  const newClientSaveBtn = document.getElementById('new-client-save');
  const newClientCancelBtn = document.getElementById('new-client-cancel');
  const ncNombre = document.getElementById('new-client-nombre');
  const ncRFC = document.getElementById('new-client-rfc');
  const ncTel = document.getElementById('new-client-telefono');
  const ncEmail = document.getElementById('new-client-email');
  const ncDir = document.getElementById('new-client-direccion');
  let editingClient = null;
  let clientResults = [];
  let sortKey = 'nombre';
  let sortDir = 'asc';
  // (revert) sin estado adicional de orden/paginación

  // Estado de edición de producto y apertura de modal
  let editingProduct = null;
  // Categoría capturada al abrir el modal (para evitar errores si se navega antes de guardar)
  let modalCategory = null;

  // --- Autenticación y gating de UI ---
  const loginView = document.getElementById('login-view');
  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const userBar = document.getElementById('user-bar');
  const userNameEl = document.getElementById('user-name');
  const userRoleEl = document.getElementById('user-role');
  const logoutBtn = document.getElementById('logout-btn');
  const layoutEl = document.querySelector('.layout');
  let currentSession = null;

  function normalizePrefijoDepartamento(raw) {
    const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s ? s.slice(0, 12) : 'DEA';
  }
  function prefijoCotizacionSesion() {
    return normalizePrefijoDepartamento(currentSession?.departamento);
  }
  function formatRefCotizacion(id, prefijo) {
    const px = prefijo !== undefined && prefijo !== null && prefijo !== ''
      ? normalizePrefijoDepartamento(prefijo)
      : prefijoCotizacionSesion();
    const idPart = id === undefined || id === null ? 'nuevo' : id;
    return `${px}-COT-${idPart}`;
  }

  // Animaciones de login: helpers
  const loginCardEl = document.querySelector('.login-card');

  function animateShowLogin() {
    setVisible(loginView, true);
    try {
      loginCardEl?.classList.add('enter');
      setTimeout(() => loginCardEl?.classList.remove('enter'), 450);
    } catch (_) {}
  }
  function animateHideLogin() {
    return new Promise((resolve) => {
      try {
        loginCardEl?.classList.add('closing');
        loginView?.classList.add('closing');
        setTimeout(() => {
          loginCardEl?.classList.remove('closing');
          loginView?.classList.remove('closing');
          setVisible(loginView, false);
          resolve();
        }, 420);
      } catch (_) {
        setVisible(loginView, false);
        resolve();
      }
    });
  }

  function isAdmin() { return !!currentSession && String(currentSession.role) === 'admin'; }
  function setVisible(el, show) { if (!el) return; el.style.display = show ? '' : 'none'; }
  function updateUserBar() {
    if (currentSession && (currentSession.username || currentSession.name)) {
      setVisible(userBar, true);
      if (userNameEl) userNameEl.textContent = String(currentSession.name || currentSession.username);
      if (userRoleEl) userRoleEl.textContent = String(currentSession.role || 'user');
    } else {
      setVisible(userBar, false);
    }
  }
  function applyRoleGating() {
    const configNavBtn = document.querySelector('nav button[data-module="configuracion"]');
    setVisible(configNavBtn, isAdmin());

    // Botones principales de "Agregar"
    setVisible(document.getElementById('add-equipos-btn'), isAdmin());
    setVisible(document.getElementById('add-lc-btn'), isAdmin());
    setVisible(document.getElementById('add-insumos-btn'), isAdmin());
    setVisible(document.getElementById('add-acc-btn'), isAdmin());
    setVisible(document.getElementById('add-soluciones_lc-btn'), isAdmin());

    // Botones de Configuración (agregar e importar)
    [
      'config-add-equipos-btn','import-equipos-btn',
      'config-add-lc-btn','config-import-lc-btn',
      'config-add-soluciones_lc-btn','config-import-soluciones_lc-btn',
      'config-add-insumos-btn','config-import-insumos-btn',
      'config-add-accesorios-btn','config-import-accesorios-btn',
      'config-add-clientes-btn','config-import-clientes-btn',
      'import-clientes-btn'
    ].forEach((id) => setVisible(document.getElementById(id), isAdmin()));

    // Botón "Nuevo cliente" dentro del modal de selección
    setVisible(document.getElementById('new-client-btn'), isAdmin());
  }
  const SESSION_CHECK_MS = 15000;

  function hideAuthBootScreen() {
    const boot = document.getElementById('auth-boot-screen');
    if (!boot) return;
    boot.hidden = true;
    boot.setAttribute('aria-hidden', 'true');
    boot.style.display = 'none';
    const label = boot.querySelector('.auth-boot-text');
    if (label) label.textContent = '';
  }

  async function initAuthUI() {
    try {
      if (window.api?.getSession) {
        let res;
        try {
          res = await Promise.race([
            window.api.getSession(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('session-timeout')), SESSION_CHECK_MS)),
          ]);
        } catch (_) {
          res = { ok: false };
        }
        if (res?.ok && res?.user) {
          currentSession = res.user;
          setVisible(loginView, false);
          setVisible(layoutEl, true);
          updateUserBar();
          applyRoleGating();
          try {
            const asesorName = String(currentSession?.name || currentSession?.username || '');
            await window.api?.quotationSetAsesor?.(asesorName);
            if (asesorInput) asesorInput.value = asesorName;
          } catch (_) {}
        } else {
          setVisible(layoutEl, false);
          animateShowLogin();
        }
      } else {
        // Sin API de sesión (p. ej. HTML estático): no exponer la aplicación sin backend
        setVisible(layoutEl, false);
        animateShowLogin();
      }
    } catch (_) {
      currentSession = null;
      setVisible(layoutEl, false);
      animateShowLogin();
    } finally {
      document.body.classList.add('auth-session-ready');
      document.getElementById('auth-boot-screen')?.setAttribute('aria-busy', 'false');
      hideAuthBootScreen();
    }

    loginForm?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const u = loginUsername?.value?.trim();
      const p = loginPassword?.value || '';
      if (!u || !p) { alert('Ingresa usuario y contraseña'); return; }
      if (!window.api?.login) { alert('No hay API disponible. Usa la app de escritorio (npm start) o el servidor web (npm run web).'); return; }
      const loginSubmit = document.getElementById('login-submit');
      // Estado de carga
      try {
        if (loginSubmit) { loginSubmit.disabled = true; loginSubmit.classList.add('btn-loading'); }
        if (loginUsername) loginUsername.disabled = true;
        if (loginPassword) loginPassword.disabled = true;

        const res = await window.api.login(u, p);
        if (!res?.ok) {
          alert(res?.error ? `Error: ${res.error}` : 'Credenciales inválidas');
          return;
        }
        currentSession = res.user;
        await animateHideLogin();
        setVisible(layoutEl, true);
        updateUserBar();
        applyRoleGating();
        try {
          const asesorName = String(currentSession?.name || currentSession?.username || '');
          await window.api?.quotationSetAsesor?.(asesorName);
          if (asesorInput) asesorInput.value = asesorName;
        } catch (_) {}
      } finally {
        // Restablecer el estado de carga solo si seguimos en la vista de login (fallo o cancelación)
        if (loginView?.style?.display !== 'none') {
          if (loginSubmit) { loginSubmit.disabled = false; loginSubmit.classList.remove('btn-loading'); }
          if (loginUsername) loginUsername.disabled = false;
          if (loginPassword) loginPassword.disabled = false;
        }
      }
    });

    logoutBtn?.addEventListener('click', async () => {
      try { if (window.api?.logout) await window.api.logout(); } catch (_) {}
      currentSession = null;
      setVisible(layoutEl, false);
      animateShowLogin();
      // Resetear y re-habilitar el formulario de login para poder ingresar nuevos datos
      try { loginForm?.reset?.(); } catch (_) {}
      if (loginUsername) { loginUsername.disabled = false; loginUsername.value = ''; }
      if (loginPassword) { loginPassword.disabled = false; loginPassword.value = ''; }
      const loginSubmit = document.getElementById('login-submit');
      if (loginSubmit) { loginSubmit.disabled = false; loginSubmit.classList.remove('btn-loading'); }
      loginUsername?.focus?.();
      updateUserBar();
    });
  }

  // Setup inicial: si faltan variables de DB, mostrar asistente
  const setupView = document.getElementById('setup-view');
  const setupForm = document.getElementById('setup-form');
  const setupHost = document.getElementById('db-host');
  const setupPort = document.getElementById('db-port');
  const setupUser = document.getElementById('db-user');
  const setupPass = document.getElementById('db-password');
  const setupDb = document.getElementById('db-name');
  const setupSSL = document.getElementById('db-ssl');
  const setupTestBtn = document.getElementById('setup-test');
  const setupSaveBtn = document.getElementById('setup-save');
  const setupResult = document.getElementById('setup-result');

  function initSetupOrAuth() {
    void (async () => {
      try {
        const st = await window.api?.getConfigStatus?.();
        if (st && st.configured === false) {
          console.warn('Cotizaciones: faltan variables MYSQL_* en .env del servidor.');
        }
      } catch (_) {}
    })();
    initAuthUI();
  }

  const CONFIG_TAB_STORAGE_KEY = 'cotizaciones-config-tab';
  /** Solo listas de productos en Configuración (pestañas): ítems por página */
  const CONFIG_LIST_PAGE_SIZE = 25;

  function initConfigTabs() {
    const tablist = document.querySelector('#mod-configuracion .config-tabs');
    if (!tablist) return;
    const tabs = tablist.querySelectorAll('.config-tab');
    const panels = document.querySelectorAll('#mod-configuracion .config-tab-panel');
    const valid = new Set(Array.from(panels).map((p) => p.dataset.panel));

    function activateTab(name) {
      if (!valid.has(name)) name = 'equipos';
      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      panels.forEach((p) => {
        const on = p.dataset.panel === name;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
      try { localStorage.setItem(CONFIG_TAB_STORAGE_KEY, name); } catch (_) {}
    }

    tabs.forEach((t) => {
      t.addEventListener('click', () => {
        activateTab(t.dataset.tab);
        const panel = document.querySelector(`#mod-configuracion .config-tab-panel[data-panel="${t.dataset.tab}"]`);
        const inp = panel?.querySelector('.panel-header input');
        inp?.focus?.();
      });
    });

    let initial = 'equipos';
    try { initial = localStorage.getItem(CONFIG_TAB_STORAGE_KEY) || 'equipos'; } catch (_) {}
    activateTab(initial);
  }

  initSetupOrAuth();
  initConfigTabs();

  setupTestBtn?.addEventListener('click', async () => {
    try {
      setupResult && (setupResult.style.display = '');
      setupResult && (setupResult.textContent = 'Probando conexión...');
      const res = await window.api?.configTestDB?.({
        host: setupHost?.value?.trim(),
        port: Number(setupPort?.value || 3306),
        user: setupUser?.value?.trim(),
        password: setupPass?.value || '',
        database: setupDb?.value?.trim(),
        ssl: !!setupSSL?.checked,
      });
      if (res?.ok) {
        setupResult && (setupResult.textContent = 'Conexión exitosa.');
      } else {
        setupResult && (setupResult.textContent = `Error: ${res?.error || 'No se pudo conectar'}`);
      }
    } catch (err) {
      setupResult && (setupResult.style.display = '');
      setupResult && (setupResult.textContent = `Error: ${err?.message || err}`);
    }
  });

  setupSaveBtn?.addEventListener('click', async () => {
    try {
      const cfg = {
        host: setupHost?.value?.trim(),
        port: Number(setupPort?.value || 3306),
        user: setupUser?.value?.trim(),
        password: setupPass?.value || '',
        database: setupDb?.value?.trim(),
        ssl: !!setupSSL?.checked,
      };
      const res = await window.api?.configSaveEnv?.(cfg);
      if (res?.ok) {
        alert(res?.restartRequired
          ? 'Configuración guardada en .env. Reinicia el proceso del servidor (npm run web / pm2) para aplicar los cambios de base de datos.'
          : 'Configuración guardada. Reinicia la aplicación para aplicar cambios.');
      } else {
        alert(res?.error ? `Error al guardar: ${res.error}` : 'No se pudo guardar la configuración');
      }
    } catch (err) {
      alert(`Error: ${err?.message || err}`);
    }
  });

  function openAddModalForCreate(categoryOverride) {
    editingProduct = null;
    modalCategory = categoryOverride || currentCategory;
    formAdd.reset();
    const titleEl = addProductTitle();
    if (titleEl) titleEl.textContent = 'Agregar producto';
    const imgInput = formImageInput();
    if (imgInput) { imgInput.value = ''; imgInput.disabled = false; }
    const rem = removeImageInput();
    if (rem) { rem.checked = false; rem.disabled = true; }
    modalAdd.showModal();
    try {
      const firstInput = formAdd?.querySelector('input[name="nombre"]');
      firstInput?.focus();
      firstInput?.select?.();
    } catch (_) {}
  }

  function openAddModalForEdit(item, categoryOverride) {
    editingProduct = item;
    modalCategory = categoryOverride || currentCategory;
    const titleEl = addProductTitle();
    if (titleEl) titleEl.textContent = 'Editar producto';
    const nombreEl = formAdd.querySelector('input[name="nombre"]');
    const precioEl = formAdd.querySelector('input[name="precio"]');
    if (nombreEl) nombreEl.value = item.nombre || '';
    if (precioEl) precioEl.value = Number(item.precio || 0);
    const imgInput = formImageInput();
    if (imgInput) { imgInput.value = ''; imgInput.disabled = false; }
    const rem = removeImageInput();
    if (rem) { rem.checked = false; rem.disabled = false; }
    modalAdd.showModal();
    try {
      const firstInput = formAdd?.querySelector('input[name="nombre"]');
      firstInput?.focus();
      firstInput?.select?.();
    } catch (_) {}
  }

  const quotationItems = document.getElementById('quotation-items');
  const quotationTotal = document.getElementById('quotation-total');
  const finalizeBtn = document.getElementById('finalize-quotation');
  const exportBtn = document.getElementById('export-pdf');
  const selectClientBtn = document.getElementById('select-client-btn');
  const asesorInput = document.getElementById('asesor-input');
  const cotizacionesList = document.getElementById('cotizaciones-list');
  const crearCotizacionBtn = document.getElementById('crear-cotizacion-btn');
  const detalleModal = document.getElementById('modal-detalle-cotizacion');
  const detalleContent = document.getElementById('detalle-cotizacion-content');
  const detalleNumeroEl = document.getElementById('detalle-numero');
  const detalleCloseBtn = document.getElementById('detalle-close');
  const selectedClientInfo = document.getElementById('selected-client-info');
  // Header global: fecha actual y versión
  const currentDateEl = document.getElementById('current-date');
  const appVersionEl = document.getElementById('app-version');
  // Estado del botón Crear: solo habilitado si hay cliente y al menos un producto
  function updateCrearButtonState(state) {
    try {
      const s = state || {};
      const hasItems = Array.isArray(s.items) && s.items.length > 0;
      const c = s.cliente || null;
      const hasClient = !!c && (c.id != null || !!c.nombre || !!c.rfc || !!c.RFC);
      if (crearCotizacionBtn) {
        const enabled = hasClient && hasItems;
        crearCotizacionBtn.disabled = !enabled;
        let tip = '';
        if (!hasClient && !hasItems) tip = 'Selecciona un cliente y agrega al menos un producto';
        else if (!hasClient) tip = 'Selecciona un cliente';
        else if (!hasItems) tip = 'Agrega al menos un producto';
        else tip = 'Listo para crear cotización';
        // Removemos cualquier atributo de tooltip para no mostrar mensajes en hover
        try { crearCotizacionBtn.removeAttribute('data-tooltip'); } catch (_){/* noop */}
        try { crearCotizacionBtn.removeAttribute('title'); } catch (_){/* noop */}
        crearCotizacionBtn.setAttribute('aria-disabled', String(!enabled));
        // Limpieza: ya no se usa contenedor externo de tooltip, el botón maneja el tooltip
      }
    } catch (_) {}
  }
  if (crearCotizacionBtn) crearCotizacionBtn.disabled = true;
  function setCurrentDate() {
    try {
      const now = new Date();
      const formatted = now.toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      if (currentDateEl) {
        currentDateEl.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
      }
    } catch (e) { /* noop */ }
  }
  setCurrentDate();
  {
    const versionPromise = window.api?.getAppVersion?.();
    if (versionPromise && typeof versionPromise.then === 'function') {
      versionPromise
        .then(v => { if (appVersionEl) appVersionEl.textContent = v ? `Versión v${v}` : ''; })
        .catch(() => { if (appVersionEl) appVersionEl.textContent = 'Versión v1.1.0'; });
    } else {
      if (appVersionEl) appVersionEl.textContent = 'Versión v1.1.0';
    }
  }
  // Actualización automática de fecha a medianoche
  function scheduleDateAutoUpdate() {
    try {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      const ms = nextMidnight.getTime() - now.getTime();
      setTimeout(() => {
        setCurrentDate();
        scheduleDateAutoUpdate();
      }, ms);
    } catch (e) { /* noop */ }
  }
  scheduleDateAutoUpdate();
  // Configuración: importar equipos CSV
  const importEquiposBtn = document.getElementById('import-equipos-btn');
  const equiposFileInput = document.getElementById('equipos-file-input');
  const importClientesBtn = document.getElementById('import-clientes-btn');
  const clientesFileInput = document.getElementById('clientes-file-input');

  let currentCategory = 'equipos';

  // --- Sistema: visor de logs en Configuración ---
  const sysLogsContainer = document.getElementById('system-logs');
  const sysRealtimeChk = document.getElementById('system-logs-realtime');
  const sysClearBtn = document.getElementById('system-logs-clear');
  const sysSearchInput = document.getElementById('system-logs-search');
  const sysCopyBtn = document.getElementById('system-logs-copy');
  const sysExportBtn = document.getElementById('system-logs-export');
  const sysPrevBtn = document.getElementById('system-logs-page-prev');
  const sysNextBtn = document.getElementById('system-logs-page-next');
  const sysPageInfo = document.getElementById('system-logs-page-info');

  let sysUnsubscribeUI = null; // función para remover listener de append
  let sysSubscribed = false;
  let sysBuf = [];
  let sysFilter = '';
  let sysPage = 0;
  let sysPageSize = 200;

  function formatLogLine(entry) {
    try {
      const ts = String(entry?.ts || '').replace('T', ' ').replace('Z', '');
      const level = String(entry?.level || '').toUpperCase();
      const src = String(entry?.source || '');
      const msg = String(entry?.message || '');
      const meta = entry && 'meta' in entry ? entry.meta : undefined;
      const metaText = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
      const line = document.createElement('div');
      line.className = `log-line log-level-${level}`;
      line.textContent = `[${ts}] [${level}] [${src}] ${msg}${metaText}`;
      return line;
    } catch (_) {
      const line = document.createElement('div');
      line.className = 'log-line';
      line.textContent = String(entry);
      return line;
    }
  }
  function entryMatchesFilter(entry) {
    if (!sysFilter) return true;
    try {
      const hay = `${entry?.ts} ${entry?.level} ${entry?.source} ${entry?.message} ${JSON.stringify(entry?.meta ?? '')}`.toLowerCase();
      return hay.includes(sysFilter.toLowerCase());
    } catch (_) { return true; }
  }
  function renderSystemLogsUI() {
    if (!sysLogsContainer) return;
    sysLogsContainer.textContent = '';
    const filtered = sysBuf.filter(entryMatchesFilter);
    const totalPages = Math.max(1, Math.ceil(filtered.length / sysPageSize));
    if (sysPage >= totalPages) sysPage = totalPages - 1;
    const start = sysPage * sysPageSize;
    const end = start + sysPageSize;
    const pageItems = filtered.slice(start, end);
    pageItems.forEach((e) => sysLogsContainer.appendChild(formatLogLine(e)));
    sysPageInfo && (sysPageInfo.textContent = `Página ${totalPages ? (sysPage + 1) : 1}/${totalPages}`);
    const viewingLast = sysPage === (totalPages - 1);
    if (viewingLast) {
      try { sysLogsContainer.scrollTop = sysLogsContainer.scrollHeight; } catch (_) {}
    }
  }
  async function renderSystemLogsBuffer() {
    if (!sysLogsContainer) return;
    try {
      const buf = await window.api?.systemGetLogs?.();
      sysBuf = Array.isArray(buf) ? buf : [];
      sysPage = Math.max(0, Math.ceil(sysBuf.filter(entryMatchesFilter).length / sysPageSize) - 1);
      renderSystemLogsUI();
    } catch (e) {
      sysBuf = [];
      const err = document.createElement('div');
      err.className = 'log-line log-level-ERROR';
      err.textContent = `Error cargando logs: ${e?.message || e}`;
      sysLogsContainer.appendChild(err);
    }
  }
  function ensureSubscription(active) {
    if (!sysLogsContainer || !window.api?.onSystemLogAppended) return;
    if (active && !sysSubscribed) {
      try { window.api?.systemSubscribeLogs?.(); } catch (_) {}
      sysUnsubscribeUI = window.api.onSystemLogAppended((entry) => {
        try {
          sysBuf.push(entry);
          // Si estamos en la última página respecto al filtro, renderizar de nuevo
          const filteredLen = sysBuf.filter(entryMatchesFilter).length;
          const totalPages = Math.max(1, Math.ceil(filteredLen / sysPageSize));
          const viewingLast = sysPage === (totalPages - 1);
          if (viewingLast) renderSystemLogsUI();
        } catch (_) {}
      });
      sysSubscribed = true;
    } else if (!active && sysSubscribed) {
      try { window.api?.systemUnsubscribeLogs?.(); } catch (_) {}
      try { sysUnsubscribeUI?.(); } catch (_) {}
      sysUnsubscribeUI = null;
      sysSubscribed = false;
    }
  }
  sysClearBtn?.addEventListener('click', async () => {
    try { await window.api?.systemClearLogs?.(); } catch (_) {}
    sysBuf = [];
    sysPage = 0;
    renderSystemLogsUI();
  });
  sysRealtimeChk?.addEventListener('change', () => ensureSubscription(!!sysRealtimeChk.checked));
  sysSearchInput?.addEventListener('input', () => { sysFilter = sysSearchInput.value || ''; sysPage = 0; renderSystemLogsUI(); });
  sysPrevBtn?.addEventListener('click', () => { if (sysPage > 0) { sysPage -= 1; renderSystemLogsUI(); } });
  sysNextBtn?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(sysBuf.filter(entryMatchesFilter).length / sysPageSize));
    if (sysPage < (totalPages - 1)) { sysPage += 1; renderSystemLogsUI(); }
  });
  sysCopyBtn?.addEventListener('click', async () => {
    try {
      const filtered = sysBuf.filter(entryMatchesFilter);
      const lines = filtered.map((e) => {
        const ts = String(e?.ts || '').replace('T', ' ').replace('Z', '');
        const level = String(e?.level || '').toUpperCase();
        const src = String(e?.source || '');
        const msg = String(e?.message || '');
        const meta = e && 'meta' in e ? e.meta : undefined;
        const metaText = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
        return `[${ts}] [${level}] [${src}] ${msg}${metaText}`;
      }).join('\n');
      await navigator.clipboard?.writeText(lines);
    } catch (_) {}
  });
  sysExportBtn?.addEventListener('click', () => {
    try {
      const filtered = sysBuf.filter(entryMatchesFilter);
      const lines = filtered.map((e) => {
        const ts = String(e?.ts || '').replace('T', ' ').replace('Z', '');
        const level = String(e?.level || '').toUpperCase();
        const src = String(e?.source || '');
        const msg = String(e?.message || '');
        const meta = e && 'meta' in e ? e.meta : undefined;
        const metaText = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
        return `[${ts}] [${level}] [${src}] ${msg}${metaText}`;
      }).join('\n');
      const blob = new Blob([lines], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const name = `logs_${now.toISOString().replace(/[:.]/g, '-')}.txt`;
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    } catch (_) {}
  });

  // Navegación de módulos sin animación (cambio instantáneo)
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = `mod-${btn.dataset.module}`;
      const target = document.getElementById(targetId);
      const current = document.querySelector('.module.visible');

      if (!target || current === target) return;

      if (current) {
        current.classList.remove('visible'); // Ocultar actual
      }

      target.classList.add('visible'); // Mostrar nuevo

      currentCategory = btn.dataset.module;
      refreshList();
      if (currentCategory === 'cotizaciones') {
        refreshCotizaciones();
        document.body.classList.add('cotizaciones-mode');
      } else {
        document.body.classList.remove('cotizaciones-mode');
      }
      // Ocultar cotización también en Configuración
      if (currentCategory === 'configuracion') {
        document.body.classList.add('configuracion-mode');
        try { const us = document.getElementById('config-users-search'); if (us) us.value = ''; refreshUsers?.(); } catch (_) {}
        // Sistema: iniciar render del buffer y suscripción según checkbox
        renderSystemLogsBuffer();
        ensureSubscription(!!sysRealtimeChk?.checked);
      } else {
        document.body.classList.remove('configuracion-mode');
        // Sistema: pausar suscripción al salir del módulo
        ensureSubscription(false);
      }
      // Enfocar y seleccionar el buscador del módulo activo
      try {
        let searchInput;
        if (btn.dataset.module === 'configuracion') {
          const activePanel = document.querySelector('#mod-configuracion .config-tab-panel:not([hidden])');
          searchInput = activePanel?.querySelector('.panel-header input');
        } else {
          searchInput = document.querySelector(`#mod-${btn.dataset.module} .panel-header input`);
        }
        searchInput?.focus();
        searchInput?.select?.();
      } catch (_) {}
    });
  });

  // Equipos: búsqueda y agregar
  const equiposSearch = document.getElementById('search-equipos');
  const equiposList = document.getElementById('equipos-list');
  const addEquiposBtn = document.getElementById('add-equipos-btn');

  equiposSearch.addEventListener('input', () => refreshList());
  addEquiposBtn.addEventListener('click', () => openAddModalForCreate());

  // Lentes de contacto
  const lcSearch = document.getElementById('search-lc');
  const lcList = document.getElementById('lc-list');
  const addLcBtn = document.getElementById('add-lc-btn');
  lcSearch.addEventListener('input', () => refreshList());
  addLcBtn.addEventListener('click', () => openAddModalForCreate());


  // Accesorios
  const accSearch = document.getElementById('search-acc');
  const accList = document.getElementById('acc-list');
  const addAccBtn = document.getElementById('add-acc-btn');
  accSearch.addEventListener('input', () => refreshList());
  addAccBtn.addEventListener('click', () => openAddModalForCreate());

  // Soluciones LC
  const solSearch = document.getElementById('search-soluciones_lc');
  const solList = document.getElementById('soluciones_lc-list');
  const addSolBtn = document.getElementById('add-soluciones_lc-btn');
  solSearch?.addEventListener('input', () => refreshList());
  addSolBtn?.addEventListener('click', () => openAddModalForCreate());

  // Insumos
  const insSearch = document.getElementById('search-insumos');
  const insList = document.getElementById('insumos-list');
  const addInsBtn = document.getElementById('add-insumos-btn');
  insSearch?.addEventListener('input', () => refreshList());
  addInsBtn?.addEventListener('click', () => openAddModalForCreate());

  // Crear nueva cotización: abre el modal de detalle (solo si hay cliente e ítems)
  crearCotizacionBtn?.addEventListener('click', async () => {
    try {
      const q = await window.api?.quotationGet?.();
      const hasItems = Array.isArray(q?.items) && q.items.length > 0;
      const c = q?.cliente || null;
      const hasClient = !!c && (c.id != null || !!c.nombre || !!c.rfc || !!c.RFC);
      if (!hasClient || !hasItems) {
        alert('Selecciona un cliente y agrega al menos un producto antes de crear la cotización.');
        return;
      }

      // Asegurar asesor por defecto al nombre del usuario logueado
      try {
        const defaultAsesor = String(currentSession?.name || currentSession?.username || '');
        if (!q?.asesor) await window.api?.quotationSetAsesor?.(defaultAsesor);
        if (asesorInput) asesorInput.value = defaultAsesor;
      } catch (_) {}

      // Obtener consecutivo provisional antes de renderizar para incluirlo en "Datos"
      let nextId = null;
      let nxtResp = null;
      if (window.api?.quotationGetNextId) {
        try {
          nxtResp = await window.api.quotationGetNextId();
          nextId = nxtResp?.nextId || null;
        } catch (_) {}
      }
      if (detalleNumeroEl) {
        const px = nxtResp?.prefijoCotizacion != null
          ? normalizePrefijoDepartamento(nxtResp.prefijoCotizacion)
          : prefijoCotizacionSesion();
        detalleNumeroEl.textContent = formatRefCotizacion(nextId, px);
      }
      await renderDetalleCotizacion();
      // Abrir el modal con tolerancia (fallback a show()/open)
      try { detalleModal?.showModal(); }
      catch (_) { try { detalleModal?.show?.(); } catch (__){ detalleModal?.setAttribute?.('open',''); } }
    } catch (err) {
      console.error(err);
    }
  });

  function closeDetalleWithAnimation() {
    if (!detalleModal) return;
    detalleModal.classList.add('closing');
    setTimeout(() => {
      detalleModal.classList.remove('closing');
      try { detalleModal.close(); } catch (_) {}
    }, 420);
  }
  detalleCloseBtn?.addEventListener('click', () => closeDetalleWithAnimation());
  detalleModal?.addEventListener('cancel', (e) => { e.preventDefault(); closeDetalleWithAnimation(); });

  // Importación de Equipos (CSV)
  importEquiposBtn?.addEventListener('click', () => {
    equiposFileInput?.click();
  });

  // Importación de Clientes (CSV/XLSX)
  importClientesBtn?.addEventListener('click', () => {
    clientesFileInput?.click();
  });

  clientesFileInput?.addEventListener('change', async () => {
    const file = clientesFileInput.files?.[0];
    if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      let items = [];
      if (name.endsWith('.csv')) {
        const text = await file.text();
        items = parseClientesCSV(text);
        if (!items.length) {
          alert('El archivo CSV no contiene filas válidas. Se espera: nombre,RFC,telefono,email,direccion');
          return;
        }
        const res = await window.api?.importClientes?.(items);
        if (!res) {
          alert('No se pudo comunicar con la aplicación de escritorio (Electron).');
          clientesFileInput.value = '';
          return;
        }
        if (res?.error) {
          alert(`Error al importar clientes: ${res.error}`);
        } else {
          alert(`Importación de clientes completada. Filas insertadas: ${res?.inserted ?? 0}`);
        }
        clientesFileInput.value = '';
        return;
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importClientesXLSX?.(buf);
        if (!res) {
          alert('No se pudo comunicar con la aplicación de escritorio (Electron).');
          clientesFileInput.value = '';
          return;
        }
        if (res?.error) {
          alert(`Error al importar clientes: ${res.error}`);
        } else {
          alert(`Importación de clientes completada. Filas insertadas: ${res?.inserted ?? 0}`);
        }
        clientesFileInput.value = '';
        return;
      } else {
        alert('Tipo de archivo no soportado. Usa .csv o .xlsx');
        clientesFileInput.value = '';
        return;
      }
    } catch (err) {
      alert(`Error durante la importación de clientes: ${err?.message || err}`);
      console.error(err);
    }
  });

  equiposFileInput?.addEventListener('change', async () => {
    const file = equiposFileInput.files?.[0];
    if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      let items = [];
      if (name.endsWith('.csv')) {
        const text = await file.text();
        items = parseEquiposCSV(text);
        if (!items.length) {
          alert('El archivo CSV no contiene filas válidas.');
          return;
        }
        const res = await window.api?.importProducts?.('equipos', items);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
        equiposFileInput.value = '';
        if (currentCategory === 'equipos') { refreshList(); }
        return;
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importProductsXLSX?.('equipos', buf);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
        equiposFileInput.value = '';
        if (currentCategory === 'equipos') { refreshList(); }
        return;
      } else {
        alert('Tipo de archivo no soportado. Usa .csv o .xlsx');
        equiposFileInput.value = '';
        return;
      }
    } catch (err) {
      alert('Error durante la importación de equipos');
      console.error(err);
    }
  });

  // Importación: Lentes de Contacto
  const configImportLcBtn = document.getElementById('config-import-lc-btn');
  const configImportLcFile = document.getElementById('config-import-lc-file');
  configImportLcBtn?.addEventListener('click', () => { configImportLcFile?.click(); });
  configImportLcFile?.addEventListener('change', async () => {
    const file = configImportLcFile.files?.[0]; if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv')) {
        const text = await file.text();
        const items = parseEquiposCSV(text);
        if (!items.length) { alert('El archivo CSV no contiene filas válidas.'); configImportLcFile.value = ''; return; }
        const res = await window.api?.importProducts?.('lentes_contacto', items);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importProductsXLSX?.('lentes_contacto', buf);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else {
        alert('Tipo de archivo no soportado. Usa .csv o .xlsx');
      }
      configImportLcFile.value = '';
      await refreshConfigLcList();
      if (currentCategory === 'lentes_contacto') { await refreshList(); }
    } catch (err) {
      alert('Error durante la importación de lentes de contacto');
      console.error(err);
    }
  });

  // Importación: Soluciones LC
  const configImportSolBtn = document.getElementById('config-import-soluciones_lc-btn');
  const configImportSolFile = document.getElementById('config-import-soluciones_lc-file');
  configImportSolBtn?.addEventListener('click', () => { configImportSolFile?.click(); });
  configImportSolFile?.addEventListener('change', async () => {
    const file = configImportSolFile.files?.[0]; if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv')) {
        const text = await file.text();
        const items = parseEquiposCSV(text);
        if (!items.length) { alert('El archivo CSV no contiene filas válidas.'); configImportSolFile.value = ''; return; }
        const res = await window.api?.importProducts?.('soluciones_lc', items);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importProductsXLSX?.('soluciones_lc', buf);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else {
        alert('Tipo de archivo no soportado. Usa .csv o .xlsx');
      }
      configImportSolFile.value = '';
      await refreshConfigSolList();
      if (currentCategory === 'soluciones_lc') { await refreshList(); }
    } catch (err) {
      alert('Error durante la importación de soluciones LC');
      console.error(err);
    }
  });

  // Importación: Insumos
  const configImportInsBtn = document.getElementById('config-import-insumos-btn');
  const configImportInsFile = document.getElementById('config-import-insumos-file');
  configImportInsBtn?.addEventListener('click', () => { configImportInsFile?.click(); });
  configImportInsFile?.addEventListener('change', async () => {
    const file = configImportInsFile.files?.[0]; if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv')) {
        const text = await file.text();
        const items = parseEquiposCSV(text);
        if (!items.length) { alert('El archivo CSV no contiene filas válidas.'); configImportInsFile.value = ''; return; }
        const res = await window.api?.importProducts?.('insumos', items);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importProductsXLSX?.('insumos', buf);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else {
        alert('Tipo de archivo no soportado. Usa .csv o .xlsx');
      }
      configImportInsFile.value = '';
      await refreshConfigInsList();
      if (currentCategory === 'insumos') { await refreshList(); }
    } catch (err) {
      alert('Error durante la importación de insumos');
      console.error(err);
    }
  });

  // Importación: Accesorios
  const configImportAccBtn = document.getElementById('config-import-accesorios-btn');
  const configImportAccFile = document.getElementById('config-import-accesorios-file');
  configImportAccBtn?.addEventListener('click', () => { configImportAccFile?.click(); });
  configImportAccFile?.addEventListener('change', async () => {
    const file = configImportAccFile.files?.[0]; if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv')) {
        const text = await file.text();
        const items = parseEquiposCSV(text);
        if (!items.length) { alert('El archivo CSV no contiene filas válidas.'); configImportAccFile.value = ''; return; }
        const res = await window.api?.importProducts?.('accesorios', items);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importProductsXLSX?.('accesorios', buf);
        alert(`Importación completada. Filas insertadas: ${res?.inserted ?? 0}`);
      } else {
        alert('Tipo de archivo no soportado. Usa .csv o .xlsx');
      }
      configImportAccFile.value = '';
      await refreshConfigAccList();
      if (currentCategory === 'accesorios') { await refreshList(); }
    } catch (err) {
      alert('Error durante la importación de accesorios');
      console.error(err);
    }
  });

  function parseEquiposCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // soporta formato simple: nombre,precio
      const parts = line.split(',');
      if (parts.length < 2) continue;
      let nombre = (parts[0] || '').trim();
      let precioStr = (parts[1] || '').trim();
      // manejar coma decimal
      precioStr = precioStr.replace(',', '.');
      const precio = parseFloat(precioStr);
      if (!nombre || Number.isNaN(precio)) continue;
      items.push({ nombre, precio });
    }
    // si primera línea parece cabecera, la descartamos
    if (items.length && /^nombre$/i.test(lines[0].split(',')[0]?.trim())) {
      // volver a parsear ignorando la primera línea
      const dataLines = lines.slice(1);
      const again = dataLines.map(l => l.trim()).filter(Boolean).map((line) => {
        const parts = line.split(',');
        if (parts.length < 2) return null;
        let nombre = (parts[0] || '').trim();
        let precioStr = (parts[1] || '').trim().replace(',', '.');
        const precio = parseFloat(precioStr);
        if (!nombre || Number.isNaN(precio)) return null;
        return { nombre, precio };
      }).filter(Boolean);
      return again;
    }
    return items;
  }

  function parseClientesCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 2) continue; // al menos nombre y RFC
      const nombre = (parts[0] || '').trim();
      const rfc = (parts[1] || '').trim();
      const telefono = (parts[2] || '').trim();
      const email = (parts[3] || '').trim();
      const direccion = (parts[4] || '').trim();
      if (!nombre) continue;
      rows.push({ nombre, rfc, telefono, email, direccion });
    }
    // si la primera línea es cabecera, omitirla
    const firstParts = (lines[0] || '').split(',');
    const first0 = (firstParts[0] || '').trim();
    const first1 = (firstParts[1] || '').trim();
    if (/^nombre$/i.test(first0) || /^RFC$/i.test(first1)) {
      const dataLines = lines.slice(1);
      const again = [];
      for (const line of dataLines) {
        const l = line.trim();
        if (!l) continue;
        const parts = l.split(',');
        if (parts.length < 2) continue;
        const nombre = (parts[0] || '').trim();
        const rfc = (parts[1] || '').trim();
        const telefono = (parts[2] || '').trim();
        const email = (parts[3] || '').trim();
        const direccion = (parts[4] || '').trim();
        if (!nombre) continue;
        again.push({ nombre, rfc, telefono, email, direccion });
      }
      return again;
    }
    return rows;
  }


  // Guardar producto
  saveProductBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const fd = new FormData(formAdd);
    const nombre = fd.get('nombre');
    const precio = parseFloat(fd.get('precio'));
    const imgFile = formImageInput()?.files?.[0] || null;
    const imagenDataUrl = imgFile ? await fileToDataURL(imgFile) : undefined; // undefined: no cambia imagen
    const removeImgChecked = removeImageInput()?.checked || false;
    if (!nombre || Number.isNaN(precio)) return;
    try {
      const category = modalCategory || currentCategory;
      if (editingProduct && window.api?.updateProduct) {
        const imagenSignal = removeImgChecked ? null : imagenDataUrl; // null: quitar imagen; undefined: no cambia; string: nueva imagen
        await window.api.updateProduct(category, { id: editingProduct.id, nombre, precio, imagen: imagenSignal });
      } else if (window.api?.addProduct) {
        await window.api.addProduct(category, { nombre, precio, imagen: imagenDataUrl || null });
      }
      modalAdd.close();
      formAdd.reset();
      editingProduct = null;
      modalCategory = null;
      const rem = removeImageInput();
      if (rem) { rem.checked = false; rem.disabled = true; }
      refreshList();
      if (configEquiposList) { refreshConfigEquiposList(); }
    } catch (err) {
      alert('Error al guardar producto');
      console.error(err);
    }
  });

  // Selección de cliente
  selectClientBtn.addEventListener('click', () => {
    clientModal.showModal();
    clientSearch.value = '';
    clientList.innerHTML = '';
    clientResults = [];
    sortKey = 'nombre';
    sortDir = 'asc';
    try { clientSearch?.focus(); clientSearch?.select?.(); } catch (_) {}
  });

  // Abrir modal de nuevo cliente desde el botón en el título
  newClientBtn?.addEventListener('click', () => {
    try {
      editingClient = null;
      newClientForm?.reset();
      const titleEl = newClientForm?.querySelector('h3');
      if (titleEl) titleEl.textContent = 'Nuevo cliente';
      newClientModal?.showModal();
      try { ncNombre?.focus(); ncNombre?.select?.(); } catch (_) {}
    } catch (err) {
      console.error(err);
    }
  });

  // Cerrar modal de nuevo cliente
  newClientCancelBtn?.addEventListener('click', () => newClientModal?.close());

  // Guardar nuevo cliente y seleccionarlo en la cotización
  newClientSaveBtn?.addEventListener('click', async () => {
    try {
      if (!isAdmin()) { alert('No autorizado'); return; }
      const nombre = (ncNombre?.value || '').trim();
      const rfcRaw = (ncRFC?.value || '').trim();
      const rfc = rfcRaw.replace(/-/g, '').replace(/\s+/g, '').toUpperCase();
      const telefono = (ncTel?.value || '').trim();
      const email = (ncEmail?.value || '').trim();
      const direccion = (ncDir?.value || '').trim();
      if (!nombre) {
        alert('El nombre del cliente es obligatorio');
        return;
      }
      if (editingClient && editingClient.id) {
        const res = await window.api?.updateClient?.({ id: editingClient.id, nombre, rfc: rfc || null, telefono: telefono || null, email: email || null, direccion: direccion || null });
        if (!res || res?.error) {
          alert(`Error al actualizar cliente${res?.error ? ': ' + res.error : ''}`);
          return;
        }
        // Actualizar el objeto en resultados y re-renderizar lista
        const idx = clientResults.findIndex((x) => x.id === editingClient.id);
        if (idx >= 0) {
          clientResults[idx] = { ...clientResults[idx], nombre, rfc, telefono, email, direccion };
        }
        renderClientList();
        // Si el cliente editado está seleccionado actualmente, actualizar el bloque
        try {
          const q = await window.api?.quotationGet?.();
          const sel = q?.cliente;
          if (sel && sel.id === editingClient.id && selectedClientInfo) {
            selectedClientInfo.innerHTML = `<strong>Cliente:</strong> ${nombre}<br/><strong>RFC:</strong> ${rfc || ''}`;
          }
        } catch (e) { /* noop */ }
        editingClient = null;
        newClientModal?.close();
        alert('Cliente actualizado');
      } else {
        const res = await window.api?.addClient?.({ nombre, rfc: rfc || null, telefono: telefono || null, email: email || null, direccion: direccion || null });
        if (!res || res?.error) {
          alert(`Error al guardar cliente${res?.error ? ': ' + res.error : ''}`);
          return;
        }
        const c = { id: res.id, nombre, rfc, telefono, email, direccion };
        await window.api?.quotationSetClient?.(c);
        if (selectedClientInfo) {
          selectedClientInfo.innerHTML = `<strong>Cliente:</strong> ${c.nombre || ''}<br/><strong>RFC:</strong> ${c.rfc || ''}`;
        }
        newClientModal?.close();
        closeClientWithAnimation();
        alert('Cliente creado y seleccionado en la cotización');
      }
    } catch (err) {
      alert('Error inesperado al guardar cliente');
      console.error(err);
    }
  });

  function closeClientWithAnimation() {
    if (!clientModal) return;
    clientModal.classList.add('closing');
    setTimeout(() => {
      clientModal.classList.remove('closing');
      try { clientModal.close(); } catch (_) {}
    }, 420);
  }
  document.getElementById('client-close').addEventListener('click', () => closeClientWithAnimation());
  clientModal?.addEventListener('cancel', (e) => { e.preventDefault(); closeClientWithAnimation(); });

  clientSearch.addEventListener('input', async () => {
    const q = clientSearch.value.trim();
    try {
      clientResults = window.api?.searchClients ? await window.api.searchClients(q) : [];
      renderClientList();
    } catch (err) {
      console.error(err);
    }
  });

  // Orden por columnas (Nombre, RFC) sin paginación
  clientHeader?.addEventListener('click', (e) => {
    const target = e.target.closest('.sortable');
    if (!target) return;
    const key = target.getAttribute('data-sort-key');
    if (!key) return;
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    renderClientList();
  });

  function renderClientList() {
    const items = [...clientResults].sort((a, b) => {
      const va = (a[sortKey] || '').toString().toLowerCase();
      const vb = (b[sortKey] || '').toString().toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    clientList.innerHTML = '';
    items.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'client-item';
      li.innerHTML = `
        <span class="c-name">${c.nombre || ''}</span>
        <span class="c-rfc">${c.rfc || ''}</span>
        <span>${c.telefono || ''}</span>
        <span>${c.email || ''}</span>
        <div class="client-actions">
          <button class="btn-icon edit-client-btn" title="Editar cliente" aria-label="Editar cliente">✎</button>
          <button class="btn-icon select-client-btn" title="Seleccionar" aria-label="Seleccionar">+</button>
        </div>
      `;
      li.querySelector('.select-client-btn')?.addEventListener('click', async () => {
        await window.api?.quotationSetClient(c);
        if (selectedClientInfo) {
          selectedClientInfo.innerHTML = `<strong>Cliente:</strong> ${c.nombre || ''}<br/><strong>RFC:</strong> ${c.rfc || ''}`;
        }
        try {
          const st = await window.api?.quotationGet?.();
          updateCrearButtonState(st);
        } catch (_) {}
        closeClientWithAnimation();
      });
      const editBtnEl = li.querySelector('.edit-client-btn');
      if (isAdmin()) {
        editBtnEl?.addEventListener('click', () => {
          try {
            // Preparar edición en el modal de nuevo/editar cliente
            editingClient = c;
            if (newClientForm) {
              const titleEl = newClientForm.querySelector('h3');
              if (titleEl) titleEl.textContent = 'Editar cliente';
            }
            if (ncNombre) ncNombre.value = c.nombre || '';
            if (ncRFC) ncRFC.value = c.rfc || '';
            if (ncTel) ncTel.value = c.telefono || '';
            if (ncEmail) ncEmail.value = c.email || '';
            if (ncDir) ncDir.value = c.direccion || '';
            newClientModal?.showModal();
            try { ncNombre?.focus(); ncNombre?.select?.(); } catch (_) {}
          } catch (err) {
            console.error(err);
          }
        });
      } else {
        if (editBtnEl) editBtnEl.style.display = 'none';
      }
      clientList.appendChild(li);
    });
  }

  // Actualizar info de cliente seleccionado al cargar
  (async () => {
    try {
      const q = await window.api?.quotationGet?.();
      const c = q?.cliente;
      if (selectedClientInfo) {
        if (c && (c.nombre || c.rfc)) {
          selectedClientInfo.innerHTML = `<strong>Cliente:</strong> ${c.nombre || ''}<br/><strong>RFC:</strong> ${c.rfc || ''}`;
        } else {
          selectedClientInfo.innerHTML = '<strong>Cliente:</strong> Sin cliente seleccionado';
        }
      }
      updateCrearButtonState(q);
    } catch (err) {
      // silencioso
    }
  })();

  asesorInput?.addEventListener('change', async () => {
    await window.api?.quotationSetAsesor(asesorInput.value);
  });

  // Refrescar listas según categoría
  async function refreshList() {
    let searchVal = '';
    let listEl = null;
    let category = currentCategory;
    if (category === 'equipos') { searchVal = equiposSearch.value; listEl = equiposList; }
    if (category === 'lentes_contacto') { searchVal = lcSearch.value; listEl = lcList; }

    if (category === 'insumos') { searchVal = insSearch?.value || ''; listEl = insList; }
    if (category === 'accesorios') { searchVal = accSearch.value; listEl = accList; }
    if (category === 'soluciones_lc') { searchVal = solSearch?.value || ''; listEl = solList; }
    if (!listEl) return;
    listEl.innerHTML = '';
    const q = (searchVal || '').trim();
    // Evitar cargar resultados en arranque o sin búsqueda para no saturar la vista
    if (q.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Escribe para buscar productos…';
      listEl.appendChild(li);
      return;
    }
    try {
      const items = window.api?.getProducts ? await window.api.getProducts(category, q) : [];
      items.forEach((it) => {
        const li = document.createElement('li');
        // Contenedor izquierdo (miniatura + información)
        const left = document.createElement('div');
        left.className = 'item-left';
        // Miniatura si está disponible
        if (it.imagen) {
          const img = document.createElement('img');
          img.className = 'thumb';
          img.alt = it.nombre || 'Producto';
          img.loading = 'lazy';
          img.src = it.imagen;
          left.appendChild(img);
        }
        const info = document.createElement('div');
        info.className = 'item-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'item-name';
        nameEl.textContent = it.nombre;
        info.appendChild(nameEl);
        left.appendChild(info);
        li.appendChild(left);
        const actions = document.createElement('div');
        actions.className = 'item-actions';
        const priceEl = document.createElement('span');
        priceEl.className = 'item-price';
        priceEl.textContent = `$${Number(it.precio).toFixed(2)}`;
        const addBtn = document.createElement('button');
        addBtn.textContent = 'Agregar';
        addBtn.addEventListener('click', async () => {
          await window.api?.quotationAddItem({ nombre: it.nombre, precio: it.precio });
          await refreshQuotation();
        });
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Editar';
        editBtn.addEventListener('click', () => openAddModalForEdit(it));
        actions.appendChild(priceEl);
        actions.appendChild(addBtn);
        const noEditCategories = ['equipos','lentes_contacto','soluciones_lc','insumos','accesorios'];
        if (!noEditCategories.includes(category)) actions.appendChild(editBtn);
        li.appendChild(actions);
        listEl.appendChild(li);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Utilidad: convertir archivo a data URL
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function refreshQuotation() {
    try {
      const q = window.api?.quotationGet ? await window.api.quotationGet() : { items: [] };
      quotationItems.innerHTML = '';

      // Agrupar ítems iguales por nombre+precio para mostrar cantidad
      const groups = new Map();
      (q.items || []).forEach((it, idx) => {
        const key = `${it.nombre}__${Number(it.precio).toFixed(2)}`;
        if (!groups.has(key)) {
          groups.set(key, { item: it, indices: [idx], count: 1 });
        } else {
          const g = groups.get(key);
          g.indices.push(idx);
          g.count += 1;
        }
      });

      // Renderizar filas agrupadas con controles -, cantidad, + y subtotal a la derecha
      groups.forEach((g) => {
        const row = document.createElement('div');
        row.className = 'quotation-item';

        // Nombre del producto (izquierda)
        const nameEl = document.createElement('span');
        nameEl.className = 'qi-name';
        nameEl.textContent = g.item.nombre;
        row.appendChild(nameEl);

        // Controles de cantidad (centro)
        const qtyControls = document.createElement('div');
        qtyControls.className = 'quantity-controls';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'qty-btn minus';
        minusBtn.textContent = '-';
        minusBtn.title = 'Quitar una unidad';
        minusBtn.addEventListener('click', async () => {
          // Quitar una unidad: eliminar uno de los índices del grupo
          const indexToRemove = g.indices[0];
          if (typeof indexToRemove === 'number') {
            await window.api?.quotationRemoveItem(indexToRemove);
            await refreshQuotation();
          }
        });

        const qtyInput = document.createElement('input');
        qtyInput.className = 'qty-input';
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = String(g.count);
        qtyInput.readOnly = true; // solo mostrar cantidad; ajustar con +/-
        // ancho y estilos controlados por CSS (.qty-input); sin ajuste dinámico en JS

        const plusBtn = document.createElement('button');
        plusBtn.className = 'qty-btn plus';
        plusBtn.textContent = '+';
        plusBtn.title = 'Agregar una unidad';
        plusBtn.addEventListener('click', async () => {
          await window.api?.quotationAddItem({ nombre: g.item.nombre, precio: g.item.precio });
          await refreshQuotation();
        });

        qtyControls.appendChild(minusBtn);
        qtyControls.appendChild(qtyInput);
        qtyControls.appendChild(plusBtn);
        row.appendChild(qtyControls);

        // Subtotal (derecha): precio unitario * cantidad
        const priceEl = document.createElement('span');
        priceEl.className = 'qi-price';
        const unit = Number(g.item.precio) || 0;
        const subtotal = unit * g.count;
        priceEl.textContent = `$${subtotal.toFixed(2)}`;
        priceEl.title = `${g.count} × $${unit.toFixed(2)}`;
        row.appendChild(priceEl);

        quotationItems.appendChild(row);
      });

      const total = (q.items || []).reduce((acc, it) => acc + Number(it.precio || 0), 0);
      quotationTotal.textContent = `Total: $${total.toFixed(2)}`;
      updateCrearButtonState(q);
      try { quotationItems.scrollTop = quotationItems.scrollHeight; } catch (_) {}
    } catch (err) {
      console.error(err);
    }
  }

  // Renderizar detalle dentro del modal
  async function renderDetalleCotizacion() {
    try {
      const q = await window.api?.quotationGet?.();
      const cliente = q?.cliente || null;
      const asesor = q?.asesor || '';
      const items = Array.isArray(q?.items) ? q.items : [];
      const numeroTexto = (detalleNumeroEl?.textContent || '').trim();

      // Agrupar productos por nombre+precio para mostrar cantidad y subtotales
      const groups = new Map();
      items.forEach((it) => {
        const key = `${it.nombre}__${Number(it.precio).toFixed(2)}`;
        if (!groups.has(key)) {
          groups.set(key, { item: it, count: 1 });
        } else {
          const g = groups.get(key);
          g.count += 1;
        }
      });

      const total = items.reduce((acc, it) => acc + Number(it.precio || 0), 0);

      let html = '';
      // Sección: Datos del cliente / cotización
      html += '<div class="detalle-section">';
      html += '<h4>Datos</h4>';
      html += '<div class="detalle-data-grid">';
      html += '<div class="detalle-data-list">';
      if (numeroTexto) {
        html += `<div class="detalle-row"><span class="detalle-label">Número:</span><span class="detalle-value">${numeroTexto}</span></div>`;
      }
      if (cliente) {
        html += `<div class="detalle-row"><span class="detalle-label">Cliente:</span><span class="detalle-value">${cliente.nombre ?? ''}</span></div>`;
        if (cliente.RFC) html += `<div class="detalle-row"><span class="detalle-label">RFC:</span><span class="detalle-value">${cliente.RFC}</span></div>`;
        if (cliente.telefono) html += `<div class="detalle-row"><span class="detalle-label">Teléfono:</span><span class="detalle-value">${cliente.telefono}</span></div>`;
        if (cliente.email) html += `<div class="detalle-row"><span class="detalle-label">Email:</span><span class="detalle-value">${cliente.email}</span></div>`;
        if (cliente.direccion) html += `<div class="detalle-row"><span class="detalle-label">Dirección:</span><span class="detalle-value">${cliente.direccion}</span></div>`;
      } else {
        html += '<div class="detalle-row"><span class="detalle-label">Cliente:</span><span class="detalle-value">Sin cliente seleccionado</span></div>';
      }
      html += `<div class="detalle-row"><span class="detalle-label">Asesor:</span><span class="detalle-value">${asesor || '-'}</span></div>`;
      html += `<div class="detalle-row"><span class="detalle-label">Fecha:</span><span class="detalle-value">${new Date().toLocaleString()}</span></div>`;
      html += '</div>'; // cierre detalle-data-list
      html += '<div class="detalle-side">';
      html += '<h5>Opciones</h5>';
      html += '<div class="detalle-side-actions">';
      html += '<label class="detalle-option"><span>Agregar IVA (16%)</span><input type="checkbox" id="opt-iva" /></label>';
      html += '<label class="detalle-option"><span>Descuento (%)</span><input type="number" id="opt-desc-pct" min="0" max="100" step="1" placeholder="0" style="width:100px;margin-left:8px" /></label>';
  html += '<label class="detalle-option"><span>Envío ($)</span><input type="number" id="opt-envio" min="0" step="0.01" placeholder="0.00" style="width:100px;margin-left:8px" /></label>';
  html += '<label class="detalle-option"><span>Validez (días desde emisión)</span><input type="number" id="opt-valid-days" min="0" step="1" placeholder="0" style="width:100px;margin-left:8px" /></label>';
      html += '</div>';
      html += '</div>'; // cierre detalle-side
      html += '</div>'; // cierre detalle-data-grid
      html += '</div>';

      // Sección: Productos
      html += '<div class="detalle-section">';
      html += '<h4>Productos</h4>';
      if (!items.length) {
        html += '<div class="empty">Sin ítems en la cotización</div>';
      } else {
        html += '<table class="detalle-table">';
        html += '<thead><tr><th>Producto</th><th>Cant.</th><th>Precio Unit</th><th style="text-align:right">Subtotal</th></tr></thead>';
        html += '<tbody>';
        groups.forEach((g) => {
          const precio = Number(g.item.precio) || 0;
          const subtotal = precio * g.count;
          html += `<tr>
            <td>${g.item.nombre}</td>
            <td>${g.count}</td>
            <td>$${precio.toFixed(2)}</td>
            <td style="text-align:right">$${subtotal.toFixed(2)}</td>
          </tr>`;
        });
        html += '</tbody>';
        html += '</table>';
      }
      html += '</div>';

      // Sección: Notas para PDF
      html += '<div class="detalle-section">\n        <h4>Notas</h4>\n        <textarea id="detalle-notas" placeholder="Notas para incluir en el PDF" rows="4" style="width:100%"></textarea>\n      </div>';

      // Sección: Total con desglose
      html += `<div id="detalle-total-block" class="detalle-total-block">
        <div class="detalle-total-row"><span>Subtotal:</span><strong>$${total.toFixed(2)}</strong></div>
        <div class="detalle-total-row"><span>Descuento:</span><strong id="detalle-desc">-$0.00</strong></div>
        <div class="detalle-total-row"><span>Envío:</span><strong id="detalle-envio">$0.00</strong></div>
        <div class="detalle-total-row"><span>IVA (16%):</span><strong id="detalle-iva">$0.00</strong></div>
        <div class="detalle-total-row total-final"><span>Total:</span><strong id="detalle-total">$${total.toFixed(2)}</strong></div>
      </div>`;

      if (detalleContent) {
        detalleContent.innerHTML = html;
        const IVA_RATE = 0.16;
        const subtotal = total;
        const ivaCb = detalleContent.querySelector('#opt-iva');
        const descPctInput = detalleContent.querySelector('#opt-desc-pct');
        const envioInput = detalleContent.querySelector('#opt-envio');
        const descEl = detalleContent.querySelector('#detalle-desc');
        const envioEl = detalleContent.querySelector('#detalle-envio');
        const ivaEl = detalleContent.querySelector('#detalle-iva');
        const totalEl = detalleContent.querySelector('#detalle-total');
        const validDaysInput = detalleContent.querySelector('#opt-valid-days');
        const notasEl = detalleContent.querySelector('#detalle-notas');

        // Prefijar opciones desde estado si existen
        try {
          const opts = q?.options || {};
          if (ivaCb) ivaCb.checked = !!opts.iva;
          if (descPctInput && typeof opts.discountRate === 'number') {
            descPctInput.value = String(Math.round((opts.discountRate || 0) * 100));
          }
          if (envioInput && typeof opts.shippingAmount === 'number') {
            envioInput.value = String(opts.shippingAmount ?? '');
          }
          if (validDaysInput && typeof opts.validityDays === 'number') {
            validDaysInput.value = String(opts.validityDays ?? '');
          }
          if (notasEl && typeof opts.notes === 'string') {
            notasEl.value = opts.notes || '';
          }
        } catch (_) {}

        function recalc() {
          let discountRate = 0;
          if (descPctInput && typeof descPctInput.value === 'string') {
            const pct = Math.max(0, Math.min(100, Number(descPctInput.value)));
            discountRate = isNaN(pct) ? 0 : (pct / 100);
          }
          const discountAmount = Number((subtotal * discountRate).toFixed(2));
           const baseAfterDiscount = subtotal - discountAmount;
           let shippingAmount = 0;
           if (envioInput && typeof envioInput.value === 'string') {
             const amt = Number(envioInput.value);
             shippingAmount = isNaN(amt) ? 0 : Math.max(0, amt);
           }
           const basePlusShipping = baseAfterDiscount + shippingAmount;
           const ivaAmount = (ivaCb && ivaCb.checked) ? Number((basePlusShipping * IVA_RATE).toFixed(2)) : 0;
           const totalFinal = Number((basePlusShipping + ivaAmount).toFixed(2));
           if (descEl) descEl.textContent = `-$${discountAmount.toFixed(2)}`;
           if (envioEl) {
             envioEl.textContent = `$${shippingAmount.toFixed(2)}`;
             const row = envioEl.parentElement;
             if (row && row.style) row.style.display = shippingAmount > 0 ? '' : 'none';
           }
           if (ivaEl) ivaEl.textContent = `$${ivaAmount.toFixed(2)}`;
           if (totalEl) totalEl.textContent = `$${totalFinal.toFixed(2)}`;
        }
        ivaCb && ivaCb.addEventListener('change', recalc);
        descPctInput && descPctInput.addEventListener('input', recalc);
         envioInput && envioInput.addEventListener('input', recalc);

        recalc();
      }
    } catch (err) {
      console.error(err);
    }
  }

  finalizeBtn.addEventListener('click', async () => {
    try {
      // Leer opciones del modal
      const ivaSelected = !!document.getElementById('opt-iva')?.checked;
      const descPctEl = document.getElementById('opt-desc-pct');
      const validDaysEl = document.getElementById('opt-valid-days');
      const discountPct = descPctEl && typeof descPctEl.value === 'string' ? Number(descPctEl.value) : 0;
      const discountRate = isNaN(discountPct) ? 0 : Math.max(0, Math.min(100, discountPct)) / 100;
      const validityDays = (() => { const n = validDaysEl && typeof validDaysEl.value === 'string' ? Number(validDaysEl.value) : 0; return isNaN(n) ? 0 : Math.max(0, Math.floor(n)); })();
      const shippingEl = document.getElementById('opt-envio');
      const shippingRaw = shippingEl && typeof shippingEl.value === 'string' ? Number(shippingEl.value) : 0;
      const shippingAmount = isNaN(shippingRaw) ? 0 : Math.max(0, shippingRaw);
      const notasEl = document.getElementById('detalle-notas');
      const notas = notasEl && typeof notasEl.value === 'string' ? notasEl.value.trim() : '';

      const res = await window.api?.quotationFinalize({ iva: ivaSelected, discountRate, validityDays, shippingAmount, notes: notas });
      // Cerrar cualquier diálogo abierto ANTES de mostrar alertas
      document.querySelectorAll('dialog[open]')?.forEach((d) => { try { d.close(); } catch (_) {} });
      alert(`Cotización guardada. ID: ${res?.id || 'N/A'}`);
      if (res?.id && detalleNumeroEl) detalleNumeroEl.textContent = formatRefCotizacion(res.id, res.prefijoCotizacion);

      // Limpiar la cotización para comenzar una nueva
      await window.api?.quotationReset?.();
      if (selectedClientInfo) {
        selectedClientInfo.innerHTML = '<strong>Cliente:</strong> Sin cliente seleccionado';
      }

      await renderDetalleCotizacion();
      await refreshQuotation();
      await refreshCotizaciones();
      try {
        const st = await window.api?.quotationGet?.();
        updateCrearButtonState(st);
      } catch (_) {}
      // Enfocar el buscador de equipos para continuar trabajando
      equiposSearch?.focus();
    } catch (err) {
      alert('Error al guardar la cotización');
      console.error(err);
    }
  });

  exportBtn.addEventListener('click', async () => {
    try {
      if (!window.api?.quotationExportPDF) {
        alert('Exportación a PDF no disponible.');
        return;
      }
      // Cerrar cualquier diálogo HTML abierto antes de invocar el diálogo del sistema
      // Leer opciones del modal antes de cerrar (IVA, descuentos, etc.)
      const ivaSelected = !!document.getElementById('opt-iva')?.checked;
      const descPctEl = document.getElementById('opt-desc-pct');
      const validDaysEl = document.getElementById('opt-valid-days');
      const discountPct = descPctEl && typeof descPctEl.value === 'string' ? Number(descPctEl.value) : 0;
      const discountRate = isNaN(discountPct) ? 0 : Math.max(0, Math.min(100, discountPct)) / 100;
      const validityDays = (() => { const n = validDaysEl && typeof validDaysEl.value === 'string' ? Number(validDaysEl.value) : 0; return isNaN(n) ? 0 : Math.max(0, Math.floor(n)); })();
      const shippingEl = document.getElementById('opt-envio');
      const shippingRaw = shippingEl && typeof shippingEl.value === 'string' ? Number(shippingEl.value) : 0;
      const shippingAmount = isNaN(shippingRaw) ? 0 : Math.max(0, shippingRaw);
      // Capturar notas del modal antes de cerrar
      const notasEl = document.getElementById('detalle-notas');
      const notas = notasEl && typeof notasEl.value === 'string' ? notasEl.value.trim() : '';
      try { document.querySelectorAll('dialog[open]')?.forEach((d) => { try { d.close(); } catch (_) {} }); } catch (_){/* noop */}
      const q = await window.api?.quotationGet();
      const payload = {
        ...q,
        iva: ivaSelected,
        discountRate,
        validityDays,
        shippingAmount,
        notes: notas,
        prefijoCotizacion: prefijoCotizacionSesion(),
      };
      const res = await window.api?.quotationExportPDF(payload);
      if (res?.id && detalleNumeroEl) {
        detalleNumeroEl.textContent = formatRefCotizacion(res.id, prefijoCotizacionSesion());
      }
      // Cerrar cualquier diálogo abierto ANTES de mostrar alertas
      document.querySelectorAll('dialog[open]')?.forEach((d) => { try { d.close(); } catch (_) {} });

      if (res?.canceled) {
        await renderDetalleCotizacion();
        alert('Exportación de PDF cancelada');
      } else if (res?.downloaded || res?.path) {
        alert(res?.downloaded ? 'PDF descargado.' : `PDF guardado en: ${res.path}`);
        await window.api?.quotationReset?.();
        if (selectedClientInfo) {
          selectedClientInfo.innerHTML = '<strong>Cliente:</strong> Sin cliente seleccionado';
        }
        await renderDetalleCotizacion();
        await refreshQuotation();
        try {
          const st = await window.api?.quotationGet?.();
          updateCrearButtonState(st);
        } catch (_) {}
      } else {
        await renderDetalleCotizacion();
        alert('Exportación de PDF cancelada');
      }
      equiposSearch?.focus();
    } catch (err) {
      alert('Error al exportar PDF');
      console.error(err);
    }
  });

  // Primer render
  refreshList();
  refreshQuotation();
  // Cargar cotizaciones si el módulo está visible
  const modCot = document.getElementById('mod-cotizaciones');
  if (modCot && modCot.classList.contains('visible')) {
    refreshCotizaciones();
  }

  // Configuración: panel Gestión de Equipos
  const configEquiposSearch = document.getElementById('config-equipos-search');
  const configEquiposList = document.getElementById('config-equipos-list');
  const configAddEquiposBtn = document.getElementById('config-add-equipos-btn');
  const configEquiposPrev = document.getElementById('config-equipos-prev');
  const configEquiposNext = document.getElementById('config-equipos-next');
  const configEquiposPageInfo = document.getElementById('config-equipos-page-info');
  let configEquiposPage = 1;
  const CONFIG_EQUIPOS_PAGE_SIZE = CONFIG_LIST_PAGE_SIZE;
  let configEquiposResults = [];

  configEquiposSearch?.addEventListener('input', () => { configEquiposPage = 1; refreshConfigEquiposList(); });
  configAddEquiposBtn?.addEventListener('click', () => openAddModalForCreate('equipos'));
  configEquiposPrev?.addEventListener('click', () => { if (configEquiposPage > 1) { configEquiposPage--; renderConfigEquiposPage(); } });
  configEquiposNext?.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((configEquiposResults.length || 0) / CONFIG_EQUIPOS_PAGE_SIZE)); if (configEquiposPage < totalPages) { configEquiposPage++; renderConfigEquiposPage(); } });

  async function refreshConfigEquiposList() {
    const q = (configEquiposSearch?.value || '').trim();
    configEquiposResults = (await window.api?.getProducts?.('equipos', q)) || [];
    configEquiposPage = 1;
    renderConfigEquiposPage();
  }

  function renderConfigEquiposPage() {
    if (!configEquiposList) return;
    configEquiposList.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil((configEquiposResults.length || 0) / CONFIG_EQUIPOS_PAGE_SIZE));
    const start = (configEquiposPage - 1) * CONFIG_EQUIPOS_PAGE_SIZE;
    const slice = configEquiposResults.slice(start, start + CONFIG_EQUIPOS_PAGE_SIZE);
    if (slice.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (configEquiposSearch?.value || '').trim().length === 0 ? 'Escribe para buscar equipos…' : 'Sin resultados';
      configEquiposList.appendChild(li);
    } else {
      slice.forEach((it) => {
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className = 'item-left';
        if (it.imagen) { const img = document.createElement('img'); img.className = 'thumb'; img.alt = it.nombre || 'Producto'; img.loading = 'lazy'; img.src = it.imagen; left.appendChild(img); }
        const info = document.createElement('div'); info.className = 'item-info';
        const nameEl = document.createElement('span'); nameEl.className = 'item-name'; nameEl.textContent = it.nombre; info.appendChild(nameEl);
        left.appendChild(info); li.appendChild(left);
        const actions = document.createElement('div'); actions.className = 'item-actions';
        const priceEl = document.createElement('span'); priceEl.className = 'item-price'; priceEl.textContent = `$${Number(it.precio).toFixed(2)}`;
        const editBtn = document.createElement('button'); editBtn.textContent = 'Editar'; editBtn.addEventListener('click', () => openAddModalForEdit(it, 'equipos'));
        const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar'; delBtn.addEventListener('click', async () => {
          try {
            if (confirm(`¿Eliminar "${it.nombre}"?`)) {
              await window.api?.deleteProduct?.('equipos', it.id);
              await refreshConfigEquiposList();
              if (currentCategory === 'equipos') { await refreshList(); }
            }
          } catch (err) {
            alert('Error al eliminar');
            console.error(err);
          }
        });
        actions.appendChild(priceEl);
        if (isAdmin()) { actions.appendChild(editBtn); actions.appendChild(delBtn); }
        li.appendChild(actions); configEquiposList.appendChild(li);
      });
    }
    if (configEquiposPageInfo) { configEquiposPageInfo.textContent = `Página ${configEquiposPage}/${totalPages}`; }
    if (configEquiposPrev) configEquiposPrev.disabled = configEquiposPage <= 1;
    if (configEquiposNext) configEquiposNext.disabled = configEquiposPage >= totalPages;
  }

  // Configuración: panel Gestión de Lentes de Contacto
  const configLcSearch = document.getElementById('config-lc-search');
  const configLcList = document.getElementById('config-lc-list');
  const configAddLcBtn = document.getElementById('config-add-lc-btn');
  const configLcPrev = document.getElementById('config-lc-prev');
  const configLcNext = document.getElementById('config-lc-next');
  const configLcPageInfo = document.getElementById('config-lc-page-info');
  let configLcPage = 1;
  const CONFIG_LC_PAGE_SIZE = CONFIG_LIST_PAGE_SIZE;
  let configLcResults = [];

  configLcSearch?.addEventListener('input', () => { configLcPage = 1; refreshConfigLcList(); });
  configAddLcBtn?.addEventListener('click', () => openAddModalForCreate('lentes_contacto'));
  configLcPrev?.addEventListener('click', () => { if (configLcPage > 1) { configLcPage--; renderConfigLcPage(); } });
  configLcNext?.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((configLcResults.length || 0) / CONFIG_LC_PAGE_SIZE)); if (configLcPage < totalPages) { configLcPage++; renderConfigLcPage(); } });

  async function refreshConfigLcList() {
    const q = (configLcSearch?.value || '').trim();
    configLcResults = (await window.api?.getProducts?.('lentes_contacto', q)) || [];
    configLcPage = 1;
    renderConfigLcPage();
  }

  function renderConfigLcPage() {
    if (!configLcList) return;
    configLcList.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil((configLcResults.length || 0) / CONFIG_LC_PAGE_SIZE));
    const start = (configLcPage - 1) * CONFIG_LC_PAGE_SIZE;
    const slice = configLcResults.slice(start, start + CONFIG_LC_PAGE_SIZE);
    if (slice.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (configLcSearch?.value || '').trim().length === 0 ? 'Escribe para buscar lentes de contacto…' : 'Sin resultados';
      configLcList.appendChild(li);
    } else {
      slice.forEach((it) => {
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className = 'item-left';
        if (it.imagen) { const img = document.createElement('img'); img.className = 'thumb'; img.alt = it.nombre || 'Producto'; img.loading = 'lazy'; img.src = it.imagen; left.appendChild(img); }
        const info = document.createElement('div'); info.className = 'item-info';
        const nameEl = document.createElement('span'); nameEl.className = 'item-name'; nameEl.textContent = it.nombre; info.appendChild(nameEl);
        left.appendChild(info); li.appendChild(left);
        const actions = document.createElement('div'); actions.className = 'item-actions';
        const priceEl = document.createElement('span'); priceEl.className = 'item-price'; priceEl.textContent = `$${Number(it.precio).toFixed(2)}`;
        const editBtn = document.createElement('button'); editBtn.textContent = 'Editar'; editBtn.addEventListener('click', () => openAddModalForEdit(it, 'lentes_contacto'));
        const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar'; delBtn.addEventListener('click', async () => {
          try {
            if (confirm(`¿Eliminar "${it.nombre}"?`)) {
              await window.api?.deleteProduct?.('lentes_contacto', it.id);
              await refreshConfigLcList();
              if (currentCategory === 'lentes_contacto') { await refreshList(); }
            }
          } catch (err) {
            alert('Error al eliminar');
            console.error(err);
          }
        });
        actions.appendChild(priceEl);
        if (isAdmin()) { actions.appendChild(editBtn); actions.appendChild(delBtn); }
        li.appendChild(actions); configLcList.appendChild(li);
      });
    }
    if (configLcPageInfo) { configLcPageInfo.textContent = `Página ${configLcPage}/${totalPages}`; }
    if (configLcPrev) configLcPrev.disabled = configLcPage <= 1;
    if (configLcNext) configLcNext.disabled = configLcPage >= totalPages;
  }

  // Configuración: panel Gestión de Soluciones LC
  const configSolSearch = document.getElementById('config-soluciones_lc-search');
  const configSolList = document.getElementById('config-soluciones_lc-list');
  const configAddSolBtn = document.getElementById('config-add-soluciones_lc-btn');
  const configSolPrev = document.getElementById('config-soluciones_lc-prev');
  const configSolNext = document.getElementById('config-soluciones_lc-next');
  const configSolPageInfo = document.getElementById('config-soluciones_lc-page-info');
  let configSolPage = 1;
  const CONFIG_SOL_PAGE_SIZE = CONFIG_LIST_PAGE_SIZE;
  let configSolResults = [];

  configSolSearch?.addEventListener('input', () => { configSolPage = 1; refreshConfigSolList(); });
  configAddSolBtn?.addEventListener('click', () => openAddModalForCreate('soluciones_lc'));
  configSolPrev?.addEventListener('click', () => { if (configSolPage > 1) { configSolPage--; renderConfigSolPage(); } });
  configSolNext?.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((configSolResults.length || 0) / CONFIG_SOL_PAGE_SIZE)); if (configSolPage < totalPages) { configSolPage++; renderConfigSolPage(); } });

  async function refreshConfigSolList() {
    const q = (configSolSearch?.value || '').trim();
    configSolResults = (await window.api?.getProducts?.('soluciones_lc', q)) || [];
    configSolPage = 1;
    renderConfigSolPage();
  }

  function renderConfigSolPage() {
    if (!configSolList) return;
    configSolList.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil((configSolResults.length || 0) / CONFIG_SOL_PAGE_SIZE));
    const start = (configSolPage - 1) * CONFIG_SOL_PAGE_SIZE;
    const slice = configSolResults.slice(start, start + CONFIG_SOL_PAGE_SIZE);
    if (slice.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (configSolSearch?.value || '').trim().length === 0 ? 'Escribe para buscar soluciones…' : 'Sin resultados';
      configSolList.appendChild(li);
    } else {
      slice.forEach((it) => {
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className = 'item-left';
        if (it.imagen) { const img = document.createElement('img'); img.className = 'thumb'; img.alt = it.nombre || 'Producto'; img.loading = 'lazy'; img.src = it.imagen; left.appendChild(img); }
        const info = document.createElement('div'); info.className = 'item-info';
        const nameEl = document.createElement('span'); nameEl.className = 'item-name'; nameEl.textContent = it.nombre; info.appendChild(nameEl);
        left.appendChild(info); li.appendChild(left);
        const actions = document.createElement('div'); actions.className = 'item-actions';
        const priceEl = document.createElement('span'); priceEl.className = 'item-price'; priceEl.textContent = `$${Number(it.precio).toFixed(2)}`;
        const editBtn = document.createElement('button'); editBtn.textContent = 'Editar'; editBtn.addEventListener('click', () => openAddModalForEdit(it, 'soluciones_lc'));
        const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar'; delBtn.addEventListener('click', async () => {
          try {
            if (confirm(`¿Eliminar "${it.nombre}"?`)) {
              await window.api?.deleteProduct?.('soluciones_lc', it.id);
              await refreshConfigSolList();
              if (currentCategory === 'soluciones_lc') { await refreshList(); }
            }
          } catch (err) {
            alert('Error al eliminar');
            console.error(err);
          }
        });
        actions.appendChild(priceEl);
        if (isAdmin()) { actions.appendChild(editBtn); actions.appendChild(delBtn); }
        li.appendChild(actions); configSolList.appendChild(li);
      });
    }
    if (configSolPageInfo) { configSolPageInfo.textContent = `Página ${configSolPage}/${totalPages}`; }
    if (configSolPrev) configSolPrev.disabled = configSolPage <= 1;
    if (configSolNext) configSolNext.disabled = configSolPage >= totalPages;
  }

  // Configuración: panel Gestión de Insumos
  const configInsSearch = document.getElementById('config-insumos-search');
  const configInsList = document.getElementById('config-insumos-list');
  const configAddInsBtn = document.getElementById('config-add-insumos-btn');
  const configInsPrev = document.getElementById('config-insumos-prev');
  const configInsNext = document.getElementById('config-insumos-next');
  const configInsPageInfo = document.getElementById('config-insumos-page-info');
  let configInsPage = 1;
  const CONFIG_INS_PAGE_SIZE = CONFIG_LIST_PAGE_SIZE;
  let configInsResults = [];

  configInsSearch?.addEventListener('input', () => { configInsPage = 1; refreshConfigInsList(); });
  configAddInsBtn?.addEventListener('click', () => openAddModalForCreate('insumos'));
  configInsPrev?.addEventListener('click', () => { if (configInsPage > 1) { configInsPage--; renderConfigInsPage(); } });
  configInsNext?.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((configInsResults.length || 0) / CONFIG_INS_PAGE_SIZE)); if (configInsPage < totalPages) { configInsPage++; renderConfigInsPage(); } });

  async function refreshConfigInsList() {
    const q = (configInsSearch?.value || '').trim();
    configInsResults = (await window.api?.getProducts?.('insumos', q)) || [];
    configInsPage = 1;
    renderConfigInsPage();
  }

  function renderConfigInsPage() {
    if (!configInsList) return;
    configInsList.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil((configInsResults.length || 0) / CONFIG_INS_PAGE_SIZE));
    const start = (configInsPage - 1) * CONFIG_INS_PAGE_SIZE;
    const slice = configInsResults.slice(start, start + CONFIG_INS_PAGE_SIZE);
    if (slice.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (configInsSearch?.value || '').trim().length === 0 ? 'Escribe para buscar insumos…' : 'Sin resultados';
      configInsList.appendChild(li);
    } else {
      slice.forEach((it) => {
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className = 'item-left';
        if (it.imagen) { const img = document.createElement('img'); img.className = 'thumb'; img.alt = it.nombre || 'Producto'; img.loading = 'lazy'; img.src = it.imagen; left.appendChild(img); }
        const info = document.createElement('div'); info.className = 'item-info';
        const nameEl = document.createElement('span'); nameEl.className = 'item-name'; nameEl.textContent = it.nombre; info.appendChild(nameEl);
        left.appendChild(info); li.appendChild(left);
        const actions = document.createElement('div'); actions.className = 'item-actions';
        const priceEl = document.createElement('span'); priceEl.className = 'item-price'; priceEl.textContent = `$${Number(it.precio).toFixed(2)}`;
        const editBtn = document.createElement('button'); editBtn.textContent = 'Editar'; editBtn.addEventListener('click', () => openAddModalForEdit(it, 'insumos'));
        const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar'; delBtn.addEventListener('click', async () => {
          try {
            if (confirm(`¿Eliminar "${it.nombre}"?`)) {
              await window.api?.deleteProduct?.('insumos', it.id);
              await refreshConfigInsList();
              if (currentCategory === 'insumos') { await refreshList(); }
            }
          } catch (err) {
            alert('Error al eliminar');
            console.error(err);
          }
        });
        actions.appendChild(priceEl);
        if (isAdmin()) { actions.appendChild(editBtn); actions.appendChild(delBtn); }
        li.appendChild(actions); configInsList.appendChild(li);
      });
    }
    if (configInsPageInfo) { configInsPageInfo.textContent = `Página ${configInsPage}/${totalPages}`; }
    if (configInsPrev) configInsPrev.disabled = configInsPage <= 1;
    if (configInsNext) configInsNext.disabled = configInsPage >= totalPages;
  }

  // Configuración: panel Gestión de Accesorios
  const configAccSearch = document.getElementById('config-accesorios-search');
  const configAccList = document.getElementById('config-accesorios-list');
  const configAddAccBtn = document.getElementById('config-add-accesorios-btn');
  const configAccPrev = document.getElementById('config-accesorios-prev');
  const configAccNext = document.getElementById('config-accesorios-next');
  const configAccPageInfo = document.getElementById('config-accesorios-page-info');
  let configAccPage = 1;
  const CONFIG_ACC_PAGE_SIZE = CONFIG_LIST_PAGE_SIZE;
  let configAccResults = [];

  configAccSearch?.addEventListener('input', () => { configAccPage = 1; refreshConfigAccList(); });
  configAddAccBtn?.addEventListener('click', () => openAddModalForCreate('accesorios'));
  configAccPrev?.addEventListener('click', () => { if (configAccPage > 1) { configAccPage--; renderConfigAccPage(); } });
  configAccNext?.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((configAccResults.length || 0) / CONFIG_ACC_PAGE_SIZE)); if (configAccPage < totalPages) { configAccPage++; renderConfigAccPage(); } });

  async function refreshConfigAccList() {
    const q = (configAccSearch?.value || '').trim();
    configAccResults = (await window.api?.getProducts?.('accesorios', q)) || [];
    configAccPage = 1;
    renderConfigAccPage();
  }

  function renderConfigAccPage() {
    if (!configAccList) return;
    configAccList.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil((configAccResults.length || 0) / CONFIG_ACC_PAGE_SIZE));
    const start = (configAccPage - 1) * CONFIG_ACC_PAGE_SIZE;
    const slice = configAccResults.slice(start, start + CONFIG_ACC_PAGE_SIZE);
    if (slice.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (configAccSearch?.value || '').trim().length === 0 ? 'Escribe para buscar accesorios…' : 'Sin resultados';
      configAccList.appendChild(li);
    } else {
      slice.forEach((it) => {
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className = 'item-left';
        if (it.imagen) { const img = document.createElement('img'); img.className = 'thumb'; img.alt = it.nombre || 'Producto'; img.loading = 'lazy'; img.src = it.imagen; left.appendChild(img); }
        const info = document.createElement('div'); info.className = 'item-info';
        const nameEl = document.createElement('span'); nameEl.className = 'item-name'; nameEl.textContent = it.nombre; info.appendChild(nameEl);
        left.appendChild(info); li.appendChild(left);
        const actions = document.createElement('div'); actions.className = 'item-actions';
        const priceEl = document.createElement('span'); priceEl.className = 'item-price'; priceEl.textContent = `$${Number(it.precio).toFixed(2)}`;
        const editBtn = document.createElement('button'); editBtn.textContent = 'Editar'; editBtn.addEventListener('click', () => openAddModalForEdit(it, 'accesorios'));
        const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar'; delBtn.addEventListener('click', async () => {
          try {
            if (confirm(`¿Eliminar "${it.nombre}"?`)) {
              await window.api?.deleteProduct?.('accesorios', it.id);
              await refreshConfigAccList();
              if (currentCategory === 'accesorios') { await refreshList(); }
            }
          } catch (err) {
            alert('Error al eliminar');
            console.error(err);
          }
        });
        actions.appendChild(priceEl);
        if (isAdmin()) { actions.appendChild(editBtn); actions.appendChild(delBtn); }
        li.appendChild(actions); configAccList.appendChild(li);
      });
    }
    if (configAccPageInfo) { configAccPageInfo.textContent = `Página ${configAccPage}/${totalPages}`; }
    if (configAccPrev) configAccPrev.disabled = configAccPage <= 1;
    if (configAccNext) configAccNext.disabled = configAccPage >= totalPages;
  }

  // Configuración: panel Gestión de Clientes
  const configClientesSearch = document.getElementById('config-clientes-search');
  const configClientesList = document.getElementById('config-clientes-list');
  const configAddClientesBtn = document.getElementById('config-add-clientes-btn');
  const configClientesPrev = document.getElementById('config-clientes-prev');
  const configClientesNext = document.getElementById('config-clientes-next');
  const configClientesPageInfo = document.getElementById('config-clientes-page-info');
  const configImportClientesBtn = document.getElementById('config-import-clientes-btn');
  const configImportClientesFile = document.getElementById('config-import-clientes-file');
  let configClientesPage = 1;
  const CONFIG_CLIENTES_PAGE_SIZE = 5;
  let configClientesResults = [];

  configClientesSearch?.addEventListener('input', () => { configClientesPage = 1; refreshConfigClientesList(); });
  configAddClientesBtn?.addEventListener('click', () => {
    try {
      editingClient = null;
      newClientForm?.reset();
      const titleEl = newClientForm?.querySelector('h3');
      if (titleEl) titleEl.textContent = 'Nuevo cliente';
      newClientModal?.showModal();
      try { ncNombre?.focus(); ncNombre?.select?.(); } catch (_) {}
    } catch (err) { console.error(err); }
  });
  configClientesPrev?.addEventListener('click', () => { if (configClientesPage > 1) { configClientesPage--; renderConfigClientesPage(); } });
  configClientesNext?.addEventListener('click', () => { const totalPages = Math.max(1, Math.ceil((configClientesResults.length || 0) / CONFIG_CLIENTES_PAGE_SIZE)); if (configClientesPage < totalPages) { configClientesPage++; renderConfigClientesPage(); } });

  configImportClientesBtn?.addEventListener('click', () => { configImportClientesFile?.click(); });
  configImportClientesFile?.addEventListener('change', async () => {
    const file = configImportClientesFile.files?.[0];
    if (!file) return;
    try {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.csv')) {
        const text = await file.text();
        const items = parseClientesCSV(text);
        if (!items.length) {
          alert('El archivo CSV no contiene filas válidas. Se espera: nombre,RFC,telefono,email,direccion');
          configImportClientesFile.value = '';
          return;
        }
        const res = await window.api?.importClientes?.(items);
        if (!res) {
          alert('No se pudo comunicar con la aplicación de escritorio (Electron).');
          configImportClientesFile.value = '';
          return;
        }
        if (res?.error) {
          alert(`Error al importar clientes: ${res.error}`);
        } else {
          alert(`Importación de clientes completada. Filas insertadas: ${res?.inserted ?? 0}`);
        }
        await refreshConfigClientesList();
        configImportClientesFile.value = '';
      } else if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const res = await window.api?.importClientesXLSX?.(buf);
        if (!res) {
          alert('No se pudo comunicar con la aplicación de escritorio (Electron).');
          configImportClientesFile.value = '';
          return;
        }
        if (res?.error) {
          alert(`Error al importar clientes: ${res.error}`);
        } else {
          alert(`Importación de clientes completada. Filas insertadas: ${res?.inserted ?? 0}`);
        }
        await refreshConfigClientesList();
        configImportClientesFile.value = '';
      } else {
        alert('Formato no soportado. Usa archivos CSV o XLSX.');
        configImportClientesFile.value = '';
      }
    } catch (err) {
      alert('Error al importar clientes');
      console.error(err);
      configImportClientesFile.value = '';
    }
  });

  async function refreshConfigClientesList() {
    const q = (configClientesSearch?.value || '').trim();
    try {
      configClientesResults = (await window.api?.searchClients?.(q)) || [];
    } catch (_) {
      configClientesResults = [];
    }
    configClientesPage = 1;
    renderConfigClientesPage();
  }

  function renderConfigClientesPage() {
    if (!configClientesList) return;
    configClientesList.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil((configClientesResults.length || 0) / CONFIG_CLIENTES_PAGE_SIZE));
    const start = (configClientesPage - 1) * CONFIG_CLIENTES_PAGE_SIZE;
    const slice = configClientesResults.slice(start, start + CONFIG_CLIENTES_PAGE_SIZE);
    if (slice.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = (configClientesSearch?.value || '').trim().length === 0 ? 'Escribe para buscar clientes…' : 'Sin resultados';
      configClientesList.appendChild(li);
    } else {
      slice.forEach((c) => {
        const li = document.createElement('li');
        const left = document.createElement('div'); left.className = 'item-left';
        const info = document.createElement('div'); info.className = 'item-info';
        const nameEl = document.createElement('span'); nameEl.className = 'item-name'; nameEl.textContent = c.nombre || '';
        const rfcEl = document.createElement('span'); rfcEl.className = 'item-sub'; rfcEl.textContent = c.rfc || '';
        info.appendChild(nameEl); info.appendChild(rfcEl);
        left.appendChild(info); li.appendChild(left);
        const actions = document.createElement('div'); actions.className = 'item-actions';
        const editBtn = document.createElement('button'); editBtn.textContent = 'Editar'; editBtn.addEventListener('click', () => {
          try {
            editingClient = c;
            if (newClientForm) {
              const titleEl = newClientForm.querySelector('h3'); if (titleEl) titleEl.textContent = 'Editar cliente';
            }
            if (ncNombre) ncNombre.value = c.nombre || '';
            if (ncRFC) ncRFC.value = c.rfc || '';
            if (ncTel) ncTel.value = c.telefono || '';
            if (ncEmail) ncEmail.value = c.email || '';
            if (ncDir) ncDir.value = c.direccion || '';
            newClientModal?.showModal();
            try { ncNombre?.focus(); ncNombre?.select?.(); } catch (_) {}
          } catch (err) { console.error(err); }
        });
        const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar'; delBtn.addEventListener('click', async () => {
          try {
            if (confirm(`¿Eliminar cliente "${c.nombre}"?`)) {
              const res = await window.api?.deleteClient?.(c.id);
              if (!res || res?.error || res?.ok === false) {
                alert(`No se pudo eliminar${res?.error ? ': ' + res.error : ''}`);
                return;
              }
              await refreshConfigClientesList();
            }
          } catch (err) {
            alert('Error al eliminar cliente');
            console.error(err);
          }
        });
        if (isAdmin()) { actions.appendChild(editBtn); actions.appendChild(delBtn); }
        li.appendChild(actions); configClientesList.appendChild(li);
      });
    }
    if (configClientesPageInfo) { configClientesPageInfo.textContent = `Página ${configClientesPage}/${totalPages}`; }
    if (configClientesPrev) configClientesPrev.disabled = configClientesPage <= 1;
    if (configClientesNext) configClientesNext.disabled = configClientesPage >= totalPages;
  }

  async function refreshCotizaciones() {
    try {
      const items = await window.api?.getCotizaciones?.();
      cotizacionesList.innerHTML = '';
      (items || []).forEach((c) => {
        const li = document.createElement('li');
        li.classList.add('cot-row');
        const numero = c?.id ? formatRefCotizacion(c.id, c.prefijo_cotizacion) : '—';
        const fecha = c?.fecha ? new Date(c.fecha).toLocaleString('es-ES') : '';
        const cliente = c?.cliente || 'Sin cliente';
        const asesor = c?.asesor || '';
        const total = `$${Number(c?.total || 0).toFixed(2)}`;
        li.innerHTML = `
          <span class="cot-num">${numero}</span>
          <span class="cot-fecha">${fecha}</span>
          <span class="cot-cliente">${cliente}</span>
          <span class="cot-asesor">${asesor}</span>
          <span class="cot-total">${total}</span>
          <span class="cot-actions">
            ${isAdmin() ? '<button class="btn-icon delete-cot-btn" title="Eliminar">🗑</button>' : ''}
          </span>
        `;
        // Permitir abrir detalle de cotización al hacer clic
        li.addEventListener('click', async () => {
          // Cerrar cualquier diálogo abierto para evitar estados bloqueantes
          try { document.querySelectorAll('dialog[open]')?.forEach((d) => { try { d.close(); } catch (_) {} }); } catch (_){/* noop */}
          // Actualizar número en el título del modal
          if (detalleNumeroEl && c?.id) {
            detalleNumeroEl.textContent = formatRefCotizacion(c.id, c.prefijo_cotizacion);
          }
          // Intentar cargar detalle desde backend; si falla, usar fallback
          let cargado = false;
          try {
            if (window.api?.getCotizacion) {
              const detalle = await window.api.getCotizacion(c.id);
              if (detalle) {
                let html = '';
                const cliStr = detalle?.cliente?.nombre || detalle?.cliente || c.cliente || 'Sin cliente';
                html += `<p><strong>Número:</strong> ${formatRefCotizacion(detalle?.id ?? c.id, detalle?.prefijo_cotizacion ?? c.prefijo_cotizacion)}</p>`;
                html += `<p><strong>ID:</strong> #${detalle?.id ?? c.id}</p>`;
                html += `<p><strong>Cliente:</strong> ${cliStr}</p>`;
                html += `<p><strong>Asesor:</strong> ${detalle?.asesor ?? c.asesor ?? ''}</p>`;
                html += '<div class="list">';
                const items = Array.isArray(detalle?.items) ? detalle.items : [];
                if (items.length) {
                  items.forEach((it) => { html += `<div>${it.nombre} — $${Number(it.precio).toFixed(2)}</div>`; });
                } else { html += '<div class="empty">Sin ítems</div>'; }
                html += '</div>';
                const total = detalle?.total ?? c.total ?? 0;
                html += `<p><strong>Total:</strong> $${Number(total).toFixed(2)}</p>`;

                // Opciones guardadas
                const opts = detalle?.options || {};
                html += '<div class="detalle-section">';
                html += '<h4>Opciones guardadas</h4>';
                html += `<div>IVA: ${opts.iva ? 'Sí' : 'No'}</div>`;
                html += `<div>Descuento: ${(Number(opts.discountRate || 0) * 100).toFixed(0)}%</div>`;
                if ((opts.shippingAmount || 0) > 0) html += `<div>Envío: $${Number(opts.shippingAmount).toFixed(2)}</div>`;
                if ((opts.validityDays || 0) > 0) html += `<div>Validez: ${Number(opts.validityDays)} día(s)</div>`;
                if ((opts.notes || '').trim()) html += `<div>Notas: ${String(opts.notes).trim()}</div>`;
                html += '</div>';
                html += '<div style="margin-top:12px"><button id="reuse-cotizacion" class="btn">Reutilizar en panel</button></div>';

                if (detalleContent) detalleContent.innerHTML = html;

                // Acción reutilizar: cargar al panel
                const reuseBtn = detalleContent?.querySelector('#reuse-cotizacion');
                reuseBtn?.addEventListener('click', async (ev) => {
                  ev.stopPropagation();
                  try {
                    await window.api?.quotationReset?.();
                    if (detalle.cliente) {
                      await window.api?.quotationSetClient?.(detalle.cliente);
                      if (selectedClientInfo) {
                        selectedClientInfo.innerHTML = `<strong>Cliente:</strong> ${detalle.cliente.nombre || ''}<br/><strong>RFC:</strong> ${detalle.cliente.RFC || ''}`;
                      }
                    }
                    if (detalle.asesor) await window.api?.quotationSetAsesor?.(detalle.asesor);
                    for (const it of (detalle.items || [])) {
                      await window.api?.quotationAddItem?.({ nombre: it.nombre, precio: it.precio });
                    }
                    await window.api?.quotationSetOptions?.(detalle.options || {});
                    try { detalleModal?.close?.(); } catch (_) {}
                    await renderDetalleCotizacion();
                    await refreshQuotation();
                    try { const st = await window.api?.quotationGet?.(); updateCrearButtonState(st); } catch (_) {}
                    equiposSearch?.focus();
                  } catch (e) { console.error(e); }
                });
                cargado = true;
              }
            }
          } catch (err) {
            console.error(err);
          }
          if (!cargado) {
            try { await renderDetalleCotizacion(); } catch (_){ /* noop */ }
          }
          // Abrir el modal con tolerancia (fallback a show()/open)
          try { detalleModal?.showModal(); }
          catch (_) { try { detalleModal?.show?.(); } catch (__){ detalleModal?.setAttribute?.('open',''); } }
        });
        // Acción: eliminar cotización
        const delBtn = li.querySelector('.delete-cot-btn');
        if (isAdmin()) {
          delBtn?.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (!c?.id) return;
            const ok = confirm(`¿Eliminar la cotización ${numero}?`);
            if (!ok) return;
            try {
              if (!window.api?.deleteCotizacion) {
                alert('Esta acción requiere la app de escritorio (Electron). Inicia con: npm run start');
                return;
              }
              const res = await window.api.deleteCotizacion(c.id);
              if (!res?.ok) {
                alert('No se pudo eliminar la cotización');
                return;
              }
              alert('Cotización eliminada');
              await refreshCotizaciones();
            } catch (err) {
              alert('Error al eliminar la cotización');
              console.error(err);
            }
          });
        }
        cotizacionesList.appendChild(li);
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Gestión de Usuarios (solo admin)
  const usersSearchEl = document.getElementById('config-users-search');
  const usersListEl = document.getElementById('config-users-list');
  const addUserBtn = document.getElementById('config-add-user-btn');
  const userModal = document.getElementById('modal-user');
  const userForm = document.getElementById('form-user');
  const userModalTitle = document.getElementById('user-modal-title');
  const userUsernameEl = document.getElementById('user-username');
  const userNombreEl = document.getElementById('user-nombre');
  const userEmailEl = document.getElementById('user-email');
  const userRoleSelectEl = document.getElementById('user-role-select');
  const userDepartamentoSelectEl = document.getElementById('user-departamento-select');
  const userPasswordEl = document.getElementById('user-password');
  const userSaveBtn = document.getElementById('user-save');
  const userCancelBtn = document.getElementById('user-cancel');
  let editingUser = null;
  let usersResults = [];

  function setUserDepartamentoSelectValue(val) {
    const sel = userDepartamentoSelectEl;
    if (!sel) return;
    const v = normalizePrefijoDepartamento(val);
    const has = Array.from(sel.options).some((o) => o.value === v);
    if (!has) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = `${v} (personalizado)`;
      sel.appendChild(o);
    }
    sel.value = v;
  }

  async function refreshUsers() {
    try {
      const q = (usersSearchEl?.value || '').trim();
      if (!window.api?.usersList) return; // Preview mode
      usersResults = await window.api.usersList(q) || [];
      renderUsers();
    } catch (err) {
      console.error(err);
    }
  }

  function renderUsers() {
    if (!usersListEl) return;
    usersListEl.innerHTML = '';
    usersResults.forEach(u => {
      const li = document.createElement('li');
      li.className = 'user-item';
      const usernameEl = document.createElement('span'); usernameEl.textContent = u.username || '';
      const nombreEl = document.createElement('span'); nombreEl.textContent = u.nombre || '';
      const emailEl = document.createElement('span'); emailEl.textContent = u.email || '';
      const roleEl = document.createElement('span'); roleEl.textContent = (u.role || 'user');
      const deptoEl = document.createElement('span');
      deptoEl.textContent = u.departamento || 'DEA';
      deptoEl.title = 'Departamento (folio)';
      const actionsEl = document.createElement('span');
      const editBtn = document.createElement('button'); editBtn.textContent = 'Editar';
      const delBtn = document.createElement('button'); delBtn.textContent = 'Eliminar';
      actionsEl.appendChild(editBtn); actionsEl.appendChild(delBtn);
      li.append(usernameEl, nombreEl, emailEl, roleEl, deptoEl, actionsEl);
      usersListEl.appendChild(li);

      editBtn.addEventListener('click', () => {
        editingUser = u;
        userModalTitle.textContent = 'Editar usuario';
        userUsernameEl.value = u.username || '';
        userNombreEl.value = u.nombre || '';
        userEmailEl.value = u.email || '';
        userRoleSelectEl.value = (u.role || 'user');
        setUserDepartamentoSelectValue(u.departamento || 'DEA');
        if (userPasswordEl) { userPasswordEl.required = false; userPasswordEl.placeholder = 'Contraseña (dejar en blanco para no cambiar)'; }
        userPasswordEl.value = '';
        try { userModal?.showModal(); } catch (_) { try { userModal?.show?.(); } catch (__){ userModal?.setAttribute?.('open',''); } }
        try { userUsernameEl?.focus(); userUsernameEl?.select?.(); } catch (_) {}
      });
      delBtn.addEventListener('click', async () => {
        if (!window.api?.usersDelete) {
          alert('Esta acción requiere la app de escritorio (Electron). Inicia con: npm run start');
          return;
        }
        const ok = confirm(`¿Eliminar usuario "${u.username}"?`);
        if (!ok) return;
        try {
          const res = await window.api.usersDelete(u.id);
          if (!res?.ok) {
            alert(res?.error || 'No se pudo eliminar el usuario');
            return;
          }
          alert('Usuario eliminado');
          refreshUsers();
        } catch (err) {
          console.error(err);
          alert('Error al eliminar el usuario');
        }
      });
    });
  }

  addUserBtn?.addEventListener('click', () => {
    editingUser = null;
    userModalTitle.textContent = 'Nuevo usuario';
    if (userForm) userForm.reset();
    userRoleSelectEl.value = 'user';
    setUserDepartamentoSelectValue('DEA');
    if (userPasswordEl) { userPasswordEl.required = true; userPasswordEl.placeholder = 'Contraseña (obligatoria)'; }
    try { userModal?.showModal(); } catch (_) { try { userModal?.show?.(); } catch (__){ userModal?.setAttribute?.('open',''); } }
    try { userUsernameEl?.focus(); userUsernameEl?.select?.(); } catch (_) {}
  });

  usersSearchEl?.addEventListener('input', () => { refreshUsers(); });

  userCancelBtn?.addEventListener('click', () => {
    try { userModal?.close(); } catch (_) { userModal?.removeAttribute?.('open'); }
    editingUser = null;
  });

  userSaveBtn?.addEventListener('click', async () => {
    const payload = {
      username: String(userUsernameEl?.value || '').trim(),
      nombre: String(userNombreEl?.value || '').trim(),
      email: String(userEmailEl?.value || '').trim(),
      role: String(userRoleSelectEl?.value || 'user').toLowerCase(),
      departamento: normalizePrefijoDepartamento(userDepartamentoSelectEl?.value),
    };
    if (!payload.username) {
      alert('El campo Usuario es obligatorio');
      return;
    }
    if (!['user','admin'].includes(payload.role)) {
      alert('Rol inválido');
      return;
    }
    try {
      if (editingUser) {
        const pw = String(userPasswordEl?.value || '');
        if (pw) payload.password = pw;
        if (!window.api?.usersUpdate) {
          alert('Esta acción requiere la app de escritorio (Electron). Inicia con: npm run start');
          return;
        }
        const res = await window.api.usersUpdate({ id: editingUser.id, ...payload });
        if (!res?.ok) {
          alert(res?.error || 'No se pudo actualizar');
          return;
        }
        alert('Usuario actualizado');
      } else {
        const pw = String(userPasswordEl?.value || '');
        if (!pw) {
          alert('La contraseña es obligatoria para crear usuario');
          return;
        }
        payload.password = pw;
        if (!window.api?.usersCreate) {
          alert('Esta acción requiere la app de escritorio (Electron). Inicia con: npm run start');
          return;
        }
        const res = await window.api.usersCreate(payload);
        if (!res?.ok) {
          alert(res?.error || 'No se pudo crear');
          return;
        }
        alert('Usuario creado');
      }
      try { userModal?.close(); } catch (_) { userModal?.removeAttribute?.('open'); }
      editingUser = null;
      refreshUsers();
    } catch (err) {
      console.error(err);
      alert('Error al guardar usuario');
    }
  });

  // Inicialización si estamos en configuración
  refreshUsers();
})();