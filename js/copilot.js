/* TeamPulse demo v2 - Copilot ("parťák" nad daty v systému)
   ---------------------------------------------------------------
   Simulovaný AI engine - ŽÁDNÉ externí AI (security pivot 2026-06):
   deterministický intent parser (cs/en/de) + slot-filling flows.
   Vše počítá lokálně z demo dat a akce propisuje přes Store,
   takže respektuje roli a práva aktuální persony (viewAs).

   Kolekce: copilotThreads  [{id,ownerKey,title,pinned,createdAt,updatedAt,
                              msgs:[{id,who:'user'|'bot',text?,html?,chips?,at}],state}]
             copilotPrompts  [{id,ownerKey,label,text,at}]        - uložené prompty
             copilotTasks    [{id,ownerKey,text,freq,nextAt,at}]  - naplánované úlohy
   ownerKey = role|personId → historie i práva jsou per persona.

   Budoucnost: stejné rozhraní (Copilot.reply) půjde přepnout na
   skutečný LLM adapter (Azure OpenAI EU) - viz docs/09_copilot.md. */
(function () {
  const { esc, avatar, toast, notify } = UI;
  const DAY = 86400000;
  const AREAS = ['teamwork', 'growth', 'quality'];
  const SCALE = ['TN', 'PO', 'KV', 'NR', 'NU'];
  const KVALS = ['team', 'quality', 'growth', 'client'];
  const MOODS = ['😄', '🙂', '😐', '😟'];
  const MOOD_VAL = { '😄': 4, '🙂': 3, '😐': 2, '😟': 1 };

  /* ================= context & helpers ================= */
  const ppl = () => Store.list('people');
  const byId = id => Store.get('people', id);
  const revs = () => Store.list('reviews');
  const co = () => Store.getCompany();
  function va() {
    if (window.App && App.viewAs) return App.viewAs();
    return Store.getSettings().viewAs || { role: 'hr', personId: null };
  }
  const meP = () => va().personId ? byId(va().personId) : null;
  const ownerKey = () => va().role + '|' + (va().personId || '');
  const enabled = () => Store.getSettings().copilotEnabled !== false;
  const fmt = (k, o) => Object.entries(o || {}).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), t(k));

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const stem = w => norm(w).slice(0, 4);

  /* lidé v dosahu role (pro reporting scope) */
  function teamOf(mgrId) { return ppl().filter(p => p.managerId === mgrId); }
  function scopePeople() {
    const v = va();
    if (v.role === 'hr') return ppl();
    if (v.role === 'manager') return teamOf(v.personId);
    return meP() ? [meP()] : [];
  }

  /* fuzzy match jmen (zvládá české skloňování přes 4-znakové stemy) */
  function matchPeople(text) {
    const tokens = norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    const scored = [];
    ppl().forEach(p => {
      let sc = 0;
      [p.firstName, p.lastName].forEach(nm => {
        if (!nm || nm.length < 3) return;
        const st = stem(nm);
        if (tokens.some(tk => stem(tk) === st && Math.abs(tk.length - norm(nm).length) <= 3)) sc++;
      });
      if (sc) scored.push({ p, sc });
    });
    scored.sort((a, b) => b.sc - a.sc);
    const top = scored.length ? scored[0].sc : 0;
    return scored.filter(x => x.sc === top).map(x => x.p);
  }

  /* ================= threads ================= */
  function threads() {
    return Store.list('copilotThreads').filter(x => x.ownerKey === ownerKey())
      .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  }
  function saveTh(th) {
    th.updatedAt = Date.now();
    Store.update('copilotThreads', th.id, { msgs: th.msgs, state: th.state, title: th.title, pinned: th.pinned, updatedAt: th.updatedAt });
  }
  function newThread() {
    const th = { id: uid(), ownerKey: ownerKey(), title: t('cop.newChat'), pinned: false, createdAt: Date.now(), updatedAt: Date.now(), msgs: [], state: null };
    Store.insert('copilotThreads', th);
    welcome(th);
    saveTh(th);
    return th;
  }
  function bot(th, html, chips) {
    th.msgs.push({ id: uid(), who: 'bot', html, chips: chips || null, at: Date.now() });
  }
  function userMsg(th, text) {
    th.msgs.push({ id: uid(), who: 'user', text, at: Date.now() });
    if (th.title === t('cop.newChat') || !th.title) th.title = text.slice(0, 42);
    saveTh(th);
  }

  /* ================= proaktivní uvítání ================= */
  function recs() {
    const v = va(), p = meP(), out = [];
    const cur = revs().filter(r => r.period === Generator.CURRENT_PERIOD);
    if (p) {
      revs().filter(r => r.subjectId === p.id).forEach(r => {
        if (['pending_self', 'self_in_progress'].includes(r.status))
          out.push({ txt: t('cop.rec.fillSelf'), chips: [
            { label: t('cop.ch.fillSelf'), act: 'ask', val: t('cop.ask.self') },
            { label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }] });
        if (r.status === 'awaiting_employee_confirmation')
          out.push({ txt: t('cop.rec.confirmRev'), chips: [{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }] });
      });
    }
    if (v.role === 'manager' && p) {
      const toEval = cur.filter(r => r.evaluatorId === p.id && ['self_done', 'manager_in_progress'].includes(r.status));
      if (toEval.length) out.push({ txt: fmt('cop.rec.evalTeam', { n: toEval.length }), chips: [
        { label: t('cop.ch.evalNext'), act: 'ask', val: t('cop.ask.eval') },
        { label: t('cop.ch.open'), act: 'nav', val: '#/team' }] });
      const stale = staleList();
      if (stale.length) out.push({ txt: fmt('cop.rec.stale', { n: stale.length, names: stale.slice(0, 3).map(x => x.firstName).join(', ') }), chips: [
        { label: t('cop.ch.checkin'), act: 'ask', val: t('cop.ask.checkin') }] });
    }
    if (v.role === 'hr') {
      const done = cur.filter(r => ['confirmed', 'closed_by_hr'].includes(r.status)).length;
      if (cur.length) out.push({ txt: fmt('cop.rec.completion', { pct: Math.round(done / cur.length * 100) }), chips: [
        { label: t('cop.ch.reportStatus'), act: 'ask', val: t('cop.ask.status') }] });
      const risk = cur.filter(r => ['risk', 'blocked'].includes(ReviewLogic.risk(r)));
      if (risk.length) out.push({ txt: fmt('cop.rec.atrisk', { n: risk.length }), chips: [
        { label: t('cop.ch.open'), act: 'nav', val: '#/hr' }] });
    }
    if (p && window.NPS && NPS.pendingWaveFor && NPS.pendingWaveFor(p.id))
      out.push({ txt: t('cop.rec.enps'), chips: [{ label: t('cop.ch.open'), act: 'nav', val: '#/home' }] });
    if (p && window.Feedback360 && Feedback360.pendingFor(p.id).length)
      out.push({ txt: t('cop.rec.f360'), chips: [{ label: t('cop.ch.open'), act: 'nav', val: '#/home' }] });
    return out.slice(0, 3);
  }

  function welcome(th) {
    const p = meP();
    const rr = recs();
    let html = `<b>${esc(fmt('cop.hello', { name: p ? CzName.first(p.firstName, 'voc') : t('misc.you') }))}</b><br>${esc(t('cop.welcome.lead'))}`;
    if (rr.length) {
      html += `<div class="cop-recs"><b>${esc(t('cop.rec.title'))}</b><ul>` +
        rr.map(r => `<li>${esc(r.txt)}</li>`).join('') + '</ul></div>';
    } else {
      html += `<br><span style="color:var(--text-muted)">${esc(t('cop.rec.none'))}</span>`;
    }
    const chips = rr.flatMap(r => r.chips).slice(0, 4);
    if (!chips.length) chips.push(
      { label: t('cop.ch.reportStatus'), act: 'ask', val: t('cop.ask.status') },
      { label: t('cop.ch.mood'), act: 'ask', val: t('cop.ask.mood') },
      { label: t('cop.ch.kudos'), act: 'ask', val: t('cop.ask.kudos') });
    bot(th, html, chips);
  }

  /* ================= intent parser ================= */
  const RX = {
    cancel: /\b(zrus|zrusit|cancel|stop\b|abbrech|konec)/,
    schedule: /(naplanuj|pripomen|pripominej|kazdy (den|tyden|mesic)|kazdou|remind|schedule|erinner|every (day|week|month)|jeden (tag|woche|monat)|zitra|tomorrow|morgen|za \d+ (dni|dny|den|days?|tage))/,
    kudos: /\b(pochval|kudos|uznani|ocen|podekuj|praise|anerkenn|lob(en|e)?\b)/,
    checkin: /(1 ?: ?1|one.?on.?one|check.?in|zaznam)/,
    self: /(sebehodnocen|self.?(assessment|review|evaluation)|selbsteinschatz|moje hodnocen|vyplnit hodnocen)/,
    evalT: /(vyhodnot|ohodnot|zhodnot|evaluate|bewerte|beurteil|assess)/,
    stats: /(kolik|stav|prehled|report|statist|celkem|how many|wie viele|uberblick|overview|status)/,
    completion: /(hodnocen|review|beurteil).*(stav|dokoncen|neuzavren|nedokoncen|hotovo|uzavren|completion|progress|abschluss|fertig|status)|(stav|status|progress).*(hodnocen|review)|kolik lidi (nema|ma)/,
    atrisk: /(riziko|rizik|po terminu|overdue|risk|deadline|termin)/,
    mood: /(nalad|mood|stimmung|atmosfer|spokojen)/,
    enps: /\b(e?nps|doporucen)/,
    goals: /(cil|goal|ziel)/,
    stale: /(bez 1 ?: ?1|stale|dlouho nemel|dlouho nebyl)/,
    help: /(co (umis|dokazes|zvladnes)|help|napoved|pomoc|was kannst|hilfe|capabilities)/,
    greet: /^(ahoj|cau|cus|dobry|zdravim|hi|hello|hey|hallo|servus|moin)\b/,
  };

  function detect(text) {
    const n = norm(text);
    if (RX.help.test(n)) return 'help';
    if (RX.schedule.test(n)) return 'schedule';
    if (RX.self.test(n)) return 'self';
    if (RX.kudos.test(n) && RX.stats.test(n)) return 'r.kudos';
    if (RX.kudos.test(n)) return 'kudos';
    if (RX.stale.test(n)) return 'r.stale';
    if (RX.checkin.test(n) && (RX.stats.test(n) || RX.mood.test(n))) return 'r.mood';
    if (RX.checkin.test(n)) return 'checkin';
    if (RX.enps.test(n)) return 'r.enps';
    if (RX.mood.test(n)) return 'r.mood';
    if (RX.completion.test(n)) return 'r.completion';
    if (RX.atrisk.test(n)) return 'r.atrisk';
    if (RX.evalT.test(n)) return 'eval';
    if (RX.goals.test(n)) return 'r.goals';
    if (RX.greet.test(n) && n.length < 40) return 'greet';
    return null;
  }

  /* ================= mini render helpers ================= */
  const chipsOf = arr => arr.map(x => ({ label: x.label, act: x.act || 'ans', val: x.val }));
  const scaleChips = self => {
    const c = SCALE.map(k => ({ label: k + ' · ' + ReviewLogic.scaleLabel(k), val: k }));
    if (self) c.unshift({ label: '✓ ' + fmt('cop.e.agreeSelf', { r: self }), val: self });
    return chipsOf(c);
  };
  const peopleChips = list => chipsOf(list.slice(0, 6).map(p => ({ label: p.name, val: p.id })));
  const bar = (pct, label, val) =>
    `<div class="brow"><span>${esc(label)}</span><div class="progressbar"><div style="width:${Math.max(0, Math.min(100, pct))}%"></div></div><b>${esc(val != null ? val : Math.round(pct) + ' %')}</b></div>`;

  /* ================= FLOWS ================= */
  /* ---------- kudos ---------- */
  function startKudos(th, text) {
    const data = {};
    const m = matchPeople(text);
    if (m.length === 1) data.toId = m[0].id;
    const raw = norm(text).length > 12 ? String(text).match(/\s(?:za|for|fur|für)\s+(.{3,})/i) : null;
    if (raw) data.msg = raw[1].trim();
    th.state = { flow: 'kudos', step: null, data };
    if (!data.toId && m.length > 1) { th.state.step = 'who'; return bot(th, t('cop.k.whoAmbig'), peopleChips(m)); }
    nextKudos(th);
  }
  function nextKudos(th) {
    const d = th.state.data;
    if (!d.toId) { th.state.step = 'who'; return bot(th, t('cop.k.who'), peopleChips(scopePeople().length > 1 ? scopePeople() : ppl())); }
    if (!d.msg) { th.state.step = 'msg'; return bot(th, fmt('cop.k.msg', { name: CzName.first(byId(d.toId).firstName, 'acc') })); }
    if (!d.value) {
      th.state.step = 'value';
      return bot(th, t('cop.k.value'), chipsOf(KVALS.map(v2 => ({ label: t('kudos.value.' + v2), val: v2 }))));
    }
    th.state.step = 'confirm';
    bot(th, `${esc(t('cop.k.preview'))}<br><b>${esc(byId(d.toId).name)}</b> · <i>${esc(t('kudos.value.' + d.value))}</i><br>„${esc(d.msg)}“`,
      chipsOf([{ label: '✓ ' + t('common.send'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
  }
  function contKudos(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'who') {
      if (input.val) d.toId = input.val;
      else { const m = matchPeople(input.text || ''); if (m.length === 1) d.toId = m[0].id; else return bot(th, t('cop.k.whoAmbig'), peopleChips(m.length ? m : ppl())); }
    } else if (st.step === 'msg') d.msg = (input.text || '').trim();
    else if (st.step === 'value') d.value = input.val || 'team';
    else if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      Store.insert('kudos', { id: uid(), fromId: va().personId || (ppl()[0] || {}).id, toId: d.toId, msg: d.msg, value: d.value, at: Date.now() });
      notify(t('kudos.give'), 'all');
      return bot(th, '🎉 ' + fmt('cop.k.done', { name: CzName.first(byId(d.toId).firstName, 'acc') }), chipsOf([{ label: t('nav.kudos'), act: 'nav', val: '#/kudos' }]));
    }
    nextKudos(th);
  }

  /* ---------- 1:1 check-in ---------- */
  function startCheckin(th, text) {
    if (va().role === 'employee') return bot(th, t('cop.c.denied'));
    const data = {};
    const m = matchPeople(text).filter(p => va().role === 'hr' || p.managerId === va().personId);
    if (m.length === 1) data.empId = m[0].id;
    th.state = { flow: 'checkin', step: null, data };
    nextCheckin(th);
  }
  function nextCheckin(th) {
    const d = th.state.data;
    const pool = va().role === 'hr' ? ppl() : teamOf(va().personId);
    if (!d.empId) { th.state.step = 'who'; return bot(th, t('cop.c.who'), peopleChips(pool)); }
    if (!d.mood) { th.state.step = 'mood'; return bot(th, fmt('cop.c.mood', { name: byId(d.empId).firstName }), chipsOf(MOODS.map(m2 => ({ label: m2, val: m2 })))); }
    if (d.notes == null) { th.state.step = 'notes'; return bot(th, t('cop.c.notes')); }
    if (d.next == null) { th.state.step = 'next'; return bot(th, t('cop.c.next'), chipsOf([{ label: t('cop.ch.skip'), val: '' }])); }
    th.state = null;
    Store.insert('checkins', { id: uid(), managerId: va().personId || (ppl()[0] || {}).id, employeeId: d.empId, at: Date.now(), mood: d.mood, notes: d.notes, next: d.next });
    bot(th, '✓ ' + fmt('cop.c.done', { name: CzName.full(byId(d.empId).name, 'ins'), mood: d.mood }), chipsOf([{ label: t('nav.checkins'), act: 'nav', val: '#/checkins' }]));
  }
  function contCheckin(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'who') {
      if (input.val) d.empId = input.val;
      else { const m = matchPeople(input.text || ''); if (m.length === 1) d.empId = m[0].id; else return bot(th, t('cop.k.whoAmbig'), peopleChips(m.length ? m : teamOf(va().personId))); }
    } else if (st.step === 'mood') d.mood = MOODS.includes(input.val) ? input.val : (MOODS.find(m2 => (input.text || '').includes(m2)) || '🙂');
    else if (st.step === 'notes') d.notes = (input.text || '').trim();
    else if (st.step === 'next') d.next = input.val != null ? input.val : (input.text || '').trim();
    nextCheckin(th);
  }

  /* ---------- sebehodnocení ---------- */
  function selfItems() {
    const fw = (co() || {}).competencies;
    return fw ? fw.map(c2 => ({ key: c2.key, label: c2.title, comp: true })) : AREAS.map(a => ({ key: a, label: t('rev.area.' + a), comp: false }));
  }
  function startSelf(th) {
    const p = meP();
    const r = p && revs().find(x => x.subjectId === p.id && ['pending_self', 'self_in_progress'].includes(x.status));
    if (!r) return bot(th, t('cop.s.none'), chipsOf([{ label: t('nav.myreviews'), act: 'nav', val: '#/myreviews' }]));
    if (r.status === 'pending_self') Store.update('reviews', r.id, { status: 'self_in_progress' });
    th.state = { flow: 'self', step: 'q1', data: { rid: r.id, idx: 0, ratings: {} } };
    bot(th, esc(t('cop.s.intro')) + '<br><br><b>1/3</b> ' + esc(t('cop.s.q1')));
  }
  function contSelf(th, input) {
    const st = th.state, d = st.data;
    const r = Store.get('reviews', d.rid);
    if (!r) { th.state = null; return bot(th, t('cop.s.none')); }
    const items = selfItems();
    if (st.step === 'q1') { d.success = (input.text || '').trim(); st.step = 'q2'; return bot(th, '<b>2/3</b> ' + esc(t('cop.s.q2'))); }
    if (st.step === 'q2') { d.challenge = (input.text || '').trim(); st.step = 'q3'; return bot(th, '<b>3/3</b> ' + esc(t('cop.s.q3'))); }
    if (st.step === 'q3') { d.improve = (input.text || '').trim(); st.step = 'rate'; d.idx = 0; return askSelfRating(th, items); }
    if (st.step === 'rate') {
      const v2 = SCALE.includes(input.val) ? input.val : (SCALE.find(k => norm(input.text || '').toUpperCase().includes(k)) || 'KV');
      d.ratings[items[d.idx].key] = v2;
      d.idx++;
      if (d.idx < items.length) return askSelfRating(th, items);
      st.step = 'confirm';
      return bot(th, esc(t('cop.s.review')) + '<br>' + items.map(it => `<b>${esc(it.label)}</b>: ${d.ratings[it.key]}`).join(' · '),
        chipsOf([{ label: '✓ ' + t('common.saveSend'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
    }
    if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      const f = r.form;
      f.self.success = d.success; f.self.challenge = d.challenge; f.self.improve = d.improve;
      f.self.summary = d.success;
      if (items[0].comp) { if (!f.compRatings) f.compRatings = { self: {}, mgr: {} }; Object.assign(f.compRatings.self, d.ratings); }
      else Object.assign(f.self.areas, d.ratings);
      Store.update('reviews', r.id, { form: f, status: 'self_done' });
      notify(((meP() || {}).name || '') + ' - ' + t('st.self_done'), 'manager');
      return bot(th, '✓ ' + t('cop.s.done'), chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
    }
  }
  function askSelfRating(th, items) {
    const it = items[th.state.data.idx];
    bot(th, fmt('cop.s.area', { n: th.state.data.idx + 1, total: items.length, area: it.label }), scaleChips(null));
  }

  /* ---------- vyhodnocení zaměstnance (manažer) ---------- */
  function startEval(th, text) {
    const v = va();
    if (v.role === 'employee') return bot(th, t('cop.e.denied'));
    let cands = revs().filter(r => r.period === Generator.CURRENT_PERIOD && ['self_done', 'manager_in_progress'].includes(r.status));
    if (v.role === 'manager') cands = cands.filter(r => r.evaluatorId === v.personId);
    if (!cands.length) return bot(th, t('cop.e.none'), chipsOf([{ label: t('nav.team'), act: 'nav', val: '#/team' }]));
    const m = text ? matchPeople(text) : [];
    const hit = m.length ? cands.filter(r => m.some(p => p.id === r.subjectId)) : [];
    if (hit.length === 1) return evalBegin(th, hit[0]);
    th.state = { flow: 'eval', step: 'who', data: {} };
    bot(th, t('cop.e.pick'), peopleChips(cands.map(r => byId(r.subjectId)).filter(Boolean)));
  }
  function evalBegin(th, r) {
    if (r.status === 'self_done') Store.update('reviews', r.id, { status: 'manager_in_progress' });
    const items = selfItems();
    th.state = { flow: 'eval', step: 'rate', data: { rid: r.id, idx: 0, ratings: {}, gIdx: 0, decisions: [] } };
    const p = byId(r.subjectId);
    bot(th, fmt('cop.e.intro', { name: CzName.full(p.name, 'acc') }));
    askEvalRating(th, r, items);
  }
  function selfRatingOf(r, it) {
    return it.comp ? ((r.form.compRatings || {}).self || {})[it.key] : r.form.self.areas[it.key];
  }
  function askEvalRating(th, r, items) {
    const d = th.state.data;
    const it = items[d.idx];
    const sr = selfRatingOf(r, it);
    bot(th, fmt('cop.e.area', { n: d.idx + 1, total: items.length, area: it.label }) +
      (sr ? `<br><span style="color:var(--text-muted)">${esc(fmt('cop.e.selfWas', { r: sr }))}</span>` : ''), scaleChips(sr));
  }
  function askEvalGoal(th, r) {
    const d = th.state.data;
    const g = r.form.goalsEval[d.gIdx];
    bot(th, `<b>${esc(t('cop.e.goal'))} ${d.gIdx + 1}/${r.form.goalsEval.length}:</b> ${esc(g.title)} <span class="badge">${g.weight} %</span>` +
      (g.rating ? `<br><span style="color:var(--text-muted)">${esc(fmt('cop.e.selfWas', { r: g.rating }))}</span>` : ''),
      chipsOf([{ label: '✓ ' + t('cop.ch.agree'), val: 'agree' }, { label: '💬 ' + t('cop.ch.discuss'), val: 'discuss' }]));
  }
  function contEval(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'who') {
      const rid = input.val ? (revs().find(r2 => r2.subjectId === input.val && r2.period === Generator.CURRENT_PERIOD && ['self_done', 'manager_in_progress'].includes(r2.status)) || {}).id : null;
      if (!rid) { th.state = null; return bot(th, t('cop.e.none')); }
      return evalBegin(th, Store.get('reviews', rid));
    }
    const r = Store.get('reviews', d.rid);
    if (!r) { th.state = null; return bot(th, t('cop.e.none')); }
    const items = selfItems();
    if (st.step === 'rate') {
      d.ratings[items[d.idx].key] = SCALE.includes(input.val) ? input.val : 'KV';
      d.idx++;
      if (d.idx < items.length) return askEvalRating(th, r, items);
      if (r.form.goalsEval.length) { st.step = 'goals'; d.gIdx = 0; bot(th, t('cop.e.goals')); return askEvalGoal(th, r); }
      st.step = 'strengths'; return bot(th, t('cop.e.strengths'), chipsOf([{ label: t('cop.ch.skip'), val: '' }]));
    }
    if (st.step === 'goals') {
      d.decisions.push(input.val === 'discuss' ? 'discuss' : 'agree');
      d.gIdx++;
      if (d.gIdx < r.form.goalsEval.length) return askEvalGoal(th, r);
      st.step = 'strengths'; return bot(th, t('cop.e.strengths'), chipsOf([{ label: t('cop.ch.skip'), val: '' }]));
    }
    if (st.step === 'strengths') {
      d.strengths = input.val != null ? input.val : (input.text || '').trim();
      st.step = 'confirm';
      const disc = d.decisions.filter(x => x === 'discuss').length;
      return bot(th, esc(t('cop.e.review')) + '<br>' + selfItems().map(it => `<b>${esc(it.label)}</b>: ${d.ratings[it.key]}`).join(' · ') +
        (disc ? `<br>💬 ${esc(fmt('cop.e.discN', { n: disc }))}` : ''),
        chipsOf([{ label: '✓ ' + t('cop.ch.saveClose'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
    }
    if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      const f = r.form;
      if (items[0].comp) { if (!f.compRatings) f.compRatings = { self: {}, mgr: {} }; Object.assign(f.compRatings.mgr, d.ratings); }
      else Object.assign(f.mgr.areas, d.ratings);
      const talking = [];
      r.form.goalsEval.forEach((g, i) => {
        g.mgrConfirmed = true;
        g.mgrRating = g.rating || 'KV';
        if (d.decisions[i] === 'discuss') { g.mgrDecision = 'discuss'; talking.push(g.title); }
        else g.mgrDecision = 'agree';
      });
      if (d.strengths) f.mgr.strengths = d.strengths;
      if (talking.length) f.mgr.talking = (f.mgr.talking ? f.mgr.talking + '\n' : '') + talking.map(x => '• ' + x).join('\n');
      f.mgr.summary = f.mgr.summary || d.strengths || '';
      Store.update('reviews', r.id, { form: f, status: 'manager_done' });
      const subj = byId(r.subjectId);
      notify((subj || {}).name + ' - ' + t('st.manager_done'), 'employee');
      const sc = ReviewLogic.computeScore(f);
      const b = sc != null ? ReviewLogic.band(sc) : null;
      return bot(th, '✓ ' + fmt('cop.e.done', { name: CzName.full((subj || {}).name || '', 'acc') }) +
        (sc != null ? `<br>${esc(t('rev.score'))}: <b>${sc.toFixed(2)}</b> <span class="badge ${b.cls}">${esc(t('band.' + b.key))}</span>` : ''),
        chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
    }
  }

  /* ================= REPORTY (respektují roli) ================= */
  function rCompletion(th) {
    const v = va();
    let cur = revs().filter(r => r.period === Generator.CURRENT_PERIOD);
    if (v.role === 'manager') cur = cur.filter(r => r.evaluatorId === v.personId);
    if (v.role === 'employee') cur = cur.filter(r => r.subjectId === v.personId);
    if (!cur.length) return bot(th, t('cop.r.noData'));
    const done = cur.filter(r => ['confirmed', 'closed_by_hr'].includes(r.status));
    const open = cur.filter(r => !['confirmed', 'closed_by_hr', 'cancelled'].includes(r.status));
    let html = `<b>${esc(t('cop.r.completion'))}</b> · ${esc(Generator.CURRENT_PERIOD)}` +
      bar(done.length / cur.length * 100, t('hr.completion'), done.length + '/' + cur.length);
    if (open.length && v.role !== 'employee') {
      html += `<br><b>${esc(fmt('cop.r.openList', { n: open.length }))}</b><ul>` +
        open.slice(0, 8).map(r => `<li>${esc((byId(r.subjectId) || {}).name || '?')} - ${esc(t('st.' + r.status))}</li>`).join('') +
        (open.length > 8 ? `<li>… +${open.length - 8}</li>` : '') + '</ul>';
    }
    bot(th, html, chipsOf([{ label: v.role === 'employee' ? t('nav.myreviews') : t('nav.team'), act: 'nav', val: v.role === 'employee' ? '#/myreviews' : '#/team' }]));
  }
  function rAtRisk(th) {
    const v = va();
    let cur = revs().filter(r => r.period === Generator.CURRENT_PERIOD);
    if (v.role === 'manager') cur = cur.filter(r => r.evaluatorId === v.personId);
    if (v.role === 'employee') cur = cur.filter(r => r.subjectId === v.personId);
    const risk = cur.filter(r => ['risk', 'blocked'].includes(ReviewLogic.risk(r)));
    if (!risk.length) return bot(th, '✓ ' + t('cop.r.noRisk'));
    bot(th, `<b>${esc(fmt('cop.r.atrisk', { n: risk.length }))}</b><ul>` +
      risk.slice(0, 8).map(r => `<li>${esc((byId(r.subjectId) || {}).name || '?')} - ${ReviewLogic.daysLeft(r)} d (${esc(t('st.' + r.status))})</li>`).join('') + '</ul>',
      chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: v.role === 'hr' ? '#/hr' : '#/team' }]));
  }
  function staleList() {
    const v = va();
    const scope = v.role === 'manager' ? teamOf(v.personId) : ppl().filter(p => p.managerId);
    const last = {};
    Store.list('checkins').forEach(c2 => { if (!last[c2.employeeId] || c2.at > last[c2.employeeId]) last[c2.employeeId] = c2.at; });
    return scope.filter(p => !last[p.id] || last[p.id] < Date.now() - 30 * DAY);
  }
  function rMood(th) {
    const v = va();
    let list = Store.list('checkins').filter(c2 => c2.at > Date.now() - 90 * DAY);
    if (v.role === 'manager') list = list.filter(c2 => c2.managerId === v.personId);
    if (v.role === 'employee') list = list.filter(c2 => c2.employeeId === v.personId);
    const vs = list.map(c2 => MOOD_VAL[c2.mood]).filter(Boolean);
    if (!vs.length) return bot(th, t('cop.r.noData'));
    const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
    const mood = MOODS.slice().reverse()[Math.max(0, Math.min(3, Math.round(avg) - 1))];
    let html = `<b>${esc(t('cop.r.mood'))}</b> (90 d): ${mood} <b>${avg.toFixed(1)}</b> / 4 · ${list.length}× 1:1`;
    const st = v.role !== 'employee' ? staleList() : [];
    if (st.length) html += `<br>⚠ ${esc(fmt('cop.rec.stale', { n: st.length, names: st.slice(0, 4).map(p => p.firstName).join(', ') }))}`;
    bot(th, html, chipsOf(v.role === 'employee' ? [] : [{ label: t('nav.checkins'), act: 'nav', val: '#/checkins' }, { label: t('cop.ch.checkin'), act: 'ask', val: t('cop.ask.checkin') }]));
  }
  function rEnps(th) {
    if (!window.NPS) return bot(th, t('cop.r.noData'));
    const last = NPS.closedWaves().slice(-1)[0];
    if (!last) return bot(th, t('cop.r.noData'));
    const score = NPS.enps(NPS.slice(last, null));
    if (score == null) return bot(th, t('cop.r.anon'));
    bot(th, `<b>eNPS</b> · ${esc(last.label || '')}: <b>${score}</b> <span style="color:var(--text-muted)">(${last.responses.length}×)</span>` +
      bar((score + 100) / 2, 'eNPS', score), chipsOf(va().role === 'hr' ? [{ label: t('cop.ch.open'), act: 'nav', val: '#/talent' }] : []));
  }
  function rKudos(th) {
    const list = Store.list('kudos').filter(k => k.at > Date.now() - 90 * DAY);
    if (!list.length) return bot(th, t('cop.r.noData'), chipsOf([{ label: t('cop.ch.kudos'), act: 'ask', val: t('cop.ask.kudos') }]));
    const byTo = {};
    list.forEach(k => { byTo[k.toId] = (byTo[k.toId] || 0) + 1; });
    const top = Object.entries(byTo).sort((a, b) => b[1] - a[1]).slice(0, 3);
    bot(th, `<b>${esc(t('nav.kudos'))}</b> (90 d): <b>${list.length}</b><br>${esc(t('cop.r.kudosTop'))}: ` +
      top.map(([id, n]) => `${esc((byId(id) || {}).firstName || '?')} (${n}×)`).join(', '),
      chipsOf([{ label: t('nav.kudos'), act: 'nav', val: '#/kudos' }, { label: t('cop.ch.kudos'), act: 'ask', val: t('cop.ask.kudos') }]));
  }
  function rGoals(th) {
    const v = va();
    let gs = Store.list('goals').filter(g => g.type === 'personal' && g.period === Generator.CURRENT_PERIOD);
    if (v.role === 'employee') gs = gs.filter(g => g.ownerId === v.personId);
    if (v.role === 'manager') { const ids = new Set(teamOf(v.personId).map(p => p.id).concat([v.personId])); gs = gs.filter(g => ids.has(g.ownerId)); }
    if (!gs.length) return bot(th, t('cop.r.noData'));
    const avg = Math.round(gs.reduce((s, g) => s + g.progress, 0) / gs.length);
    const low = gs.filter(g => g.progress < 30);
    let html = `<b>${esc(t('cop.r.goals'))}</b>` + bar(avg, fmt('cop.r.goalsAvg', { n: gs.length }), avg + ' %');
    if (low.length) html += `<br>⚠ ${esc(fmt('cop.r.goalsLow', { n: low.length }))}<ul>` +
      low.slice(0, 5).map(g => `<li>${esc(g.title)} (${g.progress} %${v.role !== 'employee' ? ' · ' + esc((byId(g.ownerId) || {}).firstName || '') : ''})</li>`).join('') + '</ul>';
    bot(th, html, chipsOf([{ label: t('nav.goals'), act: 'nav', val: '#/goals' }]));
  }
  function rStale(th) {
    const st = staleList();
    if (!st.length) return bot(th, '✓ ' + t('cop.r.noStale'));
    bot(th, `<b>${esc(t('ci.stale'))}:</b> ${st.slice(0, 8).map(p => esc(p.name)).join(', ')}${st.length > 8 ? ' …' : ''}`,
      chipsOf([{ label: t('cop.ch.checkin'), act: 'ask', val: t('cop.ask.checkin') }]));
  }

  /* ================= naplánované úlohy ================= */
  function parseSchedule(text) {
    const n = norm(text);
    let freq = null, nextAt = null;
    if (/kazdy den|denne|daily|every day|jeden tag|taglich/.test(n)) freq = 'daily';
    else if (/kazdy tyden|tydne|weekly|every week|jede woche|wochentlich/.test(n)) freq = 'weekly';
    else if (/kazdy mesic|mesicne|monthly|every month|jeden monat|monatlich/.test(n)) freq = 'monthly';
    else {
      const za = n.match(/za (\d+) (dni|dny|den|days?|tage)/);
      if (za) { freq = 'once'; nextAt = Date.now() + (+za[1]) * DAY; }
      else if (/zitra|tomorrow|morgen/.test(n)) { freq = 'once'; nextAt = Date.now() + DAY; }
      else freq = 'weekly';
    }
    if (!nextAt) nextAt = Date.now() + (freq === 'daily' ? 1 : freq === 'weekly' ? 7 : freq === 'monthly' ? 30 : 1) * DAY;
    /* text úlohy = vstup bez plánovacích frází a úvodních sloves */
    const task = String(text)
      .replace(/(naplánuj( mi)?|naplanuj( mi)?|připomeň( mi)?|pripomen( mi)?|připomínej( mi)?|remind( me)?( to)?|schedule|erinnere? mich( an)?)/gi, '')
      .replace(/(každý (den|týden|měsíc)|kazdy (den|tyden|mesic)|denně|týdně|měsíčně|daily|weekly|monthly|every (day|week|month)|jeden (tag|monat)|jede woche|zítra|zitra|tomorrow|morgen|za \d+ (dní|dni|dny|den|days?|tage))/gi, '')
      .replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '');
    return { freq, nextAt, task };
  }
  function startSchedule(th, text) {
    const { freq, nextAt, task } = parseSchedule(text);
    if (task.length < 3) { th.state = { flow: 'schedule', step: 'what', data: { freq, nextAt } }; return bot(th, t('cop.t.what')); }
    createTask(th, task, freq, nextAt);
  }
  function contSchedule(th, input) {
    const d = th.state.data; th.state = null;
    const task = (input.text || '').trim();
    if (task.length < 3) return bot(th, t('cop.cancelled'));
    createTask(th, task, d.freq, d.nextAt);
  }
  function createTask(th, text, freq, nextAt) {
    Store.insert('copilotTasks', { id: uid(), ownerKey: ownerKey(), text, freq, nextAt, at: Date.now() });
    bot(th, '⏰ ' + fmt('cop.t.saved', { task: text, freq: t('cop.t.freq.' + freq), date: UI.fmtDate(nextAt) }));
  }
  function tasks() { return Store.list('copilotTasks').filter(x => x.ownerKey === ownerKey()); }
  function runDueTasks(th) {
    let ran = 0;
    tasks().filter(x => x.nextAt <= Date.now()).forEach(task => {
      bot(th, '⏰ <b>' + esc(t('cop.t.due')) + ':</b> ' + esc(task.text));
      route(th, task.text, true);
      if (task.freq === 'once') Store.remove('copilotTasks', task.id);
      else Store.update('copilotTasks', task.id, { nextAt: Date.now() + (task.freq === 'daily' ? 1 : task.freq === 'weekly' ? 7 : 30) * DAY });
      ran++;
    });
    if (ran) saveTh(th);
    return ran;
  }

  /* ================= uložené prompty ================= */
  function prompts() { return Store.list('copilotPrompts').filter(x => x.ownerKey === ownerKey()); }
  function savePrompt(text) {
    if (!text || text.trim().length < 2) return null;
    return Store.insert('copilotPrompts', { id: uid(), ownerKey: ownerKey(), label: text.trim().slice(0, 48), text: text.trim(), at: Date.now() });
  }

  /* ================= router ================= */
  function capabilitiesHtml() {
    return `<b>${esc(t('cop.f.capabilities'))}</b><ul>` +
      [1, 2, 3, 4, 5, 6].map(i => `<li>${esc(t('cop.cap.' + i))}</li>`).join('') + '</ul>';
  }
  function defaultChips() {
    return chipsOf([
      { label: t('cop.ch.reportStatus'), act: 'ask', val: t('cop.ask.status') },
      { label: t('cop.ch.mood'), act: 'ask', val: t('cop.ask.mood') },
      { label: t('cop.ch.kudos'), act: 'ask', val: t('cop.ask.kudos') },
    ]);
  }
  function route(th, text, isTask) {
    const intent = detect(text);
    if (intent === 'help') return bot(th, capabilitiesHtml(), defaultChips());
    if (intent === 'greet') { welcome(th); return; }
    if (intent === 'schedule' && !isTask) return startSchedule(th, text);
    if (intent === 'self') return startSelf(th);
    if (intent === 'kudos') return startKudos(th, text);
    if (intent === 'checkin') return startCheckin(th, text);
    if (intent === 'eval') return startEval(th, text);
    if (intent === 'r.completion') return rCompletion(th);
    if (intent === 'r.atrisk') return rAtRisk(th);
    if (intent === 'r.mood') return rMood(th);
    if (intent === 'r.enps') return rEnps(th);
    if (intent === 'r.kudos') return rKudos(th);
    if (intent === 'r.goals') return rGoals(th);
    if (intent === 'r.stale') return rStale(th);
    bot(th, esc(t('cop.f.sorry')) + '<br><br>' + capabilitiesHtml(), defaultChips());
  }

  function reply(th, input) {
    /* input: {text} volný vstup | {val,label} odpověď chipem */
    if (th.state) {
      if (input.text && RX.cancel.test(norm(input.text))) { th.state = null; bot(th, t('cop.cancelled')); saveTh(th); return; }
      const fl = th.state.flow;
      if (fl === 'kudos') contKudos(th, input);
      else if (fl === 'checkin') contCheckin(th, input);
      else if (fl === 'self') contSelf(th, input);
      else if (fl === 'eval') contEval(th, input);
      else if (fl === 'schedule') contSchedule(th, input);
      else { th.state = null; route(th, input.text || ''); }
    } else route(th, input.text || input.label || '');
    saveTh(th);
  }
  /* jednorázové zpracování (testy, naplánované úlohy) */
  function process(th, text) { userMsg(th, text); reply(th, { text }); return th; }

  window.Copilot = {
    enabled, threads, newThread, saveTh, userMsg, reply, process, welcome,
    prompts, savePrompt, tasks, runDueTasks, matchPeople, detect, parseSchedule, recs, ownerKey,
  };

  /* ================= VIEWS ================= */
  const ui = { threadId: null };

  function pulseAva() {
    return `<span class="cop-ava" aria-hidden="true"><svg viewBox="0 0 140 140" width="20" height="20">
      <path d="M30 34 H110 A8 8 0 0 1 110 50 H82 V104 A8 8 0 0 1 58 104 V50 H30 A8 8 0 0 1 30 34 Z" fill="none" stroke="currentColor" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/></svg></span>`;
  }

  function render(root) {
    if (!enabled()) {
      root.innerHTML = `<h1 class="page-title">TeamPulse Copilot</h1>
        <div class="card"><div class="empty">${icon('copilot', 52)}<br><b>${esc(t('cop.disabledTitle'))}</b>
        <p>${esc(t('cop.disabledHint'))}</p>
        <button class="btn btn-primary" id="cop-enable" style="margin-top:12px">${esc(t('cop.enable'))}</button></div></div>`;
      const en = root.querySelector('#cop-enable');
      if (en) en.onclick = () => { Store.patchSettings({ copilotEnabled: true }); App.render(); };
      return;
    }
    let th = threads().find(x => x.id === ui.threadId) || threads()[0];
    if (!th) th = newThread();
    ui.threadId = th.id;
    runDueTasks(th);
    const ths = threads(); /* až po případném založení vlákna */

    root.innerHTML = `
      <div class="cop-wrap">
        <aside class="cop-side">
          <button class="btn btn-primary btn-block" id="cop-new">${icon('plus', 15)} ${esc(t('cop.newChat'))}</button>
          <div class="cop-side-sec">${esc(t('cop.threads'))}</div>
          <div id="cop-threads">${ths.map(x => `
            <div class="cop-thread ${x.id === th.id ? 'on' : ''}" data-th="${x.id}">
              ${x.pinned ? '📌 ' : ''}<span class="cop-th-title">${esc(x.title)}</span>
              <button class="cop-mini" data-pin="${x.id}" title="${esc(t(x.pinned ? 'cop.unpin' : 'cop.pin'))}">${x.pinned ? '✕' : '📌'}</button>
              <button class="cop-mini" data-del="${x.id}" title="${esc(t('common.delete'))}">🗑</button>
            </div>`).join('')}</div>
          <div class="cop-side-sec">${esc(t('cop.saved'))}</div>
          <div>${prompts().map(pr => `
            <div class="cop-thread" data-prompt="${pr.id}" title="${esc(pr.text)}">
              <span class="cop-th-title">▸ ${esc(pr.label)}</span>
              <button class="cop-mini" data-pdel="${pr.id}" title="${esc(t('common.delete'))}">🗑</button>
            </div>`).join('') || `<div class="cop-empty-side">${esc(t('cop.savedEmpty'))}</div>`}</div>
          <div class="cop-side-sec">${esc(t('cop.tasks'))}</div>
          <div>${tasks().map(task => `
            <div class="cop-thread" title="${esc(task.text)}">
              <span class="cop-th-title">⏰ ${esc(task.text.slice(0, 26))}<br><small style="color:var(--text-muted)">${esc(t('cop.t.freq.' + task.freq))} · ${UI.fmtDate(task.nextAt)}</small></span>
              <button class="cop-mini" data-tdel="${task.id}" title="${esc(t('common.delete'))}">🗑</button>
            </div>`).join('') || `<div class="cop-empty-side">${esc(t('cop.tasksEmpty'))}</div>`}</div>
        </aside>
        <section class="card cop-main">
          <div class="cop-head">${pulseAva()}<div><b>TeamPulse Copilot</b>
            <small>${esc(t('cop.sub'))}</small></div>
            <span class="badge b-blue" style="margin-left:auto" title="${esc(t('cop.mobileHintFull'))}">${icon('spark', 12)} ${esc(t('cop.mobileHint'))}</span></div>
          <div class="cop-msgs" id="cop-msgs"></div>
          <div class="cop-input">
            <textarea class="input" id="cop-in" rows="1" placeholder="${esc(t('cop.inputPh'))}"></textarea>
            <button class="iconbtn" id="cop-save" title="${esc(t('cop.savePrompt'))}">${icon('folder', 18)}</button>
            <button class="btn btn-primary" id="cop-send">${icon('send', 16)} <span class="cop-send-lbl">${esc(t('cop.send'))}</span></button>
          </div>
        </section>
      </div>`;

    drawMsgs(root, th);

    const input = root.querySelector('#cop-in');
    const doSend = () => {
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      userMsg(th, text);
      drawMsgs(root, th, true);
      setTimeout(() => { reply(th, { text }); drawMsgs(root, th); }, 420);
    };
    const sendBtn = root.querySelector('#cop-send');
    if (sendBtn) sendBtn.onclick = doSend;
    if (input) input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } };
    const saveBtn = root.querySelector('#cop-save');
    if (saveBtn) saveBtn.onclick = () => {
      const src = (input && input.value.trim()) || (th.msgs.slice().reverse().find(m => m.who === 'user') || {}).text || '';
      if (savePrompt(src)) { toast(t('cop.promptSaved')); render(root); }
    };
    const nw = root.querySelector('#cop-new');
    if (nw) nw.onclick = () => { ui.threadId = newThread().id; render(root); };
    root.querySelectorAll('[data-th]').forEach(el => el.onclick = e => {
      if (e.target.closest('.cop-mini')) return;
      ui.threadId = el.dataset.th; render(root);
    });
    root.querySelectorAll('[data-pin]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const x = Store.get('copilotThreads', b.dataset.pin);
      if (x) Store.update('copilotThreads', x.id, { pinned: !x.pinned });
      render(root);
    });
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = e => {
      e.stopPropagation(); Store.remove('copilotThreads', b.dataset.del);
      if (ui.threadId === b.dataset.del) ui.threadId = null;
      render(root);
    });
    root.querySelectorAll('[data-prompt]').forEach(el => el.onclick = e => {
      if (e.target.closest('.cop-mini')) return;
      const pr = Store.get('copilotPrompts', el.dataset.prompt);
      if (!pr) return;
      userMsg(th, pr.text); drawMsgs(root, th, true);
      setTimeout(() => { reply(th, { text: pr.text }); drawMsgs(root, th); }, 420);
    });
    root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = e => { e.stopPropagation(); Store.remove('copilotPrompts', b.dataset.pdel); render(root); });
    root.querySelectorAll('[data-tdel]').forEach(b => b.onclick = e => { e.stopPropagation(); Store.remove('copilotTasks', b.dataset.tdel); render(root); });
  }

  function drawMsgs(root, th, typing) {
    const box = root.querySelector('#cop-msgs');
    if (!box) return;
    const lastId = (th.msgs[th.msgs.length - 1] || {}).id;
    box.innerHTML = th.msgs.map(m => {
      if (m.who === 'user') {
        return `<div class="cop-msg user">${avatar(meP(), 30)}<div class="cop-bubble">${esc(m.text)}</div></div>`;
      }
      const active = m.id === lastId;
      const chips = (m.chips || []).map((c2, i) =>
        `<button class="cop-chip" data-chip="${m.id}:${i}" ${(!active && c2.act !== 'nav') ? 'disabled' : ''}>${esc(c2.label)}</button>`).join('');
      return `<div class="cop-msg bot">${pulseAva()}<div class="cop-bubble">${m.html}${chips ? `<div class="cop-chips">${chips}</div>` : ''}</div></div>`;
    }).join('') + (typing ? `<div class="cop-msg bot">${pulseAva()}<div class="cop-bubble cop-typing"><i></i><i></i><i></i></div></div>` : '');
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
      const [mid, idx] = b.dataset.chip.split(':');
      const m = th.msgs.find(x => x.id === mid);
      const c2 = m && m.chips && m.chips[+idx];
      if (!c2) return;
      if (c2.act === 'nav') { location.hash = c2.val; return; }
      if (c2.act === 'ask') {
        userMsg(th, c2.val); drawMsgs(root, th, true);
        setTimeout(() => { reply(th, { text: c2.val }); drawMsgs(root, th); }, 420);
        return;
      }
      /* 'ans' - odpověď do běžícího flow; zobraz volbu jako zprávu uživatele */
      th.msgs.push({ id: uid(), who: 'user', text: c2.label, at: Date.now() });
      drawMsgs(root, th, true);
      setTimeout(() => { reply(th, { val: c2.val, label: c2.label }); drawMsgs(root, th); }, 380);
    });
  }

  window.CopilotViews = { render };
})();
