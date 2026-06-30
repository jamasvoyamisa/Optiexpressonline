(function () {
  var NAV_ICONS = {
    'index.html': '🏠',
    '/': '🏠',
    'promociones-activas.html': '🏷️',
    'catalogos.html': '📚',
    '/cotizaciones/': '💼',
    '/ticket-soporte': '🛟',
    'https://xioptica.com.mx': '🔗',
  };

  function iconFor(href) {
    if (!href) return '•';
    var key = href.replace(/\/$/, '') || '/';
    if (NAV_ICONS[key]) return NAV_ICONS[key];
    if (key.endsWith('index.html')) return NAV_ICONS['index.html'];
    if (key.indexOf('cotizaciones') !== -1) return NAV_ICONS['/cotizaciones/'];
    if (key.indexOf('ticket-soporte') !== -1) return NAV_ICONS['/ticket-soporte'];
    return '•';
  }

  function isActiveLink(href) {
    if (!href) return false;
    var path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
    var file = path.split('/').pop() || 'index.html';
    if (href === 'index.html' || href === '/') {
      return file === 'index.html' || file === '' || path === '/';
    }
    if (href.indexOf('http') === 0) return false;
    var target = href.replace(/^\//, '').replace(/\/$/, '');
    return file === target || path === href || path.endsWith(target);
  }

  function enhanceNavLinks(nav) {
    nav.querySelectorAll('.nav-link').forEach(function (a) {
      if (a.querySelector('.nav-link-text')) return;
      var text = a.textContent.trim();
      var icon = document.createElement('span');
      icon.className = 'nav-link-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = iconFor(a.getAttribute('href'));
      var label = document.createElement('span');
      label.className = 'nav-link-text';
      label.textContent = text;
      var go = document.createElement('span');
      go.className = 'nav-link-go';
      go.setAttribute('aria-hidden', 'true');
      a.textContent = '';
      a.appendChild(icon);
      a.appendChild(label);
      a.appendChild(go);
      if (isActiveLink(a.getAttribute('href'))) {
        a.classList.add('is-active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  function ensureDrawerChrome(nav) {
    if (nav.querySelector('.nav-drawer-head')) return;

    var linksWrap = document.createElement('div');
    linksWrap.className = 'nav-drawer-links';
    nav.querySelectorAll('.nav-link').forEach(function (a) {
      linksWrap.appendChild(a);
    });

    var head = document.createElement('div');
    head.className = 'nav-drawer-head';
    head.innerHTML =
      '<div class="nav-drawer-brand">' +
      '<img src="images/Optiexpress_Logo.png" alt="Optiexpress" class="nav-drawer-logo" width="168" height="42" loading="lazy">' +
      '<p class="nav-drawer-tagline">Intranet corporativa</p>' +
      '</div>' +
      '<div class="nav-drawer-accent" aria-hidden="true"></div>';

    var foot = document.createElement('div');
    foot.className = 'nav-drawer-foot';
    foot.innerHTML =
      '<a href="/login" class="nav-drawer-cta">Iniciar Sesión</a>' +
      '<a href="whatsapp://" class="nav-drawer-secondary">' +
      '<img src="images/what.png" alt="" width="22" height="22" loading="lazy">' +
      '<span>WhatsApp</span></a>';

    nav.insertBefore(head, nav.firstChild);
    nav.appendChild(linksWrap);
    nav.appendChild(foot);
  }

  function init() {
    var toggle = document.getElementById('navMenuToggle');
    var nav = document.getElementById('primary-nav');
    var backdrop = document.getElementById('navBackdrop');
    if (!toggle || !nav || !backdrop) return;

    ensureDrawerChrome(nav);
    enhanceNavLinks(nav);

    function setOpen(open) {
      document.body.classList.toggle('nav-mobile-open', open);
      nav.classList.toggle('is-open', open);
      toggle.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    function close() {
      setOpen(false);
    }

    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('is-open'));
    });
    backdrop.addEventListener('click', close);
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', function () {
      if (window.matchMedia('(min-width: 900px)').matches) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
