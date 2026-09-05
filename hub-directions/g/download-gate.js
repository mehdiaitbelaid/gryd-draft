/* The download gate.

   The live site puts every case study and article PDF behind a HubSpot lead
   capture form, so the same gate stands here: the Download button opens a
   modal, the reader fills in the HubSpot form, and the file comes back.

   Portal 144906745, region eu1, form 300acd1e-5c44-4728-b375-f51164c018b5,
   read off the CTA that gates the download on gryd.energy.

   Mehdi, 4 September: the portal is on HubSpot's newer embed,
   ui-forms-embed-components-app. That renderer accepts hbspt.forms.create but
   serialises onFormSubmit and onFormSubmitted onto the frame element as
   data-on-form-submit strings and never calls them, and it posts no
   hsFormCallback message either. It signals instead with CustomEvents that
   bubble from the div.hs-form-frame up to window, confirmed live: on-ready at
   render and on-submission:success at submit. Waiting on the old callbacks
   alone is why a real submission landed the lead and still left the reader
   with nothing.

   The gate releases once, and only on a signal that is both a success and
   provably HubSpot's: the v4 on-submission:success event carrying this form's
   own id, the legacy onFormSubmitted callback, and the legacy cross frame
   message when it arrives from a HubSpot origin, from this embed's own frame,
   and names this form. Nothing else opens it. An attempt was submitted is not
   a submission succeeded, so on-submission and on-form-submit are no longer
   listened for: they fire before the server has taken the lead, and releasing
   on them handed the file over for a form that then failed validation.

   The last resort observer stays, and it is honest about its reach: this
   renderer serves the form from js-eu1.hsforms.net, a different origin, so
   nothing inside that frame is readable from here and the observer sees only
   what HubSpot writes into this document's own host element. It therefore
   catches a renderer that draws the form inline and nothing else. It is kept
   for that case rather than removed, and it is not a substitute for the
   signals above.

   The panel always ends on a visible link, because from inside the frame the
   submit is not this document's gesture and the popup can be refused.

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
    unwatch();
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
        // onFormSubmit fires on the click, before the lead is taken. Only the
        // completed callback releases the file.
        onFormSubmitted: release
      });
    };
    s.onerror = function () {
      offer('The form is not loading, here is the file.');
    };
    document.head.appendChild(s);
  }

  // The origins HubSpot serves its embeds and its form frames from. A message
  // from anywhere else is somebody else's, whatever it says it is. This
  // portal's frame loads from js-eu1.hsforms.net, read off the live embed on
  // 4 September; the other three are the remaining HubSpot form hosts.
  var ORIGINS = ['https://forms-eu1.hsforms.com',
                 'https://js-eu1.hsforms.net',
                 'https://forms.hsforms.com',
                 'https://js.hsforms.net'];

  // Signal one, the v4 embed. The events bubble from div.hs-form-frame to
  // window and carry this form's id, confirmed live: on-ready and
  // on-submission:success both arrive with detail.formId set. An event with no
  // id is not this form's, so it is refused rather than assumed. Bound at
  // load, before the embed script is ever fetched, which is what HubSpot asks
  // for.
  function mine(ev) {
    var d = ev && ev.detail;
    return !!(d && d.formId === FORM);
  }
  ['hs-form-event:on-submission:success',
   'hs-form-event:on-form-submitted'].forEach(function (name) {
    window.addEventListener(name, function (ev) { if (mine(ev)) { release(); } }, true);
  });

  // The window this embed's form actually lives in. A message that did not
  // come from it did not come from this form, so it cannot open this gate.
  function frameWindow() {
    var box = host();
    var f = box && box.querySelector('iframe');
    return f ? f.contentWindow : null;
  }

  // Signal two, the legacy v2 embed, which does not always route its callbacks
  // through the options object and so posts them across the frame instead.
  // Three things have to hold before a posted message is believed: a HubSpot
  // origin, this embed's own frame as the sender, and this form's id.
  window.addEventListener('message', function (e) {
    if (ORIGINS.indexOf(e.origin) === -1) { return; }
    var src = frameWindow();
    if (!src || e.source !== src) { return; }
    var d = e.data;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (err) { return; }
    }
    if (!d || typeof d !== 'object') { return; }
    if (d.type === 'hsFormCallback' && d.eventName === 'onFormSubmitted' &&
        d.id === FORM) { release(); return; }
    // and the newer message shape, should a renderer post rather than dispatch
    var name = d.eventName || d.type;
    if (name === 'hs-form-event:on-submission:success' &&
        d.detail && d.detail.formId === FORM) { release(); }
  });

  // Signal three, the last resort, and the narrowest of the three. It reads
  // this document's own host element, so it can only see a renderer that draws
  // the form inline. The renderer this portal is on puts the form in a
  // cross origin iframe, where nothing is readable from here: on that path
  // this observer sees nothing and is expected to. Watched only while the gate
  // is open, and only fired once the fields are actually gone, so a form whose
  // own standfirst says thank you cannot trip it.
  var DONE_TEXT = /it'?s on its way|on its way to your inbox|thanks? for (submitting|your)|thank you for (submitting|your)|submission (has been )?received|form (has been )?submitted/i;
  var watcher = null;

  function confirmed() {
    var box = host();
    if (!box || box.hidden) { return false; }
    if (box.querySelector('.submitted-message,.hs-form__submitted,[data-hs-forms-submitted]')) { return true; }
    if (box.querySelector('form') || box.querySelector('input')) { return false; }
    var text = '';
    try { text = box.innerText || box.textContent || ''; } catch (err) { return false; }
    return DONE_TEXT.test(text);
  }

  function watch() {
    if (watcher || typeof MutationObserver !== 'function') { return; }
    var box = host();
    if (!box) { return; }
    watcher = new MutationObserver(function () { if (confirmed()) { release(); } });
    watcher.observe(box, { childList: true, subtree: true, characterData: true });
  }

  function unwatch() {
    if (watcher) { watcher.disconnect(); watcher = null; }
  }

  function open(href, from) {
    pending = href;
    opener = from;
    done = false;
    if (doneBox()) { doneBox().hidden = true; }
    if (host()) { host().hidden = false; }
    modal.hidden = false;
    document.documentElement.classList.add('dl-open');
    build();
    watch();
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!done && !rendered()) { offer('The form is not loading, here is the file.'); }
    }, WAIT);
    var x = modal.querySelector('.dl-x');
    if (x) { x.focus(); }
  }

  function close() {
    clearTimeout(timer);
    unwatch();
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
