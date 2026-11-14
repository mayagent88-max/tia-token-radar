// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, a per-protocol detail
// view with the model's own breakdown and the protocol's farm plan, the
// calibration chart the value model is fitted on, the coverage trail, the
// set-aside list, and the live-token view set aside from the ranking.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, minImp: 0, verdict: 'all', growth: 'all', age: 'all', watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model in one function, mirroring lib/model.ts impliedValue: the page
  // recomputes a row from the snapshot figures and checks the number
  // board.json carries, so the page's code and the board's data are visibly
  // the same arithmetic. No protocol name is special-cased.
  function catAdjOf(row, model) {
    var m = model.category_multiples[row.category] !== undefined ? model.category_multiples[row.category] : model.default_multiple;
    return m / model.flat_reference;
  }
  function growthOf(row, model) {
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d));
    return g >= 0 ? 1 + (g / 100) * model.growth_up_weight : 1 + (g / 100) * model.growth_down_weight;
  }
  function chainOf(row, model) {
    return 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap) * model.chain_step;
  }
  function maturityOf(row, model) {
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    return model.maturity_floor + model.maturity_range * Math.sqrt(Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days);
  }
  function baseOf(row, cal) { return cal.k * Math.pow(row.tvl_usd, cal.slope); }
  function impliedOf(row, model, cal) {
    return Math.max(1, Math.round(baseOf(row, cal) * catAdjOf(row, model) * chainOf(row, model) * growthOf(row, model) * maturityOf(row, model)));
  }
  function rangeOf(row, model, cal) {
    var v = impliedOf(row, model, cal);
    return { low: Math.max(1, Math.round(v / cal.band_factor)), high: Math.max(v + 1, Math.round(v * cal.band_factor)) };
  }
  function verdictOf(row, model, cal) {
    var v = impliedOf(row, model, cal);
    var g = row.change_7d === null || row.change_7d === undefined ? 0 : Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d));
    if (v < model.verdict_min_implied_usd) return { verdict: 'skip', reason: 'implied value under $' + Math.round(model.verdict_min_implied_usd / 1e6) + 'M' };
    if (g < model.verdict_min_growth_pct) return { verdict: 'skip', reason: 'TVL falling ' + g.toFixed(1) + '% over 7 days' };
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    if (age < model.verdict_min_age_days) return { verdict: 'skip', reason: 'listed under ' + model.verdict_min_age_days + ' days ago' };
    return { verdict: 'worth it', reason: 'implied value, momentum and age all clear the bar' };
  }
  function capitalFor(row) {
    if (row.tvl_usd >= 5000000000) return 250;
    if (row.tvl_usd >= 1000000000) return 150;
    if (row.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdFor(row) {
    var age = row.age_days === null || row.age_days === undefined ? null : row.age_days;
    if (age === null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function farmCostOf(row, model) {
    var capital = capitalFor(row);
    var setup = capital >= model.gas_setup_large_capital_usd ? model.gas_setup_large_usd : model.gas_setup_small_usd;
    return capital + setup + model.gas_weekly_usd * Math.ceil(holdFor(row) / 7);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('min')) state.minTvl = Number(params.get('min')) || 0;
    if (params.get('minImp')) state.minImp = Number(params.get('minImp')) || 0;
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('growth')) state.growth = params.get('growth');
    if (params.get('age')) state.age = params.get('age');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('tab') === 'live' || params.get('tab') === 'set-aside') state.tab = params.get('tab');
    if (params.get('detail')) state.selected = params.get('detail');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('min', String(state.minTvl));
    if (state.minImp) params.set('minImp', String(state.minImp));
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.growth !== 'all') params.set('growth', state.growth);
    if (state.age !== 'all') params.set('age', state.age);
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab === 'live' || state.tab === 'set-aside') params.set('tab', state.tab);
    if (state.selected) params.set('detail', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (r.implied_value_usd < state.minImp) return false;
      if (state.verdict !== 'all' && r.farm_verdict !== state.verdict) return false;
      if (state.growth === 'rising' && !(r.change_7d !== null && r.change_7d >= 0)) return false;
      if (state.growth === 'falling' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (state.age === 'new' && !((r.age_days === null ? 365 : r.age_days) < 90)) return false;
      if (state.age === 'established' && !((r.age_days === null ? 365 : r.age_days) >= 90)) return false;
      if (state.watchOnly && !r.watch) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'low') { av = a.implied_low_usd; bv = b.implied_low_usd; }
      else if (key === 'high') { av = a.implied_high_usd; bv = b.implied_high_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else if (key === 'cost') { av = a.farm_cost_usd; bv = b.farm_cost_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var list = sortedRows(rows());
    var head = ['rank', 'name', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d_pct', 'age_days', 'implied_value_usd', 'implied_low_usd', 'implied_high_usd', 'farm_cost_usd', 'farm_hold_days', 'farm_verdict', 'farm_verdict_reason', 'watchlist'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      lines.push([
        r.rank, r.name, r.slug, r.category || '', (r.chains || []).join('|'), r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days,
        r.implied_value_usd, r.implied_low_usd, r.implied_high_usd,
        r.farm_cost_usd, r.farm_hold_days, r.farm_verdict, r.farm_verdict_reason, r.watch ? 'yes' : 'no'
      ].map(csvCell).join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-radar-3.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR · radar-3' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function trail() {
    var t = DATA.trail;
    function step(n, label) { return el('div', { class: 'trail-step' }, el('b', { class: 'num', text: String(n) }), el('span', { text: label })); }
    return el('section', { class: 'trail', 'aria-label': 'Coverage trail' },
      step(t.tracked, 'tracked in the snapshot'),
      el('span', { class: 'trail-arrow', 'aria-hidden': 'true', text: '→' }),
      step(t.has_token, 'already have a token'),
      el('span', { class: 'trail-arrow', 'aria-hidden': 'true', text: '→' }),
      step(t.set_aside, 'set aside — not clean launches'),
      el('span', { class: 'trail-arrow', 'aria-hidden': 'true', text: '→' }),
      step(t.ranked, 'ranked on this board')
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.board_size + ' clean pre-token launches, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds every other clean pre-token protocol, whatever its size — the launches the floor would miss. Implied value is a power law fitted on the tokens that already trade, and every row carries its range and its farm verdict. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Worth farming' }), el('b', { text: String(DATA.worth_it_count) + ' of ' + DATA.board_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_total) }))
      )
    );
  }

  function calibrationChart() {
    var cal = DATA.calibration;
    var W = 560, H = 340, PL = 52, PR = 34, PT = 14, PB = 52;
    var xs = cal.points.map(function (p) { return p[0]; });
    var ys = cal.points.map(function (p) { return p[1]; });
    var x0 = Math.floor(Math.min.apply(null, xs) - 0.3), x1 = Math.ceil(Math.max.apply(null, xs) + 0.3);
    var y0 = Math.floor(Math.min.apply(null, ys) - 0.3), y1 = Math.ceil(Math.max.apply(null, ys) + 0.3);
    function X(v) { return PL + ((v - x0) / (x1 - x0)) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB); }
    function tickLabel(v, isUsd) {
      if (!isUsd) return v;
      var usd10 = Math.pow(10, v);
      if (usd10 >= 1e9) return '$' + (usd10 / 1e9) + 'B';
      if (usd10 >= 1e6) return '$' + (usd10 / 1e6) + 'M';
      if (usd10 >= 1e3) return '$' + (usd10 / 1e3) + 'K';
      return '$' + usd10;
    }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Calibration scatter: log market cap against log TVL for the live-token protocols, with the fitted power-law line">';
    for (var gx = x0; gx <= x1; gx++) {
      svg += '<line x1="' + X(gx).toFixed(1) + '" y1="' + Y(y0).toFixed(1) + '" x2="' + X(gx).toFixed(1) + '" y2="' + Y(y1).toFixed(1) + '" stroke="#22314a" stroke-width="1"/>';
      svg += '<text x="' + X(gx).toFixed(1) + '" y="' + (H - 28) + '" fill="#93a3b8" font-size="11" text-anchor="middle">' + tickLabel(gx, true) + '</text>';
    }
    for (var gy = y0; gy <= y1; gy++) {
      svg += '<line x1="' + X(x0).toFixed(1) + '" y1="' + Y(gy).toFixed(1) + '" x2="' + X(x1).toFixed(1) + '" y2="' + Y(gy).toFixed(1) + '" stroke="#22314a" stroke-width="1"/>';
      svg += '<text x="' + (PL - 8) + '" y="' + (Y(gy) + 4).toFixed(1) + '" fill="#93a3b8" font-size="11" text-anchor="end">' + tickLabel(gy, true) + '</text>';
    }
    svg += '<text x="' + ((W - PL - PR) / 2 + PL).toFixed(1) + '" y="' + (H - 8) + '" fill="#93a3b8" font-size="11" text-anchor="middle">TVL (log scale) →</text>';
    cal.points.forEach(function (p) {
      svg += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.6" fill="#2fd6a3" fill-opacity="0.75"/>';
    });
    var lx0 = X(x0), ly0 = Y(cal.intercept + cal.slope * x0), lx1 = X(x1), ly1 = Y(cal.intercept + cal.slope * x1);
    svg += '<line x1="' + lx0.toFixed(1) + '" y1="' + ly0.toFixed(1) + '" x2="' + lx1.toFixed(1) + '" y2="' + ly1.toFixed(1) + '" stroke="#f5b94e" stroke-width="2"/>';
    svg += '</svg>';
    return el('div', { class: 'chart', html: svg });
  }

  function calibrationPanel() {
    var cal = DATA.calibration;
    var m = DATA.model;
    return el('section', { class: 'panel model calib' },
      el('h2', { text: 'How implied value is calibrated — power law radar-3' }),
      el('p', { class: 'sub', text: 'The scale comes from the tokens that already trade, not from a hand-picked multiple. A log-log regression of market cap on TVL over ' + cal.n + ' live-token protocols (market cap at least $' + Math.round(m.calibration_min_mcap_usd / 1e3) + 'K, exchange venues excluded) gives the line below. A protocol ten times the TVL is worth about 10^' + cal.slope.toFixed(2) + ' = ' + Math.pow(10, cal.slope).toFixed(1) + 'x as much — not ten times as much.' }),
      el('div', { class: 'formula' }, 'mcap = ' + cal.k.toLocaleString('en-US') + ' x TVL^' + cal.slope.toFixed(4) + '      →      implied = round( ' + cal.k.toLocaleString('en-US') + ' x TVL^' + cal.slope.toFixed(4) + ' x categoryAdj x chainMult x growthMult x maturityMult )'),
      el('p', { class: 'sub', text: 'Chart: each dot is one live-token protocol — market cap (vertical, log scale) against TVL (horizontal, log scale) — and the amber line is the fitted power law.' }),
      calibrationChart(),
      el('div', { class: 'cal-stats' },
        el('div', { class: 'fact' }, el('span', { text: 'Calibration protocols' }), el('b', { text: String(cal.n) })),
        el('div', { class: 'fact' }, el('span', { text: 'Exponent (slope)' }), el('b', { text: String(cal.slope) })),
        el('div', { class: 'fact' }, el('span', { text: 'Scale k' }), el('b', { text: cal.k.toLocaleString('en-US') })),
        el('div', { class: 'fact' }, el('span', { text: 'R² — variance TVL explains' }), el('b', { text: (cal.r2 * 100).toFixed(1) + '%' })),
        el('div', { class: 'fact' }, el('span', { text: 'Residual spread (σ, dex)' }), el('b', { text: String(cal.sigma_full) })),
        el('div', { class: 'fact' }, el('span', { text: '80% range band' }), el('b', { text: '÷/× ' + String(cal.band_factor) }))
      ),
      el('p', { class: 'sub', text: 'Honest limits: TVL explains only ' + (cal.r2 * 100).toFixed(1) + '% of log market-cap variance, so the range on every row is wide — about ÷/× ' + String(cal.band_factor) + ' at 80%. Live tokens sit on average ' + Math.pow(10, cal.residual_mean).toFixed(2) + 'x above the adjusted prediction, so the adjustments are conservative rather than generous. The fit is recomputed from the snapshot on every run' + (cal.fitted ? '' : ' — this run used the fallback constants fitted on the 2026-11-14 snapshot') + '.' })
    );
  }

  function optionList(values, current, allLabel) {
    var opts = [el('option', { value: 'all', text: allLabel })];
    values.forEach(function (v) { opts.push(el('option', { value: v, text: v, selected: v === current ? 'selected' : null })); });
    return opts;
  }
  function selectOptions(pairs, current) {
    return pairs.map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: String(current) === String(o[0]) ? 'selected' : null }); });
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' }, optionList(categories, state.category, 'All categories'));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' }, optionList(chains, state.chain, 'All chains'));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var minSel = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' }, selectOptions(
      [[0, 'Any TVL'], [5000000, 'TVL $5M+'], [50000000, 'TVL $50M+'], [100000000, 'TVL $100M+'], [500000000, 'TVL $500M+'], [1000000000, 'TVL $1B+']], state.minTvl));
    minSel.addEventListener('change', function () { state.minTvl = Number(minSel.value); writeHash(); render(); });
    var minImpSel = el('select', { id: 'minImp', 'aria-label': 'Minimum implied value' }, selectOptions(
      [[0, 'Any implied value'], [1000000, 'Implied $1M+'], [5000000, 'Implied $5M+'], [10000000, 'Implied $10M+'], [25000000, 'Implied $25M+'], [50000000, 'Implied $50M+']], state.minImp));
    minImpSel.addEventListener('change', function () { state.minImp = Number(minImpSel.value); writeHash(); render(); });
    var verdictSel = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' }, selectOptions(
      [['all', 'Any verdict'], ['worth it', 'Worth farming'], ['skip', 'Skip']], state.verdict));
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; writeHash(); render(); });
    var growthSel = el('select', { id: 'growth', 'aria-label': 'Filter by 7-day growth' }, selectOptions(
      [['all', 'Any momentum'], ['rising', 'Rising (7d ≥ 0)'], ['falling', 'Falling (7d < 0)']], state.growth));
    growthSel.addEventListener('change', function () { state.growth = growthSel.value; writeHash(); render(); });
    var ageSel = el('select', { id: 'age', 'aria-label': 'Filter by age' }, selectOptions(
      [['all', 'Any age'], ['new', 'New (< 90 days)'], ['established', 'Established (90 days+)']], state.age));
    ageSel.addEventListener('change', function () { state.age = ageSel.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var setAside = el('button', { type: 'button', 'aria-pressed': state.tab === 'set-aside' ? 'true' : 'false', text: 'Set aside', onclick: function () { state.tab = 'set-aside'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var csvBtn = el('button', { class: 'button', type: 'button', text: 'Export CSV', onclick: exportCsv });
    var countText = state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : state.tab === 'set-aside' ? DATA.set_aside.length + ' set-aside records shown' : DATA.live.length + ' live-token protocols shown';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Min TVL' }), minSel),
      el('div', { class: 'field' }, el('label', { for: 'minImp', text: 'Min implied' }), minImpSel),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdictSel),
      el('div', { class: 'field' }, el('label', { for: 'growth', text: 'Momentum' }), growthSel),
      el('div', { class: 'field' }, el('label', { for: 'age', text: 'Age' }), ageSel),
      el('label', { class: 'check', for: 'watch' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, setAside, live)),
      csvBtn,
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain, verdict or value floor to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.minImp = 0; state.verdict = 'all'; state.growth = 'all'; state.age = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + ((r.chains.length > 3) ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('div', null,
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'sub range', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) })
          )
        )),
        el('td', null, el('div', { class: 'farm-cell' },
          el('span', { class: 'num', text: '$' + r.farm_cost_usd + ' · ' + r.farm_hold_days + 'd' }),
          el('span', { class: r.farm_verdict === 'worth it' ? 'verdict worth' : 'verdict skip', text: r.farm_verdict })
        )),
        el('td', null, el('span', { class: r.watch ? 'badge watch' : 'badge', text: r.watch ? 'watchlist · no token' : 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Clean pre-token launches, strongest implied value first. Each row shows its 80% range and its farm verdict — cost, hold and worth-it-or-skip. Select a row for its model breakdown, live-token comparison and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value · 80% range'),
            sortHeader('cost', 'Farm · verdict'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function setAsideTable() {
    var tbody = el('tbody');
    DATA.set_aside.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: '—' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { colspan: '2', text: r.reason }),
        el('td', null, el('span', { class: 'badge', text: 'set aside' }))
      ));
    });
    var reasons = DATA.trail.set_aside_reasons.map(function (x) { return x.reason.split(' — ')[0] + ': ' + x.count; }).join(' · ');
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token records set aside from the ranking: ' + reasons + '. They record no token, but they are not clean launches — a versioned pool, a wrapped or staked receipt, a bridge, an exchange venue or an exchange-borrowed name — so ranking them would rank the wrong thing.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Why it is set aside', colspan: '2' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: (r.mcap_usd && r.tvl_usd) ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a' }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparison set for every implied value, and the calibration set for the power law.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var tableRows = Object.keys(m.category_multiples).sort(function (a, b) { return m.category_multiples[b] - m.category_multiples[a] || (a < b ? -1 : 1); }).map(function (cat) {
      return el('tr', null, el('td', { text: cat }), el('td', { text: (m.category_multiples[cat] / m.flat_reference).toFixed(2) + 'x' }));
    });
    tableRows.push(el('tr', null, el('td', { text: 'Any other category (default)' }), el('td', { text: (m.default_multiple / m.flat_reference).toFixed(2) + 'x' })));
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — model radar-3' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( ' + cal.k.toLocaleString('en-US') + ' x TVL^' + cal.slope.toFixed(4) + ' x categoryAdj x (1 + 0.03 x min(chains - 1, 10)) x growthMult x (0.55 + 0.45 x sqrt(min(age_days, 1460) / 1460)) )'
      ),
      el('p', { class: 'sub', text: 'The power law is fitted on the ' + cal.n + ' live-token protocols (see the calibration chart above): mcap = ' + cal.k.toLocaleString('en-US') + ' x TVL^' + cal.slope.toFixed(4) + ', R² ' + (cal.r2 * 100).toFixed(1) + '%. Growth is asymmetric: gains use 1 + clamp(g, 0, 120)/100 x 0.55, losses use 1 + clamp(g, -60, 0)/100 x 1.00 — a falling TVL is punished about twice as hard as a rising one is rewarded. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknown_age_days + ' days. The range on every row is the 80% prediction interval of the calibration: implied ÷/× ' + String(cal.band_factor) + ' (residual σ ' + String(cal.sigma_full) + ' dex).' }),
      el('h3', { text: 'Category adjustment, centred on the flat 0.21x the old board kept' }),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Adjustment' }))),
        el('tbody', null, tableRows)
      ),
      el('h3', { text: 'Farm verdict — worth it or skip, from the row\u2019s own figures' }),
      el('p', { class: 'sub', text: 'Worth it only when all three hold: implied value at least $' + Math.round(m.verdict_min_implied_usd / 1e6) + 'M, 7-day TVL change no worse than ' + m.verdict_min_growth_pct + '%, and listed at least ' + m.verdict_min_age_days + ' days (unknown age counts as ' + m.unknown_age_days + ' days). Anything else is skip, with the binding reason named on the row. Farm cost is the capital the plan needs ($50–$250 by TVL) plus gas: $' + m.gas_setup_small_usd + ' to set up ($' + m.gas_setup_large_usd + ' for a $' + m.gas_setup_large_capital_usd + '+ position) and $' + m.gas_weekly_usd + ' a week for the hold.' }),
      el('p', { class: 'sub', text: 'Why the table looks like this: a vault, curator or lending book earns fees on money that stays, so it keeps more value per TVL dollar than the average; a bridge, a staking receipt or an exchange venue mostly passes value through, so it keeps less. The board ranks only clean launches; the ' + DATA.trail.set_aside + ' records that are not clean are set aside with their reasons instead of being discounted into the ranking. The board never claims a protocol has no token, only that its record carries none. Nothing here predicts whether or when a token launches.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function comparables(row) {
    var same = DATA.live.filter(function (l) { return l.category === row.category && l.mcap_usd !== null && l.tvl_usd > 0; })
      .sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
    var ratios = same.map(function (l) { return l.mcap_usd / l.tvl_usd; }).sort(function (a, b) { return a - b; });
    var median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
    var mine = row.implied_value_usd / row.tvl_usd;
    var rows = same.slice(0, 3).map(function (l) {
      return el('div', null, el('span', { text: l.name + ' (live)' }), el('b', { class: 'num', text: fmtUsd(l.mcap_usd) + ' · ' + (l.mcap_usd / l.tvl_usd).toFixed(2) + 'x TVL' }));
    });
    if (rows.length === 0) rows.push(el('div', null, el('span', { text: 'No live-token protocol in this category is in the top ' + DATA.live_size + ' by market cap.' })));
    return el('section', { class: 'detail-section' },
      el('h3', { text: 'Live-token comparison' }),
      el('div', { class: 'comp' }, rows),
      el('p', { class: 'sub', text: 'This row implies ' + mine.toFixed(2) + 'x its TVL' + (median !== null ? ', against a ' + median.toFixed(2) + 'x median market-cap/TVL for live ' + (row.category || 'Other') + ' protocols.' : '. No live median exists for this category in the top ' + DATA.live_size + '.') + ' The live set is the market talking; the implied value is the model answering.' })
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps || [];
    var recomputed = impliedOf(row, DATA.model, DATA.calibration);
    var range = rangeOf(row, DATA.model, DATA.calibration);
    var verdict = verdictOf(row, DATA.model, DATA.calibration);
    var cost = farmCostOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watch ? ' · WATCHLIST' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Power-law base (' + DATA.calibration.k.toLocaleString('en-US') + ' x TVL^' + DATA.calibration.slope.toFixed(4) + ')' }), el('b', { class: 'num', text: fmtUsd(row.power_law_base_usd) })),
        el('div', null, el('span', { text: 'Category adjustment (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: 'x' + fmtMult(row.category_adjustment) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: 'x' + fmtMult(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → x' + fmtMult(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → x' + fmtMult(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: '80% range (÷/× ' + String(DATA.calibration.band_factor) + ')' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + ' (range ' + fmtUsd(range.low) + ' – ' + fmtUsd(range.high) + ')' + (recomputed === row.implied_value_usd && range.low === row.implied_low_usd && range.high === row.implied_high_usd ? ', the same numbers board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price. The protocol records no token; that is the record, not proof it has none.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict' }),
      el('div', { class: 'verdict-box ' + (row.farm_verdict === 'worth it' ? 'worth' : 'skip') },
        el('b', { text: row.farm_verdict === 'worth it' ? 'Worth farming' : 'Skip' }),
        el('span', { text: row.farm_verdict_reason })
      ),
      el('p', { class: 'sub', text: 'Cost $' + row.farm_cost_usd + ' all in (capital plus gas), hold ' + row.farm_hold_days + ' days. The page recomputes the verdict as ' + verdict.verdict + ' (' + verdict.reason + ') and the cost as $' + cost + (verdict.verdict === row.farm_verdict && cost === row.farm_cost_usd ? ', matching the board.' : ', which differs from the board: the data would be stale.') })
    ));
    dialog.appendChild(comparables(row));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(trail());
    shell.appendChild(lede());
    shell.appendChild(calibrationPanel());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(boardTable());
    else if (state.tab === 'set-aside') shell.appendChild(setAsideTable());
    else shell.appendChild(liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
