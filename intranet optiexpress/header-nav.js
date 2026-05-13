(function () {
  function init() {
    const toggle = document.getElementById('navMenuToggle');
    const nav = document.getElementById('primary-nav');
    const backdrop = document.getElementById('navBackdrop');
    if (!toggle || !nav || !backdrop) return;

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
