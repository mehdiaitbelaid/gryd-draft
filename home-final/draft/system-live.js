/* Ambient life over the system film.

   One rule decides everything in here: nothing is drawn that is not already
   lit in the frame. There are no wires, no vehicles and no invented network.

   BEAT 5 carries the only orange. The plate's own street glow was pulled out
   of the film frame at the end of the beat 5 window (mask on the blown red
   channel, morphological close, skeletonise, Douglas-Peucker), so the paths
   below sit on the streets the render already lights. The paths themselves are
   never painted: they live in defs and only carry beads.

   BEADS run at one speed on both streets. Each path's duration is its own
   measured length over that speed and the beads on it are spread by exact
   fractions of that duration, so spacing is a constant number of units on the
   ground and stays constant for the whole loop. Nothing bunches, nothing
   overtakes, and neither street ever empties.

   Nothing runs per frame. Paths are built once and animated by
   SMIL, which the compositor owns; the only JavaScript after init is the
   MutationObserver reading the step the driver already wrote onto the pin,
   plus the IntersectionObserver that stops the layer off screen.

   Coordinates are percentages of the rendered picture times 16 and 9. The
   frame is 16:9, the film is 16:9 and object-fit is contain, so the picture
   fills the frame box exactly; a viewBox of 1600 by 900 over that box is
   uniform, which keeps the bead round, and the layer is a child of .sys-frame
   so the section's scroll scale and idle breath carry it. */
(function () {
  'use strict';

  var pin = document.getElementById('sysPin');
  var video = document.getElementById('sysVideo');
  if (!pin || !video) return;
  if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (/[?&]overlay=off/.test(location.search)) return;

  var NS = 'http://www.w3.org/2000/svg';
  var frame = video.parentNode;

  function el(name, attrs, inner) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (inner) n.innerHTML = inner;
    return n;
  }

  /* ------------------------------------------------------- street geometry
     Vectorised from the beat 5 frame, not measured by eye. The camera is
     locked for the whole take and the estate does not move within the beat 5
     window (phase correlation between the window's first and last frame puts
     the drift at 0.03px on a 1920 wide plate), so one extraction holds for the
     whole beat and the beads can be up as soon as the beat is. */
  var SPINE = 'M579.17 315.83L545.83 331.67L525.83 345.83L515 360.83' +
              'L513.33 375L516.67 382.5L536.67 399.17L614.17 438.33' +
              'L630 443.33L636.67 451.67L648.33 453.33L685 471.67' +
              'L709.17 478.33L713.33 485.83L723.33 493.33L793.33 528.33' +
              'L806.67 531.67L812.5 538.33L839.17 550.83L843.33 558.33' +
              'L844.17 559.17L885.83 570L888.33 576.67L964.17 614.17' +
              'L974.17 615.83L979.17 621.67L1015 640L1012.5 645';
  var SPUR = 'M841.67 430L774.17 465.83L743.33 473.33L718.33 473.33L709.17 478.33';

  var svg = el('svg', {
    'class': 'sys-live', viewBox: '0 0 1600 900',
    preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false'
  });
  var defs = el('defs');
  var spine = el('path', { id: 'sysSpine', d: SPINE });
  var spur = el('path', { id: 'sysSpur', d: SPUR });
  defs.appendChild(spine);
  defs.appendChild(spur);

  /* The bead is the CTA map's: a hard core out to about a fifth of the radius,
     a shoulder, then nothing. At this size the core reads as a 3px dot and the
     halo as the light it throws. Colours are the flare's, so a bead passing a
     lit street lamp is the same light. */
  defs.appendChild(el('radialGradient', { id: 'sysBeadGlow' },
    '<stop offset="0" stop-color="#FFF0E8" stop-opacity="1"/>' +
    '<stop offset="0.13" stop-color="#FFB199" stop-opacity="1"/>' +
    '<stop offset="0.24" stop-color="#FF6E46" stop-opacity="0.85"/>' +
    '<stop offset="0.46" stop-color="#FF5532" stop-opacity="0.18"/>' +
    '<stop offset="1" stop-color="#FF5532" stop-opacity="0"/>'));

  /* The plate's own outline, so the cloud shadow falls on the model and stops
     at its edge. Without this the wash crosses the white page around the
     plate, where a cloud shadow has nothing to fall on and reads as a smudge
     on the layout rather than as weather over the estate. */
  defs.appendChild(el('clipPath', { id: 'sysPlate' },
    '<polygon points="95,372 851,4 1512,520 774,868"/>'));

  // the cloud is a gradient rather than a blurred shape: a filter on a moving
  // element is the one thing in here that would cost a repaint per frame
  defs.appendChild(el('radialGradient', { id: 'sysCloud' },
    '<stop offset="0" stop-color="#2A1B12" stop-opacity="1"/>' +
    '<stop offset="0.45" stop-color="#2A1B12" stop-opacity="0.55"/>' +
    '<stop offset="1" stop-color="#2A1B12" stop-opacity="0"/>'));

  svg.appendChild(defs);
  frame.appendChild(svg);

  /* ---------------------------------------------------------------- beat 5
     One speed for both streets. A path's duration is its own length over that
     speed, so a bead covers the same ground per second wherever it is, and the
     beads on a path are launched at exact fractions of that duration, which
     puts them a fixed distance apart for the whole loop rather than only at
     the start. */
  var BEAD_SPEED = 52;     // viewBox units a second, about 24 CSS px at 1440
  var net = el('g', { 'class': 'lg' });
  var spacing = {};
  [[spine, 'sysSpine', 8], [spur, 'sysSpur', 2]].forEach(function (r) {
    var len = r[0].getTotalLength();
    var dur = len / BEAD_SPEED;
    spacing[r[1]] = { length: +len.toFixed(1), dur: +dur.toFixed(2),
                      gap: +(len / r[2]).toFixed(1) };
    for (var i = 0; i < r[2]; i++) {
      net.appendChild(el('circle', {
        'class': 'bead', r: '20', fill: 'url(#sysBeadGlow)'
      }, '<animateMotion dur="' + dur.toFixed(3) + 's" begin="' +
         (-dur * i / r[2]).toFixed(3) + 's" repeatCount="indefinite" ' +
         'calcMode="linear"><mpath href="#' + r[1] + '"/></animateMotion>'));
    }
  });
  svg.appendChild(net);
  svg.dataset.beadSpacing = JSON.stringify(spacing);

  /* ---------------------------------------------------- weather, beats 1-4 */
  var cloud = el('g', { 'class': 'cl', 'clip-path': 'url(#sysPlate)' });
  cloud.appendChild(el('ellipse', {
    cx: '0', cy: '0', rx: '660', ry: '250', fill: 'url(#sysCloud)'
  }));
  cloud.appendChild(el('animateTransform', {
    attributeName: 'transform', type: 'translate',
    values: '-820 300; 2420 580', dur: '45s', repeatCount: 'indefinite'
  }));
  svg.appendChild(cloud);

  /* Which layer is up. The driver already writes the step onto the pin, so the
     overlay reads that rather than the film clock and cannot disagree with the
     copy on screen. */
  function show(step) {
    net.classList.toggle('on', step === 5);
    cloud.classList.toggle('on', step >= 1 && step <= 4);
  }
  function readStep() {
    var n = parseInt(pin.dataset.step || '1', 10);
    show(isNaN(n) ? 1 : n);
  }
  new MutationObserver(readStep).observe(pin, {
    attributes: true, attributeFilter: ['data-step']
  });
  readStep();

  // off screen the layer stops entirely: SMIL keeps ticking on a scrolled past
  // element otherwise, and this is the whole of its idle cost
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      var on = es[es.length - 1].isIntersecting;
      svg.style.display = on ? '' : 'none';
      if (on) { try { svg.unpauseAnimations(); } catch (e) {} }
      else { try { svg.pauseAnimations(); } catch (e) {} }
    }, { threshold: 0 }).observe(pin);
  }
})();
