/* TeamPulse demo v2 — review workflow
   Wizard (6 kroků: reflexe → oblasti → vyhodnocení cílů → nové cíle → rozvoj → náhled),
   manažerský flow s potvrzováním cílů, potvrzení hodnoceným, skóre + pásmo, tisk.
   Also defines window.UI — shared rendering helpers used by app.js. */
(function () {

  /* ====================== shared UI helpers ====================== */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
    return d.toLocaleDateString(I18N.locale === 'en' ? 'en-GB' : I18N.locale === 'de' ? 'de-DE' : 'cs-CZ');
  }

  function avatar(p, size) {
    size = size || 36;
    if (!p) return `<span class="avatar" style="width:${size}px;height:${size}px;background:#999;font-size:${size * .38}px">?</span>`;
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:hsl(${p.hue},62%,46%);font-size:${size * .38}px" title="${esc(p.name)}">${esc(p.initials)}</span>`;
  }

  const ST_COLOR = {
    draft: '', pending_self: 'b-amber', self_in_progress: 'b-amber', self_done: 'b-blue',
    manager_in_progress: 'b-blue', manager_done: 'b-blue', conversation_scheduled: 'b-blue',
    conversation_done: 'b-blue', awaiting_employee_confirmation: 'b-amber',
    confirmed: 'b-green', closed_by_hr: 'b-green', cancelled: 'b-red',
  };
  const stBadge = st => `<span class="badge ${ST_COLOR[st] || ''}">${esc(t('st.' + st))}</span>`;

  let toastTimer;
  function toast(msg) {
    const layer = document.getElementById('toast-layer');
    layer.innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => layer.innerHTML = '', 2600);
  }

  function modal(html, onMount) {
    const layer = document.getElementById('modal-layer');
    layer.hidden = false;
    layer.innerHTML = `<div class="modal">${html}</div>`;
    layer.onclick = e => { if (e.target === layer) closeModal(); };
    if (onMount) onMount(layer.querySelector('.modal'));
  }
  function closeModal() {
    const layer = document.getElementById('modal-layer');
    layer.hidden = true; layer.innerHTML = '';
  }

  function notify(text, forRole) {
    Store.insert('notifications', { id: uid(), text, forRole: forRole || 'all', at: Date.now(), read: false });
  }

  /* KPI lookup: kpiRef {type:'company'|'team', id} → label */
  function kpiName(ref) {
    if (!ref) return null;
    const co = Store.getCompany(); if (!co) return null;
    const k = ref.type === 'team'
      ? (co.teamKpis || []).find(x => x.id === ref.id)
      : (co.kpis || []).find(x => x.id === ref.id);
    return k ? k.title : null;
  }
  function kpiChip(ref, size) {
    const n = kpiName(ref);
    return n
      ? `<span class="badge b-blue" title="${esc(t('goals.kpi'))}">${icon(ref.type === 'team' ? 'team' : 'building', size || 12)} ${esc(n)}</span>`
      : `<span class="badge">${icon('sprout', size || 12)} ${esc(t('goals.kpiNone'))}</span>`;
  }

  window.UI = { esc, fmtDate, avatar, stBadge, toast, modal, closeModal, notify, kpiName, kpiChip };

  /* ====================== review logic ====================== */
  const SCALE_DEF = [
    { k: 'TN' }, { k: 'PO' }, { k: 'KV' }, { k: 'NR' }, { k: 'NU' }, { k: 'NA' },
  ];
  const scaleLabel = k => t('help.scale.' + (k === 'NA' ? 'NA' : k));
  const RATING_VALUE = { TN: 1.2, PO: 1.1, KV: 1.0, NR: 0.85, NU: 0.7 };

  function daysLeft(r) { return Math.ceil((r.deadline - Date.now()) / 86400000); }
  function risk(r) {
    if (['confirmed', 'closed_by_hr', 'cancelled'].includes(r.status)) return 'none';
    const d = daysLeft(r);
    if (d < 0) return 'blocked';
    if (d <= 7) return 'risk';
    return 'ok';
  }

  /* Vážené skóre: za každou oblast = průměr (rating oblasti od manažera,
     vážený výsledek cílů oblasti). Celkem = průměr oblastí. */
  function computeScore(form) {
    const areas = Generator.AREAS;
    let sum = 0, cnt = 0;
    const fw = (Store.getCompany() || {}).competencies;
    areas.forEach(a => {
      const parts = [];
      let av = RATING_VALUE[form.mgr.areas[a]];
      if (fw && form.compRatings && form.compRatings.mgr) {
        const comps = fw.filter(c => c.areaKey === a && RATING_VALUE[form.compRatings.mgr[c.key]] != null);
        const wT = comps.reduce((x, c) => x + c.weight, 0);
        if (wT > 0) av = comps.reduce((x, c) => x + c.weight * RATING_VALUE[form.compRatings.mgr[c.key]], 0) / wT;
      }
      if (av != null) parts.push(av);
      const goals = form.goalsEval.filter(g => g.areaKey === a && RATING_VALUE[g.mgrRating || g.rating] != null);
      const wTot = goals.reduce((s, g) => s + g.weight, 0);
      if (wTot > 0) parts.push(goals.reduce((s, g) => s + g.weight * RATING_VALUE[g.mgrRating || g.rating], 0) / wTot);
      if (parts.length) { sum += parts.reduce((x, y) => x + y, 0) / parts.length; cnt++; }
    });
    return cnt ? sum / cnt : null;
  }
  function band(score) {
    if (score == null) return null;
    if (score >= 1.1) return { key: 'top', cls: 'b-green' };
    if (score >= 0.95) return { key: 'std', cls: 'b-blue' };
    if (score >= 0.85) return { key: 'dev', cls: 'b-amber' };
    return { key: 'risk', cls: 'b-red' };
  }
  function scoreCard(form) {
    const s = computeScore(form);
    if (s == null) return '';
    const b = band(s);
    return `<div class="card"><h2>${icon('gauge', 18)}${esc(t('rev.score'))}</h2>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="kpi-num">${s.toFixed(2)}</div>
        <span class="badge ${b.cls}" style="font-size:.85rem">${esc(t('band.' + b.key))}</span>
      </div>
      <p class="hint" style="color:var(--text-muted);margin-top:8px">${esc(t('hr.compHint'))}</p></div>`;
  }

  window.ReviewLogic = { daysLeft, risk, SCALE_DEF, scaleLabel, RATING_VALUE, computeScore, band };

  function getReview(id) { return Store.get('reviews', id); }
  function person(id) { return Store.get('people', id); }
  function saveForm(r) { Store.update('reviews', r.id, { form: r.form }); }
  function transition(r, status, notifText, role) {
    Store.update('reviews', r.id, { status });
    if (notifText) notify(notifText, role);
  }

  function scaleRowHtml(name, selected, readOnly) {
    return `<div class="scale-row" data-scale="${name}">` + SCALE_DEF.map(s =>
      `<button type="button" class="scale-opt ${selected === s.k ? 'sel' : ''} ${readOnly ? 'ghost' : ''}"
        data-val="${s.k}" ${readOnly ? 'disabled' : ''}><b>${s.k}</b>${esc(scaleLabel(s.k))}</button>`
    ).join('') + `</div>`;
  }
  function scaleRowSmHtml(name, selected) {
    return `<div class="scale-row sm" data-scale="${name}">` + SCALE_DEF.map(x =>
      `<button type="button" class="scale-opt ${selected === x.k ? 'sel' : ''}" data-val="${x.k}" title="${esc(scaleLabel(x.k))}"><b>${x.k}</b></button>`
    ).join('') + `</div>`;
  }

  function bindScaleRows(root, onPick) {
    root.querySelectorAll('.scale-row').forEach(row => {
      row.addEventListener('click', e => {
        const btn = e.target.closest('.scale-opt'); if (!btn || btn.disabled) return;
        row.querySelectorAll('.scale-opt').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        onPick(row.dataset.scale, btn.dataset.val);
      });
    });
  }

  const AREAS = ['teamwork', 'growth', 'quality'];
  const areaName = a => t('rev.area.' + a);

  /* ---------- competency framework ---------- */
  function compFramework() {
    const co = Store.getCompany();
    return (co && co.competencies && co.competencies.length) ? co.competencies : null;
  }
  function ensureCompRatings(f) {
    if (!f.compRatings) f.compRatings = { self: {}, mgr: {} };
    return f.compRatings;
  }

  /* ---------- new-goals helpers ---------- */
  function goalPolicy() {
    const co = Store.getCompany();
    return (co && co.goalPolicy) || Generator.DEFAULT_GOAL_POLICY;
  }
  function initNewGoals(r) {
    if (r.form.newGoals && r.form.newGoals.length) return;
    const co = Store.getCompany();
    const subj = person(r.subjectId);
    /* Rollover: nové cíle předvyplníme z běžících cílů — edituj, nezakládej. */
    const existing = Store.list('goals').filter(g => g.ownerId === r.subjectId && g.type === 'personal' && g.period === r.period);
    if (existing.length) {
      r.form.newGoals = existing.map(g => ({
        id: uid(), areaKey: g.areaKey, title: g.title, desc: g.desc,
        weight: g.weight, kpiRef: g.kpiRef || null, mgrConfirmed: false,
      }));
      saveForm(r);
      return;
    }
    const tpls = co && co.industry ? Generator.INDUSTRIES[co.industry].goalTemplates : null;
    const list = [];
    AREAS.forEach(a => {
      const n = Math.max(2, goalPolicy()[a] || 2);
      const ws = Generator.weightsFor(n);
      for (let i = 0; i < n; i++) {
        const tpl = tpls ? tpls[a][i % tpls[a].length] : null;
        list.push({
          id: uid(), areaKey: a,
          title: tpl ? tpl[0] + (i >= (tpls ? tpls[a].length : 0) ? ' II' : '') : '',
          desc: tpl ? tpl[1] : '',
          weight: ws[i],
          kpiRef: tpl && (Generator.KPI_REQUIRED[a] || Math.random() < .5)
            ? defaultKpiRef(a, subj, co) : null,
          mgrConfirmed: false,
        });
      }
    });
    r.form.newGoals = list;
    saveForm(r);
  }
  function defaultKpiRef(areaKey, subj, co) {
    const teamK = (co.teamKpis || []).filter(k => subj && k.deptKey === subj.deptKey);
    if (teamK.length) return { type: 'team', id: teamK[0].id };
    if (co.kpis && co.kpis.length) return { type: 'company', id: co.kpis[0].id };
    return null;
  }
  function areaSum(list, a) { return list.filter(g => g.areaKey === a).reduce((s, g) => s + (+g.weight || 0), 0); }
  function newGoalsErrors(list) {
    const errs = [];
    AREAS.forEach(a => {
      const items = list.filter(g => g.areaKey === a);
      if (areaSum(list, a) !== 100) errs.push(areaName(a) + ': ' + t('goals.sumBad'));
      items.forEach(g => {
        if (!String(g.title).trim()) errs.push(areaName(a) + ': ' + t('goals.name'));
        if (Generator.KPI_REQUIRED[a] && !g.kpiRef) errs.push(areaName(a) + ': ' + t('goals.kpiRequired'));
      });
    });
    return [...new Set(errs)];
  }
  function kpiSelectHtml(g, subj) {
    const co = Store.getCompany() || { kpis: [], teamKpis: [] };
    const req = Generator.KPI_REQUIRED[g.areaKey];
    const sel = v => (g.kpiRef && g.kpiRef.type + ':' + g.kpiRef.id === v) ? 'selected' : '';
    const teamK = (co.teamKpis || []).filter(k => !subj || k.deptKey === subj.deptKey);
    return `<select class="input" data-ng-kpi="${g.id}">
      ${req ? '' : `<option value="">${esc(t('goals.kpiNone'))}</option>`}
      <optgroup label="${esc(t('goals.company'))}">
        ${(co.kpis || []).map(k => `<option value="company:${k.id}" ${sel('company:' + k.id)}>${esc(k.title)}</option>`).join('')}
      </optgroup>
      <optgroup label="${esc(t('hr.teamKpis'))}">
        ${teamK.map(k => `<option value="team:${k.id}" ${sel('team:' + k.id)}>${esc(k.title)} (${esc(k.dept)})</option>`).join('')}
      </optgroup>
    </select>`;
  }

  /* ====================== employee wizard (6 kroků) ====================== */
  function renderWizard(root, r) {
    if (r.type === 'semi') return renderSemiWizard(root, r);
    const f = r.form;
    if (r.status === 'pending_self') transition(r, 'self_in_progress');
    initNewGoals(r);
    const step = f.wizardStep || 1;
    const total = 6;
    const subj = person(r.subjectId);

    const stepsBar = `<div class="wizard-steps">` +
      Array.from({ length: total }, (_, i) => `<div class="wstep ${i < step ? 'done' : ''}"></div>`).join('') + `</div>`;

    let body = '';
    if (step === 1) {
      body = `
        <h2>${esc(t(r.type === 'probation' ? 'misc.probation' : 'rev.selfTitle'))} — ${esc(t('common.step'))} 1/${total}</h2>
        <div class="field"><label>${esc(t(r.type === 'probation' ? 'rev.q.adapt1' : 'rev.q.success'))}</label>
          <textarea class="input" data-f="success">${esc(f.self.success)}</textarea>
          <div class="hint">${esc(t('rev.q.successHint'))}</div></div>
        <div class="field"><label>${esc(t(r.type === 'probation' ? 'rev.q.adapt2' : 'rev.q.challenge'))}</label>
          <textarea class="input" data-f="challenge">${esc(f.self.challenge)}</textarea></div>
        <div class="field"><label>${esc(t(r.type === 'probation' ? 'rev.q.adapt3' : 'rev.q.improve'))}</label>
          <textarea class="input" data-f="improve">${esc(f.self.improve)}</textarea></div>`;
    } else if (step === 2) {
      const fw = compFramework();
      if (fw) {
        const cr = ensureCompRatings(f);
        body = `<h2>${esc(t('rev.areas'))} — ${esc(t('common.step'))} 2/${total}</h2>` +
          AREAS.map(a => {
            const comps = fw.filter(c => c.areaKey === a);
            if (!comps.length) return '';
            return `<h2 style="margin-top:14px">${esc(areaName(a))}</h2>` + comps.map(c =>
              `<div class="field"><label>${esc(c.title)} <span class="badge">${c.weight} %</span></label>
               ${scaleRowHtml('comp.' + c.key, cr.self[c.key])}</div>`).join('');
          }).join('');
      } else {
        body = `<h2>${esc(t('rev.areas'))} — ${esc(t('common.step'))} 2/${total}</h2>` +
          AREAS.map(a => `<div class="field"><label>${esc(areaName(a))}</label>${scaleRowHtml('self.' + a, f.self.areas[a])}</div>`).join('');
      }
    } else if (step === 3) {
      body = `<h2>${esc(t('rev.goalsEval'))} — ${esc(t('common.step'))} 3/${total}</h2>` +
        (f.goalsEval.length === 0 ? `<p class="page-sub">${esc(t('rev.noHistory'))}</p>` :
          AREAS.map(a => {
            const items = f.goalsEval.map((g, i) => ({ g, i })).filter(x => x.g.areaKey === a);
            if (!items.length) return '';
            return `<h2 style="margin-top:18px">${esc(areaName(a))}</h2>` + items.map(({ g, i }) => `
              <div class="card" style="margin-bottom:12px">
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                  <b>${esc(g.title)}</b>
                  <span class="badge">${esc(t('goals.weight'))} ${g.weight} %</span>
                  ${kpiChip(g.kpiRef)}
                </div>
                <div class="field" style="margin-top:8px"><label>${esc(t('rev.summary'))}</label>
                  <textarea class="input" data-goal="${i}" style="min-height:64px">${esc(g.outcome)}</textarea></div>
                ${scaleRowHtml('goal.' + i, g.rating)}
              </div>`).join('');
          }).join(''));
    } else if (step === 4) {
      body = `<h2>${esc(t('rev.goalsNew'))} — ${esc(t('common.step'))} 4/${total}</h2>
        <p class="page-sub">${esc(t('rev.newGoalsHint'))}</p>` +
        AREAS.map(a => {
          const items = f.newGoals.filter(g => g.areaKey === a);
          const sum = areaSum(f.newGoals, a);
          return `<div style="margin:18px 0 6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <h2 style="margin:0">${esc(areaName(a))}</h2>
              <span class="badge ${sum === 100 ? 'b-green' : 'b-amber'}" data-sum="${a}">${esc(t('goals.sum'))}: ${sum} %</span>
              ${Generator.KPI_REQUIRED[a] ? `<span class="badge b-blue">${icon('building', 11)} ${esc(t('goals.kpi'))}</span>` : ''}
            </div>` + items.map(g => `
            <div class="card" style="margin-bottom:10px">
              <div class="grid cols-2">
                <div class="field" style="margin-bottom:8px"><label>${esc(t('goals.name'))}</label>
                  <input class="input" data-ng-title="${g.id}" value="${esc(g.title)}"></div>
                <div class="field" style="margin-bottom:8px"><label>${esc(t('goals.weight'))} (%)</label>
                  <input class="input" type="number" min="5" max="90" step="5" data-ng-w="${g.id}" value="${g.weight}"></div>
              </div>
              <div class="field" style="margin-bottom:8px"><label>${esc(t('goals.desc'))}</label>
                <input class="input" data-ng-desc="${g.id}" value="${esc(g.desc)}" placeholder="${esc(t('goals.smartHint'))}"></div>
              <div class="field" style="margin-bottom:0"><label>${esc(t('goals.kpi'))}</label>${kpiSelectHtml(g, subj)}</div>
            </div>`).join('');
        }).join('');
    } else if (step === 5) {
      const tags = ['Prezentační dovednosti', 'Time management', 'Jazykový kurz AJ', 'Odborná certifikace', 'Leadership základy', 'Excel pokročilý'];
      body = `
        <h2>${esc(t('rev.trainings'))} + ${esc(t('rev.summary'))} — ${esc(t('common.step'))} 5/${total}</h2>
        <div class="field"><label>${esc(t('rev.trainings'))}</label>
          <div class="hint" style="margin-bottom:6px">${esc(t('rev.trainingsHint'))}</div>
          <div id="train-tags">${tags.map(tag =>
            `<button type="button" class="badge ${f.trainings.includes(tag) ? 'b-blue' : ''}" data-tag="${esc(tag)}" style="margin:3px;cursor:pointer">${esc(tag)}</button>`).join('')}
          </div></div>
        <div class="field"><label>${esc(t('rev.summary'))}</label>
          <textarea class="input" data-f="summary">${esc(f.self.summary)}</textarea></div>`;
    } else {
      body = `<h2>${esc(t('rev.preview'))} — ${esc(t('common.step'))} 6/${total}</h2>
        <p class="page-sub">${esc(t('rev.previewHint'))}</p>
        ${previewSelfHtml(r)}`;
    }

    root.innerHTML = `
      <h1 class="page-title">${esc(t('rev.selfTitle'))}</h1>
      <p class="page-sub">${esc(subj ? subj.name : '')} · ${esc(r.period)} · ${esc(t('rev.deadline'))}: ${fmtDate(r.deadline)}</p>
      ${stepsBar}
      <div class="card">${body}
        <div class="wizard-foot">
          <div>${step > 1 ? `<button class="btn" id="w-back">${icon('arrowL', 15)} ${esc(t('common.back'))}</button>` : ''}</div>
          <div style="display:flex;gap:8px">
            ${step < total ? `<button class="btn btn-primary" id="w-next">${esc(t('common.next'))} ${icon('arrowR', 15)}</button>`
              : `<button class="btn" id="w-save">${esc(t('common.save'))}</button>
                 <button class="btn btn-primary" id="w-send">${esc(t('common.saveSend'))} ${icon('send', 15)}</button>`}
          </div>
        </div>
        <p class="hint" style="margin-top:10px;color:var(--text-muted);font-size:.8rem">${icon('check', 13)} ${esc(t('rev.autosave'))}</p>
      </div>`;

    const collect = () => {
      root.querySelectorAll('[data-f]').forEach(el => {
        if (el.dataset.f === 'summary') r.form.self.summary = el.value;
        else r.form.self[el.dataset.f] = el.value;
      });
      root.querySelectorAll('[data-goal]').forEach(el => { r.form.goalsEval[+el.dataset.goal].outcome = el.value; });
      root.querySelectorAll('[data-ng-title]').forEach(el => { const g = r.form.newGoals.find(x => x.id === el.dataset.ngTitle); if (g) g.title = el.value; });
      root.querySelectorAll('[data-ng-desc]').forEach(el => { const g = r.form.newGoals.find(x => x.id === el.dataset.ngDesc); if (g) g.desc = el.value; });
      root.querySelectorAll('[data-ng-w]').forEach(el => { const g = r.form.newGoals.find(x => x.id === el.dataset.ngW); if (g) g.weight = +el.value || 0; });
      root.querySelectorAll('[data-ng-kpi]').forEach(el => {
        const g = r.form.newGoals.find(x => x.id === el.dataset.ngKpi); if (!g) return;
        if (!el.value) { g.kpiRef = null; return; }
        const [type, id] = el.value.split(':'); g.kpiRef = { type, id };
      });
      saveForm(r);
    };
    root.querySelectorAll('textarea, input, select').forEach(el => el.addEventListener('change', collect));
    /* live sum indicators in step 4 */
    root.querySelectorAll('[data-ng-w]').forEach(el => el.addEventListener('input', () => {
      collect();
      AREAS.forEach(a => {
        const chip = root.querySelector(`[data-sum="${a}"]`); if (!chip) return;
        const sum = areaSum(r.form.newGoals, a);
        chip.textContent = t('goals.sum') + ': ' + sum + ' %';
        chip.className = 'badge ' + (sum === 100 ? 'b-green' : 'b-amber');
      });
    }));
    bindScaleRows(root, (name, val) => {
      if (name.startsWith('self.')) r.form.self.areas[name.slice(5)] = val;
      if (name.startsWith('goal.')) r.form.goalsEval[+name.slice(5)].rating = val;
      if (name.startsWith('comp.')) ensureCompRatings(r.form).self[name.slice(5)] = val;
      saveForm(r);
    });
    root.querySelectorAll('#train-tags .badge').forEach(b => b.addEventListener('click', () => {
      const tag = b.dataset.tag;
      const i = r.form.trainings.indexOf(tag);
      if (i >= 0) r.form.trainings.splice(i, 1); else r.form.trainings.push(tag);
      saveForm(r); renderWizard(root, r);
    }));
    const go = s => {
      collect();
      /* nováček nemá cíle k vyhodnocení — krok 3 se přeskakuje */
      if (s === 3 && r.form.goalsEval.length === 0) s = s > step ? 4 : 2;
      r.form.wizardStep = s; saveForm(r); renderWizard(root, r); window.scrollTo(0, 0);
    };
    const back = root.querySelector('#w-back'); if (back) back.onclick = () => go(step - 1);
    const next = root.querySelector('#w-next'); if (next) next.onclick = () => {
      collect();
      if (step === 4) {
        const errs = newGoalsErrors(r.form.newGoals);
        if (errs.length) { toast(errs[0]); return; }
      }
      go(step + 1);
    };
    const save = root.querySelector('#w-save'); if (save) save.onclick = () => { collect(); toast(t('common.saved')); };
    const send = root.querySelector('#w-send'); if (send) send.onclick = () => {
      collect();
      const errs = newGoalsErrors(r.form.newGoals);
      if (errs.length) { toast(errs[0]); return; }
      r.form.versions.push({ label: 'v1_self', at: Date.now() });
      saveForm(r);
      transition(r, 'self_done', ((person(r.subjectId) || {}).name || '') + ' — ' + t('st.self_done'), 'manager');
      toast(t('st.self_done'));
      location.hash = '#/myreviews';
    };
  }

  /* ---------- shared goal render blocks ---------- */
  function goalsByAreaHtml(list, opts) {
    opts = opts || {};
    return AREAS.map(a => {
      const items = list.filter(g => g.areaKey === a);
      if (!items.length) return '';
      const sum = areaSum(list, a);
      return `<div style="margin-top:12px"><b>${esc(areaName(a))}</b>
        <span class="badge ${sum === 100 ? 'b-green' : 'b-amber'}">${sum} %</span>
        ${items.map(g => `<p style="margin:6px 0 0 2px;font-size:.92rem">
          · ${esc(g.title)} <span class="badge">${g.weight} %</span>
          ${kpiChip(g.kpiRef)}
          ${g.rating ? `<span class="badge">${esc(t('misc.you'))}: ${g.rating}</span>` : ''}
          ${g.mgrRating ? `<span class="badge b-blue">${g.mgrRating}</span>` : ''}
          ${g.mgrNote ? `<span style="color:var(--text-muted);font-size:.84rem"> — ${esc(g.mgrNote)}</span>` : ''}
          ${opts.showConfirm ? (g.mgrConfirmed ? `<span class="badge b-green">${icon('check', 11)} ${esc(t('goals.confirmed'))}</span>` : `<span class="badge b-amber">${esc(t('goals.notConfirmed'))}</span>`) : ''}
          ${g.outcome ? `<br><span style="color:var(--text-muted);font-size:.85rem;margin-left:12px">${esc(g.outcome)}</span>` : ''}
        </p>`).join('')}</div>`;
    }).join('');
  }

  function previewSelfHtml(r) {
    const f = r.form;
    return `
      <div class="card" style="background:var(--surface-2)">
        <h2>${esc(t('rev.v1'))}</h2>
        <p><b>${esc(t('rev.q.success'))}</b><br>${esc(f.self.success) || '—'}</p>
        <p style="margin-top:8px"><b>${esc(t('rev.q.challenge'))}</b><br>${esc(f.self.challenge) || '—'}</p>
        <p style="margin-top:8px"><b>${esc(t('rev.q.improve'))}</b><br>${esc(f.self.improve) || '—'}</p>
        ${(compFramework() && f.compRatings) ? `<p style="margin-top:8px"><b>${esc(t('rev.areas'))}:</b> ${compFramework().map(c => `${esc(c.title)}: <b>${f.compRatings.self[c.key] || '—'}</b>`).join(' · ')}</p>`
          : `<p style="margin-top:8px"><b>${esc(t('rev.areas'))}:</b> ${AREAS.map(a => `${esc(areaName(a))}: <b>${f.self.areas[a] || '—'}</b>`).join(' · ')}</p>`}
        ${f.goalsEval.length ? `<div style="margin-top:8px"><b>${esc(t('rev.goalsEval'))}</b>${goalsByAreaHtml(f.goalsEval)}</div>` : ''}
        ${f.newGoals.length ? `<div style="margin-top:12px"><b>${esc(t('rev.goalsNew'))}</b>${goalsByAreaHtml(f.newGoals)}</div>` : ''}
        ${f.trainings.length ? `<p style="margin-top:8px"><b>${esc(t('rev.trainings'))}:</b> ${f.trainings.map(esc).join(', ')}</p>` : ''}
        <p style="margin-top:8px"><b>${esc(t('rev.summary'))}:</b> ${esc(f.self.summary) || '—'}</p>
      </div>`;
  }

  /* ====================== manager flow ====================== */
  function renderManagerEditor(root, r) {
    if (r.type === 'semi') return renderSemiManager(root, r);
    const f = r.form, subj = person(r.subjectId);
    if (r.status === 'self_done') transition(r, 'manager_in_progress');
    /* Tichá shoda: manažerovo hodnocení předvyplníme ze sebehodnocení —
       upravuje jen tam, kde nesouhlasí. */
    if (!f.mgrPrefilled) {
      AREAS.forEach(a => { if (!f.mgr.areas[a] && f.self.areas[a]) f.mgr.areas[a] = f.self.areas[a]; });
      const fw0 = compFramework();
      if (fw0) { const cr = ensureCompRatings(f); fw0.forEach(c => { if (!cr.mgr[c.key] && cr.self[c.key]) cr.mgr[c.key] = cr.self[c.key]; }); }
      f.goalsEval.forEach(g => { if (!g.mgrRating && g.rating) g.mgrRating = g.rating; });
      f.mgrPrefilled = true; saveForm(r);
    }
    const st = r.status === 'self_done' ? 'manager_in_progress' : r.status;

    const phase2 = ['manager_done', 'conversation_scheduled'].includes(st);
    const phase3 = st === 'conversation_done';

    const decisionBtns = (g, kind) => `
      <div style="display:flex;gap:6px">
        <button type="button" class="btn btn-sm ${g.mgrDecision === 'agree' ? 'btn-primary' : ''}" data-dec="agree:${kind}:${g.id || g.goalId}">
          ${icon('check', 13)} ${esc(t('rev.goalAgree'))}</button>
        <button type="button" class="btn btn-sm" ${g.mgrDecision === 'discuss' ? 'style="border-color:var(--warn);color:var(--warn)"' : ''} data-dec="discuss:${kind}:${g.id || g.goalId}">
          ${icon('checkin', 13)} ${esc(t('rev.goalDiscuss'))}</button>
      </div>`;
    const goalRow = (g, kind) => `
      <div style="padding:10px 0;border-bottom:1px dashed var(--hairline)">
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <b>${esc(g.title)}</b>
            <span class="badge">${g.weight} %</span> ${kpiChip(g.kpiRef)}
            ${kind === 'eval' && g.rating ? `<span class="badge">${esc(t('misc.you'))}: ${g.rating}</span>` : ''}
            ${g.mgrDecision === 'discuss' ? `<span class="badge b-amber">${esc(t('rev.goalDiscuss'))}</span>` : ''}
            ${g.outcome ? `<div style="font-size:.84rem;color:var(--text-muted);margin-top:3px">${esc(g.outcome)}</div>` : ''}
            ${g.desc && kind === 'new' ? `<div style="font-size:.84rem;color:var(--text-muted);margin-top:3px">${esc(g.desc)}</div>` : ''}
          </div>
          ${kind === 'new' ? `<input class="input" type="number" min="5" max="90" step="5" style="width:84px" data-mw="${g.id}" value="${g.weight}" title="${esc(t('goals.weight'))}">` : ''}
          ${decisionBtns(g, kind)}
        </div>
        ${kind === 'eval' ? `
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
            ${scaleRowSmHtml('mgrg.' + g.goalId, g.mgrRating)}
            <input class="input" style="flex:1;min-width:200px" data-gnote="${g.goalId}" value="${esc(g.mgrNote || '')}" placeholder="${esc(t('rev.goalNoteHint'))}">
          </div>` : ''}
      </div>`;

    root.innerHTML = `
      <h1 class="page-title">${esc(t('rev.evaluate'))}: ${esc(subj.name)}</h1>
      <p class="page-sub">${UI.avatar(subj, 26)} ${esc(subj.role)} · ${esc(r.period)} · ${stBadge(st)}</p>

      <div class="card">
        <h2>${icon('doc', 18)}${esc(t('rev.selfSection'))}</h2>
        ${previewSelfHtml(r)}
      </div>

      <div class="card">
        <h2>${icon('heartPulse', 18)}${esc(t('rev.evidence'))}</h2>
        <p class="page-sub" style="margin-bottom:10px">${esc(t('rev.evidenceHint'))}</p>
        ${(() => {
          const since = r.startedAt - 200 * 86400000;
          const kud = Store.list('kudos').filter(k => k.toId === r.subjectId && k.at > since).slice(-4);
          const cis = Store.list('checkins').filter(c => c.employeeId === r.subjectId && c.at > since).slice(-3);
          const gls = Store.list('goals').filter(g => g.ownerId === r.subjectId && g.type === 'personal' && g.period === r.period);
          let h = '';
          if (gls.length) h += `<div class="bars" style="margin-bottom:10px">${gls.map(g => `
            <div class="brow"><span>${esc(g.title)}</span><div class="progressbar"><div style="width:${g.progress}%"></div></div><b>${g.progress}%</b></div>`).join('')}</div>`;
          if (kud.length) h += kud.map(k => { const fr = person(k.fromId); return `<p style="font-size:.88rem;margin-bottom:4px">${icon('heart', 13)} <b>${esc(fr ? fr.name : '?')}</b>: ${esc(k.msg)}</p>`; }).join('');
          if (cis.length) h += cis.map(c => `<p style="font-size:.88rem;margin-bottom:4px;color:var(--text-muted)">${icon('checkin', 13)} ${fmtDate(c.at)} ${c.mood} — ${esc(c.notes)}</p>`).join('');
          return h || `<p class="page-sub">—</p>`;
        })()}
      </div>

      <div class="card">
        <h2>${icon('target', 18)}${esc(t('rev.mgrGoalsTitle'))}</h2>
        <p class="page-sub" style="margin-bottom:8px">${esc(t('rev.allConfirmRequired'))}</p>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-sm" id="m-confall">${icon('check', 13)} ${esc(t('rev.confirmAll'))}</button></div>
        ${f.goalsEval.length ? `<h2 style="margin-top:8px">${esc(t('goals.prevGoals'))}</h2>` +
          AREAS.map(a => {
            const items = f.goalsEval.filter(g => g.areaKey === a);
            return items.length ? `<div style="margin-top:6px;font-weight:650">${esc(areaName(a))}</div>` + items.map(g => goalRow(g, 'eval')).join('') : '';
          }).join('') : ''}
        ${f.newGoals.length ? `<h2 style="margin-top:16px">${esc(t('rev.newGoalsByEmployee'))}</h2>` +
          AREAS.map(a => {
            const items = f.newGoals.filter(g => g.areaKey === a);
            const sum = areaSum(f.newGoals, a);
            return items.length ? `<div style="margin-top:6px;font-weight:650">${esc(areaName(a))}
              <span class="badge ${sum === 100 ? 'b-green' : 'b-amber'}" data-msum="${a}">${esc(t('goals.sum'))}: ${sum} %</span></div>`
              + items.map(g => goalRow(g, 'new')).join('') : '';
          }).join('') : ''}
      </div>

      <div class="card">
        <h2>${icon('gauge', 18)}${esc(t('rev.managerSection'))} ${phase3 ? '— ' + esc(t('rev.v2f')) : '— ' + esc(t('rev.v2d'))}</h2>
        <p class="callout" style="margin-bottom:14px">${icon('check', 16)} ${esc(t('comp.adopted'))}</p>
        ${compFramework() ? AREAS.map(a => {
          const comps = compFramework().filter(c => c.areaKey === a);
          if (!comps.length) return '';
          const cr = ensureCompRatings(f);
          return `<div style="font-weight:650;margin:10px 0 4px">${esc(areaName(a))}</div>` + comps.map(c => `
            <div class="field"><label>${esc(c.title)} <span class="badge">${c.weight} %</span> <span class="badge">${esc(t('misc.you'))}: ${cr.self[c.key] || '—'}</span></label>
              ${scaleRowHtml('mgrc.' + c.key, cr.mgr[c.key])}</div>`).join('')
            + `<textarea class="input" style="margin:4px 0 12px;min-height:54px" data-ac="${a}" placeholder="${esc(areaName(a))} — ${esc(t('rev.summary'))}…">${esc(f.mgr.areaComments[a])}</textarea>`;
        }).join('') : AREAS.map(a => `
          <div class="field"><label>${esc(areaName(a))} <span class="badge">${esc(t('misc.you'))}: ${f.self.areas[a] || '—'}</span></label>
            ${scaleRowHtml('mgr.' + a, f.mgr.areas[a])}
            <textarea class="input" style="margin-top:8px;min-height:60px" data-ac="${a}" placeholder="${esc(t('rev.summary'))}…">${esc(f.mgr.areaComments[a])}</textarea>
          </div>`).join('')}
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('rev.mgr.strengths'))}</label><textarea class="input" data-m="strengths">${esc(f.mgr.strengths)}</textarea></div>
          <div class="field"><label>${esc(t('rev.mgr.growthAreas'))}</label><textarea class="input" data-m="growthAreas">${esc(f.mgr.growthAreas)}</textarea></div>
        </div>
        ${(() => {
          const disputed = f.goalsEval.concat(f.newGoals).filter(g => g.mgrDecision === 'discuss');
          return disputed.length ? `<div class="callout" style="margin-bottom:12px;background:color-mix(in srgb, var(--warn) 14%, transparent);color:var(--warn)">
            ${icon('checkin', 16)} <span><b>${esc(t('rev.discussList'))}:</b><br>${disputed.map(g =>
              `· ${esc(g.title)}${g.rating || g.mgrRating ? ` (${esc(t('misc.you'))} ${g.rating || '—'} × ${g.mgrRating || '—'})` : ''}${g.mgrNote ? ' — ' + esc(g.mgrNote) : ''}`).join('<br>')}</span></div>` : '';
        })()}
        <div class="field"><label>${esc(t('rev.mgr.talking'))}</label><textarea class="input" data-m="talking">${esc(f.mgr.talking)}</textarea></div>
        <div class="field"><label>${icon('lock', 14)} ${esc(t('rev.privateNote'))}</label>
          <textarea class="input" data-m="privateNote" style="border-color:var(--warn)">${esc(f.mgr.privateNote)}</textarea>
          <div class="hint">${esc(t('rev.privateNoteHint'))}</div></div>
        <div class="field"><label>${esc(t('rev.summary'))}</label><textarea class="input" data-m="summary">${esc(f.mgr.summary)}</textarea></div>
      </div>

      ${scoreCard(f)}

      <div class="card">
        <h2>${icon('calendar', 18)}${esc(t('rev.scheduleConv'))}</h2>
        <p class="page-sub" style="margin-bottom:10px">${esc(t('rev.agreementNote'))}</p>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('rev.scheduleConv'))}</label>
            <input type="date" class="input" id="conv-date" value="${f.conversationDate || ''}"></div>
          <div class="field"><label>${esc(t('rev.nextDate'))}</label>
            <input type="date" class="input" id="next-date" value="${f.nextReviewDate || ''}"></div>
        </div>
        <div class="wizard-foot">
          <button class="btn" id="m-save">${esc(t('common.save'))}</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(st === 'manager_in_progress') ? `<button class="btn btn-primary" id="m-done">${esc(t('rev.scheduleConv'))} ${icon('arrowR', 15)}</button>` : ''}
            ${(phase2) ? `<button class="btn btn-primary" id="m-conv">${esc(t('rev.convHeld'))}</button>` : ''}
            ${(phase3) ? `<button class="btn btn-primary" id="m-final">${esc(t('rev.finalize'))} ${icon('check', 15)}</button>` : ''}
          </div>
        </div>
      </div>`;

    const collect = () => {
      root.querySelectorAll('[data-m]').forEach(el => f.mgr[el.dataset.m] = el.value);
      root.querySelectorAll('[data-ac]').forEach(el => f.mgr.areaComments[el.dataset.ac] = el.value);
      root.querySelectorAll('[data-mw]').forEach(el => { const g = f.newGoals.find(x => x.id === el.dataset.mw); if (g) g.weight = +el.value || 0; });
      root.querySelectorAll('[data-gnote]').forEach(el => { const g = f.goalsEval.find(x => x.goalId === el.dataset.gnote); if (g) g.mgrNote = el.value; });
      f.conversationDate = root.querySelector('#conv-date').value || f.conversationDate;
      f.nextReviewDate = root.querySelector('#next-date').value || f.nextReviewDate;
      saveForm(r);
    };
    root.querySelectorAll('textarea,input').forEach(el => el.addEventListener('change', collect));
    bindScaleRows(root, (name, val) => {
      if (name.startsWith('mgrc.')) ensureCompRatings(f).mgr[name.slice(5)] = val;
      else if (name.startsWith('mgrg.')) {
        const g = f.goalsEval.find(x => x.goalId === name.slice(5));
        if (g) {
          g.mgrRating = val;
          /* Neshoda ratingů = automaticky K rozhovoru (i bez poznámky).
             Návrat ke shodě auto-rozpor zase zruší (ruční rozpor s poznámkou zůstává). */
          if (g.rating && val !== g.rating) { g.mgrDecision = 'discuss'; g.mgrConfirmed = false; }
          else if (g.rating && val === g.rating && g.mgrDecision === 'discuss' && !g.mgrNote) { g.mgrDecision = null; g.mgrConfirmed = false; }
          saveForm(r); renderManagerEditor(root, getReview(r.id)); return;
        }
      }
      else f.mgr.areas[name.slice(4)] = val;
      saveForm(r);
    });
    root.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
      collect();
      const [dec, kind, id] = b.dataset.dec.split(':');
      const list = kind === 'new' ? f.newGoals : f.goalsEval;
      const g = list.find(x => (x.id || x.goalId) === id);
      if (g) {
        g.mgrDecision = (g.mgrDecision === dec) ? null : dec;
        g.mgrConfirmed = g.mgrDecision === 'agree';
        saveForm(r); renderManagerEditor(root, getReview(r.id));
      }
    });
    const q = s => root.querySelector(s);
    if (q('#m-confall')) q('#m-confall').onclick = () => {
      collect();
      f.goalsEval.forEach(g => { g.mgrDecision = 'agree'; g.mgrConfirmed = true; });
      f.newGoals.forEach(g => { g.mgrDecision = 'agree'; g.mgrConfirmed = true; });
      saveForm(r); renderManagerEditor(root, getReview(r.id));
    };
    if (q('#m-save')) q('#m-save').onclick = () => { collect(); toast(t('common.saved')); };
    if (q('#m-done')) q('#m-done').onclick = () => {
      collect();
      const undecided = f.goalsEval.concat(f.newGoals).some(g => !g.mgrDecision);
      if (undecided) { toast(t('rev.decideAllFirst')); return; }
      f.versions.push({ label: 'v2_draft', at: Date.now() }); saveForm(r);
      transition(r, f.conversationDate ? 'conversation_scheduled' : 'manager_done',
        subj.name + ' — ' + t('st.manager_done'), 'employee');
      toast(t('rev.v2d')); renderManagerEditor(root, getReview(r.id));
    };
    if (q('#m-conv')) q('#m-conv').onclick = () => {
      collect(); transition(r, 'conversation_done'); renderManagerEditor(root, getReview(r.id));
    };
    if (q('#m-final')) q('#m-final').onclick = () => {
      collect();
      if (!f.nextReviewDate) { toast(t('rev.nextDate')); return; }
      const disputed = f.goalsEval.concat(f.newGoals).some(g => g.mgrDecision === 'discuss');
      if (disputed) { toast(t('rev.resolveDisputes')); return; }
      const unconfirmed = f.goalsEval.some(g => !g.mgrConfirmed) || f.newGoals.some(g => !g.mgrConfirmed);
      const sumsBad = AREAS.some(a => f.newGoals.some(g => g.areaKey === a) && areaSum(f.newGoals, a) !== 100);
      if (unconfirmed || sumsBad) { toast(t('rev.allConfirmRequired')); return; }
      f.versions.push({ label: 'v2_final', at: Date.now() }); saveForm(r);
      transition(r, 'awaiting_employee_confirmation',
        subj.name + ' — ' + t('st.awaiting_employee_confirmation'), 'employee');
      toast(t('st.awaiting_employee_confirmation'));
      location.hash = '#/team';
    };
  }

  /* ====================== pololetní check (semi) ====================== */
  function initSemiCheck(r) {
    r.form.goalsEval.forEach(g => {
      const goal = Store.get('goals', g.goalId);
      if (g.progress == null) g.progress = goal ? goal.progress : 0;
      if (g.newWeight == null) g.newWeight = g.weight;
    });
    saveForm(r);
  }
  function semiSums(list) {
    const out = {};
    AREAS.forEach(a => { out[a] = list.filter(g => g.areaKey === a).reduce((x, g) => x + (+g.newWeight || 0), 0); });
    return out;
  }

  function renderSemiWizard(root, r) {
    const f = r.form;
    if (r.status === 'pending_self') transition(r, 'self_in_progress');
    initSemiCheck(r);
    const step = f.wizardStep || 1, total = 3;
    const subj = person(r.subjectId);
    const sums = semiSums(f.goalsEval);

    let body = '';
    if (step === 1) {
      body = `<h2>${esc(t('misc.semi'))} — ${esc(t('common.step'))} 1/${total}</h2>
        <p class="callout" style="margin-bottom:14px">${icon('checkin', 16)} ${esc(t('semi.intro'))}</p>
        <div class="field"><label>${esc(t('semi.q1'))}</label>
          <textarea class="input" data-f="success">${esc(f.self.success)}</textarea></div>
        <div class="field"><label>${esc(t('semi.q2'))}</label>
          <textarea class="input" data-f="challenge">${esc(f.self.challenge)}</textarea></div>`;
    } else if (step === 2) {
      body = `<h2>${esc(t('semi.checkTitle'))} — ${esc(t('common.step'))} 2/${total}</h2>
        <p class="page-sub">${esc(t('semi.checkHint'))}</p>` +
        AREAS.map(a => {
          const items = f.goalsEval.map((g, i) => ({ g, i })).filter(x => x.g.areaKey === a);
          if (!items.length) return '';
          return `<div style="margin:16px 0 4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <h2 style="margin:0">${esc(areaName(a))}</h2>
              <span class="badge ${sums[a] === 100 ? 'b-green' : 'b-amber'}" data-ssum="${a}">${esc(t('goals.sum'))}: ${sums[a]} %</span>
            </div>` + items.map(({ g, i }) => `
            <div class="card" style="margin-bottom:10px">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <b style="flex:1;min-width:180px">${esc(g.title)}</b> ${kpiChip(g.kpiRef)}
              </div>
              <div style="display:flex;gap:12px;align-items:center;margin-top:10px;flex-wrap:wrap">
                <span style="font-size:.82rem;color:var(--text-muted)">${esc(t('goals.progress'))}</span>
                <input type="range" min="0" max="100" step="5" value="${g.progress}" data-sg-p="${i}" style="flex:1;min-width:140px">
                <b data-sg-pv="${i}" style="width:46px;text-align:right">${g.progress}%</b>
                <span style="font-size:.82rem;color:var(--text-muted)">${esc(t('semi.newWeight'))}</span>
                <input class="input" type="number" min="5" max="90" step="5" style="width:80px" data-sg-w="${i}" value="${g.newWeight}">
                <span class="badge">${esc(t('goals.weight'))}: ${g.weight} %</span>
              </div>
              <input class="input" style="margin-top:8px" data-sg-c="${i}" value="${esc(g.outcome || '')}" placeholder="${esc(t('semi.commentHint'))}">
            </div>`).join('');
        }).join('');
    } else {
      body = `<h2>${esc(t('rev.preview'))} — ${esc(t('common.step'))} 3/${total}</h2>
        <p class="page-sub">${esc(t('rev.previewHint'))}</p>
        <div class="card" style="background:var(--surface-2)">
          <p><b>${esc(t('semi.q1'))}</b><br>${esc(f.self.success) || '—'}</p>
          <p style="margin-top:8px"><b>${esc(t('semi.q2'))}</b><br>${esc(f.self.challenge) || '—'}</p>
          ${AREAS.map(a => {
            const items = f.goalsEval.filter(g => g.areaKey === a);
            return items.length ? `<div style="margin-top:10px"><b>${esc(areaName(a))}</b>${items.map(g =>
              `<p style="margin:5px 0 0 2px;font-size:.92rem">· ${esc(g.title)} — ${g.progress} %
               ${g.newWeight !== g.weight ? `<span class="badge b-amber">${g.weight} → ${g.newWeight} %</span>` : `<span class="badge">${g.weight} %</span>`}
               ${g.outcome ? `<br><span style="color:var(--text-muted);font-size:.85rem;margin-left:12px">${esc(g.outcome)}</span>` : ''}</p>`).join('')}</div>` : '';
          }).join('')}
        </div>`;
    }

    root.innerHTML = `
      <h1 class="page-title">${esc(t('misc.semi'))}</h1>
      <p class="page-sub">${esc(subj ? subj.name : '')} · ${esc(r.period)} · ${esc(t('rev.deadline'))}: ${fmtDate(r.deadline)}</p>
      <div class="wizard-steps">${Array.from({ length: total }, (_, i) => `<div class="wstep ${i < step ? 'done' : ''}"></div>`).join('')}</div>
      <div class="card">${body}
        <div class="wizard-foot">
          <div>${step > 1 ? `<button class="btn" id="w-back">${icon('arrowL', 15)} ${esc(t('common.back'))}</button>` : ''}</div>
          <div style="display:flex;gap:8px">
            ${step < total ? `<button class="btn btn-primary" id="w-next">${esc(t('common.next'))} ${icon('arrowR', 15)}</button>`
              : `<button class="btn btn-primary" id="w-send">${esc(t('common.saveSend'))} ${icon('send', 15)}</button>`}
          </div>
        </div>
        <p class="hint" style="margin-top:10px;color:var(--text-muted);font-size:.8rem">${icon('check', 13)} ${esc(t('rev.autosave'))}</p>
      </div>`;

    const collect = () => {
      root.querySelectorAll('[data-f]').forEach(el => { r.form.self[el.dataset.f] = el.value; });
      root.querySelectorAll('[data-sg-p]').forEach(el => { r.form.goalsEval[+el.dataset.sgP].progress = +el.value; });
      root.querySelectorAll('[data-sg-w]').forEach(el => { r.form.goalsEval[+el.dataset.sgW].newWeight = +el.value || 0; });
      root.querySelectorAll('[data-sg-c]').forEach(el => { r.form.goalsEval[+el.dataset.sgC].outcome = el.value; });
      saveForm(r);
    };
    root.querySelectorAll('textarea, input').forEach(el => el.addEventListener('change', collect));
    root.querySelectorAll('[data-sg-p]').forEach(el => el.addEventListener('input', () => {
      root.querySelector(`[data-sg-pv="${el.dataset.sgP}"]`).textContent = el.value + '%';
    }));
    root.querySelectorAll('[data-sg-w]').forEach(el => el.addEventListener('input', () => {
      collect();
      const sums2 = semiSums(r.form.goalsEval);
      AREAS.forEach(a => {
        const chip = root.querySelector(`[data-ssum="${a}"]`); if (!chip) return;
        chip.textContent = t('goals.sum') + ': ' + sums2[a] + ' %';
        chip.className = 'badge ' + (sums2[a] === 100 ? 'b-green' : 'b-amber');
      });
    }));
    const go = sN => { collect(); r.form.wizardStep = sN; saveForm(r); renderSemiWizard(root, r); window.scrollTo(0, 0); };
    const back = root.querySelector('#w-back'); if (back) back.onclick = () => go(step - 1);
    const next = root.querySelector('#w-next'); if (next) next.onclick = () => {
      collect();
      if (step === 2) {
        const sums2 = semiSums(r.form.goalsEval);
        const bad = AREAS.find(a => r.form.goalsEval.some(g => g.areaKey === a) && sums2[a] !== 100);
        if (bad) { toast(areaName(bad) + ': ' + t('goals.sumBad')); return; }
      }
      go(step + 1);
    };
    const send = root.querySelector('#w-send'); if (send) send.onclick = () => {
      collect();
      r.form.versions.push({ label: 'v1_self', at: Date.now() });
      saveForm(r);
      transition(r, 'self_done', ((person(r.subjectId) || {}).name || '') + ' — ' + t('st.self_done'), 'manager');
      toast(t('st.self_done'));
      location.hash = '#/myreviews';
    };
  }

  function renderSemiManager(root, r) {
    const f = r.form, subj = person(r.subjectId);
    if (r.status === 'self_done') transition(r, 'manager_in_progress');
    const st = r.status === 'self_done' ? 'manager_in_progress' : r.status;
    const phase2 = ['manager_done', 'conversation_scheduled'].includes(st);
    const phase3 = st === 'conversation_done';
    const sums = semiSums(f.goalsEval);

    root.innerHTML = `
      <h1 class="page-title">${esc(t('misc.semi'))}: ${esc(subj.name)}</h1>
      <p class="page-sub">${UI.avatar(subj, 26)} ${esc(subj.role)} · ${esc(r.period)} · ${stBadge(st)}</p>

      <div class="card">
        <h2>${icon('doc', 18)}${esc(t('rev.selfSection'))}</h2>
        <p><b>${esc(t('semi.q1'))}</b><br>${esc(f.self.success) || '—'}</p>
        <p style="margin-top:8px"><b>${esc(t('semi.q2'))}</b><br>${esc(f.self.challenge) || '—'}</p>
      </div>

      <div class="card">
        <h2>${icon('target', 18)}${esc(t('semi.mgrTitle'))}</h2>
        <p class="page-sub" style="margin-bottom:8px">${esc(t('semi.mgrHint'))}</p>
        <div style="display:flex;justify-content:flex-end"><button class="btn btn-sm" id="m-confall">${icon('check', 13)} ${esc(t('rev.confirmAll'))}</button></div>
        ${AREAS.map(a => {
          const items = f.goalsEval.filter(g => g.areaKey === a);
          if (!items.length) return '';
          return `<div style="margin-top:8px;font-weight:650">${esc(areaName(a))}
              <span class="badge ${sums[a] === 100 ? 'b-green' : 'b-amber'}">${esc(t('goals.sum'))}: ${sums[a]} %</span></div>`
            + items.map(g => `
            <div style="padding:10px 0;border-bottom:1px dashed var(--hairline)">
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <div style="flex:1;min-width:200px"><b>${esc(g.title)}</b> ${kpiChip(g.kpiRef)}
                  ${g.newWeight !== g.weight ? `<span class="badge b-amber">${g.weight} → ${g.newWeight} %</span>` : `<span class="badge">${g.weight} %</span>`}
                  ${g.mgrDecision === 'discuss' ? `<span class="badge b-amber">${esc(t('rev.goalDiscuss'))}</span>` : ''}
                  <div style="margin-top:6px;display:flex;align-items:center;gap:8px;max-width:280px">
                    <div class="progressbar" style="flex:1"><div style="width:${g.progress}%"></div></div><b>${g.progress}%</b></div>
                  ${g.outcome ? `<div style="font-size:.84rem;color:var(--text-muted);margin-top:4px">${esc(g.outcome)}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px">
                  <button type="button" class="btn btn-sm ${g.mgrDecision === 'agree' ? 'btn-primary' : ''}" data-dec="agree:eval:${g.goalId}">${icon('check', 13)} ${esc(t('rev.goalAgree'))}</button>
                  <button type="button" class="btn btn-sm" ${g.mgrDecision === 'discuss' ? 'style="border-color:var(--warn);color:var(--warn)"' : ''} data-dec="discuss:eval:${g.goalId}">${icon('checkin', 13)} ${esc(t('rev.goalDiscuss'))}</button>
                </div>
              </div>
            </div>`).join('');
        }).join('')}
      </div>

      <div class="card">
        <h2>${icon('calendar', 18)}${esc(t('rev.scheduleConv'))}</h2>
        ${(() => {
          const disputed = f.goalsEval.filter(g => g.mgrDecision === 'discuss');
          return disputed.length ? `<div class="callout" style="margin-bottom:12px;background:color-mix(in srgb, var(--warn) 14%, transparent);color:var(--warn)">
            ${icon('checkin', 16)} <span><b>${esc(t('rev.discussList'))}:</b><br>${disputed.map(g => `· ${esc(g.title)}${g.newWeight !== g.weight ? ` (${g.weight} → ${g.newWeight} %)` : ''}`).join('<br>')}</span></div>` : '';
        })()}
        <div class="field"><label>${esc(t('rev.summary'))}</label><textarea class="input" data-m="summary">${esc(f.mgr.summary)}</textarea></div>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('rev.scheduleConv'))}</label>
            <input type="date" class="input" id="conv-date" value="${f.conversationDate || ''}"></div>
          <div class="field"><label>${esc(t('rev.nextDate'))}</label>
            <input type="date" class="input" id="next-date" value="${f.nextReviewDate || ''}"></div>
        </div>
        <div class="wizard-foot">
          <button class="btn" id="m-save">${esc(t('common.save'))}</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(st === 'manager_in_progress') ? `<button class="btn btn-primary" id="m-done">${esc(t('rev.scheduleConv'))} ${icon('arrowR', 15)}</button>` : ''}
            ${(phase2) ? `<button class="btn btn-primary" id="m-conv">${esc(t('rev.convHeld'))}</button>` : ''}
            ${(phase3) ? `<button class="btn btn-primary" id="m-final">${esc(t('rev.finalize'))} ${icon('check', 15)}</button>` : ''}
          </div>
        </div>
      </div>`;

    const collect = () => {
      root.querySelectorAll('[data-m]').forEach(el => f.mgr[el.dataset.m] = el.value);
      f.conversationDate = root.querySelector('#conv-date').value || f.conversationDate;
      f.nextReviewDate = root.querySelector('#next-date').value || f.nextReviewDate;
      saveForm(r);
    };
    root.querySelectorAll('textarea,input').forEach(el => el.addEventListener('change', collect));
    root.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => {
      collect();
      const [dec, , id] = b.dataset.dec.split(':');
      const g = f.goalsEval.find(x => x.goalId === id);
      if (g) { g.mgrDecision = (g.mgrDecision === dec) ? null : dec; g.mgrConfirmed = g.mgrDecision === 'agree'; saveForm(r); renderSemiManager(root, getReview(r.id)); }
    });
    const q = sel => root.querySelector(sel);
    if (q('#m-confall')) q('#m-confall').onclick = () => {
      collect(); f.goalsEval.forEach(g => { g.mgrDecision = 'agree'; g.mgrConfirmed = true; });
      saveForm(r); renderSemiManager(root, getReview(r.id));
    };
    if (q('#m-save')) q('#m-save').onclick = () => { collect(); toast(t('common.saved')); };
    if (q('#m-done')) q('#m-done').onclick = () => {
      collect();
      if (f.goalsEval.some(g => !g.mgrDecision)) { toast(t('rev.decideAllFirst')); return; }
      f.versions.push({ label: 'v2_draft', at: Date.now() }); saveForm(r);
      transition(r, f.conversationDate ? 'conversation_scheduled' : 'manager_done', subj.name + ' — ' + t('st.manager_done'), 'employee');
      toast(t('rev.v2d')); renderSemiManager(root, getReview(r.id));
    };
    if (q('#m-conv')) q('#m-conv').onclick = () => { collect(); transition(r, 'conversation_done'); renderSemiManager(root, getReview(r.id)); };
    if (q('#m-final')) q('#m-final').onclick = () => {
      collect();
      if (f.goalsEval.some(g => g.mgrDecision === 'discuss')) { toast(t('rev.resolveDisputes')); return; }
      if (f.goalsEval.some(g => !g.mgrConfirmed)) { toast(t('rev.allConfirmRequired')); return; }
      const sums2 = semiSums(f.goalsEval);
      if (AREAS.some(a => f.goalsEval.some(g => g.areaKey === a) && sums2[a] !== 100)) { toast(t('goals.sumBad')); return; }
      f.versions.push({ label: 'v2_final', at: Date.now() }); saveForm(r);
      transition(r, 'awaiting_employee_confirmation', subj.name + ' — ' + t('st.awaiting_employee_confirmation'), 'employee');
      toast(t('st.awaiting_employee_confirmation'));
      location.hash = '#/team';
    };
  }

  /* ====================== employee confirmation ====================== */
  const NEXT_PERIOD = 'Rok 2027';
  function materializeNewGoals(r) {
    const subj = person(r.subjectId); if (!subj) return;
    const period = r.type === 'probation' ? r.period : NEXT_PERIOD; // nováček: cíle běží hned
    r.form.newGoals.forEach(g => {
      Store.insert('goals', {
        id: uid(), ownerId: subj.id, areaKey: g.areaKey, title: g.title, desc: g.desc,
        weight: g.weight, progress: 0, kpiRef: g.kpiRef,
        confirmedByManager: !!g.mgrConfirmed,
        due: '2026-12-31', type: 'personal', period,
      });
    });
  }

  /* Pololetní check: po potvrzení propsat progress + schválené váhy do cílů */
  function applySemiChanges(r) {
    r.form.goalsEval.forEach(g => {
      const goal = Store.get('goals', g.goalId); if (!goal) return;
      Store.update('goals', g.goalId, {
        progress: g.progress != null ? g.progress : goal.progress,
        weight: (g.mgrConfirmed && g.newWeight) ? g.newWeight : goal.weight,
      });
    });
  }

  function renderConfirmation(root, r) {
    const subj = person(r.subjectId), ev = person(r.evaluatorId);
    root.innerHTML = `
      <h1 class="page-title">${esc(t('rev.v2f'))}</h1>
      <p class="page-sub">${esc(t('rev.evaluator'))}: ${esc(ev ? ev.name : '—')} · ${esc(r.period)}</p>
      ${fullReadHtml(r, false)}
      <div class="card">
        <h2>${icon('check', 18)}${esc(t('rev.confirm'))}</h2>
        <p class="page-sub" style="margin-bottom:10px">${esc(t('rev.agreementNote'))}</p>
        <div class="field"><label>${esc(t('rev.employeeComment'))}</label>
          <textarea class="input" id="emp-comment">${esc(r.form.employeeComment)}</textarea></div>
        <div class="wizard-foot">
          <button class="btn btn-danger" id="c-reopen">${esc(t('rev.disagree'))}</button>
          <button class="btn btn-primary" id="c-agree">${esc(t('rev.agree'))} ${icon('check', 15)}</button>
        </div>
      </div>`;
    root.querySelector('#c-agree').onclick = () => {
      r.form.employeeComment = root.querySelector('#emp-comment').value;
      r.form.versions.push({ label: 'v3_confirmed', at: Date.now() });
      saveForm(r);
      if (r.type === 'semi') applySemiChanges(r); else materializeNewGoals(r);
      transition(r, 'confirmed', ((subj || {}).name || '') + ' — ' + t('st.confirmed'), 'all');
      toast(t('st.confirmed'));
      location.hash = '#/myreviews';
    };
    root.querySelector('#c-reopen').onclick = () => {
      r.form.employeeComment = root.querySelector('#emp-comment').value; saveForm(r);
      transition(r, 'conversation_done', ((subj || {}).name || '') + ' — ' + t('rev.disagree'), 'manager');
      toast(t('rev.disagree'));
      location.hash = '#/myreviews';
    };
  }

  /* ====================== full read-only + print ====================== */
  function fullReadHtml(r, withPrivate) {
    const f = r.form;
    return `
      ${previewSelfHtml(r)}
      <div class="card">
        <h2>${icon('target', 18)}${esc(t('rev.managerSection'))}</h2>
        ${(compFramework() && f.compRatings) ? compFramework().map(c =>
          `<p style="margin-bottom:6px"><b>${esc(c.title)}</b> <span class="badge">${c.weight} %</span>
           <span class="badge">${esc(t('misc.you'))}: ${f.compRatings.self[c.key] || '—'}</span>
           <span class="badge b-blue">${f.compRatings.mgr[c.key] || '—'}</span></p>`).join('')
          + AREAS.map(a => f.mgr.areaComments[a] ? `<p style="margin-bottom:6px;color:var(--text-muted)"><b>${esc(areaName(a))}:</b> ${esc(f.mgr.areaComments[a])}</p>` : '').join('')
        : AREAS.map(a => `<p style="margin-bottom:6px"><b>${esc(areaName(a))}:</b>
          <span class="badge b-blue">${f.mgr.areas[a] || '—'}</span> ${esc(f.mgr.areaComments[a])}</p>`).join('')}
        <p style="margin-top:8px"><b>${esc(t('rev.mgr.strengths'))}:</b> ${esc(f.mgr.strengths) || '—'}</p>
        <p style="margin-top:6px"><b>${esc(t('rev.mgr.growthAreas'))}:</b> ${esc(f.mgr.growthAreas) || '—'}</p>
        <p style="margin-top:6px"><b>${esc(t('rev.summary'))}:</b> ${esc(f.mgr.summary) || '—'}</p>
        ${withPrivate && f.mgr.privateNote ? `<p style="margin-top:6px;color:var(--warn)"><b>${icon('lock', 13)} ${esc(t('rev.privateNote'))}:</b> ${esc(f.mgr.privateNote)}</p>` : ''}
        ${f.conversationDate ? `<p style="margin-top:6px"><b>${icon('calendar', 14)}</b> ${fmtDate(f.conversationDate)} · <b>${esc(t('rev.nextDate'))}:</b> ${fmtDate(f.nextReviewDate)}</p>` : ''}
        ${f.employeeComment ? `<p style="margin-top:6px"><b>${esc(t('rev.employeeComment'))}:</b> ${esc(f.employeeComment)}</p>` : ''}
      </div>
      ${f.newGoals.length ? `<div class="card"><h2>${icon('spark', 18)}${esc(t('rev.goalsNew'))}</h2>${goalsByAreaHtml(f.newGoals, { showConfirm: true })}</div>` : ''}
      ${withPrivate ? scoreCard(f) : ''}
      <div class="card">
        <h2>${icon('clock', 18)}${esc(t('rev.history'))}</h2>
        <ul class="timeline">${f.versions.map(v =>
          `<li><span class="tday">${fmtDate(v.at)}</span> ${esc(t('rev.' + ({ v1_self: 'v1', v2_draft: 'v2d', v2_final: 'v2f', v3_confirmed: 'v3' })[v.label]))}</li>`).join('') || `<li>${esc(t('rev.noHistory'))}</li>`}
        </ul>
      </div>`;
  }

  function renderReadOnly(root, r, withPrivate) {
    const subj = person(r.subjectId), ev = person(r.evaluatorId);
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px">
        <h1 class="page-title" style="margin:0">${esc(subj ? subj.name : '')} — ${esc(r.period)}</h1>
        ${stBadge(r.status)}
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="print-btn">${icon('print', 15)} ${esc(t('common.print'))}</button>
      </div>
      <p class="page-sub">${esc(t('rev.evaluator'))}: ${esc(ev ? ev.name : '—')} · ${esc(t('rev.deadline'))}: ${fmtDate(r.deadline)}</p>
      ${fullReadHtml(r, withPrivate)}`;
    root.querySelector('#print-btn').onclick = () => printReview(r, withPrivate);
  }

  function printReview(r, withPrivate) {
    const subj = person(r.subjectId), ev = person(r.evaluatorId);
    const f = r.form;
    const co = Store.getCompany();
    const score = computeScore(f), b = band(score);
    const goalTable = (list, withOutcome) => `<table><tr><th>${esc(t('goals.area'))}</th><th>${esc(t('goals.name'))}</th><th>${esc(t('goals.weight'))}</th><th>KPI</th>${withOutcome ? `<th>Rating</th><th>${esc(t('rev.summary'))}</th>` : ''}<th>${esc(t('goals.confirmed'))}</th></tr>
      ${AREAS.map(a => list.filter(g => g.areaKey === a).map(g =>
        `<tr><td>${esc(areaName(a))}</td><td>${esc(g.title)}</td><td>${g.weight} %</td><td>${esc(kpiName(g.kpiRef) || '—')}</td>${withOutcome ? `<td>${g.rating || '—'} / ${g.mgrRating || '—'}</td><td>${esc(g.outcome || '')}${g.mgrNote ? ' · ' + esc(g.mgrNote) : ''}</td>` : ''}<td>${g.mgrConfirmed ? '✓' : '—'}</td></tr>`).join('')).join('')}
    </table>`;
    const pr = document.getElementById('print-root');
    pr.innerHTML = `
      <h1>${esc(co ? co.name : 'TeamPulse')} — ${esc(t('rev.title'))}</h1>
      <p class="meta">${esc(t('rev.subject'))}: <b>${esc(subj ? subj.name : '')}</b> (${esc(subj ? subj.role : '')}) ·
        ${esc(t('rev.evaluator'))}: ${esc(ev ? ev.name : '—')} · ${esc(r.period)} · ${esc(t('st.' + r.status))}</p>
      <h2>${esc(t('rev.v1'))}</h2>
      <p><b>${esc(t('rev.q.success'))}</b><br>${esc(f.self.success)}</p>
      <p><b>${esc(t('rev.q.challenge'))}</b><br>${esc(f.self.challenge)}</p>
      <p><b>${esc(t('rev.q.improve'))}</b><br>${esc(f.self.improve)}</p>
      <h2>${esc(t('rev.areas'))}</h2>
      ${(compFramework() && f.compRatings) ? `<table><tr><th></th><th>${esc(t('goals.weight'))}</th><th>${esc(t('misc.you'))}</th><th>${esc(t('rev.evaluator'))}</th></tr>
        ${compFramework().map(c => `<tr><td>${esc(c.title)} <i>(${esc(areaName(c.areaKey))})</i></td><td>${c.weight} %</td><td>${f.compRatings.self[c.key] || '—'}</td><td>${f.compRatings.mgr[c.key] || '—'}</td></tr>`).join('')}
      </table>
      ${AREAS.map(a => f.mgr.areaComments[a] ? `<p><b>${esc(areaName(a))}:</b> ${esc(f.mgr.areaComments[a])}</p>` : '').join('')}`
      : `<table><tr><th></th><th>${esc(t('misc.you'))}</th><th>${esc(t('rev.evaluator'))}</th><th>${esc(t('rev.summary'))}</th></tr>
        ${AREAS.map(a => `<tr><td>${esc(areaName(a))}</td><td>${f.self.areas[a] || '—'}</td><td>${f.mgr.areas[a] || '—'}</td><td>${esc(f.mgr.areaComments[a])}</td></tr>`).join('')}
      </table>`}
      ${f.goalsEval.length ? `<h2>${esc(t('rev.goalsEval'))}</h2>${goalTable(f.goalsEval, true)}` : ''}
      ${f.newGoals.length ? `<h2>${esc(t('rev.goalsNew'))}</h2>${goalTable(f.newGoals, false)}` : ''}
      <h2>${esc(t('rev.managerSection'))}</h2>
      <p><b>${esc(t('rev.mgr.strengths'))}:</b> ${esc(f.mgr.strengths)}</p>
      <p><b>${esc(t('rev.mgr.growthAreas'))}:</b> ${esc(f.mgr.growthAreas)}</p>
      <p><b>${esc(t('rev.summary'))}:</b> ${esc(f.mgr.summary)}</p>
      ${withPrivate && f.mgr.privateNote ? `<p><b>${esc(t('rev.privateNote'))}:</b> ${esc(f.mgr.privateNote)}</p>` : ''}
      ${withPrivate && score != null ? `<p><b>${esc(t('rev.score'))}:</b> ${score.toFixed(2)} — ${esc(t('band.' + b.key))}</p>` : ''}
      ${f.employeeComment ? `<p><b>${esc(t('rev.employeeComment'))}:</b> ${esc(f.employeeComment)}</p>` : ''}
      <p class="meta">${esc(t('rev.nextDate'))}: ${fmtDate(f.nextReviewDate)} · TeamPulse demo · ${fmtDate(Date.now())}</p>`;
    pr.hidden = false;
    window.print();
    setTimeout(() => { pr.hidden = true; }, 400);
  }

  /* ====================== dispatcher ====================== */
  window.ReviewViews = {
    renderDetail(root, reviewId) {
      const r = getReview(reviewId);
      if (!r) { root.innerHTML = `<div class="empty">${icon('search', 48)}</div>`; return; }
      const va = App.viewAs();
      const isSubject = va.personId === r.subjectId;
      const isEvaluator = va.personId === r.evaluatorId;
      const isHR = va.role === 'hr';

      if (isSubject && ['pending_self', 'self_in_progress'].includes(r.status)) return renderWizard(root, r);
      if (isSubject && r.status === 'awaiting_employee_confirmation') return renderConfirmation(root, r);
      if (isEvaluator && ['self_done', 'manager_in_progress', 'manager_done', 'conversation_scheduled', 'conversation_done'].includes(r.status))
        return renderManagerEditor(root, r);
      if (isEvaluator && ['pending_self', 'self_in_progress'].includes(r.status)) {
        root.innerHTML = `<h1 class="page-title">${esc((person(r.subjectId) || {}).name || '')}</h1>
          <div class="card"><p>${icon('clock', 16)} ${esc(t('rev.waitingForEmployee'))}</p></div>`;
        return;
      }
      return renderReadOnly(root, r, isEvaluator || isHR);
    },
    printReview,
  };
})();
