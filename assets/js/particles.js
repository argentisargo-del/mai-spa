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
     Процедурная сцена: две мастерицы делают массаж гостье.
     Тёплый свет свечей, фигуры — тёмные силуэты (в частицах
     читаются как «вырезы» на светящемся фоне).
     ------------------------------------------------------------ */
  function drawSpaScene(ctx, w, h) {
    // тёплый фон
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#18211a');
    g.addColorStop(0.5, '#33291a');
    g.addColorStop(1, '#4a3620');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    function glow(x, y, r, rgba) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // свет: центральное тёплое свечение + свечи по низу
    glow(w * 0.5, h * 0.40, w * 0.75, 'rgba(236,196,120,0.50)');
    glow(w * 0.16, h * 0.82, w * 0.30, 'rgba(255,186,96,0.45)');
    glow(w * 0.84, h * 0.80, w * 0.26, 'rgba(255,176,88,0.38)');

    const dark = '#0b100d';
    ctx.fillStyle = dark;
    ctx.strokeStyle = dark;
    ctx.lineCap = 'round';

    function ell(x, y, rx, ry, rot) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.283);
      ctx.fill();
    }
    function arm(x1, y1, cx, cy, x2, y2, lw) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }

    // массажный стол
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(w * 0.10, h * 0.615, w * 0.80, h * 0.05, w * 0.012);
    else ctx.rect(w * 0.10, h * 0.615, w * 0.80, h * 0.05);
    ctx.fill();
    ctx.fillRect(w * 0.17, h * 0.66, w * 0.028, h * 0.24);  // ножки
    ctx.fillRect(w * 0.79, h * 0.66, w * 0.028, h * 0.24);

    // гостья на столе (лежит, голова слева) — приподнята над столешницей
    ell(w * 0.195, h * 0.565, w * 0.042, w * 0.042);                 // голова
    ell(w * 0.42, h * 0.572, w * 0.165, h * 0.036);                  // корпус
    ell(w * 0.585, h * 0.568, w * 0.085, h * 0.040);                 // бёдра (изгиб)
    ell(w * 0.755, h * 0.585, w * 0.105, h * 0.024);                 // ноги

    // мастерица 1 — за столом, наклонена к спине гостьи
    ell(w * 0.38, h * 0.295, w * 0.043, w * 0.046);                  // голова
    ell(w * 0.38, h * 0.246, w * 0.020, w * 0.020);                  // пучок
    ctx.beginPath();                                                 // корпус с наклоном
    ctx.moveTo(w * 0.335, h * 0.345);
    ctx.quadraticCurveTo(w * 0.30, h * 0.50, w * 0.325, h * 0.615);
    ctx.lineTo(w * 0.435, h * 0.615);
    ctx.quadraticCurveTo(w * 0.455, h * 0.46, w * 0.425, h * 0.345);
    ctx.closePath(); ctx.fill();
    arm(w * 0.355, h * 0.375, w * 0.40, h * 0.47, w * 0.455, h * 0.560, w * 0.030); // руки на спине
    arm(w * 0.415, h * 0.370, w * 0.47, h * 0.44, w * 0.505, h * 0.556, w * 0.030);

    // мастерица 2 — у ног гостьи
    ell(w * 0.665, h * 0.330, w * 0.040, w * 0.043);                 // голова
    ell(w * 0.665, h * 0.284, w * 0.018, w * 0.018);                 // пучок
    ctx.beginPath();
    ctx.moveTo(w * 0.625, h * 0.378);
    ctx.quadraticCurveTo(w * 0.60, h * 0.50, w * 0.618, h * 0.615);
    ctx.lineTo(w * 0.715, h * 0.615);
    ctx.quadraticCurveTo(w * 0.73, h * 0.47, w * 0.705, h * 0.378);
    ctx.closePath(); ctx.fill();
    arm(w * 0.64, h * 0.405, w * 0.67, h * 0.48, w * 0.715, h * 0.565, w * 0.028);
    arm(w * 0.70, h * 0.402, w * 0.745, h * 0.47, w * 0.775, h * 0.568, w * 0.028);

    // свечи слева внизу
    const candles = [[0.115, 0.885, 0.055], [0.165, 0.90, 0.038], [0.205, 0.892, 0.046]];
    for (const c of candles) {
      ctx.fillStyle = dark;
      ctx.fillRect(w * c[0] - w * 0.012, h * c[1] - h * c[2], w * 0.024, h * c[2]);
      // пламя
      ctx.fillStyle = '#ffe9b0';
      ell(w * c[0], h * c[1] - h * c[2] - h * 0.014, w * 0.007, h * 0.012);
      ctx.fillStyle = dark;
    }
  }

  /* ------------------------------------------------------------
     ImageParticleField — фото/сцена из цветных частиц.
     Сэмплирует пиксели источника (Image или draw-функция),
     каждая частица несёт цвет пикселя. assemble: 0=разлетелось,
     1=собралось в изображение. Тёмные пиксели пропускаются —
     силуэты читаются как «вырезы».
     ------------------------------------------------------------ */
  function ImageParticleField(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, DPR = 1;
    let particles = [];
    this.assemble = 0;
    const self = this;
    let img = null; // реальное фото, если загрузится

    function drawSource(octx, w, h) {
      if (img) {
        // cover-вписывание фото
        const s = Math.max(w / img.width, h / img.height);
        const dw = img.width * s, dh = img.height * s;
        octx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        (opts.draw || drawSpaScene)(octx, w, h);
      }
    }

    function build() {
      const w = Math.round(W), h = Math.round(H);
      if (w < 10 || h < 10) return;
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const octx = off.getContext('2d', { willReadFrequently: true });
      drawSource(octx, w, h);
      const data = octx.getImageData(0, 0, w, h).data;
      const target = opts.count || (w < 500 ? 3200 : 6000);
      particles = [];

      // мягкий подъём яркости для тёмных фото (gamma + gain)
      const lift = img
        ? function (c) { return Math.min(255, Math.round(Math.pow(c / 255, 0.8) * 255 * 1.2 + 8)); }
        : function (c) { return c; };
      const lumMin = img ? 0.03 : 0.075; // фото тёмные — порог ниже

      // 1) собираем всех кандидатов мелкой сеткой
      const scan = 3;
      const cand = [];
      for (let y = 0; y < h; y += scan) {
        for (let x = 0; x < w; x += scan) {
          const o = (y * w + x) * 4;
          const a = data[o + 3];
          if (a < 120) continue;
          const r = data[o], g = data[o + 1], b = data[o + 2];
          const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          if (lum < lumMin) continue;
          cand.push(x, y, r, g, b);
        }
      }
      const total = cand.length / 5;
      if (!total) return;

      // 2) равномерно прореживаем до target
      const stride = Math.max(1, total / target);
      // размер частицы — чтобы покрыть занимаемую площадь
      const size = Math.max(2.2, Math.sqrt((total * scan * scan) / Math.min(total, target)) * 0.62);

      let i = 0;
      for (let f = 0; f < total; f += stride) {
        // джиттер выбора — убирает регулярный полосатый паттерн
        const j = Math.min(total - 1, Math.floor(f + seeded(i + 31) * stride));
        const o = j * 5;
        const x = cand[o] + (seeded(i + 57) - 0.5) * scan * 1.6,
              y = cand[o + 1] + (seeded(i + 91) - 0.5) * scan * 1.6;
        const r = lift(cand[o + 2]), g = lift(cand[o + 3]), b = lift(cand[o + 4]);
        const s1 = seeded(i), s2 = seeded(i + 4321), s3 = seeded(i + 777);
        particles.push({
          hx: x, hy: y,
          sx: x + (s1 - 0.5) * w * 1.4,
          sy: y + (s2 - 0.5) * h * 1.4,
          x: x + (s1 - 0.5) * w * 1.4,
          y: y + (s2 - 0.5) * h * 1.4,
          col: r + ',' + g + ',' + b,
          size: size,
          amp: 8 + s3 * 26,
          spd: 0.25 + s1 * 0.45,
          ph: s2 * 6.283,
          k: 0.08 + s3 * 0.08
        });
        i++;
      }
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    let t = 0, raf = null;
    function frame() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      const asm = self.assemble;
      const alpha = 0.22 + asm * 0.78;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const fx = p.sx + Math.cos(t * p.spd + p.ph) * p.amp;
        const fy = p.sy + Math.sin(t * p.spd * 0.9 + p.ph) * p.amp;
        const gx = lerp(fx, p.hx, asm);
        const gy = lerp(fy, p.hy, asm);
        const k = p.k * (0.5 + asm);
        p.x += (gx - p.x) * k;
        p.y += (gy - p.y) * k;
        ctx.fillStyle = 'rgba(' + p.col + ',' + alpha + ')';
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      raf = requestAnimationFrame(frame);
    }

    this.start = function () { if (!raf) raf = requestAnimationFrame(frame); };
    this.stop = function () { if (raf) { cancelAnimationFrame(raf); raf = null; } };
    this.resize = resize;
    // мгновенно поставить частицы в позиции текущего assemble (без перелёта)
    this.snap = function () {
      const asm = self.assemble;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x = lerp(p.sx, p.hx, asm);
        p.y = lerp(p.sy, p.hy, asm);
      }
    };

    // пробуем загрузить реальное фото; нет — рисуем сцену-силуэт
    if (opts.src) {
      const im = new Image();
      im.onload = function () { img = im; build(); if (opts.onphoto) opts.onphoto(); };
      im.onerror = function () { /* остаёмся на процедурной сцене */ };
      im.src = opts.src;
    }

    resize();
    return this;
  }

  /* ------------------------------------------------------------
     Инициализация после загрузки
     ------------------------------------------------------------ */
  window.MAISPA_Particles = { ParticleField, ImageParticleField, drawWord, drawLotus, drawSpaScene, REDUCED };
})();
