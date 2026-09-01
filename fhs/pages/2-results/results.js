/* Shared helpers for the three results treatments of design 2.
   The stepper and the model are untouched; these only place the summary the
   variant renders and keep the full bleed band inside the viewport width. */
(function (w) {
  var G = w.GRYD;

  /* The summary markup has no per block hooks, so tag the three blocks in DOM
     order once they exist. Every variant lays them out by these classes. */
  G.tagBlocks = function (scope) {
    var blocks = scope.querySelectorAll('.sum .sum-block');
    var names = ['b-break', 'b-zero', 'b-comp'];
    for (var i = 0; i < blocks.length && i < names.length; i++) {
      blocks[i].classList.add(names[i]);
    }
  };

  /* Line art for the eight breakdown components, in breakdown order. Drawn or
     adapted here rather than loaded so the single file build carries no extra
     asset. Icons taken from a library are wrapped in a group that scales them
     into the 32 unit box and lowers the stroke to match, so every icon renders
     at an effective 1.5 weight alongside the one drawn in place.

     Sources and licences, per component:
       heating       Lucide "heater", ISC
       solar         drawn in place for this page
       battery       Lucide "battery-charging", ISC
       partL         Tabler Icons "certificate", MIT
       ventilation   Phosphor Icons "fan", MIT
       airtightness  Tabler Icons "home-shield", MIT
       glazing       Tabler Icons "window", MIT
       wwhr          Tabler Icons "droplet-up", MIT

     Mehdi's Figma library (Myicons v1.20, file sKH97uvxAEqO3vcxFPWweF) is
     reachable and exports 24 unit 1.5 stroke SVG, but only the Weather and
     Climate canvas could be browsed, and nothing in it beat these picks. */
  function lib(art) {
    return '<g transform="scale(1.333333)" stroke-width="1.125">' + art + '</g>';
  }
  /* Phosphor draws on a 256 unit box, so it needs its own scale and the raw
     stroke width that lands on 1.5 once scaled into the 32 unit box. */
  function phos(art) {
    return '<g transform="scale(0.125)" stroke-width="12">' + art + '</g>';
  }
  var ICONS = {
    heating: lib('<path d="M11 8c2-3-2-3 0-6"/><path d="M15.5 8c2-3-2-3 0-6"/>' +
      '<path d="M6 10h.01"/><path d="M6 14h.01"/>' +
      '<path d="M10 16v-4"/><path d="M14 16v-4"/><path d="M18 16v-4"/>' +
      '<path d="M20 6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>' +
      '<path d="M5 20v2"/><path d="M19 20v2"/>'),
    solar: '<path d="M8 18h16l4 8.5H4z"/>' +
      '<path d="M13.33 18 12 26.5M18.67 18 20 26.5M6 22.25h20"/>' +
      '<circle cx="9" cy="8.5" r="3.2"/>' +
      '<path d="M9 4.1V2.5M9 12.9v1.6M13.4 8.5H15M4.6 8.5H3M12.11 5.39l1.13-1.13' +
      'M5.89 5.39 4.76 4.26M12.11 11.61l1.13 1.13M5.89 11.61 4.76 12.74"/>',
    battery: lib('<path d="m11 7-3 5h4l-3 5"/>' +
      '<path d="M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935"/>' +
      '<path d="M22 14v-4"/>' +
      '<path d="M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936"/>'),
    partL: lib('<path d="M12 15a3 3 0 1 0 6 0a3 3 0 1 0-6 0"/>' +
      '<path d="M13 17.5V22l2-1.5 2 1.5v-4.5"/>' +
      '<path d="M10 19H5a2 2 0 0 1-2-2V7c0-1.1.9-2 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-1 1.73"/>' +
      '<path d="M6 9h12M6 12h3M6 15h2"/>'),
    ventilation: phos('<circle cx="128" cy="128" r="24"/>' +
      '<path d="M104.31,124.14a52,52,0,1,1,47.69-92l-18.17,72.54"/>' +
      '<path d="M136.5,150.45A52,52,0,1,1,33,155.13l71.91-20.54"/>' +
      '<path d="M143.19,109.41A52,52,0,1,1,199,196.7l-53.74-52"/>'),
    airtightness: lib('<path d="M5 12H3l9-9 7.636 7.636"/>' +
      '<path d="M5 12v7a2 2 0 0 0 2 2h5"/><path d="M9 21v-6a2 2 0 0 1 2-2h1.5"/>' +
      '<path d="M22 16c0 4-2.5 6-3.5 6S15 20 15 16c1 0 2.5-.5 3.5-1.5 1 1 2.5 1.5 3.5 1.5"/>'),
    glazing: lib('<path d="M12 3c-3.866 0-7 3.272-7 7v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-10c0-3.728-3.134-7-7-7"/>' +
      '<path d="M5 13h14"/><path d="M12 3v18"/>'),
    wwhr: lib('<path d="M18.6 11.998a6.66 6.66 0 0 0-.536-1.12l-4.89-7.26c-.42-.626-1.287-.804-1.936-.398a1.376 1.376 0 0 0-.41.397l-4.893 7.26c-1.695 2.838-1.035 6.441 1.567 8.546a7.16 7.16 0 0 0 5.002 1.562"/>' +
      '<path d="M19 22v-6"/><path d="M22 19l-3-3-3 3"/>')
  };
  var ICON_ORDER = ['heating', 'solar', 'battery', 'partL',
    'ventilation', 'airtightness', 'glazing', 'wwhr'];

  /* Variant b only. The eight breakdown cards carry a lot of prose, so each one
     becomes an icon card that flips on its Y axis: the front carries the line
     icon on its plate, the component name and the status pill, the back carries
     the full note. The note node is moved, never rebuilt, so the wording cannot
     drift. */
  G.flipCards = function (scope) {
    var block = scope.querySelector('.b-break');
    if (!block) return;
    var grid = block.querySelector('.scores');
    if (!grid) return;
    var cards = [].slice.call(grid.querySelectorAll('.score'));
    if (!cards.length) return;

    var flips = cards.map(function (card, i) {
      var state = (card.className.match(/score-(green|amber|red)/) || [])[1] || 'green';
      var name = card.querySelector('h4');
      var pill = card.querySelector('.pill');
      var note = card.querySelector('p');
      var back = document.createElement('div');

      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'flip flip-' + state;
      el.setAttribute('aria-expanded', 'false');

      var inner = document.createElement('span');
      inner.className = 'flip-in';

      var front = document.createElement('span');
      front.className = 'flip-face flip-front';
      var art = ICONS[ICON_ORDER[i]];
      if (art) {
        var well = document.createElement('span');
        well.className = 'flip-ico';
        var disc = document.createElement('span');
        disc.className = 'flip-disc';
        disc.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true">' + art + '</svg>';
        well.appendChild(disc);
        front.appendChild(well);
      }
      var plate = document.createElement('span');
      plate.className = 'flip-plate';
      if (name) plate.appendChild(name.cloneNode(true));
      if (pill) plate.appendChild(pill.cloneNode(true));
      front.appendChild(plate);

      back.className = 'flip-face flip-back';
      var head = document.createElement('span');
      head.className = 'flip-head';
      if (name) head.appendChild(name);
      if (pill) head.appendChild(pill);
      back.appendChild(head);
      if (note) back.appendChild(note);

      inner.appendChild(front);
      inner.appendChild(back);
      el.appendChild(inner);

      /* Tap and Enter toggle the flip where hover is not available; leaving with
         the pointer always returns the card to its front. */
      el.addEventListener('click', function () {
        var on = el.getAttribute('aria-expanded') === 'true';
        el.setAttribute('aria-expanded', on ? 'false' : 'true');
      });
      el.addEventListener('mouseleave', function () {
        el.setAttribute('aria-expanded', 'false');
        back.scrollTop = 0;
      });
      return el;
    });

    grid.innerHTML = '';
    grid.className = 'flips';
    flips.forEach(function (f) { grid.appendChild(f); });
  };

  /* Variant b only. The zero cost prose and the comparison table read as one
     answer, so they share a single surface under the tiles. */
  G.combineBlocks = function (scope) {
    var zero = scope.querySelector('.b-zero');
    var comp = scope.querySelector('.b-comp');
    if (!zero || !comp) return;
    if (zero.parentNode && zero.parentNode.classList.contains('combo')) return;
    var combo = document.createElement('div');
    combo.className = 'combo';
    zero.parentNode.insertBefore(combo, zero);
    combo.appendChild(zero);
    combo.appendChild(comp);
  };

  G.recapLine = function (a) {
    return G.stepValue('house', a) + ' · ' + G.stepValue('spec', a);
  };

  G.scrollTo = function (el) {
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { el.scrollIntoView(); }
  };

  /* 100vw counts the scrollbar, which would push the page sideways. The client
     width does not, so the full bleed band reads its width from here. */
  G.syncWidth = function () {
    document.documentElement.style.setProperty(
      '--vwpx', document.documentElement.clientWidth + 'px');
  };
  G.syncWidth();
  w.addEventListener('resize', G.syncWidth);
})(window);
