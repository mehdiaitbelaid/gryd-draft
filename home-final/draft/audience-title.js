/* The audience heading keeps one fixed reserve in the document while its
   visible copy becomes a compact sticky label. The sticky layer is bounded by
   the audience section, so the label releases at the section foot. */
(function () {
  'use strict';

  var sec = document.querySelector('[data-audience-title]');
  if (!sec) return;

  var head = sec.querySelector('.aud-head');
  var reserve = sec.querySelector('.aud-head-reserve');
  var queued = 0;
  var compactHeight = 0;

  function measure() {
    var was = sec.classList.contains('is-audience-compact');
    sec.classList.add('is-audience-measuring');
    sec.classList.remove('is-audience-compact');
    var full = head.getBoundingClientRect().height;
    sec.classList.add('is-audience-compact');
    var compact = head.getBoundingClientRect().height;
    sec.classList.toggle('is-audience-compact', was);
    sec.classList.remove('is-audience-measuring');

    if (full > 0) {
      sec.style.setProperty('--aud-head-reserve', Math.ceil(full) + 'px');
    }
    if (compact > 0) {
      compactHeight = Math.ceil(compact);
      sec.style.setProperty('--aud-head-compact', compactHeight + 'px');
    }
  }

  function read() {
    var y = window.scrollY || window.pageYOffset || 0;
    var box = sec.getBoundingClientRect();
    var top = box.top + y;
    var end = top + sec.offsetHeight - compactHeight;
    sec.classList.toggle('is-audience-compact', y >= top && y <= end);
  }

  function update() {
    if (queued) return;
    queued = window.requestAnimationFrame(function () {
      queued = 0;
      read();
    });
  }

  function reset() {
    measure();
    read();
  }

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', reset);
  addEventListener('load', reset);
  addEventListener('pageshow', reset);

  if (window.ResizeObserver) {
    var observer = new ResizeObserver(function () {
      var height = reserve.getBoundingClientRect().height;
      var set = parseFloat(getComputedStyle(sec).getPropertyValue('--aud-head-reserve'));
      if (Math.abs(height - set) > 1) reset();
      else read();
    });
    observer.observe(sec);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reset);
  reset();
})();
