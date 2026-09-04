/* The question screen of the site assessment, as a mountable piece.

   The popup and the tools page ask the same three things in the same order, so
   the questions live here and the two shells only differ in the chrome around
   them. Nothing here draws a stage counter, a Continue button or a plate: the
   host owns those and drives this through next, back and the change callback,
   which is why the same questions can sit in an 880px popup and on a full page.

   Since 4 September there is one screen, not three. The scheme is a postcode,
   the bed sizes on it and the number of plots, which is what the tools page
   already asked on its own first stage, so the popup asks it the same way and
   in the same words. Orientation and the heating question are gone: every
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
  var ORIENTATION = "South";
  var POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function bedTile(b) {
    return '<button type="button" class="ai-tile" aria-pressed="false" data-value="'
      + esc(b[0]) + '"><img src="' + IMG + b[2] + '.png" alt="" width="300" height="300"'
      + ' decoding="async"><span class="ai-tile-name">' + esc(b[0]) + "</span></button>";
  }

  function row(label, inner) {
    return '<div class="ai-row"><span class="ai-lab">' + esc(label) + "</span>"
      + '<div class="ai-in">' + inner + "</div></div>";
  }

  function markup() {
    var beds = BEDS.map(bedTile).join("");
    return '<section class="ai-screen" data-screen="0" hidden>'
      + '<span class="ai-eyebrow">Your scheme</span>'
      + "<h2>Where the site is and how big</h2>"
      + '<div class="ai-rows">'
      + row("Site postcode",
            '<input class="ai-text" type="text" id="aiPostcode" data-key="postcode"'
            + ' aria-label="Site postcode" placeholder="NR20 5DF" autocomplete="postal-code">'
            + '<p class="ai-hint">The postcode is enough to place it.</p>'
            + '<span class="ai-note" data-postcode-note hidden>'
            + "That is not a UK postcode yet.</span>")
      + row("Bedrooms",
            '<div class="ai-tiles" data-tiles="bedrooms" role="group" aria-label="Bedrooms">'
            + beds + "</div>"
            + '<p class="ai-hint">Pick every size on the scheme.</p>')
      + row("Number of plots",
            '<input class="ai-text" type="number" id="aiHomes" data-key="homes"'
            + ' aria-label="Number of plots" placeholder="42" min="1" step="1"'
            + ' inputmode="numeric">')
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

  function mount(container, onComplete, opts) {
    opts = opts || {};
    container.classList.add("ai-root");
    container.innerHTML = markup();

    var screens = [].slice.call(container.querySelectorAll(".ai-screen"));
    var at = 0;
    var v = { homes: null, postcode: "", beds: [] };

    function canAdvance() {
      return POSTCODE.test(v.postcode) && v.beds.length > 0 && !!(v.homes && v.homes > 0);
    }

    function values() {
      return { homes: v.homes, postcode: v.postcode.toUpperCase().trim(),
               orientation: ORIENTATION, energy: ENERGY, beds: v.beds.slice(),
               split: shareOut(v.beds) };
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
      changed();
    }

    function onInput(ev) {
      var key = ev.target.getAttribute("data-key");
      if (!key) { return; }
      if (key === "homes") { v.homes = parseInt(ev.target.value, 10) || null; }
      if (key === "postcode") {
        v.postcode = ev.target.value;
        var note = container.querySelector("[data-postcode-note]");
        note.hidden = !ev.target.value || POSTCODE.test(ev.target.value);
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
        if (!canAdvance()) { changed(); return false; }
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
        v = { homes: null, postcode: "", beds: [] };
        [].slice.call(container.querySelectorAll(".ai-tile")).forEach(function (b) {
          b.setAttribute("aria-pressed", "false");
        });
        container.querySelector("#aiHomes").value = "";
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
                              shareOut: shareOut, BEDS: BEDS,
                              ENERGY: ENERGY, ORIENTATION: ORIENTATION };
})();
