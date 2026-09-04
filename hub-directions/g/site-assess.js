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
  /* plots per bed size, and the one the reader touched last, which is the one
     that gives way when a plot total is typed over the top of the counts */
  var counts = {};
  var lastCount = null;

  function countTotal() {
    return Object.keys(counts).reduce(function (n, k) { return n + (counts[k] || 0); }, 0);
  }
  function hasCounts() { return countTotal() > 0; }

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

  var plotsField = doc.querySelector('[data-key="plots"]');

  function tally() {
    var line = doc.querySelector("[data-tally]");
    if (!line) { return; }
    var total = countTotal();
    line.hidden = !total;
    if (!total) { return; }
    var target = parseInt(values.plots, 10) || total;
    line.textContent = total + " of " + target + " plots counted";
    line.classList.toggle("is-off", total !== target);
  }

  function fillPlots() {
    var total = countTotal();
    if (!total || !plotsField) { return; }
    plotsField.value = String(total);
    set("plots", String(total));
  }

  /* the plot counts under the chosen tiles */
  all("[data-count]").forEach(function (f) {
    var bed = f.getAttribute("data-count");
    f.addEventListener("input", function () {
      var n = parseInt(f.value, 10);
      if (!n || n < 1) { delete counts[bed]; } else { counts[bed] = n; lastCount = bed; }
      fillPlots();
      tally();
    });
  });

  if (plotsField) {
    plotsField.addEventListener("input", function () {
      var want = parseInt(plotsField.value, 10);
      if (!want || !lastCount || !hasCounts()) { tally(); return; }
      counts[lastCount] = Math.max(1, want - (countTotal() - counts[lastCount]));
      var f = doc.querySelector('[data-count="' + lastCount + '"]');
      if (f) { f.value = String(counts[lastCount]); }
      tally();
    });
  }

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
      if (key === "bedrooms") {
        beds = picked;
        var bed = btn.getAttribute("data-value");
        var field = btn.parentNode.querySelector(".f-count");
        if (field) {
          if (on) {
            field.hidden = true;
            field.value = "";
            delete counts[bed];
            if (lastCount === bed) { lastCount = null; }
          } else {
            field.hidden = false;
          }
        }
        fillPlots();
        tally();
      }
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
    var counted = hasCounts() && api.splitFromCounts;
    return { homes: counted ? countTotal() : (parseInt(values.plots, 10) || 1),
             postcode: String(values.postcode || "").toUpperCase().trim(),
             orientation: api.ORIENTATION || "South",
             energy: api.ENERGY || "All Electric",
             split: counted ? api.splitFromCounts(counts)
                    : (api.shareOut ? api.shareOut(beds) : { small: 100, mid: 0, large: 0 }) };
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
      var result = window.GrydAssess.compute(answers);
      /* the lead goes to HubSpot through the shared sender, carrying the bed
         counts as well as the engine's own inputs, and it never blocks the
         assessment */
      if (window.GrydAssessLeadApi) {
        var lead = { homes: answers.homes, postcode: answers.postcode,
                     orientation: answers.orientation, energy: answers.energy,
                     beds: beds.slice(), counts: counts };
        window.GrydAssessLeadApi.send(lead, result,
                                      { name: values.name, email: values.email });
      }
      form.hidden = true;
      out.hidden = false;
      doc.body.classList.add("has-result");
      window.GrydAssessResult.render(out, result, answers, {
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

  /* ------------------------------------------------- the steps, one at a time */
  /* Mehdi, 4 September: the tools page runs the FHS check's composition now.
     One question is on screen at a time, centred, under a three mark rail; the
     gate is the fourth panel in the same frame. Enter on a field is the same
     as pressing Continue, so a postcode or a plot count can be answered without
     reaching for the mouse. The bedroom tiles stay multi select with a count
     under each, so they never advance on their own. */

  var col = doc.querySelector("[data-staged]");
  if (col) {
    var panels = all(".sa-q", col);
    var marks = all(".sa-prog i", col);
    var at = 0;
    /* how long the outgoing panel is left on screen. It matches the leave
       animation in site-assess.css; shorter than the rise, so the arriving
       question is never waiting on the one it replaced. */
    var LEAVE = 280;
    var leaving = null;

    function show(i, moved, back) {
      var prev = panels[at];
      at = Math.max(0, Math.min(panels.length - 1, i));
      var now = panels[at];
      if (leaving) { leaving(); }
      panels.forEach(function (s, n) {
        s.hidden = n !== at;
        s.classList.remove("sa-enter", "sa-leave", "sa-rev");
      });
      if (prev && prev !== now) {
        /* pinned where the questions sit, read off the one now in the flow, so
           lifting the old panel out does not slide it up over the progress
           rail on its way out */
        var top = now.offsetTop;
        prev.hidden = false;
        prev.style.top = top + "px";
        prev.classList.add("sa-leave");
        if (back) { prev.classList.add("sa-rev"); }
        var t = setTimeout(function () { leaving(); }, LEAVE);
        leaving = function () {
          clearTimeout(t);
          leaving = null;
          prev.classList.remove("sa-leave", "sa-rev");
          prev.style.top = "";
          prev.hidden = true;
        };
      }
      now.classList.add("sa-enter");
      if (back) { now.classList.add("sa-rev"); }
      marks.forEach(function (m, n) {
        m.className = n < at ? "done" : (n === at ? "on" : "");
      });
      doc.body.classList.toggle("past-first", at > 0);
      fit();
      if (moved) {
        var first = panels[at].querySelector(".f-text, .f-tile");
        if (first && first.focus) { first.focus({ preventScroll: true }); }
        window.scrollTo(0, 0);
      }
      gateReady();
    }

    /* the height the stage may use, measured rather than guessed, so the
       question is centred in it without ever pushing the page into a scroll */
    function fit() {
      var top = col.getBoundingClientRect().top + window.scrollY;
      col.style.setProperty("--stage-fill",
                            Math.max(300, Math.round(window.innerHeight - top - 36)) + "px");
    }
    window.addEventListener("resize", fit);

    all("[data-next]", col).forEach(function (btn) {
      btn.addEventListener("click", function (ev) { ev.preventDefault(); show(at + 1, true); });
    });
    all("[data-back]", col).forEach(function (btn) {
      btn.addEventListener("click", function (ev) { ev.preventDefault(); show(at - 1, true, true); });
    });
    col.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") { return; }
      var f = ev.target;
      if (!f || f.tagName !== "INPUT") { return; }
      ev.preventDefault();
      if (f.id === "saEmail" || f.id === "saName") { if (ready()) { submit.click(); } return; }
      var next = panels[at].querySelector("[data-next]");
      if (next) { next.click(); }
    });
    show(0);
  }

  /* paint the empty state of every echo on load */
  all("[data-sum]").forEach(function (el) {
    var k = el.getAttribute("data-sum");
    if (values[k] === undefined) { paint(k); }
  });
})();
