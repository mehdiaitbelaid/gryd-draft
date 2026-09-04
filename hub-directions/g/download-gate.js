/* The download gate.

   The live site puts every case study and article PDF behind a HubSpot lead
   capture form, so the same gate stands here: the Download button opens a
   modal, the reader fills in the HubSpot form, and only once HubSpot says the
   form submitted does the PDF open. Nothing navigates before that.

   Portal 144906745, region eu1, form 300acd1e-5c44-4728-b375-f51164c018b5,
   read off the CTA that gates the download on gryd.energy.

   The HubSpot script is fetched on the first open rather than on page load, so
   a reader who never asks for the PDF never pays for it, and the print build
   never reaches the network. */
(function () {
  var PORTAL = '144906745';
  var FORM = '300acd1e-5c44-4728-b375-f51164c018b5';
  var REGION = 'eu1';
  var EMBED = 'https://js-eu1.hsforms.net/forms/embed/v2.js';
  // HubSpot serves the form in an iframe whenever the form carries its own
  // styling, so no sheet on the page can reach it. css is injected inside the
  // frame, and the string is the one home-final/assets/hubspot-frame.js sets,
  // shared with the Get in touch modal so the two embeds cannot drift.

  var links = Array.prototype.slice.call(document.querySelectorAll('a.btn[download]'));
  if (!links.length) { return; }

  var pending = null;   // the PDF the reader asked for
  var built = false;    // the HubSpot form has been asked for once
  var opener = null;    // the button to hand focus back to

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
    '</div>';
  document.body.appendChild(modal);

  function release() {
    if (!pending) { return; }
    var href = pending;
    pending = null;
    close();
    window.open(href, '_blank', 'noopener');
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
        onFormSubmitted: release
      });
    };
    s.onerror = function () {
      document.getElementById('dl-gate-form').innerHTML =
        '<p class="dl-note">The form could not load. Email hello@gryd.energy and we will send it over.</p>';
    };
    document.head.appendChild(s);
  }

  // The v2 embed does not always route onFormSubmitted through the options
  // object, so the cross frame message is listened for as well.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.type === 'hsFormCallback' && d.eventName === 'onFormSubmitted') { release(); }
  });

  function open(href, from) {
    pending = href;
    opener = from;
    modal.hidden = false;
    document.documentElement.classList.add('dl-open');
    build();
    var x = modal.querySelector('.dl-x');
    if (x) { x.focus(); }
  }

  function close() {
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
