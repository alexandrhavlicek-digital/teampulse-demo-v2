/* TeamPulse demo v2 - Onboarding nováčka (koncept docs/koncept_onboarding.md, 2026-08-10)
   -------------------------------------------------------------------------
   Preboarding → den 1 → týden 1 → 30/60/90 → vyhodnocení zkušební doby → cíle.
   Rámec Bauer 4C+2; klíčová rozhodnutí (2026-08-10):
   - šablony spravuje JEN HR; manažer upravuje jen konkrétní plán svého nováčka,
   - pulse je ADRESNÝ (vidí mgr+HR, nováček to otevřeně ví) - na rozdíl od eNPS,
     negativní odpověď → notifikace manažerovi (sentiment flow dle Enboarderu),
   - buddy vidí jen SVOJE úkoly (parťák, ne hodnotitel),
   - den ~45 (půlka ZD) = připomínka strukturovaného 1:1, ne formulář.
   Viditelnost: nováček svůj plán a své odpovědi; manažer svůj podstrom; HR vše. */
(function () {
  const { esc, avatar, fmtDate, modal, closeModal, notify, toast } = UI;
  const DAY = 86400000;

  /* ================= logika ================= */
  const PHASES = ['pre', 'day1', 'week1', 'month1', 'month3'];
  const OWNER_ROLES = ['hr', 'manager', 'buddy', 'trainer', 'it', 'newhire'];
  const PULSE_DAYS = [1, 7, 30, 60, 90];
  /* otázky: klíč → i18n onb.pq.*; poslední otázka dne je volný text */
  const PULSE_QS = {
    1: ['ready', 'agenda', 'free'],
    7: ['clarity', 'mgrTime', 'materials', 'buddyMet', 'free'],
    30: ['matches', 'training', 'safe', 'free'],
    60: ['belong', 'feedback', 'free'],
    90: ['recommend', 'stay', 'free'],
  };

  const hiredAtOf = p => p.hiredAt || (Date.now() - (p.hiredMonthsAgo || 0) * 30 * DAY);
  const daysSince = p => Math.floor((Date.now() - hiredAtOf(p)) / DAY);
  function probationEnd(plan) {
    const p = Store.get('people', plan.personId); if (!p) return Date.now();
    const d = new Date(hiredAtOf(p)); d.setMonth(d.getMonth() + (plan.probationMonths || 3));
    return d.getTime();
  }
  const probationDaysLeft = plan => Math.ceil((probationEnd(plan) - Date.now()) / DAY);
  const running = plan => plan.probation.status === 'running';

  function plans() { return Store.list('onboardingPlans'); }
  function planOf(personId) { return plans().find(pl => pl.personId === personId) || null; }
  function activePlans(scopeIds) {
    return plans().filter(pl => running(pl) && (!scopeIds || scopeIds.has(pl.personId)));
  }
  function itemDue(plan, it) {
    const p = Store.get('people', plan.personId);
    return p ? hiredAtOf(p) + (it.dueOffset || 0) * DAY : Date.now();
  }
  const overdue = (plan, it) => !it.done && itemDue(plan, it) < Date.now();
  function progress(plan) {
    const n = plan.items.length;
    return n ? Math.round(plan.items.filter(i => i.done).length / n * 100) : 0;
  }
  /* vlastník položky: role → konkrétní člověk (dle plánu a org struktury) */
  function ownerOf(plan, it) {
    const p = Store.get('people', plan.personId);
    if (it.ownerRole === 'newhire') return p;
    if (it.ownerRole === 'manager') return p ? Store.get('people', p.managerId) : null;
    if (it.ownerRole === 'buddy') return plan.buddyId ? Store.get('people', plan.buddyId) : null;
    if (it.ownerRole === 'trainer') return plan.trainerId ? Store.get('people', plan.trainerId) : null;
    return null; /* hr, it - tým, ne osoba */
  }

  /* pulse: který den je právě „na řadě" (nejnižší dosažený a nezodpovězený) */
  function pulseDue(plan) {
    if (!plan || !running(plan)) return null;
    const p = Store.get('people', plan.personId); if (!p) return null;
    const ds = daysSince(p);
    const answered = new Set((plan.pulses || []).map(x => x.day));
    return PULSE_DAYS.find(d => ds >= d && !answered.has(d)) || null;
  }
  /* uloží pulse; vrátí true, pokud byla nějaká odpověď negativní (→ notifikace mgr) */
  function savePulse(plan, day, answers) {
    const flagged = answers.some(a => a.v != null && a.v <= 2);
    plan.pulses = plan.pulses || [];
    plan.pulses.push({ day, answers, flagged, at: Date.now() });
    Store.update('onboardingPlans', plan.id, {});
    const p = Store.get('people', plan.personId);
    if (flagged && p) {
      const bad = answers.find(a => a.v != null && a.v <= 2);
      notify(t('onb.notifFlag').split('{name}').join(p.name) + ' - ' + t('onb.pq.d' + day + '.' + bad.q), 'manager');
    }
    return flagged;
  }
  function lastPulse(plan) {
    return (plan.pulses || []).slice().sort((a, b) => b.day - a.day)[0] || null;
  }
  function pulseAvg(pulse) {
    const vals = (pulse.answers || []).filter(a => a.v != null).map(a => a.v);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  /* milníky zkušební doby */
  const midDay = plan => Math.round((probationEnd(plan) - hiredAtOf(Store.get('people', plan.personId))) / DAY / 2);
  function midDue(plan) {
    if (!running(plan) || plan.midDone) return false;
    const p = Store.get('people', plan.personId);
    return p && daysSince(p) >= midDay(plan);
  }
  const reviewWindow = plan => running(plan) && probationDaysLeft(plan) <= 14;
  /* risk flag: negativní poslední pulse NEBO 3+ položek po termínu */
  function riskOf(plan) {
    const lp = lastPulse(plan);
    if (lp && lp.flagged) return 'pulse';
    if (plan.items.filter(i => overdue(plan, i)).length >= 3) return 'stuck';
    return null;
  }
  /* probační review v kolekci reviews (existující typ 'probation') */
  const probationReview = plan => Store.list('reviews').find(r => r.subjectId === plan.personId && r.type === 'probation') || null;

  function confirmProbation(plan, byId2, note) {
    plan.probation = Object.assign(plan.probation || {}, { status: 'confirmed', decidedAt: Date.now(), decidedById: byId2 || null, note: note || '' });
    Store.update('onboardingPlans', plan.id, {});
    const p = Store.get('people', plan.personId);
    notify(t('onb.notifConfirmed').split('{name}').join(p ? p.name : ''), 'all');
    notify(t('onb.notifGoals').split('{name}').join(p ? p.name : ''), 'manager');
  }
  function endProbation(plan, byId2, note) {
    plan.probation = Object.assign(plan.probation || {}, { status: 'ended', decidedAt: Date.now(), decidedById: byId2 || null, note: note || '' });
    Store.update('onboardingPlans', plan.id, {});
    const p = Store.get('people', plan.personId);
    notify(t('onb.notifEnded').split('{name}').join(p ? p.name : ''), 'hr');
  }
  /* po potvrzení: nováček bez cílů → todo manažera nastavit cíle */
  function goalsKickoffDue(plan) {
    return plan.probation.status === 'confirmed'
      && !Store.list('goals').some(g => g.ownerId === plan.personId);
  }

  function createPlan(personId, templateId, buddyId, trainerId, probationMonths) {
    const tpl = Store.get('onboardingTemplates', templateId);
    const plan = {
      id: uid(), personId, templateId: templateId || null, buddyId: buddyId || null, trainerId: trainerId || null,
      probationMonths: probationMonths || 3,
      items: (tpl ? tpl.items : []).map(it => ({
        id: uid(), label: it.label, phase: it.phase, ownerRole: it.ownerRole, dueOffset: it.dueOffset,
        done: false, doneAt: null, doneById: null,
      })),
      pulses: [], midDone: false,
      probation: { status: 'running', decidedAt: null, decidedById: null, note: '', newhireEval: null },
      createdAt: Date.now(),
    };
    Store.insert('onboardingPlans', plan);
    const p = Store.get('people', personId);
    notify(t('onb.notifNew').split('{name}').join(p ? p.name : ''), 'manager');
    return plan;
  }

  window.Onboarding = {
    PHASES, OWNER_ROLES, PULSE_DAYS, PULSE_QS,
    hiredAtOf, daysSince, plans, planOf, activePlans, progress, ownerOf, itemDue, overdue,
    pulseDue, savePulse, lastPulse, pulseAvg, probationEnd, probationDaysLeft, midDay, midDue,
    reviewWindow, riskOf, probationReview, confirmProbation, endProbation, goalsKickoffDue, createPlan,
  };

  /* ================= views ================= */
  const va = () => App.viewAs();
  const meP = () => va().personId ? Store.get('people', va().personId) : null;
  function subtreeOf(rootId) {
    const ps = Store.list('people'); const out = [];
    const walk = id => ps.filter(p => p.managerId === id).forEach(p => { out.push(p); walk(p.id); });
    walk(rootId); return out;
  }
  function scopeIds() {
    const v = va();
    if (v.role === 'hr') return null; /* vše */
    if (v.role === 'manager' && v.personId) return new Set(subtreeOf(v.personId).map(p => p.id));
    return new Set(v.personId ? [v.personId] : []);
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* fulltextový výběr osoby (vzor rcModal - žádné velké selecty) */
  function personPicker(m, sel, opts, onPick) {
    /* opts: {inputId, listId, people} - vykreslí se do už existujících elementů */
    const listEl = m.querySelector('#' + opts.listId);
    const qi = m.querySelector('#' + opts.inputId);
    const renderList = () => {
      if (!listEl) return;
      const q = qi ? qi.value : '';
      const vis = opts.people().filter(p => !q || norm(p.name + ' ' + p.role + ' ' + (p.dept || '')).includes(norm(q)));
      listEl.innerHTML = (vis.slice(0, 40).map(p => `
        <button type="button" class="f3-row ${sel() === p.id ? 'sel' : ''}" data-pp="${p.id}">
          ${avatar(p, 26)}
          <span class="f3-nm"><b>${esc(p.name)}</b><small>${esc(p.role)}${p.dept ? ' · ' + esc(p.dept) : ''}</small></span>
        </button>`).join('') + (vis.length > 40 ? `<div class="f3-chip-empty">+${vis.length - 40}</div>` : ''))
        || `<div class="f3-chip-empty">${esc(t('flt.noMatch'))}</div>`;
      listEl.querySelectorAll('[data-pp]').forEach(bn => bn.onclick = () => onPick(bn.dataset.pp));
    };
    if (qi) qi.oninput = renderList;
    renderList();
  }

  const roleChip = r => `<span class="badge">${esc(t('onb.role.' + r))}</span>`;
  function ownerChip(plan, it) {
    const o = ownerOf(plan, it);
    return o ? `<span class="badge b-blue" title="${esc(t('onb.role.' + it.ownerRole))}">${esc(o.firstName)}</span>` : roleChip(it.ownerRole);
  }

  /* ---------------- hlavní stránka (mgr + HR) ---------------- */
  function render(root) {
    const v = va();
    const ids = scopeIds();
    const act = activePlans(ids);
    const done = plans().filter(pl => !running(pl) && (!ids || ids.has(pl.personId)));
    const isHr = v.role === 'hr';

    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('onb.title'))} ${act.length ? `<span class="badge b-blue">${act.length}</span>` : ''}</h1>
        <span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="onb-new">${icon('plus', 14)} ${esc(t('onb.new'))}</button>
      </div>
      <p class="page-sub">${esc(t('onb.sub'))}</p>

      ${act.length ? `<div class="card">
        <h2>${icon('sprout', 18)}${esc(t('onb.active'))}</h2>
        ${act.map(planRowHtml).join('')}
      </div>` : `<div class="card"><div class="empty" style="padding:26px">${icon('sprout', 44)}<br>${esc(t('onb.empty'))}</div></div>`}

      ${done.length ? `<div class="card">
        <h2>${icon('check', 18)}${esc(t('onb.finished'))}</h2>
        ${done.map(pl => {
          const p = Store.get('people', pl.personId); if (!p) return '';
          return `<div class="kp-row" data-onb-open="${pl.id}">
            <div class="kp-main">${avatar(p, 26)} <b>${esc(p.name)}</b>
              <span class="badge ${pl.probation.status === 'confirmed' ? 'b-green' : 'b-red'}">${esc(t('onb.st.' + pl.probation.status))}</span>
              <small style="color:var(--text-muted)">${fmtDate(pl.probation.decidedAt)}</small></div>
          </div>`;
        }).join('')}
      </div>` : ''}

      ${isHr ? templatesCardHtml() : ''}`;

    root.querySelector('#onb-new').onclick = () => newPlanModal(() => render(root));
    root.querySelectorAll('[data-onb-open]').forEach(bn => bn.onclick = () => {
      const pl = Store.get('onboardingPlans', bn.dataset.onbOpen);
      if (pl) planModal(pl, () => render(root));
    });
    if (isHr) bindTemplatesCard(root, () => render(root));
  }

  function planRowHtml(plan) {
    const p = Store.get('people', plan.personId); if (!p) return '';
    const ds = daysSince(p); const pr = progress(plan);
    const left = probationDaysLeft(plan);
    const risk = riskOf(plan); const lp = lastPulse(plan);
    const due = pulseDue(plan);
    return `<div class="kp-row ${risk ? 'kp-row-uncovered' : ''}" data-onb-open="${plan.id}" title="${esc(t('onb.openDetail'))}">
      <div class="kp-main">
        <b>${avatar(p, 26)} ${esc(p.name)}</b>
        <div class="kp-holder" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span class="badge">${esc(t('onb.day'))} ${ds}</span>
          <span class="badge ${left <= 14 ? 'b-red' : left <= 30 ? 'b-amber' : ''}">${esc(t('onb.probLeft'))} ${left} d</span>
          ${lp ? `<span class="badge ${lp.flagged ? 'b-red' : 'b-green'}">${esc(t('onb.pulse'))} ${lp.day}: ${lp.flagged ? esc(t('onb.pulseFlag')) : esc(t('onb.pulseOk'))}</span>` : ''}
          ${due ? `<span class="badge b-amber">${esc(t('onb.pulseDueBadge'))} ${due}</span>` : ''}
          ${midDue(plan) ? `<span class="badge b-amber">${icon('checkin', 11)} ${esc(t('onb.midDue'))}</span>` : ''}
          ${reviewWindow(plan) ? `<span class="badge b-red">${icon('alert', 11)} ${esc(t('onb.reviewDue'))}</span>` : ''}
          ${goalsKickoffDue(plan) ? `<span class="badge b-amber">${icon('target', 11)} ${esc(t('onb.goalsDue'))}</span>` : ''}
        </div>
      </div>
      <div style="min-width:130px;display:flex;align-items:center;gap:8px">
        <div class="progressbar" style="flex:1"><div style="width:${pr}%"></div></div><b>${pr}%</b>
      </div>
    </div>`;
  }

  /* ---------------- nový plán ---------------- */
  function newPlanModal(rerender) {
    const v = va();
    const pool = () => {
      const base = v.role === 'manager' ? subtreeOf(v.personId) : Store.list('people').filter(p => p.managerId);
      return base.filter(p => !planOf(p.id));
    };
    const tpls = Store.list('onboardingTemplates');
    const d = { personId: '', templateId: tpls.length ? tpls[0].id : null, buddyId: '', trainerId: '', months: 3, step: 'person' };
    const render2 = m => {
      const p = d.personId ? Store.get('people', d.personId) : null;
      const chip = (pid, clearKey) => {
        const pp = Store.get('people', pid);
        return pp ? `<span class="f3-chip">${avatar(pp, 20)} ${esc(pp.name)} <button type="button" data-clear="${clearKey}">✕</button></span>` : '';
      };
      m.querySelector('#onb-np-body').innerHTML = d.step === 'person' ? `
        <div class="field"><label>${esc(t('onb.np.who'))}</label>
          <div class="filterbar" style="margin:0 0 6px">${icon('search', 15)}
            <input class="input" id="onb-q" placeholder="${esc(t('rc.searchPerson'))}"></div>
          <div class="f3-list" id="onb-list" style="max-height:34vh"></div>
        </div>` : `
        <div class="field"><label>${esc(t('onb.np.who'))}</label><div class="f3-selrow" style="margin-bottom:0">${chip(d.personId, 'person')}</div></div>
        <div class="field"><label>${esc(t('onb.np.tpl'))}</label>
          <div class="scale-row" style="flex-wrap:wrap">${tpls.map(tp =>
            `<button type="button" class="scale-opt ${d.templateId === tp.id ? 'sel' : ''}" data-tpl="${tp.id}">${esc(tp.name)} (${tp.items.length})</button>`).join('')
            || `<span class="hint">${esc(t('onb.np.noTpl'))}</span>`}</div></div>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('onb.role.buddy'))} <small style="color:var(--text-muted)">(${esc(t('onb.np.buddyHint'))})</small></label>
            ${d.buddyId ? `<div class="f3-selrow" style="margin-bottom:0">${chip(d.buddyId, 'buddy')}</div>` : `
            <div class="filterbar" style="margin:0 0 6px">${icon('search', 15)}<input class="input" id="onb-bq" placeholder="${esc(t('rc.searchPerson'))}"></div>
            <div class="f3-list" id="onb-blist" style="max-height:18vh"></div>`}</div>
          <div class="field"><label>${esc(t('onb.role.trainer'))}</label>
            ${d.trainerId ? `<div class="f3-selrow" style="margin-bottom:0">${chip(d.trainerId, 'trainer')}</div>` : `
            <div class="filterbar" style="margin:0 0 6px">${icon('search', 15)}<input class="input" id="onb-tq" placeholder="${esc(t('rc.searchPerson'))}"></div>
            <div class="f3-list" id="onb-tlist" style="max-height:18vh"></div>`}</div>
        </div>
        <div class="field"><label>${esc(t('onb.np.months'))}</label>
          <div class="scale-row">${[3, 4].map(mn =>
            `<button type="button" class="scale-opt ${d.months === mn ? 'sel' : ''}" data-mn="${mn}">${mn} ${esc(t('onb.np.monthsU'))}</button>`).join('')}</div>
          <div class="hint">${esc(t('onb.np.start'))}: ${p ? fmtDate(hiredAtOf(p)) : '-'}</div></div>`;

      if (d.step === 'person') {
        personPicker(m, () => d.personId, { inputId: 'onb-q', listId: 'onb-list', people: pool }, pid => { d.personId = pid; d.step = 'rest'; render2(m); });
        const qi0 = m.querySelector('#onb-q'); if (qi0) qi0.focus();
      } else {
        /* buddy doporučení: stejné oddělení, 1+ rok ve firmě, ne manažer nováčka (Microsoft/HBR praxe) */
        const buddyPool = () => {
          const all = Store.list('people').filter(x => x.id !== d.personId && x.id !== (p || {}).managerId);
          const good = all.filter(x => x.deptKey === (p || {}).deptKey && daysSince(x) > 365);
          return (good.length ? good.concat(all.filter(x => !good.includes(x))) : all);
        };
        personPicker(m, () => d.buddyId, { inputId: 'onb-bq', listId: 'onb-blist', people: buddyPool }, pid => { d.buddyId = pid; render2(m); });
        personPicker(m, () => d.trainerId, { inputId: 'onb-tq', listId: 'onb-tlist', people: () => Store.list('people').filter(x => x.id !== d.personId) }, pid => { d.trainerId = pid; render2(m); });
        m.querySelectorAll('[data-tpl]').forEach(bn => bn.onclick = () => { d.templateId = bn.dataset.tpl; render2(m); });
        m.querySelectorAll('[data-mn]').forEach(bn => bn.onclick = () => { d.months = +bn.dataset.mn; render2(m); });
        m.querySelectorAll('[data-clear]').forEach(bn => bn.onclick = () => {
          if (bn.dataset.clear === 'person') { d.personId = ''; d.step = 'person'; }
          if (bn.dataset.clear === 'buddy') d.buddyId = '';
          if (bn.dataset.clear === 'trainer') d.trainerId = '';
          render2(m);
        });
      }
      m.querySelector('#onb-np-save').disabled = !(d.personId && d.templateId);
      m.querySelector('#onb-np-save').onclick = () => {
        if (!d.personId || !d.templateId) return;
        createPlan(d.personId, d.templateId, d.buddyId || null, d.trainerId || null, d.months);
        closeModal(); toast(t('common.saved')); rerender();
      };
      m.querySelector('#onb-np-cancel').onclick = closeModal;
    };
    modal(`<h3>${icon('sprout', 18)}${esc(t('onb.np.title'))}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('onb.np.hint'))}</p>
      <div id="onb-np-body"></div>
      <div class="wizard-foot"><span></span><div style="display:flex;gap:8px">
        <button class="btn" id="onb-np-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="onb-np-save">${esc(t('common.save'))}</button></div></div>`, render2);
  }

  /* ---------------- detail plánu ---------------- */
  function planModal(plan, rerender) {
    const p = Store.get('people', plan.personId); if (!p) return;
    const canEdit = ['manager', 'hr'].includes(va().role);
    const render2 = m => {
      const pr = progress(plan);
      const left = probationDaysLeft(plan);
      const rw = reviewWindow(plan); const rev = probationReview(plan);
      m.querySelector('#onb-pl-body').innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          ${avatar(p, 40)} <div style="flex:1;min-width:160px"><b>${esc(p.name)}</b><br>
            <small style="color:var(--text-muted)">${esc(p.role)} · ${esc(t('onb.hired'))} ${fmtDate(hiredAtOf(p))} · ${esc(t('onb.day'))} ${daysSince(p)}</small></div>
          <div class="progressbar" style="width:120px"><div style="width:${pr}%"></div></div><b>${pr}%</b>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          <span class="badge ${left <= 14 ? 'b-red' : ''}">${esc(t('onb.probEnd'))}: ${fmtDate(probationEnd(plan))} (${left} d)</span>
          ${['buddy', 'trainer'].map(rk => {
            const pid = plan[rk + 'Id']; const pp = pid ? Store.get('people', pid) : null;
            return `<span class="badge ${pp ? 'b-blue' : 'b-amber'}">${esc(t('onb.role.' + rk))}: ${pp ? esc(pp.firstName + ' ' + pp.lastName) : esc(t('onb.notSet'))}
              ${canEdit && running(plan) ? `<button type="button" class="onb-mini" data-setrole="${rk}">${pp ? '✎' : '+'}</button>` : ''}</span>`;
          }).join('')}
        </div>
        <div id="onb-roleedit"></div>

        ${PHASES.map(ph => {
          const items = plan.items.filter(i => i.phase === ph);
          if (!items.length) return '';
          return `<div class="f3-grp">${esc(t('onb.ph.' + ph))}</div>` + items.map(it => `
            <div class="onb-item ${it.done ? 'done' : overdue(plan, it) ? 'over' : ''}">
              <button type="button" class="onb-check" data-toggle="${it.id}" ${canEdit && running(plan) ? '' : 'disabled'}>${it.done ? icon('check', 14) : ''}</button>
              <span class="onb-lbl">${esc(it.label)}</span>
              ${ownerChip(plan, it)}
              <small style="color:${overdue(plan, it) ? 'var(--danger)' : 'var(--text-muted)'}">${fmtDate(itemDue(plan, it))}</small>
              ${canEdit && running(plan) ? `<button type="button" class="onb-mini" data-del="${it.id}" title="${esc(t('common.delete'))}">✕</button>` : ''}
            </div>`).join('');
        }).join('')}
        ${canEdit && running(plan) ? `<button class="btn btn-sm" id="onb-additem" style="margin-top:8px">${icon('plus', 13)} ${esc(t('onb.addItem'))}</button><div id="onb-additem-form"></div>` : ''}

        <h4 style="margin:16px 0 6px">${icon('heartPulse', 15)} ${esc(t('onb.pulseHist'))}</h4>
        ${(plan.pulses || []).length ? plan.pulses.slice().sort((a, b) => a.day - b.day).map(pu => `
          <div class="onb-item ${pu.flagged ? 'over' : ''}">
            <span class="badge ${pu.flagged ? 'b-red' : 'b-green'}">${esc(t('onb.day'))} ${pu.day}</span>
            <span class="onb-lbl" style="font-size:.84rem">${pu.answers.filter(a => a.v != null).map(a =>
              `${esc(t('onb.pq.d' + pu.day + '.' + a.q))}: <b>${esc(t('onb.sc.' + a.v))}</b>`).join(' · ')}
              ${pu.answers.filter(a => a.v == null && a.text).map(a => `<br><i>„${esc(a.text)}"</i>`).join('')}</span>
          </div>`).join('') : `<p class="hint">${esc(t('onb.pulseNone'))} ${pulseDue(plan) ? '· ' + esc(t('onb.pulseDueBadge')) + ' ' + pulseDue(plan) : ''}</p>`}

        <h4 style="margin:16px 0 6px">${icon('clock', 15)} ${esc(t('onb.probTitle'))}</h4>
        ${plan.probation.status !== 'running' ? `
          <p class="callout">${icon(plan.probation.status === 'confirmed' ? 'check' : 'alert', 15)}
            <b>${esc(t('onb.st.' + plan.probation.status))}</b> · ${fmtDate(plan.probation.decidedAt)}
            ${plan.probation.note ? ' - ' + esc(plan.probation.note) : ''}</p>
          ${goalsKickoffDue(plan) ? `<p class="callout">${icon('target', 15)} ${esc(t('onb.goalsCta'))}
            <button class="btn btn-sm btn-primary" onclick="location.hash='#/goals'">${esc(t('onb.goalsBtn'))}</button></p>` : ''}` : `
          <div class="onb-item ${midDue(plan) ? 'over' : ''}">
            <span class="onb-lbl">${esc(t('onb.midTitle'))} (${esc(t('onb.day'))} ~${midDay(plan)})</span>
            ${plan.midDone ? `<span class="badge b-green">${icon('check', 11)} ${fmtDate(plan.midDone)}</span>`
              : canEdit ? `<button class="btn btn-sm" data-mid="1">${icon('checkin', 13)} ${esc(t('onb.midBtn'))}</button>`
              : `<span class="badge b-amber">${esc(t('onb.midDue'))}</span>`}
          </div>
          <div class="onb-item ${rw ? 'over' : ''}">
            <span class="onb-lbl">${esc(t('onb.evalCompany'))}</span>
            ${rev ? `<button class="btn btn-sm" onclick="location.hash='#/review/${rev.id}'">${icon('doc', 13)} ${esc(t('onb.evalOpen'))} (${esc(t('st.' + rev.status))})</button>`
              : rw && canEdit ? `<button class="btn btn-sm" data-mkrev="1">${icon('plus', 13)} ${esc(t('onb.evalCreate'))}</button>`
              : `<small style="color:var(--text-muted)">${esc(t('onb.evalWindow'))}</small>`}
          </div>
          <div class="onb-item">
            <span class="onb-lbl">${esc(t('onb.evalNewhire'))}</span>
            ${plan.probation.newhireEval ? `<span class="badge b-green">${icon('check', 11)} ${fmtDate(plan.probation.newhireEval.at)}</span>`
              : `<small style="color:var(--text-muted)">${esc(t('onb.evalNewhirePending'))}</small>`}
          </div>
          ${plan.probation.newhireEval ? `<div class="onb-item"><span class="onb-lbl" style="font-size:.84rem">${plan.probation.newhireEval.answers.filter(a => a.v != null).map(a =>
            `${esc(t('onb.ne.' + a.q))}: <b>${esc(t('onb.sc.' + a.v))}</b>`).join(' · ')}${plan.probation.newhireEval.answers.filter(a => a.v == null && a.text).map(a => `<br><i>„${esc(a.text)}"</i>`).join('')}</span></div>` : ''}
          ${rw && canEdit ? `
          <div class="field" style="margin-top:8px"><label>${esc(t('onb.decNote'))}</label>
            <textarea class="input" id="onb-decnote" style="min-height:44px"></textarea></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-danger btn-sm" data-dec="ended">${esc(t('onb.decEnd'))}</button>
            <button class="btn btn-primary btn-sm" data-dec="confirmed">${icon('check', 13)} ${esc(t('onb.decConfirm'))}</button>
          </div>` : ''}`}`;

      /* bindy */
      m.querySelectorAll('[data-toggle]').forEach(bn => bn.onclick = () => {
        const it = plan.items.find(x => x.id === bn.dataset.toggle); if (!it) return;
        it.done = !it.done; it.doneAt = it.done ? Date.now() : null; it.doneById = it.done ? (va().personId || null) : null;
        Store.update('onboardingPlans', plan.id, {}); render2(m); rerender();
      });
      m.querySelectorAll('[data-del]').forEach(bn => bn.onclick = () => {
        plan.items = plan.items.filter(x => x.id !== bn.dataset.del);
        Store.update('onboardingPlans', plan.id, {}); render2(m); rerender();
      });
      m.querySelectorAll('[data-setrole]').forEach(bn => bn.onclick = () => {
        const rk = bn.dataset.setrole;
        m.querySelector('#onb-roleedit').innerHTML = `
          <div class="field"><label>${esc(t('onb.role.' + rk))}</label>
            <div class="filterbar" style="margin:0 0 6px">${icon('search', 15)}<input class="input" id="onb-rq" placeholder="${esc(t('rc.searchPerson'))}"></div>
            <div class="f3-list" id="onb-rlist" style="max-height:20vh"></div></div>`;
        personPicker(m, () => plan[rk + 'Id'], {
          inputId: 'onb-rq', listId: 'onb-rlist',
          people: () => Store.list('people').filter(x => x.id !== plan.personId && (rk !== 'buddy' || x.id !== p.managerId)),
        }, pid => { plan[rk + 'Id'] = pid; Store.update('onboardingPlans', plan.id, {}); render2(m); rerender(); });
        m.querySelector('#onb-rq').focus();
      });
      const add = m.querySelector('#onb-additem');
      if (add) add.onclick = () => {
        m.querySelector('#onb-additem-form').innerHTML = `
          <div class="field" style="margin-top:8px"><label>${esc(t('onb.itemLabel'))}</label><input class="input" id="onb-ai-l"></div>
          <div class="grid cols-2">
            <div class="field"><label>${esc(t('onb.itemPhase'))}</label><div class="scale-row" style="flex-wrap:wrap" id="onb-ai-ph">${PHASES.map((ph, i) =>
              `<button type="button" class="scale-opt ${i === 0 ? 'sel' : ''}" data-ph="${ph}">${esc(t('onb.ph.' + ph))}</button>`).join('')}</div></div>
            <div class="field"><label>${esc(t('onb.itemOwner'))}</label><div class="scale-row" style="flex-wrap:wrap" id="onb-ai-ow">${OWNER_ROLES.map((r, i) =>
              `<button type="button" class="scale-opt ${i === 0 ? 'sel' : ''}" data-ow="${r}">${esc(t('onb.role.' + r))}</button>`).join('')}</div></div>
          </div>
          <button class="btn btn-sm btn-primary" id="onb-ai-save">${esc(t('common.save'))}</button>`;
        const st = { ph: 'pre', ow: 'hr' };
        m.querySelectorAll('[data-ph]').forEach(b2 => b2.onclick = () => { st.ph = b2.dataset.ph; m.querySelectorAll('[data-ph]').forEach(x => x.classList.toggle('sel', x === b2)); });
        m.querySelectorAll('[data-ow]').forEach(b2 => b2.onclick = () => { st.ow = b2.dataset.ow; m.querySelectorAll('[data-ow]').forEach(x => x.classList.toggle('sel', x === b2)); });
        m.querySelector('#onb-ai-save').onclick = () => {
          const label = m.querySelector('#onb-ai-l').value.trim(); if (!label) return;
          const OFF = { pre: -3, day1: 0, week1: 7, month1: 30, month3: 85 };
          plan.items.push({ id: uid(), label, phase: st.ph, ownerRole: st.ow, dueOffset: OFF[st.ph], done: false, doneAt: null, doneById: null });
          Store.update('onboardingPlans', plan.id, {}); render2(m); rerender();
        };
      };
      const mid = m.querySelector('[data-mid]');
      if (mid) mid.onclick = () => midModal(plan, () => { render2(m); rerender(); });
      const mk = m.querySelector('[data-mkrev]');
      if (mk) mk.onclick = () => {
        const now = Date.now();
        Store.insert('reviews', {
          id: uid(), subjectId: p.id, evaluatorId: p.managerId, type: 'probation',
          period: Generator.CURRENT_PERIOD, status: 'pending_self', startedAt: now,
          deadline: probationEnd(plan), form: Generator.emptyForm(Store.getCompany(), p),
        });
        notify(t('onb.notifRev').split('{name}').join(p.name), 'all');
        toast(t('common.saved')); render2(m); rerender();
      };
      m.querySelectorAll('[data-dec]').forEach(bn => bn.onclick = () => {
        const note = (m.querySelector('#onb-decnote') || {}).value || '';
        if (bn.dataset.dec === 'confirmed') confirmProbation(plan, va().personId, note);
        else endProbation(plan, va().personId, note);
        toast(t('common.saved')); render2(m); rerender();
      });
      m.querySelector('#onb-pl-close').onclick = closeModal;
    };
    modal(`<h3>${icon('sprout', 18)}${esc(t('onb.planTitle'))}</h3>
      <div id="onb-pl-body"></div>
      <div class="wizard-foot"><span></span><button class="btn" id="onb-pl-close">${esc(t('common.close'))}</button></div>`, render2);
  }

  /* den ~45: strukturovaný 1:1 (návodné otázky, zápis do check-inů) */
  function midModal(plan, onDone) {
    const p = Store.get('people', plan.personId); if (!p) return;
    modal(`<h3>${icon('checkin', 18)}${esc(t('onb.midTitle'))}: ${esc(p.name)}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:8px">${esc(t('onb.midHint'))}</p>
      <ul style="font-size:.88rem;margin:0 0 10px 18px">${[1, 2, 3, 4, 5].map(i => `<li>${esc(t('onb.midQ' + i))}</li>`).join('')}</ul>
      <div class="field"><label>${esc(t('onb.midNote'))}</label><textarea class="input" id="onb-mid-note" style="min-height:64px"></textarea></div>
      <div class="wizard-foot">
        <button class="btn" id="onb-mid-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="onb-mid-save">${esc(t('common.save'))}</button></div>`, m => {
      m.querySelector('#onb-mid-cancel').onclick = closeModal;
      m.querySelector('#onb-mid-save').onclick = () => {
        Store.insert('checkins', {
          id: uid(), managerId: p.managerId, employeeId: p.id, at: Date.now(), mood: '🙂',
          notes: t('onb.midTitle') + ': ' + (m.querySelector('#onb-mid-note').value || '-'), next: '',
        });
        plan.midDone = Date.now();
        Store.update('onboardingPlans', plan.id, {});
        closeModal(); toast(t('common.saved')); onDone();
      };
    });
  }

  /* zrcadlové hodnocení: nováček hodnotí firmu/onboarding (Checkback) */
  const NE_QS = ['prepared', 'materials', 'support', 'match', 'free'];
  function newhireEvalModal(plan, onDone) {
    const answers = [];
    let idx = 0;
    const render2 = m => {
      const q = NE_QS[idx];
      const isText = q === 'free';
      m.querySelector('#onb-ne-body').innerHTML = `
        <p><b>${idx + 1}/${NE_QS.length}</b> ${esc(t('onb.ne.' + q))}</p>
        ${isText ? `<textarea class="input" id="onb-ne-t" style="min-height:56px"></textarea>
          <div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="onb-ne-done">${esc(t('common.send'))}</button></div>`
        : `<div class="scale-row" style="flex-wrap:wrap">${[4, 3, 2, 1].map(v =>
            `<button type="button" class="scale-opt" data-v="${v}">${esc(t('onb.sc.' + v))}</button>`).join('')}</div>`}`;
      m.querySelectorAll('[data-v]').forEach(bn => bn.onclick = () => {
        answers.push({ q, v: +bn.dataset.v }); idx++; render2(m);
      });
      const dn = m.querySelector('#onb-ne-done');
      if (dn) dn.onclick = () => {
        answers.push({ q, v: null, text: m.querySelector('#onb-ne-t').value.trim() });
        plan.probation.newhireEval = { answers, at: Date.now() };
        Store.update('onboardingPlans', plan.id, {});
        notify(t('onb.notifNe').split('{name}').join((Store.get('people', plan.personId) || {}).name), 'hr');
        closeModal(); toast(t('common.send')); onDone();
      };
      m.querySelector('#onb-ne-cancel').onclick = closeModal;
    };
    modal(`<h3>${icon('heartPulse', 18)}${esc(t('onb.neTitle'))}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('onb.neHint'))}</p>
      <div id="onb-ne-body"></div>
      <div class="wizard-foot"><button class="btn" id="onb-ne-cancel">${esc(t('common.cancel'))}</button><span></span></div>`, render2);
  }

  /* ---------------- šablony (jen HR) ---------------- */
  function templatesCardHtml() {
    const tpls = Store.list('onboardingTemplates');
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px">
        <h2 style="margin:0">${icon('doc', 18)}${esc(t('onb.tplTitle'))}</h2><span style="flex:1"></span>
        <button class="btn btn-sm" id="onb-tpl-add">${icon('plus', 14)} ${esc(t('onb.tplNew'))}</button></div>
      <p class="page-sub" style="margin:6px 0 10px">${esc(t('onb.tplSub'))}</p>
      ${tpls.map(tp => `<div class="kp-row" data-tpl-edit="${tp.id}">
        <div class="kp-main"><b>${esc(tp.name)}</b>
          <small style="color:var(--text-muted)">${tp.items.length} ${esc(t('onb.tplItems'))}</small></div>
      </div>`).join('') || `<div class="empty" style="padding:14px">${esc(t('onb.tplNone'))}</div>`}
    </div>`;
  }
  function bindTemplatesCard(root, rerender) {
    const add = root.querySelector('#onb-tpl-add');
    if (add) add.onclick = () => tplModal(null, rerender);
    root.querySelectorAll('[data-tpl-edit]').forEach(bn => bn.onclick = () => tplModal(Store.get('onboardingTemplates', bn.dataset.tplEdit), rerender));
  }
  function tplModal(existing, rerender) {
    const tp = existing ? JSON.parse(JSON.stringify(existing))
      : { id: uid(), name: '', deptKey: null, items: [] };
    const render2 = m => {
      m.querySelector('#onb-tp-body').innerHTML = `
        <div class="field"><label>${esc(t('onb.tplName'))}</label><input class="input" id="onb-tp-name" value="${esc(tp.name)}"></div>
        ${PHASES.map(ph => {
          const items = tp.items.filter(i => i.phase === ph);
          return `<div class="f3-grp" style="display:flex;align-items:center">${esc(t('onb.ph.' + ph))}<span style="flex:1"></span>
            <button type="button" class="onb-mini" data-tpadd="${ph}">＋</button></div>`
            + items.map(it => `<div class="onb-item">
              <span class="onb-lbl">${esc(it.label)}</span>${roleChip(it.ownerRole)}
              <small style="color:var(--text-muted)">${it.dueOffset >= 0 ? '+' : ''}${it.dueOffset} d</small>
              <button type="button" class="onb-mini" data-tpdel="${it.id}">✕</button></div>`).join('');
        }).join('')}
        <div id="onb-tp-form"></div>`;
      m.querySelector('#onb-tp-name').oninput = e2 => { tp.name = e2.target.value; };
      m.querySelectorAll('[data-tpdel]').forEach(bn => bn.onclick = () => { tp.items = tp.items.filter(x => x.id !== bn.dataset.tpdel); render2(m); });
      m.querySelectorAll('[data-tpadd]').forEach(bn => bn.onclick = () => {
        const ph = bn.dataset.tpadd;
        const OFF = { pre: -3, day1: 0, week1: 7, month1: 30, month3: 85 };
        m.querySelector('#onb-tp-form').innerHTML = `
          <div class="field" style="margin-top:8px"><label>${esc(t('onb.itemLabel'))} · ${esc(t('onb.ph.' + ph))}</label><input class="input" id="onb-tp-l"></div>
          <div class="field"><label>${esc(t('onb.itemOwner'))}</label><div class="scale-row" style="flex-wrap:wrap">${OWNER_ROLES.map((r, i) =>
            `<button type="button" class="scale-opt ${i === 0 ? 'sel' : ''}" data-tpow="${r}">${esc(t('onb.role.' + r))}</button>`).join('')}</div></div>
          <button class="btn btn-sm btn-primary" id="onb-tp-isave">${esc(t('common.save'))}</button>`;
        let ow = 'hr';
        m.querySelectorAll('[data-tpow]').forEach(b2 => b2.onclick = () => { ow = b2.dataset.tpow; m.querySelectorAll('[data-tpow]').forEach(x => x.classList.toggle('sel', x === b2)); });
        m.querySelector('#onb-tp-isave').onclick = () => {
          const label = m.querySelector('#onb-tp-l').value.trim(); if (!label) return;
          tp.items.push({ id: uid(), label, phase: ph, ownerRole: ow, dueOffset: OFF[ph] });
          render2(m);
        };
      });
      m.querySelector('#onb-tp-save').onclick = () => {
        if (!tp.name.trim()) { toast(t('onb.tplName')); return; }
        if (existing) { Object.assign(Store.get('onboardingTemplates', tp.id), tp); Store.update('onboardingTemplates', tp.id, {}); }
        else Store.insert('onboardingTemplates', tp);
        closeModal(); toast(t('common.saved')); rerender();
      };
      const del = m.querySelector('#onb-tp-del');
      if (del) del.onclick = () => { Store.remove('onboardingTemplates', tp.id); closeModal(); toast(t('common.saved')); rerender(); };
      m.querySelector('#onb-tp-cancel').onclick = closeModal;
    };
    modal(`<h3>${icon('doc', 18)}${esc(t('onb.tplModal'))}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('onb.tplHrOnly'))}</p>
      <div id="onb-tp-body"></div>
      <div class="wizard-foot">
        ${existing ? `<button class="btn btn-danger" id="onb-tp-del">${icon('trash', 14)} ${esc(t('common.delete'))}</button>` : '<span></span>'}
        <div style="display:flex;gap:8px">
          <button class="btn" id="onb-tp-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="onb-tp-save">${esc(t('common.save'))}</button></div></div>`, render2);
  }

  /* ---------------- karta na Přehledu (nováček / buddy / manažer) ---------------- */
  function homeCardHtml(me) {
    if (!me) return '';
    const out = [];
    const my = planOf(me.id);
    if (my && running(my)) {
      const mine = my.items.filter(i => i.ownerRole === 'newhire');
      const due = pulseDue(my);
      const doEval = reviewWindow(my) && !my.probation.newhireEval;
      out.push(`<div class="card">
        <h2>${icon('sprout', 18)}${esc(t('onb.homeMy'))}</h2>
        <p class="page-sub" style="margin-bottom:8px">${esc(t('onb.homeMySub'))} · ${esc(t('onb.day'))} ${daysSince(me)} · ${progress(my)} %</p>
        ${mine.map(it => `<div class="onb-item ${it.done ? 'done' : ''}">
          <button type="button" class="onb-check" data-onb-mytgl="${it.id}">${it.done ? icon('check', 14) : ''}</button>
          <span class="onb-lbl">${esc(it.label)}</span><small style="color:var(--text-muted)">${fmtDate(itemDue(my, it))}</small></div>`).join('')
          || `<p class="hint">${esc(t('onb.homeNoItems'))}</p>`}
        ${due ? `<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="location.hash='#/copilot'">${icon('copilot', 14)} ${esc(t('onb.homePulseBtn'))} (${esc(t('onb.day'))} ${due})</button>` : ''}
        ${doEval ? `<button class="btn btn-sm" style="margin-top:8px" data-onb-ne="1">${icon('heartPulse', 14)} ${esc(t('onb.neBtn'))}</button>` : ''}
      </div>`);
    }
    /* buddy: jen svoje úkoly (rozhodnutí 2026-08-10) */
    const buddyPlans = plans().filter(pl => running(pl) && pl.buddyId === me.id);
    if (buddyPlans.length) {
      out.push(`<div class="card">
        <h2>${icon('team', 18)}${esc(t('onb.homeBuddy'))}</h2>
        ${buddyPlans.map(pl => {
          const np = Store.get('people', pl.personId); if (!np) return '';
          const mine = pl.items.filter(i => i.ownerRole === 'buddy');
          return `<p style="margin:4px 0"><b>${avatar(np, 22)} ${esc(np.name)}</b> <small style="color:var(--text-muted)">(${esc(t('onb.day'))} ${daysSince(np)})</small></p>`
            + mine.map(it => `<div class="onb-item ${it.done ? 'done' : overdue(pl, it) ? 'over' : ''}">
              <button type="button" class="onb-check" data-onb-btgl="${pl.id}|${it.id}">${it.done ? icon('check', 14) : ''}</button>
              <span class="onb-lbl">${esc(it.label)}</span><small style="color:var(--text-muted)">${fmtDate(itemDue(pl, it))}</small></div>`).join('');
        }).join('')}
      </div>`);
    }
    return out.join('');
  }
  function bindHomeCard(root, me, rerender) {
    const my = planOf(me && me.id);
    root.querySelectorAll('[data-onb-mytgl]').forEach(bn => bn.onclick = () => {
      const it = my.items.find(x => x.id === bn.dataset.onbMytgl); if (!it) return;
      it.done = !it.done; it.doneAt = it.done ? Date.now() : null; it.doneById = me.id;
      Store.update('onboardingPlans', my.id, {}); rerender();
    });
    root.querySelectorAll('[data-onb-btgl]').forEach(bn => bn.onclick = () => {
      const [plid, itid] = bn.dataset.onbBtgl.split('|');
      const pl = Store.get('onboardingPlans', plid); if (!pl) return;
      const it = pl.items.find(x => x.id === itid); if (!it) return;
      it.done = !it.done; it.doneAt = it.done ? Date.now() : null; it.doneById = me.id;
      Store.update('onboardingPlans', pl.id, {}); rerender();
    });
    const ne = root.querySelector('[data-onb-ne]');
    if (ne) ne.onclick = () => newhireEvalModal(my, rerender);
  }
  /* todo položky pro Přehled (manažer: půlka ZD, vyhodnocení, cíle po ZD) */
  function homeTodos(me, role) {
    const out = [];
    if (!me || !['manager', 'hr'].includes(role)) return out;
    const ids = role === 'manager' ? new Set(subtreeOf(me.id).map(p => p.id)) : null;
    plans().filter(pl => !ids || ids.has(pl.personId)).forEach(pl => {
      const p = Store.get('people', pl.personId); if (!p) return;
      if (midDue(pl)) out.push({ ico: icon('checkin', 16), txt: t('onb.todoMid') + ' - ' + p.name, plan: pl.id, d: Math.max(0, probationDaysLeft(pl)) });
      if (reviewWindow(pl)) out.push({ ico: icon('alert', 16), txt: t('onb.todoEval') + ' - ' + p.name, plan: pl.id, d: Math.max(0, probationDaysLeft(pl)) });
      if (role === 'manager' && goalsKickoffDue(pl)) out.push({ ico: icon('target', 16), txt: t('onb.todoGoals') + ' - ' + p.name, hash: '#/goals', d: 14 });
    });
    return out;
  }

  window.OnboardingViews = { render, planModal, newPlanModal, newhireEvalModal, homeCardHtml, bindHomeCard, homeTodos };
})();
