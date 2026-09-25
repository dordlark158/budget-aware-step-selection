/* Charts for the project page. Every number is read from window.SITE_DATA,
   which scripts/export_site_data.py writes from the stored experiment reports. */
(() => {
  'use strict';
  const DATA = window.SITE_DATA;
  if (!DATA) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const log10 = Math.log10;

  // ---------- helpers ----------
  function svg(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs = {}) {
    const t = svg('text', { x, y, ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  function logScale([d0, d1], [r0, r1]) {
    const a = log10(d0), b = log10(d1);
    const f = v => r0 + (log10(v) - a) / (b - a) * (r1 - r0);
    f.invert = p => 10 ** (a + (p - r0) / (r1 - r0) * (b - a));
    return f;
  }
  function linScale([d0, d1], [r0, r1]) {
    const f = v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
    f.invert = p => d0 + (p - r0) / (r1 - r0) * (d1 - d0);
    return f;
  }
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const pow10 = e => '10' + String(e).replace(/[-0-9]/g, c => SUP[c]);
  function fmtRate(x) {
    if (x == null) return '—';
    const e = Math.floor(log10(x) + 1e-9);
    const mant = x / 10 ** e;
    return Math.abs(mant - 1) < 1e-4 ? pow10(e) : `${mant.toFixed(2)}×${pow10(e)}`;
  }
  const fmtM = n => `${(n / 1e6).toFixed(2)}M`;
  const fmtInt = n => n.toLocaleString('en-US');
  const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
  function median(a) {
    const s = [...a].sort((x, y) => x - y), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  const geomean = a => 10 ** (a.reduce((s, v) => s + log10(v), 0) / a.length);
  const sameRate = (a, b) => a != null && b != null && Math.abs(a - b) / b < 1e-6;

  function mark(parent, shape, x, y, r, cls) {
    if (shape === 'square') return svg('rect', { x: x - r * 0.88, y: y - r * 0.88, width: r * 1.76, height: r * 1.76, rx: 1.5, class: cls }, parent);
    if (shape === 'diamond') return svg('path', { d: `M${x},${y - r * 1.2}L${x + r * 1.2},${y}L${x},${y + r * 1.2}L${x - r * 1.2},${y}Z`, class: cls }, parent);
    if (shape === 'triangle') return svg('path', { d: `M${x},${y - r * 1.15}L${x + r},${y + r * 0.75}L${x - r},${y + r * 0.75}Z`, class: cls }, parent);
    if (shape === 'x') return svg('path', { d: `M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}`, class: cls, 'stroke-width': 2, 'stroke-linecap': 'round' }, parent);
    return svg('circle', { cx: x, cy: y, r, class: cls }, parent);
  }
  function root(el, W, H, label) {
    el.innerHTML = '';
    return svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': label }, el);
  }
  function logAxisX(g, x, y, decades, H0, opts = {}) {
    for (const e of decades) {
      const px = x(10 ** e);
      if (opts.grid) svg('line', { x1: px, x2: px, y1: opts.grid[0], y2: opts.grid[1], class: 'gridline' }, g);
      text(g, px, y + 16, pow10(e), { 'text-anchor': 'middle', class: 't-small' });
    }
  }
  // Re-draw on width changes only.
  function mount(el, draw) {
    let w = 0;
    const run = () => { const nw = Math.round(el.clientWidth); if (nw > 0) { w = nw; draw(w); } };
    new ResizeObserver(() => { if (Math.round(el.clientWidth) !== w) run(); }).observe(el);
    run();
    return run;
  }
  function seg(id, onChange) {
    const g = document.getElementById(id);
    if (!g) return;
    g.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-v]');
      if (!b) return;
      $$('button', g).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      onChange(b.dataset.v);
    });
  }
  function setSeg(id, v) {
    $$(`#${id} button`).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === v)));
  }

  // ---------- tooltip ----------
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  function showTip(ev, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect(), pad = 14;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }
  const hideTip = () => { tip.hidden = true; };
  document.addEventListener('scroll', hideTip, { passive: true });

  // ---------- shared donor data ----------
  const DN = DATA.donor;
  const TARGETS = DN.targets;
  const RATES = TARGETS[0].grid.map(g => g.rate);
  const COARSE = [1e-3, 1e-2, 1e-1];
  const escaped = g => g.numerical_failure || g.sampled_event;
  const targetLabel = t => `Factory ${t.factory} · read noise ${t.noise} · ${t.drift_days}-day drift · device ${t.id}`;
  const X_DOMAIN = [10 ** -6.25, 10 ** -0.75];

  const POLICY = {
    original_coarse_substrate: { label: 'Coarse/substrate donor rule', role: 'donor', group: 'Donor-calibrated rules · ε = 0.1' },
    fine_substrate_extension: { label: 'Fine/substrate donor rule', role: 'donor', group: 'Donor-calibrated rules · ε = 0.1' },
    coarse_cohort_extension: { label: 'Coarse/cohort donor rule', role: 'donor', group: 'Donor-calibrated rules · ε = 0.1' },
    fine_cohort_extension: { label: 'Fine/cohort donor rule', role: 'donor', group: 'Donor-calibrated rules · ε = 0.1' },
    paper_fixed: { label: 'Fixed default, η₀ = 10⁻³', role: 'fixed', group: 'Fixed settings · ε = 0.1' },
    fresh_global_fixed: { label: 'Donor-screened global fixed', role: 'fixed', group: 'Fixed settings · ε = 0.1' },
    fresh_cohort_fixed: { label: 'Donor-screened cohort fixed', role: 'fixed', group: 'Fixed settings · ε = 0.1' },
    historical_global_fixed: { label: 'Transferred global fixed', role: 'fixed', group: 'Fixed settings · ε = 0.1' },
    historical_cohort_fixed: { label: 'Transferred cohort fixed', role: 'fixed', group: 'Fixed settings · ε = 0.1' },
    target_search_eps01: { label: 'Target search, 21 rates', role: 'search', group: 'Target search · ε = 0.1' },
    coarse_cohort_eps003: { label: 'Coarse/cohort donor rule', role: 'donor', group: 'Sensitivity · ε = 0.03, no search grid' },
    fine_cohort_eps003: { label: 'Fine/cohort donor rule', role: 'donor', group: 'Sensitivity · ε = 0.03, no search grid' },
    historical_global_eps003: { label: 'Transferred global fixed', role: 'fixed', group: 'Sensitivity · ε = 0.03, no search grid' },
    historical_cohort_eps003: { label: 'Transferred cohort fixed', role: 'fixed', group: 'Sensitivity · ε = 0.03, no search grid' },
  };
  const SHAPE = { donor: 'circle', fixed: 'square', search: 'diamond' };

  // =====================================================================
  // Rule demo
  // =====================================================================
  const demo = { target: TARGETS[0].id, pool: 'cohort', grid: 'fine', delta: 0.1, hover: null };
  let redrawDemo = () => {};
  function runRule(t) {
    const S = DN.substrate;
    const pool = demo.pool === 'cohort' ? DN.pools[t.pool] : { ids: S.ids, levels: S.levels };
    const kappa = median(pool.levels);
    const ceiling = Math.sqrt(demo.delta) * S.eps * 1 * kappa / S.q;
    const ladder = demo.grid === 'fine' ? S.fine_grid : COARSE;
    const eligible = ladder.filter(r => r <= ceiling * (1 + 1e-9));
    return { pool, kappa, ceiling, ladder, choice: eligible.length ? Math.max(...eligible) : null };
  }
  function ruleDemo() {
    const sel = $('#rule-target'), dIn = $('#rule-delta'), dOut = $('#rule-delta-out');
    const S = DN.substrate;
    const byF = {};
    TARGETS.forEach(t => (byF[t.factory] ||= []).push(t));
    Object.entries(byF).forEach(([f, ts]) => {
      const og = document.createElement('optgroup');
      og.label = `Factory ${f}`;
      ts.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = `Read noise ${t.noise} · ${t.drift_days}-day drift · device ${t.id}`; og.appendChild(o); });
      sel.appendChild(og);
    });
    sel.value = demo.target;
    sel.addEventListener('change', () => { demo.target = +sel.value; demo.hover = null; redrawDemo(); });
    seg('rule-pool', v => { demo.pool = v; redrawDemo(); });
    seg('rule-grid', v => { demo.grid = v; redrawDemo(); });
    dIn.addEventListener('input', () => { demo.delta = +dIn.value; redrawDemo(); });
    const allLevels = S.levels;
    const lvDom = [10 ** Math.floor(log10(Math.min(...allLevels)) - 0.1), 10 ** Math.ceil(log10(Math.max(...allLevels)) + 0.05)];

    const mainEl = $('#rule-main'), trajEl = $('#rule-traj');
    let mainW = 0, trajW = 0;

    function drawMain(W) {
      const t = TARGETS.find(q => q.id === demo.target);
      const res = runRule(t);
      const search = t.policies.target_search_eps01.rate;
      const narrow = W < 460;
      const m = { l: narrow ? 42 : 52, r: 12 };
      const H = narrow ? 420 : 440;
      const s = root(mainEl, W, H, 'Donor levels, ceiling, and the target landscape');
      // --- panel A: donor levels
      const aTop = 18, aH = 36;
      text(s, m.l, aTop - 4, `Donor levels ℓ_d · ${demo.pool === 'cohort' ? '2 cohort donors' : 'all 36 donors'}${narrow ? '' : ' highlighted'}`, { class: 't-label' });
      const lx = logScale(lvDom, [m.l, W - m.r]);
      svg('line', { x1: m.l, x2: W - m.r, y1: aTop + aH / 2, y2: aTop + aH / 2, class: 'gridline' }, s);
      const inPool = new Set(res.pool.ids);
      S.ids.forEach((id, i) => {
        const on = inPool.has(id);
        const jit = ((i * 7) % 5 - 2) * 3;
        const c = mark(s, 'circle', lx(S.levels[i]), aTop + aH / 2 + (on ? 0 : jit), on ? 4.6 : 3, on ? 'f-donor ring' : 'f-none s-muted');
        if (!on) c.setAttribute('opacity', 0.6);
      });
      svg('line', { x1: lx(res.kappa), x2: lx(res.kappa), y1: aTop + 2, y2: aTop + aH + 6, class: 's-donor', 'stroke-width': 2 }, s);
      const kx = lx(res.kappa), kRight = kx > W * 0.7;
      text(s, kx + (kRight ? -6 : 6), aTop + aH + 8, `κ = median = ${res.kappa.toFixed(3)}`, { 'text-anchor': kRight ? 'end' : 'start', class: 't-donor t-small' });
      for (let e = Math.ceil(log10(lvDom[0])); e <= log10(lvDom[1]); e++) text(s, lx(10 ** e), aTop + aH + 22, pow10(e), { 'text-anchor': 'middle', class: 't-small t-muted' });

      // --- panel B: ladder with ceiling
      const bTop = 104, bH = 34;
      const x = logScale(X_DOMAIN, [m.l, W - m.r]);
      text(s, m.l, bTop - 6, `Ladder · ceiling √δ·ε·κ/q = ${fmtRate(res.ceiling)}`, { class: 't-label' });
      const cxp = Math.max(m.l, Math.min(W - m.r, x(res.ceiling)));
      svg('rect', { x: m.l, y: bTop, width: Math.max(0, cxp - m.l), height: bH, class: 'f-donor', opacity: 0.1 }, s);
      RATES.forEach(r => {
        const onLadder = res.ladder.some(q => sameRate(q, r));
        svg('line', { x1: x(r), x2: x(r), y1: bTop + (onLadder ? 4 : 12), y2: bTop + bH - (onLadder ? 4 : 12), class: onLadder ? 's-ink' : 's-muted', 'stroke-width': onLadder ? 2 : 1, opacity: onLadder ? 1 : 0.5 }, s);
      });
      if (x(res.ceiling) >= m.l && x(res.ceiling) <= W - m.r) svg('line', { x1: cxp, x2: cxp, y1: bTop - 2, y2: bTop + bH + 2, class: 's-donor', 'stroke-width': 2 }, s);
      if (res.choice != null) mark(s, 'circle', x(res.choice), bTop + bH / 2, 7.5, 'f-none s-donor').setAttribute('stroke-width', 2.5);

      // --- panel C: target landscape
      const cTop = bTop + bH + 42, cH = H - cTop - 34;
      const devs = t.grid.map(g => g.dev);
      const y = linScale([Math.min(...devs, t.baseline_dev) - 0.35, Math.max(...devs) + 0.35], [cTop + cH, cTop]);
      text(s, m.l, cTop - 12, narrow ? 'Target: clean dev. accuracy (%)' : 'This target: clean dev. accuracy (%) after each search run', { class: 't-label' });
      const yt = [];
      for (let v = Math.ceil(y.invert(cTop + cH) * 2) / 2; v <= y.invert(cTop); v += 0.5) yt.push(v);
      const step = yt.length > 7 ? 2 : 1;
      yt.forEach((v, k) => {
        if (k % step) return;
        svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'gridline' }, s);
        text(s, m.l - 6, y(v) + 4, v.toFixed(1), { 'text-anchor': 'end', class: 't-small' });
      });
      svg('line', { x1: m.l, x2: W - m.r, y1: y(t.baseline_dev), y2: y(t.baseline_dev), class: 'ref' }, s);
      text(s, m.l + 4, y(t.baseline_dev) + 13, 'damaged', { class: 't-small t-muted' });
      logAxisX(s, x, cTop + cH, [-6, -5, -4, -3, -2, -1]);
      svg('polyline', { points: t.grid.map(g => `${x(g.rate)},${y(g.dev)}`).join(' '), fill: 'none', class: 's-ink2', 'stroke-width': 1.3 }, s);
      t.grid.forEach(g => {
        if (escaped(g)) mark(s, 'x', x(g.rate), y(g.dev), 4, 's-crit');
        else mark(s, 'circle', x(g.rate), y(g.dev), 2.6, 'f-ink2');
      });
      // policy markers
      const at = r => t.grid.find(g => sameRate(g.rate, r));
      const fx = at(1e-3), sx = at(search);
      mark(s, 'square', x(fx.rate), y(fx.dev), 5.5, 'f-fixed ring');
      mark(s, 'diamond', x(sx.rate), y(sx.dev), 6, 'f-search ring');
      if (res.choice != null) {
        const cx = at(res.choice);
        const c = mark(s, 'circle', x(cx.rate), y(cx.dev), 8.5, 'f-none s-donor'); c.setAttribute('stroke-width', 2.5);
        svg('line', { x1: x(res.choice), x2: x(res.choice), y1: bTop + bH / 2 + 8, y2: y(cx.dev) - 9, class: 's-donor', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, s);
      }
      // hover rungs
      const hover = svg('line', { y1: cTop, y2: cTop + cH, class: 's-ink', opacity: 0 }, s);
      const hit = svg('rect', { x: m.l, y: bTop, width: W - m.l - m.r, height: cTop + cH - bTop, class: 'hit' }, s);
      const pick = ev => {
        const p = s.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
        const q = p.matrixTransform(s.getScreenCTM().inverse());
        let i = 0, best = Infinity;
        RATES.forEach((r, k) => { const d = Math.abs(x(r) - q.x); if (d < best) { best = d; i = k; } });
        const g = t.grid[i];
        hover.setAttribute('x1', x(g.rate)); hover.setAttribute('x2', x(g.rate)); hover.setAttribute('opacity', 0.3);
        if (demo.hover !== i) { demo.hover = i; drawTraj(trajW); }
        const tags = [];
        if (res.choice != null && sameRate(res.choice, g.rate)) tags.push('rule choice');
        if (sameRate(search, g.rate)) tags.push('target-search pick');
        if (sameRate(1e-3, g.rate)) tags.push('fixed default');
        showTip(ev, `<b>η₀ = ${fmtRate(g.rate)}</b>${tags.length ? ' · ' + tags.join(', ') : ''}<br>clean dev. accuracy ${g.dev.toFixed(2)}%<br>${escaped(g) ? (g.numerical_failure ? 'numerical failure' : 'sampled drop ≤ 15%') + ' → reverted' : g.reverted ? 'no improvement → reverted' : 'kept'}`);
      };
      hit.addEventListener('pointermove', pick);
      hit.addEventListener('pointerdown', pick);
      hit.addEventListener('pointerleave', () => { hideTip(); hover.setAttribute('opacity', 0); });

      // readouts
      const cGrid = res.choice != null ? at(res.choice) : null;
      const kv = $('#rule-kv');
      kv.innerHTML = `
        <dt>Donor pool</dt><dd>${demo.pool === 'cohort' ? 'cohort, 2 donors' : 'substrate, 36 donors'} · κ = ${res.kappa.toFixed(4)}</dd>
        <dt>Ceiling</dt><dd>η₀ ≤ ${fmtRate(res.ceiling)} (δ = ${demo.delta.toFixed(2)}, q = ${S.q.toFixed(4)})</dd>
        <dt><span class="sw" style="background:var(--donor)"></span>Rule</dt><dd>${cGrid ? `${fmtRate(res.choice)} → ${cGrid.dev.toFixed(2)}% dev.` : 'abstains: no rung under the ceiling'}</dd>
        <dt><span class="sw" style="background:var(--search)"></span>Search</dt><dd>${fmtRate(search)} → ${sx.dev.toFixed(2)}% dev. (21 runs on this target)</dd>
        <dt><span class="sw" style="background:var(--fixed); border-radius:1px"></span>Default</dt><dd>${fmtRate(1e-3)} → ${fx.dev.toFixed(2)}% dev.</dd>`;
      // status: recorded policy at delta 0.1
      const arm = { 'substrate|coarse': 'original_coarse_substrate', 'substrate|fine': 'fine_substrate_extension', 'cohort|coarse': 'coarse_cohort_extension', 'cohort|fine': 'fine_cohort_extension' }[`${demo.pool}|${demo.grid}`];
      const status = $('#rule-status');
      if (Math.abs(demo.delta - 0.1) < 1e-9) {
        const p = t.policies[arm], ts = t.policies.target_search_eps01;
        const agree = p.abstained ? res.choice == null : sameRate(p.rate, res.choice);
        status.innerHTML = `Recorded policy <strong>${POLICY[arm].label.replace(' donor rule', '')}</strong> on device ${t.id}:
          ${p.abstained ? 'abstained, damaged state kept' : `η₀ = ${fmtRate(p.rate)}`} · clean test <strong>${p.acc.toFixed(2)}%</strong>
          against target search ${ts.acc.toFixed(2)}% and damaged ${t.policies.damaged_baseline.acc.toFixed(2)}%.
          ${agree ? 'The rule above reproduces this selection.' : 'Selection differs from the record.'}`;
      } else {
        status.innerHTML = `δ = ${demo.delta.toFixed(2)} is exploratory. The study froze δ = 0.10 before any target ran, so only development accuracy from the stored search grid is available here.`;
      }
    }

    function drawTraj(W) {
      if (!W) return;
      const t = TARGETS.find(q => q.id === demo.target);
      const res = runRule(t);
      const search = t.policies.target_search_eps01.rate;
      const H = 260, m = { l: 40, r: 10, t: 14, b: 36 };
      const s = root(trajEl, W, H, 'Validation accuracy during recovery');
      const idx = r => t.grid.findIndex(g => sameRate(g.rate, r));
      const series = [{ i: idx(search), cls: 's-search' }];
      if (res.choice != null) series.push({ i: idx(res.choice), cls: 's-donor' });
      if (demo.hover != null) series.push({ i: demo.hover, cls: 's-ink' });
      const vals = series.flatMap(({ i }) => t.grid[i].traj);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      // Zoom to the recovery range; switch to the full 0–100 scale only when a shown run collapses.
      const full = lo < 80;
      const dom = full ? [0, 100] : [Math.floor(lo - 0.2), Math.ceil(hi + 0.2)];
      const step = full ? 25 : dom[1] - dom[0] > 4 ? 1 : 0.5;
      const x = linScale([0, 30000], [m.l, W - m.r]);
      const y = linScale(dom, [H - m.b, m.t]);
      for (let v = dom[0]; v <= dom[1] + 1e-9; v += step) {
        svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'gridline' }, s);
        text(s, m.l - 6, y(v) + 4, v % 1 ? v.toFixed(1) : String(v), { 'text-anchor': 'end', class: 't-small' });
      }
      [0, 10000, 20000, 30000].forEach(v => text(s, x(v), H - m.b + 16, v ? `${v / 1000}k` : '0', { 'text-anchor': 'middle', class: 't-small' }));
      text(s, W - m.r, H - 2, 'FEE', { 'text-anchor': 'end', class: 't-label' });
      if (full) {
        svg('line', { x1: m.l, x2: W - m.r, y1: y(15), y2: y(15), class: 's-crit', 'stroke-dasharray': '3 3', opacity: 0.7 }, s);
        text(s, W - m.r, y(15) - 5, 'escape threshold 15%', { 'text-anchor': 'end', class: 't-crit t-small' });
      }
      series.forEach(({ i, cls }) => {
        const g = t.grid[i];
        const pts = g.traj.map((v, k) => `${x(k * DN.checkpoint_every)},${y(v)}`).join(' ');
        svg('polyline', { points: pts, fill: 'none', class: cls, 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
        const last = g.traj.length - 1;
        if (g.numerical_failure) mark(s, 'x', x(last * DN.checkpoint_every), y(g.traj[last]), 4, 's-crit');
      });
      const h = demo.hover != null ? t.grid[demo.hover] : null;
      text(s, m.l, H - 2, h ? `hovered η₀ = ${fmtRate(h.rate)}${h.numerical_failure ? ' · non-finite loss' : h.sampled_event ? ' · sampled drop' : ''}` : 'hover a rung to add its run', { class: 't-small t-ink' });
    }

    new ResizeObserver(() => {
      const w1 = Math.round(mainEl.clientWidth), w2 = Math.round(trajEl.clientWidth);
      if (w1 !== mainW) { mainW = w1; drawMain(w1); }
      if (w2 !== trajW) { trajW = w2; drawTraj(w2); }
    }).observe(mainEl.parentElement.parentElement);
    redrawDemo = () => {
      dOut.textContent = demo.delta.toFixed(2);
      mainW = Math.round(mainEl.clientWidth); trajW = Math.round(trajEl.clientWidth);
      drawMain(mainW); drawTraj(trajW);
    };
    redrawDemo();
  }
  // =====================================================================
  // Fleet cost/accuracy dot plot
  // =====================================================================
  function fleet() {
    const el = $('#fig-fleet .plot');
    const P = DN.policies;
    const PRIMARY = ['original_coarse_substrate', 'fine_cohort_extension', 'paper_fixed', 'fresh_cohort_fixed', 'historical_cohort_fixed', 'target_search_eps01'];
    const ALL = ['original_coarse_substrate', 'fine_substrate_extension', 'coarse_cohort_extension', 'fine_cohort_extension',
      'paper_fixed', 'fresh_global_fixed', 'fresh_cohort_fixed', 'historical_global_fixed', 'historical_cohort_fixed',
      'target_search_eps01', 'coarse_cohort_eps003', 'fine_cohort_eps003', 'historical_global_eps003', 'historical_cohort_eps003'];
    let view = 'primary';
    const searchAcc = P.target_search_eps01.acc, base = P.damaged_baseline.acc;
    const draw = W => {
      const keys = view === 'primary' ? PRIMARY : ALL;
      const narrow = W < 680;
      const rows = [];
      let lastGroup = null;
      keys.forEach(k => {
        if (view === 'all' && POLICY[k].group !== lastGroup) { rows.push({ header: POLICY[k].group }); lastGroup = POLICY[k].group; }
        rows.push({ k });
      });
      const labW = narrow ? 0 : 230;
      const rowH = narrow ? 46 : 32, headH = 30, top = 44;
      let yy = top;
      rows.forEach(r => { r.y = yy + (r.header ? headH - 10 : rowH / 2); yy += r.header ? headH : rowH; });
      const H = yy + 44;
      const s = root(el, W, H, 'Clean test accuracy and operational forwards by policy');
      const gap = narrow ? 18 : 34;
      const panelW = (W - labW - gap) / 2;
      const ax0 = labW, ax1 = labW + panelW - 44;
      const cx0 = labW + panelW + gap, cx1 = W - 12;
      const xa = linScale([93.2, 96.0], [ax0 + 4, ax1]);
      const xc = logScale([3e5, 3e7], [cx0 + 4, cx1 - 46]);
      const bottom = yy + 2;
      (narrow ? [94, 95, 96] : [93.5, 94, 94.5, 95, 95.5, 96]).forEach(v => {
        svg('line', { x1: xa(v), x2: xa(v), y1: top - 6, y2: bottom, class: 'gridline' }, s);
        text(s, xa(v), bottom + 16, v.toFixed(1), { 'text-anchor': 'middle', class: 't-small' });
      });
      (narrow ? [[1e6, '1M'], [1e7, '10M']] : [[3e5, '0.3M'], [1e6, '1M'], [3e6, '3M'], [1e7, '10M'], [3e7, '30M']]).forEach(([v, l]) => {
        svg('line', { x1: xc(v), x2: xc(v), y1: top - 6, y2: bottom, class: 'gridline' }, s);
        text(s, xc(v), bottom + 16, l, { 'text-anchor': 'middle', class: 't-small' });
      });
      text(s, ax0 + 4, bottom + 36, 'clean test accuracy (%)', { class: 't-label' });
      text(s, cx0 + 4, bottom + 36, 'operational forwards (log)', { class: 't-label' });
      // reference lines
      const refY = narrow ? rows.filter(r => !r.header).map(r => [r.y - 2, r.y + 16]) : [[top - 6, bottom]];
      refY.forEach(([a, b]) => svg('line', { x1: xa(base), x2: xa(base), y1: a, y2: b, class: 's-muted', 'stroke-width': 1.2 }, s));
      // key for the two reference lines, kept clear of the marks
      svg('line', { x1: 0, x2: 16, y1: 10, y2: 10, class: 's-muted', 'stroke-width': 1.2 }, s);
      text(s, 22, 14, `damaged ${base.toFixed(2)}%`, { class: 't-small' });
      const kx = narrow ? 0 : 170, ky = narrow ? 28 : 10;
      svg('line', { x1: kx, x2: kx + 16, y1: ky, y2: ky, class: 's-search', 'stroke-dasharray': '3 3', 'stroke-width': 1.2 }, s);
      text(s, kx + 22, ky + 4, 'target search − 0.10 pp (tolerance)', { class: 't-small' });
      const thr = searchAcc - 0.10;
      refY.forEach(([a, b]) => svg('line', { x1: xa(thr), x2: xa(thr), y1: a, y2: b, class: 's-search', 'stroke-dasharray': '3 3', 'stroke-width': 1.2 }, s));

      rows.forEach(r => {
        if (r.header) { text(s, 0, r.y, r.header, { class: 't-label' }); return; }
        const p = P[r.k], meta = POLICY[r.k];
        const ly = narrow ? r.y - 13 : r.y + 4;
        text(s, narrow ? 0 : 0, ly, meta.label + (p.abstentions ? ` (abstains ${p.abstentions}/36)` : ''), { class: 't-ink', 'font-size': narrow ? 11 : 12 });
        const my = narrow ? r.y + 7 : r.y;
        svg('line', { x1: ax0, x2: ax1, y1: my, y2: my, class: 'gridline' }, s);
        svg('line', { x1: cx0, x2: cx1, y1: my, y2: my, class: 'gridline' }, s);
        const ma = mark(s, SHAPE[meta.role], xa(p.acc), my, 5.5, `f-${meta.role} ring`);
        const mc = mark(s, SHAPE[meta.role], xc(p.forwards), my, 5.5, `f-${meta.role} ring`);
        text(s, xa(p.acc) + 10, my + 4, p.acc.toFixed(2), { class: 't-ink t-small' });
        text(s, xc(p.forwards) + 10, my + 4, fmtM(p.forwards), { class: 't-ink t-small' });
        const tipHtml = `<b>${meta.label}</b>${meta.group.includes('0.03') ? ' (ε = 0.03)' : ''}<br>clean test ${p.acc.toFixed(3)}% · noisy test ${p.noisy_acc.toFixed(2)}%<br>${fmtInt(p.forwards)} operational forwards${p.abstentions ? `<br>abstains on ${p.abstentions}/36` : ''}`;
        const hitRow = svg('rect', { x: 0, y: (narrow ? r.y - 26 : r.y - rowH / 2), width: W, height: rowH, class: 'hit' }, s);
        hitRow.addEventListener('pointermove', ev => showTip(ev, tipHtml));
        hitRow.addEventListener('pointerdown', ev => showTip(ev, tipHtml));
        hitRow.addEventListener('pointerleave', hideTip);
        [ma, mc].forEach(e => e.parentNode.appendChild(e));
      });
    };
    const redraw = mount(el, draw);
    seg('fleet-view', v => { view = v; redraw(); });
  }

  // =====================================================================
  // Law check: scatter + ratio strip
  // =====================================================================
  function law() {
    const el = $('#fig-law .plot');
    const L = DATA.escape_law;
    const MODELS = [
      { k: 'descent_LD', label: 'Descent (LD)' },
      { k: 'descent_trace', label: 'Descent (trace)' },
      { k: 'noise', label: 'Noise model' },
      { k: 'noise_cap', label: 'Noise + local cap' },
    ];
    const sigmas = [...new Set(L.cells.map(c => c.sigma))].sort((a, b) => a - b);
    const SH = ['circle', 'square', 'triangle'];
    let model = 'noise';
    const draw = W => {
      const narrow = W < 720;
      const sw = narrow ? W : Math.min(440, W * 0.48);
      const H1 = Math.min(sw, 420);
      const stripTop = narrow ? H1 + 28 : 0;
      const H = narrow ? H1 + 28 + 230 : Math.max(H1, 260);
      const s = root(el, W, H, 'Predicted against measured failure boundaries');
      // scatter
      const m = { l: 46, r: 14, t: 26, b: 40 };
      const x = logScale([10 ** -5.5, 10 ** 0.5], [m.l, sw - m.r]);
      const y = logScale([10 ** -5.5, 10 ** 0.5], [H1 - m.b, m.t]);
      const band = [];
      for (const v of [-5.5, 0.5]) band.push([x(10 ** v), y(10 ** (v + 0.5))]);
      for (const v of [0.5, -5.5]) band.push([x(10 ** v), y(10 ** (v - 0.5))]);
      svg('path', { d: 'M' + band.map(p => p.join(',')).join('L') + 'Z', class: 'band' }, s);
      for (let e = -5; e <= 0; e++) {
        svg('line', { x1: x(10 ** e), x2: x(10 ** e), y1: m.t, y2: H1 - m.b, class: 'gridline' }, s);
        svg('line', { x1: m.l, x2: sw - m.r, y1: y(10 ** e), y2: y(10 ** e), class: 'gridline' }, s);
        if (e % 2 === 1 || e === 0 || true) {
          if ((e + 5) % 2 === 0) {
            text(s, x(10 ** e), H1 - m.b + 16, pow10(e), { 'text-anchor': 'middle', class: 't-small' });
            text(s, m.l - 6, y(10 ** e) + 4, pow10(e), { 'text-anchor': 'end', class: 't-small' });
          }
        }
      }
      svg('line', { x1: x(10 ** -5.5), x2: x(10 ** 0.5), y1: y(10 ** -5.5), y2: y(10 ** 0.5), class: 's-muted', 'stroke-width': 1 }, s);
      svg('line', { x1: m.l, x2: sw - m.r, y1: y(L.two_over_L), y2: y(L.two_over_L), class: 'ref' }, s);
      text(s, m.l + 4, y(L.two_over_L) - 5, 'local 2/L_loc', { class: 't-small t-muted' });
      text(s, sw - m.r, H1 - 4, 'measured boundary η_max', { 'text-anchor': 'end', class: 't-label' });
      text(s, m.l, m.t - 12, `predicted · ${MODELS.find(q => q.k === model).label}`, { class: 't-label' });
      L.cells.forEach(c => {
        const si = sigmas.indexOf(c.sigma);
        const p = mark(s, SH[si], x(c.measured), y(c[model]), 5, `f-ord-${si + 1} ring`);
        p.addEventListener('pointerenter', ev => showTip(ev, `<b>σ = ${c.sigma}, m = ${fmtInt(c.m)}</b><br>measured ${fmtRate(c.measured)}<br>predicted ${fmtRate(c[model])}<br>ratio ${(c[model] / c.measured).toFixed(2)}×`));
        p.addEventListener('pointerleave', hideTip);
        if (model === 'noise' && c.sigma === sigmas[2] && [1, 64, 3189].includes(c.m)) text(s, x(c.measured) + 8, y(c[model]) + 14, `m=${fmtInt(c.m)}`, { class: 't-ink t-small' });
      });
      // sigma legend
      sigmas.forEach((sg, i) => {
        const lx = m.l + 8 + i * 72, lyy = m.t + 8;
        mark(s, SH[i], lx, lyy, 4.5, `f-ord-${i + 1}`);
        text(s, lx + 9, lyy + 4, `σ ${sg}`, { class: 't-small' });
      });

      // ratio strip
      const x0 = narrow ? 120 : sw + 150, x1 = W - 70;
      const xr = logScale([1e-4, 1e3], [x0, x1]);
      const rt = narrow ? stripTop + 22 : 30, rh = narrow ? 48 : Math.max(48, (H1 - 30 - 64) / 4);
      [1e-4, 1e-2, 1, 1e2].forEach(v => {
        svg('line', { x1: xr(v), x2: xr(v), y1: rt - 6, y2: rt + 4 * rh - 8, class: 'gridline' }, s);
        text(s, xr(v), rt + 4 * rh + 8, v === 1 ? '1' : pow10(log10(v)), { 'text-anchor': 'middle', class: 't-small' });
      });
      svg('rect', { x: xr(10 ** -0.5), y: rt - 6, width: xr(10 ** 0.5) - xr(10 ** -0.5), height: 4 * rh - 2, class: 'band' }, s);
      svg('line', { x1: xr(1), x2: xr(1), y1: rt - 6, y2: rt + 4 * rh - 8, class: 's-muted' }, s);
      text(s, x1, rt + 4 * rh + 26, 'predicted / measured', { 'text-anchor': 'end', class: 't-label' });
      text(s, W - 2, rt - 12, 'geo. mean', { 'text-anchor': 'end', class: 't-label' });
      MODELS.forEach((mm, i) => {
        const yy = rt + i * rh + rh / 2 - 6;
        const on = mm.k === model;
        if (on) svg('rect', { x: (narrow ? 0 : sw + 10), y: yy - rh / 2 + 2, width: W - (narrow ? 0 : sw + 10), height: rh - 4, class: 'f-donor', opacity: 0.07, rx: 3 }, s);
        text(s, x0 - 12, yy + 4, mm.label, { 'text-anchor': 'end', class: on ? 't-strong' : 't-ink' });
        const ratios = L.cells.map(c => c[mm.k] / c.measured);
        ratios.forEach((r, k) => {
          const jy = yy + (((k * 7) % 13) - 6) * 1.3;
          mark(s, 'circle', xr(Math.max(1e-4, Math.min(1e3, r))), jy, 2.8, on ? 'f-donor' : 'f-none s-ink2').setAttribute('opacity', on ? 0.85 : 0.7);
        });
        const gm = geomean(ratios);
        svg('line', { x1: xr(gm), x2: xr(gm), y1: yy - 13, y2: yy + 13, class: 's-ink', 'stroke-width': 2.5 }, s);
        text(s, W - 2, yy + 4, `${gm >= 0.01 && gm < 10 ? gm.toFixed(2) : gm.toPrecision(3)}×`, { 'text-anchor': 'end', class: on ? 't-strong' : 't-ink' });
        const hit = svg('rect', { x: narrow ? 0 : sw + 10, y: yy - rh / 2 + 2, width: W - (narrow ? 0 : sw + 10), height: rh - 4, class: 'hit clickable' }, s);
        hit.addEventListener('click', () => { model = mm.k; setSeg('law-view', model); redraw(); });
      });
    };
    const redraw = mount(el, draw);
    seg('law-view', v => { model = v; redraw(); });
  }

  // =====================================================================
  // Symbol highlighting, BibTeX, theme hooks
  // =====================================================================
  function symbols() {
    const SYMS = ['eta', 'eps', 'sig', 'R', 'B', 'm', 'D'];
    const symOf = el => SYMS.find(s => el.classList && el.classList.contains('sym-' + s));
    document.addEventListener('pointerover', ev => {
      const el = ev.target.closest && ev.target.closest('.sym');
      SYMS.forEach(s => document.body.classList.remove('hl-' + s));
      if (el) { const s = symOf(el); if (s) document.body.classList.add('hl-' + s); }
    });
  }
  function bib() {
    const b = $('#bib-copy');
    b.addEventListener('click', async () => {
      const txt = $('#bibtex').textContent;
      try { await navigator.clipboard.writeText(txt); b.textContent = 'Copied'; }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents($('#bibtex'));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        b.textContent = 'Selected, press Ctrl+C';
      }
      setTimeout(() => { b.textContent = 'Copy BibTeX'; }, 2200);
    });
  }

  const run = f => { try { f(); } catch (e) { console.error(f.name, e); } };
  [ruleDemo, fleet, law, symbols, bib].forEach(run);
})();
