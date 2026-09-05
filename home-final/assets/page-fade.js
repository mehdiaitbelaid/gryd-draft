/* Page to page crossfade. No cover, no logo, no wipe: the outgoing page fades
   to the paper ground, the incoming one fades up off it, and between the two
   the reader sees the ground and nothing else.

   Three rules decide when it runs.

   The fade out is unconditional on an internal link. Every same origin
   navigation this site makes goes through the one handler below, so the page
   the reader leaves always leaves the same way.

   The fade in is gated on sessionStorage rather than run on every load, and
   that is deliberate. A cold load of the homepage paints the opening cover on
   the first frame; starting that load at opacity nought would fade the cover in
   as well, which is a second arrival animation laid over the one the page
   already has. The flag is written by the fade out immediately before the
   navigation, so a page reached by a click fades up and a page reached by a
   typed url, a reload or a bookmark paints as it always did.

   Back is not a fade at all. A bfcache restore already has the finished page in
   memory, so pageshow clears every trace of the fade on the same frame it
   fires: a restored page that is still waiting on a transition is a blank
   screen, which is the one failure mode this file must not have.

   prefers-reduced-motion switches the whole thing off, links included. */
(function () {
  if (window.grydPageFade) return;
  window.grydPageFade = true;

  var GROUND = '#F8F6F2';
  var OUT = 160;
  var IN = 240;
  var KEY = 'gryd-page-fade';
  var root = document.documentElement;

  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  if (calm && calm.matches) return;

  /* The ground is painted on the root rather than on the body, so the colour
     the body fades into is already behind it and no frame of the fade shows
     the browser's own white. */
  var st = document.createElement('style');
  st.id = 'gryd-page-fade-css';
  st.textContent =
    'html{background:' + GROUND + '}' +
    'body{transition:opacity ' + OUT + 'ms cubic-bezier(.4,0,1,1)}' +
    'html.gryd-fade-out body{opacity:0}' +
    'html.gryd-fade-in body{opacity:0;transition:none}' +
    'html.gryd-fade-in-live body{opacity:1;transition:opacity ' + IN +
      'ms cubic-bezier(0,0,.2,1)}';
  (document.head || root).appendChild(st);

  /* ---------------------------------------------------------- the fade in */
  var arriving = false;
  try {
    arriving = sessionStorage.getItem(KEY) === '1';
    if (arriving) sessionStorage.removeItem(KEY);
  } catch (e) {}
  if (arriving) {
    /* gryd-arriving is the homepage cover's cue. The cover is a cold load's
       first paint guard, and a reader who clicked here from another page of
       this site has already watched the ground come up: a pulsing mark laid on
       top of that is a second arrival over the first, and it is what left a
       mark sitting still in the middle of the page while the body underneath it
       was held at nothing. */
    root.classList.add('gryd-fade-in', 'gryd-arriving');

    var started = false;
    var up = function () {
      if (started) return;
      started = true;
      requestAnimationFrame(function () {
        root.classList.add('gryd-fade-in-live');
        setTimeout(function () {
          root.classList.remove('gryd-fade-in', 'gryd-fade-in-live',
                                'gryd-arriving');
        }, IN + 60);
      });
    };

    /* The old gate was the load event, and on the homepage that event does not
       arrive for seconds: the failsafe was doing all the work and the fade in
       started a second and a half after the page it was fading in had painted.
       What the fade actually needs is a body to fade and the sheets that were
       already requested, so it waits for those and for nothing else. A page
       whose sheets are slower than the cap fades up regardless, which is the
       same bargain the cover makes. */
    var CAP = 600;
    var t0 = Date.now();
    var ready = function () {
      if (!document.body) return false;
      if (Date.now() - t0 >= CAP) return true;
      var links = document.querySelectorAll('link[rel="stylesheet"]');
      for (var i = 0; i < links.length; i++) {
        /* A sheet the page has deliberately taken off the critical path, by
           asking for it under a media query this window does not match, is not
           something the first paint is waiting on. Waiting on it here would put
           it straight back on the path the link was written to keep it off. */
        var m = links[i].media;
        if (m && m !== 'all') {
          var matched = true;
          try { matched = matchMedia(m).matches; } catch (e) {}
          if (!matched) continue;
        }
        var loaded = false;
        try { loaded = !!links[i].sheet; } catch (e) { loaded = true; }
        if (!loaded) return false;
      }
      return true;
    };
    var poll = function () {
      if (started) return;
      if (ready()) up();
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
    /* a page that never gets a body must still not stay invisible */
    setTimeout(up, 1200);
  }

  /* --------------------------------------------------------- the fade out */
  function internal(a, e) {
    if (e.defaultPrevented) return false;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (a.hasAttribute('download')) return false;
    var t = (a.getAttribute('target') || '').toLowerCase();
    if (t && t !== '_self') return false;
    var raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return false;
    var url;
    try { url = new URL(a.href, location.href); } catch (x) { return false; }
    if (url.origin !== location.origin) return false;
    /* a link to this page's own fragment is a scroll, not a navigation */
    if (url.pathname === location.pathname && url.search === location.search
        && url.hash) return false;
    return url;
  }

  addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var url = internal(a, e);
    if (!url) return;
    e.preventDefault();
    try { sessionStorage.setItem(KEY, '1'); } catch (x) {}
    root.classList.add('gryd-fade-out');
    var gone = false;
    var go = function () {
      if (gone) return;
      gone = true;
      location.href = url.href;
    };
    setTimeout(go, OUT);
  }, false);

  /* ------------------------------------------------------------ coming back */
  addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    root.classList.remove('gryd-fade-out', 'gryd-fade-in', 'gryd-fade-in-live',
                          'gryd-arriving');
    try { sessionStorage.removeItem(KEY); } catch (x) {}
  });
  /* a same document history move (a hash back) is not a navigation either */
  addEventListener('popstate', function () {
    root.classList.remove('gryd-fade-out');
  });
})();
