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

      ${successionCardHtml(Store.list('keyPositions').filter(kp => !talUi.dept || kp.deptKey === talUi.dept))}

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
    const kpByHolder = {}, succLevel = {};
    Store.list('keyPositions').forEach(kp => {
      if (kp.holderId && kpRated(kp) && kpIsKey(kp)) kpByHolder[kp.holderId] = kp;
      (kp.successors || []).forEach(s => {
        succLevel[s.personId] = succLevel[s.personId] === 'key' ? 'key' : s.level;
      });
    });
    return { kpByHolder, succLevel };
  }
  window.SuccLogic = { kpYes, kpAnswered, kpIsKey, kpRated, succMaps, KP_CATS };

  function kpResultBadge(kp) {
    if (!kpRated(kp)) return `<span class="badge b-amber">${esc(t('kp.result.unrated'))} · ${kpAnswered(kp)}/12</span>`;
    return kpIsKey(kp)
      ? `<span class="badge b-blue">${esc(t('kp.result.key'))} · ${kpYes(kp)}/12 ${esc(t('kp.yes'))}</span>`
      : `<span class="badge">${esc(t('kp.result.notKey'))} · ${kpYes(kp)}/12 ${esc(t('kp.yes'))}</span>`;
  }

  function succChip(s) {
    const p = Store.get('people', s.personId); if (!p) return '';
    return `<span class="kp-succ ${s.level === 'key' ? 'kp-succ-key' : 'kp-succ-reg'}" title="${esc(t(s.level === 'key' ? 'kp.succKey' : 'kp.succReg'))}${s.readiness ? ' · ' + esc(t('tal.rd.' + s.readiness)) : ''}">
      ${avatar(p, 22)} ${esc(p.firstName)} ${s.readiness ? `<small>${esc(t('tal.rd.' + s.readiness))}</small>` : ''}</span>`;
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
            ${(kp.successors || []).length ? kp.successors.map(succChip).join('') : (isU ? `<span class="badge b-red">${icon('alert', 12)} ${esc(t('kp.noSucc'))}</span>` : '<span style="color:var(--text-muted);font-size:.82rem">-</span>')}
          </div>
        </div>`;
      }).join('') : `<div class="empty" style="padding:18px">${icon('tree', 40)}<br>${esc(t('kp.empty'))}</div>`}
    </div>`;
  }

  function bindSuccessionCard(root, rerender) {
    const add = root.querySelector('#kp-add-btn');
    if (add) add.onclick = () => kpEditModal(null, rerender);
    root.querySelectorAll('[data-kp-edit]').forEach(row => row.onclick = () => kpEditModal(Store.get('keyPositions', row.dataset.kpEdit), rerender));
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

    root.innerHTML = `
      <h1 class="page-title">${esc(t('mt.title'))} <span class="badge b-blue">${team.length}</span></h1>
      <p class="page-sub">${esc(t('mt.sub'))}</p>
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

  window.TalentViews = { renderHr, renderMyTeam, profileModal };
})();
