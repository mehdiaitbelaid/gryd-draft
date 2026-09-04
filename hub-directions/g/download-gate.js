/* The download gate.

   The live site puts every case study and article PDF behind a HubSpot lead
   capture form, so the same gate stands here: the Download button opens a
   modal, the reader fills in the HubSpot form, and the file comes back.

   Portal 144906745, region eu1, form 300acd1e-5c44-4728-b375-f51164c018b5,
   read off the CTA that gates the download on gryd.energy.

   Mehdi, 4 September: the gate used to wait for onFormSubmitted alone. HubSpot
   refuses submissions from a domain that is not on the portal's allowed list,
   so on a review link that callback never arrives and the reader is left with
   nothing. The file is now released on the reader's own submit, whichever of
   onFormSubmit or onFormSubmitted lands first, and the panel always ends on a
   visible link to the file so a blocked popup is never a dead end.

   The HubSpot script is fetched on the first open rather than on page load, so
   a reader who never asks for the PDF never pays for it, and the print build
   never reaches the network. */
(function () {
  var PORTAL = '144906745';
  var FORM = '300acd1e-5c44-4728-b375-f51164c018b5';
  var REGION = 'eu1';
  var EMBED = 'https://js-eu1.hsforms.net/forms/embed/v2.js';
  var WAIT = 6000;      // how long the form gets before the file is offered anyway
  // HubSpot serves the form in an iframe whenever the form carries its own
  // styling, so no sheet on the page can reach it. css is injected inside the
  // frame, and the string is the one home-final/assets/hubspot-frame.js sets,
  // shared with the Get in touch modal so the two embeds cannot drift.

  var links = Array.prototype.slice.call(document.querySelectorAll('a.btn[download]'));
  if (!links.length) { return; }

  var pending = null;   // the PDF the reader asked for
  var built = false;    // the HubSpot form has been asked for once
  var opener = null;    // the button to hand focus back to
  var done = false;     // the file has been released for this open
  var timer = null;

  var modal = document.createElement('div');
  modal.className = 'dl-gate';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="dl-scrim" data-close></div>' +
    // The HubSpot form carries its own heading and standfirst, so the panel
    // gives it the paper and the close control and says nothing over the top.
    '<div class="dl-panel" role="dialog" aria-modal="true" aria-label="Download">' +
      '<button type="button" class="dl-x" data-close aria-label="Close">&#215;</button>' +
      '<div class="dl-form" id="dl-gate-form"></div>' +
      // The confirmation is its own element rather than a rewrite of the form
      // host, because HubSpot replaces that host's contents when the embed
      // finishes rendering and would wipe the link out from under the reader.
      '<div class="dl-form dl-done" id="dl-gate-done" hidden></div>' +
    '</div>';
  document.body.appendChild(modal);

  function host() { return document.getElementById('dl-gate-form'); }
  function doneBox() { return document.getElementById('dl-gate-done'); }

  function offer(note) {
    // The link is the guarantee. Whatever HubSpot does or fails to do, the
    // reader ends the flow looking at the file they asked for.
    if (!pending) { return; }
    var box = doneBox();
    if (!box) { return; }
    box.innerHTML = '';
    box.hidden = false;
    if (host()) { host().hidden = true; }
    var p = document.createElement('p');
    p.className = 'dl-note';
    p.textContent = note;
    var a = document.createElement('a');
    a.className = 'btn';
    a.href = pending;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open the PDF';
    box.appendChild(p);
    box.appendChild(a);
    a.focus();
  }

  function release() {
    if (done || !pending) { return; }
    done = true;
    clearTimeout(timer);
    // From inside the HubSpot iframe the click is not this document's gesture,
    // so the popup can be refused. The link below covers that case.
    try { window.open(pending, '_blank', 'noopener'); } catch (err) { /* blocked */ }
    offer('Thanks. Your download is ready.');
  }

  function rendered() {
    var box = host();
    return !!(box && (box.querySelector('iframe') || box.querySelector('form')));
  }

  function build() {
    if (built) { return; }
    built = true;
    var s = document.createElement('script');
    s.src = EMBED;
    s.onload = function () {
      if (!window.hbspt) { return; }
      window.hbspt.forms.create({
        region: REGION, portalId: PORTAL, formId: FORM,
        target: '#dl-gate-form',
        css: window.GRYD_HS_CSS || '',
        onFormSubmit: release,
        onFormSubmitted: release
      });
    };
    s.onerror = function () {
      offer('The form is not loading, here is the file.');
    };
    document.head.appendChild(s);
  }

  // The v2 embed does not always route its callbacks through the options
  // object, so the cross frame messages are listened for as well.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'hsFormCallback') { return; }
    if (d.eventName === 'onFormSubmit' || d.eventName === 'onFormSubmitted') { release(); }
  });

  function open(href, from) {
    pending = href;
    opener = from;
    done = false;
    if (doneBox()) { doneBox().hidden = true; }
    if (host()) { host().hidden = false; }
    modal.hidden = false;
    document.documentElement.classList.add('dl-open');
    build();
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!done && !rendered()) { offer('The form is not loading, here is the file.'); }
    }, WAIT);
    var x = modal.querySelector('.dl-x');
    if (x) { x.focus(); }
  }

  function close() {
    clearTimeout(timer);
    modal.hidden = true;
    document.documentElement.classList.remove('dl-open');
    if (opener) { opener.focus(); opener = null; }
  }

  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) { close(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) { close(); }
  });

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      open(a.href, a);
    });
  });
})();
