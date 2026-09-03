/* Site assessment request flow.

   The flow is static until there is somewhere to post to: it reads what has
   been typed or tapped so the page can echo it back, walks one question at a
   time, and swaps the form for the confirmation when the request is sent. The
   file it is handed is named back, never read. */
(function () {
  "use strict";

  var doc = document;
  function all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------- values */

  var values = {};

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

  /* ------------------------------------------------------- submit and confirm */

  var form = doc.getElementById("saForm");
  var done = doc.getElementById("saDone");
  var submit = doc.getElementById("saSubmit");
  if (submit && form && done) {
    submit.addEventListener("click", function (ev) {
      ev.preventDefault();
      form.hidden = true;
      done.hidden = false;
      window.scrollTo(0, 0);
    });
  }

  /* ------------------------------------------------- E, one question at a time */

  var eCol = doc.querySelector("[data-one-at-a-time]");
  if (eCol) {
    var qs = all(".e-q", eCol);
    var ledger = eCol.querySelector(".e-ledger");
    var fill = eCol.querySelector(".e-prog i");
    var at = 0;

    function show(i) {
      at = Math.max(0, Math.min(qs.length - 1, i));
      qs.forEach(function (q, n) { q.hidden = n !== at; });
      if (fill) { fill.style.width = ((at + 1) / qs.length * 100).toFixed(1) + "%"; }
      writeLedger();
      var first = qs[at].querySelector(".f-text, .f-area, .f-tile, .seg");
      if (first && first.focus) { first.focus({ preventScroll: true }); }
    }

    function writeLedger() {
      if (!ledger) { return; }
      ledger.innerHTML = "";
      qs.slice(0, at).forEach(function (q) {
        var name = q.getAttribute("data-ledger") || "";
        var key = q.getAttribute("data-ledger-key");
        var v = key ? values[key] : "";
        if (!v) { v = "Skipped"; }
        var row = doc.createElement("div");
        row.className = "l-row";
        var k = doc.createElement("span");
        k.className = "k";
        k.textContent = name;
        var val = doc.createElement("span");
        val.className = "v";
        val.textContent = v;
        row.appendChild(k);
        row.appendChild(val);
        ledger.appendChild(row);
      });
    }

    all("[data-next]", eCol).forEach(function (b) {
      b.addEventListener("click", function (ev) { ev.preventDefault(); show(at + 1); });
    });
    all("[data-back]", eCol).forEach(function (b) {
      b.addEventListener("click", function (ev) { ev.preventDefault(); show(at - 1); });
    });
    show(0);
  }

  /* paint the empty state of every echo on load */
  all("[data-sum]").forEach(function (el) {
    var k = el.getAttribute("data-sum");
    if (values[k] === undefined) { paint(k); }
  });
})();
