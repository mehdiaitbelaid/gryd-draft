/* The site assessment popup. Hand written, injected on every page by
   site-nav.js.

   Since 4 September the popup is the whole tool: one screen of questions,
   then a name and an email, then the full assessment summary. There is no
   teaser in between. The questions come from assess-inputs.js and the summary
   from assess-result.js, both of which the tools page mounts too, so this file
   only orchestrates: it owns the plate, the stage dash, the nav buttons and the
   gate, and nothing else.

   Every Request a site assessment button on the site, the nav's included, keeps
   its href to hub-directions/g/request-site-assessment.html so a reader without
   this script, or one following a shared link, still lands somewhere real.

   Nothing is posted anywhere yet. sendLead is the one seam for that. */
(function () {
  "use strict";

  var me = document.currentScript;
  var BASE = me ? me.src : location.href;
  var HREF = "request-site-assessment.html";
  var STAGES = ["Your scheme", "Your details", "Your results"];

  function url(file) { return new URL(file, BASE).href; }

  /* Stylesheets are fetched on the first open, not with the script. Every page
     on the site carries this file, and a sheet in the head is a sheet the
     browser waits on before it paints: the popup is behind a click and has no
     claim on the first frame of a page nobody has clicked yet. */
  function css(file) {
    if (document.querySelector('link[data-assess-css="' + file + '"]')) { return; }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url(file);
    link.setAttribute("data-assess-css", file);
    document.head.appendChild(link);
  }

  /* then(true) only when the file actually ran. A script that 404s fires
     onerror, and treating that as a load left the popup opening on an engine
     that was never there. */
  function script(file, then, fallback) {
    var s = document.createElement("script");
    s.src = url(file);
    s.onload = function () { then(true); };
    s.onerror = function () {
      s.remove();
      if (fallback) { script(fallback, then, null); } else { then(false); }
    };
    document.head.appendChild(s);
  }

  /* The one swap point for the figures. It runs Scott's sheet arithmetic in
     the browser. assess-engine.js is on the server already but it only formats
     an API response and would put a live call, and a stored record, behind
     every click, so it is deliberately not loaded here. A later agent changes
     this one string and nothing else, as long as whatever it names leaves a
     compute on window.GrydAssess. */
  var ENGINE = "assess-engine.sheet.js";

  /* loaded is set only when all three files ran, so a failed fetch leaves the
     popup unbuilt and the next click tries again rather than opening an empty
     plate for the rest of the session. */
  var loading = false, loaded = false, waiting = [];
  function deps(then) {
    if (loaded) { return then(true); }
    waiting.push(then);
    if (loading) { return; }
    loading = true;
    css("site-modal.css");
    css("site-assess-modal.css");
    css("assess-inputs.css");
    css("assess-result.css");
    var left = 3, ok = true;
    function one(got) {
      if (!got) { ok = false; }
      if (--left) { return; }
      loading = false;
      loaded = ok;
      waiting.splice(0).forEach(function (f) { f(ok); });
    }
    script("assess-inputs.js", one);
    script("assess-result.js", one);
    script(ENGINE, one);
  }


  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function field(key, type, label, ph) {
    return '<div class="sam-field"><label for="sam-' + key + '">' + esc(label) + "</label>"
      + '<input type="' + type + '" id="sam-' + key + '" data-key="' + key
      + '" placeholder="' + esc(ph) + '"></div>';
  }

  function markup() {
    return '<div class="sam-box" role="dialog" aria-modal="true" aria-labelledby="samTitle">'
      + '<button type="button" class="sam-close" data-close aria-label="Close">&times;</button>'
      + '<div class="sam-prog">' + STAGES.map(function (s) {
          return '<div class="sam-seg"><span class="s-lab">' + esc(s) + "</span>"
            + '<span class="s-bar"><i></i></span></div>';
        }).join("") + "</div>"
      + '<div class="sam-body">'
      + '<section class="sam-pane" data-pane="0" hidden><h2 id="samTitle" class="sam-sr">'
      + "Site assessment</h2><div data-inputs></div></section>"

      + '<section class="sam-pane" data-pane="1" hidden>'
      + '<span class="sam-eyebrow">Your details</span>'
      + "<h2>Where should the assessment go?</h2>"
      + '<p class="sam-stand">The full summary opens as soon as you tell us who you are.</p>'
      + field("name", "text", "Full name", "Jane Smith")
      + field("email", "email", "Work email", "jane@company.co.uk")
      + '<p class="sam-gate" data-gate hidden>A name and a work email are all we need.</p>'
      + "</section>"

      + '<section class="sam-pane" data-pane="2" hidden>'
      + '<p class="sam-gate" data-sent hidden></p>'
      + "<div data-result></div></section>"
      + "</div>"
      + '<div class="sam-nav"><button type="button" class="sam-back" data-back hidden>Back</button>'
      + '<button type="button" class="sam-go" data-go>Continue</button>'
      + '<span class="sam-count"></span></div>'
      + '<p class="sam-consent" hidden>By submitting you agree to be contacted about your'
      + " scheme. We’ll never share your details.</p>"
      + "</div>";
  }

  /* ------------------------------------------------------------------ state */

  var root = null, box, panes, segs, go, back, count, consent, gate;
  var inputs = null, at = 0, opener = null, answers = null, lead = {};
  var PANE_INPUTS = 0, PANE_GATE = 1, PANE_RESULT = 2;

  /* The lead goes to Gryd's own API, the one the live tool calls, through
     assets/assess-lead.js. The popup is injected on pages that never name that
     file, so it pulls it in itself, once, beside its own script. The
     assessment renders whether or not the API answers, and a send that did not
     land says so over the summary with the send offered again. */
  (function () {
    if (document.querySelector("script[data-assess-lead]")) { return; }
    var me = document.currentScript
      || document.querySelector('script[src*="site-assess-modal.js"]');
    if (!me) { return; }
    var s = document.createElement("script");
    s.src = new URL("assess-lead.js", me.src).href;
    s.setAttribute("data-assess-lead", "");
    document.head.appendChild(s);
  })();

  /* the send in flight, so a second Continue or a second Try again cannot file
     the same reader twice, and the payload it carried, so Try again resends
     exactly what failed */
  var sending = false, lastPayload = null;

  function saidSent(ok) {
    var note = root && root.querySelector("[data-sent]");
    if (!note) { return; }
    note.hidden = ok;
    if (ok) { note.innerHTML = ""; return; }
    note.innerHTML = "We could not send your details, try again. "
      + '<button type="button" data-retry style="background:none;border:0;padding:0;'
      + 'font:inherit;color:inherit;text-decoration:underline;cursor:pointer">Try again</button>';
  }

  function sendLead(payload) {
    if (payload) { lastPayload = payload; window.grydAssessLead = payload; }
    if (!lastPayload || !window.GrydAssessLeadApi || sending) { return; }
    var res = null;
    try { res = window.GrydAssess.compute(lastPayload.inputs); } catch (err) { res = null; }
    sending = true;
    saidSent(true);
    window.GrydAssessLeadApi.send(lastPayload.inputs, res, lastPayload.lead)
      .then(function () { sending = false; saidSent(true); },
            function () { sending = false; saidSent(false); });
  }

  function build() {
    root = document.createElement("div");
    root.className = "sam";
    root.hidden = true;
    root.innerHTML = markup();
    document.body.appendChild(root);
    box = root.querySelector(".sam-box");
    panes = [].slice.call(root.querySelectorAll(".sam-pane"));
    segs = [].slice.call(root.querySelectorAll(".sam-seg"));
    go = root.querySelector("[data-go]");
    back = root.querySelector("[data-back]");
    gate = root.querySelector("[data-gate]");
    count = root.querySelector(".sam-count");
    consent = root.querySelector(".sam-consent");

    inputs = window.GrydAssessInputs.mount(
      root.querySelector("[data-inputs]"),
      function (vals) { answers = vals; show(PANE_GATE); },
      { onChange: function () { if (at === PANE_INPUTS) { paint(); } } });

    wire();
    show(0);
  }

  function wire() {
    root.addEventListener("input", function (ev) {
      var el = ev.target.closest("[data-key]");
      if (!el || !el.id || el.id.indexOf("sam-") !== 0) { return; }
      lead[el.getAttribute("data-key")] = el.value.trim();
      if (at === PANE_GATE) { paint(); }
    });

    root.addEventListener("click", function (ev) {
      if (ev.target === root) { close(); return; }
      if (ev.target.closest("[data-close]")) { close(); return; }
      if (ev.target.closest("[data-retry]")) { sendLead(null); return; }
      if (ev.target.closest("[data-back]")) { goBack(); return; }
      if (ev.target.closest("[data-go]")) { goNext(); }
    });

    root.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.preventDefault(); close(); return; }
      if (ev.key !== "Tab") { return; }
      var can = [].slice.call(box.querySelectorAll(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(function (el) { return !el.hidden && !el.disabled && el.offsetParent !== null; });
      if (!can.length) { return; }
      var first = can[0], last = can[can.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
  }

  function ready() {
    return !!(lead.name && lead.email && /.+@.+\..+/.test(lead.email));
  }

  function goNext() {
    if (at === PANE_INPUTS) { inputs.next(); return; }
    if (at === PANE_GATE) {
      if (!ready()) { gate.hidden = false; return; }
      sendLead({ lead: lead, inputs: answers });
      show(PANE_RESULT);
      return;
    }
    close();
  }

  function goBack() {
    if (at === PANE_INPUTS) { inputs.back(); paint(); return; }
    if (at === PANE_GATE) { show(PANE_INPUTS); return; }
    show(PANE_GATE);
  }

  function result() {
    var res = window.GrydAssess.compute(answers);
    var host = root.querySelector("[data-result]");
    window.GrydAssessResult.render(host, res, answers, {
      onRestart: function () { inputs.reset(); answers = null; show(PANE_INPUTS); }
    });
  }

  /* The dash, the counter and the buttons, all read off the same two numbers:
     which pane is open and, inside the questions, which screen. */
  function paint() {
    /* mount fires its first change while inputs is still being assigned, so
       everything here reads through the same guard rather than assuming it */
    if (!inputs) { return; }
    var screen = inputs.screen();
    var mark = at === PANE_INPUTS ? 0 : (at === PANE_GATE ? 1 : 2);
    var within = at === PANE_INPUTS ? (screen + 1) / inputs.total : 1;
    segs.forEach(function (seg, n) {
      seg.querySelector("i").style.width = n < mark ? "100%"
        : (n === mark ? Math.round(within * 100) + "%" : "0%");
      seg.classList.toggle("on", n === mark);
      seg.classList.toggle("done", n < mark);
    });
    back.hidden = at === PANE_INPUTS && screen === 0;
    consent.hidden = at !== PANE_GATE;
    gate.hidden = at !== PANE_GATE || ready() || !lead.name && !lead.email;
    /* The scheme is one screen now, so a step counter would count to one. It
       only appears if the questions are ever split again. */
    count.textContent = at === PANE_INPUTS
      ? (inputs.total > 1 ? "Step 0" + (screen + 1) + " of 0" + inputs.total : "Your scheme")
      : (at === PANE_GATE ? "Your details" : "Assessment summary");
    go.textContent = at === PANE_RESULT ? "Close"
      : (at === PANE_GATE ? "See my assessment" : "Continue");
    go.disabled = at === PANE_GATE ? !ready() : false;
    go.hidden = at === PANE_RESULT;
  }

  function show(i) {
    at = Math.max(0, Math.min(panes.length - 1, i));
    panes.forEach(function (p, n) { p.hidden = n !== at; });
    if (at === PANE_RESULT) { result(); }
    paint();
    root.querySelector(".sam-body").scrollTop = 0;
    var first = panes[at].querySelector("input, button");
    if (first) { first.focus({ preventScroll: true }); }
  }

  /* ------------------------------------------------------------ open, close */

  /* While the plate is up the page behind it is inert, not merely covered: a
     scrim stops a pointer but leaves the page's own buttons in the tab order
     and in every measurement taken of the screen. */
  function behind(off) {
    [].slice.call(document.body.children).forEach(function (el) {
      if (el === root) { return; }
      if (off) {
        el.setAttribute("data-sam-inert", "");
        el.setAttribute("inert", "");
        el.style.pointerEvents = "none";
      } else if (el.hasAttribute("data-sam-inert")) {
        el.removeAttribute("data-sam-inert");
        el.removeAttribute("inert");
        el.style.pointerEvents = "";
      }
    });
  }

  /* The plate is hidden a beat after the close so it can fade, and that beat
     is long enough to reopen inside. Every open and close takes the next
     generation, so a timer from a closed plate can only ever hide the plate it
     was started for, and the page behind is only made live again when the
     generation that made it inert is the one still standing. */
  var closeTimer = null, generation = 0;

  function open(trigger) {
    deps(function (ok) {
      /* nothing loaded, so there is nothing to open: let the link the reader
         clicked take them to the page version instead */
      if (!ok) {
        if (trigger && trigger.href) { window.location.href = trigger.href; }
        return;
      }
      if (!root) { build(); }
      generation += 1;
      if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = null; }
      opener = trigger || null;
      root.hidden = false;
      behind(true);
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(function () { root.classList.add("open"); });
    });
  }

  function close() {
    if (!root || root.hidden) { return; }
    var gen = (generation += 1);
    root.classList.remove("open");
    behind(false);
    document.documentElement.style.overflow = "";
    var back_to = opener;
    if (closeTimer) { window.clearTimeout(closeTimer); }
    closeTimer = window.setTimeout(function () {
      closeTimer = null;
      if (gen === generation) { root.hidden = true; }
    }, 200);
    if (back_to && back_to.focus) { back_to.focus(); }
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest ? ev.target.closest("a[href]") : null;
    if (!a || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button > 0) { return; }
    if (a.getAttribute("href").indexOf(HREF) === -1) { return; }
    ev.preventDefault();
    ev.stopPropagation();
    open(a);
  }, true);

  /* the shared link: request-site-assessment.html is a paper page that opens
     the popup over itself, so a link someone was sent still works */
  function auto() {
    if (document.body && document.body.hasAttribute("data-assess-open")) { open(null); }
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", auto); }
  else { auto(); }

  window.grydAssessModal = { open: open, close: close };
})();
