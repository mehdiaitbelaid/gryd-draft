/* One question model shared by the five FHS page designs.
   Wording is verbatim from the FHS Readiness pop up capture in ../content.md
   (four steps: House Type, Specification, Your Details, Results).
   Figures are placeholders, computed from the published constants the live tool
   ships, and every figure on screen carries a placeholder chip. */
(function (w) {
  var HOUSE_TYPES = ['Detached', 'Semi-detached', 'Terraced (mid)', 'Terraced (end)', 'Apartment'];
  var BEDROOMS = [1, 2, 3, 4, 5];
  var STOREYS = [1, 2, 3];
  var HEATING = ['Gas boiler', 'Air source heat pump (ASHP)', 'Ground source heat pump (GSHP)', 'Electric heating', 'Other / unsure'];
  var PART_L = ['2021 Part L (31% improvement)', 'FHS (75–80% improvement)', 'Unsure'];
  var VENT = ['Natural ventilation only', 'MEV (mechanical extract)', 'MVHR (mechanical ventilation with heat recovery)', 'Unsure'];
  var AIR = ['≤3 m³/(h·m²) @ 50Pa', '3–5 m³/(h·m²) @ 50Pa', '5–8 m³/(h·m²) @ 50Pa', '≥8 m³/(h·m²) @ 50Pa', 'Unsure'];
  var GLAZING = ['Triple glazing (U ≤ 0.8)', 'High-performance double (U ≤ 1.2)', 'Standard double (U ≤ 1.4)', 'Unsure'];
  var HOMES_PER_YEAR = ['1–50', '51–200', '201–500', '500+'];

  /* Floor areas and Gryd system sizes as published by the live readiness tool. */
  var FLOOR = {
    'Apartment': { 1: 50, 2: 65 },
    'Terraced (mid)': { 1: 50, 2: 70, 3: 85, 4: 105 },
    'Terraced (end)': { 1: 50, 2: 70, 3: 85, 4: 105 },
    'Semi-detached': { 2: 75, 3: 90, 4: 115, '5+': 140 },
    'Detached': { 2: 85, 3: 110, 4: 130, '5+': 175 }
  };
  var GRYD_SYS = {
    'Apartment': { 1: { panels: 8, battery: 5 }, 2: { panels: 10, battery: 5 } },
    'Terraced (mid)': { 1: { panels: 8, battery: 5 }, 2: { panels: 10, battery: 5 }, 3: { panels: 12, battery: 10 }, 4: { panels: 14, battery: 10 } },
    'Terraced (end)': { 1: { panels: 8, battery: 5 }, 2: { panels: 10, battery: 5 }, 3: { panels: 12, battery: 10 }, 4: { panels: 14, battery: 10 } },
    'Semi-detached': { 2: { panels: 10, battery: 5 }, 3: { panels: 14, battery: 10 }, 4: { panels: 16, battery: 10 }, '5+': { panels: 18, battery: 10 } },
    'Detached': { 2: { panels: 12, battery: 5 }, 3: { panels: 16, battery: 10 }, 4: { panels: 18, battery: 10 }, '5+': { panels: 22, battery: 13.5 } }
  };
  var GROUND_RATIO = 0.4, M2_PER_KWP = 4.5, KWP_PER_PANEL = 0.44;
  var YIELD = 900, LOSS = 0.95, SELF_USE = 0.35, SELF_USE_BATT = 0.65, DEMAND_PER_M2 = 50;

  var QUESTIONS = [
    {
      id: 'house',
      chrome: 'House Type',
      q: 'House Type',
      hint: "Tell us about the house type you're assessing.",
      type: 'house'
    },
    {
      id: 'spec',
      chrome: 'Specification',
      q: 'Current Specification',
      hint: "What's currently in your house type spec?",
      type: 'spec'
    },
    {
      id: 'details',
      chrome: 'Your Details',
      q: 'Your Details',
      hint: 'Tell us a bit about you and your project.',
      type: 'details'
    }
  ];

  var DEFAULTS = {
    houseType: 'Semi-detached',
    bedrooms: 3,
    storeys: 2,
    heating: 'Gas boiler',
    hasSolar: false,
    panels: 0,
    hasBattery: false,
    partL: '2021 Part L (31% improvement)',
    ventilation: 'MEV (mechanical extract)',
    airtightness: '5–8 m³/(h·m²) @ 50Pa',
    glazing: 'Standard double (U ≤ 1.4)',
    hasWWHR: false,
    fullName: '',
    company: '',
    email: '',
    phone: '',
    homesPerYear: '',
    consent: false
  };

  function bedKey(b) { return Number(b) >= 5 ? '5+' : String(Number(b)); }

  /* The live tool has no floor area for some house type and bedroom pairs, and
     asks for a bespoke assessment instead of guessing one. */
  function floorArea(a) {
    var t = FLOOR[a.houseType];
    if (!t) return null;
    var v = t[bedKey(a.bedrooms)];
    return v === undefined ? null : v;
  }
  function isSupported(a) { return floorArea(a) !== null; }
  function round1(n) { return Math.round(n * 10) / 10; }

  /* Coverage is capped at the full demand, matching the live tool. */
  function energy(kwp, area, battery) {
    var gen = Math.round(kwp * YIELD * LOSS);
    var demand = area * DEMAND_PER_M2;
    var use = battery ? SELF_USE_BATT : SELF_USE;
    var cover = Math.min((gen * use) / demand, 1);
    return { annualGeneration: gen, coverage: Math.round(cover * 100) };
  }

  /* Solar sizing. The panel count and the coverage ratio both come off the
     unrounded capacity, so only the printed kWp figures are rounded. */
  function solarSizing(area, storeys, panels, hasSolar) {
    var ground = area / storeys;
    var kwpRaw = (ground * GROUND_RATIO) / M2_PER_KWP;
    var userRaw = hasSolar ? panels * KWP_PER_PANEL : 0;
    return {
      requiredKwp: round1(kwpRaw),
      minPanels: Math.ceil(kwpRaw / KWP_PER_PANEL),
      userKwp: round1(userRaw),
      coverageRatio: kwpRaw > 0 && hasSolar ? userRaw / kwpRaw : 0
    };
  }

  function estimate(a) {
    var area = floorArea(a);
    if (area === null) area = FLOOR['Semi-detached'][3];
    var isApartment = a.houseType === 'Apartment';
    var sz = solarSizing(area, Math.max(1, Number(a.storeys) || 1), Number(a.panels) || 0, a.hasSolar);
    var userPanels = a.hasSolar ? Math.max(0, Number(a.panels) || 0) : 0;

    var sys = (GRYD_SYS[a.houseType] || {})[bedKey(a.bedrooms)] || { panels: 14, battery: 10 };
    var grydKwp = sys.panels * KWP_PER_PANEL;

    var solar;
    if (!a.hasSolar || userPanels === 0) solar = isApartment ? 'amber' : 'red';
    else if (sz.coverageRatio >= 1) solar = 'green';
    else if (sz.coverageRatio >= 0.5) solar = 'amber';
    else solar = isApartment ? 'amber' : 'red';

    var scores = {
      heating: a.heating === 'Air source heat pump (ASHP)' || a.heating === 'Ground source heat pump (GSHP)' ? 'green'
        : a.heating === 'Gas boiler' ? 'red' : 'amber',
      solar: solar,
      battery: a.hasBattery ? 'green' : 'amber',
      partL: a.partL === PART_L[1] ? 'green' : (a.partL === PART_L[0] ? 'amber' : 'red'),
      ventilation: a.ventilation === VENT[2] ? 'green' : (a.ventilation === VENT[1] ? 'amber' : 'red'),
      airtightness: a.airtightness === AIR[0] ? 'green' : (a.airtightness === AIR[1] ? 'amber' : 'red'),
      glazing: a.glazing === GLAZING[0] || a.glazing === GLAZING[1] ? 'green' : 'red',
      wwhr: a.hasWWHR ? 'green' : 'amber'
    };
    /* Only heating, solar and airtightness force an overall red. */
    var gates = ['heating', 'solar', 'airtightness'];
    var overall;
    if (gates.some(function (k) { return scores[k] === 'red'; })) overall = 'red';
    else {
      var ambers = Object.keys(scores).filter(function (k) { return scores[k] === 'amber'; }).length;
      overall = ambers <= 1 ? 'green' : 'amber';
    }

    return {
      area: area,
      requiredKwp: sz.requiredKwp,
      minPanels: sz.minPanels,
      userPanels: userPanels,
      userKwp: sz.userKwp,
      grydPanels: sys.panels,
      grydKwp: grydKwp,
      grydBattery: sys.battery,
      userExceedsGryd: a.hasSolar && userPanels > sys.panels,
      scores: scores,
      overall: overall,
      user: energy(sz.userKwp, area, a.hasBattery),
      fhs: energy(sz.requiredKwp, area, false),
      gryd: energy(grydKwp, area, true)
    };
  }

  var BANNER = {
    green: {
      heading: 'Looking good.',
      sub: 'Based on your inputs, your house type spec aligns with the published FHS requirements. FHS-compliant homes are expected to deliver significant energy bill savings for homeowners.'
    },
    amber: {
      heading: 'Some gaps to address.',
      sub: 'Your spec is partially aligned with the published FHS, but there are areas that need attention before enforcement on 24 March 2027.'
    },
    red: {
      heading: 'Significant changes needed.',
      sub: 'Your current spec has notable gaps against the published FHS requirements. With enforcement on 24 March 2027 and a transition deadline of 24 March 2028, early action is recommended.'
    }
  };

  var BADGE = { green: 'Meets FHS', amber: 'Gaps to address', red: 'Action needed' };

  var NOTES = {
    heating: {
      red: 'The FHS requires low-carbon heating. Gas boilers cannot meet the published 75–80% carbon reduction target. Heat pumps (ASHP/GSHP) are the confirmed standard. Hybrid and hydrogen-ready boilers also do not comply.',
      amber: 'Electric or alternative heating may meet FHS carbon targets, but heat pumps are the only widely confirmed compliant route for standalone heating systems.',
      green: 'Your heat pump meets the FHS low-carbon heating requirement. Over 25% of new UK homes already use heat pumps.'
    },
    battery: {
      amber: 'Battery storage is not mandated under the published FHS. However, when the Home Energy Model (HEM) replaces SAP, its 30-minute interval modelling will significantly reward self-consumption, which batteries enable. Gryd includes battery as standard.',
      green: "Battery storage included. While not mandated by FHS, HEM's 30-minute modelling will reward self-consumption. Your home is future-proofed for the compliance methodology shift.",
      red: ''
    },
    partL: {
      red: 'Your design team should confirm your Part L target. The published FHS requires 75–80% carbon reduction over 2013 regulations, using forward-looking carbon emission factors.',
      amber: "You're targeting 2021 Part L (31% improvement). The published FHS requires a step change to 75–80% carbon reduction, delivering significant energy bill savings for homeowners.",
      green: 'Already targeting FHS-level carbon reduction (75–80% over 2013 baseline).'
    },
    ventilation: {
      red: 'The published FHS airtightness target of 3 m³/(h·m²) @ 50Pa makes mechanical ventilation essential. Natural ventilation alone cannot maintain indoor air quality at this airtightness level.',
      amber: 'MEV is a step forward, but MVHR is the confirmed preferred strategy. At the published airtightness target of 3 m³/(h·m²) @ 50Pa, MVHR recovers heat and significantly reduces heating demand.',
      green: 'MVHR is the confirmed preferred ventilation strategy under FHS. Essential for maintaining air quality at the required airtightness levels.'
    },
    airtightness: {
      red: 'The published FHS sets a notional dwelling airtightness of 3 m³/(h·m²) @ 50Pa, down from a previous regulatory maximum of 8. Your target is significantly above this. Note: the default y-value for thermal bridging is also removed under HEM, penalising poor detailing.',
      amber: 'Your target is close but may not meet the confirmed 3 m³/(h·m²) @ 50Pa requirement. This is a fundamental construction methodology change requiring integrated design from the outset.',
      green: 'Meets the published FHS airtightness target of 3 m³/(h·m²) @ 50Pa.'
    },
    glazing: {
      red: 'Standard double glazing does not meet the published FHS window U-value of 1.2 W/m²K. Triple or high-performance double glazing is required.',
      amber: 'High-performance double glazing at U ≤ 1.2 meets the published FHS notional dwelling window U-value. Triple glazing offers additional margin and better overall fabric performance.',
      green: 'Triple glazing exceeds the published FHS window U-value requirement of 1.2 W/m²K.'
    },
    wwhr: {
      green: 'WWHR included. This matches the FHS notional dwelling specification and reduces hot water energy demand by recovering heat from shower wastewater.',
      amber: "WWHR is included in the published FHS notional dwelling specification. While not installing it won't automatically fail compliance, omitting it means other areas must compensate. WWHR is a cost-effective measure that reduces hot water energy demand.",
      red: ''
    }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ph(v) { return '<span class="num">' + esc(v) + '</span> <span class="ph">placeholder</span>'; }

  /* The solar note carries figures mid sentence. The prose either side of a figure
     is kept as its own text node so it stays word for word with the capture. */
  function solarNote(score, r, isApartment) {
    var lead = score === 'red'
      ? 'Solar PV is now a functional requirement of the Building Regulations. Your spec has no solar or falls well short of the confirmed minimum of'
      : score === 'amber'
        ? 'You have solar in your spec, but it falls short of the confirmed FHS minimum of'
        : 'Your solar PV meets or exceeds the confirmed FHS minimum of';
    var tail = score === 'amber'
      ? ' The requirement cannot be traded away with better fabric or other measures.'
      : '';
    var apt = isApartment
      ? ' Note: The published FHS exempts high-rise buildings from mandatory solar. Apartments typically share roof space across the block. We recommend a site-specific assessment for accurate solar sizing.'
      : '';
    return lead + ' ' + ph(r.requiredKwp) + ' kWp (~' + ph(r.minPanels) + ' panels) for this house type.' + tail + apt;
  }

  var ROWS = [
    { key: 'heating', label: 'Heating' },
    { key: 'solar', label: 'Solar PV' },
    { key: 'battery', label: 'Battery Storage' },
    { key: 'partL', label: 'Part L Target' },
    { key: 'ventilation', label: 'Ventilation' },
    { key: 'airtightness', label: 'Airtightness' },
    { key: 'glazing', label: 'Glazing' },
    { key: 'wwhr', label: 'Wastewater Heat Recovery' }
  ];

  function summaryHTML(a) {
    var r = estimate(a);
    var b = BANNER[r.overall];
    var isApartment = a.houseType === 'Apartment';
    var isTerrace = a.houseType === 'Terraced (mid)' || a.houseType === 'Terraced (end)';

    var cards = ROWS.map(function (row) {
      var s = r.scores[row.key];
      var note = row.key === 'solar' ? solarNote(s, r, isApartment) : esc(NOTES[row.key][s] || '');
      /* The live tool badges battery as Meets FHS whatever the score, because a
         missing battery is not an FHS failure. */
      var badge = row.key === 'battery' ? 'Meets FHS' : BADGE[s];
      return '<div class="score score-' + s + '"><div class="score-top"><h4>' + row.label +
        '</h4><span class="pill">' + badge + '</span></div><p>' + note + '</p></div>';
    }).join('');

    return '' +
      '<div class="sum-head band band-' + r.overall + '">' +
        '<h3 class="h-md">' + b.heading + '</h3>' +
        '<p>' + b.sub + '</p>' +
        '<p class="note">This is an indicative readiness check based on the published Future Homes Standard (March 2026). It is not a substitute for a full SAP 10.3 or HEM compliance assessment. For a detailed assessment, speak to a specialist.</p>' +
      '</div>' +
      (isApartment ? '<p class="note">Note: The published FHS exempts high-rise buildings from mandatory solar. Apartments typically share roof space across the block. We recommend a site-specific assessment for accurate solar sizing.</p>' : '') +
      (isTerrace ? '<p class="note flag"><strong>Important:</strong> The published FHS removes compliance averaging for terraces. Each dwelling must individually meet the carbon target and solar requirement. A south-facing end-of-terrace can no longer compensate for a north-facing mid-terrace unit.</p>' : '') +
      '<div class="sum-block"><h4>Component Breakdown</h4><div class="scores">' + cards + '</div></div>' +
      '<div class="sum-block"><h4>Meet the mandatory solar requirement, at zero cost</h4>' +
        (r.userExceedsGryd
          ? "<p>Your current solar specification already exceeds what Gryd would typically deploy. However, Gryd can still fund and operate your solar + battery system at zero cost \u2014 get in touch to discuss.</p>"
          : '<p>For a <span class="num">' + esc(a.houseType) + '</span> of this size, the published FHS requires a minimum of ' +
            ph(r.requiredKwp) + ' kWp (~' + ph(r.minPanels) + ' panels). Gryd would provide ' +
            ph(r.grydPanels) + ' panels (' + ph(r.grydKwp.toFixed(1)) + ' kWp) plus a ' + ph(r.grydBattery) +
            ' kWh battery, covering ~' + ph(r.gryd.coverage) + "% of the home's total energy demand. All hardware is provided at zero cost to the developer, meaning no increase in build cost.</p>" +
            '<p>Battery storage is not mandated by the FHS, but when the Home Energy Model goes live, its 30-minute interval modelling will significantly reward self-consumption. Homes with Gryd systems are future-proofed for this shift.</p>') +
        '<a class="btn" href="#">Get free solar site assessment</a>' +
      '</div>' +
      '<div class="sum-block"><h4>System Comparison</h4><div class="tbl-wrap"><table class="tbl">' +
        '<thead><tr><th>Component</th><th>Your current spec</th><th>Published FHS requirement</th><th>Gryd system</th></tr></thead><tbody>' +
        '<tr><td>Solar PV</td>' +
          '<td>' + ph(r.userKwp.toFixed(1)) + ' kWp<span class="sub">(~' + esc(r.userPanels) + ' panels)</span></td>' +
          '<td>' + ph(r.requiredKwp) + ' kWp<span class="sub">(~' + esc(r.minPanels) + ' panels)</span></td>' +
          '<td>' + ph(r.grydKwp.toFixed(1)) + ' kWp<span class="sub">(~' + esc(r.grydPanels) + ' panels)</span></td></tr>' +
        '<tr><td>Battery storage</td><td>' + (a.hasBattery ? 'Yes' : 'No') + '</td><td>Not mandatory</td><td>' + ph(r.grydBattery) + ' kWh</td></tr>' +
        '<tr><td>Est. energy coverage</td><td>' + ph(r.user.coverage) + '%</td><td>' + ph(r.fhs.coverage) + '%</td><td>' + ph(r.gryd.coverage) + '%</td></tr>' +
        '<tr><td>Est. annual generation</td><td>' + ph(r.user.annualGeneration.toLocaleString()) + ' kWh</td><td>' + ph(r.fhs.annualGeneration.toLocaleString()) + ' kWh</td><td>' + ph(r.gryd.annualGeneration.toLocaleString()) + ' kWh</td></tr>' +
      '</tbody></table></div></div>' +
      '<div class="sum-acts"><button type="button" class="btn ghost">Share your results</button>' +
      '<button type="button" class="btn ghost js-restart">Start again</button></div>';
  }

  function selectField(id, label, placeholder, options, value, onPick) {
    var html = '<div class="col"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" class="js-in">' +
      '<option value="">' + esc(placeholder) + '</option>' +
      options.map(function (o) {
        return '<option value="' + esc(o) + '"' + (String(value) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select></div>';
    var el = document.createElement('div');
    el.innerHTML = html;
    el.querySelector('select').addEventListener('change', function () { onPick(this.value); });
    return el.firstChild;
  }

  function toggleField(id, label, checked, hint, onPick) {
    var el = document.createElement('div');
    el.className = 'col wide';
    el.innerHTML = '<label class="toggle" for="' + id + '"><input type="checkbox" id="' + id + '"' +
      (checked ? ' checked' : '') + '><span>' + esc(label) + '</span></label>' +
      (hint ? '<p class="note">' + esc(hint) + '</p>' : '');
    el.querySelector('input').addEventListener('change', function () { onPick(this.checked); });
    return el;
  }

  function textField(id, label, placeholder, value, type, onPick) {
    var el = document.createElement('div');
    el.className = 'col';
    el.innerHTML = '<label for="' + id + '">' + esc(label) + '</label><input id="' + id +
      '" class="js-in" type="' + type + '" placeholder="' + esc(placeholder) + '" value="' + esc(value) + '">';
    el.querySelector('input').addEventListener('input', function () { onPick(this.value); });
    return el;
  }

  /* Builds the inputs for one step. Every mechanism reuses these, so the wording
     cannot drift between designs. */
  function fields(q, a, onChange) {
    var el = document.createElement('div');
    el.className = 'field';
    function sync() { onChange(a); }
    function add(node) { el.appendChild(node); }

    if (q.type === 'house') {
      function syncOdd() {
        var wrap = el.querySelector('[data-odd]');
        if (wrap) wrap.style.display = isSupported(a) ? 'none' : '';
      }
      add(selectField('f-ht', 'House type', 'Select house type', HOUSE_TYPES, a.houseType, function (v) { a.houseType = v; sync(); syncOdd(); }));
      add(selectField('f-bd', 'Number of bedrooms', 'Select bedrooms', BEDROOMS, a.bedrooms, function (v) { a.bedrooms = Number(v); sync(); syncOdd(); }));
      add(selectField('f-st', 'Number of storeys', 'Select storeys', STOREYS, a.storeys, function (v) { a.storeys = Number(v); sync(); }));
      var odd = document.createElement('div');
      odd.className = 'col wide';
      odd.setAttribute('data-odd', '');
      odd.innerHTML = '<p class="note flag">This combination is unusual \u2014 please contact us for a bespoke assessment.</p>';
      odd.style.display = isSupported(a) ? 'none' : '';
      add(odd);
    } else if (q.type === 'spec') {
      add(selectField('f-he', 'Planned heating system', 'Select heating system', HEATING, a.heating, function (v) { a.heating = v; sync(); }));
      add(toggleField('f-sol', 'Solar PV already in spec?', a.hasSolar, '', function (v) {
        a.hasSolar = v;
        if (!v) a.panels = 0;
        sync();
        var wrap = el.querySelector('[data-panels]');
        if (wrap) wrap.style.display = v ? '' : 'none';
      }));
      var panels = textField('f-pan', 'Number of panels', 'e.g. 12', a.panels || '', 'number', function (v) { a.panels = Number(v); sync(); });
      panels.setAttribute('data-panels', '');
      if (!a.hasSolar) panels.style.display = 'none';
      add(panels);
      add(toggleField('f-bat', 'Battery storage in spec?', a.hasBattery, '', function (v) { a.hasBattery = v; sync(); }));
      add(selectField('f-pl', 'Current Part L target', 'Select Part L target', PART_L, a.partL, function (v) { a.partL = v; sync(); }));
      add(selectField('f-ve', 'Ventilation strategy', 'Select ventilation strategy', VENT, a.ventilation, function (v) { a.ventilation = v; sync(); }));
      add(selectField('f-ai', 'Airtightness target', 'Select airtightness target', AIR, a.airtightness, function (v) { a.airtightness = v; sync(); }));
      add(selectField('f-gl', 'Glazing specification', 'Select glazing spec', GLAZING, a.glazing, function (v) { a.glazing = v; sync(); }));
      add(toggleField('f-ww', 'Wastewater heat recovery (WWHR) in spec?', a.hasWWHR,
        'WWHR systems recover heat from shower wastewater to preheat incoming cold water, reducing hot water energy demand.',
        function (v) { a.hasWWHR = v; sync(); }));
    } else if (q.type === 'details') {
      add(textField('f-fn', 'Full name *', 'John Smith', a.fullName, 'text', function (v) { a.fullName = v; sync(); }));
      add(textField('f-co', 'Company *', 'Your company name', a.company, 'text', function (v) { a.company = v; sync(); }));
      add(textField('f-em', 'Email *', 'john@company.co.uk', a.email, 'email', function (v) { a.email = v; sync(); }));
      add(textField('f-ph', 'Phone', '07xxx xxx xxx', a.phone, 'tel', function (v) { a.phone = v; sync(); }));
      add(selectField('f-hy', 'Approximate homes per year', 'Select range', HOMES_PER_YEAR, a.homesPerYear, function (v) { a.homesPerYear = v; sync(); }));
      var consent = document.createElement('div');
      consent.className = 'col wide';
      consent.innerHTML = '<label class="toggle" for="f-gd"><input type="checkbox" id="f-gd"' +
      (a.consent ? ' checked' : '') + '><span>' +
        'I consent to Gryd storing my details to provide this assessment and contact me about their services. View our ' +
        '<a href="https://gryd.energy/wp-content/uploads/2025/04/PRIVACY-POLICY.pdf" target="_blank" rel="noopener noreferrer">privacy policy</a>.</span></label>';
      consent.querySelector('input').addEventListener('change', function () { a.consent = this.checked; sync(); });
      add(consent);
    }
    return el;
  }

  /* One line summary of a step, used by the folded answer lists and design 5. */
  function stepValue(id, a) {
    if (id === 'house') return a.houseType + ' · ' + a.bedrooms + ' bed';
    if (id === 'spec') return a.heating;
    return a.fullName || 'Your Details';
  }

  w.GRYD = {
    QUESTIONS: QUESTIONS,
    OPTIONS: {
      houseTypes: HOUSE_TYPES, bedrooms: BEDROOMS, storeys: STOREYS,
      heating: HEATING, partL: PART_L, ventilation: VENT, airtightness: AIR,
      glazing: GLAZING, homesPerYear: HOMES_PER_YEAR
    },
    defaults: function () { var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; return o; },
    estimate: estimate,
    isSupported: isSupported,
    fields: fields,
    stepValue: stepValue,
    summaryHTML: summaryHTML
  };
})(window);
