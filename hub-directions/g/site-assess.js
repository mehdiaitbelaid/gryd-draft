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
  /* what was actually typed under each tile, kept beside the parsed count so a
     0, a decimal or an empty box can be reported rather than silently dropped */
  var countRaw = {};

  function countTotal() {
    return Object.keys(counts).reduce(function (n, k) { return n + (counts[k] || 0); }, 0);
  }
  function hasCounts() { return countTotal() > 0; }

  function set(key, val) {
    if (!key) { return; }
    values[key] = val;
    paint(key);
  }

  /* The send in flight and what it carried, so a second press cannot file the
     same reader twice and Try again resends exactly what failed. The result is
     drawn either way: the reader asked for numbers, not for a receipt. */
  var sending = false, lastLead = null;

  function saidSent(ok) {
    var host = doc.getElementById("saResult");
    if (!host) { return; }
    var note = host.querySelector("[data-sent]");
    if (!note) {
      note = doc.createElement("p");
      note.className = "f-tally is-off";
      note.setAttribute("data-sent", "");
      note.setAttribute("role", "status");
      host.insertBefore(note, host.firstChild);
    }
    note.hidden = ok;
    if (ok) { note.innerHTML = ""; return; }
    note.innerHTML = "We could not send your details, try again. "
      + '<button type="button" data-retry style="background:none;border:0;padding:0;'
      + 'font:inherit;color:inherit;text-decoration:underline;cursor:pointer">Try again</button>';
  }

  function sendLead(lead, result, contact) {
    if (lead) { lastLead = { lead: lead, result: result, contact: contact }; }
    if (!lastLead || !window.GrydAssessLeadApi || sending) { return; }
    sending = true;
    saidSent(true);
    window.GrydAssessLeadApi.send(lastLead.lead, lastLead.result, lastLead.contact)
      .then(function () { sending = false; saidSent(true); },
            function () { sending = false; saidSent(false); });
  }

  doc.addEventListener("click", function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest("[data-retry]")) {
      ev.preventDefault();
      sendLead(null);
    }
  });

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
      countRaw[bed] = f.value.trim();
      var n = parseInt(f.value, 10);
      if (!n || n < 1) { delete counts[bed]; } else { counts[bed] = n; lastCount = bed; }
      fillPlots();
      tally();
      gateReady();
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
            delete countRaw[bed];
            if (lastCount === bed) { lastCount = null; }
          } else {
            field.hidden = false;
          }
        }
        fillPlots();
        tally();
      }
      set(key, picked.join(", "));
      gateReady();
      if (stage) { stage.clear(); }
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
  /* set by the staged column below, so the gate can send the reader back to
     the question it is complaining about */
  var stage = null;

  var POSTCODE = (window.GrydAssessInputs || {}).POSTCODE
    || /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

  function ready() {
    return !!(values.name && values.email && /.+@.+\..+/.test(values.email));
  }

  /* Every screen used to let itself be skipped empty, and the gate filed
     whatever that left: one plot, no postcode, nothing in any band. Each
     question now answers for itself, and the same three answers are checked
     again at the gate so a reader cannot walk backwards past one. */
  function wholePlots(text) {
    var t = String(text === undefined || text === null ? "" : text).trim();
    return /^\d+$/.test(t) && Number(t) > 0;
  }

  function problemAt(i) {
    if (i === 0) {
      return POSTCODE.test(String(values.postcode || "").trim())
        ? null : "That is not a UK postcode yet.";
    }
    if (i === 1) {
      if (!beds.length) { return "Pick at least one size on the scheme."; }
      var bad = beds.some(function (b) {
        var raw = countRaw[b];
        return raw !== undefined && raw !== "" && !wholePlots(raw);
      });
      return bad ? "Give a whole number of plots, one or more, under each size." : null;
    }
    if (i === 2) {
      return wholePlots(values.plots) ? null : "Give a whole number of plots, one or more.";
    }
    return null;
  }

  function firstProblem() {
    for (var i = 0; i < 3; i++) {
      var msg = problemAt(i);
      if (msg) { return { at: i, msg: msg }; }
    }
    return null;
  }

  function engineInputs() {
    var api = window.GrydAssessInputs || {};
    var counted = hasCounts() && api.splitFromCounts;
    return { homes: counted ? countTotal() : (parseInt(values.plots, 10) || 1),
             postcode: String(values.postcode || "").toUpperCase().trim(),
             orientation: api.ORIENTATION || "South",
             energy: api.ENERGY || "All Electric",
             /* whole plots per band where they were counted, so the engine
                never runs the arithmetic through a rounded percentage */
             bandCounts: counted && api.bandCounts ? api.bandCounts(counts) : null,
             split: counted ? api.splitFromCounts(counts)
                    : (api.shareOut ? api.shareOut(beds) : { small: 100, mid: 0, large: 0 }) };
  }

  function gateReady() {
    if (submit) { submit.disabled = !ready() || !!firstProblem(); }
  }

  if (submit && form && out) {
    gateReady();
    doc.addEventListener("input", gateReady);
    doc.addEventListener("change", gateReady);
    submit.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (!ready()) { return; }
      var bad = firstProblem();
      if (bad) {
        if (stage) { stage.go(bad.at); stage.say(bad.at, bad.msg); }
        return;
      }
      window.grydAssessLead = { lead: { name: values.name, email: values.email },
                                inputs: engineInputs() };
      var answers = engineInputs();
      var result = window.GrydAssess.compute(answers);
      /* the lead goes to HubSpot through the shared sender, carrying the bed
         counts as well as the engine's own inputs, and it never blocks the
         assessment */
      sendLead({ homes: answers.homes, postcode: answers.postcode,
                 orientation: answers.orientation, energy: answers.energy,
                 beds: beds.slice(), counts: counts },
               result, { name: values.name, email: values.email });
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

    /* the complaint under the question it belongs to, made once and reused,
       in the tally's own off state so it needs no style of its own */
    function noteFor(i) {
      var panel = panels[i];
      if (!panel) { return null; }
      var note = panel.querySelector("[data-q-note]");
      if (!note) {
        note = doc.createElement("p");
        note.className = "f-tally is-off";
        note.setAttribute("data-q-note", "");
        note.setAttribute("role", "status");
        note.hidden = true;
        var field = panel.querySelector(".q-field") || panel;
        field.appendChild(note);
      }
      return note;
    }

    function say(i, msg) {
      var note = noteFor(i);
      if (!note) { return; }
      note.textContent = msg || "";
      note.hidden = !msg;
    }

    stage = {
      go: function (i) { if (i !== at) { show(i, true, i < at); } },
      say: say,
      clear: function () { if (!problemAt(at)) { say(at, ""); } }
    };

    all("[data-next]", col).forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var msg = problemAt(at);
        if (msg) { say(at, msg); return; }
        say(at, "");
        show(at + 1, true);
      });
    });
    /* the complaint goes as soon as the answer is good, rather than sitting
       under a question the reader has already fixed */
    col.addEventListener("input", function () { if (!problemAt(at)) { say(at, ""); } });
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
      else { gateReady(); }
    });
    show(0);
  }

  /* paint the empty state of every echo on load */
  all("[data-sum]").forEach(function (el) {
    var k = el.getAttribute("data-sum");
    if (values[k] === undefined) { paint(k); }
  });
})();
