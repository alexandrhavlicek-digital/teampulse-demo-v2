/* TeamPulse demo v2 - 360 zpětná vazba (koncept_talent_reporting_9box_360.md §2)
   -------------------------------------------------------------------------
   On-demand nástroj, ne celofiremní kolo: manažer (na podřízeného) nebo HR
   (na kohokoli) si vyžádá 360 od 3-6 respondentů. Dotazník = stejná škála
   TN…NU jako zbytek systému (3 oblasti / 7 kompetencí v detailním režimu)
   + dvě otevřené otázky. Anonymita tvrdě: agregát se zobrazí až od
   3 odevzdaných odpovědí; jednotlivé odpovědi nevidí nikdo, ani HR.
   Otevřené texty se zobrazují zamíchané bez atribuce. */
(function () {
  const { esc, avatar, modal, closeModal, notify } = UI;
  const MIN_ANON = 3;

  /* ---------------- logic ---------------- */
  function ratedKeys() {
    const co = Store.getCompany();
    return (co && co.competencies)
      ? co.competencies.map(c => ({ key: c.key, label: c.title }))
      : ['teamwork', 'growth', 'quality'].map(a => ({ key: a, label: t('rev.area.' + a) }));
  }
  function groupOf(subject, person) {
    if (person.managerId === subject.id) return 'report';
    if (person.deptKey === subject.deptKey) return 'peer';
    return 'internal';
  }
  function requestsFor(pid) { return Store.list('feedback360').filter(f => f.subjectId === pid); }
  function pendingFor(personId) {
    return Store.list('feedback360').filter(f => f.status === 'collecting'
      && f.respondents.some(r => r.personId === personId && r.status === 'invited'));
  }
  function doneCount(f) { return f.respondents.filter(r => r.status === 'done').length; }
  /* agregát: průměr hodnot ratingů → nejbližší stupeň škály; jen od MIN_ANON odpovědí */
  function aggregate(f) {
    if (doneCount(f) < MIN_ANON) return null;
    const done = f.respondents.filter(r => r.status === 'done');
    const out = { ratings: {}, strengths: [], growth: [], n: done.length };
    ratedKeys().forEach(({ key }) => {
      const vals = done.map(r => ReviewLogic.RATING_VALUE[(r.ratings || {})[key]]).filter(v => v != null);
      if (!vals.length) { out.ratings[key] = null; return; }
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      let best = null, dist = 9;
      Object.entries(ReviewLogic.RATING_VALUE).forEach(([k, v]) => {
        if (Math.abs(v - avg) < dist) { dist = Math.abs(v - avg); best = k; }
      });
      out.ratings[key] = { label: best, avg };
    });
    /* bez atribuce, deduplikované, seřazené dle délky (ne dle pořadí respondentů) */
    done.forEach(r => { if (r.strengths) out.strengths.push(r.strengths); if (r.growth) out.growth.push(r.growth); });
    out.strengths = [...new Set(out.strengths)].sort((a, b) => a.length - b.length);
    out.growth = [...new Set(out.growth)].sort((a, b) => b.length - a.length);
    return out;
  }
  function latestClosedAgg(pid) {
    const fs = requestsFor(pid).filter(f => aggregate(f)).sort((a, b) => (b.deadline || 0) - (a.deadline || 0));
    return fs.length ? { f: fs[0], agg: aggregate(fs[0]) } : null;
  }
  window.Feedback360 = { requestsFor, pendingFor, aggregate, latestClosedAgg, ratedKeys, MIN_ANON };

  /* ---------------- žádost o 360 (mgr/HR) ---------------- */
  function requestModal(subjectId, onDone) {
    const subject = Store.get('people', subjectId); if (!subject) return;
    const va = App.viewAs();
    const ps = Store.list('people').filter(p => p.id !== subjectId && p.id !== va.personId);
    const picked = new Set();
    const render = m => {
      m.querySelector('#f3-count').innerHTML = `<span class="badge ${picked.size >= 3 && picked.size <= 6 ? 'b-green' : 'b-amber'}">${picked.size}/3-6</span>`;
      m.querySelectorAll('[data-f3p]').forEach(bn => {
        bn.classList.toggle('sel', picked.has(bn.dataset.f3p));
      });
    };
    modal(`<h3>${icon('team', 18)}${esc(t('f360.requestTitle'))}: ${esc(subject.name)}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('f360.requestHint'))}</p>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <b>${esc(t('f360.respondents'))}</b><span id="f3-count"></span></div>
      <div style="max-height:40vh;overflow:auto;display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${ps.map(p => `<button type="button" class="scale-opt" data-f3p="${p.id}" style="display:flex;gap:6px;align-items:center">
          ${avatar(p, 22)} ${esc(p.name)} <small style="color:var(--text-muted)">${esc(t('f360.group.' + groupOf(subject, p)))}</small></button>`).join('')}
      </div>
      <div class="wizard-foot">
        <button class="btn" id="f3-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="f3-send">${esc(t('common.send'))} ${icon('send', 14)}</button>
      </div>`, m => {
      m.querySelectorAll('[data-f3p]').forEach(bn => bn.onclick = () => {
        const id = bn.dataset.f3p;
        if (picked.has(id)) picked.delete(id); else if (picked.size < 6) picked.add(id);
        render(m);
      });
      m.querySelector('#f3-cancel').onclick = closeModal;
      m.querySelector('#f3-send').onclick = () => {
        if (picked.size < 3) { UI.toast(t('f360.min3')); return; }
        Store.insert('feedback360', {
          id: uid(), subjectId, requestedById: va.personId || null,
          period: Generator.CURRENT_PERIOD, deadline: Date.now() + 10 * 86400000, status: 'collecting',
          respondents: [...picked].map(pid => ({
            personId: pid, group: groupOf(subject, Store.get('people', pid)),
            status: 'invited', ratings: {}, strengths: '', growth: '',
          })),
        });
        notify(t('f360.notifInvite') + ' - ' + subject.name, 'all');
        closeModal(); UI.toast(t('common.send'));
        if (onDone) onDone();
      };
      render(m);
    });
  }

  /* ---------------- respondentský dotazník (max 5 minut) ---------------- */
  function respondModal(f, personId, onDone) {
    const subject = Store.get('people', f.subjectId);
    const resp = f.respondents.find(r => r.personId === personId);
    if (!subject || !resp) return;
    const keys = ratedKeys();
    modal(`<h3>${icon('heartPulse', 18)}${esc(t('f360.respondTitle'))}: ${esc(subject.name)}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('f360.anonNote'))}</p>
      <div style="max-height:48vh;overflow:auto;padding-right:4px">
        ${keys.map(k => `<div class="field"><label>${esc(k.label)}</label>
          <div class="scale-row sm" data-f3s="${k.key}">
            ${ReviewLogic.SCALE_DEF.map(sd => `<button type="button" class="scale-opt" data-val="${sd.k}" title="${esc(ReviewLogic.scaleLabel(sd.k))}"><b>${sd.k}</b></button>`).join('')}
          </div></div>`).join('')}
        <div class="field"><label>${esc(t('f360.qStrengths'))}</label><textarea class="input" id="f3-str" style="min-height:56px"></textarea></div>
        <div class="field"><label>${esc(t('f360.qGrowth'))}</label><textarea class="input" id="f3-gro" style="min-height:56px"></textarea></div>
      </div>
      <div class="wizard-foot">
        <button class="btn" id="f3r-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="f3r-send">${esc(t('common.send'))} ${icon('send', 14)}</button>
      </div>`, m => {
      const ratings = {};
      m.querySelectorAll('[data-f3s]').forEach(row => row.addEventListener('click', e => {
        const btn = e.target.closest('.scale-opt'); if (!btn) return;
        row.querySelectorAll('.scale-opt').forEach(x => x.classList.remove('sel'));
        btn.classList.add('sel');
        ratings[row.dataset.f3s] = btn.dataset.val;
      }));
      m.querySelector('#f3r-cancel').onclick = closeModal;
      m.querySelector('#f3r-send').onclick = () => {
        if (Object.keys(ratings).length < keys.length) { UI.toast(t('f360.rateAll')); return; }
        resp.ratings = ratings;
        resp.strengths = m.querySelector('#f3-str').value;
        resp.growth = m.querySelector('#f3-gro').value;
        resp.status = 'done';
        if (f.respondents.every(r => r.status === 'done')) f.status = 'closed';
        Store.update('feedback360', f.id, {});
        closeModal(); UI.toast(t('f360.thanks'));
        if (onDone) onDone();
      };
    });
  }

  /* ---------------- výstup „tři pohledy" (self · 360 · mgr) ---------------- */
  function threeViewsHtml(pid) {
    const la = latestClosedAgg(pid);
    if (!la) return '';
    const { agg } = la;
    const rev = Store.list('reviews').filter(r => r.subjectId === pid)
      .sort((a, b) => b.startedAt - a.startedAt)
      .find(r => r.form && (r.form.self || r.form.mgr));
    const co = Store.getCompany();
    const detailed = !!(co && co.competencies);
    const selfOf = k => {
      if (!rev) return '-';
      if (detailed && rev.form.compRatings) return rev.form.compRatings.self[k] || '-';
      return (rev.form.self.areas || {})[k] || '-';
    };
    const mgrOf = k => {
      if (!rev) return '-';
      if (detailed && rev.form.compRatings) return rev.form.compRatings.mgr[k] || '-';
      return (rev.form.mgr.areas || {})[k] || '-';
    };
    return `<div style="margin-top:10px">
      <b>${esc(t('f360.threeViews'))}</b> <span class="badge b-blue">${agg.n}× ${esc(t('f360.responses'))}</span>
      <table class="table" style="margin-top:6px">
        <tr><th></th><th>${esc(t('misc.you'))}</th><th>360</th><th>${esc(t('rev.evaluator'))}</th></tr>
        ${ratedKeys().map(k => {
          const a = agg.ratings[k.key];
          const diff = a && selfOf(k.key) !== '-' && a.label !== selfOf(k.key);
          return `<tr><td>${esc(k.label)}</td><td>${esc(selfOf(k.key))}</td>
            <td>${a ? `<b>${a.label}</b>` : '-'}${diff ? ` <span class="badge b-amber" title="${esc(t('f360.diffHint'))}">≠</span>` : ''}</td>
            <td>${esc(mgrOf(k.key))}</td></tr>`;
        }).join('')}
      </table>
      ${agg.strengths.length ? `<p style="margin-top:8px;font-size:.86rem"><b>${esc(t('f360.qStrengths'))}:</b><br>${agg.strengths.map(s2 => '· ' + esc(s2)).join('<br>')}</p>` : ''}
      ${agg.growth.length ? `<p style="margin-top:6px;font-size:.86rem"><b>${esc(t('f360.qGrowth'))}:</b><br>${agg.growth.map(s2 => '· ' + esc(s2)).join('<br>')}</p>` : ''}
    </div>`;
  }

  /* stavový řádek pro profil / podklady: běžící sběr nebo výsledek */
  function statusLineHtml(pid) {
    const open = requestsFor(pid).find(f => f.status === 'collecting');
    if (open) return `<span class="badge b-amber">${icon('clock', 11)} 360: ${doneCount(open)}/${open.respondents.length} ${esc(t('f360.responses'))}${doneCount(open) < MIN_ANON ? ' · ' + esc(t('f360.anonWait')) : ''}</span>`;
    return '';
  }

  window.Feedback360Views = { requestModal, respondModal, threeViewsHtml, statusLineHtml };
})();
