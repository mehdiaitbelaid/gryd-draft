/* One step at a time engine. Designs 1 to 4 all show a single step and a Next
   control, so they share this and differ only in the markup around it.
   Design 5 drives the same model a different way and does not use this file.
   Four steps on screen: three question steps then Results. */
(function (w) {
  var TOTAL = 4;

  w.GRYD.mountStepper = function (root, hooks) {
    hooks = hooks || {};
    var Q = w.GRYD.QUESTIONS;
    // hooks.answers seeds the stepper from a set already collected elsewhere,
    // and hooks.startDone opens straight on the results. Together they let one
    // page finish the wizard another page started, design 1 handing over to
    // the flip card results page.
    var a = hooks.answers || w.GRYD.defaults();
    var i = 0;

    var elChrome = root.querySelector('[data-chrome]');
    var elCount = root.querySelector('[data-count]');
    var elBar = root.querySelector('[data-progress] i');
    var elQ = root.querySelector('[data-q]');
    var elHint = root.querySelector('[data-hint]');
    var elFields = root.querySelector('[data-fields]');
    var elStage = root.querySelector('[data-stage]');
    var elSum = root.querySelector('[data-summary]');
    var elDone = root.querySelector('[data-answered]');
    var elFoot = root.querySelector('[data-foot]');
    var back = root.querySelector('.js-back');
    var next = root.querySelector('.js-next');

    function changed() {
      if (hooks.onChange) hooks.onChange(a, i);
    }

    function foldList() {
      if (!elDone) return;
      var out = '';
      for (var k = 0; k < i; k++) {
        out += '<li><span>' + Q[k].chrome + '</span><span>' + w.GRYD.stepValue(Q[k].id, a) + '</span></li>';
      }
      elDone.innerHTML = out;
    }

    function render() {
      var q = Q[i];
      if (elChrome) elChrome.textContent = q.chrome;
      if (elCount) elCount.textContent = 'Step ' + (i + 1) + '/' + TOTAL;
      if (elBar) elBar.style.width = ((i + 1) / TOTAL * 100) + '%';
      if (elQ) elQ.textContent = q.q;
      if (elHint) elHint.textContent = q.hint;
      if (elFields) {
        elFields.innerHTML = '';
        elFields.appendChild(w.GRYD.fields(q, a, changed));
      }
      if (elFoot) elFoot.style.display = '';
      if (back) back.style.visibility = i === 0 ? 'hidden' : 'visible';
      if (next) next.textContent = i === Q.length - 1 ? 'See Results' : 'Next';
      foldList();
      changed();
      if (hooks.onRender) hooks.onRender(a, i);
    }

    function finish() {
      if (elChrome) elChrome.textContent = 'Results';
      if (elCount) elCount.textContent = 'Step ' + TOTAL + '/' + TOTAL;
      if (elBar) elBar.style.width = '100%';
      if (elFoot) elFoot.style.display = 'none';
      if (elSum) {
        elSum.innerHTML = w.GRYD.summaryHTML(a);
        elSum.classList.add('is-on');
        var rs = elSum.querySelector('.js-restart');
        if (rs) rs.addEventListener('click', function () {
          a = w.GRYD.defaults(); i = 0;
          elSum.classList.remove('is-on');
          elSum.innerHTML = '';
          if (elStage) elStage.style.display = '';
          if (hooks.onRestart) hooks.onRestart();
          render();
        });
      }
      if (elStage) elStage.style.display = 'none';
      if (hooks.onDone) hooks.onDone(a);
    }

    if (next) next.addEventListener('click', function () {
      if (i < Q.length - 1) { i++; render(); } else { finish(); }
    });
    if (back) back.addEventListener('click', function () {
      if (i > 0) { i--; render(); }
    });

    render();
    if (hooks.startDone) finish();
    return { answers: function () { return a; } };
  };
})(window);
