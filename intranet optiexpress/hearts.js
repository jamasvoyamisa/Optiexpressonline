// Fondo animado con corazones flotantes
(function () {
  const COLORS = ['#00B3CD', '#5ecde0', '#D8E0EA', '#ffffff', '#006188'];
  const HEART_SYMBOLS = ['♥', '❤', '♡'];
  const MIN_HEARTS = 40;
  const MAX_HEARTS = 65;

  function createHeart() {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = HEART_SYMBOLS[Math.floor(Math.random() * HEART_SYMBOLS.length)];
    const scale = 0.6 + Math.random() * 1;
    const opacity = 0.5 + Math.random() * 0.5;
    heart.style.cssText = [
      `left: ${Math.random() * 100}vw`,
      `animation-duration: ${10 + Math.random() * 14}s`,
      `animation-delay: ${Math.random() * 8}s`,
      `color: ${COLORS[Math.floor(Math.random() * COLORS.length)]}`,
      `--heart-opacity: ${opacity}`,
      `--heart-scale: ${scale}`,
      `font-size: ${22 + Math.random() * 36}px`,
    ].join('; ');
    return heart;
  }

  function init() {
    const container = document.createElement('div');
    container.className = 'hearts-background';
    container.setAttribute('aria-hidden', 'true');

    const count = MIN_HEARTS + Math.floor(Math.random() * (MAX_HEARTS - MIN_HEARTS + 1));
    for (let i = 0; i < count; i++) {
      container.appendChild(createHeart());
    }

    document.body.appendChild(container);

    const updateHeight = () => {
      const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      container.style.height = h + 'px';
      container.style.setProperty('--fall-height', h + 'px');
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('scroll', updateHeight);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
