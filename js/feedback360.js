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
  /* ---------------- behaviorální item bank (best practice: pozorovatelné chování,
     frekvenční škála se slovními kotvami, volba „Nemohu posoudit") ---------------- */
  const FREQ = [
    { v: 'TN', fk: '5' }, { v: 'PO', fk: '4' }, { v: 'KV', fk: '3' },
    { v: 'NR', fk: '2' }, { v: 'NU', fk: '1' },
  ]; /* interní uložení zůstává na stávající škále → agregace a tři pohledy fungují beze změny */
  function items() {
    const co = Store.getCompany();
    if (co && co.competencies) {
      return co.competencies.map(c => {
        const key = 'f360.item.comp.' + c.key;
        const txt = t(key) !== key ? t(key) : t('f360.item.generic').split('{c}').join(c.title);
        return { id: 'c_' + c.key, key: c.key, text: txt };
      });
    }
    const bank = { teamwork: ['team1', 'team2', 'team3'], growth: ['grow1', 'grow2'], quality: ['qual1', 'qual2', 'qual3'] };
    const out = [];
    Object.entries(bank).forEach(([key, ids]) => ids.forEach(id => out.push({ id, key, text: t('f360.item.' + id) })));
    return out;
  }
  /* odpovědi {itemId: 'TN'..'NU'|'NA'} → rating per oblast/kompetence (Ø hodnot, N/A se vynechá) */
  function deriveFromItems(answers, itemList) {
    const byKey = {};
    (itemList || items()).forEach(it => {
      const a = answers[it.id];
      if (!a || a === 'NA') return;
      const v = ReviewLogic.RATING_VALUE[a];
      if (v != null) (byKey[it.key] = byKey[it.key] || []).push(v);
    });
    const ratings = {};
    Object.entries(byKey).forEach(([k, vals]) => {
      const avg = vals.reduce((x, y) => x + y, 0) / vals.length;
      let best = null, dist = 9;
      Object.entries(ReviewLogic.RATING_VALUE).forEach(([kk, v]) => {
        if (Math.abs(v - avg) < dist) { dist = Math.abs(v - avg); best = kk; }
      });
      ratings[k] = best;
    });
    return ratings;
  }
  window.Feedback360 = { requestsFor, pendingFor, aggregate, latestClosedAgg, ratedKeys, MIN_ANON, items, deriveFromItems, FREQ };

  /* ---------------- žádost o 360 (mgr/HR) ---------------- */
  function requestModal(subjectId, onDone) {
    const subject = Store.get('people', subjectId); if (!subject) return;
    const va = App.viewAs();
    const ps = Store.list('people').filter(p => p.id !== subjectId && p.id !== va.personId);
    const picked = new Set();
    let q = '';
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    /* skupiny dle relevance: manažer → podřízení → kolegové z oddělení → ostatní */
    function grouped() {
      const mgr = ps.filter(p => p.id === subject.managerId);
      const reports = ps.filter(p => p.managerId === subject.id);
      const usedIds = new Set(mgr.concat(reports).map(p => p.id));
      const peers = ps.filter(p => !usedIds.has(p.id) && p.deptKey === subject.deptKey);
      peers.forEach(p => usedIds.add(p.id));
      const others = ps.filter(p => !usedIds.has(p.id));
      return [
        [t('f360.grp.mgr'), mgr], [t('f360.grp.reports'), reports],
        [t('f360.grp.peers'), peers], [t('f360.grp.others'), others],
      ];
    }
    const match = p => !q || norm(p.name + ' ' + p.role).includes(norm(q));
    const rowHtml = p => `
      <button type="button" class="f3-row ${picked.has(p.id) ? 'sel' : ''}" data-f3p="${p.id}">
        ${avatar(p, 30)}
        <span class="f3-nm"><b>${esc(p.name)}</b><small>${esc(p.role)} · ${esc(p.dept)}</small></span>
        <span class="badge">${esc(t('f360.group.' + groupOf(subject, p)))}</span>
        <span class="f3-check">${picked.has(p.id) ? icon('check', 15) : icon('plus', 15)}</span>
      </button>`;

    const render = m => {
      /* vybraní jako chips nahoře (odebrání ×) */
      m.querySelector('#f3-sel').innerHTML = picked.size
        ? [...picked].map(id => { const p = Store.get('people', id); return p ? `
            <span class="f3-chip">${avatar(p, 20)} ${esc(p.firstName)} ${esc(p.lastName)}
              <button type="button" data-f3x="${id}" title="${esc(t('common.delete'))}">✕</button></span>` : ''; }).join('')
        : `<span class="f3-chip-empty">${esc(t('f360.noneSelected'))}</span>`;
      m.querySelector('#f3-count').innerHTML =
        `<span class="badge ${picked.size >= 3 && picked.size <= 6 ? 'b-green' : 'b-amber'}">${picked.size}/3–6</span>`;
      /* seznam po skupinách, filtrovaný hledáním */
      m.querySelector('#f3-list').innerHTML = grouped().map(([label, list]) => {
        const vis = list.filter(match);
        if (!vis.length) return '';
        return `<div class="f3-grp">${esc(label)}</div>` + vis.map(rowHtml).join('');
      }).join('') || `<div class="f3-chip-empty">${esc(t('flt.noMatch'))}</div>`;
      const send = m.querySelector('#f3-send');
      if (send) send.disabled = picked.size < 3;
      /* bindy překreslené části */
      m.querySelectorAll('[data-f3p]').forEach(bn => bn.onclick = () => {
        const id = bn.dataset.f3p;
        if (picked.has(id)) picked.delete(id);
        else if (picked.size < 6) picked.add(id);
        else { UI.toast(t('f360.max6')); return; }
        render(m);
      });
      m.querySelectorAll('[data-f3x]').forEach(bn => bn.onclick = () => { picked.delete(bn.dataset.f3x); render(m); });
    };

    modal(`<h3>${icon('team', 18)}${esc(t('f360.requestTitle'))}: ${esc(subject.name)}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('f360.requestHint'))}</p>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <b>${esc(t('f360.respondents'))}</b><span id="f3-count"></span></div>
      <div class="f3-selrow" id="f3-sel"></div>
      <div class="filterbar" style="margin:8px 0 6px">${icon('search', 15)}
        <input class="input" id="f3-q" placeholder="${esc(t('f360.search'))}"></div>
      <div class="f3-list" id="f3-list"></div>
      <div class="wizard-foot">
        <button class="btn" id="f3-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="f3-send" disabled>${esc(t('common.send'))} ${icon('send', 14)}</button>
      </div>`, m => {
      const qi = m.querySelector('#f3-q');
      if (qi) qi.oninput = () => { q = qi.value; render(m); }; /* re-render nechává input netknutý → fokus drží */
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

  /* ---------------- respondentský dotazník (~4 minuty) ----------------
     Behaviorální výroky + plně popsaná frekvenční škála (žádné zkratky),
     „Nemohu posoudit" pro nepozorované chování, progress, 2 otevřené otázky. */
  function respondModal(f, personId, onDone) {
    const subject = Store.get('people', f.subjectId);
    const resp = f.respondents.find(r => r.personId === personId);
    if (!subject || !resp) return;
    const list = items();
    const answers = {};
    const freqBtn = (v, label, extra) =>
      `<button type="button" class="f36-opt ${extra || ''}" data-val="${v}">${esc(label)}</button>`;
    modal(`<h3>${icon('heartPulse', 18)}${esc(t('f360.respondTitle'))}: ${esc(subject.name)}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:4px">${esc(t('f360.anonNote'))}</p>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${esc(t('f360.respIntro'))}</p>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <b>${esc(t('f360.progress'))}</b><span class="badge" id="f36-prog">0/${list.length}</span></div>
      <div class="f36-body">
        ${list.map((it, i2) => `
          <div class="f36-item" data-f36="${it.id}">
            <p class="f36-q"><span class="f36-num">${i2 + 1}</span>${esc(it.text)}</p>
            <div class="f36-opts">
              ${FREQ.map(fq => freqBtn(fq.v, t('f360.freq.' + fq.fk))).join('')}
              ${freqBtn('NA', t('f360.freq.na'), 'na')}
            </div>
          </div>`).join('')}
        <div class="field" style="margin-top:12px"><label>${esc(t('f360.qStrengths'))}</label>
          <textarea class="input" id="f3-str" style="min-height:56px"></textarea></div>
        <div class="field"><label>${esc(t('f360.qGrowth'))}</label>
          <textarea class="input" id="f3-gro" style="min-height:56px"></textarea></div>
      </div>
      <div class="wizard-foot">
        <button class="btn" id="f3r-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="f3r-send" disabled>${esc(t('common.send'))} ${icon('send', 14)}</button>
      </div>`, m => {
      const sync = () => {
        const n = Object.keys(answers).length;
        const prog = m.querySelector('#f36-prog');
        if (prog) {
          prog.textContent = n + '/' + list.length;
          prog.className = 'badge ' + (n === list.length ? 'b-green' : '');
        }
        const send = m.querySelector('#f3r-send');
        if (send) send.disabled = n < list.length;
      };
      m.querySelectorAll('[data-f36]').forEach(row => row.addEventListener('click', e => {
        const btn = e.target.closest('.f36-opt'); if (!btn) return;
        row.querySelectorAll('.f36-opt').forEach(x => x.classList.remove('sel'));
        btn.classList.add('sel');
        answers[row.dataset.f36] = btn.dataset.val;
        sync();
      }));
      m.querySelector('#f3r-cancel').onclick = closeModal;
      m.querySelector('#f3r-send').onclick = () => {
        if (Object.keys(answers).length < list.length) { UI.toast(t('f360.rateAll')); return; }
        resp.items = Object.assign({}, answers);         /* jednotlivé odpovědi na výroky */
        resp.ratings = deriveFromItems(answers, list);   /* odvozený rating per oblast - agregace beze změny */
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
          const w = v => v && v !== '-' ? ReviewLogic.scaleWord(v) : '-';
          return `<tr><td>${esc(k.label)}</td><td>${esc(w(selfOf(k.key)))}</td>
            <td>${a ? `<b>${esc(w(a.label))}</b>` : '-'}${diff ? ` <span class="badge b-amber" title="${esc(t('f360.diffHint'))}">≠</span>` : ''}</td>
            <td>${esc(w(mgrOf(k.key)))}</td></tr>`;
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
