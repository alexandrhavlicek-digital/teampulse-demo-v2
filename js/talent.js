/* TeamPulse demo v2 - Talent & Reporty (9-box grid, retenční priority)
   Koncept: docs/koncept_talent_reporting_9box_360.md + koncept_succession_planning.md
   Osa X = vážené skóre z hodnocení (ReviewLogic.computeScore),
   osa Y = odhad potenciálu z talent sekce manažera (form.mgr.talent).
   Viditelnost: pouze manažer + HR. Zaměstnanec tento pohled nikdy nevidí. */
(function () {
  const { esc, avatar, modal, closeModal } = UI;

  /* ---------------- logic ---------------- */
  const CLOSED = ['confirmed', 'closed_by_hr'];

  function reviewsOf(pid) {
    return Store.list('reviews').filter(r => r.subjectId === pid)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /* nejnovější review, ze kterého jde spočítat skóre (mgr ratingy vyplněné) */
  function scoreInfo(pid) {
    const rs = reviewsOf(pid);
    let cur = null, prev = null;
    for (const r of rs) {
      const s = ReviewLogic.computeScore(r.form);
      if (s == null) continue;
      if (!cur) { cur = { score: s, review: r }; continue; }
      if (!prev) { prev = { score: s, review: r }; break; }
    }
    return { cur, prev };
  }

  /* nejnovější talent sekce (jakýkoli stav hodnocení - mgr ji vyplnil v draftu) */
  function talentOf(pid) {
    for (const r of reviewsOf(pid)) {
      const tal = r.form && r.form.mgr && r.form.mgr.talent;
      if (tal && tal.potential) return { tal, review: r };
    }
    return null;
  }

  function perfCol(score) {
    if (score == null) return null;
    return score < 0.95 ? 1 : score < 1.10 ? 2 : 3;
  }
  const POT_ROW = { low: 1, mid: 2, high: 3 };

  /* buňky: b{pot}{perf}, pot 3 = vysoký (horní řada) */
  const BOXES = [['b31', 'b32', 'b33'], ['b21', 'b22', 'b23'], ['b11', 'b12', 'b13']];

  function entryOf(p) {
    const ti = talentOf(p.id);
    const si = scoreInfo(p.id);
    const score = si.cur ? si.cur.score : null;
    const trend = si.cur && si.prev ? Math.sign(si.cur.score - si.prev.score) : 0;
    return {
      p, tal: ti ? ti.tal : null, review: ti ? ti.review : (si.cur ? si.cur.review : null),
      score, trend,
      col: perfCol(score),
      row: ti ? POT_ROW[ti.tal.potential] || null : null,
    };
  }

  window.TalentLogic = { scoreInfo, talentOf, perfCol, entryOf, BOXES };

  /* ---------------- grid component ---------------- */
  /* Sdílená komponenta (HR pohled, později Můj tým + kvartální check).
     entries: výstupy entryOf; opts: {small} */
  function tokenHtml(e) {
    const arrow = e.trend > 0 ? `<i class="ng-tr up" title="${esc(t('tal.trendUp'))}">▲</i>`
      : e.trend < 0 ? `<i class="ng-tr down" title="${esc(t('tal.trendDown'))}">▼</i>` : '';
    return `<button class="ng-token" data-tal-p="${e.p.id}" title="${esc(e.p.name)} · ${esc(e.p.role)}">
      <span class="ng-ava">${avatar(e.p, 40)}${arrow}</span>
      <span class="ng-nm">${esc(e.p.firstName)}</span>
    </button>`;
  }

  function gridHtml(entries) {
    const placed = entries.filter(e => e.row && e.col);
    const cell = (row, col) => {
      const key = BOXES[3 - row][col - 1];
      const items = placed.filter(e => e.row === row && e.col === col);
      const tone = key === 'b33' ? ' ng-best' : key === 'b11' ? ' ng-risk' : '';
      return `<div class="ng-cell${tone}">
        <div class="ng-head"><h4>${esc(t('tal.box.' + key))}</h4>
          <span class="badge">${items.length}</span></div>
        <div class="ng-act">${esc(t('tal.act.' + key))}</div>
        <div class="ng-tokens">${items.map(tokenHtml).join('')}</div>
      </div>`;
    };
    return `<div class="nine-grid">
      <div class="ng-ylab">${esc(t('tal.axisPot'))} ↑</div>
      <div class="ng-rows">
        ${[3, 2, 1].map(row => `<div class="ng-row">${[1, 2, 3].map(col => cell(row, col)).join('')}</div>`).join('')}
        <div class="ng-xlab">${esc(t('tal.axisPerf'))} →</div>
      </div>
    </div>`;
  }

  window.TalentGrid = { gridHtml, tokenHtml };

  /* ---------------- talent profile modal ---------------- */
  function profileModal(pid) {
    const p = Store.get('people', pid); if (!p) return;
    const e = entryOf(p);
    const b = e.score != null ? ReviewLogic.band(e.score) : null;
    const tal = e.tal || {};
    const goals = Store.list('goals').filter(g => g.ownerId === pid && g.type === 'personal' && g.period === Generator.CURRENT_PERIOD);
    const flag = (label, val) => val ? `<span class="badge b-blue">${esc(label)}: ${esc(val)}</span>` : '';
    modal(`
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
        ${avatar(p, 52)}
        <div><h3 style="margin:0">${esc(p.name)}</h3>
        <span style="color:var(--text-muted);font-size:.88rem">${esc(p.role)} · ${esc(p.dept)}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${e.score != null ? `<span class="badge b-green">${esc(t('rev.score'))}: ${e.score.toFixed(2)}${e.trend ? (e.trend > 0 ? ' ▲' : ' ▼') : ''}</span>` : `<span class="badge">${esc(t('tal.noScore'))}</span>`}
        ${b ? `<span class="badge">${esc(t('band.' + b.key))}</span>` : ''}
        ${e.row && e.col ? `<span class="badge b-amber">${esc(t('tal.box.' + BOXES[3 - e.row][e.col - 1]))}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${flag(t('rev.talent.potential'), tal.potential ? t('tal.pot.' + tal.potential) : '')}
        ${flag(t('rev.talent.readiness'), tal.readiness ? t('tal.rd.' + tal.readiness) : '')}
        ${flag(t('rev.talent.attrition'), tal.attrition ? t('tal.att.' + tal.attrition) : '')}
        ${tal.mobility ? `<span class="badge b-blue">${esc(t('rev.talent.mobility'))}</span>` : ''}
        ${flag(t('rev.talent.languages'), tal.languages && tal.languages !== '-' ? tal.languages : '')}
      </div>
      ${goals.length ? `<div class="bars" style="margin-bottom:12px">${goals.slice(0, 4).map(g => `
        <div class="brow"><span>${esc(g.title)}</span>
        <div class="progressbar"><div style="width:${g.progress}%"></div></div><b>${g.progress}%</b></div>`).join('')}</div>` : ''}
      <div class="wizard-foot"><span></span>
        <div style="display:flex;gap:8px">
          ${e.review ? `<button class="btn btn-sm" id="tp-open">${icon('doc', 14)} ${esc(t('rev.view'))}</button>` : ''}
          <button class="btn btn-primary btn-sm" id="tp-close">${esc(t('common.close'))}</button>
        </div></div>`, m => {
      m.querySelector('#tp-close').onclick = closeModal;
      const open = m.querySelector('#tp-open');
      if (open) open.onclick = () => { closeModal(); location.hash = '#/review/' + e.review.id; };
    });
  }

  /* ---------------- HR view: Talent & Reporty ---------------- */
  const talUi = { dept: '' };

  function renderHr(root) {
    const co = Store.getCompany();
    const ps = Store.list('people').filter(p => p.managerId); // hodnocení mají jen lidé s manažerem
    const filtered = talUi.dept ? ps.filter(p => p.deptKey === talUi.dept) : ps;
    const entries = filtered.map(entryOf);
    const placed = entries.filter(e => e.row && e.col);
    const noEstimate = entries.filter(e => !(e.row && e.col));
    const hipo = placed.filter(e => e.row === 3 && e.col === 3);
    const retention = placed
      .filter(e => e.tal && e.tal.potential === 'high' && ['mid', 'high'].includes(e.tal.attrition))
      .sort((a, b) => (b.tal.attrition === 'high') - (a.tal.attrition === 'high'));

    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('tal.title'))}</h1>
        <span style="flex:1"></span>
        <select class="input" id="tal-dept" style="width:auto">
          <option value="">${esc(t('tal.allDepts'))}</option>
          ${((co && co.departments) || []).map(d =>
            `<option value="${d.key}" ${talUi.dept === d.key ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </div>
      <p class="page-sub">${esc(t('tal.sub'))}</p>

      <div class="grid cols-4">
        <div class="card"><div class="kpi-num">${placed.length}<small style="font-size:1rem;color:var(--text-muted)">/${filtered.length}</small></div><div class="kpi-label">${esc(t('tal.mapped'))}</div></div>
        <div class="card"><div class="kpi-num" style="color:var(--ok)">${hipo.length}</div><div class="kpi-label">${esc(t('tal.box.b33'))}</div></div>
        <div class="card"><div class="kpi-num" style="color:${retention.length ? 'var(--warn)' : 'var(--ok)'}">${retention.length}</div><div class="kpi-label">${esc(t('tal.retention'))}</div></div>
        <div class="card"><div class="kpi-num">${noEstimate.length}</div><div class="kpi-label">${esc(t('tal.noEstimate'))}</div></div>
      </div>

      ${retention.length ? `<div class="card">
        <h2>${icon('alert', 18)}${esc(t('tal.retention'))}</h2>
        <p class="page-sub" style="margin-bottom:10px">${esc(t('tal.retentionHint'))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${retention.map(e => `<button class="btn" data-tal-p="${e.p.id}" style="display:flex;gap:8px;align-items:center">
            ${avatar(e.p, 28)} <span>${esc(e.p.name)}</span>
            <span class="badge ${e.tal.attrition === 'high' ? 'b-red' : 'b-amber'}">${esc(t('tal.att.' + e.tal.attrition))}</span>
          </button>`).join('')}
        </div>
      </div>` : ''}

      <div class="card">
        <h2>${icon('grid9', 18)}${esc(t('tal.gridTitle'))}</h2>
        <p class="page-sub" style="margin-bottom:12px">${esc(t('tal.gridHint'))}</p>
        ${gridHtml(entries)}
      </div>

      ${noEstimate.length ? `<div class="card">
        <h2>${icon('search', 18)}${esc(t('tal.noEstimate'))}</h2>
        <p class="page-sub" style="margin-bottom:10px">${esc(t('tal.noEstimateHint'))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${noEstimate.slice(0, 30).map(e => `<button class="btn btn-sm" data-tal-p="${e.p.id}" style="display:flex;gap:6px;align-items:center">
            ${avatar(e.p, 24)} ${esc(e.p.name)}</button>`).join('')}
          ${noEstimate.length > 30 ? `<span class="badge">+${noEstimate.length - 30}</span>` : ''}
        </div>
      </div>` : ''}

      <div class="card">
        <h2>${icon('bulb', 18)}${esc(t('tal.legendTitle'))}</h2>
        <div class="tal-legend">
          ${BOXES.flat().map(k => `<div class="tal-leg-item">
            <b>${esc(t('tal.box.' + k))}</b><span>${esc(t('tal.act.' + k))}</span></div>`).join('')}
        </div>
        <p class="callout" style="margin-top:12px">${icon('lock', 16)} ${esc(t('tal.privacyNote'))}</p>
      </div>`;

    const dsel = root.querySelector('#tal-dept');
    if (dsel) dsel.onchange = e2 => { talUi.dept = e2.target.value; renderHr(root); };
    root.querySelectorAll('[data-tal-p]').forEach(b => b.onclick = () => profileModal(b.dataset.talP));
  }

  window.TalentViews = { renderHr, profileModal };
})();
