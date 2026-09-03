/* The site assessment popup. Hand written, injected on every page by
   site-nav.js alongside site-assess-modal.css.

   Every Request a site assessment button on the site, the nav's included, keeps
   its href to hub-directions/g/request-site-assessment.html so a reader without
   this script, or one following a shared link, still lands somewhere real. With
   the script running the click opens this modal in place instead: the same
   three stages and the same twelve questions as the tools page, at the site's
   body sizes, in a plate that closes on Escape and hands focus back to the
   button that opened it.

   Nothing is posted anywhere yet. A chosen file is named back, never read. */
(function () {
  "use strict";

  var me = document.currentScript;
  var BASE = me ? me.src : location.href;
  var IMG = new URL("img/site-assess/", BASE).href;
  var HREF = "request-site-assessment.html";

  /* The stylesheet is fetched on the first open, not with the script. Every
     page on the site carries this file, and a sheet in the head is a sheet the
     browser waits on before it paints: the popup is behind a click and has no
     claim on the first frame of a page nobody has clicked yet. */
  function sheet(then) {
    var link = document.querySelector("link[data-assess-modal-css]");
    if (link) { return then(); }
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("site-assess-modal.css", BASE).href;
    link.setAttribute("data-assess-modal-css", "");
    var done = false;
    function go() { if (!done) { done = true; then(); } }
    link.onload = go;
    link.onerror = go;
    document.head.appendChild(link);
    /* a sheet that never answers must not cost the reader the popup */
    window.setTimeout(go, 400);
  }

  var BEDS = ["1 bed", "2 bed", "3 bed", "4 bed", "5 bed"];
  var TYPES = [["Detached", "type-detached"], ["Semi detached", "type-semi"],
               ["Terrace", "type-terrace"], ["Bungalow", "type-bungalow"],
               ["Apartments", "type-apartments"]];
  var PLANNING = ["Pre application", "Outline consent", "Reserved matters",
                  "Full consent", "On site"];
  var RETURNS = ["Indicative system design per plot", "Projected build cost savings",
                 "Energy performance modelling", "Simulated energy bill impact"];
  var STAGES = ["Introduction", "Details", "Your scheme"];

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  function row(lab, field, hint) {
    return '<div class="sam-row"><span class="sam-lab">' + esc(lab) + '</span><div>' + field
      + (hint ? '<p class="sam-hint">' + esc(hint) + "</p>" : "") + "</div></div>";
  }
  function text(key, type, ph, extra) {
    return '<input type="' + type + '" data-key="' + key + '" aria-label="' + esc(ph || key)
      + '" placeholder="' + esc(ph || "") + '"' + (extra || "") + ">";
  }
  function tiles(key, label, list) {
    return '<div class="sam-tiles" data-tiles="' + key + '" role="group" aria-label="' + esc(label) + '">'
      + list.map(function (it) {
          var val = it[0], img = it[1];
          return '<button type="button" class="sam-tile" aria-pressed="false" data-value="' + esc(val) + '">'
            + '<img src="' + IMG + img + '.png" alt="" width="300" height="300" decoding="async">'
            + '<span class="t-name">' + esc(val) + "</span></button>";
        }).join("") + "</div>";
  }

  function markup() {
    var beds = BEDS.map(function (v, i) { return [v, "beds-" + (i + 1)]; });
    var one = row("Site postcode", text("postcode", "text", "NR20 5DF"), "The postcode is enough to place it.")
      + row("Bedrooms", tiles("bedrooms", "Bedrooms", beds), "Pick every size on the scheme.")
      + row("Number of plots", text("plots", "number", "42", ' min="1" step="1" inputmode="numeric"'));
    var two = row("Full name", text("name", "text", "Jane Smith"))
      + row("Work email", text("email", "email", "jane@company.co.uk"))
      + row("Phone", text("phone", "tel", "07XXX XXX XXX"), "Optional.")
      + row("Company", text("company", "text", "Acme Homes"));
    var three = row("House types", tiles("types", "House types", TYPES),
                    "Pick every type on the scheme.")
      + row("Programme date", text("programme", "date", ""), "Roughly when construction starts.")
      + row("Planning status",
            '<div class="sam-seg-group" data-seg="planning" role="group" aria-label="Planning status">'
            + PLANNING.map(function (v) {
                return '<button type="button" class="sam-opt" aria-pressed="false" data-value="'
                  + esc(v) + '">' + esc(v) + "</button>";
              }).join("") + "</div>")
      + row("Site plan",
            '<div class="sam-drop" data-drop="plan" tabindex="0" role="button" aria-label="Add your site plan">'
            + '<div class="inner"><p class="d-line">Drop your site plan here, or choose a file</p>'
            + '<p class="d-sub">A PDF or an image of the layout is enough to start.</p>'
            + '<input type="file" hidden></div></div>')
      + row("Tell us about your site",
            '<textarea data-key="notes" aria-label="Tell us about your site"'
            + ' placeholder="Where is it? How many units? When does construction start?"></textarea>',
            "Optional, and a sentence is plenty.");

    var returns = '<ul class="sam-returns">' + RETURNS.map(function (t, i) {
      return '<li><span class="n">0' + (i + 1) + "</span><span>" + esc(t) + "</span></li>";
    }).join("") + "</ul>";

    return '<div class="sam-box" role="dialog" aria-modal="true" aria-labelledby="samTitle">'
      + '<button type="button" class="sam-close" data-close aria-label="Close">&times;</button>'
      + '<div class="sam-prog">' + STAGES.map(function (s) {
          return '<div class="sam-seg"><span class="s-lab">' + esc(s) + '</span>'
            + '<span class="s-bar"><i></i></span></div>';
        }).join("") + "</div>"
      + '<div class="sam-body">'
      + '<section class="sam-pane" data-pane="0" hidden><span class="sam-eyebrow">Introduction</span>'
      + '<h2 id="samTitle">Where the site is and how big</h2>' + one + "</section>"

      /* What three answers buy, said plainly, and what they do not. No figure
         is put on the scheme here because none can be: the sizing is drawn off
         the roofs, and the roofs come with the drawings. */
      + '<section class="sam-pane sam-partial" data-pane="1" hidden>'
      + '<span class="sam-eyebrow">Partial response</span>'
      + "<h2>What we can say so far</h2>"
      + '<p class="sam-read" data-read></p>'
      + '<p class="sam-short">This is a partial answer. The four things below are drawn off the'
      + " roofs on your drawings, so they come with the full assessment:</p>"
      + returns
      + '<p class="sam-hint">Leave us a way to reach you and we will take it from there.</p>'
      + "</section>"

      + '<section class="sam-pane" data-pane="2" hidden><span class="sam-eyebrow">Details</span>'
      + "<h2>Who we send the numbers to</h2>" + two
      + '<p class="sam-gate" data-gate hidden>A name and a work email are all we need to reply.</p>'
      + "</section>"

      + '<section class="sam-pane" data-pane="3" hidden><span class="sam-eyebrow">Your scheme, optional</span>'
      + "<h2>The drawings and the programme</h2>"
      + '<p class="sam-short">Every answer here sharpens the assessment. None of them holds it up.</p>'
      + three + "</section>"

      + '<section class="sam-pane sam-done" data-pane="4" hidden><span class="sam-eyebrow">Request received</span>'
      + '<h2>Gryd will get back to <span class="flare">you.</span></h2>'
      + '<p class="stand">We have what we need to start. Here is what comes back:</p>'
      + returns + "</section>"
      + "</div>"
      + '<div class="sam-nav"><button type="button" class="sam-go" data-go>Continue</button>'
      + '<button type="button" class="sam-send" data-send hidden>Send now</button>'
      + '<button type="button" class="sam-back" data-back hidden>Back</button>'
      + '<span class="sam-count"></span></div>'
      + '<p class="sam-consent" hidden>By submitting you agree to be contacted about your scheme.'
      + " We’ll never share your details.</p>"
      + "</div>";
  }

  /* ------------------------------------------------------------------ state */

  var root = null, box, panes, segs, go, send, back, count, consent, gate;
  var at = 0, opener = null;
  /* the dash has three marks and the flow has five panes: the partial answer
     belongs to the questions that produced it, the confirmation to the last mark */
  var SEG_OF = [0, 0, 1, 2, 2];
  var PANE_DONE = 4, PANE_CONTACT = 2, PANE_SCHEME = 3;
  var values = {};

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
    send = root.querySelector("[data-send]");
    back = root.querySelector("[data-back]");
    gate = root.querySelector("[data-gate]");
    count = root.querySelector(".sam-count");
    consent = root.querySelector(".sam-consent");
    wire();
    show(0);
  }

  function wire() {
    root.addEventListener("input", function (ev) {
      var el = ev.target.closest("[data-key]");
      if (!el) { return; }
      values[el.getAttribute("data-key")] = el.value.trim();
      if (at === PANE_CONTACT) { gated(); }
    });
    root.addEventListener("click", function (ev) {
      if (ev.target === root) { close(); return; }
      var t = ev.target;
      if (t.closest("[data-close]")) { close(); return; }
      var tile = t.closest(".sam-tile");
      if (tile) {
        var group = tile.closest("[data-tiles]");
        tile.setAttribute("aria-pressed", tile.getAttribute("aria-pressed") === "true" ? "false" : "true");
        values[group.getAttribute("data-tiles")] = [].slice
          .call(group.querySelectorAll('.sam-tile[aria-pressed="true"]'))
          .map(function (b) { return b.getAttribute("data-value"); }).join(", ");
        return;
      }
      var opt = t.closest(".sam-opt");
      if (opt) {
        var seg = opt.closest("[data-seg]");
        [].slice.call(seg.querySelectorAll(".sam-opt")).forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === opt));
        });
        values[seg.getAttribute("data-seg")] = opt.getAttribute("data-value");
        return;
      }
      if (t.closest("[data-back]")) { show(at - 1); return; }
      if (t.closest("[data-send]")) { show(PANE_DONE); return; }
      if (t.closest("[data-go]")) { show(at + 1); }
    });

    /* the drop zone. A dropped or chosen file is named back, never read. */
    var zone = root.querySelector("[data-drop]");
    var input = zone.querySelector('input[type="file"]');
    var line = zone.querySelector(".d-line");
    function take(name) { zone.classList.add("has-file"); zone.classList.remove("is-over"); line.textContent = name; values.plan = name; }
    zone.addEventListener("click", function () { input.click(); });
    zone.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); input.click(); }
    });
    input.addEventListener("click", function (ev) { ev.stopPropagation(); });
    input.addEventListener("change", function () { if (input.files && input.files[0]) { take(input.files[0].name); } });
    ["dragenter", "dragover"].forEach(function (t) {
      zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.add("is-over"); });
    });
    ["dragleave", "dragend"].forEach(function (t) {
      zone.addEventListener(t, function () { zone.classList.remove("is-over"); });
    });
    zone.addEventListener("drop", function (ev) {
      ev.preventDefault();
      var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      take(f ? f.name : "Site plan added");
    });

    root.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.preventDefault(); close(); return; }
      if (ev.key !== "Tab") { return; }
      var can = [].slice.call(box.querySelectorAll(
        'button, [href], input:not([type="file"]), textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(function (el) { return !el.hidden && el.offsetParent !== null; });
      if (!can.length) { return; }
      var first = can[0], last = can[can.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
  }

  /* A name and a work email are the whole gate. Nothing past the contact pane
     is reachable without them, because a scheme nobody can reply to is not a
     lead, and the reader is told which one is missing rather than left with a
     button that does nothing. */
  function ready() {
    return !!(values.name && values.email && values.email.indexOf("@") > 0);
  }
  function gated() {
    var ok = ready();
    go.disabled = !ok;
    send.disabled = !ok;
    gate.hidden = ok;
  }

  /* The partial answer, in the reader's own terms: what they told us, read
     back, and the line about what is still missing. */
  function readback() {
    var el = root.querySelector("[data-read]");
    var has = [];
    if (values.plots) { has.push("a scheme of " + values.plots + " plots"); }
    if (values.bedrooms) { has.push("a " + values.bedrooms.toLowerCase() + " mix"); }
    if (values.postcode) { has.push("at " + values.postcode.toUpperCase()); }
    el.textContent = has.length
      ? ("We have " + has.join(", ") + ". That places the site and tells us the shape of the mix.")
      : "We have the start of it. Tell us where the site is and how big and we can place it.";
  }

  function show(i) {
    at = Math.max(0, Math.min(panes.length - 1, i));
    panes.forEach(function (p, n) { p.hidden = n !== at; });
    var mark = SEG_OF[at];
    segs.forEach(function (seg, n) {
      var bar = seg.querySelector("i");
      bar.style.width = n < mark ? "100%" : (n === mark ? (at === PANE_DONE ? "100%" : "50%") : "0%");
      seg.classList.toggle("on", n === mark);
      seg.classList.toggle("done", n < mark);
    });
    var done = at === PANE_DONE;
    if (at === 1) { readback(); }
    back.hidden = at === 0 || done;
    send.hidden = at !== PANE_CONTACT;
    consent.hidden = at !== PANE_CONTACT && at !== PANE_SCHEME;
    count.textContent = done ? "" : ["Stage 01 of 03", "Partial answer", "Stage 02 of 03",
                                     "Stage 03 of 03, optional"][at];
    go.textContent = done ? "Close"
      : (at === PANE_CONTACT ? "Add scheme details"
        : (at === PANE_SCHEME ? "Send to Gryd" : "Continue"));
    go.disabled = false;
    send.disabled = false;
    gate.hidden = true;
    if (at === PANE_CONTACT) { gated(); }
    if (done) { go.onclick = function () { close(); }; } else { go.onclick = null; }
    root.querySelector(".sam-body").scrollTop = 0;
    var first = panes[at].querySelector("input, textarea, button");
    if (first) { first.focus({ preventScroll: true }); }
  }

  /* ------------------------------------------------------------ open, close */

  function open(trigger) {
    sheet(function () {
      if (!root) { build(); }
      opener = trigger || null;
      root.hidden = false;
      document.documentElement.style.overflow = "hidden";
      requestAnimationFrame(function () { root.classList.add("open"); });
      show(at === 3 ? 0 : at);
    });
  }

  function close() {
    if (!root || root.hidden) { return; }
    root.classList.remove("open");
    document.documentElement.style.overflow = "";
    var back_to = opener;
    window.setTimeout(function () { root.hidden = true; }, 200);
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
