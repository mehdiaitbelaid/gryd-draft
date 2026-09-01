/* Written by _build_draft.py. Edit it there, not here. */
/* The driver. Their scroll handler, without GSAP and without Lenis.

   On their page ScrollTrigger creates one trigger per card at
   start "top top+=" + (header + row * index) and toggles classes on enter, and
   a section trigger toggles is-stack-compact. Their own no-ScrollTrigger
   fallback does the same arithmetic by hand in a rAF throttled scroll handler,
   and that is what is reproduced here, so the numbers below are theirs. */
(function () {
  var sec = document.querySelector('[data-pstack]');
  if (!sec) return;

  var intro = sec.querySelector('[data-pstack-intro]');
  var stack = sec.querySelector('[data-pstack-stack]');
  var cards = [].slice.call(sec.querySelectorAll('[data-pstack-card]'));
  var triggers = [].slice.call(sec.querySelectorAll('[data-pstack-trigger]'));
  var lastPanel = sec.querySelector('[data-pstack-last-panel]');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  var geom = { header: 0, row: 0, runway: 0 };
  var current = -1;
  var collapse = null;
  var queued = 0;

  function boxHeight(el) {
    if (!el) return 0;
    var r = el.getBoundingClientRect();
    return r.height > 0 ? r.height : 0;
  }

  function stacking() {
    return window.innerWidth >= 1024 && !calm.matches;
  }

  /* their M(): the header block, one row, and the runway that gives the last
     card somewhere to be scrolled through */
  /* The heading's height at full size, read once with the compaction lifted
     and its transition held. Everything is done inside one synchronous task,
     so no frame is ever painted in the uncompacted state. */
  var fullHeader = 0;
  var handover = 0;

  function measureFull() {
    var was = sec.classList.contains('is-stack-compact');
    sec.classList.add('is-measuring');
    sec.classList.remove('is-stack-compact');
    var h = boxHeight(intro);

    /* The handover is taken in this same lifted snapshot, so it is one fixed
       number rather than something that moves with the compaction: the point
       the last panel has finished wiping, measured against the end of the
       section, is how far the next band is brought up. */
    var last = cards.length - 1;
    var row = boxHeight(cards[0].querySelector('.pstack__row-wrap')) || geom.row;
    var lastH = cards[last].getBoundingClientRect().height;
    if (h > 0 && row > 0 && lastH > 0 && natural.length === cards.length) {
      var secBox = sec.getBoundingClientRect();
      var stackTop = stack.getBoundingClientRect().top - secBox.top;
      var pin = stackTop + natural[last] - (h + row * last);
      /* Their collapse reaches 1 at (progress - .52) / .26, so at .78. The
         next band has to be one screen further down than that, not level with
         it: a band is already climbing through the viewport a whole screen
         before its top reaches the top of it, and anchoring it to the wipe
         point buried the last project before it could be read. Landing its top
         at the foot of the screen as the wipe finishes means it arrives just
         as there stops being anything to look at. */
      /* The seam. As the wipe finishes, the next band's top should be sitting
         directly under the pinned rows, which is the first line of the screen
         that has nothing left on it. Level with the top of the screen and the
         band buries the last project before it can be read; a whole screen
         lower and it leaves the blank the wipe just made. The index's own
         height is the measure of it. */
      /* The index's depth, plus a little of the card's own travel. The wipe
         empties 650px of panel over about 170px of scroll, so the band cannot
         both track the wiping edge exactly and stay off the panel while it is
         still readable. This lands between the two: nothing readable is
         covered, and the band is in frame before the wipe is done. */
      var rows = h + row * cards.length;
      var wiped = pin + 0.78 * lastH;
      handover = Math.max(0, Math.round(secBox.height - wiped - rows - 0.19 * lastH));
      var host = sec.parentElement || sec;
      host.style.setProperty('--pstack-handover', handover + 'px');
    }

    if (was) sec.classList.add('is-stack-compact');
    sec.classList.remove('is-measuring');
    if (h > 0) fullHeader = h;
    return fullHeader;
  }

  function measure() {
    var header = boxHeight(intro) || geom.header;
    var row = boxHeight(cards[0].querySelector('.pstack__row-wrap')) || geom.row;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    // theirs, unchanged: max(round(.38 * vh), 3 * row, 280)
    var tail = Math.max(Math.round(0.38 * vh), 3 * row, 280);

    /* The runway reserves the height the heading gives up when it compacts.
       Their formula puts the header into the runway, so a compacting heading
       took its own height out of the section twice over: once from the band
       and once from the runway. That shortened the document by 94px the
       moment the reader passed the band, and every anchor landing measured
       before the pass then overshot by the same amount.

       Reserving it costs nothing at rest. With the heading at full size this
       is exactly their formula; as it compacts, the runway grows by whatever
       the band gave up, so section height = cards + 2 * full + row * (n - 1)
       + tail in every state, and the folds do not enter into it at all. */
    var full = fullHeader || header;
    var runway = row
      ? 2 * full + row * Math.max(cards.length - 1, 0) + tail - header
      : geom.runway;

    if (header === geom.header && row === geom.row && runway === geom.runway) return false;
    geom.header = header;
    geom.row = row;
    geom.runway = runway;
    sec.style.setProperty('--pstack-header-offset', header + 'px');
    sec.style.setProperty('--pstack-row-height', row + 'px');
    sec.style.setProperty('--pstack-stack-runway', runway + 'px');
    return true;
  }

  /* their L(): each card's own height pinned back as a custom property, so a
     card cannot collapse under the one stacked on top of it.

     The running total is kept at the same time. offsetTop cannot be used for
     it: Blink folds the sticky shift into offsetTop, so a pinned card reports
     the position it was pushed to rather than the one it belongs at, and every
     line read off it would drift once the stack engaged. Heights are unaffected
     by sticky, and the cards are the only in flow children before the runway
     with no margins between them, so the cumulative height is the natural top. */
  var natural = [];

  function lockHeights() {
    cards.forEach(function (c) {
      c.style.removeProperty('--pstack-card-height');
      c.classList.remove('is-retracted');
    });
    void sec.offsetHeight;
    var run = 0;
    natural = [];
    cards.forEach(function (c) {
      var wrap = c.querySelector('.pstack__row-wrap');
      var body = c.querySelector('.pstack__body');
      // The card's own parts are measured rather than its box. Its box is
      // whatever min-height currently allows, and reading that back into
      // min-height locks in the fallback instead of the real height: a panel
      // whose image had not landed yet measured short, and the card then had
      // nothing holding it open when the panel folded away.
      var bh = body ? body.getBoundingClientRect().height : 0;
      var h = (wrap ? wrap.getBoundingClientRect().height : 0) + bh;
      natural.push(run);
      if (h > 0) {
        c.style.setProperty('--pstack-card-height', h + 'px');
        run += h;
      }
    });
  }

  /* A card folds away the moment the next card's row reaches its content, so
     the incoming row never slides over copy that is still being read. The test
     uses the pinned row's own bottom and the panel height captured above, both
     stable, so it cannot oscillate. The last card has nothing coming for it. */
  function retract() {
    /* A card folds once it has been passed, which is the active state moving
       on to the next one.

       Measuring the overlap directly does not work here and it is worth
       saying why. The panels are contiguous and each one's content fills its
       whole card, so the next card's row starts overlapping the previous
       card's content the instant that card pins: a fold driven off the
       geometry would close the panel the reader had only just arrived at.
       The active boundary is the moment the next row lands on its own line,
       which is exactly when the previous panel stops being the one being
       read, and it carries no geometry feedback at all. */
    for (var k = 0; k < cards.length; k++) {
      cards[k].classList.toggle('is-retracted', k < current);
    }
  }

  function unretract() {
    cards.forEach(function (c) { c.classList.remove('is-retracted'); });
  }

  /* their A(t) */
  function setActive(t) {
    if (t === current) return;
    current = t;
    cards.forEach(function (c) {
      var on = parseInt(c.getAttribute('data-pstack-index'), 10) === t;
      c.classList.toggle('is-active', on);
      if (on) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    });
  }

  /* Their per card ScrollTrigger, start "top top+=" + (header + row * index).
     The line has to be read against the card's natural position in the
     document, not against its rect: these cards are sticky, so a pinned card
     reports a top of exactly its own line for the whole of the stack and would
     hold the state forever. ScrollTrigger measures the untransformed layout
     position, which offsetTop gives, and the triggers fire in document order,
     so the deepest card whose line has been crossed is the last onEnter and
     therefore the active one. The 2px snap band is theirs. */
  function lineFor(k) {
    var t = parseInt(cards[k].getAttribute('data-pstack-index'), 10);
    var stackTop = (window.scrollY || window.pageYOffset || 0)
                   + stack.getBoundingClientRect().top;
    return stackTop + (natural[k] || 0) - (geom.header + geom.row * t);
  }

  function pick() {
    var y = window.scrollY || window.pageYOffset || 0;
    var best = 0;
    for (var k = 0; k < cards.length; k++) {
      if (y >= lineFor(k) - 2) best = parseInt(cards[k].getAttribute('data-pstack-index'), 10);
    }
    setActive(best);
  }

  /* their S(e): the last panel wiped away from the bottom as the stack is left */
  function setCollapse(p) {
    p = Math.max(0, Math.min(1, p || 0));
    if (p === collapse || !lastPanel) return;
    collapse = p;
    var last = cards[cards.length - 1];
    last.style.setProperty('--pstack-last-collapse-progress', p.toFixed(4));
    var clip = 'inset(0 0 ' + (100 * p).toFixed(2) + '% 0)';
    lastPanel.style.clipPath = clip;
    lastPanel.style.webkitClipPath = clip;
    lastPanel.style.willChange = (p > 0 && p < 1) ? 'clip-path' : '';
  }

  /* their x(e), plus the runway keeping step with it.

     The compaction animates the heading's height over .24s, and the runway is
     sized against that height. A resize observer only samples it now and then,
     so the two drift by a few pixels for as long as the transition runs and
     the section breathes slightly. Re-measuring on every frame of the
     transition, and only then, holds them together. */
  var settling = 0;

  function followCompaction() {
    var until = performance.now() + 320;
    if (settling) return;
    (function step(now) {
      measure();
      settling = now < until ? window.requestAnimationFrame(step) : 0;
    })(performance.now());
  }

  function setCompact(on) {
    var was = sec.classList.contains('is-stack-compact');
    sec.classList.toggle('is-stack-compact', !!on);
    if (was !== !!on && !calm.matches) followCompaction();
  }

  function read() {
    if (!stacking()) {
      setCompact(false);
      setCollapse(0);
      unretract();
      if (current < 0) setActive(0);
      return;
    }
    var first = cards[0].getBoundingClientRect();
    setCompact(first.top <= geom.header + 2);
    pick();
    retract();

    /* Their last card's onUpdate: S((progress - .52) / .26), where progress
       runs that card's trigger from "top top+=line" to "bottom top+=line".
       Read off the natural position for the same reason pick() is. */
    var k = cards.length - 1;
    var h = cards[k].getBoundingClientRect().height || cards[k].offsetHeight || 0;
    var start = lineFor(k);
    var y = window.scrollY || window.pageYOffset || 0;
    var progress = h ? (y - start) / h : 0;
    setCollapse((progress - 0.52) / 0.26);
  }

  function onScroll() {
    if (queued) return;
    queued = window.requestAnimationFrame(function () {
      queued = 0;
      read();
    });
  }

  /* Their row click scrolls the card's own line to its offset. They hand that
     to Lenis at duration .95; without Lenis the same 950ms is run here on the
     expo out Lenis defaults to, so the travel feels the same. */
  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  var animating = 0;

  /* The target is a function, not a number, and is read again every frame.
     The line it aims at is measured off the header, and the header is still
     moving while the title compacts over its own .24s, so a target fixed at
     the moment of the click lands a few pixels short of the line and the row
     opens the card above the one that was asked for. Recomputing converges on
     the settled value instead. */
  function scrollTo(getY, ms) {
    if (animating) window.cancelAnimationFrame(animating);
    var from = window.scrollY || window.pageYOffset || 0;

    function target() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(Math.round(getY()), max));
    }

    if (calm.matches || Math.abs(target() - from) < 2) {
      window.scrollTo(0, target());
      return;
    }
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / ms);
      var to = target();
      window.scrollTo(0, p >= 1 ? to : from + (to - from) * easeOutExpo(p));
      if (p < 1) animating = window.requestAnimationFrame(step);
      else animating = 0;
    })(t0);
  }

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var t = parseInt(btn.getAttribute('data-pstack-target'), 10);
      if (Number.isNaN(t)) return;
      setActive(t);
      cards[t].classList.remove('is-retracted');
      if (!stacking()) {
        cards[t].scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      // theirs: stackTop + card.offsetTop - (header + row * index), with the
      // natural top standing in for the sticky shifted offsetTop
      scrollTo(function () { return lineFor(t); }, 950);
    });
  });

  function refresh() {
    measure();
    if (stacking()) lockHeights();
    measureFull();
    measure();
    if (stacking()) lockHeights();
    else cards.forEach(function (c) { c.style.removeProperty('--pstack-card-height'); });
    read();
  }

  refresh();
  // the panel images are lazy, so the first measure can be taken before they
  // have any height to give; each one re-measures the stack as it lands
  [].forEach.call(sec.querySelectorAll('.pstack__media img'), function (img) {
    if (!img.complete) img.addEventListener('load', refresh, { once: true });
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', refresh);
  window.addEventListener('load', refresh);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () { measure(); read(); }).observe(sec);
  }
  if (calm.addEventListener) calm.addEventListener('change', refresh);

  // expose the measured state so the gate can read it
  window.__pstack = { geom: geom, active: function () { return current; },
                      collapse: function () { return collapse; },
                      lines: function () { return cards.map(function (_, k) { return lineFor(k); }); } };
})();
