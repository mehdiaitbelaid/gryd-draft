/* The pill's behaviour: concept B, the spotlight rail, hardened.

   The lab version drove the capsule with a css transition on transform and on
   width at once. That is where the judder came from, and it came from three
   separate places:

     a transition on width is a layout animation, so every frame of a travel
     relaid the bar out;

     one shared duration for x and for width means a long jump stretches, since
     the leading and the trailing edge are forced to arrive together;

     and a transition that is retargeted mid flight restarts from the current
     computed value with no velocity, so crossing three items quickly reads as
     three separate starts rather than one continuous move.

   So the capsule is on a spring here instead. x and width are two independent
   springs sharing one rAF loop, width stiffer than x so the shape settles
   before the travel does and the capsule never appears to stretch. Retargeting
   is a single assignment: the velocity carries through, which is exactly what
   makes an interrupted move look like one gesture. Both are damped at just
   under critical, so they arrive and stop rather than ringing.

   Everything the loop touches is transform and opacity. The capsule's box is
   sized once, off a cached measurement, and the travel is translate3d plus a
   scaleX off that base width, so no frame of the animation reads or writes
   layout. Geometry is measured on load, when the fonts land and on resize, and
   never inside the loop.

   The dropdown is a separate concern from the capsule on purpose. The capsule
   answers the pointer immediately, because it is the thing being pointed at;
   the panel waits out a 40ms hover intent, so skimming the bar end to end opens
   nothing. The glass never pops in, because the blur is painted by the
   stylesheet at all times and only opacity is animated.

   The narrow layout is untouched by all of this: below the breakpoint the tree
   is one panel the burger opens, the capsule is not rendered, and every wide
   only branch below is behind wide(). */
(function () {
  var mqWide = window.matchMedia && window.matchMedia('(min-width: 901px)');
  var mqCoarse = window.matchMedia && window.matchMedia('(hover: none)');
  var mqReduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)');

  var INTENT = 40;      // ms of dwell before the dropdown answers a pointer
  var PANEL = 340;      // ms the panel's own transition needs, for will-change
  var SPRING_X = { k: 340, z: 0.98 };
  var SPRING_W = { k: 560, z: 1.00 };
  var DT = 1 / 240;     // fixed sub-step, so the spring is frame rate honest
  var MAX_FRAME = 0.064;

  function wide() { return !mqWide || mqWide.matches; }
  function coarse() { return !!mqCoarse && mqCoarse.matches; }
  function reduced() { return !!mqReduced && mqReduced.matches; }

  function drive(s, target, dt, sp) {
    var c = 2 * sp.z * Math.sqrt(sp.k);
    s.v += (-sp.k * (s.p - target) - c * s.v) * dt;
    s.p += s.v * dt;
  }

  [].forEach.call(document.querySelectorAll('.dnav'), function (nav) {
    var cap = nav.querySelector('.cap');
    var burger = nav.querySelector('.dnav-burger');
    var parents = [].slice.call(nav.querySelectorAll('.has-menu'));
    var links = [].slice.call(nav.querySelectorAll('.links .link'));

    /* ------------------------------------------------------------ geometry */
    /* One measurement pass writes every number the pointer path and the spring
       are allowed to use. Nothing below this block reads layout. */
    var geo = new WeakMap();
    var navLeft = 0, base = 1, capH = 0, measured = false;

    function measure() {
      if (!links.length) return;
      var nr = nav.getBoundingClientRect();
      navLeft = nr.left;
      var total = 0;
      links.forEach(function (el) {
        var r = el.getBoundingClientRect();
        geo.set(el, {
          x: r.left - nr.left, y: r.top - nr.top, w: r.width, h: r.height,
          mid: r.left + r.width / 2, half: r.width / 2
        });
        total += r.width;
      });
      // the capsule is scaled rather than resized, so its own box is fixed. The
      // base is the mean item width, which keeps every scale factor near 1 and
      // the rounded ends from reading as ellipses at the extremes.
      base = Math.max(1, total / links.length);
      capH = geo.get(links[0]).h;
      if (cap) {
        cap.style.width = base + 'px';
        cap.style.height = capH + 'px';
      }
      measured = true;
      if (shown && anchor) target(anchor, drift);
    }

    function fresh() { if (!measured) measure(); }

    /* -------------------------------------------------------------- spring */
    var sx = { p: 0, v: 0 }, sw = { p: base, v: 0 };
    var tx = 0, tw = base, ty = 0;
    var raf = 0, last = 0, shown = false, anchor = null, drift = 0;

    function paint() {
      cap.style.transform = 'translate3d(' + sx.p + 'px,' + ty + 'px,0) scaleX('
        + (sw.p / base) + ')';
    }

    function settled() {
      return Math.abs(sx.p - tx) < 0.05 && Math.abs(sx.v) < 0.5
        && Math.abs(sw.p - tw) < 0.05 && Math.abs(sw.v) < 0.5;
    }

    function frame(now) {
      var dt = Math.min(MAX_FRAME, (now - last) / 1000) || DT;
      last = now;
      for (var t = 0; t < dt; t += DT) {
        drive(sx, tx, DT, SPRING_X);
        drive(sw, tw, DT, SPRING_W);
      }
      if (settled()) {
        sx.p = tx; sx.v = 0; sw.p = tw; sw.v = 0;
        paint();
        raf = 0;
        cap.style.willChange = '';
        return;
      }
      paint();
      raf = requestAnimationFrame(frame);
    }

    function run() {
      if (raf) return;
      cap.style.willChange = 'transform';
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function snap() {
      sx.p = tx; sx.v = 0; sw.p = tw; sw.v = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      cap.style.willChange = '';
      paint();
    }

    /* Retargeting is only this. The spring keeps whatever velocity it had, so a
       pointer crossing Hub, Tools and back is one continuous travel rather than
       three restarts, and there is nothing to interrupt or to cancel. */
    function target(el, lean) {
      var g = geo.get(el);
      if (!g) return;
      tx = g.x + (lean || 0);
      tw = g.w;
      ty = g.y;
      if (!shown || reduced()) { snap(); } else { run(); }
    }

    function capTo(el, lean) {
      if (!cap || !wide()) return;
      fresh();
      anchor = el; drift = lean || 0;
      target(el, lean);
      if (!shown) { shown = true; cap.style.opacity = '1'; }
    }

    function capOff() {
      if (!cap || openLi) return;
      shown = false; anchor = null; drift = 0;
      cap.style.opacity = '0';
    }

    /* ------------------------------------------------------- state machine */
    /* One target, one pending timer. Every entry and every exit goes through
       want(), so a pointer that leaves and comes back inside the intent window
       cancels its own close and nothing is ever committed twice. */
    var openLi = null, pendingLi = null, timer = 0, willTimer = 0;

    function expose(li, on) {
      var sub = li.querySelector('.submenu');
      if (!sub) return;
      clearTimeout(willTimer);
      sub.style.willChange = 'opacity';
      sub.firstElementChild.style.willChange = 'transform';
      willTimer = setTimeout(function () {
        sub.style.willChange = '';
        sub.firstElementChild.style.willChange = '';
      }, PANEL);
      li.classList.toggle('open', on);
      li.querySelector('button').setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    function commit(li) {
      if (li === openLi) return;
      if (openLi) expose(openLi, false);
      openLi = li;
      if (li) expose(li, true);
      if (!li) capOff();
    }

    function want(li) {
      if (pendingLi === li) return;
      pendingLi = li;
      clearTimeout(timer);
      timer = 0;
      if (li === openLi) return;          // back where we started, nothing to do
      timer = setTimeout(function () { timer = 0; commit(li); }, INTENT);
    }

    function shut() {
      clearTimeout(timer);
      timer = 0; pendingLi = null;
      commit(null);
      nav.classList.remove('menu-open');
      if (burger) burger.setAttribute('aria-expanded', 'false');
    }

    /* --------------------------------------------------------------- input */
    // one delegated listener rather than one per item, so a pointer crossing
    // the bar quickly cannot outrun the bindings
    nav.addEventListener('mouseover', function (e) {
      if (!wide() || coarse()) return;
      var el = e.target.closest ? e.target.closest('.links .link') : null;
      if (!el) return;
      capTo(el);
      want(el.parentNode.classList.contains('has-menu') ? el.parentNode : null);
    });

    // the magnetic lean. Cached geometry only, so this is arithmetic and not a
    // layout read, however fast the pointer moves.
    nav.addEventListener('mousemove', function (e) {
      if (!wide() || coarse() || !shown || !anchor) return;
      var g = geo.get(anchor);
      if (!g) return;
      var d = (e.clientX - g.mid) / g.half;
      drift = Math.max(-4, Math.min(4, d * 4));
      target(anchor, drift);
    });

    nav.addEventListener('mouseleave', function () {
      if (!wide() || coarse()) return;
      want(null);
      if (!openLi && !timer) capOff();
      else setTimeout(function () { if (!openLi) capOff(); }, INTENT + 20);
    });

    parents.forEach(function (li) {
      var btn = li.querySelector('button');
      // a tap is the whole interaction on a touch screen, and on a pointer it is
      // the way to close a panel the pointer is still sitting inside
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        clearTimeout(timer);
        timer = 0;
        pendingLi = li.classList.contains('open') ? null : li;
        commit(li.classList.contains('open') ? null : li);
      });
    });

    // the keyboard is the pointer's equal, minus the intent guard: a focus is
    // already deliberate, so it opens on the same frame
    links.forEach(function (el) {
      el.addEventListener('focus', function () {
        if (!wide()) return;
        capTo(el);
        clearTimeout(timer);
        timer = 0;
        pendingLi = el.parentNode.classList.contains('has-menu') ? el.parentNode : null;
        commit(pendingLi);
      });
    });
    nav.addEventListener('focusout', function (e) {
      if (!nav.contains(e.relatedTarget)) { shut(); capOff(); }
    });

    if (burger) {
      burger.addEventListener('click', function () {
        var on = nav.classList.toggle('menu-open');
        burger.setAttribute('aria-expanded', on ? 'true' : 'false');
        if (!on) commit(null);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { shut(); capOff(); }
    });
    document.addEventListener('click', function (e) {
      if (nav.contains(e.target)) return;
      shut(); capOff();
    });

    /* --------------------------------------------------------- measurement */
    measure();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {});
    }
    window.addEventListener('load', measure);
    // one measurement per resize, outside the loop, and the capsule re-targets
    // off it, so a window resized with the menu open lands correctly instead of
    // holding a stale rectangle
    var rz = 0;
    window.addEventListener('resize', function () {
      if (rz) cancelAnimationFrame(rz);
      rz = requestAnimationFrame(function () {
        rz = 0;
        measured = false;
        measure();
        if (!wide()) { shut(); capOff(); }
      });
    });

    /* The one handle this file hands out. The retraction below has to be able
       to close a panel that is open when the reader starts scrolling, and a
       dropdown left floating over the page with no bar under it is worse than
       no retraction at all. A property on the element rather than a global,
       because there can be more than one pill on a page and the lab has two. */
    nav.grydShut = function () { shut(); capOff(); };
  });
})();


/* The retraction: the bar at the top, a capsule once the reader is into the page.

   The two states are entirely in the stylesheet, on two classes on the root:
   nav-tuck says the reader has left the top, nav-peek says the bar is wanted
   back for the moment. This file only decides which are on. That split is what
   keeps the homepage's inline pill and every injected pill identical, since both
   carry this file and both carry draft.css's rules for those classes.

   Three things it is careful about.

   The first state is not animated. An arrival can restore a position most of the
   way down the page, and it does so repeatedly for over three seconds while the
   film section re-measures under it. The bar would otherwise be painted, then
   seen to retract. So the first sync runs before nav-live is on, which the
   stylesheet reads as no transitions at all, and the page opens already
   retracted. Transitions come on a frame after load, by which point the restore
   is putting the page back to a position that no longer changes the state.

   Hover is ignored on a coarse pointer. A tap on a touch screen synthesises a
   mouseenter, which would open the bar and then have the same tap's click close
   it again. There the capsule is a toggle and a tap anywhere else closes it,
   which is the whole interaction.

   And it never fights the opening. At the top of a page nav-tuck is off, so a
   first visit hands the corner lockup over to the full bar exactly as before;
   the stylesheet also names the capsule in the opening's own rule, so a
   preference or a reload that put the two together still resolves to the
   opening winning. */
(function () {
  var tab = document.querySelector('.dnav-tab');
  // the fixed pill only. The lab's benches are .cnav, are not fixed, and print
  // no capsule, so there is nothing here for them to do.
  var bar = document.querySelector('.dnav:not(.cnav)');
  if (!tab || !bar) return;

  var root = document.documentElement;
  var TUCK_AT = 140;    // past the bar's own height and a beat, so the top reads as the top
  var FREE_AT = 48;     // and hysteresis, so a scroll that hovers on the line does not flap
  var mqCoarse = window.matchMedia && window.matchMedia('(hover: none)');
  var mqCalm = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)');
  function coarse() { return !!mqCoarse && mqCoarse.matches; }
  function calm() { return !!mqCalm && mqCalm.matches; }
  function y() { return window.pageYOffset || root.scrollTop || 0; }

  var ARM = 340;        // the fade's own length, after which the bar is real
  /* Reading downward, the nav leaves; the smallest deliberate flick upward
     brings it back. UP_BACK is that flick, in pixels of accumulated upward
     travel, and ten is the middle of the eight to twelve Scott asked for: below
     about six a trackpad's own overscroll wobble brings the bar back on its
     own, and above about fifteen the gesture stops feeling like a reflex. */
  var UP_BACK = 10;
  var tucked = false, peeking = false, arm = 0;
  var away = false, lastY = 0, upRun = 0;

  function hide(on) {
    if (away === on) return;
    away = on;
    root.classList.toggle('nav-away', on);
    if (!on) return;
    // a bar leaving the screen takes its dropdown and its peek with it
    if (bar.grydShut) bar.grydShut();
    peek(false);
  }

  function peek(on) {
    if (peeking === on) return;
    peeking = on;
    root.classList.toggle('nav-peek', on);
    tab.setAttribute('aria-expanded', on ? 'true' : 'false');
    /* The bar's links are inert until the bar has finished arriving, so a click
       aimed at the capsule cannot land on whatever slid underneath it. Closing
       disarms on the same frame, because a bar on its way out must not catch a
       click meant for the page. */
    clearTimeout(arm);
    if (!on) { root.classList.remove('nav-peek-on'); return; }
    // there is no fade to wait out on reduced motion, so there is nothing for a
    // click to fall through
    if (calm()) { root.classList.add('nav-peek-on'); return; }
    arm = setTimeout(function () {
      if (peeking) root.classList.add('nav-peek-on');
    }, ARM);
  }

  function tuck(on) {
    if (tucked === on) return;
    tucked = on;
    root.classList.toggle('nav-tuck', on);
    // a panel that was open belongs to a bar that is going away
    if (bar.grydShut) bar.grydShut();
    if (!on) peek(false);
  }

  function sync() {
    var at = y();
    /* Mehdi, 3 September: the mark only capsule is no longer a scroll state. It
       was what the reader got back after flicking up, and it made them hover a
       mark to get a menu they had just asked for. Reading down still takes the
       nav off screen; coming back up returns the bar itself, links and call to
       action, with nothing to hover. TUCK_AT and FREE_AT keep their meaning for
       the direction layer below, which is the only thing left using them.
       tuck(false) rather than no call at all, so a page that opened retracted
       under the pre paint sync is put right on the first scroll. */
    tuck(false);

    /* The direction layer. The top of the page is always the full bar, so
       nothing is hidden there whichever way the reader arrived. Below it, any
       downward movement takes the nav off screen at once, and upward movement is
       accumulated rather than acted on per event: a single wheel notch is many
       small scroll events, and one stray upward pixel inside a downward gesture
       is not a request for the menu. */
    var dy = at - lastY;
    lastY = at;
    if (at <= TUCK_AT) { upRun = 0; hide(false); return; }
    if (dy > 0) { upRun = 0; hide(true); return; }
    if (dy < 0) {
      upRun -= dy;
      if (upRun >= UP_BACK) hide(false);
    }
  }

  /* --------------------------------------------------------------- input */
  tab.addEventListener('mouseenter', function () {
    if (!coarse() && tucked) peek(true);
  });

  /* Leaving is a position test rather than a mouseleave, and that is not
     fussiness. The bar arrives underneath a pointer that is already standing
     still on the capsule, and a browser does not reliably count a pointer as
     having entered an element that appeared under it without moving: on the
     injected pill it never did, so the bar opened and then would not close.
     Asking where the pointer actually is cannot fail that way.

     Both boxes are tested, with a few pixels of forgiveness, so a pointer
     skimming an edge does not flicker the bar shut and open again. The handler
     costs nothing when it is not needed: it returns on the first line unless the
     bar is currently open over the page. */
  var OUT = 8;         // px of forgiveness around either box
  var mm = 0;
  function outside(e) {
    var boxes = [bar.getBoundingClientRect(), tab.getBoundingClientRect()];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (!b.width && !b.height) continue;
      if (e.clientX >= b.left - OUT && e.clientX <= b.right + OUT
        && e.clientY >= b.top - OUT && e.clientY <= b.bottom + OUT) return false;
    }
    return true;
  }
  document.addEventListener('mousemove', function (e) {
    if (coarse() || !tucked || !peeking || mm) return;
    mm = requestAnimationFrame(function () {
      mm = 0;
      // an open dropdown is the reader mid gesture, and its panel hangs below
      // the bar, so the bar is not abandoned while one is up
      if (bar.querySelector('.has-menu.open')) return;
      if (outside(e)) peek(false);
    });
  }, { passive: true });
  // a tap is the whole interaction on a touch screen, and on a pointer it is the
  // way to pin the bar open without holding the pointer still
  tab.addEventListener('click', function (e) {
    e.preventDefault();
    if (tucked) peek(!peeking);
  });
  // the keyboard is the pointer's equal: reaching the capsule opens the bar, and
  // the capsule sits before the bar in the document so the next tab lands in it
  tab.addEventListener('focus', function () { if (tucked) peek(true); });
  document.addEventListener('focusin', function (e) {
    if (!tucked || !peeking) return;
    if (!bar.contains(e.target) && e.target !== tab) peek(false);
  });
  /* Closing on a click outside is geometry too, and for a reason worth naming.
     While the bar is arriving neither it nor the capsule takes pointer events,
     so a click on the spot they both occupy has document.body as its target and
     containment would call that "outside". A reader who moved to the capsule and
     clicked straight through would have opened the bar and shut it again in one
     gesture. Where the pointer is does not lie. */
  document.addEventListener('click', function (e) {
    if (!tucked || !peeking) return;
    // a real target inside either, which is also how a dropdown item is kept:
    // its panel hangs below the bar's own box and is not in that rectangle
    if (bar.contains(e.target) || tab.contains(e.target)) return;
    if (outside(e)) peek(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') peek(false);
  });

  /* --------------------------------------------------------- the clock */
  var pending = 0;
  addEventListener('scroll', function () {
    /* Before the page is live the answer is wanted on this frame, not the next.
       A browser restoring a position on a page that did not ask it to does so
       after this script has run and read a scroll of nought, so the first the
       retraction hears of it is this event; deferring it by a frame is a frame
       of the full bar lying across content the reader is already reading.
       Measured at two frames on a mid page reload before this branch existed.
       Transitions are still off at that point, so it is a state and not a jump. */
    if (!root.classList.contains('nav-live')) { sync(); return; }
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = 0; sync(); });
  }, { passive: true });
  addEventListener('resize', sync, { passive: true });

  /* The state the page opens in, set before anything can transition into it.
     lastY is seeded first so an arrival that restores a position halfway down
     the page is not read as the reader having scrolled there: the nav opens
     retracted into its capsule, which is the old behaviour, rather than opening
     hidden altogether. */
  lastY = y();
  sync();
  function live() {
    requestAnimationFrame(function () {
      sync();
      root.classList.add('nav-live');
    });
  }
  if (document.readyState === 'complete') live();
  else addEventListener('load', live);
})();
