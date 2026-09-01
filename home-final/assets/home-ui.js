/* Interactive behaviour for the homepage prototypes: horizontal scrollers for
   the project and quote cards, a single open FAQ accordion, and map pins that
   name their town only once they are clicked.

   Everything here is opt in through data attributes, so a page that does not
   carry the hooks is left alone. Under reduced motion the scrollers keep their
   arrows and drag off and the CSS lays the cards out as a plain wrapping row,
   while the accordion and the pins still work. */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------- scrollers */
  function initScroller(root) {
    var rail = root.querySelector('.sc-rail');
    var prev = root.querySelector('.sc-arrow[data-dir="-1"]');
    var next = root.querySelector('.sc-arrow[data-dir="1"]');
    if (!rail) return;

    function amount() {
      var card = rail.firstElementChild;
      var w = card ? card.getBoundingClientRect().width : rail.clientWidth * 0.8;
      var gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
      return w + gap;
    }

    function sync() {
      var max = rail.scrollWidth - rail.clientWidth;
      if (prev) prev.disabled = rail.scrollLeft <= 1;
      if (next) next.disabled = rail.scrollLeft >= max - 1;
    }

    [prev, next].forEach(function (b) {
      if (!b) return;
      b.addEventListener('click', function () {
        rail.scrollBy({ left: amount() * Number(b.dataset.dir), behavior: reduced ? 'auto' : 'smooth' });
      });
    });
    rail.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    sync();

    if (reduced) return;

    // a vertical wheel over the rail reads as sideways travel, which is what a
    // trackpad user expects from a row of cards
    rail.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      var max = rail.scrollWidth - rail.clientWidth;
      if (max <= 0) return;
      var at = (e.deltaY < 0 && rail.scrollLeft <= 0) || (e.deltaY > 0 && rail.scrollLeft >= max - 1);
      if (at) return;  // hand the page back its scroll at either end
      e.preventDefault();
      rail.scrollLeft += e.deltaY;
    }, { passive: false });

    // drag with a coasting release, so the row keeps the weight of a flick
    var down = false, moved = false, startX = 0, startLeft = 0, last = 0, lastT = 0, vel = 0, glide = 0;
    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = true; moved = false;
      startX = last = e.clientX; startLeft = rail.scrollLeft;
      lastT = performance.now(); vel = 0;
      cancelAnimationFrame(glide);
    });
    rail.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 4) { moved = true; rail.classList.add('dragging'); rail.setPointerCapture(e.pointerId); }
      if (!moved) return;
      var now = performance.now();
      if (now > lastT) vel = (e.clientX - last) / (now - lastT);
      last = e.clientX; lastT = now;
      rail.scrollLeft = startLeft - dx;
    });
    function release() {
      if (!down) return;
      down = false;
      rail.classList.remove('dragging');
      var v = vel * 16;
      var step = function () {
        if (Math.abs(v) < 0.4) return;
        rail.scrollLeft -= v;
        v *= 0.94;
        glide = requestAnimationFrame(step);
      };
      step();
    }
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);
    // a drag that ran past a card must not also count as a click on it
    rail.addEventListener('click', function (e) { if (moved) { e.preventDefault(); moved = false; } }, true);
  }

  /* -------------------------------------------------------------- accordion */
  function initAccordion(root) {
    var items = [].slice.call(root.querySelectorAll('.faq-q'));

    function close(btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'false');
      panel.style.height = panel.scrollHeight + 'px';
      requestAnimationFrame(function () { panel.style.height = '0px'; });
    }

    function open(btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'true');
      panel.style.height = panel.scrollHeight + 'px';
    }

    items.forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      panel.style.height = '0px';
      panel.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'height' && btn.getAttribute('aria-expanded') === 'true') panel.style.height = 'auto';
      });
      btn.addEventListener('click', function () {
        var wasOpen = btn.getAttribute('aria-expanded') === 'true';
        items.forEach(function (o) { if (o.getAttribute('aria-expanded') === 'true') close(o); });
        if (!wasOpen) open(btn);
      });
    });
  }

  /* ------------------------------------------------------------------- map */
  function initMap(root) {
    var pins = [].slice.call(root.querySelectorAll('.map-pin'));
    var pinned = null;  // the pin a click has locked open, if any

    function show(pin, on) {
      pin.setAttribute('aria-expanded', on ? 'true' : 'false');
      pin.querySelector('.pin-tip').hidden = !on;
    }

    function closeAll(except) {
      pins.forEach(function (p) { if (p !== except) show(p, false); });
    }

    pins.forEach(function (pin) {
      // hover and keyboard focus name the town; a click keeps it named, which
      // is what a touch screen with no hover state has to fall back on
      pin.addEventListener('pointerenter', function () {
        if (pinned && pinned !== pin) return;
        closeAll(pin);
        show(pin, true);
      });
      pin.addEventListener('pointerleave', function () {
        if (pinned === pin) return;
        show(pin, false);
      });
      pin.addEventListener('focus', function () { closeAll(pin); show(pin, true); });
      pin.addEventListener('blur', function () { if (pinned !== pin) show(pin, false); });
      pin.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = pinned === pin;
        closeAll(pin);
        pinned = open ? null : pin;
        show(pin, !open);
      });
    });
    document.addEventListener('click', function () { pinned = null; closeAll(null); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { pinned = null; closeAll(null); }
    });
  }

  /* -------------------------------------------------- reveal as it arrives */
  function initReveal(el) {
    if (reduced || !window.IntersectionObserver) { el.classList.add('in'); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.25 });
    io.observe(el);
  }

  /* ------------------------------------------------------- the proof video */
  function initVideo(v) {
    if (!window.IntersectionObserver) return;
    // autoplay is on the element, so the film still runs where the observer is
    // unavailable; the observer only stops it playing off screen
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { var p = en.target.play(); if (p && p.catch) p.catch(function () {}); }
        else en.target.pause();
      });
    }, { threshold: 0.2 }).observe(v);
    v.addEventListener('error', function () { v.parentNode.classList.add('no-video'); }, true);
  }

  /* -------------------------------------------------------------- parallax */
  function initParallax(root) {
    var items = [].slice.call(root.querySelectorAll('[data-parallax]'));
    if (reduced || !items.length) return;
    var queued = false;

    function frame() {
      queued = false;
      var box = root.getBoundingClientRect();
      // -1 as the band enters the bottom of the screen, 1 as it leaves the top
      var p = 1 - 2 * (box.top + box.height / 2) / window.innerHeight;
      items.forEach(function (el) {
        el.style.transform = 'translate3d(0,' + (p * Number(el.dataset.parallax)).toFixed(1) + 'px,0)';
      });
    }
    addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(frame);
    }, { passive: true });
    addEventListener('resize', frame);
    frame();
  }

  /* ----------------------------------------- proof story scroll (option c) */
  function initStory(track) {
    var pin = track.querySelector('.story-pin');
    var panels = [].slice.call(track.querySelectorAll('.st-panel'));
    var dots = [].slice.call(track.querySelectorAll('.story-dots span'));
    if (!pin || panels.length < 2) return;
    // Reduced motion leaves the panels as the plain column the CSS lays out,
    // so nothing is stamped and nothing is hidden.
    if (reduced) {
      panels.forEach(function (p) { p.classList.add('on'); });
      return;
    }

    var last = -1, queued = false;

    function frame() {
      queued = false;
      var span = track.offsetHeight - window.innerHeight;
      if (span <= 0) return;
      var p = (window.scrollY - track.offsetTop) / span;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      // the last panel holds the tail of the track, so the reader arrives at
      // the button rather than passing it
      var i = Math.min(panels.length - 1, Math.floor(p * panels.length));
      if (i === last) return;
      last = i;
      panels.forEach(function (el, k) { el.classList.toggle('on', k === i); });
      dots.forEach(function (el, k) { el.classList.toggle('on', k === i); });
      pin.setAttribute('data-panel', String(i));
    }

    addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(frame);
    }, { passive: true });
    addEventListener('resize', frame);
    frame();
  }

  [].forEach.call(document.querySelectorAll('[data-scroller]'), initScroller);
  [].forEach.call(document.querySelectorAll('[data-accordion]'), initAccordion);
  [].forEach.call(document.querySelectorAll('[data-map]'), initMap);
  [].forEach.call(document.querySelectorAll('[data-reveal]'), initReveal);
  [].forEach.call(document.querySelectorAll('[data-parallax-root]'), initParallax);
  [].forEach.call(document.querySelectorAll('[data-storyscroll]'), initStory);
  [].forEach.call(document.querySelectorAll('.proof-video'), initVideo);
})();
