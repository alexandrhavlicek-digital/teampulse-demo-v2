/* TeamPulse demo v2 - Rozvoj a vzdělávání (koncept docs/koncept_rozvoj.md, 2026-08-11)
   -------------------------------------------------------------------------
   Rozvojový plán = třetí výstup hodnocení vedle skóre a cílů.
   Klíčová rozhodnutí (2026-08-11):
   - katalog spravuje HR ručně (vrstva 1 LearningProvider); provider 'edunio'
     je poctivé "připraveno na" - jen označení + proklik, žádná fake integrace,
   - zájem o skill jde projevit i bez kurzu - neuspokojená poptávka je HR report,
   - manažer rozhoduje o každé položce (Schvaluji / K rozhovoru / Zamítám),
     stejná disciplína jako u cílů; rozpory blokují finalizaci v2,
   - Můj rozvoj bydlí na Přehledu; HR vidí zamítnuté zájmy jen agregovaně.
   Materializace při v3 (vzor materializeNewGoals) → kolekce devPlans. */
(function () {
  const { esc, avatar, fmtDate, modal, closeModal, toast } = UI;

  /* ================= seed data ================= */
  const SOFT = [
    { key: 'comm', label: 'Komunikace', compKeys: ['coop', 'customer'] },
    { key: 'present', label: 'Prezentační dovednosti', compKeys: ['coop', 'results'] },
    { key: 'timemgmt', label: 'Time management', compKeys: ['selfmgmt'] },
    { key: 'feedback', label: 'Zpětná vazba', compKeys: ['coop', 'leadership'] },
    { key: 'leader', label: 'Leadership', compKeys: ['leadership'] },
    { key: 'conflict', label: 'Řešení konfliktů', compKeys: ['coop', 'leadership'] },
    { key: 'negotiate', label: 'Vyjednávání', compKeys: ['customer', 'results'] },
    { key: 'mentoring', label: 'Mentoring a koučink', compKeys: ['leadership', 'selfmgmt'] },
  ];
  const HARD = {
    travel: [
      { key: 'revenue', label: 'Revenue management', compKeys: ['analysis', 'results'] },
      { key: 'gds', label: 'Rezervační systémy (GDS)', compKeys: ['expertise'] },
      { key: 'lang', label: 'Jazyky (AJ/NJ)', compKeys: ['customer', 'expertise'] },
      { key: 'onlinemkt', label: 'Online marketing', compKeys: ['analysis', 'results'] },
      { key: 'data', label: 'Datová analýza', compKeys: ['analysis'] },
      { key: 'excel', label: 'Excel pokročilý', compKeys: ['analysis', 'expertise'] },
    ],
    it: [
      { key: 'cloud', label: 'Cloud (Azure/AWS)', compKeys: ['expertise'] },
      { key: 'security', label: 'Kybernetická bezpečnost', compKeys: ['expertise'] },
      { key: 'data', label: 'Datová analýza', compKeys: ['analysis'] },
      { key: 'projmgmt', label: 'Projektové řízení', compKeys: ['results', 'selfmgmt'] },
      { key: 'ai', label: 'AI nástroje v praxi', compKeys: ['analysis', 'expertise'] },
      { key: 'testing', label: 'Testování a kvalita', compKeys: ['expertise', 'results'] },
    ],
    auto: [
      { key: 'lean', label: 'Lean výroba', compKeys: ['results', 'expertise'] },
      { key: 'quality', label: 'Kvalita (IATF)', compKeys: ['expertise'] },
      { key: 'automation', label: 'Automatizace', compKeys: ['expertise', 'analysis'] },
      { key: 'logistics', label: 'Logistika', compKeys: ['results'] },
      { key: 'safety', label: 'Bezpečnost práce', compKeys: ['expertise'] },
      { key: 'excel', label: 'Excel pokročilý', compKeys: ['analysis', 'expertise'] },
    ],
  };
  const EDUNIO_URL = 'https://www.edunio.com/katalog-vzdelavani';
  /* katalog: [titul, kind, provider, skillKeys, hodin] - skillKeys se přeloží na id při seedu */
  const CATALOG = {
    common: [
      ['Prezentační dovednosti I', 'course', 'internal', ['present', 'comm'], 8],
      ['Time management a priority', 'elearning', 'edunio', ['timemgmt'], 3],
      ['Zpětná vazba, která funguje', 'course', 'internal', ['feedback', 'comm'], 6],
      ['Leadership základy', 'course', 'external', ['leader', 'mentoring'], 16],
      ['Vyjednávání pro praxi', 'course', 'external', ['negotiate'], 8],
      ['Řešení konfliktů na pracovišti', 'elearning', 'edunio', ['conflict', 'comm'], 2],
      ['Mentoring v týmu', 'mentoring', 'internal', ['mentoring', 'leader'], 10],
    ],
    travel: [
      ['Revenue management v cestovním ruchu', 'course', 'external', ['revenue', 'data'], 16],
      ['Amadeus - pokročilá rezervace', 'course', 'external', ['gds'], 12],
      ['Angličtina pro cestovní ruch', 'elearning', 'edunio', ['lang'], 20],
      ['Excel pro analýzu prodeje', 'elearning', 'edunio', ['excel', 'data'], 6],
      ['Konference Travel Trends', 'conference', 'external', ['onlinemkt', 'revenue'], 8],
    ],
    it: [
      ['Azure Fundamentals (AZ-900)', 'elearning', 'edunio', ['cloud'], 12],
      ['Security awareness pro vývojáře', 'elearning', 'edunio', ['security'], 4],
      ['Datová analýza v Pythonu', 'course', 'external', ['data'], 24],
      ['Agilní projektové řízení', 'course', 'internal', ['projmgmt'], 8],
      ['AI nástroje pro každodenní práci', 'course', 'internal', ['ai'], 6],
    ],
    auto: [
      ['Lean Six Sigma - Yellow Belt', 'course', 'external', ['lean', 'quality'], 24],
      ['Interní auditor IATF 16949', 'course', 'external', ['quality'], 16],
      ['Základy průmyslové automatizace', 'course', 'internal', ['automation'], 12],
      ['Logistika a plánování výroby', 'elearning', 'edunio', ['logistics'], 6],
      ['Excel pro mistry a plánovače', 'elearning', 'edunio', ['excel'], 6],
    ],
  };

  /* ================= logika ================= */
  const skills = () => Store.list('skillTags');
  const catalog = () => Store.list('devCatalog').filter(c => c.active !== false);
  const skillById = id => Store.get('skillTags', id);
  const skillLabels = ids => (ids || []).map(id => (skillById(id) || {}).label).filter(Boolean);
  const courseById = id => Store.get('devCatalog', id);

  /* migrace: staré f.trainings (pole stringů) → f.devItems */
  function ensureItems(f) {
    if (!f.devItems) {
      f.devItems = (f.trainings || []).map(s => ({
        id: uid(), kind: 'custom', catalogId: null, title: s, skillIds: [], note: '',
        source: 'self', decision: null,
      }));
    }
    return f.devItems;
  }

  function addItem(f, item) {
    ensureItems(f).push(Object.assign({
      id: uid(), kind: 'custom', catalogId: null, title: '', skillIds: [], note: '',
      source: 'self', decision: null,
    }, item));
  }

  /* doporučení bez AI: kompetence hodnocené „Potřebuje rozvoj" a hůř → kurzy se shodným skill tagem */
  const LOW = ['NR', 'NU'];
  function lowCompKeys(f) {
    const fw = (Store.getCompany() || {}).competencies;
    const low = [];
    if (fw && f.compRatings) fw.forEach(c => { if (LOW.includes(f.compRatings.mgr[c.key])) low.push(c.key); });
    else ['teamwork', 'growth', 'quality'].forEach(a => {
      if (LOW.includes((f.mgr.areas || {})[a])) Generator.COMP_LIB.filter(c => c.areaKey === a).forEach(c => low.push(c.key));
    });
    return low;
  }
  function recommendFor(f) {
    const low = lowCompKeys(f);
    if (!low.length) return [];
    const chosen = new Set(ensureItems(f).map(d => d.catalogId).filter(Boolean));
    const skillIdsLow = new Set(skills().filter(s => (s.compKeys || []).some(k => low.includes(k))).map(s => s.id));
    return catalog().filter(c => !chosen.has(c.id) && (c.skillIds || []).some(id => skillIdsLow.has(id))).slice(0, 4);
  }

  /* materializace při v3 - jen schválené položky (vzor materializeNewGoals) */
  function materialize(r) {
    const items = ensureItems(r.form).filter(d => d.decision === 'approved');
    if (!items.length) return null;
    return Store.insert('devPlans', {
      id: uid(), personId: r.subjectId, period: r.period, reviewId: r.id, createdAt: Date.now(),
      items: items.map(d => Object.assign({}, d, { status: 'planned', statusAt: Date.now() })),
    });
  }

  function planOf(personId) {
    const list = Store.list('devPlans').filter(p => p.personId === personId);
    return list.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  }
  function plansOf(personIds) {
    const set = new Set(personIds);
    return Store.list('devPlans').filter(p => set.has(p.personId));
  }

  /* podklady: hotové/běžící aktivity z posledního plánu (uzavírá kruh rozvoje) */
  function evidenceHtml(personId) {
    const rel = Store.list('devPlans').filter(p => p.personId === personId)
      .flatMap(p => p.items).filter(i => ['done', 'in_progress'].includes(i.status));
    if (!rel.length) return '';
    return rel.map(i => `<p style="font-size:.88rem;margin-bottom:4px">${icon('sprout', 13)} <b>${esc(i.title)}</b>
      <span class="badge ${i.status === 'done' ? 'b-green' : 'b-blue'}">${esc(t('dev.status.' + i.status))}</span></p>`).join('');
  }

  /* HR report poptávky - zamítnuté zájmy POUZE agregovaně (rozhodnutí 2026-08-11) */
  function demand() {
    const byCourse = {}, bySkill = {}; let approved = 0, declined = 0;
    Store.list('reviews').forEach(r => {
      (r.form.devItems || []).forEach(d => {
        if (d.decision === 'approved') approved++;
        if (d.decision === 'declined') declined++;
        const key = d.catalogId ? 'c:' + d.catalogId : 't:' + d.title;
        byCourse[key] = byCourse[key] || { title: d.catalogId ? (courseById(d.catalogId) || { title: d.title }).title : d.title, n: 0, custom: !d.catalogId };
        byCourse[key].n++;
        (d.skillIds || []).forEach(id => {
          const s = skillById(id); if (!s) return;
          bySkill[id] = bySkill[id] || { label: s.label, type: s.type, n: 0 };
          bySkill[id].n++;
        });
      });
    });
    const plans = Store.list('devPlans');
    const allItems = plans.flatMap(p => p.items);
    const people = Store.list('people');
    const withPlan = new Set(plans.filter(p => p.items.some(i => i.status !== 'dropped')).map(p => p.personId));
    return {
      topCourses: Object.values(byCourse).sort((a, b) => b.n - a.n).slice(0, 8),
      topSkills: Object.values(bySkill).sort((a, b) => b.n - a.n).slice(0, 8),
      approvalPct: (approved + declined) ? Math.round(approved / (approved + declined) * 100) : null,
      coveragePct: people.length ? Math.round(withPlan.size / people.length * 100) : 0,
      donePct: allItems.length ? Math.round(allItems.filter(i => i.status === 'done').length / allItems.length * 100) : null,
      itemsTotal: allItems.length,
    };
  }

  /* ================= seed ================= */
  function seedSkillsCatalog(industryKey) {
    const sk = [];
    SOFT.forEach(s => sk.push({ id: uid(), label: s.label, type: 'soft', compKeys: s.compKeys, seedKey: s.key }));
    (HARD[industryKey] || []).forEach(s => sk.push({ id: uid(), label: s.label, type: 'hard', compKeys: s.compKeys, seedKey: s.key }));
    Store.replaceAll('skillTags', sk);
    const byKey = {}; sk.forEach(s => { byKey[s.seedKey] = s.id; });
    const rows = (CATALOG.common.concat(CATALOG[industryKey] || []));
    Store.replaceAll('devCatalog', rows.map(([title, kind, provider, keys, durationH]) => ({
      id: uid(), title, desc: '', kind, provider,
      url: provider === 'edunio' ? EDUNIO_URL : '',
      skillIds: keys.map(k => byKey[k]).filter(Boolean), durationH, deptKeys: null, active: true,
    })));
  }

  function seedDemo(industryKey) {
    seedSkillsCatalog(industryKey);
    const cat = catalog(), sk = skills();
    if (!cat.length) return;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const afterSelf = ['self_done', 'manager_in_progress', 'manager_done', 'conversation_scheduled', 'awaiting_employee_confirmation', 'confirmed'];
    const decided = ['manager_done', 'conversation_scheduled', 'awaiting_employee_confirmation', 'confirmed'];
    let discussSeeded = false;
    Store.list('reviews').forEach(r => {
      const f = r.form; ensureItems(f);
      const isPast = r.status === 'closed_by_hr';
      if (!isPast && !afterSelf.includes(r.status)) { Store.update('reviews', r.id, { form: f }); return; }
      if (f.devItems.length) return; /* neseedovat dvakrát */
      const c1 = pick(cat), c2 = pick(cat);
      f.devItems.push({ id: uid(), kind: 'course', catalogId: c1.id, title: c1.title, skillIds: c1.skillIds, note: '', source: 'self', decision: null });
      if (c2.id !== c1.id && Math.random() < 0.6)
        f.devItems.push({ id: uid(), kind: 'course', catalogId: c2.id, title: c2.title, skillIds: c2.skillIds, note: '', source: 'self', decision: null });
      if (Math.random() < 0.45) {
        const s = pick(sk);
        f.devItems.push({ id: uid(), kind: 'skill', catalogId: null, title: s.label, skillIds: [s.id], note: '', source: 'self', decision: null });
      }
      if (isPast || decided.includes(r.status)) {
        f.devItems.forEach(d => { d.decision = 'approved'; });
        if (Math.random() < 0.25) {
          const sk1 = f.devItems.find(d => d.kind === 'skill');
          if (sk1 && f.devItems.length > 1) sk1.decision = 'declined';
        }
        if (!isPast && !discussSeeded && r.status === 'manager_done' && f.devItems.length > 1) {
          f.devItems[f.devItems.length - 1].decision = 'discuss'; discussSeeded = true;
        }
        if (Math.random() < 0.4) {
          const cm = pick(cat);
          f.devItems.push({ id: uid(), kind: 'course', catalogId: cm.id, title: cm.title, skillIds: cm.skillIds, note: '', source: 'manager', decision: 'approved' });
        }
      }
      Store.update('reviews', r.id, { form: f });
      /* plány: minulé uzavřené hodnocení → plán s pokrokem (podklady pro příští cyklus) */
      if (isPast || r.status === 'confirmed') {
        const statuses = isPast ? ['done', 'done', 'in_progress'] : ['planned', 'in_progress', 'planned'];
        Store.insert('devPlans', {
          id: uid(), personId: r.subjectId, period: r.period, reviewId: r.id,
          createdAt: isPast ? Date.now() - 200 * 86400000 : Date.now() - 5 * 86400000,
          items: f.devItems.filter(d => d.decision === 'approved').map((d, i) =>
            Object.assign({}, d, { status: statuses[i % statuses.length], statusAt: Date.now() - 30 * 86400000 })),
        });
      }
    });
  }

  /* backfill pro DB uložené před rozvojovým modulem (volá boot v app.js) */
  function ensureSeed() {
    const co = Store.getCompany();
    if (!co || !co.industry || !Store.list('people').length) return false;
    if (skills().length || Store.list('devCatalog').length) return false;
    seedSkillsCatalog(co.industry);
    return true;
  }

  /* ================= UI ================= */
  const provBadge = p => `<span class="badge ${p === 'edunio' ? 'b-blue' : ''}">${esc(t('dev.provider.' + p))}</span>`;
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function itemRow(d, opts) {
    opts = opts || {};
    const c = d.catalogId ? courseById(d.catalogId) : null;
    return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0;border-bottom:1px dashed var(--hairline)">
      ${icon(d.kind === 'skill' ? 'spark' : d.kind === 'custom' ? 'bulb' : 'doc', 14)}
      <b>${esc(d.title)}</b>
      ${d.kind === 'skill' ? `<span class="badge b-amber">${esc(t('dev.interestOnly'))}</span>` : ''}
      ${c ? provBadge(c.provider) : ''}
      ${skillLabels(d.skillIds).slice(0, 3).map(l => `<span class="badge">${esc(l)}</span>`).join('')}
      ${d.source === 'manager' ? `<span class="badge b-blue">${esc(t('dev.byMgr'))}</span>` : ''}
      ${d.note ? `<small style="color:var(--text-muted)">${esc(d.note)}</small>` : ''}
      <span style="flex:1"></span>
      ${opts.decisions ? `
        <div style="display:flex;gap:5px">
          <button type="button" class="btn btn-sm ${d.decision === 'approved' ? 'btn-primary' : ''}" data-ddec="approved:${d.id}">${icon('check', 12)} ${esc(t('dev.approve'))}</button>
          <button type="button" class="btn btn-sm" ${d.decision === 'discuss' ? 'style="border-color:var(--warn);color:var(--warn)"' : ''} data-ddec="discuss:${d.id}">${icon('checkin', 12)} ${esc(t('rev.goalDiscuss'))}</button>
          <button type="button" class="btn btn-sm" ${d.decision === 'declined' ? 'style="border-color:var(--danger);color:var(--danger)"' : ''} data-ddec="declined:${d.id}">${esc(t('dev.decline'))}</button>
        </div>` : ''}
      ${opts.badges ? `${d.decision === 'approved' ? `<span class="badge b-green">${icon('check', 11)} ${esc(t('dev.approve'))}</span>`
        : d.decision === 'discuss' ? `<span class="badge b-amber">${esc(t('rev.goalDiscuss'))}</span>`
        : d.decision === 'declined' ? `<span class="badge b-red">${esc(t('dev.decline'))}</span>` : ''}` : ''}
      ${opts.removable ? `<button type="button" class="btn btn-sm" data-ddel="${d.id}" title="${esc(t('common.cancel'))}">✕</button>` : ''}
    </div>`;
  }

  /* --- krok 5 sebehodnocení: picker + skill zájmy + vlastní přání --- */
  function selfBlockHtml(f) {
    ensureItems(f);
    const mine = f.devItems.filter(d => d.source === 'self');
    const chosenSkills = new Set(mine.filter(d => d.kind === 'skill').flatMap(d => d.skillIds));
    const skillBtns = type => skills().filter(s => s.type === type).map(s =>
      `<button type="button" class="badge ${chosenSkills.has(s.id) ? 'b-blue' : ''}" data-dskill="${s.id}" style="margin:3px;cursor:pointer">${esc(s.label)}</button>`).join('') || `<p class="page-sub">-</p>`;
    return `<div id="dev-self">
      <div class="field"><label>${esc(t('dev.pick'))}</label>
        <div class="hint" style="margin-bottom:6px">${esc(t('dev.pickHint'))}</div>
        <input class="input" id="dev-search" placeholder="${esc(t('dev.searchCourse'))}" autocomplete="off">
        <div class="f3-list" id="dev-list" style="max-height:220px"></div></div>
      <div class="field"><label>${esc(t('dev.interest'))}</label>
        <div class="hint" style="margin-bottom:6px">${esc(t('dev.interestHint'))}</div>
        <div style="margin-bottom:4px"><small style="font-weight:650;color:var(--text-muted)">${esc(t('dev.soft'))}</small><br>${skillBtns('soft')}</div>
        <div><small style="font-weight:650;color:var(--text-muted)">${esc(t('dev.hard'))}</small><br>${skillBtns('hard')}</div></div>
      <div class="field"><label>${esc(t('dev.custom'))}</label>
        <div style="display:flex;gap:8px">
          <input class="input" id="dev-custom" placeholder="${esc(t('dev.customPh'))}" style="flex:1">
          <button type="button" class="btn btn-sm" id="dev-custom-add">${icon('plus', 13)} ${esc(t('common.add'))}</button>
        </div></div>
      ${mine.length ? `<div class="field"><label>${esc(t('dev.chosen'))} <span class="badge b-blue">${mine.length}×</span></label>
        ${mine.map(d => itemRow(d, { removable: true })).join('')}</div>` : ''}
    </div>`;
  }

  function bindSelfBlock(root, r, rerender) {
    const f = r.form;
    const save = () => Store.update('reviews', r.id, { form: f });
    const box = root.querySelector('#dev-self'); if (!box) return;
    const input = box.querySelector('#dev-search'), list = box.querySelector('#dev-list');
    const chosen = () => new Set(ensureItems(f).map(d => d.catalogId).filter(Boolean));
    const drawList = () => {
      const q = norm(input.value);
      const rows = catalog().filter(c => !chosen().has(c.id)
        && (!q || norm(c.title + ' ' + skillLabels(c.skillIds).join(' ')).includes(q))).slice(0, 30);
      list.innerHTML = rows.map(c => `<div class="f3-row" data-dpick="${c.id}">
        ${icon('doc', 14)} <b>${esc(c.title)}</b> ${provBadge(c.provider)}
        <span class="badge">${esc(t('dev.kind.' + c.kind))}</span>
        ${c.durationH ? `<small style="color:var(--text-muted)">${c.durationH} h</small>` : ''}
      </div>`).join('') || `<div class="f3-row" style="cursor:default;color:var(--text-muted)">${esc(t('dev.noMatch'))}</div>`;
      list.querySelectorAll('[data-dpick]').forEach(rw => rw.onclick = () => {
        const c = courseById(rw.dataset.dpick); if (!c) return;
        addItem(f, { kind: 'course', catalogId: c.id, title: c.title, skillIds: c.skillIds, source: 'self' });
        save(); rerender();
      });
    };
    drawList();
    input.addEventListener('input', drawList);
    box.querySelectorAll('[data-dskill]').forEach(b => b.onclick = () => {
      const id = b.dataset.dskill;
      const existing = ensureItems(f).find(d => d.kind === 'skill' && d.source === 'self' && d.skillIds.includes(id));
      if (existing) f.devItems = f.devItems.filter(d => d.id !== existing.id);
      else { const s = skillById(id); addItem(f, { kind: 'skill', title: s.label, skillIds: [id], source: 'self' }); }
      save(); rerender();
    });
    const custom = box.querySelector('#dev-custom');
    box.querySelector('#dev-custom-add').onclick = () => {
      const v = (custom.value || '').trim(); if (!v) return;
      addItem(f, { kind: 'custom', title: v, source: 'self' });
      save(); rerender();
    };
    box.querySelectorAll('[data-ddel]').forEach(b => b.onclick = () => {
      f.devItems = f.devItems.filter(d => d.id !== b.dataset.ddel);
      save(); rerender();
    });
  }

  /* --- manažerský blok v sekci Hodnocení --- */
  function mgrBlockHtml(f) {
    ensureItems(f);
    const reco = recommendFor(f);
    return `<div class="field" id="dev-mgr" style="margin-top:4px"><label>${icon('sprout', 15)} ${esc(t('dev.mgrTitle'))}</label>
      <div class="hint" style="margin-bottom:6px">${esc(t('dev.mgrHint'))}</div>
      ${f.devItems.length ? f.devItems.map(d => itemRow(d, { decisions: true })).join('') : `<p class="page-sub">${esc(t('dev.none'))}</p>`}
      ${reco.length ? `<div style="margin-top:10px"><small style="font-weight:650;color:var(--text-muted)">${esc(t('dev.reco'))}</small>
        <div class="hint" style="margin-bottom:4px">${esc(t('dev.recoHint'))}</div>
        ${reco.map(c => `<button type="button" class="badge" data-dreco="${c.id}" style="margin:3px;cursor:pointer">${icon('plus', 11)} ${esc(c.title)}</button>`).join('')}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="input" id="dev-mgr-add" placeholder="${esc(t('dev.addOwnPh'))}" style="flex:1">
        <button type="button" class="btn btn-sm" id="dev-mgr-add-btn">${icon('plus', 13)} ${esc(t('dev.addOwn'))}</button>
      </div></div>`;
  }

  function bindMgrBlock(root, r, rerender) {
    const f = r.form;
    const save = () => Store.update('reviews', r.id, { form: f });
    const box = root.querySelector('#dev-mgr'); if (!box) return;
    box.querySelectorAll('[data-ddec]').forEach(b => b.onclick = () => {
      const [dec, id] = b.dataset.ddec.split(':');
      const d = ensureItems(f).find(x => x.id === id); if (!d) return;
      d.decision = d.decision === dec ? null : dec;
      save(); rerender();
    });
    box.querySelectorAll('[data-dreco]').forEach(b => b.onclick = () => {
      const c = courseById(b.dataset.dreco); if (!c) return;
      addItem(f, { kind: 'course', catalogId: c.id, title: c.title, skillIds: c.skillIds, source: 'manager', decision: 'approved' });
      save(); rerender();
    });
    const inp = box.querySelector('#dev-mgr-add');
    box.querySelector('#dev-mgr-add-btn').onclick = () => {
      const v = (inp.value || '').trim(); if (!v) return;
      addItem(f, { kind: 'custom', title: v, source: 'manager', decision: 'approved' });
      save(); rerender();
    };
  }

  /* --- read-only výpis (finální verze, potvrzení, HR náhled) --- */
  function readHtml(f) {
    const items = f.devItems || [];
    if (!items.length) return '';
    return `<div class="card"><h2>${icon('sprout', 18)}${esc(t('dev.mgrTitle'))}</h2>
      ${items.map(d => itemRow(d, { badges: true })).join('')}</div>`;
  }

  /* --- Přehled: karta Můj rozvoj (rozhodnutí: bydlí na Přehledu, ne v menu) --- */
  const NEXT_STATUS = { planned: 'in_progress', in_progress: 'done', done: 'planned' };
  function homeCardHtml(me) {
    if (!me) return '';
    const plan = planOf(me.id);
    if (!plan || !plan.items.length) return '';
    const done = plan.items.filter(i => i.status === 'done').length;
    return `<div class="card" id="dev-home">
      <h2>${icon('sprout', 18)}${esc(t('dev.myPlan'))}
        <span class="badge b-blue" style="margin-left:8px">${done}/${plan.items.length}</span></h2>
      <p class="page-sub" style="margin-bottom:8px">${esc(t('dev.myPlanHint'))}</p>
      ${plan.items.map(i => {
        const c = i.catalogId ? courseById(i.catalogId) : null;
        return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0;border-bottom:1px dashed var(--hairline)">
          ${icon(i.kind === 'skill' ? 'spark' : 'doc', 14)} <b>${esc(i.title)}</b>
          ${c ? provBadge(c.provider) : ''}
          ${c && c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener" class="badge">${esc(t('dev.open'))} ↗</a>` : ''}
          <span style="flex:1"></span>
          <button type="button" class="badge ${i.status === 'done' ? 'b-green' : i.status === 'in_progress' ? 'b-blue' : ''}"
            data-dstatus="${plan.id}:${i.id}" style="cursor:pointer" title="${esc(t('dev.advance'))}">${esc(t('dev.status.' + i.status))}</button>
        </div>`;
      }).join('')}
    </div>`;
  }
  function bindHomeCard(root, rerender) {
    root.querySelectorAll('[data-dstatus]').forEach(b => b.onclick = () => {
      const [planId, itemId] = b.dataset.dstatus.split(':');
      const plan = Store.get('devPlans', planId); if (!plan) return;
      const it = plan.items.find(x => x.id === itemId); if (!it) return;
      it.status = NEXT_STATUS[it.status] || 'planned'; it.statusAt = Date.now();
      Store.update('devPlans', planId, { items: plan.items });
      rerender();
    });
  }

  /* --- Můj tým: souhrn rozvoje týmu --- */
  function teamCardHtml(team) {
    if (!team || !team.length) return '';
    const rows = team.map(p => {
      const plan = planOf(p.id);
      const items = plan ? plan.items : [];
      const done = items.filter(i => i.status === 'done').length;
      const run = items.filter(i => i.status === 'in_progress').length;
      return { p, items, done, run };
    });
    const noPlan = rows.filter(r => !r.items.length);
    return `<div class="card"><h2>${icon('sprout', 18)}${esc(t('dev.teamTitle'))}
        ${noPlan.length ? `<span class="badge b-amber" style="margin-left:8px">${noPlan.length}× ${esc(t('dev.noPlan'))}</span>` : ''}</h2>
      ${rows.filter(r => r.items.length).map(r => `
        <div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--hairline);flex-wrap:wrap">
          ${avatar(r.p, 26)} <b>${esc(r.p.name)}</b>
          <span class="badge">${r.items.length}×</span>
          ${r.run ? `<span class="badge b-blue">${r.run} ${esc(t('dev.status.in_progress'))}</span>` : ''}
          ${r.done ? `<span class="badge b-green">${r.done} ${esc(t('dev.status.done'))}</span>` : ''}
          <span style="flex:1"></span>
          <small style="color:var(--text-muted)">${r.items.slice(0, 2).map(i => esc(i.title)).join(' · ')}${r.items.length > 2 ? ' …' : ''}</small>
        </div>`).join('') || `<p class="page-sub">-</p>`}
      ${noPlan.length ? `<p style="font-size:.85rem;color:var(--text-muted);margin-top:8px">${esc(t('dev.noPlanList'))}: ${noPlan.map(r => esc(r.p.name)).join(', ')}</p>` : ''}
    </div>`;
  }

  /* --- HR centrum: katalog + dovednosti + report poptávky --- */
  function hrCardHtml() {
    const cat = Store.list('devCatalog');
    const d = demand();
    return `<div class="card" id="dev-hr"><h2>${icon('sprout', 18)}${esc(t('dev.hrTitle'))}</h2>
      <p class="page-sub" style="margin-bottom:10px">${esc(t('dev.hrHint'))}</p>
      <div class="grid cols-3" style="margin-bottom:12px">
        <div class="card"><div class="kpi-num">${d.coveragePct} %</div><div class="kpi-label">${esc(t('dev.coverage'))}</div></div>
        <div class="card"><div class="kpi-num">${d.approvalPct != null ? d.approvalPct + ' %' : '-'}</div><div class="kpi-label">${esc(t('dev.approvalRate'))}</div></div>
        <div class="card"><div class="kpi-num">${d.donePct != null ? d.donePct + ' %' : '-'}</div><div class="kpi-label">${esc(t('dev.completion'))} · ${d.itemsTotal}×</div></div>
      </div>
      <div class="grid cols-2">
        <div><h2 style="font-size:.95rem">${esc(t('dev.topCourses'))}</h2>
          ${d.topCourses.map(x => `<div class="brow" style="display:flex;gap:8px;align-items:center;padding:3px 0">
            <span style="flex:1">${esc(x.title)}${x.custom ? ` <span class="badge b-amber">${esc(t('dev.customBadge'))}</span>` : ''}</span><b>${x.n}×</b></div>`).join('') || `<p class="page-sub">-</p>`}</div>
        <div><h2 style="font-size:.95rem">${esc(t('dev.topSkills'))}</h2>
          ${d.topSkills.map(x => `<div class="brow" style="display:flex;gap:8px;align-items:center;padding:3px 0">
            <span style="flex:1">${esc(x.label)} <span class="badge">${esc(t('dev.' + x.type))}</span></span><b>${x.n}×</b></div>`).join('') || `<p class="page-sub">-</p>`}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin:14px 0 6px">
        <h2 style="margin:0;font-size:.95rem">${esc(t('dev.catalog'))} <span class="badge b-blue">${cat.length}</span></h2>
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="dev-skill-add">${icon('plus', 13)} ${esc(t('dev.newSkill'))}</button>
        <button class="btn btn-primary btn-sm" id="dev-course-add">${icon('plus', 13)} ${esc(t('dev.newCourse'))}</button>
      </div>
      <table class="table">
        <tr><th>${esc(t('goals.name'))}</th><th>${esc(t('dev.kind'))}</th><th>${esc(t('dev.provider'))}</th><th>${esc(t('dev.skills'))}</th><th></th></tr>
        ${cat.map(c => `<tr style="${c.active === false ? 'opacity:.5' : ''}">
          <td><b>${esc(c.title)}</b>${c.durationH ? ` <small style="color:var(--text-muted)">${c.durationH} h</small>` : ''}</td>
          <td>${esc(t('dev.kind.' + c.kind))}</td>
          <td>${provBadge(c.provider)}</td>
          <td>${skillLabels(c.skillIds).slice(0, 3).map(l => `<span class="badge">${esc(l)}</span>`).join(' ')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm" data-dc-edit="${c.id}">${icon('gear', 12)}</button>
            <button class="btn btn-sm" data-dc-toggle="${c.id}" title="${esc(t('dev.active'))}">${c.active === false ? icon('lock', 12) : icon('check', 12)}</button>
            <button class="btn btn-sm btn-danger" data-dc-del="${c.id}">${icon('trash', 12)}</button>
          </td></tr>`).join('')}
      </table>
    </div>`;
  }

  function courseModal(existing, rerender) {
    const c = existing || { title: '', kind: 'course', provider: 'internal', url: '', durationH: 0, skillIds: [], active: true };
    const kinds = ['course', 'elearning', 'mentoring', 'book', 'conference', 'other'];
    const provs = ['internal', 'edunio', 'external'];
    modal(`<h3>${icon('sprout', 18)}${esc(t(existing ? 'common.edit' : 'dev.newCourse'))}</h3>
      <div class="field"><label>${esc(t('goals.name'))}</label><input class="input" id="dc-title" value="${esc(c.title)}"></div>
      <div class="grid cols-2">
        <div class="field"><label>${esc(t('dev.kind'))}</label>
          <select class="input" id="dc-kind">${kinds.map(k => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${esc(t('dev.kind.' + k))}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('dev.provider'))}</label>
          <select class="input" id="dc-prov">${provs.map(p => `<option value="${p}" ${c.provider === p ? 'selected' : ''}>${esc(t('dev.provider.' + p))}</option>`).join('')}</select></div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label>URL</label><input class="input" id="dc-url" value="${esc(c.url || '')}" placeholder="https://…"></div>
        <div class="field"><label>${esc(t('dev.duration'))}</label><input class="input" type="number" min="0" id="dc-dur" value="${c.durationH || 0}"></div>
      </div>
      <div class="field"><label>${esc(t('dev.skills'))}</label>
        <div>${skills().map(s => `<button type="button" class="badge ${c.skillIds.includes(s.id) ? 'b-blue' : ''}" data-dcs="${s.id}" style="margin:3px;cursor:pointer">${esc(s.label)}</button>`).join('')}</div></div>
      <div class="wizard-foot"><button class="btn" id="dc-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="dc-save">${esc(t('common.save'))}</button></div>`, m => {
      const sel = new Set(c.skillIds);
      m.querySelectorAll('[data-dcs]').forEach(b => b.onclick = () => {
        const id = b.dataset.dcs;
        if (sel.has(id)) { sel.delete(id); b.classList.remove('b-blue'); } else { sel.add(id); b.classList.add('b-blue'); }
      });
      m.querySelector('#dc-cancel').onclick = closeModal;
      m.querySelector('#dc-save').onclick = () => {
        const title = m.querySelector('#dc-title').value.trim(); if (!title) return;
        const patch = {
          title, kind: m.querySelector('#dc-kind').value, provider: m.querySelector('#dc-prov').value,
          url: m.querySelector('#dc-url').value.trim(), durationH: +m.querySelector('#dc-dur').value || 0,
          skillIds: [...sel],
        };
        if (existing) Store.update('devCatalog', existing.id, patch);
        else Store.insert('devCatalog', Object.assign({ id: uid(), desc: '', deptKeys: null, active: true }, patch));
        closeModal(); toast(t('common.saved')); rerender();
      };
    });
  }

  function skillModal(rerender) {
    modal(`<h3>${icon('spark', 18)}${esc(t('dev.newSkill'))}</h3>
      <div class="field"><label>${esc(t('goals.name'))}</label><input class="input" id="ds-label"></div>
      <div class="field"><label>${esc(t('dev.kind'))}</label>
        <select class="input" id="ds-type"><option value="soft">${esc(t('dev.soft'))}</option><option value="hard">${esc(t('dev.hard'))}</option></select></div>
      <div class="field"><label>${esc(t('comp.title'))}</label>
        <div class="hint" style="margin-bottom:4px">${esc(t('dev.compHint'))}</div>
        <div>${Generator.COMP_LIB.map(cp => `<button type="button" class="badge" data-dsc="${cp.key}" style="margin:3px;cursor:pointer">${esc(cp.title)}</button>`).join('')}</div></div>
      <div class="wizard-foot"><button class="btn" id="ds-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="ds-save">${esc(t('common.save'))}</button></div>`, m => {
      const sel = new Set();
      m.querySelectorAll('[data-dsc]').forEach(b => b.onclick = () => {
        const k = b.dataset.dsc;
        if (sel.has(k)) { sel.delete(k); b.classList.remove('b-blue'); } else { sel.add(k); b.classList.add('b-blue'); }
      });
      m.querySelector('#ds-cancel').onclick = closeModal;
      m.querySelector('#ds-save').onclick = () => {
        const label = m.querySelector('#ds-label').value.trim(); if (!label) return;
        Store.insert('skillTags', { id: uid(), label, type: m.querySelector('#ds-type').value, compKeys: [...sel] });
        closeModal(); toast(t('common.saved')); rerender();
      };
    });
  }

  function bindHrCard(root, rerender) {
    const box = root.querySelector('#dev-hr'); if (!box) return;
    const q = s => box.querySelector(s);
    if (q('#dev-course-add')) q('#dev-course-add').onclick = () => courseModal(null, rerender);
    if (q('#dev-skill-add')) q('#dev-skill-add').onclick = () => skillModal(rerender);
    box.querySelectorAll('[data-dc-edit]').forEach(b => b.onclick = () => courseModal(Store.get('devCatalog', b.dataset.dcEdit), rerender));
    box.querySelectorAll('[data-dc-toggle]').forEach(b => b.onclick = () => {
      const c = Store.get('devCatalog', b.dataset.dcToggle); if (!c) return;
      Store.update('devCatalog', c.id, { active: c.active === false }); rerender();
    });
    box.querySelectorAll('[data-dc-del]').forEach(b => b.onclick = () => {
      Store.remove('devCatalog', b.dataset.dcDel); toast(t('common.saved')); rerender();
    });
  }

  window.Dev = { ensureItems, addItem, recommendFor, materialize, planOf, plansOf, demand, evidenceHtml, seedDemo, seedSkillsCatalog, ensureSeed, catalog, skills };
  window.DevViews = { selfBlockHtml, bindSelfBlock, mgrBlockHtml, bindMgrBlock, readHtml, homeCardHtml, bindHomeCard, teamCardHtml, hrCardHtml, bindHrCard };
})();
