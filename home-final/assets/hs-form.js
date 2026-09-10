/* The site's own HubSpot forms.

   Both lead forms used to be HubSpot's iframe embed. That renderer ignores
   every styling hook a host page has, so the two forms were the only objects on
   the site drawn in somebody else's vocabulary: boxed fields, a 30px radius
   input, HubSpot's own type. The fields are ours now and the submission goes
   straight to the Forms API:

     POST forms-eu1.hsforms.com/submissions/v3/integration/submit/<portal>/<form>

   which is the same route the FHS check and the site assessment gate already
   take, so the site files a lead one way.

   What is still HubSpot's, and has to stay HubSpot's, is every word: the
   labels, the button text, the rich text over the fields, the copy after a
   submission and the three validation strings. They are read at build time out
   of the v4 render definition by home-final/_forms.py and handed to mount()
   below as a spec, so a label Scott changes in the portal changes here on the
   next build rather than being retyped from memory.

   No consent line is drawn. Neither form carries a consent module in the
   portal, so there is no wording HubSpot has recorded and none is invented
   here: a sentence written by the site would put a claim in the reader's mouth
   that the portal cannot back. If Scott adds a consent module to either form,
   the slot is marked CONSENT SLOT below, in paint() and in payload().

   mount(host, spec, options) draws the form into host and returns a small
   handle. options:
     name      string         what the analytics event calls this form
     onSuccess fn(values)     run once the API has taken the lead

   window.GrydHsForm */
(function (w, d) {
  "use strict";

  var NET_ERROR = "We could not send your details, try again";
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function el(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  /* HubSpot's own analytics cookie, when the reader has one. It is what joins
     this submission to the sessions the tracking code has already recorded, so
     it is sent when it is there and left out when it is not. */
  function hutk() {
    var m = d.cookie.match(/(?:^|;\s*)hubspotutk=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function rich(text, cls) {
    var box = el("div", cls || "hs-rich");
    if (text.heading) { box.appendChild(el("h3", "hs-title", text.heading)); }
    (text.paras || []).forEach(function (p) {
      box.appendChild(el("p", "hs-stand", p));
    });
    return box;
  }

  function mount(host, spec, options) {
    if (!host) { return null; }
    var opts = options || {};
    var values = {};        // every step's answers, so Back keeps them
    var at = 0;
    var pending = false;
    var last = spec.steps.length - 1;
    var trap = null;            // honeypot input, named as /api/lead expects

    spec.steps.forEach(function (step) {
      step.fields.forEach(function (f) {
        if (values[f.name] == null) { values[f.name] = f.default || ""; }
      });
    });

    function field(f) {
      var wrap = el("div", "hs-f");
      wrap.dataset.field = f.name;
      var id = "hsf-" + spec.formId.slice(0, 8) + "-" + f.name;
      var label = el("label", null, f.label);
      label.setAttribute("for", id);
      var input = f.type === "textarea" ? el("textarea") : el("input");
      if (f.type !== "textarea") { input.type = f.type; }
      if (f.type === "textarea") { input.rows = 4; }
      input.id = id;
      input.name = f.name;
      input.value = values[f.name] || "";
      if (f.required) { input.required = true; }
      input.addEventListener("input", function () {
        values[f.name] = input.value;
        clear(wrap);
      });
      input.addEventListener("focus", function () { wrap.classList.add("is-focus"); });
      input.addEventListener("blur", function () { wrap.classList.remove("is-focus"); });
      wrap.appendChild(label);
      wrap.appendChild(input);
      return wrap;
    }

    function clear(wrap) {
      wrap.classList.remove("is-error");
      var e = wrap.querySelector(".hs-err");
      if (e) { e.remove(); }
      var control = wrap.querySelector("input, textarea");
      if (control) { control.removeAttribute("aria-invalid"); }
      var global = host.querySelector(".hs-global");
      if (global && !host.querySelector(".hs-f.is-error")) { global.remove(); }
    }

    function fail(wrap, message) {
      wrap.classList.add("is-error");
      if (!wrap.querySelector(".hs-err")) {
        wrap.appendChild(el("span", "hs-err", message));
      }
      var control = wrap.querySelector("input, textarea");
      if (control) { control.setAttribute("aria-invalid", "true"); }
    }

    /* HubSpot's three strings, verbatim: the field is required, the address is
       not an address, and the form as a whole could not go. */
    function valid(step) {
      var bad = 0;
      step.fields.forEach(function (f) {
        var wrap = host.querySelector('.hs-f[data-field="' + f.name + '"]');
        if (!wrap) { return; }
        clear(wrap);
        var v = String(values[f.name] || "").trim();
        if (f.required && !v) { fail(wrap, spec.errors.required); bad += 1; return; }
        if (f.type === "email" && v && !EMAIL.test(v)) {
          fail(wrap, spec.errors.email); bad += 1;
        }
      });
      // CONSENT SLOT. A consent module on either form would be validated here,
      // with HubSpot's own required string, before the count is read.
      if (bad) {
        var col = host.querySelector(".hs-step");
        if (col && !host.querySelector(".hs-global")) {
          col.insertBefore(el("p", "hs-global", spec.errors.form), col.firstChild);
        }
        var first = host.querySelector(".hs-f.is-error input, .hs-f.is-error textarea");
        if (first) { first.focus(); }
      }
      return !bad;
    }

    function payload() {
      var fields = [];
      spec.steps.forEach(function (step) {
        step.fields.forEach(function (f) {
          var v = String(values[f.name] || "").trim();
          if (!v) { return; }
          fields.push({ objectTypeId: f.objectTypeId, name: f.name, value: v });
        });
      });
      var body = {
        fields: fields,
        context: { pageUri: w.location.href, pageName: d.title }
      };
      var k = hutk();
      if (k) { body.context.hutk = k; }
      // CONSENT SLOT. legalConsentOptions goes here when a consent module
      // exists, carrying the portal's own wording rather than ours.
      return body;
    }

    function announce() {
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: "gryd_form_submit",
        form_id: spec.formId,
        form_name: opts.name || spec.formId,
        page_path: w.location.pathname
      });
    }

    /* Our own endpoint first, the HubSpot form as the fallback. The values are
       the same either way; only the envelope differs. */
    function leadBody() {
      var v = {};
      spec.steps.forEach(function (step) {
        step.fields.forEach(function (f) {
          v[f.name] = String(values[f.name] || "").trim();
        });
      });
      return JSON.stringify({
        source: opts.source || (spec.formId.slice(0, 8) === "300acd1e" ? "gate" : "contact"),
        email: v.email,
        firstname: v.firstname,
        lastname: v.lastname,
        phone: v.phone || "",
        company: v.company || "",
        message: v.message || "",
        website: trap ? trap.value : "",
        pageUri: w.location.href,
        pageName: d.title,
        hutk: hutk()
      });
    }

    function send() {
      if (pending) { return; }        // one send at a time, whatever is clicked
      pending = true;
      var go = host.querySelector("[data-hs-submit]");
      if (go) { go.disabled = true; }
      var body;
      try { body = JSON.stringify(payload()); }
      catch (err) { pending = false; retry(); return; }
      w.fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: leadBody()
      }).then(function (res) {
        if (!res.ok) { throw new Error("lead api " + res.status); }
        return res;
      }).catch(function () {
        // Fallback: the form the browser posted to before this route existed.
        return w.fetch(spec.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body
        });
      }).then(function (res) {
        if (!res.ok) { throw new Error("hubspot " + res.status); }
        pending = false;
        announce();
        done();
        if (opts.onSuccess) { opts.onSuccess(values); }
      }).catch(function () {
        pending = false;
        if (go) { go.disabled = false; }
        retry();
      });
    }

    /* The send failed on the way out rather than on the answers, so the form
       stays as it is and says so above the buttons with the send offered
       again. Nothing is cleared and nothing is sent twice. */
    function retry() {
      var nav = host.querySelector(".hs-nav");
      if (!nav || host.querySelector(".hs-retry")) { return; }
      var box = el("div", "hs-retry");
      box.appendChild(el("p", "hs-retry-note", NET_ERROR));
      var again = el("button", "ar-btn", "Try again");
      again.type = "button";
      again.setAttribute("data-hs-retry", "");
      again.addEventListener("click", function () { box.remove(); send(); });
      box.appendChild(again);
      nav.parentNode.insertBefore(box, nav);
    }

    function done() {
      host.innerHTML = "";
      host.classList.add("is-done");
      var box = el("div", "hs-step hs-done");
      box.appendChild(rich(spec.post));
      host.appendChild(box);
    }

    function rail(step) {
      var row = el("div", "hs-rail-row");
      row.appendChild(el("p", "hs-rail-n", step.rail));
      var bar = el("div", "hs-rail");
      var fill = el("i");
      fill.style.width = step.pct + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      return row;
    }

    function paint() {
      host.innerHTML = "";
      var step = spec.steps[at];
      var box = el("div", "hs-step");
      box.appendChild(rich(step.text));
      var rows = el("div", "hs-fields");
      // First and Last stand side by side, which is the row HubSpot puts them
      // on and the pair the approved sheet draws.
      var pair = step.fields.filter(function (f) {
        return f.name === "firstname" || f.name === "lastname";
      });
      if (pair.length === 2) {
        var two = el("div", "hs-pair");
        pair.forEach(function (f) { two.appendChild(field(f)); });
        rows.appendChild(two);
      }
      step.fields.forEach(function (f) {
        if (pair.length === 2 && pair.indexOf(f) > -1) { return; }
        rows.appendChild(field(f));
      });
      /* Honeypot. Off screen rather than display:none so a bot that skips
         hidden controls still fills it. Never sent to HubSpot. */
      trap = el("input");
      trap.type = "text";
      trap.name = "website";
      trap.id = "hsf-" + spec.formId.slice(0, 8) + "-website";
      trap.tabIndex = -1;
      trap.setAttribute("autocomplete", "off");
      trap.setAttribute("aria-hidden", "true");
      trap.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";
      rows.appendChild(trap);
      box.appendChild(rows);
      // CONSENT SLOT. The tick and its sentence belong here, on the last step.
      box.appendChild(rail(step));

      var nav = el("div", "hs-nav" + (step.buttons.previous ? "" : " end"));
      if (step.buttons.previous) {
        var back = el("button", "ar-btn ar-btn-quiet", step.buttons.previous);
        back.type = "button";
        back.setAttribute("data-hs-back", "");
        back.addEventListener("click", function () { at -= 1; paint(); });
        nav.appendChild(back);
      }
      var go = el("button", "ar-btn", step.buttons.submit || step.buttons.next);
      go.type = "button";
      go.setAttribute("data-hs-submit", "");
      go.addEventListener("click", function () {
        if (!valid(step)) { return; }
        if (at < last) { at += 1; paint(); return; }
        send();
      });
      nav.appendChild(go);
      box.appendChild(nav);
      host.appendChild(box);
    }

    paint();
    return { focus: function () {
      var first = host.querySelector("input, textarea");
      if (first) { first.focus(); }
    } };
  }

  w.GrydHsForm = { mount: mount, NET_ERROR: NET_ERROR };
})(window, document);
