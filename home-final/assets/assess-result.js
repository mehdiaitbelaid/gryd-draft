/* The assessment summary: every section of the result, the breakdown table, the
   25 year chart and the footnote, rendered into whatever container it is given.

   window.GrydAssessResult.render(container, result, inputs, opts)

     result  the engine's return: developerSaving, homeownerLifetimeSaving,
             co2TonnesPerYear, savingPerUnit, rows, chart, location
     inputs  the answers that produced it, for the Project Details block
     opts    {onRestart, onShare} optional. The two buttons are drawn either
             way; onShare defaults to copying a plain text summary to the
             clipboard, and returns the text it copied.

   Nothing in here names the popup, so the tools page can render the same
   summary in a page column. The chart is inline SVG in the site palette, drawn
   by hand: no chart library is loaded and nothing on it is green. */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  function money(n) { return "£" + Math.round(n).toLocaleString("en-GB"); }
  function pct(n) { return (Math.round(n * 100) / 100).toFixed(2) + "%"; }

  /* Every sentence below is the live tool's own, quoted character for character
     off gryd.energy: "Co2" for CO2, "Future homes Standard", the hyphen in
     "flat-rate", the "~£8000", the missing apostrophe in "the homes energy
     demand", the middle dots in the footnote and the band labels "1 - 2 Beds"
     and "1-2 Bed". None of it is corrected here. The site's own no dash rule
     covers the copy this project writes; it does not reach Gryd's. */
  var DEV_BENEFITS = [
    function (r) { return "You'll eliminate " + r.co2TonnesPerYear + " tonnes of Co2 per year."; },
    function (r) { return "You'll save an average " + money(r.savingPerUnit) + " per unit."; },
    function () { return "You'll meet and exceed the minimum requirements of the Future homes Standard."; },
    function () { return "You'll deliver future proofed homes that exceed buyers expectations,"
      + " differentiating you from the market and helping to accelerate sales velocity."; },
    function () { return "Battery storage provided for every home, which can reduce your grid"
      + " connection capacity requirements."; }
  ];

  var HOME_BENEFITS = [
    "The homeowner will enjoy a simple flat-rate subscription, fixed with no hidden costs"
      + " for the life of the system.",
    "Their monthly rate includes all servicing, maintenance and replacement parts, helping"
      + " them save an additional ~£8000 in upkeep costs.",
    "The system will serve 70%+ of the homes energy demand, shielding the homeowner"
      + " from volatile energy prices."
  ];

  var FOOTNOTE = "*Calculation based on MCS standard method · Assumed roof pitch of 35 degrees"
    + " · 25 year system lifetime · Forecast electricity prices from GOV.UK";

  /* Orientation is not a row any more: the questions stopped asking which way
     the roofs face, so the summary stops reporting an answer nobody gave. The
     energy type stays, the way the live tool's own Project Details carries it,
     and every scheme now reads All Electric. */
  function detailRows(result, inputs) {
    var s = inputs.split || { small: 0, mid: 0, large: 0 };
    var split = "1-2 Bed - " + s.small + "%, 3-4 Bed - " + s.mid + "%, 5+ Bed - " + s.large + "%";
    var loc = result.location || {};
    return [
      ["Homes count", String(inputs.homes)],
      ["Location", [loc.postcode, loc.town].filter(Boolean).join(", ")],
      ["Home size split", split],
      ["Energy type", inputs.energy || ""]
    ];
  }

  /* The chart. Two stacked bars per year, the flat subscription under the
     retailer bill that is left, and over them the line the same home would have
     paid with no system at all. Everything is laid out in the viewBox, so the
     figure scales with its column and never needs a resize listener. */
  var W = 760, PAD_L = 64, PAD_R = 12, PAD_T = 14, PAD_B = 38;

  /* The plot is a fixed number of pixels tall in each shell, so a wider column
     widens the chart and never makes it taller: the sections under it stay put.
     260 in the popup, where the box has a scroll of its own to spend, 320 in
     the page column. */
  var PLOT_H = { popup: 260, page: 320 };

  /* The axis follows the data. It stops at the first £500 above the tallest
     value on the run, in £500 steps while that is £3,000 or less and £1,000
     steps above it, so a gas scheme keeps a fine ladder and an all electric
     5+ bed run tops out at £5,000 rather than a decorative £8,000. */
  function axisStep(raw) { return Math.ceil(raw / 500) * 500 <= 3000 ? 500 : 1000; }

  function axisTop(raw) {
    var step = axisStep(raw);
    return Math.max(step, Math.ceil(raw / step) * step);
  }

  function chartSvg(c, plotH) {
    var n = c.years.length;
    var H = plotH + PAD_T + PAD_B;
    var plotW = W - PAD_L - PAD_R;
    var top = 0;
    for (var i = 0; i < n; i++) {
      top = Math.max(top, c.without[i], c.subscription[i] + c.retailer[i]);
    }
    var max = axisTop(top);
    var tickStep = axisStep(top);
    var step = plotW / n;
    var bw = Math.max(6, step * 0.62);
    var y = function (val) { return PAD_T + plotH - (val / max) * plotH; };
    var cx = function (i) { return PAD_L + step * i + step / 2; };

    var ticks = "";
    for (var t = 0; t <= max + 0.5; t += tickStep) {
      ticks += '<line class="ar-grid" x1="' + PAD_L + '" x2="' + (W - PAD_R)
        + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/>'
        + '<text class="ar-ytick" x="' + (PAD_L - 10) + '" y="' + (y(t) + 4).toFixed(1)
        + '" text-anchor="end">£' + Math.round(t).toLocaleString("en-GB") + "</text>";
    }

    var bars = "";
    for (var k = 0; k < n; k++) {
      var x = cx(k) - bw / 2;
      var sub = c.subscription[k], ret = c.retailer[k];
      var ySub = y(sub), yTop = y(sub + ret);
      bars += '<g class="ar-bar" data-year="' + c.years[k] + '" tabindex="0"'
        + ' aria-label="Year ' + c.years[k] + '">'
        + '<rect class="ar-hit" x="' + (cx(k) - step / 2).toFixed(1) + '" y="' + PAD_T
        + '" width="' + step.toFixed(1) + '" height="' + plotH + '"/>'
        + '<rect class="ar-sub" x="' + x.toFixed(1) + '" y="' + ySub.toFixed(1)
        + '" width="' + bw.toFixed(1) + '" height="' + (PAD_T + plotH - ySub).toFixed(1) + '"/>'
        + '<rect class="ar-ret" x="' + x.toFixed(1) + '" y="' + yTop.toFixed(1)
        + '" width="' + bw.toFixed(1) + '" height="' + (ySub - yTop).toFixed(1) + '"/>'
        + "</g>";
    }

    var line = c.without.map(function (val, i) {
      return (i ? "L" : "M") + cx(i).toFixed(1) + " " + y(val).toFixed(1);
    }).join(" ");
    var area = line + " L" + cx(n - 1).toFixed(1) + " " + (PAD_T + plotH)
      + " L" + cx(0).toFixed(1) + " " + (PAD_T + plotH) + " Z";

    var xticks = "";
    [0, 4, 9, 14, 19, 24].forEach(function (i) {
      xticks += '<text class="ar-xtick" x="' + cx(i).toFixed(1) + '" y="' + (H - 14)
        + '" text-anchor="middle">' + c.years[i] + "</text>";
    });

    return '<div class="ar-chart" data-chart>'
      + '<div class="ar-chart-head"><div><h4>Annual energy cost over 25 years</h4>'
      + '<p class="ar-chart-caption">Annual costs with and without Gryd across the full 25 year system lifetime.</p></div>'
      + '<ul class="ar-key"><li><span class="k k-sub"></span>Gryd Subscription</li>'
      + '<li><span class="k k-ret"></span>Remaining Traditional Retailer Bill</li>'
      + '<li><span class="k k-out"></span>Annual Energy Cost without Gryd</li></ul></div>'
      + '<div class="ar-chart-plot" data-plot-left="' + PAD_L + '" data-plot-w="' + W + '" data-plot-h="' + H + '">'
      + '<svg viewBox="0 0 ' + W + " " + H + '" role="img"'
      + ' preserveAspectRatio="xMidYMid meet" style="height:' + H + 'px"'
      + ' aria-label="Annual energy cost by year, with and without Gryd">'
      + '<text class="ar-axis" transform="translate(12 ' + (PAD_T + plotH / 2)
      + ') rotate(-90)" text-anchor="middle">Annual Energy Cost (£)</text>'
      + ticks
      + '<path class="ar-out-fill" d="' + area + '"/>'
      + '<path class="ar-out-line" d="' + line + '"/>'
      + bars + xticks
      + '<text class="ar-axis" x="' + (PAD_L + plotW / 2) + '" y="' + (H - 1)
      + '" text-anchor="middle">Year</text>'
      + "</svg>"
      + '<div class="ar-tip" data-tip hidden></div></div></div>';
  }

  function summaryText(result, inputs) {
    var lines = detailRows(result, inputs).map(function (r) { return r[0] + ": " + r[1]; });
    lines.unshift("Gryd site assessment summary");
    lines.push("As a Developer, working with Gryd, you could save " + money(result.developerSaving)
               + " in build cost");
    lines.push("The Homeowner will enjoy cheaper cleaner energy, saving up to "
               + money(result.homeownerLifetimeSaving) + " over the systems lifetime");
    return lines.join("\n");
  }

  function render(container, result, inputs, opts) {
    opts = opts || {};
    container.classList.add("ar-root");
    var plotH = (container.closest && container.closest(".sam")) ? PLOT_H.popup : PLOT_H.page;

    var details = detailRows(result, inputs).map(function (r) {
      return '<div class="ar-detail"><dt>' + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>";
    }).join("");

    var dev = DEV_BENEFITS.map(function (f) {
      return '<li><span class="ar-glyph" aria-hidden="true"></span>'
        + "<span>" + esc(f(result)) + "</span></li>";
    }).join("");
    var home = HOME_BENEFITS.map(function (t) {
      return '<li><span class="ar-glyph" aria-hidden="true"></span><span>' + esc(t) + "</span></li>";
    }).join("");

    var rows = (result.rows || []).map(function (r) {
      return "<tr><td>" + esc(r.band) + "</td><td>" + esc(r.subscription) + "</td><td>"
        + money(r.lifetimeSaving) + "</td><td>" + pct(r.lifetimePct) + "</td><td>"
        + esc(r.hardware) + "</td></tr>";
    }).join("");

    container.innerHTML = '<h2 class="ar-title">Assessment Summary</h2>'

      + '<section class="ar-sec ar-project" data-sec="details"><h3>Project Details</h3>'
      + '<dl class="ar-details">' + details + "</dl></section>"

      /* The chart is the view. The two figures ride across the top of the same
         card as plates, in the flow above the chart head, so no bar, line,
         legend, tick or tooltip can ever end up underneath them. */
      + '<div class="ar-chartcard">'
      + '<section class="ar-sec ar-pins" data-sec="results"><h3 class="ar-sr">Results</h3>'
      + '<div class="ar-plates"><article class="ar-stat ar-pin">'
      + '<span class="ar-fig" data-dev>' + money(result.developerSaving) + "</span>"
      + '<p>As a Developer, working with Gryd, you could save ' + money(result.developerSaving)
      + " in build cost</p></article>"
      + '<article class="ar-stat ar-pin"><span class="ar-fig" data-home>'
      + money(result.homeownerLifetimeSaving) + "</span>"
      + '<p>The Homeowner will enjoy cheaper cleaner energy, saving up to '
      + money(result.homeownerLifetimeSaving) + " over the systems lifetime</p></article></div></section>"
      + '<section class="ar-sec ar-chart-sec" data-sec="chart">' + chartSvg(result.chart, plotH)
      + "</section></div>"

      + '<section class="ar-sec" data-sec="table"><h3>Breakdown by House Size</h3>'
      + '<div class="ar-table-wrap"><table class="ar-table"><thead><tr>'
      + "<th>Home Size</th><th>Monthly Subscription</th><th>Lifetime Saving (£)</th>"
      + "<th>Lifetime Saving (%)</th><th>Hardware Supplied</th></tr></thead><tbody>"
      + rows + "</tbody></table></div></section>"

      + '<details class="ar-sec ar-fold" data-sec="dev"><summary>'
      + "<h3>Developer additional benefits</h3><span class=\"ar-show\">Show</span></summary>"
      + '<ul class="ar-list">' + dev + "</ul></details>"

      + '<details class="ar-sec ar-fold" data-sec="home"><summary>'
      + "<h3>Homeowner additional benefits</h3><span class=\"ar-show\">Show</span></summary>"
      + '<ul class="ar-list">' + home + "</ul></details>"

      + '<p class="ar-foot">' + esc(FOOTNOTE) + "</p>"
      + '<div class="ar-acts"><button type="button" class="btn ar-btn" data-restart>Start Over</button>'
      + '<button type="button" class="btn ghost ar-btn ar-btn-quiet" data-share>Share</button>'
      + '<span class="ar-said" data-said role="status"></span></div>';

    var resultBox = container.closest ? container.closest(".sam-box") : null;
    if (resultBox) { resultBox.classList.add("sam-result-box"); }

    var tip = container.querySelector("[data-tip]");
    var c = result.chart;
    function showTip(g) {
      var i = c.years.indexOf(parseInt(g.getAttribute("data-year"), 10));
      if (i < 0) { return; }
      tip.innerHTML = "<b>Year " + c.years[i] + "</b><br>Gryd Subscription "
        + money(c.subscription[i]) + "<br>Remaining Traditional Retailer Bill "
        + money(c.retailer[i]) + "<br>Without Gryd " + money(c.without[i]);
      tip.hidden = false;
      /* The tooltip is measured against the drawing itself, not its box, so it
         stays inside the plotting rectangle on a narrow screen where the chart
         is wider than the column and scrolls. */
      var plotEl = container.querySelector(".ar-chart-plot");
      var svg = plotEl.querySelector("svg");
      var plot = plotEl.getBoundingClientRect();
      var draw = svg.getBoundingClientRect();
      var r = g.getBoundingClientRect();
      /* The drawing keeps its aspect inside a box of fixed height, so it can
         be narrower than the svg element and centred in it. Both the scale and
         the left edge come from the drawn content, not the element. */
      var vw = parseFloat(plotEl.getAttribute("data-plot-w"));
      var vh = parseFloat(plotEl.getAttribute("data-plot-h"));
      var scale = Math.min(draw.width / vw, draw.height / vh);
      var inset = (draw.width - vw * scale) / 2;
      var origin = draw.left - plot.left + plotEl.scrollLeft + inset;
      var wide = tip.getBoundingClientRect().width || 190;
      var min = origin + parseFloat(plotEl.getAttribute("data-plot-left")) * scale + 4;
      var max = Math.max(min, origin + vw * scale - wide - 8);
      var want = r.left - plot.left + plotEl.scrollLeft - 60;
      tip.style.left = Math.max(min, Math.min(max, want)) + "px";
    }
    [].slice.call(container.querySelectorAll(".ar-bar")).forEach(function (g) {
      g.addEventListener("mouseenter", function () { showTip(g); });
      g.addEventListener("focus", function () { showTip(g); });
      g.addEventListener("mouseleave", function () { tip.hidden = true; });
      g.addEventListener("blur", function () { tip.hidden = true; });
    });

    var said = container.querySelector("[data-said]");
    container.querySelector("[data-restart]").addEventListener("click", function () {
      if (resultBox) { resultBox.classList.remove("sam-result-box"); }
      if (opts.onRestart) { opts.onRestart(); }
    });
    container.querySelector("[data-share]").addEventListener("click", function () {
      var text = summaryText(result, inputs);
      if (opts.onShare) { opts.onShare(text); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          said.textContent = "Share link has been copied";
        }, function () { said.textContent = "Copy it from the page"; });
      } else {
        said.textContent = "Copy it from the page";
      }
      return text;
    });

    return { text: summaryText(result, inputs) };
  }

  window.GrydAssessResult = { render: render, summaryText: summaryText };
})();
