/* The FHS readiness tool on the hub.

   Mehdi, 4 September: the check is the page. It was behind a button and a
   popup and he could not see the thing he had approved, so the run is mounted
   inline under the masthead and the first question is on screen when the page
   loads. It asks the live tool's twelve questions in the live tool's own words,
   one to a screen, and takes the same name and email before it prints
   anything. Nothing about the questions, the tiles or the model changed; only
   where they are drawn.

   The verdict and every word of it come from fhs/pages/assess-model.js, which
   is the live tool's own logic and prose. This file only chooses what to send
   it and how the hub draws what comes back.

   The live wording is reproduced exactly, punctuation included: the em dashes,
   the ranges, the ampersands and the unit strings all reach the screen as the
   live tool writes them. Only the hub's own connecting copy follows the house
   dash rule.

   There is no green in the palette, so a measure says Pass, Close or Fails in
   words and takes a warm chip behind it. Colour alone never says whether
   something passes. */
(function (w, d) {
  "use strict";

  var G = w.GRYD;
  var O = G.OPTIONS;
  var IMG = "../../home-final/assets/img/site-assess/";
  var MEASURE_IMG = "../../home-final/assets/img/fhs-measures/";

  /* One clay miniature a measure, in the model's own order, keyed on the
     model's own key. The labels are carried alongside so a row can only take
     the icon that belongs to it: if the model ever reorders or renames a
     measure the icon is dropped rather than mislabelled. */
  var MEASURE_ART = [
    ["Heating", "heating"],
    ["Solar PV", "solar"],
    ["Battery Storage", "battery"],
    ["Part L Target", "partL"],
    ["Ventilation", "ventilation"],
    ["Airtightness", "airtightness"],
    ["Glazing", "glazing"],
    ["Wastewater Heat Recovery", "wwhr"]
  ];

  function measureArt(name, i) {
    var m = MEASURE_ART[i];
    if (!m || m[0] !== name) { return ""; }
    return '<img class="c-art" src="' + MEASURE_IMG + m[1] + '.png" srcset="'
      + MEASURE_IMG + m[1] + ".png 1x, " + MEASURE_IMG + m[1] + '@2x.png 2x" '
      + 'alt="" width="28" height="28" decoding="async">';
  }

  var TYPE_ART = {
    "Detached": "type-detached",
    "Semi-detached": "type-semi",
    "Terraced (mid)": "type-terrace",
    "Terraced (end)": "type-terrace",
    "Apartment": "type-apartments"
  };
  var BED_ART = { 1: "beds-1", 2: "beds-2", 3: "beds-3", 4: "beds-4", 5: "beds-5" };

  var PANELS = [2, 4, 8, 12, 16, 20];
  /* the beat between one revealing part of the result and the next */
  var STAGGER = 40;
  var STATE = { green: "Pass", amber: "Close", red: "Fails" };

  var a = null;      /* the answer set the model reads */
  var contact = { name: "", email: "" };
  var at = 0;

  /* --------------------------------------------------------------- helpers */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function el(sel) { return d.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(d.querySelectorAll(sel)); }
  function all2(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function tidySpace(node) {
    var walk = d.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walk.nextNode())) {
      n.nodeValue = n.nodeValue.replace(/[  ]{2,}/g, " ").replace(/ (?=%)/g, "");
    }
  }

  /* ----------------------------------------------------------------- glyphs */
  /* The house types and the bedroom counts have clay models already. Everything
     else is drawn here as a schematic in one stroke weight, so the tiles read
     as one set. Stroke is currentColor, which is what the tile animates on
     selection, and the accented part takes the site's orange. */

  function svg(inner) {
    return '<svg class="t-art" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" '
      + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
      + 'stroke-linejoin="round">' + inner + "</svg>";
  }
  function bars(n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      var y = 34 - i * 10;
      out += '<rect x="12" y="' + y + '" width="24" height="8" rx="1"></rect>';
    }
    return svg(out);
  }
  function cells(n, total) {
    var out = "", cols = 4, s = 8, gap = 2, x0 = 8, y0 = 10;
    for (var i = 0; i < total; i++) {
      var cx = x0 + (i % cols) * (s + gap);
      var cy = y0 + Math.floor(i / cols) * (s + gap);
      out += '<rect x="' + cx + '" y="' + cy + '" width="' + s + '" height="' + s
        + '" rx="1" stroke-width="1.4"' + (i < n ? ' class="lit"' : "") + "></rect>";
    }
    return svg(out);
  }
  /* the chevron at the end of a measure row, in the same one stroke weight as
     the tiles' schematics */
  var CHEV = '<svg class="c-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" '
    + 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
    + 'stroke-linejoin="round"><path d="M2.5 4.5 6 8l3.5-3.5"></path></svg>';

  var Q = svg('<path d="M18 18a6 6 0 1 1 6 7v3"></path><circle cx="24" cy="35" r="1.4" fill="currentColor"></circle>');

  var GLYPH = {
    heating: {
      "Gas boiler": svg('<path d="M24 8c6 7 9 11 9 16a9 9 0 0 1-18 0c0-5 3-9 9-16Z" class="lit"></path><path d="M24 26c2 2 3 3.5 3 5a3 3 0 0 1-6 0c0-1.5 1-3 3-5Z"></path>'),
      "Air source heat pump (ASHP)": svg('<rect x="9" y="13" width="30" height="22" rx="3"></rect><circle cx="24" cy="24" r="7" class="lit"></circle><path d="M24 17v14M17 24h14"></path>'),
      "Ground source heat pump (GSHP)": svg('<path d="M6 20h36" class="lit"></path><path d="M13 20v9a5 5 0 0 0 10 0v-4a5 5 0 0 1 10 0v9"></path><path d="M18 13h12v7H18z"></path>'),
      "Electric heating": svg('<path d="M26 6 14 27h9l-3 15 15-22h-9l3-14Z" class="lit"></path>'),
      "Other / unsure": Q
    },
    partL: {
      "2021 Part L (31% improvement)": svg('<path d="M8 38h32"></path><rect x="12" y="28" width="8" height="10" class="lit"></rect><rect x="28" y="22" width="8" height="16" opacity=".35"></rect>'),
      "FHS (75–80% improvement)": svg('<path d="M8 38h32"></path><rect x="12" y="28" width="8" height="10" opacity=".35"></rect><rect x="28" y="12" width="8" height="26" class="lit"></rect>'),
      "Unsure": Q
    },
    ventilation: {
      "Natural ventilation only": svg('<rect x="10" y="10" width="28" height="28" rx="2"></rect><path d="M24 10v28"></path><path d="M31 24h9" class="lit"></path>'),
      "MEV (mechanical extract)": svg('<rect x="10" y="10" width="28" height="28" rx="2"></rect><path d="M18 24h18m-5-5 5 5-5 5" class="lit"></path>'),
      "MVHR (mechanical ventilation with heat recovery)": svg('<rect x="8" y="10" width="32" height="28" rx="2"></rect><path d="M14 19h20m-5-4 5 4-5 4" class="lit"></path><path d="M34 29H14m5 4-5-4 5-4"></path>'),
      "Unsure": Q
    },
    airtightness: {
      "≤3 m³/(h·m²) @ 50Pa": svg('<rect x="11" y="11" width="26" height="26" rx="2" class="lit"></rect><path d="M37 24h5"></path>'),
      "3–5 m³/(h·m²) @ 50Pa": svg('<rect x="11" y="11" width="26" height="26" rx="2"></rect><path d="M37 18h5M37 30h5" class="lit"></path>'),
      "5–8 m³/(h·m²) @ 50Pa": svg('<rect x="11" y="11" width="26" height="26" rx="2"></rect><path d="M37 15h6M37 24h6M37 33h6" class="lit"></path>'),
      "≥8 m³/(h·m²) @ 50Pa": svg('<rect x="11" y="11" width="26" height="26" rx="2"></rect><path d="M37 13h7M37 20h7M37 28h7M37 35h7" class="lit"></path>'),
      "Unsure": Q
    },
    glazing: {
      "Triple glazing (U ≤ 0.8)": svg('<rect x="9" y="10" width="6" height="28" rx="1" class="lit"></rect><rect x="21" y="10" width="6" height="28" rx="1" class="lit"></rect><rect x="33" y="10" width="6" height="28" rx="1" class="lit"></rect>'),
      "High-performance double (U ≤ 1.2)": svg('<rect x="13" y="10" width="7" height="28" rx="1" class="lit"></rect><rect x="28" y="10" width="7" height="28" rx="1" class="lit"></rect>'),
      "Standard double (U ≤ 1.4)": svg('<rect x="15" y="10" width="4" height="28" rx="1"></rect><rect x="29" y="10" width="4" height="28" rx="1"></rect>'),
      "Unsure": Q
    },
    yes: svg('<circle cx="24" cy="24" r="15"></circle><path d="M17 24.5l5 5 9-11" class="lit"></path>'),
    no: svg('<circle cx="24" cy="24" r="15"></circle><path d="M18 18l12 12M30 18L18 30"></path>')
  };

  function glyphFor(field, value) {
    if (field === "storeys") { return bars(Number(value)); }
    if (field === "panels") { return cells(Math.round(Number(value) / 2), 12); }
    if (field === "yesno") { return value === "Yes" ? GLYPH.yes : GLYPH.no; }
    var set = GLYPH[field];
    return (set && set[value]) || Q;
  }

  /* ------------------------------------------------------------------ tiles */

  function tile(field, value, label, art, on) {
    return '<button type="button" class="f-tile" aria-pressed="' + (on ? "true" : "false")
      + '" data-f="' + esc(field) + '" data-v="' + esc(value) + '">' + art
      + '<span class="t-name">' + esc(label) + "</span></button>";
  }

  function tiles(field, list, current, opt) {
    opt = opt || {};
    return list.map(function (v) {
      var art, name = opt.name ? opt.name(v) : String(v);
      if (field === "houseType") {
        art = '<img src="' + IMG + TYPE_ART[v] + '.png" alt="" width="300" height="300" decoding="async">';
      } else if (field === "bedrooms") {
        art = '<img src="' + IMG + BED_ART[v] + '.png" alt="" width="300" height="300" decoding="async">';
      } else {
        art = glyphFor(opt.glyph || field, v);
      }
      return tile(field, v, name, art, String(current) === String(v));
    }).join("");
  }

  function group(field, list, current, opt) {
    opt = opt || {};
    return '<div class="f-tiles cols-' + Math.min(5, list.length)
      + (opt.narrow ? " narrow" : "") + (opt.cls ? " " + opt.cls : "") + '" role="group">'
      + tiles(field, list, current, opt) + "</div>";
  }

  function yesNo(field, current) {
    return '<div class="f-tiles cols-2 narrow" role="group">'
      + ["Yes", "No"].map(function (v) {
          return tile(field, v, v, glyphFor("yesno", v), (current ? "Yes" : "No") === v);
        }).join("")
      + "</div>";
  }

  /* ------------------------------------------------------------- questions */
  /* One question to a screen, in the live tool's order, with the live tool's
     own label as the question. A tap answers and moves on, so there is no
     Continue until the gate. */

  var QUESTIONS = [
    { key: "houseType", head: "House type",
      stand: "Tell us about the house type you're assessing.",
      body: function () { return group("houseType", O.houseTypes, a.houseType); } },
    { key: "bedrooms", head: "Number of bedrooms",
      body: function () {
        return group("bedrooms", O.bedrooms, a.bedrooms,
                     { cls: "beds", name: function (v) { return v + " bed"; } })
          + '<p class="fm-flag" data-odd hidden>This combination is unusual — '
          + "please contact us for a bespoke assessment.</p>";
      } },
    { key: "storeys", head: "Number of storeys",
      body: function () {
        return group("storeys", O.storeys, a.storeys,
                     { name: function (v) { return v === 1 ? "1 storey" : v + " storeys"; } });
      } },
    { key: "heating", head: "Planned heating system",
      body: function () { return group("heating", O.heating, a.heating); } },
    { key: "partL", head: "Current Part L target",
      body: function () { return group("partL", O.partL, a.partL); } },
    { key: "ventilation", head: "Ventilation strategy",
      body: function () { return group("ventilation", O.ventilation, a.ventilation); } },
    { key: "airtightness", head: "Airtightness target",
      body: function () { return group("airtightness", O.airtightness, a.airtightness); } },
    { key: "glazing", head: "Glazing specification",
      body: function () { return group("glazing", O.glazing, a.glazing); } },
    { key: "hasSolar", head: "Solar PV already in spec?",
      body: function () { return yesNo("hasSolar", a.hasSolar); } },
    { key: "panels", head: "Number of panels", solarOnly: true,
      body: function () {
        return group("panels", PANELS, a.panels,
                     { name: function (v) { return v + " panels"; } });
      } },
    { key: "hasBattery", head: "Battery storage in spec?",
      body: function () { return yesNo("hasBattery", a.hasBattery); } },
    { key: "hasWWHR", head: "Wastewater heat recovery (WWHR) in spec?",
      body: function () {
        return yesNo("hasWWHR", a.hasWWHR)
          + '<p class="fm-hint">WWHR systems recover heat from shower wastewater to '
          + "preheat incoming cold water, reducing hot water energy demand.</p>";
      } }
  ];

  var GATE = {
    key: "gate", head: "Your Details",
    stand: "Tell us a bit about you and your project.",
    body: function () {
      return '<div class="fm-gate">'
        + '<div class="fm-in"><label for="fm-name">Full name</label>'
        + '<input id="fm-name" type="text" data-k="name" aria-label="Full name" '
        + 'placeholder="Jane Smith" autocomplete="name"></div>'
        + '<div class="fm-in"><label for="fm-email">Work email</label>'
        + '<input id="fm-email" type="email" data-k="email" aria-label="Work email" '
        + 'placeholder="jane@company.co.uk" autocomplete="email"></div></div>'
        + '<p class="fm-hint">Gryd stores the name and the email to send the check and to talk '
        + "about the standard. Nothing else.</p>";
    }
  };

  /* The panel count is only asked of a spec that already has solar, so the run
     is eleven questions or twelve and the count on screen says which. */
  function seq() {
    return QUESTIONS.filter(function (q) { return !q.solarOnly || a.hasSolar; });
  }
  function paneAt(i) {
    var q = seq();
    return i < q.length ? q[i] : GATE;
  }
  function onGate() { return at >= seq().length; }

  /* ------------------------------------------------------------------ shell */
  /* The run's own markup, mounted in the page rather than over it. The .fm
     class stays on the shell so the pane, the tiles, the gate and the type all
     keep the sizes they were signed off at; only its own box rules changed
     from a floating plate to a panel in the column. */

  function mountCheck() {
    var host = el("[data-check]");
    host.innerHTML = '<div class="fm"><div class="fm-box">'
      + '<div class="fm-prog" data-prog aria-hidden="true"></div>'
      + '<div class="fm-body">'
      + '<section class="fhs-q" data-qn="0">'
      + '<span class="eyebrow" data-eyebrow>FHS readiness check</span>'
      + '<h2 data-head></h2>'
      + '<p class="fm-stand" data-stand hidden></p><div data-fields></div></section>'
      + "</div>"
      + '<div class="fm-nav">'
      + '<button type="button" class="fm-back" data-back hidden>Back</button>'
      + '<button type="button" class="btn fm-go" data-go hidden>See your readiness check</button>'
      + '<span class="fm-count" data-count></span></div></div></div>';
    return host;
  }

  /* Two digits, the way the run labels itself on screen. */
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ------------------------------------------------------- the step change */
  /* Answering moves through the run rather than redrawing the panel. The
     question on screen slides out the way the run is going, the next one comes
     in from the other side and rises, and its tiles land one after another.
     Everything is on the site's standing curve, the same .34s the result's
     rows and plates use. Back plays the move in reverse. */
  var STEP_MS = 340;
  var moving = false;

  function reduced() {
    return !!(w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* The incoming pane and its tiles, staggered in the order they are read. */
  function revealPane(dir) {
    var pane = el(".fhs-q");
    pane.classList.remove("q-out");
    pane.setAttribute("data-dir", dir);
    if (reduced()) { return; }
    void pane.offsetWidth;
    pane.classList.add("q-in");
    all(".fm .f-tile").forEach(function (tile, i) {
      tile.style.setProperty("--d", STAGGER * i + "ms");
      tile.classList.add("t-rise");
    });
  }

  /* The run holds still while a change is in flight, so a second tap during
     the slide cannot land the reader two questions on. */
  function goTo(next, dir) {
    if (moving) { return; }
    if (reduced()) { at = next; paint(dir); return; }
    var pane = el(".fhs-q");
    moving = true;
    pane.classList.remove("q-in");
    pane.setAttribute("data-dir", dir);
    void pane.offsetWidth;
    pane.classList.add("q-out");
    w.setTimeout(function () {
      at = next;
      paint(dir);
      moving = false;
    }, STEP_MS);
  }

  function paint(dir) {
    var n = seq().length;
    var q = paneAt(at);
    var pane = el(".fhs-q");

    pane.setAttribute("data-q", q.key);
    el("[data-head]").textContent = q.head;
    var stand = el("[data-stand]");
    stand.textContent = q.stand || "";
    stand.hidden = !q.stand;
    el("[data-fields]").innerHTML = q.body();

    /* The segments are built once per run length and only their state changes
       after that, because a segment replaced on every question would start at
       its finished width and the fill would never be seen to move. */
    var prog = el("[data-prog]");
    if (prog.children.length !== n) {
      prog.innerHTML = new Array(n + 1).join("x").split("").map(function () {
        return '<span class="fm-seg"><i></i></span>';
      }).join("");
    }
    Array.prototype.forEach.call(prog.children, function (seg, i) {
      seg.className = "fm-seg" + (i < at ? " done" : (i === at ? " on" : ""));
    });
    el("[data-count]").textContent = onGate()
      ? "Your details" : "Step " + pad(at + 1) + " of " + pad(n);

    el("[data-back]").hidden = at === 0;
    el("[data-go]").hidden = !onGate();
    if (q.key === "bedrooms") { flagOdd(); }
    gate();
    revealPane(dir || "fwd");
  }

  /* The live tool's guard: some house type and bedroom pairs have no published
     floor area, and the run stops on the bedroom question until the pair is one
     the model can size. */
  function flagOdd() {
    var odd = el("[data-odd]");
    if (odd) { odd.hidden = !a.houseType || !a.bedrooms || G.isSupported(a); }
  }

  function ready() {
    return !onGate() || !!(contact.name && contact.email.indexOf("@") > 0);
  }
  function gate() {
    var go = el("[data-go]");
    if (go) { go.disabled = !ready(); }
    return ready();
  }

  /* The run starts itself. There is no button to press and nothing to open:
     the page loads on question one. */
  function begin() {
    a = G.defaults();
    a.houseType = null; a.bedrooms = null; a.storeys = null;
    a.heating = null; a.partL = null; a.ventilation = null;
    a.airtightness = null; a.glazing = null;
    a.hasSolar = false; a.panels = 0; a.hasBattery = false; a.hasWWHR = false;
    contact = { name: "", email: "" };
    at = 0;
    el("[data-check]").hidden = false;
    paint();
  }

  /* The result takes the run's place in the column rather than sitting under
     an answered questionnaire. Start over puts the run back. */
  function hideCheck() { el("[data-check]").hidden = true; }

  /* ------------------------------------------------------------- the lead */
  /* The gate posts to the HubSpot form on portal 144906745 (eu1). The whole
     readiness check travels as plain text in fhs_assessment_notes, so the
     record carries the same words the reader saw. HubSpot only accepts this
     from a domain Scott has added to the portal's allowed domains list.

     The consent sentence is the live tool's own, reproduced exactly. */

  var HS_ENDPOINT = "https://forms-eu1.hsforms.com/submissions/v3/integration/submit/"
    + "144906745/ff5fca7b-c31f-4fb2-9e65-69b9e058973f";
  var CONSENT_TEXT = "I consent to Gryd storing my details to provide this assessment "
    + "and contact me about their services.";

  function splitName(full) {
    var t = String(full || "").trim().replace(/\s+/g, " ");
    var cut = t.lastIndexOf(" ");
    return cut < 0 ? { first: t, last: "" }
                   : { first: t.slice(0, cut), last: t.slice(cut + 1) };
  }

  /* The check as plain text: what was answered, the verdict, every measure with
     its state word, and the two coverage figures. */
  function leadNotes(m, r) {
    var lines = [
      "House type: " + a.houseType,
      "Bedrooms: " + a.bedrooms,
      "Storeys: " + a.storeys,
      "Heating: " + a.heating,
      "Part L target: " + a.partL,
      "Ventilation: " + a.ventilation,
      "Airtightness: " + a.airtightness,
      "Glazing: " + a.glazing,
      "Solar in spec: " + (a.hasSolar ? a.panels + " panels" : "None"),
      "Battery in spec: " + (a.hasBattery ? "Yes" : "No"),
      "Wastewater heat recovery: " + (a.hasWWHR ? "Yes" : "No"),
      "",
      "Verdict: " + m.heading,
      "Summary: " + m.sub,
      ""
    ];
    m.measures.forEach(function (x) { lines.push(x.name + ": " + x.state); });
    lines.push("");
    lines.push("Energy covered on your spec: " + r.user.coverage + "%");
    lines.push("Energy covered on a Gryd system: " + r.gryd.coverage + "%");
    return lines.join("\n");
  }

  function leadPayload(m, r) {
    var n = splitName(contact.name);
    var fields = [
      { objectTypeId: "0-1", name: "email", value: contact.email },
      { objectTypeId: "0-1", name: "firstname", value: n.first },
      { objectTypeId: "0-1", name: "lastname", value: n.last },
      { objectTypeId: "0-1", name: "fhs_assessment_notes", value: leadNotes(m, r) }
    ];
    return {
      fields: fields,
      context: { pageUri: w.location.href, pageName: d.title },
      legalConsentOptions: {
        consent: {
          consentToProcess: true,
          text: CONSENT_TEXT
        }
      }
    };
  }

  function sendLead(m, r) {
    return w.fetch(HS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadPayload(m, r))
    }).then(function (res) {
      if (!res.ok) { throw new Error("hubspot " + res.status); }
      return true;
    });
  }

  /* ----------------------------------------------------------------- result */

  function specRows() {
    var rows = [
      ["Heating", a.heating],
      ["Storeys", a.storeys],
      ["Part L target", a.partL],
      ["Ventilation", a.ventilation],
      ["Airtightness", a.airtightness],
      ["Glazing", a.glazing],
      ["Solar in spec", a.hasSolar ? a.panels + " panels" : "None"],
      ["Battery in spec", a.hasBattery ? "Yes" : "No"],
      ["Wastewater heat recovery", a.hasWWHR ? "Yes" : "No"]
    ];
    return rows.map(function (r) {
      return '<div class="s-row"><dt>' + esc(r[0]) + "</dt><dd>"
        + esc(r[1]) + "</dd></div>";
    }).join("");
  }

  function specBlock() {
    return '<section class="fhs-spec">'
      + "<h4>What you told us</h4>"
      + "<dl>" + specRows() + "</dl></section>";
  }

  function plate(label, value, i) {
    return '<div class="ar-stat ar-pin r-fig rise" style="--d:' + (STAGGER * i)
      + 'ms"><span class="ar-fig f-val num">' + esc(value)
      + '%</span><p class="f-lab">' + esc(label) + "</p></div>";
  }

  /* The model prints one long page. It is read here rather than shown: the
     verdict, the eight measures and the comparison table are lifted out of it
     and the page draws the compact version. Every word still comes from the
     model. */
  function modelParts(spec) {
    var box = d.createElement("div");
    box.innerHTML = G.summaryHTML(spec);

    /* Every figure the model prints is wrapped in a placeholder chip for the
       design comparisons. This is the tool itself, so the chips come off. */
    var chips = box.querySelectorAll(".ph");
    for (var i = chips.length - 1; i >= 0; i--) { chips[i].parentNode.removeChild(chips[i]); }
    /* The chip sat between the figure and its unit, so taking it out leaves the
       space that separated them stranded in front of a percent sign. Merging
       the neighbouring text nodes first is what lets tidySpace see the space
       and the sign as one run. */
    box.normalize();
    tidySpace(box);

    var head = box.querySelector(".sum-head");
    var measures = Array.prototype.map.call(box.querySelectorAll(".score"), function (c) {
      return {
        name: c.querySelector("h4").textContent.trim(),
        state: STATE[(c.className.match(/score-(green|amber|red)/) || [])[1] || "green"],
        note: c.querySelector("p").innerHTML
      };
    });
    /* The comparison table is drawn in the vocabulary the assessment result
       already ships: the same hairline rules, the same uppercase heads. */
    var table = box.querySelector(".tbl-wrap");
    if (table) {
      table.classList.add("ar-table-wrap");
      var t = table.querySelector("table");
      if (t) { t.classList.add("ar-table"); }
    }
    var flags = Array.prototype.filter.call(box.children, function (n) {
      return n.classList && n.classList.contains("note");
    });

    return {
      heading: head.querySelector("h3").textContent.trim(),
      band: (head.className.match(/band-(green|amber|red)/) || [])[1],
      sub: head.querySelector("p").textContent.trim(),
      disclaimer: head.querySelector(".note").textContent.trim(),
      measures: measures,
      table: table ? table.outerHTML : "",
      flags: flags.map(function (n) { return n.outerHTML; }).join("")
    };
  }

  /* The result, in the same vocabulary as the assessment summary that shipped:
     the model's verdict as the card's title, the two coverage figures as
     plates pinned at the top of it, the eight measures as hairline rows, and
     the detail folded away. assess-result.css supplies the plates, the rows,
     the fold and the hover; nothing is redeclared here. */
  function renderResult() {
    var m = modelParts(a);
    var r = G.estimate(a);
    var host = el("[data-result]");

    var rows = m.measures.map(function (x, i) {
      return '<li class="rise" style="--d:' + (STAGGER * (i + 2))
        + 'ms"><button type="button" class="r-chip state-' + x.state.toLowerCase()
        + '" data-chip="' + i + '" aria-expanded="false" aria-controls="r-note-' + i + '">'
        + measureArt(x.name, i)
        + '<span class="c-name" data-live>' + esc(x.name) + "</span>"
        + '<span class="c-state">' + esc(x.state) + "</span>" + CHEV + "</button>"
        + '<div class="r-note" id="r-note-' + i + '" data-note="' + i + '" hidden>'
        + '<div class="r-note-in"><p data-live>' + x.note + "</p></div></div></li>";
    }).join("");

    host.innerHTML = '<div class="ar-root">'
      + '<header class="fhs-verdict band-' + esc(m.band) + '">'
      + '<span class="eyebrow">' + esc(a.houseType) + " &middot; " + esc(a.bedrooms) + " bed</span>"
      + '<h2 class="ar-title" data-live>' + esc(m.heading) + "</h2></header>"

      + '<section class="ar-chartcard"><div class="ar-pins"><div class="ar-plates">'
      + plate("Energy covered on your spec", r.user.coverage, 0)
      + plate("Energy covered on a Gryd system", r.gryd.coverage, 1)
      + '</div></div><p class="fhs-sub" data-live>' + esc(m.sub) + "</p></section>"

      + '<section class="ar-sec fhs-measures"><h3>What the check looked at</h3>'
      + '<p class="fhs-hint">Tap a measure to see why.</p>'
      + '<ul class="ar-list fhs-rows">' + rows + "</ul></section>"

      + '<details class="ar-sec ar-fold r-detail rise" style="--d:' + (STAGGER * 10)
      + 'ms"><summary><h3>Your answers and the comparison</h3>'
      + '<span class="ar-foldcue"><span class="ar-show">Show the detail</span>'
      + '<svg class="ar-chev" viewBox="0 0 12 12" width="12" height="12"'
      + ' aria-hidden="true" focusable="false">'
      + '<path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor"'
      + ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      + "</svg></span></summary>"
      + '<div class="ar-foldbody"><div class="ar-foldinner">'
      + '<div class="r-detail-in" data-summary>' + m.flags + specBlock() + m.table
      + "</div></div></div></details>"

      + '<p class="ar-foot note rise" style="--d:' + (STAGGER * 11) + 'ms" data-live>' + esc(m.disclaimer) + "</p>"

      + '<div class="ar-acts rise" style="--d:' + (STAGGER * 12)
      + 'ms"><a class="btn ar-btn" href="request-site-assessment.html">'
      + "Request a site assessment</a>"
      + '<button type="button" class="btn ghost ar-btn" data-restart>Start over</button>'
      + "</div></div>";

    wireFolds(host);
    host.hidden = false;
  }

  /* The fold is the assessment result's own control, classes and animation:
     assess-result.css styles it and this mirrors the wiring that ships inside
     GrydAssessResult.render. It is duplicated rather than shared because that
     behaviour is not exported; if it ever is, this goes and the export is
     called instead. Keep the two in step. */
  var FOLD_MS = 420;

  function wireFolds(root) {
    all2(root, ".ar-fold").forEach(function (fold) {
      var sum = fold.querySelector("summary");
      var body = fold.querySelector(".ar-foldbody");
      var show = fold.querySelector(".ar-show");
      var shut = null;
      function label() {
        show.textContent = fold.open ? "Hide the detail" : "Show the detail";
        sum.setAttribute("aria-expanded", fold.open ? "true" : "false");
      }
      fold.addEventListener("toggle", function () {
        if (fold.open) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { body.classList.add("is-open"); });
          });
        } else {
          body.classList.remove("is-open");
        }
        label();
      });
      sum.addEventListener("click", function (ev) {
        body.setAttribute("data-anim", "");
        if (!fold.open) { return; }
        ev.preventDefault();
        body.classList.remove("is-open");
        show.textContent = "Show the detail";
        sum.setAttribute("aria-expanded", "false");
        w.clearTimeout(shut);
        shut = w.setTimeout(function () { fold.open = false; }, FOLD_MS);
      });
      label();
    });
  }

  function show() {
    renderResult();
    hideCheck();
    w.setTimeout(function () {
      el("[data-result]").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 220);
  }

  /* The send is not allowed to cost the reader their result. It is tried, and
     if it does not go the gate says so once and the check is drawn anyway. */
  function finish() {
    var m = modelParts(a);
    var r = G.estimate(a);
    var go = el("[data-go]");
    go.disabled = true;
    sendLead(m, r).then(show, function () {
      var note = el("[data-sent]");
      if (!note) {
        note = d.createElement("p");
        note.className = "fm-sent";
        note.setAttribute("data-sent", "");
        el("[data-fields]").appendChild(note);
      }
      note.textContent = "We could not send this just now, your result is below.";
      note.hidden = false;
      w.setTimeout(show, 1400);
    });
  }

  function reset() {
    var host = el("[data-result]");
    host.hidden = true;
    host.innerHTML = "";
    begin();
    el("[data-check]").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* One note open at a time, under the row it belongs to. hidden is taken off
     a frame before the open class goes on, because a display:none element has
     no height to animate from. Closing runs the other way, and the attribute
     goes back only once the row has finished collapsing. */
  var NOTE_MS = 220;

  function shut(n) {
    if (n.hidden) { return; }
    n.classList.remove("open");
    w.setTimeout(function () { if (!n.classList.contains("open")) { n.hidden = true; } }, NOTE_MS);
  }

  function showNote(i) {
    var btn = el('[data-chip="' + i + '"]');
    var panel = el('[data-note="' + i + '"]');
    var already = btn.getAttribute("aria-expanded") === "true";
    all(".r-chip").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    all(".r-note").forEach(shut);
    if (already) { return; }
    btn.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { panel.classList.add("open"); });
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function setField(field, raw) {
    if (field === "hasSolar" || field === "hasBattery" || field === "hasWWHR") {
      a[field] = raw === "Yes";
      if (field === "hasSolar" && !a.hasSolar) { a.panels = 0; }
    } else if (field === "bedrooms" || field === "storeys" || field === "panels") {
      a[field] = Number(raw);
    } else {
      a[field] = raw;
    }
  }

  function start() {
    mountCheck();
    begin();

    d.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) { return; }

      if (t.closest("[data-restart]")) { reset(); return; }

      var chip = t.closest(".r-chip");
      if (chip) { showNote(Number(chip.getAttribute("data-chip"))); return; }

      var tileEl = t.closest(".fm .f-tile");
      if (tileEl) {
        var field = tileEl.getAttribute("data-f");
        setField(field, tileEl.getAttribute("data-v"));
        var groupEls = tileEl.parentNode.querySelectorAll(".f-tile");
        for (var i = 0; i < groupEls.length; i++) {
          groupEls[i].setAttribute("aria-pressed", String(groupEls[i] === tileEl));
        }
        if (field === "bedrooms") {
          flagOdd();
          if (!G.isSupported(a)) { return; }
        }
        /* A single choice answers the question, so the run moves on by itself.
           The pause is one beat, long enough to see the tile take the answer
           before the pane starts leaving. */
        w.setTimeout(function () {
          if (at < seq().length) { goTo(at + 1, "fwd"); }
        }, 160);
        return;
      }

      if (t.closest("[data-back]")) { goTo(Math.max(0, at - 1), "back"); return; }
      if (t.closest("[data-go]")) {
        if (!gate()) { return; }
        finish();
      }
    });

    d.addEventListener("input", function (ev) {
      var f = ev.target && ev.target.closest ? ev.target.closest("[data-k]") : null;
      if (!f) { return; }
      contact[f.getAttribute("data-k")] = f.value.trim();
      gate();
    });
  }

  if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", start); }
  else { start(); }
})(window, document);
