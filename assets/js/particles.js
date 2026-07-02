/* ============================================================
   MAI SPA — particles.js
   Canvas-система частиц: сборка формы из облака и обратно.
   Используется на HERO (лёгкое облако + слово) и в секции RITUAL
   (скролл-управляемая сборка/рассыпание лотоса и логотипа).
   ============================================================ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GOLD = [232, 205, 138];
  const JADE = [95, 158, 127];

  /* ---------- утилиты ---------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mix(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t))
    ];
  }
  // детерминированный псевдорандом (без Math.random для стабильности)
  function seeded(i) {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /* ------------------------------------------------------------
     Сэмплирование целевых точек из отрисованного оффскрин-канваса.
     Рисуем текст/фигуру, читаем пиксели, берём точки где alpha>порог.
     ------------------------------------------------------------ */
  function sampleFromDraw(drawFn, w, h, step) {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    drawFn(ctx, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const pts = [];
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 128) pts.push({ x, y });
      }
    }
    return pts;
  }

  // Рисовалка слова "MAI SPA"
  function drawWord(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.min(w * 0.19, h * 0.42);
    ctx.font = '600 ' + size + "px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText('MAI SPA', w / 2, h / 2);
  }

  // Рисовалка чистого симметричного лотоса (жирные заполненные лепестки)
  function drawLotus(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h * 0.52);
    const R = Math.min(w, h) * 0.34;
    ctx.fillStyle = '#fff';

    // один заполненный лепесток-капля высотой L и шириной width
    function petal(L, width) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(width, -L * 0.35, width * 0.45, -L * 0.9, 0, -L);
      ctx.bezierCurveTo(-width * 0.45, -L * 0.9, -width, -L * 0.35, 0, 0);
      ctx.fill();
    }

    // задний ряд (широкие, наклонённые наружу)
    const back = [-0.85, -0.42, 0, 0.42, 0.85];
    for (const a of back) {
      ctx.save(); ctx.rotate(a); petal(R * 1.12, R * 0.34); ctx.restore();
    }
    // передний ряд (в промежутках, короче)
    const front = [-0.62, -0.2, 0.2, 0.62];
    for (const a of front) {
      ctx.save(); ctx.rotate(a); petal(R * 0.82, R * 0.30); ctx.restore();
    }
    // основание-чаша
    ctx.beginPath();
    ctx.ellipse(0, R * 0.06, R * 0.62, R * 0.16, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------
     Класс системы частиц
     ------------------------------------------------------------ */
  function ParticleField(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, DPR = 1;
    let particles = [];
    let targetsA = [];   // форма A (напр. слово)
    let targetsB = [];   // форма B (напр. лотос)
    let mode = 'idle';
    this.assemble = 0;   // 0 = рассыпано, 1 = собрано (внешнее управление)
    this.shape = 0;      // 0 = targetsA, 1 = targetsB (морф между формами)
    this.autoDrift = opts.autoDrift !== false;
    const mouse = { x: -9999, y: -9999, active: false };
    const self = this;

    const COUNT = opts.count || 1400;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildTargets();
    }

    function buildTargets() {
      const sw = Math.round(W), sh = Math.round(H);
      const step = W < 640 ? 5 : 4;
      let rawA = opts.shapeA ? sampleFromDraw(opts.shapeA, sw, sh, step) : [];
      let rawB = opts.shapeB ? sampleFromDraw(opts.shapeB, sw, sh, step) : [];
      targetsA = normalize(rawA, COUNT);
      targetsB = normalize(rawB, COUNT);
      // если частиц ещё нет — создаём
      if (!particles.length) initParticles();
      // назначаем цели
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.ax = targetsA.length ? targetsA[i % targetsA.length].x : W / 2;
        p.ay = targetsA.length ? targetsA[i % targetsA.length].y : H / 2;
        p.bx = targetsB.length ? targetsB[i % targetsB.length].x : p.ax;
        p.by = targetsB.length ? targetsB[i % targetsB.length].y : p.ay;
      }
    }

    // равномерно растянуть/повторить набор точек до нужного количества и слегка перемешать
    function normalize(pts, n) {
      if (!pts.length) return [];
      const out = [];
      for (let i = 0; i < n; i++) {
        const src = pts[(i * 2654435761 % pts.length + pts.length) % pts.length];
        out.push({ x: src.x, y: src.y });
      }
      return out;
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < COUNT; i++) {
        const r = seeded(i);
        const r2 = seeded(i + 999);
        particles.push({
          x: r * W, y: r2 * H,
          vx: 0, vy: 0,
          ax: W / 2, ay: H / 2,
          bx: W / 2, by: H / 2,
          // параметры «свободного» дрейфа
          ox: r * W, oy: r2 * H,
          amp: 20 + r * 60,
          spd: 0.2 + r2 * 0.5,
          ph: r * Math.PI * 2,
          size: 0.6 + seeded(i + 3) * 1.6,
          tcol: seeded(i + 7),        // 0..1 позиция в градиенте gold->jade
          k: 0.10 + seeded(i + 5) * 0.09,  // жёсткость позиционного easing (чёткая сборка)
          px: 0, py: 0                      // импульс от курсора (затухающий)
        });
      }
    }

    let t = 0;
    function frame() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      // затухающий шлейф
      const asm = self.assemble;
      const shp = self.shape;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // целевая точка формы (морф между A и B)
        const tx = lerp(p.ax, p.bx, shp);
        const ty = lerp(p.ay, p.by, shp);

        // свободная позиция (мягкий дрейф-облако)
        const fx = p.ox + Math.cos(t * p.spd + p.ph) * p.amp;
        const fy = p.oy + Math.sin(t * p.spd * 0.9 + p.ph) * p.amp;

        // цель = интерполяция между облаком и формой по assemble
        // (при asm=1 цель статична -> чёткое схлопывание в форму)
        let gx = lerp(fx, tx, asm);
        let gy = lerp(fy, ty, asm);

        // импульс отталкивания от курсора (затухающий, не мешает сборке)
        if (mouse.active) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) {
            const f = (14000 - d2) / 14000;
            const d = Math.sqrt(d2) || 1;
            p.px += (dx / d) * f * 4;
            p.py += (dy / d) * f * 4;
          }
        }
        p.px *= 0.85; p.py *= 0.85;

        // позиционный easing к цели -> критично демпфированная, чёткая сборка
        // жёстче когда собрано (asm высокий), мягче в облаке
        const k = p.k * (0.5 + asm * 0.9);
        p.x += (gx - p.x) * k + p.px;
        p.y += (gy - p.y) * k + p.py;

        // цвет: чем собраннее — тем ближе к золоту
        const col = mix(JADE, GOLD, Math.min(1, p.tcol * 0.5 + asm * 0.6));
        const alpha = 0.35 + asm * 0.5;
        const glow = asm > 0.6 ? asm : 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + asm * 0.5, 0, 6.283);
        ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + alpha + ')';
        if (glow > 0) { ctx.shadowColor = 'rgba(232,205,138,' + (glow * 0.5) + ')'; ctx.shadowBlur = 6 * glow; }
        else { ctx.shadowBlur = 0; }
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }

    let raf = null;
    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    // экспорт методов управления мышью
    this.setMouse = function (x, y, active) { mouse.x = x; mouse.y = y; mouse.active = active; };
    this.start = start;
    this.stop = stop;
    this.resize = resize;

    resize();
    return this;
  }

  /* ------------------------------------------------------------
     Инициализация после загрузки
     ------------------------------------------------------------ */
  window.MAISPA_Particles = { ParticleField, drawWord, drawLotus, REDUCED };
})();
