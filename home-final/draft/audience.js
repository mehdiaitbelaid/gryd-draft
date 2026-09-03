/* Entry motion for the developers and homeowners band, prototype D.
   The band fades in a column at a time, the title dash draws left to right and
   each row's hairline extends as the row arrives. Hover is the stylesheet's
   own, this file only decides when a part has landed and how far behind its
   neighbour it starts.
   The html element is marked js-aud first: draft.css hides the rest state only
   under that class, so a failure to load leaves the band readable rather than
   blank. Reduced motion lands every state in one pass, which keeps the hover
   states working while nothing moves. */
(function () {
  'use strict';

  var root = document.documentElement;
  var sec = document.querySelector('.a-ben');
  if (!sec) return;

  var calm = matchMedia('(prefers-reduced-motion: reduce)');
  var paths = [].slice.call(sec.querySelectorAll('.aud-path'));
  if (!paths.length) return;
  root.classList.add('js-aud');

  function rows(path) {
    return [].slice.call(path.querySelectorAll('.ticks li'));
  }

  // the dash rests at 84px, and it is drawn with a scale rather than a width so
  // the entry runs on the compositor. The factor is the 84px as a fraction of
  // the column the dash spans, so it has to be read back after every reflow.
  function measure() {
    paths.forEach(function (path) {
      var line = path.querySelector('.aud-keyline');
      if (!line) return;
      // offsetWidth is the laid out column, so it can be read while the dash
      // is still held at nought by its own scale
      var w = line.offsetWidth;
      if (w > 0) line.style.setProperty('--aud-key', Math.min(1, 84 / w).toFixed(4));
    });
  }

  // 90ms between the two columns, 60ms between neighbouring rows, and a
  // column's rows only start once its own title and dash have landed
  function plan(path, index) {
    var base = index * 90;
    path.style.setProperty('--d', base + 'ms');
    var line = path.querySelector('.aud-keyline');
    if (line) line.style.setProperty('--d', (base + 120) + 'ms');
    rows(path).forEach(function (li, i) {
      li.style.setProperty('--d', (base + 200 + i * 60) + 'ms');
    });
  }

  function land(path, index) {
    path.classList.add('in');
    rows(path).forEach(function (li, i) {
      var d = index * 90 + 200 + i * 60;
      if (calm.matches) { li.classList.add('in'); return; }
      setTimeout(function () { li.classList.add('in'); }, d);
    });
  }

  paths.forEach(plan);
  measure();

  var queued = 0;
  addEventListener('resize', function () {
    if (queued) return;
    queued = requestAnimationFrame(function () { queued = 0; measure(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  if (calm.matches || !('IntersectionObserver' in window)) {
    paths.forEach(land);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      measure();
      land(entry.target, paths.indexOf(entry.target));
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

  paths.forEach(function (p) { io.observe(p); });
})();
