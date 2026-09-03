/* Council Solar Index. A straight port of the Lovable app's own modules
   (map-colors, badges, insights, MapView, Tooltip, Legend, Controls,
   Breadcrumb) onto plain DOM, reading the same three data files.

   The map carries no tile service. The boundaries are the map: a MapLibre
   background layer on the hub's paper, the LAD polygons filled from the metric,
   and the Republic of Ireland outline for geographic context. That is how the
   app draws it too, so nothing here is a substitution. */
(function () {
  "use strict";

  var DATA = "data/csi/";

  /* ---------- colour ramp (map-colors.ts) ----------
     Bins and ramp are the app's. NO_STOCK is the one value moved: the app's
     #A8B8C4 is a blue grey that has no place in this palette, so the category
     takes the warm grey between --warm-grey and --stone-mid instead. */
  var BINS = {
    pctSolar: [0, 1, 3, 6, 10, 20, 100],
    pctEpcDPlus: [0, 15, 25, 35, 50, 70, 100]
  };
  var RAMP = ["#FCEFEA", "#FBD5C7", "#FBB69D", "#FB9270", "#FA7848", "#FF5532"];
  var NODATA_FILL = "#D6CBC1";
  var NO_STOCK_FILL = "#B9A79C";

  function colorFor(value, metric) {
    if (value === null || value === undefined || isNaN(value)) return NODATA_FILL;
    var bins = BINS[metric];
    var v = Math.round(value * 10) / 10;
    for (var i = 1; i < bins.length; i++) if (v < bins[i]) return RAMP[i - 1];
    return RAMP[RAMP.length - 1];
  }

  function binLabels(metric) {
    var bins = BINS[metric];
    return RAMP.map(function (color, i) {
      if (i === RAMP.length - 1) return { color: color, label: bins[i] + "%+" };
      return { color: color, label: bins[i] + "–" + bins[i + 1] + "%" };
    });
  }

  var METRIC_LABEL = { pctSolar: "% with solar", pctEpcDPlus: "% EPC D or worse" };
  var METRIC_LONG = {
    pctSolar: "Council homes with rooftop solar",
    pctEpcDPlus: "Council homes rated EPC D or worse"
  };

  /* ---------- formatting (map-data.ts) ---------- */
  function formatInt(n) {
    if (n === null || n === undefined) return "—";
    return n.toLocaleString("en-GB");
  }
  function formatPct(n) {
    if (n === null || n === undefined) return "—";
    return n.toFixed(1) + "%";
  }
  var nfInt = function (n) { return Math.round(n).toLocaleString("en-GB"); };
  var nfPct = function (n) { return n.toFixed(1) + "%"; };
  var signed = function (n) { return n > 0 ? "+" + nfInt(n) : nfInt(n); };
  var signedPct = function (n) { return (n > 0 ? "+" : "") + n.toFixed(1) + "%"; };
  var r1 = function (n) { return Math.round(n * 10) / 10; };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- badges (badges.ts) ---------- */
  var badgeIndex = null;

  function buildBadgeIndex(metrics) {
    var lads = [];
    Object.keys(metrics.lads).forEach(function (k) {
      var lad = metrics.lads[k];
      var d25 = lad.years["2025"], d26 = lad.years["2026"];
      var cov25 = d25 ? (d25.pctSolar != null ? d25.pctSolar : null) : null;
      var cov26 = d26 ? (d26.pctSolar != null ? d26.pctSolar : null) : null;
      var cov = cov26 != null ? cov26 : cov25;
      if (cov == null) return;
      lads.push({
        code: lad.ladCode,
        region: lad.region,
        country: lad.country,
        cov: r1(cov),
        cov25: cov25,
        cov26: cov26,
        solar25: d25 && d25.homesSolar != null ? d25.homesSolar : null,
        solar26: d26 && d26.homesSolar != null ? d26.homesSolar : null,
        solarHomes: (d26 && d26.homesSolar != null) ? d26.homesSolar
          : (d25 && d25.homesSolar != null ? d25.homesSolar : 0),
        epc: (d26 && d26.pctEpcDPlus != null) ? d26.pctEpcDPlus
          : (d25 && d25.pctEpcDPlus != null ? d25.pctEpcDPlus : null)
      });
    });
    var byCovDesc = lads.slice().sort(function (a, b) { return b.cov - a.cov; });
    var ukRank = {};
    byCovDesc.forEach(function (l, i) { ukRank[l.code] = i + 1; });
    var byRegion = {}, byCountry = {}, statsMap = {};
    lads.forEach(function (l) {
      if (l.region) (byRegion[l.region] = byRegion[l.region] || []).push(l);
      if (l.country) (byCountry[l.country] = byCountry[l.country] || []).push(l);
      statsMap[l.code] = l;
    });
    return { lads: lads, ukRank: ukRank, byRegion: byRegion, byCountry: byCountry, statsMap: statsMap };
  }

  function getBadgesForLad(metrics, code) {
    if (!badgeIndex) badgeIndex = buildBadgeIndex(metrics);
    var ix = badgeIndex;
    var stat = ix.statsMap[code];
    if (!stat) return [];
    var total = ix.lads.length;
    var ukR = ix.ukRank[code];

    var regionGroup = stat.region ? (ix.byRegion[stat.region] || []) : [];
    var regionSorted = regionGroup.slice().sort(function (a, b) { return b.cov - a.cov; });
    var regionRank = regionSorted.findIndex(function (l) { return l.code === code; }) + 1;

    var countryGroup = stat.country ? (ix.byCountry[stat.country] || []) : [];
    var countrySorted = countryGroup.slice().sort(function (a, b) { return b.cov - a.cov; });
    var countryRank = countrySorted.findIndex(function (l) { return l.code === code; }) + 1;

    var regionByCount = regionGroup.slice().sort(function (a, b) { return b.solarHomes - a.solarHomes; });
    var regionCountRank = regionByCount.findIndex(function (l) { return l.code === code; }) + 1;

    var regionEpcSorted = regionGroup.filter(function (l) { return l.epc != null; })
      .sort(function (a, b) { return a.epc - b.epc; });

    var badges = [];
    if (regionGroup.length >= 3 && regionRank === 1)
      badges.push({ id: "region-1", label: "#1 in " + stat.region, tone: "positive", priority: 10 });
    if (countryGroup.length >= 5 && countryRank === 1)
      badges.push({ id: "country-1", label: "#1 in " + stat.country, tone: "positive", priority: 11 });
    if (total >= 20 && ukR <= Math.ceil(total * 0.1))
      badges.push({ id: "top10-uk", label: "Top 10% UK for solar", tone: "positive", priority: 20 });
    if (regionGroup.length >= 8 && regionRank <= 5)
      badges.push({ id: "top5-region", label: "Top 5 in " + stat.region, tone: "positive", priority: 25 });
    if (regionGroup.length >= 3 && regionCountRank === 1 && stat.solarHomes > 0)
      badges.push({ id: "region-most-solar", label: "Most solar homes in " + stat.region, tone: "positive", priority: 30 });

    if (stat.cov25 != null && stat.cov26 != null) {
      var ppDelta = stat.cov26 - stat.cov25;
      if ((stat.solar25 || 0) === 0 && (stat.solar26 || 0) > 0)
        badges.push({ id: "first-installer", label: "First-time solar installer", tone: "positive", priority: 15 });
      if ((stat.solar25 || 0) >= 5 && (stat.solar26 || 0) >= stat.solar25 * 2)
        badges.push({ id: "doubled", label: "Doubled solar homes YoY", tone: "positive", priority: 18 });
      var regionWithBoth = regionGroup.filter(function (l) { return l.cov25 != null && l.cov26 != null; });
      if (regionWithBoth.length >= 5) {
        var byPP = regionWithBoth.slice().sort(function (a, b) {
          return (b.cov26 - b.cov25) - (a.cov26 - a.cov25);
        });
        if (byPP[0].code === code && ppDelta > 0.5)
          badges.push({ id: "biggest-yoy-region", label: "Biggest YoY jump in " + stat.region, tone: "positive", priority: 22 });
      }
      var regionAbs = regionGroup.filter(function (l) {
        return l.solar25 != null && l.solar26 != null && l.solar26 - l.solar25 > 0;
      });
      if (regionAbs.length >= 3) {
        var byAbs = regionAbs.slice().sort(function (a, b) {
          return (b.solar26 - b.solar25) - (a.solar26 - a.solar25);
        });
        if (byAbs[0].code === code)
          badges.push({ id: "most-new-solar-region", label: "Most new solar homes added in " + stat.region, tone: "positive", priority: 28 });
      }
    }

    if (regionEpcSorted.length >= 5 && regionEpcSorted[0].code === code)
      badges.push({ id: "best-epc-region", label: "Best EPC ratings in " + stat.region, tone: "positive", priority: 35 });

    if (total >= 20 && ukR > total - Math.ceil(total * 0.1))
      badges.push({ id: "bottom10-uk", label: "Bottom 10% UK for solar", tone: "negative", priority: 60 });
    if (regionGroup.length >= 8 && regionRank > regionGroup.length - 5)
      badges.push({ id: "bottom5-region", label: "Bottom 5 in " + stat.region, tone: "negative", priority: 62 });
    var regionAgg = stat.region && metrics.regions[stat.region] && metrics.regions[stat.region].years["2026"]
      ? metrics.regions[stat.region].years["2026"].pctSolar : null;
    if (regionAgg != null && stat.cov < r1(regionAgg))
      badges.push({ id: "below-region-avg", label: "Below " + stat.region + " average", tone: "negative", priority: 70 });
    var countryAgg = stat.country && metrics.countries[stat.country] && metrics.countries[stat.country].years["2026"]
      ? metrics.countries[stat.country].years["2026"].pctSolar : null;
    if (countryAgg != null && stat.cov < r1(countryAgg))
      badges.push({ id: "below-country-avg", label: "Below " + stat.country + " average", tone: "negative", priority: 72 });
    if (regionEpcSorted.length >= 5 && regionEpcSorted[regionEpcSorted.length - 1].code === code)
      badges.push({ id: "worst-epc-region", label: "Lowest EPC ratings in " + stat.region, tone: "negative", priority: 80 });

    var ids = {};
    badges.forEach(function (b) { ids[b.id] = true; });
    var filtered = badges.filter(function (b) {
      if (b.id === "top5-region" && ids["region-1"]) return false;
      if (b.id === "region-most-solar" && ids["region-1"]) return false;
      if (b.id === "below-country-avg" && ids["below-region-avg"]) return false;
      if (b.id === "bottom5-region" && ids["bottom10-uk"]) return false;
      return true;
    });
    filtered.sort(function (a, b) {
      if (a.tone !== b.tone) return a.tone === "positive" ? -1 : 1;
      return a.priority - b.priority;
    });
    return filtered.slice(0, 3);
  }

  /* ---------- insights (insights.ts) ---------- */
  var NO_STOCK_STATUSES = ["no_stock", "stock_transferred", "stock_transferred_unknown",
    "managed_by_other", "managed_by_other_unknown"];

  function councilLabel(l) {
    return l.authority || (l.ladName ? l.ladName + " Council" : l.ladCode);
  }
  function ladsIn(metrics, country, region) {
    return Object.keys(metrics.lads).map(function (k) { return metrics.lads[k]; })
      .filter(function (l) {
        if (country && l.country !== country) return false;
        if (region && l.region !== region) return false;
        return true;
      });
  }
  function responded(l, year) {
    var d = l.years[year];
    if (!d || d.totalHomes == null) return null;
    return d;
  }
  function uniqueByCouncil(lads) {
    var seen = {}, out = [];
    lads.forEach(function (l) {
      var key = l.authority || l.ladCode;
      if (seen[key]) return;
      seen[key] = true;
      out.push(l);
    });
    return out;
  }

  function getInsights(metrics, level, selectedCountry, selectedRegion) {
    var pool = [];
    var i;

    if (level === "country") {
      var countries = Object.keys(metrics.countries).map(function (k) { return metrics.countries[k]; });
      var withData = countries.filter(function (c) { return c.years["2026"] && c.years["2026"].homesSolar != null; });
      if (withData.length) {
        var topAbs = withData.slice().sort(function (a, b) {
          return (b.years["2026"].homesSolar || 0) - (a.years["2026"].homesSolar || 0);
        })[0];
        pool.push({
          category: "leader",
          headline: topAbs.name + " leads the UK with " + nfInt(topAbs.years["2026"].homesSolar) + " council homes with solar",
          detail: nfPct(topAbs.years["2026"].pctSolar || 0) + " of its tracked stock"
        });
      }
      var allLads = uniqueByCouncil(Object.keys(metrics.lads).map(function (k) { return metrics.lads[k]; }));
      var s25 = 0, s26 = 0, has25 = 0, has26 = 0;
      allLads.forEach(function (l) {
        var a = responded(l, "2025"), b = responded(l, "2026");
        if (a && a.homesSolar != null) { s25 += a.homesSolar; has25++; }
        if (b && b.homesSolar != null) { s26 += b.homesSolar; has26++; }
      });
      if (has25 && has26) {
        var delta = s26 - s25;
        var pct = s25 > 0 ? (delta / s25) * 100 : 0;
        pool.push({
          category: "trend",
          headline: "UK councils " + (delta >= 0 ? "added" : "lost") + " " + signed(delta) + " solar homes between 2025 and 2026",
          detail: signedPct(pct) + " year-on-year"
        });
      }
      var total = allLads.length;
      var noResp = allLads.filter(function (l) { return l.status === "no_response"; }).length;
      var noStock = allLads.filter(function (l) { return l.status && NO_STOCK_STATUSES.indexOf(l.status) >= 0; }).length;
      pool.push({
        category: "coverage",
        headline: nfInt(total - noResp) + " of " + nfInt(total) + " UK councils reported their solar installations",
        detail: nfInt(noStock) + " hold no stock or manage it elsewhere"
      });
      var ukHomes = withData.reduce(function (a, c) { return a + (c.years["2026"].totalHomes || 0); }, 0);
      var ukSolar = withData.reduce(function (a, c) { return a + (c.years["2026"].homesSolar || 0); }, 0);
      if (ukHomes) {
        pool.push({
          category: "scale",
          headline: nfInt(ukHomes) + " council homes tracked across the UK",
          detail: nfPct((ukSolar / ukHomes) * 100) + " have rooftop solar"
        });
      }
      if (withData.length > 1) {
        var low = withData.slice().sort(function (a, b) {
          return (a.years["2026"].pctSolar || 0) - (b.years["2026"].pctSolar || 0);
        })[0];
        pool.push({
          category: "leader",
          headline: low.name + " trails on solar uptake at " + nfPct(low.years["2026"].pctSolar || 0)
        });
      }
      var ukEpc = withData.reduce(function (a, c) { return a + (c.years["2026"].homesEpcDPlus || 0); }, 0);
      if (ukHomes) {
        pool.push({
          category: "epc",
          headline: nfPct((ukEpc / ukHomes) * 100) + " of UK council homes are rated EPC D or worse"
        });
      }
      return { scope: "United Kingdom", insights: pool.slice(0, 3) };
    }

    if (level === "region" && selectedCountry) {
      var regions = Object.keys(metrics.regions).map(function (k) { return metrics.regions[k]; })
        .filter(function (r) { return r.country === selectedCountry; });
      var rWithData = regions.filter(function (r) { return r.years["2026"] && r.years["2026"].homesSolar != null; });
      var countryLads = uniqueByCouncil(ladsIn(metrics, selectedCountry, null));
      var topRegionAbs = null;
      if (rWithData.length) {
        topRegionAbs = rWithData.slice().sort(function (a, b) {
          return (b.years["2026"].homesSolar || 0) - (a.years["2026"].homesSolar || 0);
        })[0];
        pool.push({
          category: "leader",
          headline: topRegionAbs.name + " has the most council homes with solar in " + selectedCountry,
          detail: nfInt(topRegionAbs.years["2026"].homesSolar) + " homes · " + nfPct(topRegionAbs.years["2026"].pctSolar || 0)
        });
      }
      if (rWithData.length > 1) {
        var topPctR = rWithData.slice().sort(function (a, b) {
          return (b.years["2026"].pctSolar || 0) - (a.years["2026"].pctSolar || 0);
        })[0];
        if (!topRegionAbs || topPctR.name !== topRegionAbs.name) {
          pool.push({
            category: "leader",
            headline: topPctR.name + " leads " + selectedCountry + " on solar uptake — " +
              nfPct(topPctR.years["2026"].pctSolar || 0) + " of council homes have solar installed"
          });
        }
      }
      var bestGrower = null;
      regions.forEach(function (r) {
        var a = r.years["2025"] ? r.years["2025"].homesSolar : null;
        var b = r.years["2026"] ? r.years["2026"].homesSolar : null;
        if (a != null && b != null && a > 0 && b > a) {
          var p = ((b - a) / a) * 100;
          if (!bestGrower || p > bestGrower.pct) bestGrower = { name: r.name, delta: b - a, pct: p, from: a, to: b };
        }
      });
      if (bestGrower) {
        var multiple = bestGrower.to / bestGrower.from;
        pool.push({
          category: "trend",
          headline: multiple >= 1.9
            ? bestGrower.name + " more than doubled its council homes with solar"
            : bestGrower.name + " saw the fastest growth in council homes with solar",
          detail: nfInt(bestGrower.from) + " → " + nfInt(bestGrower.to) + " homes (" + signedPct(bestGrower.pct) + ") since 2025"
        });
      }
      var cTotal = countryLads.length;
      var cNoResp = countryLads.filter(function (l) { return l.status === "no_response"; }).length;
      var cNoStock = countryLads.filter(function (l) { return l.status && NO_STOCK_STATUSES.indexOf(l.status) >= 0; }).length;
      if (cTotal) {
        pool.push({
          category: "coverage",
          headline: nfInt(cNoResp) + " of " + nfInt(cTotal) + " " + selectedCountry + " councils did not report their solar installations",
          detail: cNoStock ? nfInt(cNoStock) + " manage no housing stock directly" : null
        });
      }
      var ladRespondents = countryLads.filter(function (l) {
        return ((l.years["2026"] && l.years["2026"].totalHomes) || 0) >= 50;
      });
      if (ladRespondents.length) {
        var top = ladRespondents.slice().sort(function (a, b) {
          return ((b.years["2026"] && b.years["2026"].pctSolar) || 0) - ((a.years["2026"] && a.years["2026"].pctSolar) || 0);
        })[0];
        pool.push({
          category: "leader",
          headline: councilLabel(top) + " leads " + selectedCountry + " councils on solar uptake",
          detail: nfPct((top.years["2026"] && top.years["2026"].pctSolar) || 0) + " of " +
            nfInt((top.years["2026"] && top.years["2026"].totalHomes) || 0) + " homes"
        });
      }
      var c = metrics.countries[selectedCountry];
      if (c && c.years["2026"]) {
        pool.push({
          category: "scale",
          headline: selectedCountry + " tracks " + nfInt(c.years["2026"].totalHomes || 0) + " council homes",
          detail: nfPct(c.years["2026"].pctSolar || 0) + " have rooftop solar"
        });
        pool.push({
          category: "epc",
          headline: nfPct(c.years["2026"].pctEpcDPlus || 0) + " of " + selectedCountry + " council homes are rated EPC D or worse"
        });
      }
      return { scope: selectedCountry, insights: pool.slice(0, 3) };
    }

    if (level === "lad" && selectedRegion && selectedCountry) {
      var regionLads = uniqueByCouncil(ladsIn(metrics, selectedCountry, selectedRegion));
      var respondents = regionLads.filter(function (l) {
        return ((l.years["2026"] && l.years["2026"].totalHomes) || 0) > 0;
      });
      if (respondents.length) {
        var topPct = respondents.slice().sort(function (a, b) {
          return ((b.years["2026"] && b.years["2026"].pctSolar) || 0) - ((a.years["2026"] && a.years["2026"].pctSolar) || 0);
        })[0];
        pool.push({
          category: "leader",
          headline: councilLabel(topPct) + " leads the " + selectedRegion + " on solar uptake",
          detail: nfPct((topPct.years["2026"] && topPct.years["2026"].pctSolar) || 0) + " of " +
            nfInt((topPct.years["2026"] && topPct.years["2026"].totalHomes) || 0) + " homes"
        });
        var topAbsL = respondents.slice().sort(function (a, b) {
          return ((b.years["2026"] && b.years["2026"].homesSolar) || 0) - ((a.years["2026"] && a.years["2026"].homesSolar) || 0);
        })[0];
        if (topAbsL.ladCode !== topPct.ladCode) {
          pool.push({
            category: "leader",
            headline: councilLabel(topAbsL) + " has the most council homes with solar in the " + selectedRegion,
            detail: nfInt((topAbsL.years["2026"] && topAbsL.years["2026"].homesSolar) || 0) + " homes"
          });
        }
      }
      var mover = null;
      regionLads.forEach(function (l) {
        var a = l.years["2025"] ? l.years["2025"].homesSolar : null;
        var b = l.years["2026"] ? l.years["2026"].homesSolar : null;
        if (a != null && b != null) {
          var d = b - a;
          if (!mover || Math.abs(d) > Math.abs(mover.delta)) mover = { lad: l, delta: d };
        }
      });
      if (mover && mover.delta !== 0) {
        pool.push({
          category: "trend",
          headline: councilLabel(mover.lad) + " saw the biggest change since 2025",
          detail: signed(mover.delta) + " solar homes year-on-year"
        });
      }
      var rTotal = regionLads.length;
      var rNoResp = regionLads.filter(function (l) { return l.status === "no_response"; }).length;
      if (rNoResp) {
        pool.push({
          category: "coverage",
          headline: nfInt(rNoResp) + " of " + nfInt(rTotal) + " " + selectedRegion + " councils did not report their solar installations"
        });
      }
      var transferred = regionLads.filter(function (l) {
        return l.status && ["stock_transferred", "stock_transferred_unknown"].indexOf(l.status) >= 0;
      }).length;
      if (transferred) {
        pool.push({
          category: "coverage",
          headline: nfInt(transferred) + " " + selectedRegion + " councils have transferred their housing stock"
        });
      }
      var rr = metrics.regions[selectedRegion];
      if (rr && rr.years["2026"]) {
        pool.push({
          category: "scale",
          headline: selectedRegion + " tracks " + nfInt(rr.years["2026"].totalHomes || 0) +
            " council homes across " + nfInt(rr.years["2026"].authorityCount || respondents.length) + " authorities",
          detail: nfPct(rr.years["2026"].pctSolar || 0) + " have rooftop solar"
        });
      }
      return { scope: selectedRegion, insights: pool.slice(0, 3) };
    }

    return { scope: "United Kingdom", insights: [] };
  }

  var CATEGORY_LABEL = {
    leader: "Leader", trend: "Trend", coverage: "Coverage",
    scale: "Scale", epc: "EPC", status: "Status", rank: "Rank"
  };
  var LOUD = { leader: true, trend: true };

  /* ---------- state ---------- */
  var state = {
    metrics: null,
    boundaries: null,
    metric: "pctSolar",
    year: "2026",
    country: null,
    region: null
  };
  var map = null, hoveredIds = [];

  var el = {};
  function $(id) { return document.getElementById(id); }

  function level() {
    return state.region ? "lad" : state.country ? "region" : "country";
  }

  /* ---------- annotation (MapView.tsx) ---------- */
  function annotate() {
    var m = state.metrics, out = { type: "FeatureCollection", features: [] };
    var lv = level();
    state.boundaries.features.forEach(function (f) {
      var code = f.properties.code;
      var lad = m.lads[code];
      if (!lad) {
        out.features.push({
          type: "Feature", id: code, geometry: f.geometry,
          properties: { code: code, name: f.properties.name, value: null, color: NODATA_FILL, visible: 1, level: "lad" }
        });
        return;
      }
      var visible = 1;
      if (state.country && lad.country !== state.country) visible = 0;
      if (state.region && lad.region !== state.region) visible = 0;

      var value = null;
      if (lv === "country") {
        var c = lad.country ? m.countries[lad.country] : null;
        value = c && c.years[state.year] ? (c.years[state.year][state.metric] != null ? c.years[state.year][state.metric] : null) : null;
      } else if (lv === "region") {
        var r = lad.region ? m.regions[lad.region] : null;
        value = r && r.years[state.year] ? (r.years[state.year][state.metric] != null ? r.years[state.year][state.metric] : null) : null;
      } else {
        var d = lad.years[state.year];
        value = d && d[state.metric] != null ? d[state.metric] : null;
        if (value === null) {
          var df = lad.years[state.year === "2026" ? "2025" : "2026"];
          value = df && df[state.metric] != null ? df[state.metric] : null;
        }
      }
      var fill = colorFor(value, state.metric);
      // Grey is reserved for councils that did not report figures. Every other
      // documented status takes the "no stock / transferred" colour.
      if (value === null && lv === "lad" && lad.status && lad.status !== "no_response") fill = NO_STOCK_FILL;

      out.features.push({
        type: "Feature", id: code, geometry: f.geometry,
        properties: { code: code, name: f.properties.name, value: value, color: fill, visible: visible, level: lv }
      });
    });
    return out;
  }

  function bboxOf(features) {
    if (!features.length) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(c) {
      if (typeof c[0] === "number") {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
      } else for (var i = 0; i < c.length; i++) walk(c[i]);
    }
    features.forEach(function (f) { walk(f.geometry.coordinates); });
    if (!isFinite(minX)) return null;
    return [[minX, minY], [maxX, maxY]];
  }

  /* ---------- tooltip ---------- */
  function deltaCell(a, b, pp) {
    if (a == null || b == null) return { text: "—", cls: "" };
    var d = b - a;
    var sign = d > 0 ? "+" : d < 0 ? "−" : "±";
    return {
      text: sign + (pp ? Math.abs(d).toFixed(1) + " pp" : formatInt(Math.abs(d))),
      cls: d > 0 ? "up" : d < 0 ? "down" : ""
    };
  }

  function stackCell(n, p) {
    var h = '<span class="stack"><span class="num">' + esc(formatInt(n)) + "</span>";
    if (p != null) h += '<span class="p num">' + esc(formatPct(p)) + "</span>";
    return h + "</span>";
  }

  function renderTooltip(p) {
    if (!p) { el.tip.hidden = true; return; }
    var d25 = p.data2025, d26 = p.data2026;
    var has25 = !!(d25 && d25.totalHomes != null);
    var has26 = !!(d26 && d26.totalHomes != null);
    var hasAny = has25 || has26;
    var hasCouncils = !!((d25 && d25.authorityCount) || (d26 && d26.authorityCount));

    var h = '<div class="tip-head"><div><h3>' + esc(p.title) + "</h3>";
    if (p.subtitle) h += '<p class="sub">' + esc(p.subtitle) + "</p>";
    if (p.badges && p.badges.length) {
      h += '<div class="badges">' + p.badges.map(function (b) {
        return '<span class="badge' + (b.tone === "negative" ? " neg" : "") + '">' + esc(b.label) + "</span>";
      }).join("") + "</div>";
    }
    h += '</div><span class="bar"></span></div>';

    if (!hasAny) {
      h += '<div class="tip-status">';
      if (p.statusLabel) h += '<span class="lab">' + esc(p.statusLabel) + "</span>";
      h += "<p>" + esc(p.statusMessage || "Council did not report their figures.") + "</p></div>";
    } else {
      var rows = [
        { label: "Total homes", a: '<span class="num">' + esc(formatInt(d25 && d25.totalHomes)) + "</span>",
          b: '<span class="num">' + esc(formatInt(d26 && d26.totalHomes)) + "</span>",
          dx: deltaCell(d25 && d25.totalHomes, d26 && d26.totalHomes, false) },
        { label: "Homes with solar",
          a: stackCell(d25 && d25.homesSolar, d25 ? d25.pctSolar : null),
          b: stackCell(d26 && d26.homesSolar, d26 ? d26.pctSolar : null),
          dx: deltaCell(d25 && d25.homesSolar, d26 && d26.homesSolar, false) },
        { label: "Homes EPC-rated D or worse",
          a: '<span class="num">' + esc(formatPct(d25 ? d25.pctEpcDPlus : null)) + "</span>",
          b: '<span class="num">' + esc(formatPct(d26 ? d26.pctEpcDPlus : null)) + "</span>",
          dx: deltaCell(d25 && d25.pctEpcDPlus, d26 && d26.pctEpcDPlus, true) }
      ];
      if (hasCouncils) {
        rows.push({ label: "Councils",
          a: '<span class="num">' + esc(formatInt(d25 && d25.authorityCount)) + "</span>",
          b: '<span class="num">' + esc(formatInt(d26 && d26.authorityCount)) + "</span>",
          dx: { text: "—", cls: "" } });
      }
      h += '<div class="tip-body"><table><thead><tr><th>Metric</th><th class="n">2025</th>' +
        '<th class="now">2026</th><th class="n">Δ</th></tr></thead><tbody>';
      rows.forEach(function (row) {
        h += '<tr><td class="lab">' + esc(row.label) + '</td><td class="n v">' + row.a +
          '</td><td class="now">' + row.b + '</td><td class="n d ' + row.dx.cls + '"><span class="num">' +
          esc(row.dx.text) + "</span></td></tr>";
      });
      h += "</tbody></table></div>";
    }

    if (p.caveat || p.noteRollup) {
      h += '<div class="tip-notes">';
      if (p.caveat) h += '<div class="cap">Notes from council:</div><p class="it">' + esc(p.caveat) + "</p>";
      if (p.noteRollup) h += "<p>" + esc(p.noteRollup) + "</p>";
      h += "</div>";
    }
    if (has25 && !has26) {
      h += '<div class="tip-stale"><span class="cap" style="font-size:10px;letter-spacing:.12em;' +
        'text-transform:uppercase;color:var(--ember)">2025 data only</span>' +
        '<p style="margin:6px 0 0;font-size:11px;line-height:1.5;color:#6B4A3E">' +
        "No 2026 response received — figures shown are from the 2025 return.</p></div>";
    }
    h += '<div class="tip-foot"><i></i><span>Shading: <b>Reported ' + esc(state.year) + "</b> · <b>" +
      (state.metric === "pctSolar" ? "solar view" : "EPC view") + "</b></span></div>";

    el.tip.innerHTML = h;
    el.tip.hidden = false;
    placeTip(p.x, p.y);
  }

  function placeTip(cx, cy) {
    var w = el.tip.offsetWidth || 340, hh = el.tip.offsetHeight || 360, PAD = 8;
    var x = cx + 18;
    if (x + w > window.innerWidth - PAD) x = cx - w - 18;
    var y = cy - 2;
    if (y + hh > window.innerHeight - PAD) y = cy - hh + 2;
    x = Math.min(Math.max(PAD, x), window.innerWidth - w - PAD);
    y = Math.min(Math.max(PAD, y), window.innerHeight - hh - PAD);
    el.tip.style.transform = "translate3d(" + x + "px," + y + "px,0)";
  }

  function buildPayload(f, ev) {
    if (f.properties.visible === 0) return null;
    var m = state.metrics, lv = level();
    var code = f.properties.code;
    var lad = m.lads[code];

    var groupIds = [code];
    if (lv === "country" && lad && lad.country) {
      groupIds = Object.keys(m.lads).filter(function (k) { return m.lads[k].country === lad.country; });
    } else if (lv === "region" && lad && lad.region) {
      groupIds = Object.keys(m.lads).filter(function (k) { return m.lads[k].region === lad.region; });
    } else if (lv === "lad" && lad && lad.combinedWith && lad.combinedWith.length) {
      groupIds = [code].concat(lad.combinedWith);
    }

    var NI_NOTE = "All social housing in Northern Ireland is managed by the Northern Ireland Housing Executive (NIHE).";
    var payload;
    if (lv === "country") {
      var name = (lad && lad.country) || "—";
      var c = m.countries[name];
      payload = {
        title: name, subtitle: "Country aggregate",
        data2025: c ? c.years["2025"] : null, data2026: c ? c.years["2026"] : null,
        noteRollup: name === "Northern Ireland" ? NI_NOTE : null,
        x: ev.originalEvent.clientX, y: ev.originalEvent.clientY,
        drillTarget: name !== "—" ? { kind: "country", country: name } : null
      };
    } else if (lv === "region") {
      var rname = (lad && lad.region) || "—";
      var r = m.regions[rname];
      payload = {
        title: rname, subtitle: (lad && lad.country) || null,
        data2025: r ? r.years["2025"] : null, data2026: r ? r.years["2026"] : null,
        noteRollup: rname === "Northern Ireland" ? NI_NOTE : null,
        x: ev.originalEvent.clientX, y: ev.originalEvent.clientY,
        drillTarget: rname !== "—" && lad && lad.country
          ? { kind: "region", country: lad.country, region: rname } : null
      };
    } else {
      var d25 = lad ? lad.years["2025"] : null;
      var d26 = lad ? lad.years["2026"] : null;
      var dCur = state.year === "2025" ? d25 : d26;
      var statusLabel = null, statusMessage = null;
      if (lad && !((d25 && d25.totalHomes != null) || (d26 && d26.totalHomes != null))) {
        var labels = {
          no_response: "No response",
          foi_refused: "Request refused",
          no_stock: "No council housing stock",
          stock_transferred: "Stock transferred",
          stock_transferred_unknown: "Stock transferred",
          managed_by_other: "Managed by another body",
          managed_by_other_unknown: "Managed by another body",
          data_not_held: "Data not held by council"
        };
        statusLabel = (lad.status && labels[lad.status]) || "No data available";
        statusMessage = lad.statusNote || "Council did not report their figures.";
      }
      var fallbackName = f.properties.name;
      var councilName = (lad && lad.authority)
        || (lad && lad.ladName ? lad.ladName + " Council" : (fallbackName ? fallbackName + " Council" : "—"));
      payload = {
        title: councilName,
        subtitle: [lad && lad.region, lad && lad.country].filter(Boolean).join(" · ") || null,
        data2025: d25, data2026: d26,
        caveat: (dCur && dCur.note) || null,
        noteRollup: lad && lad.rollupSource ? "Aggregated under a single rollup return (e.g. GLA, NIHE)." : null,
        statusLabel: statusLabel, statusMessage: statusMessage,
        badges: lad ? getBadgesForLad(m, code) : [],
        x: ev.originalEvent.clientX, y: ev.originalEvent.clientY,
        drillTarget: null
      };
    }
    return { payload: payload, groupIds: groupIds };
  }

  /* ---------- rendering ---------- */
  function renderControls() {
    el.segMetric.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.value === state.metric));
    });
    el.segYear.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.value === state.year));
    });
  }

  function renderBreadcrumb() {
    var lv = level();
    var h = '<button type="button" data-crumb="uk">United Kingdom</button>';
    if (state.country) {
      h += '<span class="sep" aria-hidden="true">›</span>' +
        '<button type="button" data-crumb="country">' + esc(state.country) + "</button>";
    }
    if (state.region) {
      h += '<span class="sep" aria-hidden="true">›</span><span class="now">' + esc(state.region) + "</span>";
    }
    el.crumbNav.innerHTML = h;
    el.viewing.textContent = "Viewing: " + (lv === "country" ? "Country aggregates"
      : lv === "region" ? "Region aggregates" : "Local authorities");
    el.reset.hidden = !(state.country || state.region);
  }

  function renderLegend() {
    el.legendTitle.textContent = state.metric === "pctSolar"
      ? "Council Homes With Solar" : METRIC_LONG[state.metric];
    el.legendKeys.innerHTML = binLabels(state.metric).map(function (b) {
      return '<span class="key"><i style="background:' + b.color + '"></i><span>' + esc(b.label) + "</span></span>";
    }).join("");
    el.legendStatus.innerHTML =
      '<span class="key"><i style="background:' + NODATA_FILL + '"></i><span>No data reported</span></span>' +
      '<span class="key"><i style="background:' + NO_STOCK_FILL + '"></i><span>No housing stock</span></span>';
  }

  function renderInsights() {
    var got = getInsights(state.metrics, level(), state.country, state.region);
    el.scope.textContent = got.scope;
    if (!got.insights.length) {
      el.rows.innerHTML = '<p class="none">No insights available for this view.</p>';
      return;
    }
    el.rows.innerHTML = got.insights.map(function (i) {
      return '<article class="csi-row"><span class="tag' + (LOUD[i.category] ? "" : " quiet") + '">' +
        esc(CATEGORY_LABEL[i.category]) + '</span><p class="head">' + esc(i.headline) + "</p>" +
        (i.detail ? '<p class="det">' + esc(i.detail) + "</p>" : "") + "</article>";
    }).join("");
  }

  function clearHover() {
    hoveredIds.forEach(function (id) { map.setFeatureState({ source: "lads", id: id }, { hover: false }); });
    hoveredIds = [];
  }
  function applyHover(ids) {
    clearHover();
    ids.forEach(function (id) { map.setFeatureState({ source: "lads", id: id }, { hover: true }); });
    hoveredIds = ids;
  }

  function refresh(fit) {
    var data = annotate();
    var src = map.getSource("lads");
    if (src) src.setData(data);
    map.getCanvas().style.cursor = level() === "lad" ? "default" : "pointer";
    if (fit) {
      var visible = data.features.filter(function (f) { return f.properties.visible === 1; });
      var target = (state.region || state.country) ? visible : state.boundaries.features;
      var b = bboxOf(target);
      if (b) map.fitBounds(b, { padding: 40, duration: 600, maxZoom: 10 });
    }
    renderControls();
    renderBreadcrumb();
    renderLegend();
    renderInsights();
  }

  function reset() { state.country = null; state.region = null; renderTooltip(null); refresh(true); }
  function backToCountry() { state.region = null; renderTooltip(null); refresh(true); }

  /* ---------- boot ---------- */
  function initMap(ireland) {
    map = new maplibregl.Map({
      container: el.canvas,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#F8F6F2" } }]
      },
      center: [-3.5, 55.0],
      zoom: 4.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: "ONS LAD boundaries © Crown copyright & OS"
    }), "bottom-right");

    map.on("load", function () {
      map.addSource("lads", { type: "geojson", data: annotate(), promoteId: "code" });
      map.addSource("ireland", { type: "geojson", data: ireland });
      map.addLayer({
        id: "ireland-line", type: "line", source: "ireland",
        paint: { "line-color": "#4E251B", "line-width": 0.6, "line-opacity": 0.35, "line-dasharray": [2, 2] }
      });
      map.addLayer({
        id: "lads-fill", type: "fill", source: "lads",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case",
            ["==", ["get", "visible"], 0], 0.08,
            ["boolean", ["feature-state", "hover"], false], 0.95,
            0.85]
        }
      });
      map.addLayer({
        id: "lads-line", type: "line", source: "lads",
        paint: {
          "line-color": "#4E251B",
          "line-width": ["case",
            ["!=", ["get", "level"], "lad"], 0,
            ["boolean", ["feature-state", "hover"], false], 1.2,
            0.3],
          "line-opacity": ["case", ["==", ["get", "visible"], 0], 0, 0.6]
        }
      });
      wireMap();
      el.loading.hidden = true;
      // The plate is still settling when load fires, so the first fit would be
      // made against a narrower box and leave the country off to one side.
      map.resize();
      refresh(true);
      var ro = new ResizeObserver(function () {
        map.resize();
        refresh(true);
      });
      ro.observe(el.canvas);
      document.body.dataset.csiReady = "1";
    });
  }

  function wireMap() {
    map.on("mousemove", function (ev) {
      var f = map.queryRenderedFeatures(ev.point, { layers: ["lads-fill"] })[0];
      if (!f) { clearHover(); renderTooltip(null); return; }
      var r = buildPayload(f, ev);
      if (!r) { clearHover(); renderTooltip(null); return; }
      applyHover(r.groupIds);
      renderTooltip(r.payload);
    });
    var leave = function () { clearHover(); renderTooltip(null); };
    map.on("mouseleave", leave);
    map.getCanvas().addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", function () { if (document.hidden) leave(); });

    map.on("click", function (ev) {
      var f = map.queryRenderedFeatures(ev.point, { layers: ["lads-fill"] })[0];
      if (!f || f.properties.visible === 0) {
        if (state.region) backToCountry();
        else if (state.country) reset();
        return;
      }
      var lad = state.metrics.lads[f.properties.code];
      if (!lad) return;
      var lv = level();
      if (lv === "country" && lad.country) {
        state.country = lad.country;
        renderTooltip(null);
        refresh(true);
      } else if (lv === "region" && lad.region && lad.country) {
        state.country = lad.country;
        state.region = lad.region;
        renderTooltip(null);
        refresh(true);
      }
    });
  }

  /* The methodology plate. Same measured height accordion as the homepage FAQ
     in home-ui.js: set the panel to its scroll height, then let CSS carry it,
     and hand the height back to auto once the transition lands so later reflow
     is not pinned to a stale pixel value. */
  function initMethod() {
    var btn = $("csiMethodBtn");
    var panel = $("csiMethodPanel");
    var plate = btn && btn.closest(".csi-method");
    if (!btn || !panel || !plate) return;
    var reduced = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    panel.style.height = "0px";
    panel.addEventListener("transitionend", function (e) {
      if (e.propertyName === "height" && btn.getAttribute("aria-expanded") === "true") {
        panel.style.height = "auto";
      }
    });

    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      plate.classList.toggle("is-open", open);
      if (reduced) {
        // No transition to ride, so transitionend never fires and the panel
        // would stay pinned at a pixel height.
        panel.style.height = open ? "auto" : "0px";
        return;
      }
      if (open) {
        panel.style.height = panel.scrollHeight + "px";
      } else {
        panel.style.height = panel.scrollHeight + "px";
        requestAnimationFrame(function () { panel.style.height = "0px"; });
      }
    });

    // An open panel sitting at auto needs no help; one pinned to a pixel height
    // would keep a stale measurement after the text reflows.
    window.addEventListener("resize", function () {
      if (btn.getAttribute("aria-expanded") === "true") panel.style.height = "auto";
    });
  }

  function wireChrome() {
    el.segMetric.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.dataset.value === state.metric) return;
      state.metric = b.dataset.value;
      renderTooltip(null);
      refresh(false);
    });
    el.segYear.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b || b.dataset.value === state.year) return;
      state.year = b.dataset.value;
      renderTooltip(null);
      refresh(false);
    });
    el.crumbNav.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.crumb === "uk") reset();
      else backToCountry();
    });
    el.reset.addEventListener("click", reset);
  }

  function start() {
    el.canvas = $("csiCanvas");
    el.loading = $("csiLoading");
    el.failed = $("csiFailed");
    el.tip = $("csiTip");
    el.segMetric = $("csiMetric");
    el.segYear = $("csiYear");
    el.crumbNav = $("csiCrumbs");
    el.viewing = $("csiViewing");
    el.reset = $("csiReset");
    el.legendTitle = $("csiLegendTitle");
    el.legendKeys = $("csiLegendKeys");
    el.legendStatus = $("csiLegendStatus");
    el.scope = $("csiScope");
    el.rows = $("csiRows");
    el.boundaryNote = $("csiBoundary");
    wireChrome();
    initMethod();

    Promise.all([
      fetch(DATA + "metrics.json").then(function (r) { if (!r.ok) throw new Error("Failed to load metrics"); return r.json(); }),
      fetch(DATA + "lad-boundaries.geojson").then(function (r) { if (!r.ok) throw new Error("Failed to load boundaries"); return r.json(); }),
      fetch(DATA + "ireland.geojson").then(function (r) { if (!r.ok) throw new Error("Failed to load Ireland outline"); return r.json(); })
    ]).then(function (all) {
      state.metrics = all[0];
      state.boundaries = all[1];
      if (el.boundaryNote) el.boundaryNote.textContent = state.metrics.boundarySource;
      initMap(all[2]);
    }).catch(function (e) {
      el.loading.hidden = true;
      el.failed.hidden = false;
      el.failed.textContent = "Failed to load map data: " + e.message;
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
