/* The system section's scroll driver: one film, scrubbed.

   Four ideas, and nothing else in here:

   1. Scroll progress across the track is the only input. The track's box is
      measured on scroll while the loop is idle, and again whenever anything can
      have moved it: a ResizeObserver on the page and the track, the load and
      pageshow events, and a short watch after load while the opening runs. A
      cached box that goes stale is the whole bug this section used to have on
      a refresh: the driver measured the page mid opening, the overlay then came
      out from above the section, and every frame afterwards mapped scroll to a
      film time about a second wrong for as long as the reader stayed in it.
   2. The visual progress trails the scroll progress. Each frame it moves 12% of
      the remaining distance, which is the weighted feel oursnrg gets from
      scrub 0.6: the film follows the finger rather than being nailed to it.
   3. Progress maps onto the film's currentTime through a keyframed curve, not
      linearly. The stitch holds each state still for a beat, and spending
      scroll evenly across it would spend a real stretch of the track on frozen
      frames, which reads as scrolling and nothing happening. The curve gives
      each hold 2.5% of the track and splits the rest across the four
      transitions, so almost every scroll increment lands on a moving frame. The
      write is skipped unless it would move the film by more than one frame,
      because a seek inside a frame's worth of time costs a decode and shows
      nothing.
   4. Everything downstream is a pure function of video time, so scrubbing
      backwards is exactly as smooth as scrubbing forwards, and retiming the
      stitch retimes the copy without touching this file.

   The still stack is not a second implementation. It is the layout the section
   falls back to when the pin is off (narrow, reduced motion) and when the film
   will not load or decode, and it is the markup the copy lives in either way. */
(function () {
  'use strict';

  var track = document.getElementById('sysTrack');
  var pin = document.getElementById('sysPin');
  if (!track || !pin) return;

  var video = document.getElementById('sysVideo');
  var frames = [].slice.call(pin.querySelectorAll('.sys-step .sys-frame'));
  var texts = [].slice.call(pin.querySelectorAll('.sys-step .txt'));
  var ticks = [].slice.call(pin.querySelectorAll('.sys-ticks button'));
  var bar = pin.querySelector('.sys-bar i');

  // the stitch timeline, baked into the page by the builder so the film and the
  // copy cannot drift apart in a hand edit
  var WIN = JSON.parse(pin.dataset.windows || '[]');
  var CURVE = JSON.parse(pin.dataset.curve || '[]');
  var DUR = parseFloat(pin.dataset.duration || '0');

  var LERP = 0.12;      // fraction of the remaining distance travelled per frame
  var DEAD = 0.0004;    // under one frame of travel, so the loop can stop
  var FRAME = 0.042;    // one frame at 24fps: a smaller seek than this shows nothing
  var XFADE = 0.12;     // width of one still cross fade, in scroll progress
  var SWAP = 150;       // the outgoing copy is gone before the incoming starts
  var RETRY = 600;      // frames the loop keeps asking after a write was refused
  var GRACE = 350;      // ms a settled frame may be undelivered before the stack returns
  var FAR = 1.0;        // seconds behind that no scrub explains: a beat, not a frame or two
  var FAR_GRACE = 120;  // ms the stack waits when the film is that far behind

  var top = 0, span = 1;
  // active is the step on screen. Two values are not steps: NONE is the opening
  // hero, which deliberately carries no copy, and UNSET means nothing has been
  // painted yet. They have to be distinct, or arriving at the hero from the
  // unpainted state would match and the copy would never be cleared.
  var NONE = -1, UNSET = -2;
  var target = 0, vis = -1, running = false, active = UNSET, swapTimer = 0;
  var film = false, wrote = -1, want = -1, retries = 0;
  // shown is the film time the element has actually put on screen, which is the
  // only thing a reader can see. wrote is what the driver asked for, and the two
  // are the same number only once the seek behind it has answered.
  var shown = -1, staleAt = 0, stale = false;
  // HOLD is not a step. It is platesFilm saying it has no decoded picture to
  // put on screen, which is the one case where the copy must not move either.
  var HOLD = -3;
  var plateIn = [];      // has this plate decoded and can it be painted
  var lastPlate = -1;    // the last plate actually put on screen
  var warmed = false, filmAsked = false, filmTimer = 0;

  function unpinned() {
    return innerWidth < 900 ||
      (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function measure() {
    var r = track.getBoundingClientRect();
    top = r.top + (window.pageYOffset || document.documentElement.scrollTop);
    span = Math.max(1, track.offsetHeight - innerHeight);
  }

  /* Re-measure and take the scroll position as it is right now. `snap` is for
     arriving: a reload restores the reader mid pin, and the film has to be on
     the right frame there rather than sprint to it from the top. Without the
     snap the trailing lerp would play the whole film at the reader on load. */
  function resync(snap) {
    if (unpinned()) return;
    var before = top;
    measure();
    var y = window.pageYOffset || document.documentElement.scrollTop;
    target = clamp((y - top) / span);
    if (snap || vis < 0) vis = target;
    // a box that moved under a settled loop leaves the film on a stale frame,
    // so repaint even when the loop is idle and nothing else will
    if (snap || before !== top || !running) paint(vis);
    // even a snap starts the loop: its own paint can have its write refused,
    // and one frame that finds the film already there is free
    start();
  }

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* A write to currentTime is only worth making once the file can answer it.
     Without byte ranges a browser reports seekable as [0,0] and drops every
     seek on the floor, which looks exactly like a frozen section.

     Metadata is the whole bar. A seek is queued against the seekable range and
     honoured when the data lands, so an element that is mid seek, and reporting
     readyState 1 for as long as that takes, can still be told where to go next.
     Holding out for HAVE_CURRENT_DATA threw away every write made during a
     seek, which is most of the frames of a scrub and nearly all of a backward
     one, because a backward seek decodes from the keyframe before it. */
  function seekable() {
    return !!video && video.readyState >= 1 &&
      video.seekable && video.seekable.length > 0 &&
      video.seekable.end(video.seekable.length - 1) > 0;
  }

  /* Whether the reader is looking at the frame the last paint asked for.

     Accepting a write is not the same as showing a frame. currentTime takes the
     new value the moment it is assigned, whether or not the data behind it has
     arrived, so a seek into a stretch of the file the network has not reached
     yet reports the time that was asked for while the element still shows its
     last decode. Reading the answer off `wrote` is therefore the beat 05 bug:
     the copy, the ticks and the overlay are pure functions of the requested
     time, so they move to Operate and Optimise while the picture is left on the
     film's opening frame, bare ringed plots with no houses on them, and nothing
     downstream notices. `shown` is the presented frame instead. */
  function landed() {
    return !film || (shown >= 0 && Math.abs(shown - want) < FRAME);
  }

  /* The still stack is the fallback for a frame the film cannot deliver, not
     only for a film that never loads. While it is up the plates are painted
     from the film time the driver asked for, so the state on screen is the one
     the copy beside it describes and the swap back is a cut to the same
     picture. */
  function showStale(on) {
    if (on === stale) return;
    stale = on;
    pin.classList.toggle('film-stale', on);
    if (!on) frames.forEach(function (f) {
      f.style.opacity = ''; f.style.willChange = 'auto';
    });
  }

  /* The stack is hidden while the film has the section, and a hidden lazy image
     is never fetched, so the fallback has to be warmed before it is needed.

     Warming used to happen on adoption, which is the wrong cue twice over: the
     film adopting is exactly the case where the plates are not what is on
     screen, and on a slow connection the film is the last thing to arrive, so
     the plates were asked for last as well. The reader met the Design beat's
     words beside an empty box for as long as the network took. It is on
     approach to the section now, and it does not wait on the film for
     anything.

     Decoding is asked for as well as loading. A loaded image is still a blank
     box until it has been decoded, and the whole point of this is that no
     picture is claimed to be there before it can be painted. */
  function warmPlates() {
    if (warmed) return;
    warmed = true;
    frames.forEach(function (f) {
      var img = f.querySelector('img');
      if (img && img.loading === 'lazy') img.loading = 'eager';
    });
    trackPlates();
  }

  /* Which plates can be painted. This only watches, it fetches nothing: the
     first plate is eager in the markup and the other four are not, so on a page
     the reader never scrolls into this costs one listener each. It runs from
     init so the first plate is known to be paintable as early as it is
     paintable, which is what gives the section a picture and copy pair to hold
     while the later plates are still on the wire. */
  var tracked = false;

  function trackPlates() {
    if (tracked) return;
    tracked = true;
    frames.forEach(function (f, i) {
      var img = f.querySelector('img');
      if (!img) { plateIn[i] = true; return; }
      var settle = function () {
        var got = function () {
          plateIn[i] = true;
          if (!unpinned()) start();
        };
        if (typeof img.decode === 'function') img.decode().then(got, got);
        else got();
      };
      // a plate that will never arrive still has to stop holding the section up
      if (img.complete) settle();
      else {
        img.addEventListener('load', settle, { once: true });
        img.addEventListener('error', settle, { once: true });
      }
    });
  }

  /* The film is 12MB and the plates are the thing the reader is actually
     looking at while it downloads, so on a cold load the two are not allowed to
     race: the element is left at preload none in the markup and is only asked
     for once the plates are in, or once the wait for them has run long enough
     that holding the film back is costing more than it saves. */
  function kickFilm() {
    if (filmAsked || !video) return;
    filmAsked = true;
    video.preload = 'auto';
    try { video.load(); } catch (e) {}
    /* A source that never resolves is the same failure as one that errors. The
       wait is generous because the master is a 12MB file and a slow first byte
       is not a broken one; a late canplay still adopts after this has fallen
       back, so the cost of being patient is nothing and the cost of being hasty
       is a reader who gets the still stack on every cold load. The clock starts
       here rather than at load, because the fetch does. */
    clearTimeout(filmTimer);
    filmTimer = setTimeout(function () {
      if (!film && (!video.buffered || !video.buffered.length)) drop();
    }, 12000);
  }

  var PLATE_WAIT = 2200;   // how long the film is held back for the plates

  function approach() {
    warmPlates();

    var t0 = Date.now();
    var poll = function () {
      var all = true;
      for (var i = 0; i < frames.length; i++) if (!plateIn[i]) { all = false; break; }
      if (all || Date.now() - t0 > PLATE_WAIT) kickFilm();
      else setTimeout(poll, 120);
    };
    poll();
  }

  /* Scroll progress to film seconds, across the baked curve. Monotone and
     piecewise linear, so scrubbing back is the same walk in reverse and the
     lerp above is the only thing shaping the feel. Nine keyframes is short
     enough that a scan beats any cleverness. */
  function timeAt(p) {
    if (!CURVE.length) return p * DUR;
    for (var i = 1; i < CURVE.length; i++) {
      if (p <= CURVE[i][0]) {
        var a = CURVE[i - 1], b = CURVE[i];
        var w = b[0] - a[0];
        return w <= 0 ? b[1] : a[1] + (b[1] - a[1]) * (p - a[0]) / w;
      }
    }
    return CURVE[CURVE.length - 1][1];
  }
  function smooth(t) { t = clamp(t); return t * t * (3 - 2 * t); }

  /* The still stack's four cross fades sit on the midpoints between the five
     states and each is XFADE wide, so the opacities always sum to one and only
     ever two plates are above zero. Live only when the film is not. */
  function blend(i, p) {
    var mid = (i + 0.5) / 4;
    return smooth((p - (mid - XFADE / 2)) / XFADE);
  }

  /* The stack standing in for a frame the film owes. The film's own windows
     decide which state is up, not the scroll's midpoints, because the reader is
     inside a beat and the beat's state is what the copy beside them describes;
     the scroll blend would leave two thirds of state 5 under a third of state 4
     in the middle of Operate and Optimise, which is the half built scheme this
     fallback exists to avoid. The cross over sits in the last fifth of each
     window, so scrolling under the stack still dissolves rather than cuts. */
  function platesFilm(t) {
    var i = stepAt(t);
    if (i < 0) i = 0;
    /* A plate that has not decoded is a blank box, and blank is worse than
       late: the section stays on the last state it actually painted until the
       one the scroll asks for can be painted too. Until anything has decoded
       there is no such pair, so nothing is claimed and the section says it is
       waiting. The caller takes the returned index for the copy, so the words
       never run ahead of the picture. */
    var wait = 0;
    if (!plateIn[i]) {
      if (lastPlate < 0) {
        for (var z = 0; z < 5; z++) if (frames[z]) frames[z].style.opacity = 0;
        pin.classList.add('film-wait');
        return HOLD;
      }
      i = lastPlate;
      wait = 1;
    }
    lastPlate = i;
    pin.classList.remove('film-wait');
    var w = WIN[i];
    var f = w && w[1] > w[0] ? (t - w[0]) / (w[1] - w[0]) : 0;
    // the cross fade only runs into a plate that is there to fade into
    var next = (wait || i >= WIN.length - 1 || !plateIn[i + 1])
      ? 0 : smooth((f - 0.82) / 0.18);
    for (var k = 0; k < 5; k++) {
      var op = k === i ? 1 - next : (k === i + 1 ? next : 0);
      var fr = frames[k];
      if (fr) {
        fr.style.opacity = op;
        fr.style.willChange = op > 0 && op < 1 ? 'opacity' : 'auto';
      }
    }
    return i;
  }

  function plates(p) {
    var b = [blend(0, p), blend(1, p), blend(2, p), blend(3, p)];
    for (var i = 0; i < 5; i++) {
      var op = (i === 0 ? 1 : b[i - 1]) - (i === 4 ? 0 : b[i]);
      if (op < 0) op = 0;
      var f = frames[i];
      if (f) {
        f.style.opacity = op;
        f.style.willChange = op > 0 && op < 1 ? 'opacity' : 'auto';
      }
    }
  }

  /* Which step the film is currently showing. The windows are video seconds, so
     the answer is the render's own answer, not a guess made from scroll.

     Any time before the first window opens is NONE and the copy column is
     empty. That guard earned its keep against the old stitch, which opened on a
     hero aerial of the finished estate: a prologue belonging to no step, since
     step 01's words over an already built scheme are the mismatch this section
     exists to avoid. The single take has no such preamble, so the builder now
     sets the first window to zero and the guard never fires. It stays because
     the rule is the driver's, not this film's. */
  function stepAt(t) {
    if (WIN.length && t < WIN[0][0]) return NONE;
    for (var i = 0; i < WIN.length; i++) if (t < WIN[i][1]) return i;
    return WIN.length - 1;
  }

  /* No night. The film this section scrubs is one constant daylight take from
     the first frame to the last: sampled every eighth of a second, mean frame
     luminance sits between 172.8 and 195.7 and is 180.5 on the final frame,
     higher than it is in the middle of the take. There is nothing to darken
     for, so the darkness reading and its four measured shoulders are gone
     rather than left in writing a permanent zero.

     The feather mask in system.css stays. It was never the night's: it exists
     because the render carries its own near white ground, lighter than the
     page's stone, and an untreated frame reads as a white rectangle pasted onto
     the section. --sys-dark simply falls back to 0 there now, which is the
     daylight edge the mask was always built around. */

  function copy(step) {
    if (step === active) return;
    var prev = active;
    active = step;
    // step 0 on the pin means the prologue: no step lit, no words on screen
    pin.dataset.step = String(step + 1);
    ticks.forEach(function (t, i) { t.classList.toggle('on', i === step); });
    clearTimeout(swapTimer);
    if (prev >= 0 && texts[prev]) {
      texts[prev].classList.remove('on');
      texts[prev].classList.add('out');
    }
    var show = function () {
      texts.forEach(function (t, i) {
        t.classList.toggle('on', i === active);
        if (i === active) t.classList.remove('out');
      });
    };
    if (prev < 0) show(); else swapTimer = setTimeout(show, SWAP);
  }

  function paint(p) {
    var t = timeAt(p);
    // which plate the stack actually has on screen, or -1 when the film has it
    var painted = -1;

    if (film) want = t;

    if (film && seekable()) {
      /* A second write while the first is still decoding cancels it, so a scrub
         that writes every frame throws away most of the frames it asks for and
         the picture crawls. While the scroll is still moving the loop lets the
         seek under way finish and asks again on the next frame, which is one
         decode per decode. A settled scroll is the other case: that frame is
         the one the reader is left looking at, so it is worth preempting for. */
      var busy = video.seeking && Math.abs(target - vis) >= DEAD;
      // one frame of dead band: seeking less than this is a decode for nothing
      if (!busy &&
          (wrote < 0 || Math.abs(t - wrote) >= FRAME || p === 0 || p === 1)) {
        // wrote is only advanced once the seek has been accepted, so a write
        // dropped before the data is there is retried rather than remembered
        try { video.currentTime = t; wrote = t; } catch (e) { wrote = -1; }
      }
    } else if (film) {
      // adopted but not yet seekable: leave the poster frame alone and come
      // back to it, rather than recording a write that never landed
      wrote = -1;
    } else {
      // no film: the stack is the artwork, and it takes the same windows the
      // copy does, so the state on screen and the words beside it are the same
      // step at every scroll position
      if (WIN.length) painted = platesFilm(t); else plates(p);
    }

    /* Is the reader looking at the frame this paint asked for. A scrub is not a
       stall: while the scroll is still moving every frame is on its way to the
       next one, so the clock only starts once it has settled, and the stack
       comes up only if the film is still behind GRACE later. Once it is up it
       stays up until the film delivers, and it is painted from the same film
       time, so scrolling on under it shows the right state. */
    if (film) {
      if (landed()) { staleAt = 0; showStale(false); }
      else {
        var now = Date.now();
        /* A scrub is not a stall, so a moving scroll normally keeps the clock
           at zero and the stack down. A film a whole beat behind is the
           exception: nothing about scrolling explains it, it is a seek the
           file has not answered, and waiting for the reader to settle before
           admitting it is what leaves the opening frame standing under a later
           step's copy for as long as the travel lasts. */
        var far = shown < 0 || Math.abs(shown - want) > FAR;
        if (Math.abs(target - vis) >= DEAD && !far) staleAt = 0;
        else if (!staleAt) staleAt = now;
        if (stale || (staleAt && now - staleAt > (far ? FAR_GRACE : GRACE)))
          showStale(true);
        // a seek that ended without delivering the frame was dropped, so ask
        // again rather than sitting on a write that is remembered and gone
        if (stale && !video.seeking && video.readyState >= 1) wrote = -1;
      }
      if (stale) painted = platesFilm(want);
    }

    pin.style.setProperty('--sys-scale', (1.05 - 0.05 * p).toFixed(4));
    /* Progress is published twice, on purpose. The width write is what the
       rail has always taken; --sys-p is the same number as a fraction, which
       is what the rail reads now that it runs down the copy column's edge and
       fills by height. Both are one write of a value this function already
       has, and keeping the first means nothing else that watched the bar had
       to be found and changed. */
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    pin.style.setProperty('--sys-p', p.toFixed(4));

    /* The copy is the picture's caption, so it goes where the picture went. A
       step the stack could not draw is a step whose words have nothing to sit
       beside, and running the words on regardless is the thing this section
       must never do. */
    if (painted === HOLD) return;
    copy(painted >= 0 ? painted : stepAt(t));
  }

  /* The loop sleeps on two conditions, not one. Scroll having caught up is the
     first; the film having actually taken the frame it was given is the second.
     Sleeping on the first alone is what left the section stuck: the last write
     of a scrub is the one most likely to be refused, because the element is
     still mid seek from the write before it, and once the loop was asleep
     nothing asked again until the reader scrolled. The retry budget is frames,
     not milliseconds, so a file that will never answer costs a spin and stops
     rather than running for as long as the reader stays on the page. */
  function tick() {
    var d = target - vis;
    var moving = Math.abs(d) >= DEAD;
    vis = moving ? vis + d * LERP : target;
    paint(vis);
    if (moving) retries = 0;
    else if (landed() || ++retries > RETRY) { running = false; return; }
    requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    retries = 0;
    requestAnimationFrame(tick);
  }

  /* A seek that finishes, or data that arrives, is news the loop cannot see
     from scroll. Waking it costs one frame: if the film is already on the
     frame the scroll asks for, the dead band writes nothing and the loop goes
     straight back to sleep. */
  function revive() {
    if (film && !unpinned()) start();
  }

  /* Idle life. The film is scrubbed, so a reader who stops scrolling is left
     on one still frame, and a section this size going completely dead reads as
     broken rather than paused. Once the scroll has been quiet for IDLE and the
     pin is on screen, a class goes on and the sheet runs a slow breath on the
     frame and a pulse on the lit tick. Both are compositor properties on the
     artwork alone: no text moves, nothing here writes a style, and the class
     comes off on the first scroll event, so the scrub is never fighting an
     animation for the same transform. */
  var IDLE = 1100;
  var idleTimer = 0, idling = false, onScreen = true;

  function setIdle(on) {
    if (on === idling) return;
    idling = on;
    pin.classList.toggle('is-idle', on);
  }

  /* Called by everything that counts as the reader still moving. Stopping the
     loop is not the signal: the loop sleeps on a settled frame long before the
     reader has actually stopped scrolling. */
  function idleWake() {
    clearTimeout(idleTimer);
    setIdle(false);
    if (unpinned() || !onScreen) return;
    idleTimer = setTimeout(function () {
      if (!unpinned() && onScreen) setIdle(true);
    }, IDLE);
  }

  function onScroll() {
    if (unpinned()) return;
    // The track's box is re-read once per scroll burst, while the loop is idle,
    // and never again until the next one. That is the whole cost of being right
    // about where the section starts after a late font or a lazy image above it
    // has moved it, and it is nowhere near a frame.
    if (!running) measure();
    var y = window.pageYOffset || document.documentElement.scrollTop;
    target = clamp((y - top) / span);
    idleWake();
    start();
  }

  /* The film is only allowed to take the section over once it has enough data
     to answer a seek. Until then, and for good if it never does, the still
     stack is what is on screen. */
  function adopt() {
    if (film || unpinned() || !video) return;
    if (video.readyState < 2) return;
    film = true;
    wrote = -1;
    want = -1;
    shown = video.currentTime;
    staleAt = 0;
    pin.classList.add('has-film');
    warmPlates();
    frames.forEach(function (f) { f.style.opacity = ''; f.style.willChange = 'auto'; });
    // the film can arrive long after the reader has settled somewhere in the
    // pin, so take the scroll position as it is now and land on it
    resync(true);
  }

  function drop() {
    film = false;
    showStale(false);
    pin.classList.remove('has-film');
    if (!unpinned()) paint(vis < 0 ? 0 : vis);
  }

  function reset() {
    // the unpinned layout is the stacked one, so nothing the loop writes may
    // survive into it
    clearTimeout(swapTimer);
    clearTimeout(idleTimer);
    idling = false;
    pin.classList.remove('is-idle');
    film = false;
    showStale(false);
    wrote = -1;
    want = -1;
    shown = -1;
    staleAt = 0;
    active = UNSET;
    pin.classList.remove('has-film', 'film-wait');
    pin.dataset.step = '1';
    pin.style.removeProperty('--sys-scale');
    frames.forEach(function (f) { f.style.opacity = ''; f.style.willChange = 'auto'; });
    texts.forEach(function (t) { t.classList.remove('on', 'out'); });
    ticks.forEach(function (t, i) { t.classList.toggle('on', i === 0); });
    if (bar) bar.style.width = '';
    pin.style.removeProperty('--sys-p');
  }

  function init() {
    if (unpinned()) { reset(); return; }
    measure();
    var y = window.pageYOffset || document.documentElement.scrollTop;
    // the first paint snaps: the trailing lag is for scrolling, not for arriving
    target = clamp((y - top) / span);
    // arriving, not scrolling: the film starts on the reader's own frame
    vis = target;
    active = UNSET;
    wrote = -1;
    want = -1;
    shown = video ? video.currentTime : -1;
    staleAt = 0;
    showStale(false);
    trackPlates();
    if (video && video.readyState >= 2) film = true;
    if (film) warmPlates();
    pin.classList.toggle('has-film', film);
    paint(vis);
    idleWake();
  }

  if (video) {
    video.pause();
    /* What is actually on screen. Reading currentTime back in a seeked handler
       is not that: the property answers with the time that was last asked for,
       so a write made while the seek was still decoding would be recorded as
       delivered. requestVideoFrameCallback reports the presentation time of the
       frame the compositor really painted, so where it exists it is the only
       source for shown. A browser without it falls back to the seek reports,
       which are honest except in that race. */
    if (typeof video.requestVideoFrameCallback === 'function') {
      var onFrame = function (now, meta) {
        shown = meta.mediaTime;
        revive();
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      ['seeked', 'loadeddata'].forEach(function (e) {
        video.addEventListener(e, function () { shown = video.currentTime; });
      });
    }
    ['loadeddata', 'canplay', 'canplaythrough', 'seeked'].forEach(function (e) {
      video.addEventListener(e, adopt);
    });
    // adopt is a one time hand over, so once the film is in these have to wake
    // the loop as well, or a refused write waits for the reader to scroll again
    ['seeked', 'canplay', 'loadeddata', 'progress'].forEach(function (e) {
      video.addEventListener(e, revive);
    });
    video.addEventListener('error', drop);
  }

  /* Click to step. The ticks are the only control in the section, and what
     they move is the scroll, never the film: everything downstream is already
     a pure function of scroll position, so landing the reader on the right
     part of the track hands the copy and the picture over exactly as a scroll
     of their own would. Nothing above this line is involved.

     Where to land is timeAt read backwards. The curve is monotone and
     piecewise linear, so the inverse is the same walk with the pairs swapped,
     and the target is the middle of the step's own window rather than its
     start, which puts the reader inside the beat instead of on its edge. */
  function progressAt(t) {
    if (!CURVE.length) return DUR > 0 ? clamp(t / DUR) : 0;
    for (var i = 1; i < CURVE.length; i++) {
      if (t <= CURVE[i][1]) {
        var a = CURVE[i - 1], b = CURVE[i], w = b[1] - a[1];
        return clamp(w <= 0 ? b[0] : a[0] + (b[0] - a[0]) * (t - a[1]) / w);
      }
    }
    return 1;
  }

  ticks.forEach(function (t, i) {
    t.addEventListener('click', function () {
      if (unpinned() || !WIN[i]) return;
      measure();
      var p = progressAt((WIN[i][0] + WIN[i][1]) / 2);
      // a smooth scroll, so the film scrubs to the step rather than cutting to
      // it, and the reader can see which way along the track they travelled
      scrollTo({ top: top + p * span, behavior: 'smooth' });
    });
  });

  /* Approach, not arrival. A viewport and a half of warning is enough for the
     plates to be in before the reader can read a word of the beat they belong
     to, and it is the cue for the film as well. Without an observer there is no
     approach to wait for, so both happen now. */
  if (window.IntersectionObserver) {
    var near = new IntersectionObserver(function (es) {
      if (!es[es.length - 1].isIntersecting) return;
      near.disconnect();
      approach();
    }, { rootMargin: '150% 0px' });
    near.observe(track);
  } else {
    approach();
  }

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      onScreen = es[es.length - 1].isIntersecting;
      if (!onScreen) { clearTimeout(idleTimer); setIdle(false); } else idleWake();
    }, { threshold: 0 }).observe(pin);
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', init);

  /* Everything that can move the section under a cached measurement. The
     opening overlay coming out, a late font, a lazy image above, the browser
     restoring the scroll position after load, a bfcache restore: each of these
     is a box that moved with no scroll event to notice it. */
  addEventListener('load', function () { resync(true); });
  addEventListener('pageshow', function () { resync(true); });
  // a hidden tab delivers no animation frames, so the loop can be left holding
  // its running flag; coming back re-reads the page rather than trusting it
  addEventListener('visibilitychange', function () {
    if (!document.hidden) { running = false; resync(true); start(); }
  });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { resync(false); });
    ro.observe(track);
    ro.observe(document.documentElement);
  }
  // the opening runs for about two seconds, so the box is checked across it
  [120, 400, 900, 1600, 2600].forEach(function (ms) {
    setTimeout(function () { resync(false); }, ms);
  });

  init();
})();
