/**
 * Red de portería (RedPorteriaFondoB) + foto Calpini debajo.
 * Física resorte/amortiguación, viento en el dibujado, empuje del cursor.
 */
(function () {
  const CELL_W = 1440 / 28;
  const CELL_H = 900 / 13;
  const SPRING = 0.08;
  const DAMP = 0.86;
  const PUSH_RADIUS = 95;
  const PUSH_FORCE = 1.5;
  const WIND_AMPLITUDE = 5.5;
  const WIND_SPEED = 0.06;

  class RedPorteriaFondo {
    constructor() {
      this.mouse = { x: -9999, y: -9999 };
      this.cols = 28;
      this.rows = 13;
      this.nodes = [];
      this.tick = 0;
      this.raf = 0;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.wrapper = document.createElement('div');
      this.wrapper.id = 'mundial-bg';
      this.wrapper.setAttribute('aria-hidden', 'true');

      this.photo = document.createElement('div');
      this.photo.className = 'mundial-bg-photo';

      this.canvas = document.createElement('canvas');
      this.canvas.id = 'mundial-net-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');

      this.wrapper.appendChild(this.photo);
      this.wrapper.appendChild(this.canvas);
      document.body.insertBefore(this.wrapper, document.body.firstChild);

      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) return;

      this.resize = this.resize.bind(this);
      this.onMove = this.onMove.bind(this);
      this.loop = this.loop.bind(this);

      window.addEventListener('resize', this.resize);
      window.addEventListener('mousemove', this.onMove);
      window.addEventListener('mouseleave', () => {
        this.mouse.x = -9999;
        this.mouse.y = -9999;
      });
      window.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches[0]) this.onMove(e.touches[0]);
        },
        { passive: true }
      );
      window.addEventListener('touchend', () => {
        this.mouse.x = -9999;
        this.mouse.y = -9999;
      });

      this.resize();
      if (!this.reducedMotion) {
        this.raf = requestAnimationFrame(this.loop);
      } else {
        this.draw();
      }
    }

    idx(c, r) {
      return r * (this.cols + 1) + c;
    }

    windY(c, r) {
      return Math.sin(this.tick + c * 0.22 + r * 0.14) * WIND_AMPLITUDE;
    }

    onMove(e) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.reducedMotion) this.draw();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.w = w;
      this.h = h;

      this.cols = Math.max(8, Math.round(w / CELL_W));
      this.rows = Math.max(6, Math.round(h / CELL_H));

      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sx = w / this.cols;
      const sy = h / this.rows;
      this.nodes = [];
      for (let r = 0; r <= this.rows; r += 1) {
        for (let c = 0; c <= this.cols; c += 1) {
          const x = c * sx;
          const y = r * sy;
          this.nodes.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
        }
      }
    }

    update() {
      const { mouse, nodes } = this;
      for (const n of nodes) {
        n.vx += (n.ox - n.x) * SPRING;
        n.vy += (n.oy - n.y) * SPRING;
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < PUSH_RADIUS) {
          const k = 1 - d / PUSH_RADIUS;
          n.vx += (dx / (d || 1)) * k * PUSH_FORCE;
          n.vy += (dy / (d || 1)) * k * PUSH_FORCE;
        }
        n.vx *= DAMP;
        n.vy *= DAMP;
        n.x += n.vx;
        n.y += n.vy;
      }
    }

    draw() {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const { cols, rows } = this;

      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(150,220,255,.55)';
      ctx.lineWidth = 2.8;
      ctx.shadowColor = 'rgba(100,180,255,.35)';
      ctx.shadowBlur = 6;

      for (let r = 0; r <= rows; r += 1) {
        ctx.beginPath();
        for (let c = 0; c <= cols; c += 1) {
          const n = this.nodes[this.idx(c, r)];
          const wy = this.windY(c, r);
          if (c === 0) ctx.moveTo(n.x, n.y + wy);
          else ctx.lineTo(n.x, n.y + wy);
        }
        ctx.stroke();
      }

      for (let c = 0; c <= cols; c += 1) {
        ctx.beginPath();
        for (let r = 0; r <= rows; r += 1) {
          const n = this.nodes[this.idx(c, r)];
          const wy = this.windY(c, r);
          if (r === 0) ctx.moveTo(n.x, n.y + wy);
          else ctx.lineTo(n.x, n.y + wy);
        }
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(185,230,255,.9)';
      for (const n of this.nodes) {
        const col = Math.round((n.ox / w) * cols);
        const row = Math.round((n.oy / h) * rows);
        const wy = this.windY(col, row);
        ctx.beginPath();
        ctx.arc(n.x, n.y + wy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    loop() {
      this.update();
      this.draw();
      this.tick += WIND_SPEED;
      this.raf = requestAnimationFrame(this.loop);
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.resize);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new RedPorteriaFondo();
  });
})();
