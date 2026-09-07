/* The question screen of the site assessment, as a mountable piece.

   The popup and the tools page ask the same three things in the same order, so
   the questions live here and the two shells only differ in the chrome around
   them. Nothing here draws a stage counter, a Continue button or a plate: the
   host owns those and drives this through next, back and the change callback,
   which is why the same questions can sit in an 880px popup and on a full page.

   Since 4 September there is one screen, not three. The scheme is a postcode
   and the bed sizes on it, which is what the tools page asks on its own first
   stage, so the popup asks it the same way and in the same words. Since
   6 September the plot total is not asked at all: it is a line under the sizes
   reporting what the counts add to. Orientation and the heating question are gone: every
   scheme is priced all electric, and the stub does not read a compass.

   window.GrydAssessInputs.mount(container, onComplete, opts) -> controller

     onComplete(inputs)   fires when next() is called on the last screen and the
                          answers are complete. inputs is the engine's input
                          object: {homes, postcode, orientation, split, energy}
     opts.onChange(state) fires on every answer and every screen move, with
                          {screen, total, canAdvance, values}

   controller: screen(), total, next(), back(), canAdvance(), values(),
               reset(), destroy() */
(function () {
  "use strict";

  var me = document.currentScript;
  var IMG = new URL("img/site-assess/", me ? me.src : location.href).href;

  /* Five bed tiles, three engine bands. A tile is a size on the scheme, so the
     picker is multi select, and the bands it touches share the scheme evenly
     between them: two tiles inside one band are still one band. */
  var BEDS = [["1 bed", "small", "beds-1"], ["2 bed", "small", "beds-2"],
              ["3 bed", "mid", "beds-3"], ["4 bed", "mid", "beds-4"],
              ["5 bed", "large", "beds-5"]];
  var BANDS = ["small", "mid", "large"];
  /* The engine reads both, and neither is asked any more: every scheme is
     priced all electric, and the compass is not in the stub's arithmetic. */
  var ENERGY = "All Electric";
  var ORIENTATION = "South West";
  var POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

  /* Scott, 7 September: a made up postcode used to price a scheme. FX2 6HD has
     the shape of one, so the shape is no longer enough. Three gates now stand
     in front of the engine: the format, the outward area against the 124 real
     UK postcode areas, and a live lookup against postcodes.io, which is free,
     needs no key and answers cross origin. If the lookup cannot be reached the
     first two still stand and the reader is let through. */
  var AREAS = ("AB AL B BA BB BD BH BL BN BR BS BT CA CB CF CH CM CO CR CT CV CW DA DD DE DG DH DL"
    + " DN DT DY E EC EH EN EX FK FY G GL GU GY HA HD HG HP HR HS HU HX IG IM IP IV JE KA KT KW KY"
    + " L LA LD LE LL LN LS LU M ME MK ML N NE NG NN NP NR NW OL OX PA PE PH PL PO PR RG RH RM S SA"
    + " SE SG SK SL SM SN SO SP SR SS ST SW SY TA TD TF TN TQ TR TS TW UB W WA WC WD WF WN WR WS WV"
    + " YO ZE").split(" ");

  var BAD_SHAPE = "That is not a UK postcode yet.";
  var BAD_REAL = "We can't find that postcode.";
  var LOOKUP = "https://api.postcodes.io/postcodes/";
  var LOOKUP_MS = 2500;

  function tidy(pc) {
    return String(pc || "").toUpperCase().replace(/\s+/g, " ").trim();
  }

  function areaOf(pc) {
    return (tidy(pc).replace(/[^A-Z0-9]/g, "").match(/^[A-Z]{1,2}/) || [""])[0];
  }

  function formatOk(pc) { return POSTCODE.test(tidy(pc)); }
  function areaOk(pc) { return AREAS.indexOf(areaOf(pc)) >= 0; }
  /* both offline gates, which is also the test for whether the lookup is worth
     a request */
  function shapeOk(pc) { return formatOk(pc) && areaOk(pc); }

  /* yes, no or unknown per postcode, so a reader who types the same one twice
     is not looked up twice and Continue can read what input already learned */
  var seen = {};

  function verdict(pc) { return seen[tidy(pc)] || null; }

  function verify(pc) {
    var key = tidy(pc);
    if (!shapeOk(key)) { return Promise.resolve("no"); }
    if (seen[key]) { return Promise.resolve(seen[key]); }
    if (typeof fetch !== "function") { seen[key] = "unknown"; return Promise.resolve("unknown"); }
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) { ctl.abort(); } }, LOOKUP_MS);
    var url = LOOKUP + encodeURIComponent(key.replace(/\s+/g, "")) + "/validate";
    return fetch(url, ctl ? { signal: ctl.signal } : undefined)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("http")); })
      .then(function (body) {
        clearTimeout(timer);
        var out = body && body.result === false ? "no" : "yes";
        seen[key] = out;
        return out;
      }, function () {
        clearTimeout(timer);
        /* Unreachable is recorded as unknown, not as an answer: nothing is
           blocked on it, the format and the area gates still stand, and the
           press that is waiting on it is let through rather than asking the
           same dead endpoint on every keystroke. */
        seen[key] = "unknown";
        return "unknown";
      });
  }

  /* the complaint to show, or "" when there is nothing to say yet */
  function problem(pc) {
    var v = tidy(pc);
    if (!v) { return ""; }
    /* the shape of a postcode and a postcode that exists are two different
       complaints: FX2 6HD is shaped like one, so it is told it cannot be found
       rather than that it is not one yet */
    if (!formatOk(v)) { return BAD_SHAPE; }
    if (!areaOk(v)) { return BAD_REAL; }
    return verdict(v) === "no" ? BAD_REAL : "";
  }

  window.GrydPostcode = { POSTCODE: POSTCODE, AREAS: AREAS, tidy: tidy, areaOf: areaOf,
                          formatOk: formatOk, areaOk: areaOk, shapeOk: shapeOk, verify: verify, verdict: verdict,
                          problem: problem, BAD_SHAPE: BAD_SHAPE, BAD_REAL: BAD_REAL };

  var shapeOk = window.GrydPostcode.shapeOk;
  var verify = window.GrydPostcode.verify;
  var verdict = window.GrydPostcode.verdict;
  var problem = window.GrydPostcode.problem;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function bedTile(b) {
    return '<div class="ai-tile-cell">'
      + '<button type="button" class="ai-tile" aria-pressed="false" data-value="'
      + esc(b[0]) + '"><img src="' + IMG + b[2] + '.png" alt="" width="300" height="300"'
      + ' decoding="async"><span class="ai-tile-name">' + esc(b[0]) + "</span></button>"
      + '<input class="ai-count" type="number" min="1" step="1" inputmode="numeric"'
      + ' data-count="' + esc(b[0]) + '" aria-label="' + esc(b[0]) + ' plots"'
      + ' placeholder="0" disabled></div>';
  }

  function row(label, inner) {
    return '<div class="ai-row"><span class="ai-lab">' + esc(label) + "</span>"
      + '<div class="ai-in">' + inner + "</div></div>";
  }

  function markup() {
    var beds = BEDS.map(bedTile).join("");
    return '<section class="ai-screen" data-screen="0" hidden>'
      + "<h2>Where the site is and how big</h2>"
      + '<div class="ai-rows">'
      + row("Site postcode",
            '<input class="ai-text" type="text" id="aiPostcode" data-key="postcode"'
            + ' aria-label="Site postcode" placeholder="NR20 5DF" autocomplete="postal-code">'
            + '<p class="ai-hint">The postcode is enough to place it.</p>'
            + '<span class="ai-note" data-postcode-note hidden>'
            + "That is not a UK postcode yet.</span>")
      + row("Number of plots",
            '<div class="ai-tiles" data-tiles="bedrooms" role="group" aria-label="Bedrooms">'
            + beds + "</div>"
            + '<p class="ai-hint">Pick every size on the scheme, then say how many'
            + " of each.</p>"
            + '<p class="ai-tally" data-tally hidden></p>'
            + '<p class="ai-total" data-total hidden role="status">'
            + '<span class="ai-total-lab">Total plots</span>'
            + '<span class="ai-total-n" data-total-n>0</span></p>')
      + "</div></section>";
  }

  /* An even share of the scheme to every band a chosen bed size lands in. The
     remainder goes to the first band rather than being dropped, so the three
     always read as 100. */
  function shareOut(picked) {
    var split = { small: 0, mid: 0, large: 0 };
    var hit = BANDS.filter(function (k) {
      return picked.some(function (name) {
        return BEDS.some(function (b) { return b[0] === name && b[1] === k; });
      });
    });
    if (!hit.length) { return split; }
    var each = Math.floor(100 / hit.length);
    hit.forEach(function (k) { split[k] = each; });
    split[hit[0]] += 100 - each * hit.length;
    return split;
  }

  /* The split straight off the plot counts, for the summary to print. The
     three are rounded down and the leftover points go to the largest
     fractional parts first, which keeps them reading as 100. The engine is
     given bandCounts instead, so this rounding never reaches a figure. */
  function splitFromCounts(counts) {
    var split = { small: 0, mid: 0, large: 0 };
    var raw = { small: 0, mid: 0, large: 0 };
    var total = 0;
    Object.keys(counts).forEach(function (name) {
      var n = counts[name] || 0;
      if (n <= 0) { return; }
      BEDS.forEach(function (b) { if (b[0] === name) { raw[b[1]] += n; total += n; } });
    });
    if (!total) { return split; }
    var rest = 100;
    var parts = BANDS.map(function (k) {
      var exact = raw[k] * 100 / total;
      split[k] = Math.floor(exact);
      rest -= split[k];
      return { k: k, frac: exact - Math.floor(exact) };
    });
    parts.sort(function (a, b) { return b.frac - a.frac; });
    for (var i = 0; i < rest; i++) { split[parts[i % parts.length].k] += 1; }
    return split;
  }

  /* The plots per engine band, straight off the counts and never through the
     percentages: the engine wants whole homes, and three plots one to a band
     are three homes rather than 1.02 / 0.99 / 0.99 of one. */
  function bandCounts(counts) {
    var out = { small: 0, mid: 0, large: 0 };
    Object.keys(counts).forEach(function (name) {
      var n = counts[name] || 0;
      if (n <= 0) { return; }
      BEDS.forEach(function (b) { if (b[0] === name) { out[b[1]] += n; } });
    });
    return out;
  }

  function countTotal(counts) {
    return Object.keys(counts).reduce(function (n, k) { return n + (counts[k] || 0); }, 0);
  }

  function mount(container, onComplete, opts) {
    opts = opts || {};
    container.classList.add("ai-root");
    container.innerHTML = markup();

    var screens = [].slice.call(container.querySelectorAll(".ai-screen"));
    var at = 0;
    var v = { homes: null, postcode: "", beds: [], counts: {} };
    /* the count the reader touched last, which is the one that gives way when
       the plot total is typed over the top of the counts */
    var lastCount = null;

    function hasCounts() { return countTotal(v.counts) > 0; }

    /* Every size on the scheme carries its own count, so the line under the
       tiles says which ones are still waiting rather than counting towards a
       total the reader could once type. */
    function uncounted() {
      return v.beds.filter(function (b) { return !(v.counts[b] > 0); });
    }

    function tally() {
      var line = container.querySelector("[data-tally]");
      var waiting = uncounted();
      /* Mehdi, 6 September: once every size is counted the total line below
         says what they add to, so the tally has nothing left to say and goes
         rather than repeating it. */
      line.hidden = !v.beds.length || !waiting.length;
      if (line.hidden) { return; }
      line.textContent = "How many plots of "
        + waiting.join(", ") + "? A whole number, one or more.";
      line.classList.add("is-off");
    }

    /* Mehdi, 6 September: the total was never a question, so it is not a field.
       It is a line under the sizes that reports the sum, and nothing else on
       the screen can change it. */
    function fillHomes() {
      var total = countTotal(v.counts);
      v.homes = total || null;
      var line = container.querySelector("[data-total]");
      line.hidden = !total;
      container.querySelector("[data-total-n]").textContent = total ? String(total) : "0";
    }

    function canAdvance() {
      return shapeOk(v.postcode) && verdict(v.postcode) !== "no" && v.beds.length > 0
        && uncounted().length === 0 && !!(v.homes && v.homes > 0);
    }

    /* the postcode complaint, in the note the screen already owns */
    function sayPostcode() {
      var note = container.querySelector("[data-postcode-note]");
      if (!note) { return; }
      var msg = problem(v.postcode);
      note.textContent = msg;
      note.hidden = !msg;
    }

    /* The lookup runs while the reader types, a beat behind the keystrokes, so
       the answer is usually already in hand by the time Continue is pressed. */
    var lookupTimer = null;
    function lookupSoon() {
      if (lookupTimer) { clearTimeout(lookupTimer); }
      var pc = v.postcode;
      if (!shapeOk(pc) || verdict(pc)) { return; }
      lookupTimer = setTimeout(function () {
        verify(pc).then(function () {
          if (v.postcode !== pc) { return; }
          sayPostcode();
          changed();
        });
      }, 400);
    }

    function values() {
      var counted = hasCounts();
      return { homes: counted ? countTotal(v.counts) : v.homes,
               postcode: v.postcode.toUpperCase().trim(),
               orientation: ORIENTATION, energy: ENERGY, beds: v.beds.slice(),
               counts: JSON.parse(JSON.stringify(v.counts)),
               bandCounts: counted ? bandCounts(v.counts) : null,
               split: counted ? splitFromCounts(v.counts) : shareOut(v.beds) };
    }

    function changed() {
      if (opts.onChange) {
        opts.onChange({ screen: at, total: screens.length,
                        canAdvance: canAdvance(), values: values() });
      }
    }

    function show(i) {
      at = Math.max(0, Math.min(screens.length - 1, i));
      screens.forEach(function (s, n) { s.hidden = n !== at; });
      changed();
      var first = screens[at].querySelector("input, button");
      if (first) { first.focus({ preventScroll: true }); }
    }

    function onClick(ev) {
      var t = ev.target.closest ? ev.target.closest(".ai-tile") : null;
      if (!t || !container.contains(t)) { return; }
      var on = t.getAttribute("aria-pressed") === "true";
      t.setAttribute("aria-pressed", on ? "false" : "true");
      v.beds = [].slice.call(container.querySelectorAll('.ai-tile[aria-pressed="true"]'))
        .map(function (b) { return b.getAttribute("data-value"); });
      var name = t.getAttribute("data-value");
      var field = t.parentNode.querySelector(".ai-count");
      if (on) {
        field.disabled = true;
        field.value = "";
        delete v.counts[name];
        if (lastCount === name) { lastCount = null; }
      } else {
        field.disabled = false;
      }
      fillHomes();
      tally();
      changed();
    }

    function onInput(ev) {
      var bed = ev.target.getAttribute("data-count");
      if (bed) {
        var n = parseInt(ev.target.value, 10);
        if (!n || n < 1) { delete v.counts[bed]; } else { v.counts[bed] = n; lastCount = bed; }
        fillHomes();
        tally();
        changed();
        return;
      }
      var key = ev.target.getAttribute("data-key");
      if (!key) { return; }
      if (key === "postcode") {
        v.postcode = ev.target.value;
        sayPostcode();
        lookupSoon();
      }
      changed();
    }

    container.addEventListener("click", onClick);
    container.addEventListener("input", onInput);

    var api = {
      total: screens.length,
      screen: function () { return at; },
      canAdvance: canAdvance,
      values: values,
      next: function () {
        /* Continue asks again rather than trusting what the typing pass left:
           a postcode never looked up is looked up here, and the press is
           replayed once the answer lands. */
        if (shapeOk(v.postcode) && !verdict(v.postcode)) {
          var pc = v.postcode;
          verify(pc).then(function () {
            if (v.postcode !== pc) { return; }
            sayPostcode();
            changed();
            if (canAdvance()) { api.next(); }
          });
          return false;
        }
        if (!canAdvance()) { sayPostcode(); changed(); return false; }
        if (at === screens.length - 1) { onComplete(values()); return true; }
        show(at + 1);
        return true;
      },
      back: function () {
        if (at === 0) { return false; }
        show(at - 1);
        return true;
      },
      reset: function () {
        v = { homes: null, postcode: "", beds: [], counts: {} };
        lastCount = null;
        [].slice.call(container.querySelectorAll(".ai-count")).forEach(function (f) {
          f.value = "";
          f.disabled = true;
        });
        container.querySelector("[data-tally]").hidden = true;
        container.querySelector("[data-total]").hidden = true;
        container.querySelector("[data-total-n]").textContent = "0";
        [].slice.call(container.querySelectorAll(".ai-tile")).forEach(function (b) {
          b.setAttribute("aria-pressed", "false");
        });
        container.querySelector("#aiPostcode").value = "";
        container.querySelector("[data-postcode-note]").hidden = true;
        show(0);
      },
      destroy: function () {
        container.removeEventListener("click", onClick);
        container.removeEventListener("input", onInput);
        container.innerHTML = "";
      }
    };

    show(0);
    return api;
  }

  window.GrydAssessInputs = { mount: mount, POSTCODE: POSTCODE,
                              shapeOk: shapeOk, verify: verify, verdict: verdict,
                              problem: problem, AREAS: AREAS,
                              shareOut: shareOut, splitFromCounts: splitFromCounts,
                              bandCounts: bandCounts,
                              countTotal: countTotal, BEDS: BEDS,
                              ENERGY: ENERGY, ORIENTATION: ORIENTATION };
})();
