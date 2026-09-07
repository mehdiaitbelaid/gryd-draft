/* Cookie banner and preferences manager for Google Consent Mode v2.
   The denied-by-default consent signals are set inline in every page head, so
   they are in place before Tag Manager loads. This file only shows the notice,
   records the visitor's answer, and sends the matching consent update. */
(function () {
  var KEY = "gryd_consent";
  var VERSION = 1;
  /* The homepage plays an intro over the whole page before the content rises
     into place. Hold the notice back until that has run, then a beat longer, so
     it does not land on top of the animation. Pages without an intro are
     unaffected and show it as soon as they are ready. */
  var AFTER_INTRO = 2500;
  var INTRO_CAP = 15000;
  var here = document.currentScript && document.currentScript.src;
  var base = here ? here.replace(/cookie-consent\.js.*$/, "") : "";
  var root = base ? new URL("../../", base).href : "";
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = base + "cookie-consent.css";
  document.head.appendChild(link);
  var bar = null, modal = null, lastFocus = null;
  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) { return null; }
      var v = JSON.parse(raw);
      return v && v.v === VERSION ? v : null;
    } catch (e) { return null; }
  }
  function write(state) {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  /* Push the answer to Google. Marketing covers the three ad signals, analytics
     covers measurement. Security and functionality never needed asking for. */
  function send(state) {
    var ads = state.marketing ? "granted" : "denied";
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        ad_storage: ads,
        ad_user_data: ads,
        ad_personalization: ads,
        personalization_storage: ads,
        analytics_storage: state.analytics ? "granted" : "denied"
      });
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "gryd_consent_update",
      consent_analytics: !!state.analytics,
      consent_marketing: !!state.marketing
    });
  }
  function save(analytics, marketing) {
    var state = {
      v: VERSION,
      analytics: !!analytics,
      marketing: !!marketing,
      at: new Date().toISOString()
    };
    write(state);
    send(state);
    hideBar();
    closeModal();
    return state;
  }
  function hideBar() { if (bar) { bar.hidden = true; } }
  function buildBar() {
    bar = document.createElement("div");
    bar.className = "cc-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Cookie notice");
    bar.innerHTML =
      '<p class="cc-say">We use cookies to keep the site working, to see how it is used, '
      + 'and to measure our advertising. You can accept all, reject all, or choose which '
      + 'ones we may set. Read our <a href="' + root
      + 'hub-directions/g/cookie-policy.html">cookie policy</a>.</p>'
      + '<div class="cc-acts">'
      + '<button type="button" class="cc-btn cc-key" data-cc="accept">Accept all</button>'
      + '<button type="button" class="cc-btn" data-cc="reject">Reject all</button>'
      + '<button type="button" class="cc-btn cc-quiet" data-cc="manage">Manage</button>'
      + "</div>";
    document.body.appendChild(bar);
  }
  function buildModal() {
    modal = document.createElement("div");
    modal.className = "cc-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="cc-scrim" data-cc="close"></div>'
      + '<div class="cc-panel" role="dialog" aria-modal="true" aria-labelledby="cc-h">'
      + '<h2 id="cc-h">Cookie preferences</h2>'
      + '<p class="cc-lede">Choose which cookies we may set. Your choice is kept on this '
      + 'device and you can change it any time from the footer.</p>'
      + cat("necessary", "Strictly necessary", "Needed for the site to work, such as "
        + "remembering this choice. They cannot be switched off.", true, true)
      + cat("analytics", "Analytics", "Google Analytics, so we can see which pages are "
        + "read and where visitors arrive from.", false, false)
      + cat("marketing", "Marketing", "Google Ads, so we can measure which campaigns "
        + "bring people here and show relevant ads.", false, false)
      + '<div class="cc-foot">'
      + '<button type="button" class="cc-btn cc-key" data-cc="save">Save preferences</button>'
      + '<span class="cc-spacer"></span>'
      + '<button type="button" class="cc-btn" data-cc="reject">Reject all</button>'
      + '<button type="button" class="cc-btn" data-cc="accept">Accept all</button>'
      + "</div></div>";
    document.body.appendChild(modal);
  }
  function cat(id, title, body, on, locked) {
    return '<div class="cc-cat"><div class="cc-cat-text"><h3>' + title + "</h3><p>"
      + body + '</p></div><label class="cc-sw"><input type="checkbox" id="cc-' + id
      + '" aria-label="' + title + '"' + (on ? " checked" : "")
      + (locked ? " disabled" : "") + "><span></span></label></div>";
  }
  function openModal() {
    var state = read();
    modal.querySelector("#cc-analytics").checked = !!(state && state.analytics);
    modal.querySelector("#cc-marketing").checked = !!(state && state.marketing);
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.querySelector('[data-cc="save"]').focus();
  }
  function closeModal() {
    if (!modal || modal.hidden) { return; }
    modal.hidden = true;
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
    lastFocus = null;
  }
  /* One delegated handler covers the banner and the panel, so the buttons that
     appear in both places do the same thing wherever they were clicked. */
  function onClick(e) {
    var hit = e.target.closest ? e.target.closest("[data-cc]") : null;
    if (!hit) { return; }
    var act = hit.getAttribute("data-cc");
    /* Footer trigger is a real link to the cookie policy, so it still leads
       somewhere with scripting off. With scripting on, open the panel instead. */
    if (hit.tagName === "A") { e.preventDefault(); }
    if (act === "accept") { save(true, true); }
    else if (act === "reject") { save(false, false); }
    else if (act === "save") {
      save(modal.querySelector("#cc-analytics").checked,
        modal.querySelector("#cc-marketing").checked);
    } else if (act === "manage") { openModal(); }
    else if (act === "close") { closeModal(); }
  }
  function onKey(e) { if (e.key === "Escape") { closeModal(); } }
  /* Two overlays run in sequence on the homepage: the spinning mark, then the
     logo film. The spinner is released the moment the film starts, so waiting on
     intro-rise alone would drop the notice on top of the film. Wait until both
     overlays have left the page. Anywhere else there is nothing to wait for. */
  function onScreen(id) {
    var el = document.getElementById(id);
    return !!(el && el.parentNode);
  }
  function introRunning() {
    var c = document.body.classList;
    if (c.contains("intro-playing") || c.contains("vid-playing")) { return true; }
    if (onScreen("grydVideo")) { return true; }
    return onScreen("grydIntro") && !c.contains("intro-rise");
  }
  function whenSettled(fn) {
    if (!introRunning()) { fn(); return; }
    var t0 = Date.now();
    /* Polled rather than observed: the film ends by removing its own wrapper,
       which a class observer on the body would not see. */
    var poll = setInterval(function () {
      if (introRunning() && Date.now() - t0 < INTRO_CAP) { return; }
      clearInterval(poll);
      setTimeout(fn, AFTER_INTRO);
    }, 150);
  }
  function start() {
    buildModal();
    if (!read()) { whenSettled(buildBar); }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
  }
  window.grydConsent = {
    open: function () { if (modal) { openModal(); } },
    get: read,
    acceptAll: function () { return save(true, true); },
    rejectAll: function () { return save(false, false); }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else { start(); }
})();
