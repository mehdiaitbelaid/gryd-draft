/* Site assessment engine, rebuilt from Scott's Google Sheet.

   Source of every constant and every formula:
   home-final/assess-model-source/self-service-site-assessment-sheet.md
   (transcription of https://docs.google.com/spreadsheets/d/15x4-rwSAKtEybg_XgzL-9l0MVAVcVZUeQ15G-VUcHZw).
   The transcription carries no cell ids, so each formula below names the sheet
   section and the worked example line it was reversed from.

   Contract is the stub's: window.GrydAssess.compute(inputs) with
   inputs {homes, postcode, orientation, energy, split:{small,mid,large},
   bandCounts:{small,mid,large}} and a
   return of {developerSaving, homeownerLifetimeSaving, co2TonnesPerYear,
   savingPerUnit, rows[], chart{years,subscription,retailer,without},
   location{postcode,town}}.

   FORMULAS

   1. Kk           sheet "Constants > Kk value" table, looked up by MCS zone
                   (from the postcode area) and by the orientation column from
                   "Orientation mapping".
   2. Generation   kWp x Kk. Worked example "Annual Generation per home
                   5005.8 / 7508.7 / 10011.6" = 5.4/8.1/10.8 x 927.
   3. Independence Scale A, "Scale A highest 1130 (80%), lowest 438 (65%)",
                   linear: 0.65 + (Kk - 438)/(1130 - 438) x 0.15.
                   Kk 927 gives 0.7559971, the sheet's "Grid independence 76%".
   4. Dependence   1 - independence. 0.2440029 for Kk 927 ("Grid dependance 24%").
   5. Grid cost    year n (n from 0) = demand x 0.245 x 1.04^n, from "Energy Unit
                   Price £0.245/kWh; Energy Price Inflation 4%" and the demand
                   row. It is the full bill, with no dependence applied: the
                   sheet's year 0 1-2 bed 1102.50 is exactly 4500 x 0.245, and
                   its year 9 1569.20 is 1102.50 x 1.04^9.
   6. Lifetime     sum of the 25 grid cost years. 45,914.61 / 59,178.84 /
      grid cost   76,524.36 in the worked example.
   7. Gryd total   dependence x lifetime grid cost + 25 x 12 x subscription
                   midpoint. Worked example 30,703.30 / 36,939.81 / 45,672.16.
   8. Lifetime     lifetime grid cost - Gryd total cost; the percentage is that
      saving      over lifetime grid cost. 15,211.32 (33.13%) / 22,239.03
                   (37.58%) / 30,852.19 (40.32%).
   9. Hardware     sum over bands of homes_in_band x hardware cost, with
      saving      hardware costs £2,846.47 / £3,613.97 / £4,219.41. 200 homes at
                   20/50/30 gives exactly £728,420.40, per unit £3,642.10. No
                   uplift is needed; the sheet figure reproduces as it stands.
                   The sheet asks for the homes in each band as a number, not
                   as a share ("home size break down | number | ... total
                   equals homes"), so bandCounts is the exact input and split
                   is the rounded reading of it. Three plots, one in each band,
                   are three whole homes here and 1.02 / 0.99 / 0.99 through
                   the percentages.
  10. Carbon       sum over bands of homes_in_band x generation x 0.225 / 1000
                   tonnes a year. Worked example 349.15 tonnes.
  11. Chart        the largest band present in the run. The live API only ships
                   gridCostsLarge, so for the 100 home SW5 0PX West case with 5+
                   bed plots it shows year 10 without Gryd 2,615.34, the sheet's
                   5+ bed year 9 value, and a flat 1,080 a year, 12 x the 5+ All
                   Electric midpoint of 90. A run with no 5+ bed plots is drawn
                   on its own largest band instead, so the axis matches what is
                   on screen. The remaining retailer bill is the without line
                   times the grid dependence.
  12. Headline     homeowner lifetime saving is the largest lifetime saving of
                   the bands present, matching the API's largestLifetimeSaving.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) { module.exports = api; }
  if (typeof window !== "undefined") {
    if (!(window.GrydAssess && typeof window.GrydAssess.compute === "function")) {
      window.GrydAssess = api;
    }
  }
})(this, function () {
  "use strict";

  var UNIT_PRICE = 0.245;      /* Constants: Energy Unit Price */
  var INFLATION = 0.04;        /* Constants: Energy Price Inflation */
  var CARBON = 0.225;          /* Constants: Grid Carbon Emissions kgCO2/kWh */
  var YEARS = 25;              /* Footnote: 25 year system lifetime */
  var SCALE_A = { hiKk: 1130, hi: 0.80, loKk: 438, lo: 0.65 };

  var BANDS = [
    { key: "small", band: "1 - 2 Beds", panels: 12, kwp: 5.4, hardware: 2846.47,
      demand: { "All Electric": 4500, "Gas and Electric": 2700 },
      sub: { "All Electric": { mid: 65, range: "£55-75" },
             "Gas and Electric": { mid: 45, range: "£45-55" } } },
    { key: "mid", band: "3 - 4 Beds", panels: 18, kwp: 8.1, hardware: 3613.97,
      demand: { "All Electric": 5800, "Gas and Electric": 3600 },
      sub: { "All Electric": { mid: 75, range: "£75-95" },
             "Gas and Electric": { mid: 55, range: "£55-65" } } },
    { key: "large", band: "5+ Beds", panels: 24, kwp: 10.8, hardware: 4219.41,
      demand: { "All Electric": 7500, "Gas and Electric": 4600 },
      sub: { "All Electric": { mid: 90, range: "£90-115" },
             "Gas and Electric": { mid: 65, range: "£65-75" } } }
  ];

  /* Constants: Kk value table, columns S, SE/SW, E/W, NE, N. */
  var KK = {
    "1": [984, 927, 783, 600, 543], "2": [1130, 1060, 883, 652, 579],
    "3": [1021, 962, 810, 616, 555], "4": [1091, 1028, 862, 642, 572],
    "5E": [971, 916, 775, 594, 536], "5W": [949, 896, 760, 586, 531],
    "6": [935, 883, 749, 579, 526], "7E": [865, 818, 698, 546, 499],
    "7W": [930.86, 877.76, 742.06, 569.96, 516.65], "8S": [866, 816, 689, 531, 483],
    "8E": [877, 826, 697, 537, 488], "9E": [903, 848, 710, 540, 488],
    "9S": [902, 847, 708, 538, 485], "10": [914, 858, 718, 545, 493],
    "11": [892, 840, 711, 550, 500], "12": [961, 905, 765, 586, 529],
    "13": [922, 874, 744, 574, 518], "14": [833, 787, 669, 522, 475],
    "15": [937.93, 879.45, 730.3, 544.81, 487.34], "16": [872, 820, 688, 523, 472],
    "17": [833, 785, 664, 514, 467], "18": [791, 751, 645, 507, 467],
    "19": [757, 718, 617, 489, 452], "20": [736, 699, 601, 476, 438],
    "21": [845, 797, 676, 527, 481]
  };

  var ZONE_TOWN = {
    "1": "London", "2": "Brighton", "3": "Southampton", "4": "Plymouth",
    "5E": "Bristol", "5W": "Cardiff", "6": "Birmingham", "7E": "Manchester",
    "7W": "Chester", "8S": "Dumfries", "8E": "Carlisle", "9E": "Newcastle",
    "9S": "Edinburgh", "10": "Middlesbrough", "11": "Sheffield", "12": "Norwich",
    "13": "Aberystwyth", "14": "Glasgow", "15": "Dundee", "16": "Aberdeen",
    "17": "Inverness", "18": "Stornoway", "19": "Kirkwall", "20": "Lerwick",
    "21": "Belfast"
  };

  /* Postcode area to MCS zone. The sheet names 25 zones and no areas, so this
     is the standard MCS zone map. Ambiguous areas are listed in the test
     output; each one is placed with its nearest zone centre. */
  var AREA_ZONE = {
    E: "1", EC: "1", N: "1", NW: "1", SE: "1", SW: "1", W: "1", WC: "1",
    BR: "1", CR: "1", DA: "1", EN: "1", HA: "1", IG: "1", KT: "1", RM: "1",
    SM: "1", TW: "1", UB: "1", WD: "1", SL: "1", GU: "1", RH: "1", RG: "1",
    HP: "1", AL: "1", LU: "1", MK: "1", OX: "1", TN: "1", ME: "1", CT: "1",
    BN: "2",
    SO: "3", PO: "3", SP: "3", BH: "3",
    PL: "4", TQ: "4", TR: "4", EX: "4", DT: "4",
    BS: "5E", BA: "5E", GL: "5E", TA: "5E", TF: "6", TE: "5E",
    CF: "5W", NP: "5W", SA: "5W",
    B: "6", CV: "6", WS: "6", WV: "6", DY: "6", ST: "6", WR: "6", HR: "6",
    M: "7E", SK: "7E", OL: "7E", BL: "7E", WA: "7E", WN: "7E", PR: "7E",
    BB: "7E", FY: "7E", L: "7E",
    CH: "7W", LL: "7W", SY: "13", LD: "13",
    DG: "8S", CA: "8E", LA: "8E",
    NE: "9E", SR: "9E", DH: "9E", DL: "9E",
    EH: "9S", TD: "9S", KY: "9S", FK: "9S",
    TS: "10", YO: "10", HG: "10",
    S: "11", DN: "11", HU: "11", LS: "11", BD: "11", HX: "11", HD: "11",
    WF: "11", LN: "11", NG: "11", DE: "11", LE: "11", NN: "11",
    NR: "12", IP: "12", CB: "12", CO: "12", CM: "12", SS: "12", PE: "12",
    G: "14", PA: "14", ML: "14", KA: "14",
    DD: "15", PH: "15", AB: "16", IV: "17", HS: "18", KW: "19", ZE: "20",
    BT: "21"
  };

  var ORIENTATION_COL = {
    "north": 4, "n": 4,
    "north east": 3, "northeast": 3, "ne": 3, "north west": 3, "northwest": 3, "nw": 3,
    "east": 2, "e": 2, "west": 2, "w": 2, "east west": 2,
    "south east": 1, "southeast": 1, "se": 1,
    "south west": 1, "southwest": 1, "sw": 1,
    "south": 0, "s": 0
  };

  function area(postcode) {
    var pc = String(postcode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return (pc.match(/^[A-Z]{1,2}/) || [""])[0];
  }

  function zoneOf(postcode) {
    var a = area(postcode);
    if (AREA_ZONE[a]) { return AREA_ZONE[a]; }
    if (a.length === 2 && AREA_ZONE[a.charAt(0)]) { return AREA_ZONE[a.charAt(0)]; }
    return "1"; /* nothing recognised: London, the sheet's own worked example zone */
  }

  function kkValue(postcode, orientation) {
    var col = ORIENTATION_COL[String(orientation || "South West").toLowerCase().trim()];
    if (col === undefined) { col = 1; } /* default South West, per the brief */
    return KK[zoneOf(postcode)][col];
  }

  function independence(kk) {
    var f = (kk - SCALE_A.loKk) / (SCALE_A.hiKk - SCALE_A.loKk);
    return SCALE_A.lo + f * (SCALE_A.hi - SCALE_A.lo);
  }

  function energyKey(energy) {
    var e = String(energy || "All Electric").toLowerCase();
    return (e.indexOf("gas") >= 0) ? "Gas and Electric" : "All Electric";
  }

  function gridCostYears(demand) {
    var out = [], i;
    for (i = 0; i < YEARS; i++) {
      out.push(demand * UNIT_PRICE * Math.pow(1 + INFLATION, i));
    }
    return out;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function bandModel(b, kk, ekey) {
    var demand = b.demand[ekey];
    var sub = b.sub[ekey];
    var dep = 1 - independence(kk);
    var costs = gridCostYears(demand);
    var lifetimeGrid = costs.reduce(function (a, c) { return a + c; }, 0);
    var lifetimeSub = YEARS * 12 * sub.mid;
    var grydTotal = dep * lifetimeGrid + lifetimeSub;
    var saving = lifetimeGrid - grydTotal;
    return {
      key: b.key,
      band: b.band,
      subscription: sub.range,
      subscriptionMonthly: sub.mid,
      generation: b.kwp * kk,
      demand: demand,
      costs: costs,
      lifetimeGrid: lifetimeGrid,
      lifetimeSubscription: lifetimeSub,
      grydTotal: grydTotal,
      lifetimeSaving: saving,
      lifetimePct: (saving / lifetimeGrid) * 100,
      hardware: b.panels + " Panels + Battery",
      hardwareCost: b.hardware
    };
  }

  /* The homes in each band. bandCounts is the sheet's own input and is used
     whole; split is the percentage reading of it and is only fallen back on
     when no counts were collected. A run with nothing in any band is refused
     rather than charged to the 1 to 2 bed band, because a fabricated one home
     scheme reads as a real answer everywhere downstream. */
  function bandCounts(i, asked) {
    var raw = i.bandCounts;
    var split = i.split || {};
    var out = BANDS.map(function (b) {
      var n = raw ? Number(raw[b.key]) : asked * Number(split[b.key] || 0) / 100;
      return n > 0 ? n : 0;
    });
    var total = out.reduce(function (a, n) { return a + n; }, 0);
    if (!(total > 0)) { throw new Error("site assessment: no plots in any bedroom band"); }
    return out;
  }

  function compute(inputs) {
    var i = inputs || {};
    var asked = Math.max(1, parseInt(i.homes, 10) || 1);
    var ekey = energyKey(i.energy);
    var kk = kkValue(i.postcode, i.orientation);
    var dep = 1 - independence(kk);

    var models = BANDS.map(function (b) { return bandModel(b, kk, ekey); });
    var counts = bandCounts(i, asked);
    var homes = counts.reduce(function (a, n) { return a + n; }, 0);

    var developerSaving = 0, carbonKg = 0, biggest = 0;
    models.forEach(function (m, n) {
      developerSaving += counts[n] * m.hardwareCost;
      carbonKg += counts[n] * m.generation * CARBON;
      if (counts[n] > 0 && m.lifetimeSaving > biggest) { biggest = m.lifetimeSaving; }
    });

    var rows = models.filter(function (m, n) { return counts[n] > 0; }).map(function (m) {
      return { band: m.band, subscription: m.subscription,
               lifetimeSaving: round2(m.lifetimeSaving),
               lifetimePct: round2(m.lifetimePct), hardware: m.hardware };
    });

    /* The chart draws the largest band present in the run. The live API only
       ever returns gridCostsLarge, so a scheme with no 5+ bed plots used to be
       charted against a house nobody is building, which pushed the axis a whole
       step above anything on screen. */
    var big = models[0];
    models.forEach(function (m, n) { if (counts[n] > 0) { big = m; } });
    var years = [], sub = [], retailer = [], without = [];
    for (var y = 1; y <= YEARS; y++) {
      var w = big.costs[y - 1];
      years.push(y);
      sub.push(big.subscriptionMonthly * 12);
      retailer.push(round2(w * dep));
      without.push(round2(w));
    }

    return {
      developerSaving: round2(developerSaving),
      homeownerLifetimeSaving: round2(biggest),
      co2TonnesPerYear: round2(carbonKg / 1000),
      savingPerUnit: round2(developerSaving / homes),
      rows: rows,
      chart: { years: years, subscription: sub, retailer: retailer, without: without },
      location: { postcode: String(i.postcode || "").toUpperCase().trim(),
                  town: ZONE_TOWN[zoneOf(i.postcode)] || "United Kingdom" },
      model: { kk: kk, zone: zoneOf(i.postcode), independence: independence(kk),
               dependence: dep, energy: ekey, bands: models, counts: counts,
               homes: homes }
    };
  }

  return { compute: compute, kkValue: kkValue, independence: independence,
           zoneOf: zoneOf, BANDS: BANDS };
});
