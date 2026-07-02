/* ============================================================
   MAI SPA — app.js
   Оркестрация UI: прелоадер, навигация, курсор, reveal,
   count-up, tilt, parallax, magnetic, скролл-управление частицами.
   ============================================================ */
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover:none)').matches;
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- Год в футере ---------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Прелоадер ---------- */
  window.addEventListener('load', function () {
    setTimeout(function () {
      const pre = $('#preloader');
      if (pre) pre.classList.add('is-done');
      document.body.classList.add('loaded');
      // старт первого reveal
      revealScan();
    }, 900);
  });

  /* ---------- Навигация: фон при скролле ---------- */
  const nav = $('#nav');
  function onNavScroll() {
    if (!nav) return;
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  onNavScroll();

  /* ---------- Мобильное меню ---------- */
  const burger = $('#burger');
  const mobileMenu = $('#mobileMenu');
  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      const open = mobileMenu.classList.toggle('is-open');
      nav.classList.toggle('menu-open', open);
      mobileMenu.setAttribute('aria-hidden', String(!open));
    });
    $$('a', mobileMenu).forEach(a => a.addEventListener('click', function () {
      mobileMenu.classList.remove('is-open');
      nav.classList.remove('menu-open');
    }));
  }

  /* ---------- Прогресс скролла ---------- */
  const progress = $('#scrollProgress');
  function onProgress() {
    if (!progress) return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? window.scrollY / h : 0;
    progress.style.width = (p * 100) + '%';
  }

  /* ---------- Кастомный курсор + magnetic ---------- */
  if (!isTouch) {
    const cursor = $('#cursor');
    const dot = $('#cursorDot');
    let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let tx = cx, ty = cy;
    document.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (dot) { dot.style.left = tx + 'px'; dot.style.top = ty + 'px'; }
    });
    (function loopCursor() {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      if (cursor) { cursor.style.left = cx + 'px'; cursor.style.top = cy + 'px'; }
      requestAnimationFrame(loopCursor);
    })();

    const interactive = 'a, button, [data-magnetic], input, textarea, [data-tilt]';
    $$(interactive).forEach(el => {
      el.addEventListener('mouseenter', () => cursor && cursor.classList.add('is-active'));
      el.addEventListener('mouseleave', () => cursor && cursor.classList.remove('is-active'));
    });

    // Magnetic pull для помеченных элементов
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('mousemove', function (e) {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + mx * 0.25 + 'px,' + my * 0.35 + 'px)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- Reveal-on-scroll ---------- */
  let revealEls = [];
  function revealScan() {
    revealEls = $$('.reveal:not(.is-in)');
  }
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target);
        if (en.target.hasAttribute('data-count')) animateCount(en.target);
        const cnt = en.target.querySelector && en.target.querySelector('[data-count]');
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }) : null;

  function initReveal() {
    $$('.reveal').forEach(el => { if (io) io.observe(el); else el.classList.add('is-in'); });
    // count-up элементы могут быть не .reveal — наблюдаем отдельно
    $$('[data-count]').forEach(el => { if (io) io.observe(el); else animateCount(el); });
  }

  /* ---------- Count-up ---------- */
  function animateCount(el) {
    if (el._counted) return; el._counted = true;
    const target = parseFloat(el.getAttribute('data-count')) || 0;
    const suffix = el.getAttribute('data-suffix') || '';
    const dur = 1600; const start = performance.now();
    function step(now) {
      const p = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(target * eased);
      el.textContent = val.toLocaleString('ru-RU') + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Tilt для карточек ---------- */
  if (!isTouch && !REDUCED) {
    $$('[data-tilt]').forEach(el => {
      el.addEventListener('mousemove', function (e) {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (0.5 - py) * 8;
        const ry = (px - 0.5) * 8;
        el.style.transform = 'perspective(800px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-4px)';
        el.style.setProperty('--mx', (px * 100) + '%');
        el.style.setProperty('--my', (py * 100) + '%');
        const shine = el.querySelector('.gift__shine');
        if (shine) shine.style.transform = 'translateX(' + (px * 120 - 60) + '%)';
      });
      el.addEventListener('mouseleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- Parallax ---------- */
  const parallaxEls = $$('[data-parallax]');
  function applyParallax() {
    if (REDUCED) return;
    const vh = window.innerHeight;
    parallaxEls.forEach(el => {
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const off = (center - vh / 2) / vh;
      const amt = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      el.style.transform = 'translateY(' + (off * amt * -120) + 'px)';
    });
  }

  /* ============================================================
     ЧАСТИЦЫ
     ============================================================ */
  const P = window.MAISPA_Particles;
  let heroField = null, ritualField = null, photoField = null;

  function initParticles() {
    if (!P) return;
    const heroCanvas = $('#heroCanvas');
    const ritualCanvas = $('#ritualCanvas');

    // HERO: мягкое облако, слегка собранное в слово, реагирует на курсор
    if (heroCanvas) {
      heroField = new P.ParticleField(heroCanvas, {
        count: REDUCED ? 500 : (window.innerWidth < 640 ? 700 : 1300),
        shapeA: P.drawWord,
        shapeB: P.drawWord,
        autoDrift: true
      });
      heroField.assemble = REDUCED ? 0.55 : 0.28; // лёгкий намёк на форму
      heroField.shape = 0;
      heroField.start();

      if (!isTouch) {
        heroCanvas.addEventListener('mousemove', function (e) {
          const r = heroCanvas.getBoundingClientRect();
          heroField.setMouse(e.clientX - r.left, e.clientY - r.top, true);
        });
        heroCanvas.addEventListener('mouseleave', function () { heroField.setMouse(-9999, -9999, false); });
      }
      // hero собирается сильнее при первом появлении
      setTimeout(function () { if (heroField) animateAssemble(heroField, heroField.assemble, REDUCED ? 0.6 : 0.5, 1800); }, 1000);
    }

    // RITUAL: скролл-управляемая сборка/рассыпание + морф слово<->лотос
    if (ritualCanvas) {
      ritualField = new P.ParticleField(ritualCanvas, {
        count: REDUCED ? 700 : (window.innerWidth < 640 ? 1100 : 2000),
        shapeA: P.drawLotus,
        shapeB: P.drawWord,
        autoDrift: true
      });
      ritualField.assemble = 0;
      ritualField.shape = 0;
      ritualField.start();

      if (!isTouch) {
        ritualCanvas.addEventListener('mousemove', function (e) {
          const r = ritualCanvas.getBoundingClientRect();
          ritualField.setMouse(e.clientX - r.left, e.clientY - r.top, true);
        });
        ritualCanvas.addEventListener('mouseleave', function () { ritualField.setMouse(-9999, -9999, false); });
      }
    }

    // PHOTO: сцена «две мастерицы + гостья» из цветных частиц.
    // Собирается когда карточка у центра экрана, разлетается при скролле.
    // Положите реальное фото в assets/img/massage.jpg — эффект применится к нему.
    const photoCanvas = $('#photoCanvas');
    if (photoCanvas) {
      photoField = new P.ImageParticleField(photoCanvas, {
        src: 'assets/img/massage.jpg',
        count: REDUCED ? 2500 : (window.innerWidth < 640 ? 3200 : 6000),
        onphoto: function () { if (REDUCED) photoField.snap(); }
      });
      photoField.assemble = REDUCED ? 1 : 0;
      photoField.start();
    }
  }

  /* ---------- Скролл-драйв фото-частиц ---------- */
  const photoCard = $('#photoCanvas');
  function drivePhoto() {
    if (!photoField || !photoCard || REDUCED) return;
    const r = photoCard.getBoundingClientRect();
    const vh = window.innerHeight;
    const center = r.top + r.height / 2;
    const dist = Math.abs(center - vh / 2);
    const range = vh * 0.55;
    const p = clamp(1 - dist / range, 0, 1);
    photoField.assemble = Math.pow(p, 0.75);
  }

  // плавная анимация значения assemble
  function animateAssemble(field, from, to, dur) {
    const start = performance.now();
    function step(now) {
      const p = clamp((now - start) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      field.assemble = from + (to - from) * e;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Скролл-драйв секции RITUAL ---------- */
  const ritualSection = $('#ritual');
  const ritualLabels = $$('.ritual__label');
  function driveRitual() {
    if (!ritualField || !ritualSection) return;
    const r = ritualSection.getBoundingClientRect();
    const total = ritualSection.offsetHeight - window.innerHeight;
    // прогресс 0..1 по мере прохождения секции
    let prog = clamp(-r.top / (total || 1), 0, 1);

    // Хореография:
    //  0.0–0.35  : рассыпано -> собирается в ЛОТОС (assemble 0->1, shape=0)
    //  0.35–0.6  : держим лотос, затем морф в СЛОВО (shape 0->1)
    //  0.6–1.0   : слово -> рассыпается обратно (assemble 1->0)
    let assemble, shape, step;
    if (prog < 0.35) {
      assemble = prog / 0.35;
      shape = 0; step = 0;
    } else if (prog < 0.6) {
      assemble = 1;
      shape = (prog - 0.35) / 0.25;
      step = 1;
    } else {
      assemble = 1 - (prog - 0.6) / 0.4;
      shape = 1; step = 2;
    }
    ritualField.assemble = clamp(assemble, 0, 1);
    ritualField.shape = clamp(shape, 0, 1);

    ritualLabels.forEach((el, i) => el.classList.toggle('is-on', i === step && prog > 0.02 && prog < 0.98));
  }

  /* ---------- Единый scroll/rAF цикл ---------- */
  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(function () {
        onNavScroll();
        onProgress();
        applyParallax();
        driveRitual();
        drivePhoto();
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Resize ---------- */
  let rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () {
      if (heroField) heroField.resize();
      if (ritualField) ritualField.resize();
      if (photoField) photoField.resize();
      applyParallax();
      driveRitual();
      drivePhoto();
    }, 180);
  });

  /* ---------- Плавный скролл по якорям (учёт фикс-навбара) ---------- */
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (e) {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      const y = t.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
    });
  });

  /* ---------- Форма (демо) ---------- */
  const form = $('.contact__form');
  if (form) {
    form.addEventListener('submit', function () {
      const btn = form.querySelector('button');
      if (btn) { btn.textContent = 'Заявка отправлена ✦'; btn.disabled = true; }
    });
  }

  /* ---------- Старт ---------- */
  initReveal();
  initParticles();
  onScroll();

})();
