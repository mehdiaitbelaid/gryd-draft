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
  var OUT = 180;
  var IN = 220;
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
    'body{transition:opacity ' + OUT + 'ms ease}' +
    'html.gryd-fade-out body{opacity:0}' +
    'html.gryd-fade-in body{opacity:0;transition:none}' +
    'html.gryd-fade-in-live body{opacity:1;transition:opacity ' + IN + 'ms ease}';
  (document.head || root).appendChild(st);

  /* ---------------------------------------------------------- the fade in */
  var arriving = false;
  try {
    arriving = sessionStorage.getItem(KEY) === '1';
    if (arriving) sessionStorage.removeItem(KEY);
  } catch (e) {}
  if (arriving) {
    root.classList.add('gryd-fade-in');
    var up = function () {
      requestAnimationFrame(function () {
        root.classList.add('gryd-fade-in-live');
        setTimeout(function () {
          root.classList.remove('gryd-fade-in', 'gryd-fade-in-live');
        }, IN + 60);
      });
    };
    if (document.readyState === 'complete') up();
    else addEventListener('load', up);
    /* a load event that never comes must not leave the page invisible */
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
    root.classList.remove('gryd-fade-out', 'gryd-fade-in', 'gryd-fade-in-live');
    try { sessionStorage.removeItem(KEY); } catch (x) {}
  });
  /* a same document history move (a hash back) is not a navigation either */
  addEventListener('popstate', function () {
    root.classList.remove('gryd-fade-out');
  });
})();
