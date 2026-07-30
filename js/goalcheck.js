/* TeamPulse demo v2 - kvartální check cílů (2026-07-30)
   -------------------------------------------------------------------------
   Progress osobního cíle je subjektivní sebe-report → nesmí se měnit volným
   posuvníkem bez kontextu. Jediná cesta změny je GoalCheck.applyProgress,
   která vedle hodnoty zapíše auditní stopu do goal.progressLog
   {at, from, to, note, byId}. Vstupy: kvartální check (todo na Přehledu,
   povinný komentář u každé změny), pololetní check (komentář z formuláře),
   Copilot (vyžádá komentář), HR korekce v sekci Cíle (označená v logu).
   Kadenci řídí HR v Pravidlech cyklu: cycleConfig.goalCheck = q|semi|off.
   KPI hodnoty (firemní/týmové) jsou oddělená veličina - spravuje je HR
   v KPI boardu (v produkci import z BI), zaměstnanec je nemění nikdy. */
(function () {
  const { esc, fmtDate, modal, closeModal } = UI;

  /* ---------------- logic ---------------- */
  function cadence() {
    const co = Store.getCompany();
    return ((co && co.cycleConfig) || {}).goalCheck || 'q';
  }
  function quarterKey(ts) {
    const d = new Date(ts || Date.now());
    return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
  }
  function quarterDaysLeft() {
    const d = new Date();
    const endMonth = (Math.floor(d.getMonth() / 3) + 1) * 3;   /* 3|6|9|12 */
    const end = new Date(d.getFullYear(), endMonth, 0, 23, 59);
    return Math.max(0, Math.ceil((end - d) / 86400000));
  }
  function goalsOf(personId) {
    return Store.list('goals').filter(g => g.type === 'personal'
      && g.ownerId === personId && g.period === Generator.CURRENT_PERIOD);
  }
  function doneThisQuarter(personId) {
    const q = quarterKey();
    return Store.list('goalChecks').some(c => c.personId === personId && c.q === q);
  }
  /* semi check ve stejném kvartálu pokrývá progress - kvartální check se nedubluje */
  function semiCoversQuarter(personId) {
    const q = quarterKey();
    return Store.list('reviews').some(r => r.type === 'semi' && r.subjectId === personId
      && r.status !== 'cancelled' && quarterKey(r.startedAt) === q);
  }
  function pendingFor(personId) {
    if (!personId || cadence() !== 'q') return false;
    if (doneThisQuarter(personId) || semiCoversQuarter(personId)) return false;
    return goalsOf(personId).length > 0;
  }
  /* jediná cesta ke změně progressu - hodnota + auditní stopa */
  function applyProgress(goalId, pct, note, byId) {
    const g = Store.get('goals', goalId); if (!g) return null;
    pct = Math.max(0, Math.min(100, Math.round(+pct || 0)));
    if (pct === g.progress) return g;
    const log = (g.progressLog || []).concat([{ at: Date.now(), from: g.progress, to: pct, note: note || '', byId: byId || null }]);
    return Store.update('goals', goalId, { progress: pct, progressLog: log });
  }
  function recordCheck(personId) {
    Store.insert('goalChecks', { id: uid(), personId, q: quarterKey(), at: Date.now() });
  }
  /* poslední změny progressu pro Podklady z období */
  function recentLogs(personId, since, limit) {
    return goalsOf(personId)
      .flatMap(g => (g.progressLog || []).map(e => ({ goal: g, e })))
      .filter(x => x.e.at > (since || 0))
      .sort((a, b) => a.e.at - b.e.at)
      .slice(-(limit || 3));
  }
  window.GoalCheck = { cadence, quarterKey, quarterDaysLeft, goalsOf, doneThisQuarter, semiCoversQuarter, pendingFor, applyProgress, recordCheck, recentLogs };

  /* ---------------- modal kvartálního checku ---------------- */
  function checkModal(personId, onDone) {
    const gs = goalsOf(personId);
    if (!gs.length) return;
    modal(`<h3>${icon('target', 18)}${esc(t('gc.title'))} <span class="badge">${esc(quarterKey())}</span></h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('gc.hint'))}</p>
      ${gs.map(g => `
        <div class="gc-item" data-gc="${g.id}" data-orig="${g.progress}">
          <b>${esc(g.title)}</b> <span class="badge">${esc(t('rev.area.' + g.areaKey))}</span> ${UI.kpiChip(g.kpiRef)}
          <div style="display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap">
            <input type="range" min="0" max="100" step="1" value="${g.progress}" data-gcr="${g.id}" style="flex:1;min-width:140px">
            <b style="width:52px;text-align:right"><span data-gcv="${g.id}">${g.progress}</span> %</b>
          </div>
          <textarea class="input" data-gcn="${g.id}" hidden style="margin-top:6px;min-height:44px" placeholder="${esc(t('gc.note'))}"></textarea>
        </div>`).join('')}
      <div class="wizard-foot">
        <button class="btn" id="gc-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="gc-save">${esc(t('common.save'))} ${icon('check', 14)}</button>
      </div>`, m => {
      m.querySelectorAll('[data-gcr]').forEach(sl => sl.oninput = () => {
        const id = sl.dataset.gcr;
        const item = m.querySelector(`[data-gc="${id}"]`);
        m.querySelector(`[data-gcv="${id}"]`).textContent = sl.value;
        m.querySelector(`[data-gcn="${id}"]`).hidden = +sl.value === +item.dataset.orig;
      });
      m.querySelector('#gc-cancel').onclick = closeModal;
      m.querySelector('#gc-save').onclick = () => {
        const changes = [];
        let missing = false;
        m.querySelectorAll('[data-gc]').forEach(item => {
          const id = item.dataset.gc, orig = +item.dataset.orig;
          const val = +m.querySelector(`[data-gcr="${id}"]`).value;
          if (val === orig) { item.classList.remove('gc-missing'); return; }
          const note = m.querySelector(`[data-gcn="${id}"]`).value.trim();
          if (!note) { missing = true; item.classList.add('gc-missing'); return; }
          item.classList.remove('gc-missing');
          changes.push({ id, val, note });
        });
        if (missing) { UI.toast(t('gc.noteReq')); return; }
        changes.forEach(ch => applyProgress(ch.id, ch.val, ch.note, personId));
        recordCheck(personId);
        closeModal(); UI.toast(t('gc.saved'));
        if (onDone) onDone();
      };
    });
  }

  /* ---------------- historie plnění cíle ---------------- */
  function historyModal(goalId) {
    const g = Store.get('goals', goalId); if (!g) return;
    const log = (g.progressLog || []).slice().reverse();
    modal(`<h3>${icon('clock', 18)}${esc(t('gc.history'))}</h3>
      <p class="page-sub" style="margin-bottom:10px">${esc(g.title)}</p>
      ${log.length ? log.map(e => {
        const by = e.byId ? Store.get('people', e.byId) : null;
        return `<div class="gc-log">
          <span class="badge">${e.from} → ${e.to} %</span>
          <span style="flex:1;min-width:160px">${esc(e.note || '-')}</span>
          <small style="color:var(--text-muted)">${by ? esc(by.name) + ' · ' : ''}${fmtDate(e.at)}</small></div>`;
      }).join('') : `<p class="page-sub">${esc(t('gc.noHistory'))}</p>`}
      <div class="wizard-foot"><span></span><button class="btn" id="gc-close">${esc(t('common.close'))}</button></div>`, m => {
      m.querySelector('#gc-close').onclick = closeModal;
    });
  }
  window.GoalCheckViews = { checkModal, historyModal };
})();
