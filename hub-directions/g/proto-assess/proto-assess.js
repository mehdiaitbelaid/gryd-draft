/* Behaviour shared by the five request prototypes.

   Nothing here posts, uploads or calculates. A drop zone names the file it was
   given and keeps it in memory; a summary card mirrors what has been typed; a
   confirm step swaps the form for a receipt built from the same values. That is
   the whole contract, and it is deliberate: these pages exist to be judged on
   shape, not to stand in for a backend that does not exist yet. */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }

  /* ------------------------------------------------------------- fields */

  /* One reader for every kind of control the prototypes use, so the summary,
     the receipt and the step gate all see the same string for a given field. */
  function value(form, name) {
    var chips = $$('[data-chip-group="' + name + '"] .pa-chip[aria-pressed="true"]', form);
    if (chips.length) return chips.map(function (c) { return c.textContent.trim(); }).join(', ');
    var drop = $('[data-drop][data-name="' + name + '"]', form);
    if (drop) return drop.getAttribute('data-file') || '';
    var el = form.elements ? form.elements[name] : null;
    if (!el) { el = $('[name="' + name + '"]', form); }
    if (!el) return '';
    if (el.type === 'date' && el.value) {
      var p = el.value.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return (el.value || '').trim();
  }

  /* ---------------------------------------------------------- drop zone */

  function wireDrop(zone) {
    var input = $('input[type="file"]', zone);
    var out = $('[data-drop-out]', zone);
    var idle = out ? out.textContent : '';

    function take(file) {
      if (!file) return;
      var kb = Math.max(1, Math.round(file.size / 1024));
      zone.setAttribute('data-file', file.name);
      zone.classList.add('has');
      if (out) out.textContent = file.name + ', ' + kb + ' KB, held in the page only';
      zone.dispatchEvent(new CustomEvent('pa:change', { bubbles: true }));
    }

    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { take(input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) take(e.dataTransfer.files[0]);
    });
    if (out && !idle) out.textContent = idle;
  }

  /* -------------------------------------------------------------- chips */

  function wireChips(group) {
    $$('.pa-chip', group).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var on = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', on ? 'false' : 'true');
        chip.dispatchEvent(new CustomEvent('pa:change', { bubbles: true }));
      });
    });
  }

  /* ------------------------------------------------------------ summary */

  /* Mirrors the form into any list of rows carrying data-sum="<field>". A row
     with nothing in it keeps its placeholder rather than collapsing, so the card
     holds its height and the reader can see what is still outstanding. */
  function wireSummary(form, card) {
    var rows = $$('[data-sum]', card);
    var meter = $('[data-meter]', card);
    var count = $('[data-meter-count]', card);

    function paint() {
      var done = 0;
      rows.forEach(function (row) {
        var v = value(form, row.getAttribute('data-sum'));
        var dd = $('dd', row);
        if (v) {
          dd.textContent = v;
          dd.classList.remove('empty');
          row.classList.add('on');
          done += 1;
        } else {
          dd.textContent = dd.getAttribute('data-empty') || 'Not yet';
          dd.classList.add('empty');
          row.classList.remove('on');
        }
      });
      if (meter) meter.style.width = Math.round((done / rows.length) * 100) + '%';
      if (count) count.textContent = done + ' of ' + rows.length + ' answered';
      return done;
    }

    form.addEventListener('input', paint);
    form.addEventListener('change', paint);
    form.addEventListener('pa:change', paint);
    paint();
  }

  /* ------------------------------------------------------------ receipt */

  /* The confirmation is built from the live form, so what the reader is shown
     back is what they actually typed rather than a hard coded example. */
  function fillReceipt(form, receipt) {
    $$('[data-sum]', receipt).forEach(function (row) {
      var v = value(form, row.getAttribute('data-sum'));
      var dd = $('dd', row);
      dd.textContent = v || 'Not given';
      dd.classList.toggle('empty', !v);
    });
    var ref = $('[data-ref]', receipt);
    if (ref) {
      /* A sample reference, formatted the way a real one would be so the state
         reads as finished. Fixed, not random, so screenshots stay stable. */
      var pc = (value(form, 'postcode') || 'SITE').toUpperCase().replace(/\s+/g, '').slice(0, 4);
      ref.textContent = 'SA-' + (pc || 'SITE') + '-0114';
      ref.classList.remove('empty');
    }
  }

  function show(el) { if (el) el.classList.add('on'); }
  function hide(el) { if (el) el.classList.add('pa-hide'); }

  /* --------------------------------------------------------------- steps */

  /* Panels plus a rail. Used by B directly and by C and E with their own
     markup for the indicator, which is why the indicator painter is passed in. */
  function stepper(opts) {
    var panels = opts.panels;
    var i = 0;

    function go(next) {
      if (next < 0 || next >= panels.length) return;
      panels[i].classList.remove('on');
      i = next;
      panels[i].classList.add('on');
      if (opts.onStep) opts.onStep(i, panels.length);
      if (opts.scrollTo) {
        opts.scrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    $$('[data-step-next]', opts.root).forEach(function (b) {
      b.addEventListener('click', function () { go(i + 1); });
    });
    $$('[data-step-back]', opts.root).forEach(function (b) {
      b.addEventListener('click', function () { go(i - 1); });
    });
    if (opts.onStep) opts.onStep(0, panels.length);
    return { go: go, at: function () { return i; } };
  }

  window.PA = {
    $: $, $$: $$,
    value: value,
    wireDrop: wireDrop,
    wireChips: wireChips,
    wireSummary: wireSummary,
    fillReceipt: fillReceipt,
    stepper: stepper,
    show: show,
    hide: hide
  };

  /* Anything the page did not have to ask for: every drop zone and chip group
     on the page is wired as soon as the document is ready. */
  function boot() {
    $$('[data-drop]').forEach(wireDrop);
    $$('[data-chip-group]').forEach(wireChips);
    if (window.PA_PAGE) window.PA_PAGE();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
