/* The FHS readiness tool on the hub.

   Three taps, then a name and an email, then the whole check. The verdict and
   every word of it come from fhs/pages/assess-model.js, which is the live
   tool's own logic and prose; this file only chooses what to send it and how
   the hub draws what comes back.

   Two rules shape the rendering. Nothing on the page may carry an en dash or an
   em dash, so every string out of the model runs through deDash on its way to
   the screen. And there is no green in the palette, so a measure says Pass,
   Close or Fails in words and takes a warm chip behind it. */
(function (w, d) {
  "use strict";

  var G = w.GRYD;
  var O = G.OPTIONS;
  var IMG = "../../home-final/assets/img/site-assess/";

  var TILE = {
    "Detached": "type-detached",
    "Semi-detached": "type-semi",
    "Terraced (mid)": "type-terrace",
    "Terraced (end)": "type-terrace",
    "Apartment": "type-apartments"
  };
  var BED_TILE = { 1: "beds-1", 2: "beds-2", 3: "beds-3", 4: "beds-4", 5: "beds-5" };

  /* The plot bands are the site assessment page's own bands. The band does not
     enter the model, which works a house type at a time; it sizes the scheme
     figure and tells us what kind of conversation this is. */
  var BANDS = [
    { v: "Under 20 plots", n: 15, lit: 5 },
    { v: "20 to 50 plots", n: 35, lit: 11 },
    { v: "50 to 100 plots", n: 75, lit: 17 },
    { v: "100 to 250 plots", n: 175, lit: 23 },
    { v: "Over 250 plots", n: 350, lit: 29 }
  ];

  var QUESTIONS = [
    { key: "type", lab: "House type", head: "Which house type are you checking?",
      sub: "Pick the one that runs most often on the scheme.", list: O.houseTypes },
    { key: "beds", lab: "Bedrooms", head: "How many bedrooms does it have?",
      sub: "The one the mix leans on is close enough.", list: O.bedrooms },
    { key: "plots", lab: "Scheme size", head: "How many plots on the scheme?",
      sub: "A band is all we need to size the exposure.", list: BANDS }
  ];

  var STATE = { green: "Pass", amber: "Close", red: "Fails" };

  var picked = { type: null, beds: null, plots: null };
  var contact = { name: "", email: "" };
  var opts = null;
  var at = 0;
  var adjusting = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function el(sel) { return d.querySelector(sel); }
  function done3() { return picked.type !== null && picked.beds !== null && picked.plots !== null; }

  /* The model's prose is the live tool's, written with en and em dashes. The
     house style has none, so a range becomes "to" and a parenthetical dash
     becomes a comma. Nothing else about the sentence moves. */
  function deDash(s) {
    return String(s)
      .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
      .replace(/\s*—\s*/g, ", ")
      .replace(/\s*–\s*/g, " to ");
  }
  function tidySpace(node) {
    var walk = d.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walk.nextNode())) {
      n.nodeValue = n.nodeValue.replace(/[ \u00a0]{2,}/g, " ").replace(/ (?=%)/g, "");
    }
  }

  function deDashTree(node) {
    var walk = d.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walk.nextNode())) {
      if (n.nodeValue.indexOf("–") > -1 || n.nodeValue.indexOf("—") > -1) {
        n.nodeValue = deDash(n.nodeValue);
      }
    }
  }

  /* ------------------------------------------------------------------ the model */

  /* The bedroom count follows the chosen type down to a key that type has a
     floor area for, so an apartment is never costed on a semi-detached area. */
  function clampBeds(a) {
    if (G.isSupported(a)) { return; }
    for (var i = O.bedrooms.length - 1; i >= 0; i -= 1) {
      if (G.isSupported({ houseType: a.houseType, bedrooms: O.bedrooms[i] })) {
        a.bedrooms = O.bedrooms[i];
        return;
      }
    }
  }

  /* The assumed spec, stated in full on the page under "What we assumed". Only
     the house type and the bedroom count come from the reader; the rest is a
     developer who has moved to a heat pump and a better than Part L fabric and
     has put a token array on the roof. Every value is held at one of the
     model's own option strings so nothing here can drift from it. */
  function assumed() {
    var a = G.defaults();
    a.houseType = O.houseTypes[picked.type];
    a.bedrooms = Number(O.bedrooms[picked.beds]);
    clampBeds(a);
    a.storeys = a.houseType === "Apartment" ? 1 : 2;
    a.heating = O.heating[1];
    a.hasSolar = true;
    a.panels = 4;
    a.hasBattery = false;
    a.partL = O.partL[1];
    a.ventilation = O.ventilation[1];
    a.airtightness = O.airtightness[1];
    a.glazing = O.glazing[1];
    a.hasWWHR = false;
    return a;
  }

  /* What the reader has changed under Adjust, over the top of the assumed spec. */
  function answers() {
    var a = assumed();
    if (opts) {
      a.storeys = opts.storeys;
      a.partL = opts.partL;
      a.ventilation = opts.ventilation;
      a.hasSolar = opts.hasSolar;
      a.panels = opts.hasSolar ? opts.panels : 0;
      a.hasBattery = opts.hasBattery;
    }
    return a;
  }

  function schemeKwp(r) {
    return Math.round(r.grydKwp * BANDS[picked.plots].n / 5) * 5;
  }

  /* ------------------------------------------------------------------ the quiz */

  function plotArt(band) {
    var out = "";
    for (var i = 0; i < 32; i++) {
      out += "<span" + (i < band.lit ? ' class="lit"' : "") + "></span>";
    }
    return '<span class="fhs-plots" aria-hidden="true">' + out + "</span>";
  }

  function tile(q, item, i) {
    var art, name;
    if (q.key === "type") {
      art = '<img src="' + IMG + TILE[item] + '.png" alt="" width="300" height="300" decoding="async">';
      name = item;
    } else if (q.key === "beds") {
      art = '<img src="' + IMG + BED_TILE[item] + '.png" alt="" width="300" height="300" decoding="async">';
      name = item + " bed";
    } else {
      art = plotArt(item);
      name = item.v;
    }
    return '<button type="button" class="f-tile" aria-pressed="false" data-q="' + q.key
      + '" data-i="' + i + '">' + art + '<span class="t-name">' + esc(name) + "</span></button>";
  }

  function quiz() {
    var prog = '<div class="fhs-prog" aria-hidden="true">'
      + QUESTIONS.map(function () { return "<i></i>"; }).join("") + "</div>";
    var qs = QUESTIONS.map(function (q, n) {
      return '<section class="fhs-q" data-qn="' + n + '"' + (n ? " hidden" : "") + '>'
        + '<span class="eyebrow">' + esc(q.lab) + "</span>"
        + "<h2>" + esc(q.head) + "</h2>"
        + '<p class="q-sub">' + esc(q.sub) + "</p>"
        + '<div class="f-tiles" role="group" aria-label="' + esc(q.head) + '">'
        + q.list.map(function (it, i) { return tile(q, it, i); }).join("") + "</div>"
        + '<div class="fhs-nav">'
        + (n ? '<button type="button" class="fhs-back" data-back>Back a step</button>' : "")
        + '<span class="fhs-count">Step 0' + (n + 1) + " of 03</span></div>"
        + "</section>";
    }).join("");
    el("[data-quiz]").innerHTML = prog + qs;
    showQ(0);
  }

  function showQ(n) {
    at = n;
    var qs = d.querySelectorAll(".fhs-q");
    for (var i = 0; i < qs.length; i++) { qs[i].hidden = i !== n; }
    var bars = d.querySelectorAll(".fhs-prog i");
    for (var k = 0; k < bars.length; k++) {
      bars[k].className = k < at ? "done" : (k === at ? "on" : "");
    }
  }

  /* ------------------------------------------------------------------- the card */
  /* The card is empty until the third tap. Then it carries the two fields, and
     the result renders in its place once they are sent. */

  function card() {
    var box = el("[data-card]");
    box.innerHTML = '<span class="eyebrow">Almost there</span>'
      + "<h2>Who do we send the check to?</h2>"
      + '<p class="q-sub">A name and a work email are all we need. The full readiness check for this house type lands on this page.</p>'
      + '<div class="f-rows">'
      + '<div class="f-row"><span class="f-lab">Full name</span><div class="f-in">'
      + '<input class="f-text" type="text" data-k="name" aria-label="Full name" placeholder="Jane Smith" autocomplete="name"></div></div>'
      + '<div class="f-row"><span class="f-lab">Work email</span><div class="f-in">'
      + '<input class="f-text" type="email" data-k="email" aria-label="Work email" placeholder="jane@company.co.uk" autocomplete="email"></div></div>'
      + "</div>"
      + '<button type="button" class="f-submit" data-send disabled>See your readiness check</button>'
      + '<p class="f-consent">Gryd stores the name and the email to send the check and to talk about the standard. Nothing else.</p>';
    box.hidden = false;
  }

  function gated() {
    var ok = !!(contact.name && contact.email.indexOf("@") > 0);
    var send = el("[data-send]");
    if (send) { send.disabled = !ok; }
    return ok;
  }

  /* Nothing leaves the browser. The lead is held here until the HubSpot form is
     wired up.
     TODO: post the lead to HubSpot once Scott has the portal id and the form
     guid for the FHS tool. Until then this is deliberately inert. */
  function sendLead(lead) {
    return lead;
  }

  /* ----------------------------------------------------------------- the result */

  function specRows(a) {
    var rows = [
      ["Heating", a.heating],
      ["Storeys", a.storeys],
      ["Part L target", a.partL],
      ["Ventilation", a.ventilation],
      ["Airtightness", a.airtightness],
      ["Glazing", a.glazing],
      ["Solar in spec", a.hasSolar ? a.panels + " panels" : "None"],
      ["Battery in spec", a.hasBattery ? "Yes" : "No"],
      ["Plots on the scheme", BANDS[picked.plots].v]
    ];
    return rows.map(function (r) {
      return '<div class="s-row"><dt>' + esc(deDash(r[0])) + "</dt><dd>"
        + esc(deDash(r[1])) + "</dd></div>";
    }).join("");
  }

  function seg(key, list, value) {
    return '<div class="f-seg" role="group" aria-label="' + esc(key) + '">'
      + list.map(function (o) {
          return '<button type="button" class="seg" data-opt="' + esc(key) + '" data-value="'
            + esc(o) + '" aria-pressed="' + (String(o) === String(value)) + '">'
            + esc(deDash(o)) + "</button>";
        }).join("") + "</div>";
  }

  function optRow(lab, control) {
    return '<div class="f-row"><span class="f-lab">' + esc(lab) + '</span><div class="f-in">'
      + control + "</div></div>";
  }

  function optsPanel() {
    return '<div class="fhs-opts" data-opts' + (adjusting ? "" : " hidden") + '>'
      + optRow("Part L target", seg("partL", O.partL, opts.partL))
      + optRow("Solar in spec", seg("hasSolar", ["Yes", "No"], opts.hasSolar ? "Yes" : "No"))
      + optRow("Panels", seg("panels", [2, 4, 8, 12, 16, 20], opts.panels))
      + optRow("Ventilation", seg("ventilation", O.ventilation, opts.ventilation))
      + optRow("Battery in spec", seg("hasBattery", ["Yes", "No"], opts.hasBattery ? "Yes" : "No"))
      + optRow("Storeys", seg("storeys", O.storeys, opts.storeys))
      + "</div>";
  }

  function specBlock(a) {
    return '<section class="fhs-spec">'
      + '<span class="eyebrow">The spec we ran</span>'
      + "<h4>What we assumed</h4>"
      + '<p class="lead">You told us the house type, the bedrooms and the scheme size. Everything else below is our assumption. Change any of it and the check re-runs.</p>'
      + "<dl>" + specRows(a) + "</dl>"
      + '<button type="button" class="fhs-adjust" data-adjust aria-expanded="' + adjusting + '">'
      + (adjusting ? "Hide the spec questions" : "Adjust the spec") + "</button>"
      + optsPanel()
      + "</section>";
  }

  function renderResult() {
    var a = answers();
    var r = G.estimate(a);
    var host = el("[data-result]");

    host.innerHTML = '<header class="fhs-head">'
      + "<h2>Your readiness check, measure by measure.</h2>"
      + '<div class="col-r"><span class="eyebrow">' + esc(deDash(a.houseType)) + " &middot; "
      + esc(a.bedrooms) + " bed</span>"
      + "<p>Run against the published Future Homes Standard for a "
      + esc(a.storeys === 1 ? "single storey" : a.storeys + " storey") + " "
      + esc(deDash(a.houseType).toLowerCase()) + ". Across "
      + esc(BANDS[picked.plots].v.toLowerCase()) + " that is about " + schemeKwp(r)
      + " kWp of roof Gryd would fund.</p></div></header>"
      + '<div data-summary>' + G.summaryHTML(a) + "</div>"
      + '<div class="sum-acts"><button type="button" class="btn ghost" data-restart>Start over</button></div>';

    var sum = host.querySelector("[data-summary]");

    /* Every figure the model prints is wrapped in a placeholder chip for the
       design comparisons. This is the tool itself, so the chips come off. */
    var chips = sum.querySelectorAll(".ph");
    for (var i = chips.length - 1; i >= 0; i--) { chips[i].parentNode.removeChild(chips[i]); }
    /* The chip sat between the figure and its unit, so taking it out leaves the
       space that separated them stranded in front of a percent sign. */
    tidySpace(sum);

    /* The state in words, because there is no green on this site and colour on
       its own must never be the thing that says whether a measure passes. */
    var cards = sum.querySelectorAll(".score");
    for (var k = 0; k < cards.length; k++) {
      var cls = (cards[k].className.match(/score-(green|amber|red)/) || [])[1] || "green";
      var top = cards[k].querySelector(".score-top");
      var word = d.createElement("span");
      word.className = "m-state";
      word.textContent = STATE[cls];
      top.appendChild(word);
    }

    /* The model's call to action is a dead href. Point it at the shared link so
       the nav's own popup opens over the result. */
    var cta = sum.querySelector("a.btn");
    if (cta) { cta.setAttribute("href", "request-site-assessment.html"); }

    /* Share does nothing yet, and a control that does nothing is worse than no
       control. The model's own restart is kept and wired. */
    var acts = sum.querySelector(".sum-acts");
    if (acts) { acts.parentNode.removeChild(acts); }

    /* The assumed spec sits between the verdict and the measures, so the reader
       sees what was run before reading what it returned. */
    var head = sum.querySelector(".sum-head");
    if (head) { head.insertAdjacentHTML("afterend", specBlock(a)); }

    deDashTree(host);
    host.hidden = false;
    el("[data-stage]").hidden = true;
  }

  function reset() {
    picked = { type: null, beds: null, plots: null };
    contact = { name: "", email: "" };
    opts = null;
    adjusting = false;
    el("[data-result]").hidden = true;
    el("[data-result]").innerHTML = "";
    el("[data-card]").hidden = true;
    el("[data-card]").innerHTML = "";
    el("[data-stage]").hidden = false;
    quiz();
    w.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------- wiring */

  function start() {
    quiz();

    d.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) { return; }

      var tileEl = t.closest(".f-tile");
      if (tileEl) {
        picked[tileEl.getAttribute("data-q")] = parseInt(tileEl.getAttribute("data-i"), 10);
        var group = tileEl.parentNode.querySelectorAll(".f-tile");
        for (var i = 0; i < group.length; i++) {
          group[i].setAttribute("aria-pressed", String(group[i] === tileEl));
        }
        if (at < QUESTIONS.length - 1) { showQ(at + 1); }
        if (done3()) { card(); }
        return;
      }

      if (t.closest("[data-back]")) { showQ(Math.max(0, at - 1)); return; }

      if (t.closest("[data-send]")) {
        if (!gated()) { return; }
        sendLead({ name: contact.name, email: contact.email, answers: answers() });
        opts = null;
        var a = assumed();
        opts = {
          storeys: a.storeys, partL: a.partL, ventilation: a.ventilation,
          hasSolar: a.hasSolar, panels: a.panels, hasBattery: a.hasBattery
        };
        renderResult();
        return;
      }

      if (t.closest("[data-adjust]")) {
        adjusting = !adjusting;
        renderResult();
        var panel = el("[data-opts]");
        if (panel) { panel.scrollIntoView({ block: "nearest" }); }
        return;
      }

      var segBtn = t.closest("[data-opt]");
      if (segBtn) {
        var key = segBtn.getAttribute("data-opt");
        var val = segBtn.getAttribute("data-value");
        if (key === "hasSolar" || key === "hasBattery") { opts[key] = val === "Yes"; }
        else if (key === "panels" || key === "storeys") { opts[key] = Number(val); }
        else { opts[key] = val; }
        renderResult();
        return;
      }

      if (t.closest("[data-restart]") || t.closest(".js-restart")) { reset(); }
    });

    d.addEventListener("input", function (ev) {
      var f = ev.target && ev.target.closest ? ev.target.closest("[data-k]") : null;
      if (!f) { return; }
      contact[f.getAttribute("data-k")] = f.value.trim();
      gated();
    });
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", start); }
  else { start(); }
})(window, document);
