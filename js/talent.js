/* TeamPulse demo v2 - Talent & Reporty (9-box grid, retenční priority)
   Koncept: docs/koncept_talent_reporting_9box_360.md + koncept_succession_planning.md
   Osa X = vážené skóre z hodnocení (ReviewLogic.computeScore),
   osa Y = odhad potenciálu z talent sekce manažera (form.mgr.talent).
   Viditelnost: pouze manažer + HR. Zaměstnanec tento pohled nikdy nevidí. */
(function () {
  const { esc, avatar, modal, closeModal, stBadge } = UI;

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

  /* override z finálního (prodiskutovaného) kvartálního checku má přednost
     před vypočtenou pozicí - matice ukazuje stav dohodnutý manažerem a HR */
  function finalOverrideBox(pid) {
    let best = null;
    Store.list('talentChecks').forEach(c => {
      if (c.status !== 'final') return;
      const it = (c.items || []).find(i => i.personId === pid && i.source === 'override' && i.box);
      if (it && (!best || (c.discussedAt || 0) > best.at)) best = { box: it.box, at: c.discussedAt || 0 };
    });
    return best && best.box;
  }

  function entryOf(p) {
    const ti = talentOf(p.id);
    const si = scoreInfo(p.id);
    const score = si.cur ? si.cur.score : null;
    const trend = si.cur && si.prev ? Math.sign(si.cur.score - si.prev.score) : 0;
    const ov = finalOverrideBox(p.id);
    return {
      p, tal: ti ? ti.tal : null, review: ti ? ti.review : (si.cur ? si.cur.review : null),
      score, trend,
      col: ov ? ov.perf : perfCol(score),
      row: ov ? ov.pot : (ti ? POT_ROW[ti.tal.potential] || null : null),
      overridden: !!ov,
    };
  }

  window.TalentLogic = { scoreInfo, talentOf, perfCol, entryOf, BOXES };

  /* ---------------- grid component ---------------- */
  /* Sdílená komponenta (HR pohled, později Můj tým + kvartální check).
     entries: výstupy entryOf; opts: {small} */
  function tokenHtml(e, opts) {
    opts = opts || {};
    const arrow = e.trend > 0 ? `<i class="ng-tr up" title="${esc(t('tal.trendUp'))}">▲</i>`
      : e.trend < 0 ? `<i class="ng-tr down" title="${esc(t('tal.trendDown'))}">▼</i>` : '';
    const moved = e.moved ? `<i class="ng-mv" title="${esc(t('tc.moved'))}${e.note ? ': ' + esc(e.note) : ''}">✎</i>` : '';
    return `<button class="ng-token" data-tal-p="${e.p.id}" ${opts.drag ? 'draggable="true"' : ''}
      title="${esc(e.p.name)} · ${esc(e.p.role)}${e.note ? ' · ' + esc(e.note) : ''}">
      <span class="ng-ava">${avatar(e.p, 40)}${arrow}${moved}</span>
      <span class="ng-nm">${esc(e.p.firstName)}</span>
    </button>`;
  }

  function gridHtml(entries, opts) {
    opts = opts || {};
    const placed = entries.filter(e => e.row && e.col);
    const cell = (row, col) => {
      const key = BOXES[3 - row][col - 1];
      const items = placed.filter(e => e.row === row && e.col === col);
      const tone = key === 'b33' ? ' ng-best' : key === 'b11' ? ' ng-risk' : '';
      return `<div class="ng-cell${tone}" ${opts.drag ? `data-cell="${row}:${col}"` : ''}>
        <div class="ng-head"><h4>${esc(t('tal.box.' + key))}</h4>
          <span class="badge">${items.length}</span></div>
        <div class="ng-act">${esc(t('tal.act.' + key))}</div>
        <div class="ng-tokens">${items.map(e => tokenHtml(e, opts)).join('')}</div>
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
        ${rcOf(pid) ? `<span class="badge b-red">${esc(t('rc.legend'))}: ${esc(t('rc.q.' + rcQuadrant(rcOf(pid))))}</span>` : ''}
        ${window.Feedback360Views ? Feedback360Views.statusLineHtml(pid) : ''}
      </div>
      ${window.Feedback360Views ? Feedback360Views.threeViewsHtml(pid) : ''}
      ${goals.length ? `<div class="bars" style="margin-bottom:12px">${goals.slice(0, 4).map(g => `
        <div class="brow"><span>${esc(g.title)}</span>
        <div class="progressbar"><div style="width:${g.progress}%"></div></div><b>${g.progress}%</b></div>`).join('')}</div>` : ''}
      <div class="wizard-foot">
        ${window.Feedback360 && !Store.list('feedback360').some(x => x.subjectId === pid && x.status === 'collecting')
          ? `<button class="btn btn-sm" id="tp-f360">${icon('team', 13)} ${esc(t('f360.request'))}</button>` : '<span></span>'}
        <div style="display:flex;gap:8px">
          ${e.review ? `<button class="btn btn-sm" id="tp-open">${icon('doc', 14)} ${esc(t('rev.view'))}</button>` : ''}
          <button class="btn btn-primary btn-sm" id="tp-close">${esc(t('common.close'))}</button>
        </div></div>`, m => {
      m.querySelector('#tp-close').onclick = closeModal;
      const open = m.querySelector('#tp-open');
      if (open) open.onclick = () => { closeModal(); location.hash = '#/review/' + e.review.id; };
      const f3 = m.querySelector('#tp-f360');
      if (f3) f3.onclick = () => { closeModal(); Feedback360Views.requestModal(pid, () => {}); };
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

      ${tcHrCardHtml()}

      ${successionCardHtml(Store.list('keyPositions').filter(kp => !talUi.dept || kp.deptKey === talUi.dept))}

      ${rcCardHtml()}

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
    bindSuccessionCard(root, () => renderHr(root));
    bindRcCard(root, () => renderHr(root));
    bindTcHrCard(root);
  }

  /* ---------------- succession: klíčové pozice ----------------
     DERTOUR checklist 12 otázek / 4 okruhy; většina ANO → pozice je klíčová.
     Viditelnost: jen manažer + HR (org overlay i seznam). */
  const KP_CATS = [
    { key: 'strat', qs: [1, 2, 3] },
    { key: 'skills', qs: [4, 5, 6] },
    { key: 'replace', qs: [7, 8, 9] },
    { key: 'impact', qs: [10, 11, 12] },
  ];
  const kpYes = kp => Object.values(kp.checklist || {}).filter(v => v === true).length;
  const kpAnswered = kp => Object.values(kp.checklist || {}).filter(v => v === true || v === false).length;
  const kpIsKey = kp => kpYes(kp) >= 7; /* většina z 12 */
  const kpRated = kp => kpAnswered(kp) >= 7; /* aspoň většina zodpovězena */

  function succMaps() {
    const kpByHolder = {}, succLevel = {}, red = {};
    Store.list('keyPositions').forEach(kp => {
      if (kp.holderId && kpRated(kp) && kpIsKey(kp)) kpByHolder[kp.holderId] = kp;
      (kp.successors || []).forEach(s => {
        succLevel[s.personId] = succLevel[s.personId] === 'key' ? 'key' : s.level;
      });
    });
    Store.list('redCards').forEach(rc => { red[rc.personId] = rcQuadrant(rc); });
    return { kpByHolder, succLevel, red };
  }
  /* checklist kandidáta na nástupce: 21 otázek / 7 okruhů (DERTOUR),
     práh nastavuje HR (default 16/21 ≈ 75 %). Doporučený, ne povinný -
     UI jemně vyzývá, nevaliduje tvrdě (rozhodnutí 2026-07-22). */
  const CAND_CATS = [1, 2, 3, 4, 5, 6, 7].map(c => ({ key: c, qs: [c * 3 - 2, c * 3 - 1, c * 3] }));
  const candYes = cl => Object.values(cl || {}).filter(v => v === true).length;
  const candNo = cl => Object.values(cl || {}).filter(v => v === false).length;
  function candThreshold() {
    const co = Store.getCompany();
    return ((co && co.cycleConfig) || {}).candidateThreshold || 16;
  }
  /* fit: dosáhl prahu · notfit: prahu už dosáhnout nemůže · null: rozpracováno */
  function candResult(cl) {
    if (candYes(cl) >= candThreshold()) return 'fit';
    if (candNo(cl) > 21 - candThreshold()) return 'notfit';
    return null;
  }
  window.SuccLogic = { kpYes, kpAnswered, kpIsKey, kpRated, succMaps, KP_CATS, CAND_CATS, candYes, candNo, candThreshold, candResult };

  function candBadge(cl) {
    if (!cl || !Object.keys(cl).length) return `<span class="badge b-amber">${esc(t('cand.prompt'))}</span>`;
    const res = candResult(cl);
    if (res === 'fit') return `<span class="badge b-green">${icon('check', 11)} ${esc(t('cand.fit'))} · ${candYes(cl)}/21</span>`;
    if (res === 'notfit') return `<span class="badge b-red">${esc(t('cand.notfit'))} · ${candYes(cl)}/21</span>`;
    return `<span class="badge">${candYes(cl)} ${esc(t('kp.yes'))} / ${candNo(cl)} ${esc(t('kp.no'))}</span>`;
  }

  function candChecklistModal(kp, succIdx, rerender) {
    const s = kp.successors[succIdx]; if (!s) return;
    const p = Store.get('people', s.personId); if (!p) return;
    s.checklist21 = s.checklist21 || {};
    const e = entryOf(p);
    const b = e.score != null ? ReviewLogic.band(e.score) : null;

    const render = m => {
      const res = candResult(s.checklist21);
      m.querySelector('#cand-body').innerHTML = `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <span class="badge ${res === 'fit' ? 'b-green' : res === 'notfit' ? 'b-red' : 'b-amber'}">
            ${candYes(s.checklist21)}/21 ${esc(t('kp.yes'))} · ${esc(t('cand.threshold'))} ${candThreshold()} → ${esc(t(res === 'fit' ? 'cand.fit' : res === 'notfit' ? 'cand.notfit' : 'cand.pending'))}</span>
          ${e.score != null ? `<span class="badge">${esc(t('rev.score'))}: ${e.score.toFixed(2)}${e.trend > 0 ? ' ▲' : e.trend < 0 ? ' ▼' : ''}</span>` : ''}
          ${b ? `<span class="badge">${esc(t('band.' + b.key))}</span>` : ''}
          ${e.row && e.col ? `<span class="badge b-blue">${esc(t('tal.box.' + BOXES[3 - e.row][e.col - 1]))}</span>` : ''}
        </div>
        ${CAND_CATS.map(c => `<div style="margin-bottom:10px">
          <div style="font-weight:650;font-size:.86rem;margin-bottom:4px">${c.key}. ${esc(t('cand.cat.' + c.key))}</div>
          ${c.qs.map(q => `<div class="kp-q"><span>${esc(t('cand.q' + q))}</span>
            <span class="kp-yn">
              <button type="button" class="btn btn-sm ${s.checklist21['q' + q] === true ? 'btn-primary' : ''}" data-cq="${q}:1">${esc(t('kp.yes'))}</button>
              <button type="button" class="btn btn-sm ${s.checklist21['q' + q] === false ? 'kp-no' : ''}" data-cq="${q}:0">${esc(t('kp.no'))}</button>
            </span></div>`).join('')}</div>`).join('')}`;
      m.querySelectorAll('[data-cq]').forEach(bq => bq.onclick = () => {
        const [q, v] = bq.dataset.cq.split(':');
        const nv = v === '1';
        s.checklist21['q' + q] = (s.checklist21['q' + q] === nv) ? null : nv;
        render(m);
      });
      m.querySelector('#cand-save').onclick = () => {
        Store.update('keyPositions', kp.id, {}); closeModal(); UI.toast(t('common.saved')); rerender();
      };
      m.querySelector('#cand-cancel').onclick = closeModal;
    };

    modal(`<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
        ${avatar(p, 44)}<div><h3 style="margin:0">${esc(p.name)}</h3>
        <span style="color:var(--text-muted);font-size:.86rem">${esc(t('cand.for'))}: <b>${esc(kp.title)}</b></span></div></div>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('cand.hint'))}</p>
      <div id="cand-body" style="max-height:52vh;overflow:auto;padding-right:4px"></div>
      <div class="wizard-foot">
        <button class="btn" id="cand-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="cand-save">${esc(t('common.save'))}</button>
      </div>`, render);
  }

  function kpResultBadge(kp) {
    if (!kpRated(kp)) return `<span class="badge b-amber">${esc(t('kp.result.unrated'))} · ${kpAnswered(kp)}/12</span>`;
    return kpIsKey(kp)
      ? `<span class="badge b-blue">${esc(t('kp.result.key'))} · ${kpYes(kp)}/12 ${esc(t('kp.yes'))}</span>`
      : `<span class="badge">${esc(t('kp.result.notKey'))} · ${kpYes(kp)}/12 ${esc(t('kp.yes'))}</span>`;
  }

  function succChip(s, kpId, idx) {
    const p = Store.get('people', s.personId); if (!p) return '';
    const res = s.checklist21 && Object.keys(s.checklist21).length ? candResult(s.checklist21) : undefined;
    const mark = res === 'fit' ? `<i class="kp-cl ok" title="${esc(t('cand.fit'))}">✓</i>`
      : res === 'notfit' ? `<i class="kp-cl bad" title="${esc(t('cand.notfit'))}">✗</i>`
      : res === null ? `<i class="kp-cl" title="${esc(t('cand.pending'))}">…</i>` : '';
    const clickable = kpId != null;
    return `<span class="kp-succ ${s.level === 'key' ? 'kp-succ-key' : 'kp-succ-reg'} ${clickable ? 'kp-succ-click' : ''}"
      ${clickable ? `data-cand="${kpId}:${idx}"` : ''}
      title="${esc(t(s.level === 'key' ? 'kp.succKey' : 'kp.succReg'))}${s.readiness ? ' · ' + esc(t('tal.rd.' + s.readiness)) : ''}${clickable ? ' · ' + esc(t('cand.open')) : ''}">
      ${avatar(p, 22)} ${esc(p.firstName)} ${s.readiness ? `<small>${esc(t('tal.rd.' + s.readiness))}</small>` : ''}${mark}</span>`;
  }

  function kpEditModal(kp, onDone) {
    const co = Store.getCompany();
    const ps = Store.list('people');
    const isNew = !kp;
    kp = kp ? JSON.parse(JSON.stringify(kp)) : { id: uid(), deptKey: '', title: '', holderId: '', checklist: {}, confirmedByHr: true, successors: [] };
    const depts = (co && co.departments) || [];

    const render = m => {
      const yes = kpYes(kp);
      m.querySelector('#kp-body').innerHTML = `
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('kp.title'))}</label><input class="input" id="kpf-title" value="${esc(kp.title)}"></div>
          <div class="field"><label>${esc(t('people.dept'))}</label>
            <select class="input" id="kpf-dept">${depts.map(d => `<option value="${d.key}" ${kp.deptKey === d.key ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>${esc(t('kp.holder'))}</label>
          <select class="input" id="kpf-holder"><option value="">-</option>${ps.map(p => `<option value="${p.id}" ${kp.holderId === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.role)})</option>`).join('')}</select></div>
        <div style="display:flex;align-items:center;gap:8px;margin:6px 0 10px">
          <b>${esc(t('kp.checklist'))}</b>
          <span class="badge ${kpRated(kp) ? (kpIsKey(kp) ? 'b-blue' : '') : 'b-amber'}">${yes}/12 ${esc(t('kp.yes'))} → ${esc(t(kpRated(kp) ? (kpIsKey(kp) ? 'kp.result.key' : 'kp.result.notKey') : 'kp.result.unrated'))}</span>
        </div>
        ${KP_CATS.map(c => `<div style="margin-bottom:10px"><div style="font-weight:650;font-size:.86rem;margin-bottom:4px">${esc(t('kp.cat.' + c.key))}</div>
          ${c.qs.map(q => `<div class="kp-q"><span>${esc(t('kp.q' + q))}</span>
            <span class="kp-yn">
              <button type="button" class="btn btn-sm ${kp.checklist['q' + q] === true ? 'btn-primary' : ''}" data-kpq="${q}:1">${esc(t('kp.yes'))}</button>
              <button type="button" class="btn btn-sm ${kp.checklist['q' + q] === false ? 'kp-no' : ''}" data-kpq="${q}:0">${esc(t('kp.no'))}</button>
            </span></div>`).join('')}</div>`).join('')}
        <div style="display:flex;align-items:center;gap:8px;margin:12px 0 6px">
          <b>${esc(t('kp.succ'))}</b>
          ${kpRated(kp) && kpIsKey(kp) && !kp.successors.length ? `<span class="badge b-red">${esc(t('kp.noSucc'))}</span>` : ''}
        </div>
        ${kp.successors.map((s, i) => {
          const p = Store.get('people', s.personId);
          return `<div class="kp-q"><span>${p ? avatar(p, 22) + ' ' + esc(p.name) : '?'}
            <span class="badge ${s.level === 'key' ? 'b-green' : 'b-amber'}">${esc(t(s.level === 'key' ? 'kp.succKey' : 'kp.succReg'))}</span>
            ${s.readiness ? `<span class="badge">${esc(t('tal.rd.' + s.readiness))}</span>` : ''}</span>
            <button type="button" class="btn btn-sm" data-kps-del="${i}">${icon('trash', 12)}</button></div>`;
        }).join('')}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <select class="input" id="kps-person" style="flex:2;min-width:160px"><option value="">${esc(t('kp.addSucc'))}…</option>
            ${ps.filter(p => p.id !== kp.holderId && !kp.successors.some(s => s.personId === p.id)).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
          <select class="input" id="kps-level" style="flex:1;min-width:120px">
            <option value="key">${esc(t('kp.succKey'))}</option><option value="successor">${esc(t('kp.succReg'))}</option></select>
          <select class="input" id="kps-rd" style="flex:1;min-width:110px">
            ${['r1', 'r12', 'no'].map(r => `<option value="${r}">${esc(t('tal.rd.' + r))}</option>`).join('')}</select>
          <button type="button" class="btn btn-sm" id="kps-add">${icon('plus', 13)}</button>
        </div>`;

      const collect = () => {
        kp.title = m.querySelector('#kpf-title').value;
        kp.deptKey = m.querySelector('#kpf-dept') ? m.querySelector('#kpf-dept').value : kp.deptKey;
        kp.holderId = m.querySelector('#kpf-holder').value || null;
      };
      m.querySelectorAll('[data-kpq]').forEach(bq => bq.onclick = () => {
        collect();
        const [q, v] = bq.dataset.kpq.split(':');
        const cur = kp.checklist['q' + q];
        const nv = v === '1';
        kp.checklist['q' + q] = (cur === nv) ? null : nv;
        render(m);
      });
      m.querySelectorAll('[data-kps-del]').forEach(bd => bd.onclick = () => { collect(); kp.successors.splice(+bd.dataset.kpsDel, 1); render(m); });
      m.querySelector('#kps-add').onclick = () => {
        collect();
        const pid = m.querySelector('#kps-person').value; if (!pid) return;
        kp.successors.push({ personId: pid, level: m.querySelector('#kps-level').value, readiness: m.querySelector('#kps-rd').value });
        render(m);
      };
      m.querySelector('#kp-save').onclick = () => {
        collect();
        if (!kp.title.trim()) { UI.toast(t('kp.title')); return; }
        const dept = depts.find(d => d.key === kp.deptKey);
        kp.dept = dept ? dept.name : kp.deptKey;
        if (isNew) Store.insert('keyPositions', kp);
        else { const orig = Store.get('keyPositions', kp.id); Object.assign(orig, kp); Store.update('keyPositions', kp.id, {}); }
        closeModal(); UI.toast(t('common.saved')); onDone();
      };
      const del = m.querySelector('#kp-del');
      if (del) del.onclick = () => { Store.remove('keyPositions', kp.id); closeModal(); UI.toast(t('common.saved')); onDone(); };
      m.querySelector('#kp-cancel').onclick = closeModal;
    };

    modal(`<h3>${icon('grid9', 18)}${esc(t('kp.modalTitle'))}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:12px">${esc(t('kp.hint'))}</p>
      <div id="kp-body" style="max-height:56vh;overflow:auto;padding-right:4px"></div>
      <div class="wizard-foot">
        ${isNew ? '<span></span>' : `<button class="btn btn-danger" id="kp-del">${icon('trash', 14)} ${esc(t('common.delete'))}</button>`}
        <div style="display:flex;gap:8px">
          <button class="btn" id="kp-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="kp-save">${esc(t('common.save'))}</button>
        </div></div>`, render);
  }

  function successionCardHtml(kps) {
    const rated = kps.filter(kpRated);
    const keyOnes = rated.filter(kpIsKey);
    const uncovered = keyOnes.filter(kp => !(kp.successors || []).length);
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2 style="margin:0">${icon('tree', 18)}${esc(t('kp.sectionTitle'))}</h2>
        <span class="badge b-blue">${keyOnes.length} ${esc(t('kp.keyCount'))}</span>
        ${uncovered.length ? `<span class="badge b-red">${uncovered.length} ${esc(t('kp.noSucc'))}</span>` : (keyOnes.length ? `<span class="badge b-green">${esc(t('kp.allCovered'))}</span>` : '')}
        <span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="kp-add-btn">${icon('plus', 14)} ${esc(t('kp.add'))}</button>
      </div>
      <p class="page-sub" style="margin:6px 0 10px">${esc(t('kp.sectionSub'))}</p>
      ${kps.length ? kps.map(kp => {
        const holder = kp.holderId ? Store.get('people', kp.holderId) : null;
        const isU = kpRated(kp) && kpIsKey(kp) && !(kp.successors || []).length;
        return `<div class="kp-row ${isU ? 'kp-row-uncovered' : ''}" data-kp-edit="${kp.id}">
          <div class="kp-main">
            <b>${esc(kp.title)}</b> <span class="badge">${esc(kp.dept || kp.deptKey || '-')}</span>
            <div class="kp-holder">${holder ? avatar(holder, 24) + ' ' + esc(holder.name) : '<i>' + esc(t('kp.vacancy')) + '</i>'}</div>
          </div>
          <div class="kp-mid">${kpResultBadge(kp)}</div>
          <div class="kp-succs">
            ${(kp.successors || []).length ? kp.successors.map((s, i) => succChip(s, kp.id, i)).join('') : (isU ? `<span class="badge b-red">${icon('alert', 12)} ${esc(t('kp.noSucc'))}</span>` : '<span style="color:var(--text-muted);font-size:.82rem">-</span>')}
          </div>
        </div>`;
      }).join('') : `<div class="empty" style="padding:18px">${icon('tree', 40)}<br>${esc(t('kp.empty'))}</div>`}
    </div>`;
  }

  function bindSuccessionCard(root, rerender) {
    const add = root.querySelector('#kp-add-btn');
    if (add) add.onclick = () => kpEditModal(null, rerender);
    root.querySelectorAll('[data-kp-edit]').forEach(row => row.onclick = () => kpEditModal(Store.get('keyPositions', row.dataset.kpEdit), rerender));
    /* chip nástupce → checklist kandidáta (stopPropagation, ať se neotevře editor pozice) */
    root.querySelectorAll('[data-cand]').forEach(ch => ch.onclick = ev => {
      ev.stopPropagation();
      const [kpId, idx] = ch.dataset.cand.split(':');
      const kp = Store.get('keyPositions', kpId);
      if (kp) candChecklistModal(kp, +idx, rerender);
    });
  }

  /* ---------------- manažerský pohled: Můj tým ---------------- */
  /* Čistě čtecí. Účel: příprava na 1:1 a na hodnocení za 30 sekund,
     ne další administrativa. Reuse grid komponenty z HR pohledu. */
  function teamCardHtml(e) {
    const p = e.p;
    const b = e.score != null ? ReviewLogic.band(e.score) : null;
    const boxKey = e.row && e.col ? BOXES[3 - e.row][e.col - 1] : null;
    const goals = Store.list('goals').filter(g => g.ownerId === p.id && g.type === 'personal' && g.period === Generator.CURRENT_PERIOD);
    const avgG = goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : null;
    const ci = Store.list('checkins').filter(c => c.employeeId === p.id).sort((a, b2) => b2.at - a.at)[0];
    const kud = Store.list('kudos').filter(k => k.toId === p.id && k.at > Date.now() - 60 * 86400000).length;
    const rev = Store.list('reviews').filter(r => r.subjectId === p.id && r.period === Generator.CURRENT_PERIOD)
      .sort((a, b2) => b2.startedAt - a.startedAt)[0];
    return `<div class="card mt-card">
      <div class="mt-head">
        <button class="ng-token mt-ava" data-tal-p="${p.id}" title="${esc(t('tal.gridHint'))}">
          <span class="ng-ava">${avatar(p, 44)}${e.trend > 0 ? '<i class="ng-tr up">▲</i>' : e.trend < 0 ? '<i class="ng-tr down">▼</i>' : ''}</span>
        </button>
        <div style="min-width:0;flex:1">
          <b class="mt-nm">${esc(p.name)}</b>
          <div class="mt-role">${esc(p.role)}</div>
        </div>
        ${e.score != null ? `<div class="mt-score"><b>${e.score.toFixed(2)}</b></div>` : `<span class="badge">${esc(t('tal.noScore'))}</span>`}
      </div>
      <div class="mt-flags">
        ${b ? `<span class="badge ${b.cls}" title="${esc(t('band.' + b.key))}">${esc(t('band.' + b.key))}</span>` : ''}
        ${boxKey ? `<span class="badge b-blue">${esc(t('tal.box.' + boxKey))}</span>` : `<span class="badge">${esc(t('tal.noEstimate'))}</span>`}
        ${e.tal && e.tal.attrition && e.tal.attrition !== 'low' ? `<span class="badge ${e.tal.attrition === 'high' ? 'b-red' : 'b-amber'}">${esc(t('rev.talent.attrition'))}: ${esc(t('tal.att.' + e.tal.attrition))}</span>` : ''}
        ${kud ? `<span class="badge b-green">${icon('heart', 11)} ${kud}×</span>` : ''}
      </div>
      ${avgG != null ? `<div class="mt-row"><span>${esc(t('mt.goals'))} (${goals.length})</span>
        <div class="progressbar"><div style="width:${avgG}%"></div></div><b>${avgG}%</b></div>` : ''}
      ${ci ? `<div class="mt-ci">${ci.mood} <span>${UI.fmtDate(ci.at)} - ${esc(ci.notes)}</span></div>` : ''}
      <div class="mt-foot">
        ${rev ? stBadge(rev.status) : `<span class="badge">${esc(t('mt.noReview'))}</span>`}
        <span style="flex:1"></span>
        ${rev ? `<button class="btn btn-sm" onclick="location.hash='#/review/${rev.id}'">${icon('doc', 13)} ${esc(t('rev.view'))}</button>` : ''}
        <button class="btn btn-sm btn-primary" data-tal-p="${p.id}">${esc(t('mt.profile'))}</button>
      </div>
    </div>`;
  }

  function renderMyTeam(root) {
    const va = App.viewAs();
    const me = va.personId ? Store.get('people', va.personId) : null;
    const team = me ? Store.list('people').filter(p => p.managerId === me.id) : [];
    if (!team.length) {
      root.innerHTML = `<h1 class="page-title">${esc(t('mt.title'))}</h1>
        <div class="card"><div class="empty">${icon('team', 52)}<br>${esc(t('mt.empty'))}</div></div>`;
      return;
    }
    const entries = team.map(entryOf)
      .sort((a, b) => (b.score != null) - (a.score != null) || (b.score || 0) - (a.score || 0));
    const placed = entries.filter(e => e.row && e.col);
    const retention = placed.filter(e => e.tal && e.tal.potential === 'high' && ['mid', 'high'].includes(e.tal.attrition));

    const check = tcOf(me.id);
    root.innerHTML = `
      <h1 class="page-title">${esc(t('mt.title'))} <span class="badge b-blue">${team.length}</span></h1>
      <p class="page-sub">${esc(t('mt.sub'))}</p>
      ${tcCadence() !== 'off' && (!check || check.status === 'draft') ? `
      <div class="card tc-banner">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          ${icon('clock', 22)}
          <div style="flex:1;min-width:200px"><b>${esc(t('tc.banner'))} · ${esc(tcPeriod())}</b><br>
            <small style="color:var(--text-muted)">${esc(t('tc.bannerSub'))}</small></div>
          <button class="btn btn-primary btn-sm" onclick="location.hash='#/talentcheck'">${esc(t(check ? 'tc.continue' : 'tc.start'))} ${icon('arrowR', 14)}</button>
        </div>
      </div>` : check && check.status === 'debate' ? `<p class="callout" style="margin-bottom:14px">${icon('checkin', 16)} <span>${esc(t('tc.readonly'))} · ${esc(check.period)}</span></p>` : ''}
      ${retention.length ? `<p class="callout" style="margin-bottom:14px">${icon('alert', 16)}
        <span><b>${esc(t('tal.retention'))}:</b> ${retention.map(e => esc(e.p.name)).join(', ')}</span></p>` : ''}
      <div class="card">
        <h2>${icon('grid9', 18)}${esc(t('mt.gridTitle'))}</h2>
        <p class="page-sub" style="margin-bottom:12px">${esc(t('tal.gridHint'))}</p>
        ${gridHtml(entries)}
      </div>
      ${(() => {
        /* klíčové pozice v mém týmu (držitel = já nebo můj člověk) - jen čtení */
        const ids = new Set(team.map(p => p.id).concat(me.id));
        const mine = Store.list('keyPositions').filter(kp => kp.holderId && ids.has(kp.holderId) && kpRated(kp) && kpIsKey(kp));
        return mine.length ? `<div class="card">
          <h2>${icon('tree', 18)}${esc(t('kp.myTeamTitle'))}</h2>
          ${mine.map(kp => {
            const holder = Store.get('people', kp.holderId);
            return `<div class="kp-row" style="cursor:default">
              <div class="kp-main"><b>${esc(kp.title)}</b>
                <div class="kp-holder">${holder ? avatar(holder, 24) + ' ' + esc(holder.name) : '-'}</div></div>
              <div class="kp-succs">${(kp.successors || []).length ? kp.successors.map(succChip).join('') : `<span class="badge b-red">${icon('alert', 12)} ${esc(t('kp.noSucc'))}</span>`}</div>
            </div>`;
          }).join('')}
        </div>` : '';
      })()}
      <h2 class="mt-sec">${icon('team', 18)}${esc(t('mt.cards'))}</h2>
      <div class="mt-cards">${entries.map(teamCardHtml).join('')}</div>`;

    root.querySelectorAll('[data-tal-p]').forEach(bn => bn.onclick = () => profileModal(bn.dataset.talP));
  }

  /* ---------------- červená karta + matice potřebnosti ----------------
     DERTOUR: potřebnost (odbornost, výkon, kontakty) × problémovost.
     „Potřebný potížista" = nejrizikovější závislost → succession priorita č. 1.
     Nastavuje se ručně (mgr/HR), čistě interní - zaměstnanec nikdy. */
  const rcQuadrant = rc => (rc.needed ? 'n' : 'd') + (rc.trouble ? 't' : 'p');
  /* nt = potřebný potížista, np = potřebný pohodář, dt = nepotřebný potížista, dp = nepotřebný pohodář */
  function rcOf(pid) { return Store.list('redCards').find(r => r.personId === pid) || null; }
  window.RedCard = { rcQuadrant, rcOf };

  function rcModal(existing, presetPersonId, rerender) {
    const ps = Store.list('people').filter(p => p.managerId);
    const rc = existing ? JSON.parse(JSON.stringify(existing))
      : { id: uid(), personId: presetPersonId || '', needed: true, trouble: true, note: '', byId: null, at: null };
    const render = m => {
      m.querySelector('#rc-body').innerHTML = `
        <div class="field"><label>${esc(t('people.name'))}</label>
          <select class="input" id="rcf-p" ${existing ? 'disabled' : ''}>
            <option value="">-</option>
            ${ps.filter(p => !rcOf(p.id) || (existing && existing.personId === p.id)).map(p =>
              `<option value="${p.id}" ${rc.personId === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.role)})</option>`).join('')}
          </select></div>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('rc.needed'))}</label>
            <div class="scale-row">
              <button type="button" class="scale-opt ${rc.needed ? 'sel' : ''}" data-rcn="1">${esc(t('rc.neededYes'))}</button>
              <button type="button" class="scale-opt ${!rc.needed ? 'sel' : ''}" data-rcn="0">${esc(t('rc.neededNo'))}</button>
            </div><div class="hint">${esc(t('rc.neededHint'))}</div></div>
          <div class="field"><label>${esc(t('rc.trouble'))}</label>
            <div class="scale-row">
              <button type="button" class="scale-opt ${rc.trouble ? 'sel' : ''}" data-rct="1">${esc(t('rc.troubleYes'))}</button>
              <button type="button" class="scale-opt ${!rc.trouble ? 'sel' : ''}" data-rct="0">${esc(t('rc.troubleNo'))}</button>
            </div></div>
        </div>
        <p class="callout" style="margin-bottom:12px">${icon('bulb', 15)} <b>${esc(t('rc.q.' + rcQuadrant(rc)))}</b> - ${esc(t('rc.act.' + rcQuadrant(rc)))}</p>
        <div class="field"><label>${esc(t('tc.note')).split('(')[0].trim()}</label>
          <textarea class="input" id="rcf-note" style="min-height:56px">${esc(rc.note || '')}</textarea></div>`;
      m.querySelectorAll('[data-rcn]').forEach(bn => bn.onclick = () => { rc.needed = bn.dataset.rcn === '1'; collect(m); render(m); });
      m.querySelectorAll('[data-rct]').forEach(bn => bn.onclick = () => { rc.trouble = bn.dataset.rct === '1'; collect(m); render(m); });
      const collect = mm => {
        const sel = mm.querySelector('#rcf-p'); if (sel && !sel.disabled) rc.personId = sel.value;
        rc.note = mm.querySelector('#rcf-note').value;
      };
      m.querySelector('#rc-save').onclick = () => {
        collect(m);
        if (!rc.personId) { UI.toast(t('people.name')); return; }
        rc.byId = (App.viewAs() || {}).personId || null; rc.at = Date.now();
        if (existing) { Object.assign(Store.get('redCards', rc.id), rc); Store.update('redCards', rc.id, {}); }
        else Store.insert('redCards', rc);
        closeModal(); UI.toast(t('common.saved')); rerender();
      };
      const del = m.querySelector('#rc-del');
      if (del) del.onclick = () => { Store.remove('redCards', rc.id); closeModal(); UI.toast(t('common.saved')); rerender(); };
      m.querySelector('#rc-cancel').onclick = closeModal;
    };
    modal(`<h3>${icon('alert', 18)}${esc(t('rc.modalTitle'))}</h3>
      <p class="hint" style="color:var(--warn);margin-bottom:12px">${esc(t('rc.privacy'))}</p>
      <div id="rc-body"></div>
      <div class="wizard-foot">
        ${existing ? `<button class="btn btn-danger" id="rc-del">${icon('trash', 14)} ${esc(t('common.delete'))}</button>` : '<span></span>'}
        <div style="display:flex;gap:8px">
          <button class="btn" id="rc-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="rc-save">${esc(t('common.save'))}</button>
        </div></div>`, render);
  }

  function rcCardHtml() {
    const cards = Store.list('redCards');
    const { kpByHolder } = succMaps();
    const cell = q => {
      const items = cards.filter(rc => rcQuadrant(rc) === q);
      return `<div class="rc-cell ${q === 'nt' ? 'rc-hot' : ''}">
        <div class="ng-head"><h4>${esc(t('rc.q.' + q))}</h4><span class="badge">${items.length}</span></div>
        <div class="ng-act">${esc(t('rc.act.' + q))}</div>
        <div class="ng-tokens">${items.map(rc => {
          const p = Store.get('people', rc.personId); if (!p) return '';
          const holdsKey = !!kpByHolder[p.id];
          return `<button class="ng-token" data-rc-edit="${rc.id}" title="${esc(p.name)}${rc.note ? ' · ' + esc(rc.note) : ''}${holdsKey ? ' · ' + esc(t('rc.holdsKey')) : ''}">
            <span class="ng-ava">${avatar(p, 40)}${holdsKey ? '<i class="ng-tr down" style="color:var(--danger)">⚑</i>' : ''}</span>
            <span class="ng-nm">${esc(p.firstName)}</span></button>`;
        }).join('')}</div>
      </div>`;
    };
    const hot = cards.filter(rc => rcQuadrant(rc) === 'nt');
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2 style="margin:0">${icon('alert', 18)}${esc(t('rc.title'))}</h2>
        ${hot.length ? `<span class="badge b-red">${hot.length}× ${esc(t('rc.q.nt'))}</span>` : ''}
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="rc-add">${icon('plus', 14)} ${esc(t('rc.add'))}</button>
      </div>
      <p class="page-sub" style="margin:6px 0 10px">${esc(t('rc.sub'))}</p>
      ${cards.length ? `
      <div class="rc-grid">
        <div class="rc-ylab">${esc(t('rc.needed'))} ↑</div>
        <div class="rc-rows">
          <div class="rc-row">${cell('np')}${cell('nt')}</div>
          <div class="rc-row">${cell('dp')}${cell('dt')}</div>
          <div class="rc-xlab">${esc(t('rc.trouble'))} →</div>
        </div>
      </div>` : `<div class="empty" style="padding:16px">${icon('alert', 36)}<br>${esc(t('rc.empty'))}</div>`}
    </div>`;
  }
  function bindRcCard(root, rerender) {
    const add = root.querySelector('#rc-add');
    if (add) add.onclick = () => rcModal(null, null, rerender);
    root.querySelectorAll('[data-rc-edit]').forEach(bn => bn.onclick = () => rcModal(Store.get('redCards', bn.dataset.rcEdit), null, rerender));
  }

  /* ---------------- kvartální talent check ----------------
     Rytmus z DERTOUR praxe: vynucený moment jednou za kvartál.
     Stavový model chrání princip „nejdřív sám, pak debata":
       draft  - vidí JEN manažer (HR jen ví, že je rozpracováno)
       debate - manažer odeslal, HR vidí obsah, proběhne kalibrační debata
       final  - HR označí prodiskutováno; overridy se propíší do matice */
  function tcCadence() {
    const co = Store.getCompany();
    return ((co && co.cycleConfig) || {}).talentCheck || 'q'; /* q | semi | off (default zapnuto, rozhodnutí 2026-07-22) */
  }
  function tcPeriod(d) {
    d = d || new Date();
    return tcCadence() === 'semi'
      ? 'H' + (d.getMonth() < 6 ? 1 : 2) + ' ' + d.getFullYear()
      : 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear();
  }
  function tcOf(managerId, period) {
    return Store.list('talentChecks').find(c => c.managerId === managerId && c.period === (period || tcPeriod())) || null;
  }
  function tcStart(me, team) {
    /* computed pozice se NEukládají - odvozují se živě z entryOf; ukládá se jen override */
    const items = team.map(p => {
      const e = entryOf(p);
      return { personId: p.id, box: null, source: 'computed', note: '', attrition: e.tal ? e.tal.attrition : null };
    });
    return Store.insert('talentChecks', {
      id: uid(), period: tcPeriod(), managerId: me.id, status: 'draft',
      items, createdAt: Date.now(), sentAt: null, discussedAt: null,
    });
  }
  window.TalentCheck = { tcCadence, tcPeriod, tcOf, tcStart };

  function tcEntries(check) {
    return check.items.map(it => {
      const p = Store.get('people', it.personId); if (!p) return null;
      const base = entryOf(p);
      const ov = it.source === 'override' && it.box;
      return { p, row: ov ? it.box.pot : base.row, col: ov ? it.box.perf : base.col,
        trend: base.trend, tal: base.tal, score: base.score,
        moved: !!ov, note: it.note, item: it };
    }).filter(Boolean);
  }

  function tcStatusBadge(st) {
    const cls = { draft: 'b-amber', debate: 'b-blue', final: 'b-green' }[st] || '';
    return `<span class="badge ${cls}">${esc(t('tc.status.' + (st || 'none')))}</span>`;
  }

  /* modal nad žetonem v draftu: poznámka k posunu, riziko odchodu, reset */
  function tcPersonModal(check, item, rerender) {
    const p = Store.get('people', item.personId); if (!p) return;
    modal(`<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
        ${avatar(p, 44)}<div><h3 style="margin:0">${esc(p.name)}</h3>
        <span style="color:var(--text-muted);font-size:.86rem">${esc(p.role)}</span></div></div>
      ${item.source === 'override' ? `<p class="hint" style="margin-bottom:10px">${icon('alert', 13)} ${esc(t('tc.moved'))}</p>` : ''}
      <div class="field"><label>${esc(t('tc.note'))}</label>
        <textarea class="input" id="tcp-note" style="min-height:60px">${esc(item.note || '')}</textarea></div>
      <div class="field"><label>${esc(t('rev.talent.attrition'))}</label>
        <div class="scale-row">${['low', 'mid', 'high'].map(a =>
          `<button type="button" class="scale-opt ${item.attrition === a ? 'sel' : ''}" data-tca="${a}">${esc(t('tal.att.' + a))}</button>`).join('')}</div></div>
      <div class="wizard-foot">
        ${item.source === 'override' ? `<button class="btn" id="tcp-reset">${icon('refresh', 13)} ${esc(t('tc.reset'))}</button>` : '<span></span>'}
        <button class="btn btn-primary" id="tcp-save">${esc(t('common.save'))}</button>
      </div>`, m => {
      m.querySelectorAll('[data-tca]').forEach(bn => bn.onclick = () => {
        m.querySelectorAll('[data-tca]').forEach(x => x.classList.remove('sel'));
        bn.classList.add('sel'); item.attrition = bn.dataset.tca;
      });
      m.querySelector('#tcp-save').onclick = () => {
        item.note = m.querySelector('#tcp-note').value;
        Store.update('talentChecks', check.id, {}); closeModal(); rerender();
      };
      const rst = m.querySelector('#tcp-reset');
      if (rst) rst.onclick = () => {
        item.box = null; item.source = 'computed'; item.note = '';
        Store.update('talentChecks', check.id, {}); closeModal(); rerender();
      };
    });
  }

  /* manažerský flow (#/talentcheck) - HR sem může jen read-only přes param */
  function renderCheck(root, managerIdParam) {
    const va = App.viewAs();
    const isHrView = va.role === 'hr' && managerIdParam;
    const me = isHrView ? Store.get('people', managerIdParam) : (va.personId ? Store.get('people', va.personId) : null);
    const team = me ? Store.list('people').filter(p => p.managerId === me.id) : [];
    if (!me || !team.length) {
      root.innerHTML = `<h1 class="page-title">${esc(t('tc.title'))}</h1>
        <div class="card"><div class="empty">${icon('team', 52)}<br>${esc(t('mt.empty'))}</div></div>`;
      return;
    }
    let check = tcOf(me.id);
    if (!check) {
      if (isHrView) { root.innerHTML = `<div class="card"><div class="empty">${icon('clock', 44)}<br>${esc(t('tc.status.none'))}</div></div>`; return; }
      check = tcStart(me, team);
    }
    const editable = !isHrView && check.status === 'draft';
    const entries = tcEntries(check);
    const unplaced = entries.filter(e => !(e.row && e.col));
    const rerender = () => renderCheck(root, managerIdParam);

    /* klíčové pozice týmu k potvrzení */
    const ids = new Set(team.map(p => p.id).concat(me.id));
    const myKps = Store.list('keyPositions').filter(kp => kp.holderId && ids.has(kp.holderId) && kpRated(kp) && kpIsKey(kp));

    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('tc.title'))} · ${esc(check.period)}</h1>
        ${tcStatusBadge(check.status)}
        ${isHrView ? `<span class="badge">${icon('team', 12)} ${esc(me.name)}</span>` : ''}
      </div>
      <p class="page-sub">${esc(t(editable ? 'tc.sub' : check.status === 'debate' ? 'tc.readonly' : 'tc.finalInfo'))}</p>

      <div class="card">
        <h2>${icon('grid9', 18)}${esc(t('mt.gridTitle'))}</h2>
        ${editable ? `<p class="callout" style="margin-bottom:12px">${icon('bulb', 16)} ${esc(t('tc.instructions'))}</p>` : ''}
        ${gridHtml(entries, { drag: editable })}
        ${unplaced.length ? `<div class="tc-tray"><b>${esc(t('tal.noEstimate'))}</b> - ${esc(t('tc.trayHint'))}
          <div class="ng-tokens" style="margin-top:8px">${unplaced.map(e => tokenHtml(e, { drag: editable })).join('')}</div></div>` : ''}
      </div>

      ${myKps.length ? `<div class="card">
        <h2>${icon('tree', 18)}${esc(t('tc.succStep'))}</h2>
        <p class="page-sub" style="margin-bottom:8px">${esc(t('tc.succStepSub'))}</p>
        ${myKps.map(kp => {
          const holder = Store.get('people', kp.holderId);
          return `<div class="kp-row" ${editable ? `data-tc-kp="${kp.id}"` : 'style="cursor:default"'}>
            <div class="kp-main"><b>${esc(kp.title)}</b>
              <div class="kp-holder">${holder ? avatar(holder, 24) + ' ' + esc(holder.name) : '-'}</div></div>
            <div class="kp-succs">${(kp.successors || []).length ? kp.successors.map(succChip).join('') : `<span class="badge b-red">${icon('alert', 12)} ${esc(t('kp.noSucc'))}</span>`}</div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card">
        <div class="wizard-foot">
          ${editable ? `<button class="btn" id="tc-save">${esc(t('tc.saveDraft'))}</button>
            <button class="btn btn-primary" id="tc-send">${esc(t('tc.send'))} ${icon('send', 14)}</button>`
          : isHrView && check.status === 'debate' ? `<span></span>
            <button class="btn btn-primary" id="tc-final">${icon('check', 14)} ${esc(t('tc.markDiscussed'))}</button>`
          : `<span class="page-sub">${check.status === 'final' && check.discussedAt ? esc(t('tc.discussed')) + ' · ' + UI.fmtDate(check.discussedAt) : ''}</span><span></span>`}
        </div>
      </div>`;

    /* drag & drop */
    if (editable) {
      root.querySelectorAll('.ng-token[draggable]').forEach(tk => {
        tk.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', tk.dataset.talP));
      });
      root.querySelectorAll('.ng-cell[data-cell]').forEach(cellEl => {
        cellEl.addEventListener('dragover', ev => { ev.preventDefault(); cellEl.classList.add('ng-over'); });
        cellEl.addEventListener('dragleave', () => cellEl.classList.remove('ng-over'));
        cellEl.addEventListener('drop', ev => {
          ev.preventDefault(); cellEl.classList.remove('ng-over');
          const pid = ev.dataTransfer.getData('text/plain');
          const [row, col] = cellEl.dataset.cell.split(':').map(Number);
          const it = check.items.find(i => i.personId === pid);
          if (it) { it.box = { pot: row, perf: col }; it.source = 'override'; Store.update('talentChecks', check.id, {}); rerender(); }
        });
      });
      root.querySelectorAll('.ng-token').forEach(tk => tk.onclick = () => {
        const it = check.items.find(i => i.personId === tk.dataset.talP);
        if (it) tcPersonModal(check, it, rerender);
      });
      root.querySelectorAll('[data-tc-kp]').forEach(row2 => row2.onclick = () =>
        kpEditModal(Store.get('keyPositions', row2.dataset.tcKp), rerender));
      const sv = root.querySelector('#tc-save');
      if (sv) sv.onclick = () => { Store.update('talentChecks', check.id, {}); UI.toast(t('common.saved')); };
      const snd = root.querySelector('#tc-send');
      if (snd) snd.onclick = () => {
        Store.update('talentChecks', check.id, { status: 'debate', sentAt: Date.now() });
        UI.notify(t('tc.notifSent') + ' - ' + me.name, 'hr');
        UI.toast(t('tc.sent')); rerender();
      };
    } else {
      root.querySelectorAll('.ng-token').forEach(tk => tk.onclick = () => profileModal(tk.dataset.talP));
      const fin = root.querySelector('#tc-final');
      if (fin) fin.onclick = () => {
        Store.update('talentChecks', check.id, { status: 'final', discussedAt: Date.now() });
        UI.notify(t('tc.notifFinal') + ' - ' + me.name, 'manager');
        UI.toast(t('tc.discussed')); rerender();
      };
    }
  }

  /* HR karta: stav checků per manažer + kadence */
  function tcHrCardHtml() {
    if (tcCadence() === 'off') return '';
    const ps = Store.list('people');
    const managers = ps.filter(m => ps.some(p => p.managerId === m.id));
    const rows = managers.map(m => {
      const c = tcOf(m.id);
      return `<div class="kp-row" ${c && c.status !== 'draft' ? `data-tc-open="${m.id}"` : 'style="cursor:default"'}>
        <div class="kp-main" style="display:flex;gap:8px;align-items:center">${avatar(m, 26)} <b>${esc(m.name)}</b>
          <small style="color:var(--text-muted)">${ps.filter(p => p.managerId === m.id).length} ${esc(t('ob.people'))}</small></div>
        <div class="kp-mid">${tcStatusBadge(c ? c.status : null)}</div>
        <div class="kp-succs">${c && c.status === 'debate' ? `<span class="badge b-blue">${icon('checkin', 12)} ${esc(t('tc.awaitingDebate'))}</span>` : ''}
          ${c && c.status === 'final' && c.discussedAt ? `<small style="color:var(--text-muted)">${UI.fmtDate(c.discussedAt)}</small>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2 style="margin:0">${icon('clock', 18)}${esc(t('tc.hrCard'))} · ${esc(tcPeriod())}</h2>
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="tc-print">${icon('print', 14)} ${esc(t('tc.print'))}</button>
      </div>
      <p class="page-sub" style="margin:6px 0 8px">${esc(t('tc.hrCardSub'))}</p>
      ${rows || `<p class="page-sub">-</p>`}
    </div>`;
  }
  function bindTcHrCard(root) {
    root.querySelectorAll('[data-tc-open]').forEach(r2 => r2.onclick = () => { location.hash = '#/talentcheck/' + r2.dataset.tcOpen; });
    const pr = root.querySelector('#tc-print');
    if (pr) pr.onclick = printBoardReport;
  }

  /* ---------------- tisková sestava pro poradu vedení ---------------- */
  function printBoardReport() {
    const co = Store.getCompany();
    const ps = Store.list('people').filter(p => p.managerId);
    const entries = ps.map(entryOf);
    const placed = entries.filter(e => e.row && e.col);
    const kps = Store.list('keyPositions').filter(kp => kpRated(kp) && kpIsKey(kp));
    const uncovered = kps.filter(kp => !(kp.successors || []).length);
    const retention = placed.filter(e => e.tal && e.tal.potential === 'high' && ['mid', 'high'].includes(e.tal.attrition));
    const managers = Store.list('people').filter(m => Store.list('people').some(p => p.managerId === m.id));
    const pname = pid => { const p = Store.get('people', pid); return p ? p.name : '?'; };

    const pr = document.getElementById('print-root');
    pr.innerHTML = `
      <h1>${esc(co ? co.name : 'TeamPulse')} - ${esc(t('tc.reportTitle'))}</h1>
      <p class="meta">${esc(tcPeriod())} · ${UI.fmtDate(Date.now())} · ${esc(t('tal.privacyNote'))}</p>

      <h2>${esc(t('tc.reportSummary'))}</h2>
      <table><tr><th>${esc(t('tal.mapped'))}</th><th>${esc(t('tal.box.b33'))}</th><th>${esc(t('tal.retention'))}</th><th>${esc(t('kp.keyCount'))}</th><th>${esc(t('kp.noSucc'))}</th></tr>
      <tr><td>${placed.length}/${entries.length}</td><td>${placed.filter(e => e.row === 3 && e.col === 3).length}</td><td>${retention.length}</td><td>${kps.length}</td><td>${uncovered.length}</td></tr></table>

      <h2>${esc(t('kp.sectionTitle'))}</h2>
      <table><tr><th>${esc(t('kp.title'))}</th><th>${esc(t('people.dept'))}</th><th>${esc(t('kp.holder'))}</th><th>${esc(t('kp.checklist'))}</th><th>${esc(t('kp.succ'))}</th></tr>
      ${Store.list('keyPositions').map(kp => `<tr>
        <td>${esc(kp.title)}</td><td>${esc(kp.dept || kp.deptKey || '-')}</td>
        <td>${kp.holderId ? esc(pname(kp.holderId)) : esc(t('kp.vacancy'))}</td>
        <td>${kpYes(kp)}/12 ${esc(t('kp.yes'))} - ${esc(t(kpRated(kp) ? (kpIsKey(kp) ? 'kp.result.key' : 'kp.result.notKey') : 'kp.result.unrated'))}</td>
        <td>${(kp.successors || []).map(s => esc(pname(s.personId)) + ' (' + esc(t(s.level === 'key' ? 'kp.succKey' : 'kp.succReg')) + (s.readiness ? ', ' + esc(t('tal.rd.' + s.readiness)) : '') + ')').join('; ') || (kpRated(kp) && kpIsKey(kp) ? '⚠ ' + esc(t('kp.noSucc')) : '-')}</td>
      </tr>`).join('')}</table>

      ${retention.length ? `<h2>${esc(t('tal.retention'))}</h2>
      <table><tr><th>${esc(t('people.name'))}</th><th>${esc(t('people.role'))}</th><th>${esc(t('rev.talent.attrition'))}</th></tr>
      ${retention.map(e => `<tr><td>${esc(e.p.name)}</td><td>${esc(e.p.role)}</td><td>${esc(t('tal.att.' + e.tal.attrition))}</td></tr>`).join('')}</table>` : ''}

      <h2>${esc(t('tal.gridTitle'))}</h2>
      <table>${[3, 2, 1].map(row => `<tr>${[1, 2, 3].map(col => {
        const key = BOXES[3 - row][col - 1];
        const items = placed.filter(e => e.row === row && e.col === col);
        return `<td style="vertical-align:top;width:33%"><b>${esc(t('tal.box.' + key))}</b> (${items.length})<br>
          <small>${items.map(e => esc(e.p.name)).join(', ') || '-'}</small></td>`;
      }).join('')}</tr>`).join('')}</table>

      <h2>${esc(t('tc.hrCard'))} · ${esc(tcPeriod())}</h2>
      <table><tr><th>${esc(t('rev.evaluator'))}</th><th>${esc(t('rev.status'))}</th></tr>
      ${managers.map(m => { const c = tcOf(m.id); return `<tr><td>${esc(m.name)}</td><td>${esc(t('tc.status.' + (c ? c.status : 'none')))}</td></tr>`; }).join('')}</table>

      <p class="meta">TeamPulse · ${esc(t('tc.reportFooter'))}</p>`;
    pr.hidden = false;
    window.print();
    setTimeout(() => { pr.hidden = true; }, 400);
  }

  window.TalentViews = { renderHr, renderMyTeam, renderCheck, profileModal, printBoardReport };
})();
