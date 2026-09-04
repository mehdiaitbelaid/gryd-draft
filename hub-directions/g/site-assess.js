/* Site assessment request flow.

   The flow is static until there is somewhere to post to: it reads what has
   been typed or tapped so the page can echo it back, walks one stage at a
   time, and swaps the form for the assessment itself once a name and an email
   are in.

   Since 4 September the page runs the same tool the popup runs. Stage one is
   the scheme, stage two is the reply address, and what follows is the full
   summary rendered in place by assess-result.js off the same engine the popup
   calls. The old drawings and programme stage is gone, and so is the receipt
   that used to stand in for an answer. */
(function () {
  "use strict";

  var doc = document;
  function all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- values */

  var values = {};
  /* the bed sizes as picked, which the engine needs as a split rather than
     as the line the rail prints */
  var beds = [];

  function set(key, val) {
    if (!key) { return; }
    values[key] = val;
    paint(key);
  }

  /* Every echo of an answer, wherever it sits, is a [data-sum] element. The
     empty class is what gives the summary rail its unanswered look. */
  function paint(key) {
    all('[data-sum="' + key + '"]').forEach(function (el) {
      var v = values[key];
      var has = v !== undefined && v !== null && v !== "";
      el.textContent = has ? v : (el.getAttribute("data-empty") || "Not yet");
      el.classList.toggle("empty", !has);
    });
  }

  /* ---------------------------------------------------------------- fields */

  all("[data-key]").forEach(function (el) {
    var key = el.getAttribute("data-key");
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.addEventListener("input", function () { set(key, el.value.trim()); });
      el.addEventListener("change", function () { set(key, el.value.trim()); });
    }
  });

  /* clay house type tiles, multi select */
  all("[data-tile-group]").forEach(function (group) {
    var key = group.getAttribute("data-tile-group");
    group.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".f-tile");
      if (!btn || !group.contains(btn)) { return; }
      var on = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", on ? "false" : "true");
      var picked = all('.f-tile[aria-pressed="true"]', group).map(function (b) {
        return b.getAttribute("data-value");
      });
      if (key === "bedrooms") { beds = picked; }
      set(key, picked.join(", "));
    });
  });

  /* segmented hairline control, single choice */
  all("[data-seg]").forEach(function (group) {
    var key = group.getAttribute("data-seg");
    group.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".seg");
      if (!btn || !group.contains(btn)) { return; }
      all(".seg", group).forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      set(key, btn.getAttribute("data-value"));
    });
  });

  /* the drop zone. A dropped or chosen file is named back, never read. */
  all("[data-drop]").forEach(function (zone) {
    var key = zone.getAttribute("data-drop");
    var input = zone.querySelector('input[type="file"]');
    var line = zone.querySelector(".d-line");
    var original = line ? line.textContent : "";

    function take(name) {
      zone.classList.add("has-file");
      zone.classList.remove("is-over");
      if (line) { line.textContent = name; }
      set(key, name);
    }
    function open() { if (input) { input.click(); } }

    zone.addEventListener("click", open);
    zone.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); }
    });
    if (input) {
      input.addEventListener("click", function (ev) { ev.stopPropagation(); });
      input.addEventListener("change", function () {
        if (input.files && input.files[0]) { take(input.files[0].name); }
        else if (line) { line.textContent = original; }
      });
    }
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
  });

  /* --------------------------------------------------- the gate and the result */
  /* The name and the email are the gate. Past it the page stops being a form
     and becomes the assessment, drawn by the shared renderer off the shared
     engine, so the page and the popup can never report different numbers.
     Nothing is posted anywhere yet: the lead is held in memory, the way the
     popup holds it, and sendLead is the one seam for a CRM. */

  var form = doc.getElementById("saForm");
  var out = doc.getElementById("saResult");
  var submit = doc.getElementById("saSubmit");

  function ready() {
    return !!(values.name && values.email && /.+@.+\..+/.test(values.email));
  }

  function engineInputs() {
    var api = window.GrydAssessInputs || {};
    return { homes: parseInt(values.plots, 10) || 1,
             postcode: String(values.postcode || "").toUpperCase().trim(),
             orientation: api.ORIENTATION || "South",
             energy: api.ENERGY || "All Electric",
             split: api.shareOut ? api.shareOut(beds) : { small: 100, mid: 0, large: 0 } };
  }

  function gateReady() {
    if (submit) { submit.disabled = !ready(); }
  }

  if (submit && form && out) {
    gateReady();
    doc.addEventListener("input", gateReady);
    doc.addEventListener("change", gateReady);
    submit.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (!ready()) { return; }
      window.grydAssessLead = { lead: { name: values.name, email: values.email },
                                inputs: engineInputs() };
      var answers = engineInputs();
      form.hidden = true;
      out.hidden = false;
      doc.body.classList.add("has-result");
      window.GrydAssessResult.render(out, window.GrydAssess.compute(answers), answers, {
        onRestart: function () {
          out.hidden = true;
          out.innerHTML = "";
          form.hidden = false;
          doc.body.classList.remove("has-result");
          window.scrollTo(0, 0);
        }
      });
      window.scrollTo(0, 0);
    });
  }

  /* --------------------------------------------------------- the two stages */
  /* One stage on screen, every question in it visible at once, nothing from a
     later stage rendered before its turn. The rail beside stage two keeps the
     answers already given. */

  var col = doc.querySelector("[data-staged]");
  if (col) {
    var stages = all(".e-stage", col);
    var segs = all(".e-seg", col);
    var at = 0;

    function show(i, moved) {
      at = Math.max(0, Math.min(stages.length - 1, i));
      stages.forEach(function (s, n) { s.hidden = n !== at; });
      segs.forEach(function (seg, n) {
        var bar = seg.querySelector("i");
        if (bar) { bar.style.width = n < at ? "100%" : (n === at ? "50%" : "0%"); }
        seg.classList.toggle("on", n === at);
        seg.classList.toggle("done", n < at);
      });
      doc.body.classList.toggle("past-first", at > 0);
      col.classList.toggle("first", at === 0);
      fit();
      var first = stages[at].querySelector(".f-text, .f-area, .f-tile, .seg");
      if (first && first.focus) { first.focus({ preventScroll: true }); }
      /* the reader asked for the next stage, so put it under the nav rather
         than leaving them where the last one ended. Not on the first paint,
         which would throw away the headline band. */
      if (moved) {
        var top = stages[at].getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, Math.round(top - 132)));
      }
    }

    /* a stage is centred in whatever the headline and the nav leave it,
       measured rather than guessed so it never pushes the page into a scroll */
    function fit() {
      var top = col.getBoundingClientRect().top + window.scrollY;
      var room = window.innerHeight - top - 40;
      col.style.setProperty("--first-fill", Math.max(360, Math.round(room)) + "px");
    }
    window.addEventListener("resize", fit);

    all("[data-next]", col).forEach(function (b) {
      b.addEventListener("click", function (ev) { ev.preventDefault(); show(at + 1, true); });
    });
    all("[data-back]", col).forEach(function (b) {
      b.addEventListener("click", function (ev) { ev.preventDefault(); show(at - 1, true); });
    });
    show(0);
  }

  /* paint the empty state of every echo on load */
  all("[data-sum]").forEach(function (el) {
    var k = el.getAttribute("data-sum");
    if (values[k] === undefined) { paint(k); }
  });
})();
