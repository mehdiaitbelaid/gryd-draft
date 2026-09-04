/* The three question screens of the site assessment, as a mountable piece.

   The popup and the tools page ask the same questions in the same order, so the
   questions live here and the two shells only differ in the chrome around them.
   Nothing here draws a stage counter, a Continue button or a plate: the host
   owns those and drives this through next, back and the change callback, which
   is why the same three screens can sit in a 880px popup and on a full page.

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

  var PLOT_BANDS = [["Under 20", 12], ["20 to 50", 35], ["50 to 100", 75],
                    ["100 to 250", 150], ["250 or more", 300]];
  var SPLIT = [["small", "1 to 2 Bed", "beds-2"], ["mid", "3 to 4 Bed", "beds-4"],
               ["large", "5+ Bed", "beds-5"]];
  var ORIENT = ["North", "East", "South", "West"];
  var POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  /* the compass needle, turned to the face being offered */
  function compass(dir) {
    var turn = { North: 0, East: 90, South: 180, West: 270 }[dir] || 0;
    return '<svg class="ai-compass" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
      + '<circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".45"/>'
      + '<g transform="rotate(' + turn + ' 24 24)">'
      + '<path d="M24 8 L30 30 L24 26 L18 30 Z" fill="currentColor"/></g></svg>';
  }

  function bolt() {
    return '<svg class="ai-glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
      + '<path d="M27 6 L14 27 H23 L21 42 L34 21 H25 Z" fill="currentColor"/></svg>';
  }
  function flame() {
    return '<svg class="ai-glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
      + '<path d="M24 5c7 9 13 12 13 21a13 13 0 0 1-26 0c0-5 3-8 5-12 1 3 3 5 5 5 2 0 3-2 3-5 0-3 0-6 0-9z"'
      + ' fill="currentColor"/></svg>';
  }

  function tile(value, inner, cls) {
    return '<button type="button" class="ai-tile' + (cls ? " " + cls : "") + '"'
      + ' aria-pressed="false" data-value="' + esc(value) + '">' + inner
      + '<span class="ai-tile-name">' + esc(value) + "</span></button>";
  }

  function markup() {
    var plots = PLOT_BANDS.map(function (b) {
      return tile(b[0], '<span class="ai-band-n">' + esc(b[0]) + "</span>", "ai-tile-plain");
    }).join("");

    var dom = SPLIT.map(function (s) {
      return tile(s[1], '<img src="' + IMG + s[2] + '.png" alt="" width="300" height="300"'
        + ' decoding="async">');
    }).join("");

    var sliders = SPLIT.map(function (s) {
      return '<div class="ai-slider"><label for="aiSplit-' + s[0] + '">' + esc(s[1])
        + '</label><input type="range" id="aiSplit-' + s[0] + '" data-split="' + s[0]
        + '" min="0" max="100" step="5" value="0">'
        + '<output data-split-out="' + s[0] + '">0%</output></div>';
    }).join("");

    var energy = tile("All Electric", bolt(), "ai-tile-glyph")
      + tile("Gas", flame(), "ai-tile-glyph");

    var orient = ORIENT.map(function (d) { return tile(d, compass(d)); }).join("");

    return '<section class="ai-screen" data-screen="0" hidden>'
      + '<span class="ai-eyebrow">Your scheme</span>'
      + "<h2>How many homes are you building?</h2>"
      + '<p class="ai-stand">Pick the band you are in, then set the exact figure if you have it.</p>'
      + '<div class="ai-tiles ai-tiles-5" data-tiles="plotBand" role="group"'
      + ' aria-label="Number of homes">' + plots + "</div>"
      + '<div class="ai-field"><label for="aiHomes">Exact number of homes</label>'
      + '<input type="number" id="aiHomes" data-key="homes" min="1" step="1"'
      + ' inputmode="numeric" placeholder="100"></div>'
      + "</section>"

      + '<section class="ai-screen" data-screen="1" hidden>'
      + '<span class="ai-eyebrow">Your scheme</span>'
      + "<h2>What is the mix, and how are the homes heated?</h2>"
      + '<p class="ai-stand">Choose the size that dominates, then fine tune the split.</p>'
      + '<div class="ai-tiles ai-tiles-3" data-tiles="dominant" role="group"'
      + ' aria-label="Dominant home size">' + dom + "</div>"
      + '<div class="ai-sliders" role="group" aria-label="Home size split">' + sliders
      + '<p class="ai-sum" data-sum>Adds up to 100%</p></div>'
      + '<div class="ai-tiles ai-tiles-2 ai-tiles-wide" data-tiles="energy" role="group"'
      + ' aria-label="Energy type">' + energy + "</div>"
      + "</section>"

      + '<section class="ai-screen" data-screen="2" hidden>'
      + '<span class="ai-eyebrow">Your scheme</span>'
      + "<h2>Where is the site, and which way do the roofs face?</h2>"
      + '<p class="ai-stand">The postcode places it. The average orientation sizes it.</p>'
      + '<div class="ai-field"><label for="aiPostcode">Site postcode</label>'
      + '<input type="text" id="aiPostcode" data-key="postcode" autocomplete="postal-code"'
      + ' placeholder="SW5 0PX"><span class="ai-note" data-postcode-note hidden>'
      + "That is not a UK postcode yet.</span></div>"
      + '<div class="ai-tiles ai-tiles-4" data-tiles="orientation" role="group"'
      + ' aria-label="Average orientation">' + orient + "</div>"
      + "</section>";
  }

  function mount(container, onComplete, opts) {
    opts = opts || {};
    container.classList.add("ai-root");
    container.innerHTML = markup();

    var screens = [].slice.call(container.querySelectorAll(".ai-screen"));
    var at = 0;
    var v = { homes: null, postcode: "", orientation: "", energy: "",
              split: { small: 0, mid: 0, large: 0 } };

    function press(group, value) {
      [].slice.call(container.querySelectorAll('[data-tiles="' + group + '"] .ai-tile'))
        .forEach(function (b) {
          b.setAttribute("aria-pressed", String(b.getAttribute("data-value") === value));
        });
    }

    function paintSplit() {
      SPLIT.forEach(function (s) {
        var r = container.querySelector('[data-split="' + s[0] + '"]');
        var o = container.querySelector('[data-split-out="' + s[0] + '"]');
        r.value = String(v.split[s[0]]);
        o.textContent = v.split[s[0]] + "%";
      });
      var total = v.split.small + v.split.mid + v.split.large;
      container.querySelector("[data-sum]").textContent = total === 100
        ? "Adds up to 100%" : "Adds up to " + total + "%, it needs to be 100%";
    }

    /* One slider is the one the reader moved; the other two absorb the change
       in the proportion they already stood in, so the split always sums to 100
       without the reader having to do the arithmetic. */
    function rebalance(moved, value) {
      var keys = ["small", "mid", "large"].filter(function (k) { return k !== moved; });
      var rest = 100 - value;
      var had = v.split[keys[0]] + v.split[keys[1]];
      v.split[moved] = value;
      if (had <= 0) {
        v.split[keys[0]] = rest;
        v.split[keys[1]] = 0;
      } else {
        v.split[keys[0]] = Math.round(v.split[keys[0]] / had * rest);
        v.split[keys[1]] = rest - v.split[keys[0]];
      }
      paintSplit();
    }

    function splitTotal() { return v.split.small + v.split.mid + v.split.large; }

    function canAdvance() {
      if (at === 0) { return !!(v.homes && v.homes > 0); }
      if (at === 1) { return splitTotal() === 100 && !!v.energy; }
      return POSTCODE.test(v.postcode) && !!v.orientation;
    }

    function values() {
      return { homes: v.homes, postcode: v.postcode.toUpperCase().trim(),
               orientation: v.orientation, energy: v.energy,
               split: { small: v.split.small, mid: v.split.mid, large: v.split.large } };
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
      var t = ev.target.closest(".ai-tile");
      if (!t) { return; }
      var group = t.closest("[data-tiles]").getAttribute("data-tiles");
      var value = t.getAttribute("data-value");
      press(group, value);
      if (group === "plotBand") {
        var band = PLOT_BANDS.filter(function (b) { return b[0] === value; })[0];
        v.homes = band[1];
        container.querySelector("#aiHomes").value = String(band[1]);
      } else if (group === "dominant") {
        var key = SPLIT.filter(function (s) { return s[1] === value; })[0][0];
        v.split = { small: 0, mid: 0, large: 0 };
        ["small", "mid", "large"].forEach(function (k) { v.split[k] = k === key ? 60 : 20; });
        paintSplit();
      } else if (group === "energy") {
        v.energy = value;
      } else if (group === "orientation") {
        v.orientation = value;
      }
      changed();
    }

    function onInput(ev) {
      var el = ev.target;
      if (el.hasAttribute("data-split")) {
        rebalance(el.getAttribute("data-split"), parseInt(el.value, 10) || 0);
        changed();
        return;
      }
      var key = el.getAttribute("data-key");
      if (!key) { return; }
      if (key === "homes") { v.homes = parseInt(el.value, 10) || null; }
      if (key === "postcode") {
        v.postcode = el.value;
        var note = container.querySelector("[data-postcode-note]");
        note.hidden = !el.value || POSTCODE.test(el.value);
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
        v = { homes: null, postcode: "", orientation: "", energy: "",
              split: { small: 0, mid: 0, large: 0 } };
        [].slice.call(container.querySelectorAll(".ai-tile")).forEach(function (b) {
          b.setAttribute("aria-pressed", "false");
        });
        container.querySelector("#aiHomes").value = "";
        container.querySelector("#aiPostcode").value = "";
        container.querySelector("[data-postcode-note]").hidden = true;
        paintSplit();
        show(0);
      },
      destroy: function () {
        container.removeEventListener("click", onClick);
        container.removeEventListener("input", onInput);
        container.innerHTML = "";
      }
    };

    paintSplit();
    show(0);
    return api;
  }

  window.GrydAssessInputs = { mount: mount, POSTCODE: POSTCODE };
})();
