/* Stand in for the real assessment engine.

   The modal asks for assess-engine.js first and only falls back to this file
   when that script is not on the server, so swapping the real one in needs no
   change anywhere else. The shape of the return is the contract: whatever
   computes the figures, the result object below is what the result view reads.

   The figures here are the ones the live tool gives for 100 homes at SW5 0PX,
   West facing, all 1 to 2 bed, all electric. Anything else is that same run
   scaled by the number of homes, which is honest about being a placeholder
   rather than pretending to model a scheme. */
(function () {
  "use strict";
  if (window.GrydAssess && typeof window.GrydAssess.compute === "function") { return; }

  /* per home, from the reference run */
  var SAVING_PER_UNIT = 4269;
  var LIFETIME_PER_HOME = 28463;
  var CO2_PER_HOME = 0.9513;

  var BANDS = [
    { key: "small", band: "1 to 2 Beds", subscription: "£55 to 75",
      lifetimeSaving: 13779, lifetimePct: 30.01, hardware: "12 Panels + Battery" },
    { key: "mid", band: "3 to 4 Beds", subscription: "£75 to 95",
      lifetimeSaving: 18420, lifetimePct: 32.44, hardware: "14 Panels + Battery" },
    { key: "large", band: "5+ Beds", subscription: "£95 to 130",
      lifetimeSaving: 24960, lifetimePct: 34.10, hardware: "18 Panels + Battery" }
  ];

  /* Postcode areas we can name without a lookup service. Anything else is
     placed by its outward code alone, which is all the summary claims. */
  var AREAS = {
    E: "London", EC: "London", N: "London", NW: "London", SE: "London",
    SW: "London", W: "London", WC: "London", BS: "Bristol", B: "Birmingham",
    CB: "Cambridge", CF: "Cardiff", EH: "Edinburgh", G: "Glasgow",
    LS: "Leeds", M: "Manchester", NE: "Newcastle", NR: "Norwich",
    OX: "Oxford", RG: "Reading", S: "Sheffield", SO: "Southampton",
    TA: "Taunton", YO: "York"
  };

  function town(postcode) {
    var pc = String(postcode || "").toUpperCase().replace(/\s+/g, " ").trim();
    var area = (pc.match(/^[A-Z]{1,2}/) || [""])[0];
    return AREAS[area] || "United Kingdom";
  }

  /* The bill without Gryd rises; the Gryd subscription does not. Year 10 is
     pinned to the reference run and the rest of the curve is grown off it at a
     steady 3.5 percent, so the shape is smooth and the pinned year is exact. */
  function series() {
    var years = [], sub = [], retailer = [], without = [];
    var g = 1.035;
    var base = 2615.34 / Math.pow(g, 9);
    var share = 719.78 / 2615.34;
    for (var y = 1; y <= 25; y++) {
      var w = base * Math.pow(g, y - 1);
      years.push(y);
      sub.push(1080);
      retailer.push(Math.round(w * share * 100) / 100);
      without.push(Math.round(w * 100) / 100);
    }
    return { years: years, subscription: sub, retailer: retailer, without: without };
  }

  function compute(inputs) {
    var i = inputs || {};
    var homes = Math.max(1, parseInt(i.homes, 10) || 1);
    var split = i.split || { small: 100, mid: 0, large: 0 };
    var rows = BANDS.filter(function (b) { return (split[b.key] || 0) > 0; })
      .map(function (b) {
        return { band: b.band, subscription: b.subscription,
                 lifetimeSaving: b.lifetimeSaving, lifetimePct: b.lifetimePct,
                 hardware: b.hardware };
      });
    if (!rows.length) { rows = [BANDS[0]]; }
    return {
      developerSaving: Math.round(SAVING_PER_UNIT * homes),
      homeownerLifetimeSaving: LIFETIME_PER_HOME,
      co2TonnesPerYear: Math.round(CO2_PER_HOME * homes * 100) / 100,
      savingPerUnit: SAVING_PER_UNIT,
      rows: rows,
      chart: series(),
      location: { postcode: String(i.postcode || "").toUpperCase().trim(),
                  town: town(i.postcode) }
    };
  }

  window.GrydAssess = { compute: compute };
})();
