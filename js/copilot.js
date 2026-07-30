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
    const n0 = norm(text);
    /* přesná shoda na celé jméno má přednost před fuzzy skórováním (jmenovci) */
    const exact = ppl().filter(p => p.firstName && p.lastName && n0.includes(norm(p.firstName + ' ' + p.lastName)));
    if (exact.length === 1) return exact;
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
          out.push({ txt: t('cop.rec.confirmRev'), chips: [
            { label: t('cop.ch.confirmChat'), act: 'ask', val: t('cop.ask.confirm') },
            { label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }] });
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
      out.push({ txt: t('cop.rec.enps'), chips: [{ label: t('cop.ch.fillSelf'), act: 'ask', val: t('cop.ask.nps') }] });
    if (p && window.Feedback360 && Feedback360.pendingFor(p.id).length)
      out.push({ txt: t('cop.rec.f360'), chips: [{ label: t('cop.ch.fillSelf'), act: 'ask', val: t('cop.ask.f360') }] });
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
    /* Copilot je i nápověda - hned na uvítanou nabídnu vysvětlení procesu */
    html += `<br><br><span style="color:var(--text-muted)">${esc(t('cop.kb.alsoAsk'))} <i>${esc(t('cop.kb.exampleQ'))}</i></span>`;
    const chips = rr.flatMap(r => r.chips).slice(0, 3);
    if (!chips.length) chips.push(
      { label: t('cop.ch.reportStatus'), act: 'ask', val: t('cop.ask.status') },
      { label: t('cop.ch.mood'), act: 'ask', val: t('cop.ask.mood') },
      { label: t('cop.ch.kudos'), act: 'ask', val: t('cop.ask.kudos') });
    chips.push.apply(chips, askTopicChip('flow'));
    bot(th, html, chips);
  }

  /* ================= intent parser ================= */
  const RX = {
    cancel: /\b(zrus|zrusit|cancel|stop\b|abbrech|konec)/,
    schedule: /(naplanuj|pripomen|pripominej|kazdy (den|tyden|mesic)|kazdou|remind|schedule|erinner|every (day|week|month)|jeden (tag|woche|monat)|zitra|tomorrow|morgen|za \d+ (dni|dny|den|days?|tage))/,
    kudos: /\b(pochval|kudos|uznani|ocen|podekuj|praise|anerkenn|lob(en|e)?\b)/,
    fbGive: /(konstruktivn\w*\s*(vazb|feedback|zpetn))|((dej|dam|dat|napis|posli|poslat|give|gib)\w*\s+(?:\S+\s+){0,2}?(vazbu?\b|feedback))/,
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
    /* --- v2 --- */
    conv: /(rozhovor|conversation|gesprach)/,
    convDone: /(probehl|probehlo|uskutecnil|hotov|done|stattgefunden)/,
    confirmR: /(potvrd|potvrzuji|souhlasim s hodnocen|nesouhlasim s hodnocen|confirm|bestatig)/,
    goalAdd: /(pridej|pridat|nov[eyá]|zaloz|vytvor|add|create|neu)\w*\s+(?:\S+\s+)?(cil|goal|ziel)|(cil|goal|ziel)\w*\s+(pridej|pridat|zaloz)/,
    goalProg: /((cil|goal|ziel).*(na \d+|progress|plnen|posun|aktualizuj))|((progress|plnen|posun|aktualizuj|nastav).*(cil|goal|ziel))/,
    npsFill: /(odpov|vypln|answer|beantwort|ausfull).*(e?nps|puls)|((e?nps|pulse?).*(odpov|vypln|answer))/,
    f360: /\b360\b|zpetn[aou]?\s*vazb|feedback/,
    f360Fill: /(vypln|odpov|answer|ausfull)/,
    f360Req: /(vyzadej|vyzadat|pozadej|spust|request|anforder)/,
    kpiWord: /\bkpi\b/,
    kpiSet: /(nastav|uprav|aktualizuj|zmen|set|update|andere)/,
    personAdd: /(pridej|zaloz|add|create|neu)\w*\s+(?:\S+\s+)?(clovek|zamestnan|osob|koleg|person|mitarbeiter)/,
    whois: /(kdo je|kdo to je|co je zac|who is|wer ist|profil |karta )/,
    myteam: /(muj tym|muj tym|meho tymu|mem tymu|my team|mein team|jak je na tom tym)/,
    notif: /(co (je|mam) noveho|novink|notifikac|notification|upozornen|neuigkeit)/,
    changelog: /(changelog|(nov\w*|co je noveho|co umi noveho|what.?s new|neue?)\s*\w*\s*(aplikac|funkc|featur|system|demo|verz|app\b)|(aplikac|app)\w*\s+(noveho|umi noveho))/,
    scaleQ: /(skal[aeu]|stupnic|scale|co znamena (tn|po|kv|nr|nu)|rating (levels|scale))/,
    talent: /(talent|9.?box|matice|nastupnic|succession|klicov\S* pozic|retenc)/,
    theme: /(tema|theme|design|vzhled|dark|svetl)/,
    themeName: /\b(brand|corp|korporat|glass|genz|gen z)\b/,
    lang: /(prepni|zmen|switch|change|wechsel).*(jazyk|language|sprache)|do (anglictiny|nemciny|cestiny)|to (english|german|czech)|auf (englisch|deutsch|tschechisch)/,
    cycle: /(spust|zahaj|start|nov[eyá])\w*\s+(?:\S+\s+)?(cyklus|cycle|zyklus|kolo hodnocen)|(cyklus|cycle|zyklus).*(spust|start|zahaj)/,
    remindOther: /\b(vsem|all|allen)\b|(pripomen|remind|erinner)/,
    howto: /(jak\s+(funguje|na\b|pridam|prid|udelam|spustim|zadam|vyplnim|zapnu|vypnu|nastavim|nastavit|probiha|se|mam|bych|zapisu|zapsat|zaznamenam|zalozim|otevru|najdu|smazu|zrusim|pozvu|poslu|potvrdim|dokoncim|vytvorim|casto)|co je\b|co znamena|co to je|co delat|co kdyz|co se stane|nesouhlas|kde (najdu|je|se|vypnu|zapnu|nastavim|zmenim|najdes|mam|si)|k cemu|proc\b|kdo (vidi|uvidi|ma pristup|je na tahu)|vysvetli|rozdil mezi|krok za krokem|navod|prirucka|muj postup|jak postupovat|what is|what if|how (does|do i)|where (do i|can i)|why\b|who (can|sees)|step by step|was (ist|passiert|wenn)|wie (funktioniert|kann)|warum|wer (sieht|kann))/,
    switchOff: /(vypni|vypnout|deaktivuj|disable|abschalt).*(copilot)|copilot.*(vypni|vypnout|off)/,
  };

  function detect(text) {
    const n = norm(text);
    /* dotazy s odpovědí Z DAT mají přednost před nápovědou… */
    if (RX.changelog.test(n)) return 'r.changelog';
    if (RX.notif.test(n)) return 'r.notif';
    if (RX.scaleQ.test(n)) return 'r.scale';
    /* …a OTÁZKA („co je / jak funguje / kde / proč / kdo vidí") má přednost před AKCÍ:
       „zapiš 1:1 s Petrem" = akce, ale „jak zapíšu 1:1?" = nápověda. */
    if (RX.howto.test(n)) return 'howto';
    if (RX.switchOff.test(n)) return 'copOff';
    if (RX.help.test(n)) return 'help';
    /* rozhovor má přednost před plánovačem („naplánuj rozhovor s…") */
    if (RX.conv.test(n) && !RX.f360.test(n)) return 'conv';
    if (RX.schedule.test(n)) {
      /* „připomeň Petrovi / všem v riziku" = akce remind, „připomeň mi…" = plánovač */
      if (/(pripomen|remind|erinner)/.test(n) && !/\b(mi|me|mir)\b/.test(n)
        && (/\b(vsem|all|allen)\b/.test(n) || matchPeople(text).length)) return 'remind';
      return 'schedule';
    }
    if (RX.confirmR.test(n)) return 'confirm';
    if (RX.npsFill.test(n)) return 'npsFill';
    /* „dej vazbu Janě" = konstruktivní vazba; „vyžádej (360/zpětnou vazbu) na Janu" zůstává 360 */
    if (RX.fbGive.test(n) && !/\b360\b/.test(n) && !RX.f360Req.test(n)) return 'fb';
    if (RX.f360.test(n)) {
      if (RX.f360Req.test(n)) return 'f360Req';
      if (RX.f360Fill.test(n)) return 'f360Fill';
      return 'r.f360';
    }
    if (RX.self.test(n)) return 'self';
    if (RX.kudos.test(n) && RX.stats.test(n)) return 'r.kudos';
    if (RX.kudos.test(n)) return 'kudos';
    if (RX.stale.test(n)) return 'r.stale';
    if (RX.checkin.test(n) && (RX.stats.test(n) || RX.mood.test(n))) return 'r.mood';
    if (RX.checkin.test(n)) return 'checkin';
    if (RX.kpiWord.test(n)) return RX.kpiSet.test(n) ? 'kpiSet' : 'r.kpi';
    if (RX.goalAdd.test(n)) return 'goalAdd';
    if (RX.goalProg.test(n) && /\d/.test(n)) return 'goalProg';
    if (RX.personAdd.test(n)) return 'personAdd';
    if (RX.cycle.test(n)) return 'cycle';
    if (RX.talent.test(n)) return 'r.talent';
    if (RX.changelog.test(n)) return 'r.changelog';
    if (RX.notif.test(n)) return 'r.notif';
    if (RX.scaleQ.test(n)) return 'r.scale';
    if (RX.myteam.test(n)) return 'r.team';
    if (RX.lang.test(n)) return 'lang';
    if (RX.theme.test(n) && RX.themeName.test(n)) return 'theme';
    if (RX.whois.test(n) && matchPeople(text).length) return 'r.person';
    if (RX.enps.test(n)) return 'r.enps';
    if (RX.mood.test(n)) return 'r.mood';
    if (RX.completion.test(n)) return 'r.completion';
    if (RX.atrisk.test(n)) return 'r.atrisk';
    if (RX.evalT.test(n)) return 'eval';
    if (RX.goals.test(n)) return 'r.goals';
    if (RX.theme.test(n)) return 'theme';
    if (RX.greet.test(n) && n.length < 40) return 'greet';
    if (matchPeople(text).length === 1 && n.split(/\s+/).length <= 3) return 'r.person';
    /* poslední záchrana: sedí-li dotaz na téma Nápovědy, odpověz z ní místo „tohle neumím" */
    if (window.HelpKB && n.split(/\s+/).length >= 2 && HelpKB.search(text).length) return 'howto';
    return null;
  }

  /* ================= mini render helpers ================= */
  const chipsOf = arr => arr.map(x => ({ label: x.label, act: x.act || 'ans', val: x.val }));
  const scaleChips = self => {
    const c = SCALE.map(k => ({ label: ReviewLogic.scaleWord(k), val: k }));
    if (self) c.unshift({ label: '✓ ' + fmt('cop.e.agreeSelf', { r: ReviewLogic.scaleWord(self) }), val: self });
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

  /* ---------- konstruktivní vazba (SBI) ---------- */
  function startFb(th, text) {
    const data = {};
    const m = matchPeople(text);
    if (m.length === 1) data.toId = m[0].id;
    th.state = { flow: 'fb', step: null, data };
    if (!data.toId && m.length > 1) { th.state.step = 'who'; return bot(th, t('cop.fb.whoAmbig'), peopleChips(m)); }
    nextFb(th);
  }
  function nextFb(th) {
    const d = th.state.data;
    if (!d.toId) { th.state.step = 'who'; return bot(th, t('cop.fb.who'), peopleChips(scopePeople().length > 1 ? scopePeople() : ppl())); }
    if (!d.kind) {
      th.state.step = 'kind';
      return bot(th, t('cop.fb.kind'), chipsOf([{ label: t('fb.kind.praise'), val: 'praise' }, { label: t('fb.kind.develop'), val: 'develop' }]));
    }
    if (!d.sit) { th.state.step = 'sit'; return bot(th, fmt('cop.fb.sit', { name: CzName.first(byId(d.toId).firstName, 'acc') })); }
    if (!d.beh) { th.state.step = 'beh'; return bot(th, t('cop.fb.beh')); }
    if (!d.imp) { th.state.step = 'imp'; return bot(th, t('cop.fb.imp')); }
    if (d.sug === undefined) { th.state.step = 'sug'; return bot(th, t('cop.fb.sug'), chipsOf([{ label: t('cop.fb.skip'), val: 'skip' }])); }
    if (d.tagKey === undefined) {
      th.state.step = 'tag';
      return bot(th, t('cop.fb.tag'), chipsOf(Feedback.tags().map(tg => ({ label: tg.label, val: tg.kind + ':' + tg.key }))
        .concat([{ label: t('cop.fb.skip'), val: 'skip' }])));
    }
    th.state.step = 'confirm';
    bot(th, `${esc(t('cop.fb.preview'))}<br><b>${esc(byId(d.toId).name)}</b> · <i>${esc(t('fb.kind.' + d.kind))}</i><br>${esc(d.sit)} → ${esc(d.beh)} → ${esc(d.imp)}${d.sug ? '<br><i>' + esc(d.sug) + '</i>' : ''}`,
      chipsOf([{ label: '✓ ' + t('common.send'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
  }
  function contFb(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'who') {
      if (input.val) d.toId = input.val;
      else { const m = matchPeople(input.text || ''); if (m.length === 1) d.toId = m[0].id; else return bot(th, t('cop.fb.whoAmbig'), peopleChips(m.length ? m : ppl())); }
    } else if (st.step === 'kind') d.kind = input.val || 'develop';
    else if (st.step === 'sit') d.sit = (input.text || '').trim();
    else if (st.step === 'beh') d.beh = (input.text || '').trim();
    else if (st.step === 'imp') d.imp = (input.text || '').trim();
    else if (st.step === 'sug') d.sug = input.val === 'skip' ? '' : (input.text || '').trim();
    else if (st.step === 'tag') {
      if (!input.val || input.val === 'skip') { d.tagKey = null; d.tagKind = null; }
      else { const [tk, key] = input.val.split(':'); d.tagKind = tk; d.tagKey = key; }
    } else if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      Store.insert('feedback', {
        id: uid(), fromId: va().personId || (ppl()[0] || {}).id, toId: d.toId, kind: d.kind,
        tagKind: d.tagKind, tagKey: d.tagKey, sit: d.sit, beh: d.beh, imp: d.imp, sug: d.sug || '', at: Date.now(),
      });
      notify(t('fb.notif'), 'all');
      return bot(th, fmt('cop.fb.done', { name: CzName.first(byId(d.toId).firstName, 'acc') }),
        chipsOf([{ label: t('fb.tab'), act: 'nav', val: '#/kudos' }]));
    }
    nextFb(th);
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
    /* pololetní check = kratší flow: reflexe + progress cílů */
    if (r.type === 'semi') {
      th.state = { flow: 'semi', step: 'reflect', data: { rid: r.id, gIdx: 0 } };
      return bot(th, esc(t('cop.sm.intro')) + '<br><br>' + esc(t('cop.sm.reflect')));
    }
    th.state = { flow: 'self', step: 'q1', data: { rid: r.id, idx: 0, ratings: {} } };
    bot(th, esc(t('cop.s.intro')) + '<br><br><b>1/3</b> ' + esc(t('cop.s.q1')));
  }
  function askSemiGoal(th, r) {
    const d = th.state.data;
    const g = r.form.goalsEval[d.gIdx];
    bot(th, `<b>${d.gIdx + 1}/${r.form.goalsEval.length}</b> ${esc(g.title)} <span class="badge">${g.weight} %</span><br>${esc(t('cop.sm.progress'))}`, pctChips());
  }
  function contSemi(th, input) {
    const st = th.state, d = st.data;
    const r = Store.get('reviews', d.rid);
    if (!r) { th.state = null; return bot(th, t('cop.s.none')); }
    if (st.step === 'reflect') {
      r.form.self.summary = (input.text || '').trim();
      if (!r.form.goalsEval.length) { st.step = 'confirm'; }
      else { st.step = 'goals'; d.gIdx = 0; Store.update('reviews', r.id, { form: r.form }); return askSemiGoal(th, r); }
    }
    if (st.step === 'goals') {
      const g = r.form.goalsEval[d.gIdx];
      g.progress = Math.max(0, Math.min(100, +(input.val != null ? input.val : (norm(input.text || '').match(/\d+/) || [g.progress || 0])[0])));
      if (g.newWeight == null) g.newWeight = g.weight;
      d.gIdx++;
      Store.update('reviews', r.id, { form: r.form });
      if (d.gIdx < r.form.goalsEval.length) return askSemiGoal(th, r);
      st.step = 'confirm';
      return bot(th, esc(t('cop.sm.review')) + '<br>' + r.form.goalsEval.map(g2 => `${esc(g2.title.slice(0, 26))}: <b>${g2.progress} %</b>`).join(' · '),
        chipsOf([{ label: '✓ ' + t('common.saveSend'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
    }
    if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      Store.update('reviews', r.id, { form: r.form, status: 'self_done' });
      notify(((meP() || {}).name || '') + ' - ' + t('st.self_done'), 'manager');
      return bot(th, '✓ ' + t('cop.sm.done'), chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
    }
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
      return bot(th, esc(t('cop.s.review')) + '<br>' + items.map(it => `<b>${esc(it.label)}</b>: ${esc(ReviewLogic.scaleWord(d.ratings[it.key]))}`).join(' · '),
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
      (sr ? `<br><span style="color:var(--text-muted)">${esc(fmt('cop.e.selfWas', { r: ReviewLogic.scaleWord(sr) }))}</span>` : ''), scaleChips(sr));
  }
  function askEvalGoal(th, r) {
    const d = th.state.data;
    const g = r.form.goalsEval[d.gIdx];
    bot(th, `<b>${esc(t('cop.e.goal'))} ${d.gIdx + 1}/${r.form.goalsEval.length}:</b> ${esc(g.title)} <span class="badge">${g.weight} %</span>` +
      (g.rating ? `<br><span style="color:var(--text-muted)">${esc(fmt('cop.e.selfWas', { r: ReviewLogic.scaleWord(g.rating) }))}</span>` : ''),
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
      return bot(th, esc(t('cop.e.review')) + '<br>' + selfItems().map(it => `<b>${esc(it.label)}</b>: ${esc(ReviewLogic.scaleWord(d.ratings[it.key]))}`).join(' · ') +
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

  /* ================= V2 flows: cíle, potvrzení, rozhovor, cyklus, eNPS, 360, KPI, lidé, vzhled ================= */

  /* ---------- pomůcky ---------- */
  const pctChips = () => chipsOf([0, 25, 50, 75, 100].map(v2 => ({ label: v2 + ' %', val: String(v2) })));
  const zeroTen = () => chipsOf(Array.from({ length: 11 }, (_, i) => ({ label: String(i), val: String(i) })));
  function parseDateCz(text) {
    const n = norm(text);
    const dm = n.match(/(\d{1,2})\s*\.\s*(\d{1,2})\.?/);
    let d;
    if (/pozitri/.test(n)) d = new Date(Date.now() + 2 * DAY);
    else if (/zitra|tomorrow|morgen/.test(n)) d = new Date(Date.now() + DAY);
    else if (n.match(/za (\d+) (dni|dny|den|days?|tage)/)) d = new Date(Date.now() + (+n.match(/za (\d+)/)[1]) * DAY);
    else if (dm) { d = new Date(); d.setMonth(+dm[2] - 1, +dm[1]); if (d.getTime() < Date.now() - DAY) d.setFullYear(d.getFullYear() + 1); }
    else d = new Date(Date.now() + 3 * DAY);
    return d.toISOString().slice(0, 10);
  }
  function fuzzyPick(list, text, getLabel) {
    const n = norm(text);
    const toks = n.split(/[^a-z0-9]+/).filter(w2 => w2.length >= 3);
    let best = null, bestSc = 0;
    list.forEach(item => {
      const lab = norm(getLabel(item));
      const sc = toks.filter(tk => lab.includes(tk)).length;
      if (sc > bestSc) { best = item; bestSc = sc; }
    });
    return bestSc ? best : null;
  }

  /* ---------- cíl: přidání ---------- */
  function startGoalAdd(th, text) {
    const p = meP();
    if (!p) return bot(th, t('cop.r.noData'));
    const data = {};
    const m = String(text).match(/(?:c[ií]l|goal|ziel)\w*\s*[:\-]?\s+(.{4,})/i);
    if (m && !/(pridej|pridat|zaloz|vytvor|add|create)/i.test(m[1])) data.title = m[1].trim();
    th.state = { flow: 'goal', step: null, data };
    nextGoalAdd(th);
  }
  function nextGoalAdd(th) {
    const d = th.state.data;
    if (!d.title) { th.state.step = 'title'; return bot(th, t('cop.g.title')); }
    if (!d.area) {
      th.state.step = 'area';
      return bot(th, t('cop.g.area'), chipsOf(AREAS.map(a => ({ label: t('rev.area.' + a), val: a }))));
    }
    if (Generator.KPI_REQUIRED[d.area] && !d.kpiRef) {
      const c2 = co() || {};
      const opts = [].concat((c2.kpis || []).map(k => ({ label: k.title, val: 'company:' + k.id })),
        ((c2.teamKpis || []).filter(k => meP() && k.deptKey === meP().deptKey)).map(k => ({ label: k.title, val: 'team:' + k.id }))).slice(0, 6);
      if (opts.length) { th.state.step = 'kpi'; return bot(th, t('cop.g.kpi'), chipsOf(opts)); }
      d.kpiRef = null;
    }
    if (!d.weight) {
      th.state.step = 'weight';
      return bot(th, t('cop.g.weight'), chipsOf([20, 30, 40, 50].map(w2 => ({ label: w2 + ' %', val: String(w2) }))));
    }
    th.state = null;
    Store.insert('goals', {
      id: uid(), ownerId: va().personId, areaKey: d.area, title: d.title, desc: '',
      weight: +d.weight, progress: 0, kpiRef: d.kpiRef || null, confirmedByManager: false,
      due: '2026-12-31', type: 'personal', period: Generator.CURRENT_PERIOD,
    });
    bot(th, '✓ ' + fmt('cop.g.done', { title: d.title, area: t('rev.area.' + d.area) }),
      chipsOf([{ label: t('nav.goals'), act: 'nav', val: '#/goals' }]));
  }
  function contGoalAdd(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'title') d.title = (input.text || '').trim();
    else if (st.step === 'area') d.area = AREAS.includes(input.val) ? input.val : 'growth';
    else if (st.step === 'kpi') d.kpiRef = input.val ? { type: input.val.split(':')[0], id: input.val.split(':')[1] } : null;
    else if (st.step === 'weight') d.weight = +input.val || 30;
    nextGoalAdd(th);
  }

  /* ---------- cíl: progress ---------- */
  function myGoals() {
    const v = va();
    let gs = Store.list('goals').filter(g => g.type === 'personal' && g.period === Generator.CURRENT_PERIOD);
    if (v.role !== 'hr') gs = gs.filter(g => g.ownerId === v.personId);
    return gs;
  }
  function startGoalProg(th, text) {
    const pctM = norm(text).match(/(\d{1,3})\s*%?/);
    const pct = pctM ? Math.max(0, Math.min(100, +pctM[1])) : null;
    const g = fuzzyPick(myGoals(), text, x => x.title);
    if (g && pct != null) return applyGoalProg(th, g, pct);
    const data = { pct };
    th.state = { flow: 'goalp', step: 'which', data };
    const pool = myGoals().slice(0, 6);
    if (!pool.length) { th.state = null; return bot(th, t('cop.r.noData')); }
    bot(th, t('cop.g.which'), chipsOf(pool.map(x => ({ label: x.title.slice(0, 36) + ' (' + x.progress + ' %)', val: x.id }))));
  }
  function applyGoalProg(th, g, pct) {
    /* progress se nemění bez odůvodnění - vyžádej komentář (auditní stopa v progressLog) */
    th.state = { flow: 'goalp', step: 'note', data: { gid: g.id, pct } };
    bot(th, fmt('cop.g.note', { title: g.title, pct }));
  }
  function finishGoalProg(th, g, pct, note) {
    th.state = null;
    if (window.GoalCheck) GoalCheck.applyProgress(g.id, pct, note, va().personId || null);
    else Store.update('goals', g.id, { progress: pct });
    bot(th, '✓ ' + fmt('cop.g.prog', { title: g.title, pct }) +
      `<div class="brow"><span>${esc(g.title.slice(0, 30))}</span><div class="progressbar"><div style="width:${pct}%"></div></div><b>${pct} %</b></div>`,
      chipsOf([{ label: t('nav.goals'), act: 'nav', val: '#/goals' }]));
  }
  function contGoalProg(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'which') {
      d.gid = input.val;
      const g = Store.get('goals', d.gid);
      if (!g) { th.state = null; return bot(th, t('cop.r.noData')); }
      if (d.pct != null) return applyGoalProg(th, g, d.pct);
      st.step = 'pct';
      return bot(th, fmt('cop.g.pct', { title: g.title }), pctChips());
    }
    if (st.step === 'pct') {
      const g = Store.get('goals', d.gid);
      const pct = Math.max(0, Math.min(100, +(input.val != null ? input.val : (norm(input.text || '').match(/\d+/) || [g ? g.progress : 0])[0])));
      if (g) return applyGoalProg(th, g, pct);
      th.state = null;
      return;
    }
    if (st.step === 'note') {
      const note = (input.text || input.label || '').trim();
      if (!note) return bot(th, t('gc.noteReq'));
      const g = Store.get('goals', d.gid);
      if (!g) { th.state = null; return bot(th, t('cop.r.noData')); }
      return finishGoalProg(th, g, d.pct, note);
    }
  }

  /* ---------- potvrzení hodnocení (zaměstnanec) ---------- */
  function startConfirm(th) {
    const p = meP();
    const r = p && revs().find(x => x.subjectId === p.id && x.status === 'awaiting_employee_confirmation');
    if (!r) return bot(th, t('cop.cf.none'), chipsOf([{ label: t('nav.myreviews'), act: 'nav', val: '#/myreviews' }]));
    const sc = ReviewLogic.computeScore(r.form);
    const b = sc != null ? ReviewLogic.band(sc) : null;
    th.state = { flow: 'confirm', step: 'comment', data: { rid: r.id } };
    bot(th, esc(t('cop.cf.intro')) +
      (sc != null ? `<br>${esc(t('rev.score'))}: <b>${sc.toFixed(2)}</b> <span class="badge ${b.cls}">${esc(t('band.' + b.key))}</span>` : '') +
      (r.form.mgr.summary ? `<br><span style="color:var(--text-muted)">„${esc(r.form.mgr.summary.slice(0, 160))}“</span>` : '') +
      '<br><br>' + esc(t('cop.cf.comment')), chipsOf([{ label: t('cop.ch.skip'), val: '' }]));
  }
  function contConfirm(th, input) {
    const st = th.state, d = st.data;
    const r = Store.get('reviews', d.rid);
    if (!r) { th.state = null; return bot(th, t('cop.cf.none')); }
    if (st.step === 'comment') {
      d.comment = input.val != null ? input.val : (input.text || '').trim();
      st.step = 'decide';
      return bot(th, t('cop.cf.decide'), chipsOf([
        { label: '✓ ' + t('rev.agree'), val: 'agree' },
        { label: t('rev.disagree'), val: 'disagree' }]));
    }
    if (st.step === 'decide') {
      th.state = null;
      const subj = byId(r.subjectId);
      r.form.employeeComment = d.comment || '';
      if (input.val === 'agree') {
        r.form.versions = r.form.versions || [];
        r.form.versions.push({ label: 'v3_confirmed', at: Date.now() });
        if (r.type === 'semi') ReviewLogic.applySemiChanges(r); else ReviewLogic.materializeNewGoals(r);
        Store.update('reviews', r.id, { form: r.form, status: 'confirmed' });
        notify(((subj || {}).name || '') + ' - ' + t('st.confirmed'), 'all');
        return bot(th, '🎉 ' + t('cop.cf.agreed'), chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
      }
      Store.update('reviews', r.id, { form: r.form, status: 'conversation_done' });
      notify(((subj || {}).name || '') + ' - ' + t('rev.disagree'), 'manager');
      return bot(th, t('cop.cf.disagreed'), chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
    }
  }

  /* ---------- hodnoticí rozhovor (manažer) ---------- */
  function startConv(th, text) {
    const v = va();
    if (v.role === 'employee') return bot(th, t('cop.e.denied'));
    const done = RX.convDone.test(norm(text));
    let cands = revs().filter(r => r.period === Generator.CURRENT_PERIOD &&
      (done ? ['conversation_scheduled', 'manager_done'] : ['manager_done', 'conversation_scheduled']).includes(r.status));
    if (v.role === 'manager') cands = cands.filter(r => r.evaluatorId === v.personId);
    if (!cands.length) return bot(th, t('cop.cv.none'), chipsOf([{ label: t('nav.team'), act: 'nav', val: '#/team' }]));
    const m = matchPeople(text);
    const hit = m.length ? cands.filter(r => m.some(p => p.id === r.subjectId)) : [];
    const date = parseDateCz(text);
    if (hit.length === 1) return applyConv(th, hit[0], done, date);
    th.state = { flow: 'conv', step: 'who', data: { done, date } };
    bot(th, t(done ? 'cop.cv.whoDone' : 'cop.cv.who'), peopleChips(cands.map(r => byId(r.subjectId)).filter(Boolean)));
  }
  function applyConv(th, r, done, date) {
    th.state = null;
    const subj = byId(r.subjectId);
    if (done) {
      Store.update('reviews', r.id, { status: 'conversation_done' });
      return bot(th, '✓ ' + fmt('cop.cv.done', { name: CzName.full((subj || {}).name || '', 'ins') }),
        chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
    }
    r.form.conversationDate = date;
    Store.update('reviews', r.id, { form: r.form, status: 'conversation_scheduled' });
    notify(((subj || {}).name || '') + ' - ' + t('st.conversation_scheduled'), 'employee');
    bot(th, '📅 ' + fmt('cop.cv.set', { name: CzName.full((subj || {}).name || '', 'ins'), date: UI.fmtDate(new Date(date).getTime()) }),
      chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/review/' + r.id }]));
  }
  function contConv(th, input) {
    const d = th.state.data;
    const r = input.val && revs().find(x => x.subjectId === input.val && x.period === Generator.CURRENT_PERIOD &&
      ['manager_done', 'conversation_scheduled'].includes(x.status));
    if (!r) { th.state = null; return bot(th, t('cop.cv.none')); }
    applyConv(th, r, d.done, d.date);
  }

  /* ---------- nový cyklus (HR) ---------- */
  function startCycle(th) {
    if (va().role !== 'hr') return bot(th, t('cop.hr.denied'));
    th.state = { flow: 'cycle', step: 'type', data: {} };
    const semiOn = ((co() || {}).cycleConfig || { semiEnabled: true }).semiEnabled;
    const opts = [{ label: t('misc.annual'), val: 'annual' }];
    if (semiOn) opts.push({ label: t('misc.semi'), val: 'semi' });
    opts.push({ label: t('misc.probation'), val: 'probation' });
    bot(th, t('cop.cy.type'), chipsOf(opts));
  }
  function cycleCandidates(type) {
    const cands = ppl().filter(p => p.managerId && !revs().some(r => r.subjectId === p.id && r.period === Generator.CURRENT_PERIOD && !['confirmed', 'closed_by_hr', 'cancelled'].includes(r.status)));
    return type === 'probation' ? cands.filter(p => p.hiredMonthsAgo < 4) : cands;
  }
  function contCycle(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'type') {
      d.type = ['annual', 'semi', 'probation'].includes(input.val) ? input.val : 'annual';
      const n = cycleCandidates(d.type).length;
      if (!n) { th.state = null; return bot(th, t('cop.cy.nobody')); }
      st.step = 'confirm';
      return bot(th, fmt('cop.cy.confirm', { n, type: t('misc.' + d.type), period: Generator.CURRENT_PERIOD }),
        chipsOf([{ label: '✓ ' + t('hr.launch'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
    }
    if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      const now = Date.now();
      const targets = cycleCandidates(d.type);
      targets.forEach(p => {
        const form = Generator.emptyForm();
        if (d.type !== 'probation') {
          form.goalsEval = Store.list('goals').filter(g => g.ownerId === p.id && g.type === 'personal')
            .map(g => ({ goalId: g.id, title: g.title, areaKey: g.areaKey, weight: g.weight, kpiRef: g.kpiRef, outcome: '', rating: null, mgrConfirmed: false }));
        }
        Store.insert('reviews', { id: uid(), subjectId: p.id, evaluatorId: p.managerId, type: d.type, period: Generator.CURRENT_PERIOD, status: 'pending_self', startedAt: now, deadline: now + 30 * DAY, form });
      });
      notify(t('hr.newCycle') + ' - ' + targets.length + '× ' + t('st.pending_self'), 'all');
      return bot(th, '🚀 ' + fmt('cop.cy.done', { n: targets.length }), chipsOf([{ label: t('nav.hr'), act: 'nav', val: '#/hr' }]));
    }
  }

  /* ---------- připomenutí (HR/manažer) ---------- */
  function startRemind(th, text) {
    const v = va();
    if (v.role === 'employee') return bot(th, t('cop.e.denied'));
    let cur = revs().filter(r => r.period === Generator.CURRENT_PERIOD && !['confirmed', 'closed_by_hr', 'cancelled'].includes(r.status));
    if (v.role === 'manager') cur = cur.filter(r => r.evaluatorId === v.personId);
    const m = matchPeople(text);
    let targets;
    if (m.length) targets = cur.filter(r => m.some(p => p.id === r.subjectId));
    else targets = cur.filter(r => ['risk', 'blocked'].includes(ReviewLogic.risk(r)));
    if (!targets.length) return bot(th, t('cop.rm.none'));
    /* připomínka jde tomu, kdo je na tahu (hodnocený vs. hodnotitel), ne plošně */
    const names = [];
    targets.slice(0, 20).forEach(r => {
      const isEval = ReviewLogic.nextActor(r.status) === 'evaluator';
      const tgt = byId(isEval ? r.evaluatorId : r.subjectId);
      if (tgt) names.push(tgt.firstName);
      notify(t('act.remindMsg').split('{name}').join(tgt ? tgt.name : ''), isEval ? 'manager' : 'employee');
    });
    bot(th, '📨 ' + fmt('cop.rm.done', { n: targets.length, names: [...new Set(names)].slice(0, 5).join(', ') }));
  }

  /* ---------- eNPS odpověď ---------- */
  function startNpsFill(th) {
    const p = meP();
    const w = p && window.NPS ? NPS.pendingWaveFor(p.id) : null;
    if (!w) return bot(th, t('cop.np.none'));
    th.state = { flow: 'nps', step: 'main', data: { wid: w.id, dims: {} } };
    bot(th, esc(t('cop.np.anon')) + '<br><br><b>' + esc(t('nps.q.main')) + '</b>', zeroTen());
  }
  function contNpsFill(th, input) {
    const st = th.state, d = st.data;
    const w = Store.get('npsWaves', d.wid);
    if (!w) { th.state = null; return bot(th, t('cop.np.none')); }
    const val10 = () => Math.max(0, Math.min(10, +(input.val != null ? input.val : (norm(input.text || '').match(/\d+/) || [5])[0])));
    if (st.step === 'main') { d.nps = val10(); st.step = 'work'; return bot(th, '<b>' + esc(t('nps.q.work')) + '</b>', zeroTen()); }
    if (st.step === 'work') { d.dims.work = val10(); st.step = 'growth'; return bot(th, '<b>' + esc(t('nps.q.growth')) + '</b>', zeroTen()); }
    if (st.step === 'growth') { d.dims.growth = val10(); st.step = 'support'; return bot(th, '<b>' + esc(t('nps.q.support')) + '</b>', zeroTen()); }
    if (st.step === 'support') {
      d.dims.support = val10(); st.step = 'comment';
      return bot(th, t('nps.comment') + ' (' + t('cop.ch.skip').toLowerCase() + '?)', chipsOf([{ label: t('cop.ch.skip'), val: '' }]));
    }
    if (st.step === 'comment') {
      th.state = null;
      const p = meP();
      /* stejný tvar jako NPSViews.respondModal - BEZ personId */
      w.responses.push({
        id: uid(), deptKey: p.deptKey, teamId: p.managerId,
        nps: d.nps, dims: d.dims, theme: null,
        comment: (input.val != null ? input.val : (input.text || '')).trim(), at: Date.now(),
      });
      w.respondedIds = w.respondedIds || [];
      w.respondedIds.push(p.id);
      Store.update('npsWaves', w.id, {});
      return bot(th, '💚 ' + t('nps.thanks') + ' ' + t('cop.np.saved'));
    }
  }

  /* ---------- 360: vyplnění (behaviorální výroky + frekvenční škála slovy) ---------- */
  const freqChips = () => chipsOf(
    Feedback360.FREQ.map(fq => ({ label: t('f360.freq.' + fq.fk), val: fq.v }))
      .concat([{ label: t('f360.freq.na'), val: 'NA' }]));
  function startF360Fill(th) {
    const p = meP();
    const pend = p && window.Feedback360 ? Feedback360.pendingFor(p.id) : [];
    if (!pend.length) return bot(th, t('cop.f3.none'));
    const f = pend[0];
    th.state = { flow: 'f360f', step: 'rate', data: { fid: f.id, idx: 0, answers: {} } };
    bot(th, fmt('cop.f3.intro', { name: CzName.full((byId(f.subjectId) || {}).name || '', 'acc') }) +
      '<br><span style="color:var(--text-muted)">' + esc(t('f360.respIntro')) + '</span>');
    askF360Item(th);
  }
  function askF360Item(th) {
    const d = th.state.data;
    const list = Feedback360.items();
    const it = list[d.idx];
    bot(th, `<b>${d.idx + 1}/${list.length}</b> ${esc(it.text)}`, freqChips());
  }
  function contF360Fill(th, input) {
    const st = th.state, d = st.data;
    const f = Store.get('feedback360', d.fid);
    if (!f) { th.state = null; return bot(th, t('cop.f3.none')); }
    const list = Feedback360.items();
    if (st.step === 'rate') {
      const v = (SCALE.includes(input.val) || input.val === 'NA') ? input.val : 'KV';
      d.answers[list[d.idx].id] = v;
      d.idx++;
      if (d.idx < list.length) return askF360Item(th);
      st.step = 'strengths';
      return bot(th, t('f360.qStrengths'));
    }
    if (st.step === 'strengths') { d.strengths = (input.text || '').trim(); st.step = 'growth'; return bot(th, t('f360.qGrowth')); }
    if (st.step === 'growth') {
      th.state = null;
      const resp = f.respondents.find(r => r.personId === va().personId);
      if (resp) {
        resp.items = Object.assign({}, d.answers);
        resp.ratings = Feedback360.deriveFromItems(d.answers, list);
        resp.strengths = d.strengths; resp.growth = (input.text || '').trim(); resp.status = 'done';
        if (f.respondents.every(r => r.status === 'done')) f.status = 'closed';
        Store.update('feedback360', f.id, {});
      }
      return bot(th, '✓ ' + t('cop.f3.saved'));
    }
  }

  /* ---------- 360: vyžádání (manažer/HR) ---------- */
  function startF360Req(th, text) {
    const v = va();
    if (v.role === 'employee') return bot(th, t('cop.e.denied'));
    const m = matchPeople(text).filter(p => p.id !== v.personId);
    if (m.length !== 1) {
      th.state = { flow: 'f360r', step: 'who', data: {} };
      const pool = v.role === 'manager' ? teamOf(v.personId) : ppl();
      return bot(th, t('cop.f3.who'), peopleChips(pool));
    }
    proposeF360(th, m[0]);
  }
  function proposeF360(th, subject) {
    /* automatický návrh respondentů: manažer + kolegové z oddělení + podřízení (3-6) */
    const cands = [];
    if (subject.managerId) cands.push(byId(subject.managerId));
    ppl().filter(p => p.managerId === subject.id).slice(0, 2).forEach(p => cands.push(p));
    ppl().filter(p => p.deptKey === subject.deptKey && p.id !== subject.id && !cands.some(c2 => c2 && c2.id === p.id))
      .slice(0, 5).forEach(p => cands.push(p));
    const picked = cands.filter(Boolean).filter(p => p.id !== va().personId).slice(0, 5);
    if (picked.length < 3) { th.state = null; return bot(th, t('cop.f3.few')); }
    th.state = { flow: 'f360r', step: 'confirm', data: { sid: subject.id, resp: picked.map(p => p.id) } };
    bot(th, fmt('cop.f3.propose', { name: CzName.full(subject.name, 'acc'), names: picked.map(p => p.firstName + ' ' + p.lastName).join(', ') }),
      chipsOf([{ label: '✓ ' + t('common.send'), val: 'ok' }, { label: t('common.cancel'), val: 'cancel' }]));
  }
  function contF360Req(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'who') {
      const subject = byId(input.val);
      if (!subject) { th.state = null; return bot(th, t('cop.cancelled')); }
      return proposeF360(th, subject);
    }
    if (st.step === 'confirm') {
      th.state = null;
      if (input.val !== 'ok') return bot(th, t('cop.cancelled'));
      const subject = byId(d.sid);
      const groupOf2 = p => p.managerId === d.sid ? 'report' : p.deptKey === subject.deptKey ? 'peer' : 'internal';
      Store.insert('feedback360', {
        id: uid(), subjectId: d.sid, requestedById: va().personId || null,
        period: Generator.CURRENT_PERIOD, deadline: Date.now() + 10 * DAY, status: 'collecting',
        respondents: d.resp.map(pid => ({ personId: pid, group: groupOf2(byId(pid)), status: 'invited', ratings: {}, strengths: '', growth: '' })),
      });
      notify(t('f360.notifInvite') + ' - ' + subject.name, 'all');
      return bot(th, '✓ ' + fmt('cop.f3.sent', { name: CzName.full(subject.name, 'acc'), n: d.resp.length }));
    }
  }

  /* ---------- KPI: nastavení (HR) + report ---------- */
  function startKpiSet(th, text) {
    if (va().role !== 'hr') return bot(th, t('cop.hr.denied'));
    const c2 = co();
    if (!c2 || !(c2.kpis || []).length) return bot(th, t('cop.r.noData'));
    /* cílová hodnota = POSLEDNÍ „na X" (název KPI může sám obsahovat čísla) */
    const naAll = [...norm(text).matchAll(/\bna\s+(\d{1,3})/g)];
    const pctM = naAll.length ? naAll[naAll.length - 1] : norm(text).match(/(\d{1,3})\s*%\s*$/);
    const pct = pctM ? Math.max(0, Math.min(100, +pctM[1])) : null;
    const k = fuzzyPick(c2.kpis, text, x => x.title);
    if (k && pct != null) return applyKpi(th, k, pct);
    th.state = { flow: 'kpi', step: 'which', data: { pct } };
    bot(th, t('cop.kp.which'), chipsOf(c2.kpis.slice(0, 6).map(x => ({ label: x.title.slice(0, 36), val: x.id }))));
  }
  function applyKpi(th, k, pct) {
    th.state = null;
    const c2 = co();
    const item = c2.kpis.find(x => x.id === k.id);
    item.current = pct;
    Store.setCompany(c2);
    bot(th, '✓ ' + fmt('cop.kp.done', { title: item.title, pct }) + bar(pct, item.title, pct + ' %'),
      chipsOf([{ label: t('nav.hr'), act: 'nav', val: '#/hr' }]));
  }
  function contKpiSet(th, input) {
    const st = th.state, d = st.data;
    const c2 = co();
    if (st.step === 'which') {
      const k = c2.kpis.find(x => x.id === input.val);
      if (!k) { th.state = null; return bot(th, t('cop.cancelled')); }
      if (d.pct != null) return applyKpi(th, k, d.pct);
      d.kid = k.id; st.step = 'pct';
      return bot(th, fmt('cop.kp.pct', { title: k.title }), pctChips());
    }
    if (st.step === 'pct') {
      const k = c2.kpis.find(x => x.id === d.kid);
      const pct = Math.max(0, Math.min(100, +(input.val != null ? input.val : (norm(input.text || '').match(/\d+/) || [0])[0])));
      if (k) return applyKpi(th, k, pct);
      th.state = null;
    }
  }
  function rKpi(th) {
    const c2 = co();
    if (!c2 || !(c2.kpis || []).length) return bot(th, t('cop.r.noData'));
    const p = meP();
    const teamK = (c2.teamKpis || []).filter(k => va().role === 'hr' || (p && k.deptKey === p.deptKey));
    let html = `<b>${esc(t('goals.company'))}</b>` + c2.kpis.map(k => bar(k.current, k.title, k.current + ' %')).join('');
    if (teamK.length) html += `<br><b>${esc(t('hr.teamKpis'))}</b>` + teamK.map(k => bar(k.current, k.dept + ' · ' + k.title, k.current + ' %')).join('');
    bot(th, html, chipsOf([{ label: t('nav.goals'), act: 'nav', val: '#/goals' }].concat(va().role === 'hr' ? [{ label: t('cop.kp.edit'), act: 'ask', val: t('cop.ask.kpiSet') }] : [])));
  }

  /* ---------- přidání člověka (manažer/HR) ---------- */
  function startPersonAdd(th, text) {
    const v = va();
    if (v.role === 'employee') return bot(th, t('cop.e.denied'));
    const data = {};
    const m = String(text).match(/(?:cloveka|člověka|zamestnance|zaměstnance|osobu|kolegu|person|mitarbeiter)\w*\s+([A-ZÁ-Ž][a-zá-ž]+\s+[A-ZÁ-Ž][a-zá-ž]+)/u);
    if (m) data.name = m[1].trim();
    th.state = { flow: 'person', step: null, data };
    nextPersonAdd(th);
  }
  function nextPersonAdd(th) {
    const d = th.state.data;
    const c2 = co();
    if (!d.name) { th.state.step = 'name'; return bot(th, t('cop.pa.name')); }
    if (!d.deptKey) {
      th.state.step = 'dept';
      const depts = (c2 && c2.departments && c2.departments.length ? c2.departments : [{ key: 'general', name: 'Obecné' }]).slice(0, 8);
      return bot(th, fmt('cop.pa.dept', { name: d.name }), chipsOf(depts.map(x => ({ label: x.name, val: x.key }))));
    }
    if (!d.managerId) {
      th.state.step = 'mgr';
      const heads = ppl().filter(p => ppl().some(x => x.managerId === p.id) || p.isHead).slice(0, 6);
      return bot(th, t('cop.pa.mgr'), chipsOf(heads.map(p => ({ label: p.name, val: p.id })).concat([{ label: '—', val: '' }])));
    }
    th.state = null;
    const parts = d.name.split(/\s+/);
    const dept = ((c2 && c2.departments) || []).find(x => x.key === d.deptKey);
    Store.insert('people', {
      id: uid(), firstName: parts[0], lastName: parts.slice(1).join(' ') || '',
      name: d.name, initials: (parts[0][0] || '?') + ((parts[1] || ' ')[0] || ''),
      hue: (d.name.length * 47) % 360, role: '-', deptKey: d.deptKey, dept: dept ? dept.name : d.deptKey,
      managerId: d.managerId === '' ? null : d.managerId, isHead: false,
      email: norm(d.name).replace(/\s+/g, '.') + '@firma.cz', hiredMonthsAgo: 0, female: /[aá]$/.test(parts[0]),
    });
    bot(th, '✓ ' + fmt('cop.pa.done', { name: d.name }), chipsOf([{ label: t('nav.people'), act: 'nav', val: '#/people' }]));
  }
  function contPersonAdd(th, input) {
    const st = th.state, d = st.data;
    if (st.step === 'name') d.name = (input.text || '').trim();
    else if (st.step === 'dept') d.deptKey = input.val || 'general';
    else if (st.step === 'mgr') d.managerId = input.val != null ? input.val : '';
    nextPersonAdd(th);
  }

  /* ---------- vzhled + jazyk ---------- */
  function startTheme(th, text) {
    const n = norm(text);
    const map = { brand: 'brand', korporat: 'corp', corp: 'corp', glass: 'glass', genz: 'genz', 'gen z': 'genz' };
    const hit = Object.keys(map).find(k => n.includes(k));
    if (!hit) {
      th.state = { flow: 'theme', step: 'pick', data: {} };
      return bot(th, t('cop.th.pick'), chipsOf(['brand', 'corp', 'glass', 'genz'].map(k => ({ label: t('ob.theme.' + k), val: k }))));
    }
    applyTheme(th, map[hit]);
  }
  function applyTheme(th, key) {
    th.state = null;
    Store.patchSettings({ theme: key });
    document.documentElement.dataset.theme = key;
    bot(th, '🎨 ' + fmt('cop.th.done', { name: t('ob.theme.' + key) }));
  }
  function contTheme(th, input) { applyTheme(th, ['brand', 'corp', 'glass', 'genz'].includes(input.val) ? input.val : 'brand'); }
  function startLang(th, text) {
    const n = norm(text);
    const target = /english|anglict|englisch/.test(n) ? 'en' : /deutsch|nemcin|german/.test(n) ? 'de' : /cestin|czech|tschech/.test(n) ? 'cs' : null;
    if (!target) {
      th.state = { flow: 'langf', step: 'pick', data: {} };
      return bot(th, t('cop.ln.pick'), chipsOf([{ label: 'Čeština', val: 'cs' }, { label: 'English', val: 'en' }, { label: 'Deutsch', val: 'de' }]));
    }
    applyLang(th, target);
  }
  function applyLang(th, loc) {
    th.state = null;
    I18N.setLocale(loc);
    Store.patchSettings({ locale: loc });
    bot(th, '🌐 ' + t('cop.ln.done'));
  }
  function contLang(th, input) { applyLang(th, ['cs', 'en', 'de'].includes(input.val) ? input.val : 'cs'); }

  /* ---------- V2 reporty ---------- */
  function rPerson(th, text) {
    const m = matchPeople(text);
    if (!m.length) return bot(th, t('cop.r.noData'));
    if (m.length > 1) {
      /* jmenovci: v textu vypíšeme i roli a útvar, aby šlo poznat, kdo je kdo */
      const list = m.slice(0, 5).map(p => `<li><b>${esc(p.name)}</b> · ${esc(p.role)} · ${esc(p.dept)}</li>`).join('');
      return bot(th, `${esc(t('cop.k.whoAmbig'))}<ul>${list}</ul>`,
        chipsOf(m.slice(0, 5).map(p => ({ label: p.name + ' (' + p.dept + ')', act: 'ask', val: t('cop.ask.whois') + ' ' + p.name }))));
    }
    const p = m[0];
    const v = va();
    const mgr = p.managerId ? byId(p.managerId) : null;
    let html = `<b>${esc(p.name)}</b> · ${esc(p.role)}<br>${esc(t('people.dept'))}: <b>${esc(p.dept)}</b>` +
      (mgr ? ` · ${esc(t('people.manager'))}: <b>${esc(mgr.name)}</b>` : '');
    const canDetail = v.role === 'hr' || (v.role === 'manager' && p.managerId === v.personId);
    if (canDetail) {
      const r = revs().find(x => x.subjectId === p.id && x.period === Generator.CURRENT_PERIOD);
      if (r) html += `<br>${esc(t('rev.status'))}: <b>${esc(t('st.' + r.status))}</b> (${ReviewLogic.daysLeft(r)} d)`;
      const cis = Store.list('checkins').filter(c2 => c2.employeeId === p.id && c2.at > Date.now() - 90 * DAY);
      const vs = cis.map(c2 => MOOD_VAL[c2.mood]).filter(Boolean);
      if (vs.length) html += ` · ${esc(t('cop.r.mood'))}: <b>${(vs.reduce((a2, b2) => a2 + b2, 0) / vs.length).toFixed(1)}</b>/4`;
      const gs = Store.list('goals').filter(g => g.ownerId === p.id && g.type === 'personal' && g.period === Generator.CURRENT_PERIOD);
      if (gs.length) html += `<br>${esc(t('cop.r.goals'))}: Ø <b>${Math.round(gs.reduce((s2, g) => s2 + g.progress, 0) / gs.length)} %</b> (${gs.length})`;
      const kd = Store.list('kudos').filter(k => k.toId === p.id).length;
      html += ` · ${esc(t('nav.kudos'))}: <b>${kd}×</b>`;
    }
    bot(th, html, chipsOf(canDetail
      ? [{ label: t('mt.profile'), act: 'nav', val: '#/people' }, { label: t('cop.ch.kudos'), act: 'ask', val: t('cop.ask.kudos') + ' ' + p.firstName }]
      : [{ label: t('nav.org'), act: 'nav', val: '#/org' }]));
  }
  function rTeam(th) {
    const v = va();
    if (v.role === 'employee') return bot(th, t('cop.e.denied'));
    const team = v.role === 'manager' ? teamOf(v.personId) : ppl().filter(p => p.managerId);
    if (!team.length) return bot(th, t('cop.r.noData'));
    const ids = new Set(team.map(p => p.id));
    const cur = revs().filter(r => r.period === Generator.CURRENT_PERIOD && ids.has(r.subjectId));
    const done = cur.filter(r => ['confirmed', 'closed_by_hr'].includes(r.status)).length;
    const cis = Store.list('checkins').filter(c2 => ids.has(c2.employeeId) && c2.at > Date.now() - 90 * DAY);
    const vs = cis.map(c2 => MOOD_VAL[c2.mood]).filter(Boolean);
    const gs = Store.list('goals').filter(g => ids.has(g.ownerId) && g.type === 'personal' && g.period === Generator.CURRENT_PERIOD);
    const st = staleList();
    let html = `<b>${esc(t('cop.tm.title'))}</b> (${team.length} ${esc(t('ob.people'))})` +
      bar(cur.length ? done / cur.length * 100 : 0, t('hr.completion'), done + '/' + cur.length) +
      (gs.length ? bar(gs.reduce((s2, g) => s2 + g.progress, 0) / gs.length, t('cop.r.goals'), Math.round(gs.reduce((s2, g) => s2 + g.progress, 0) / gs.length) + ' %') : '') +
      (vs.length ? `<br>${esc(t('ci.avgMood'))}: <b>${(vs.reduce((a2, b2) => a2 + b2, 0) / vs.length).toFixed(1)}</b>/4 (${cis.length}× 1:1)` : '');
    if (st.length) html += `<br>⚠ ${esc(fmt('cop.rec.stale', { n: st.length, names: st.slice(0, 3).map(p => p.firstName).join(', ') }))}`;
    bot(th, html, chipsOf([{ label: v.role === 'manager' ? t('nav.myteam') : t('nav.hr'), act: 'nav', val: v.role === 'manager' ? '#/myteam' : '#/hr' },
      { label: t('cop.ch.checkin'), act: 'ask', val: t('cop.ask.checkin') }]));
  }
  function rNotif(th) {
    const list = Store.list('notifications').slice(-6).reverse();
    if (!list.length) return bot(th, t('ntf.empty'));
    bot(th, `<b>${esc(t('ntf.title'))}</b><ul>` + list.map(x => `<li>${esc(x.text)} <small style="color:var(--text-muted)">${UI.fmtDate(x.at)}</small></li>`).join('') + '</ul>');
    Store.list('notifications').forEach(x => Store.update('notifications', x.id, { read: true }));
  }
  function rScale(th) {
    bot(th, `<b>${esc(t('help.scaleTitle'))}</b><ul>` +
      ReviewLogic.SCALE_DEF.map(sd => `<li><b>${esc(ReviewLogic.scaleWord(sd.k))}</b> - ${esc(ReviewLogic.scaleLabel(sd.k))}</li>`).join('') + '</ul>' +
      `<b>${esc(t('hr.compBands'))}:</b> ` + ['top', 'std', 'dev', 'risk'].map(k => esc(t('band.' + k))).join(' · '),
      chipsOf([{ label: t('nav.help'), act: 'nav', val: '#/help' }]));
  }
  function rTalent(th) {
    const v = va();
    if (v.role === 'employee') return bot(th, '🔒 ' + t('cop.tl.denied'));
    const scope = v.role === 'manager' ? teamOf(v.personId) : ppl().filter(p => p.managerId);
    const entries = scope.map(p => ({ p, e: TalentLogic.entryOf(p) })).filter(x => x.e && x.e.row && x.e.col);
    if (!entries.length) return bot(th, t('cop.r.noData'), chipsOf([{ label: v.role === 'hr' ? t('nav.talent') : t('nav.myteam'), act: 'nav', val: v.role === 'hr' ? '#/talent' : '#/myteam' }]));
    const stars = entries.filter(x => x.e.row === 3 && x.e.col === 3).length;
    const risky = entries.filter(x => x.e.row === 1 && x.e.col === 1).length;
    /* retenční riziko: vysoký potenciál + vysoké riziko odchodu (z posledního hodnocení) */
    const attr = scope.filter(p => {
      const r = revs().filter(x => x.subjectId === p.id && x.form.mgr.talent && x.form.mgr.talent.attrition).slice(-1)[0];
      return r && r.form.mgr.talent.attrition === 'high' && r.form.mgr.talent.potential === 'high';
    });
    let html = `<b>${esc(t('cop.tl.title'))}</b> (${entries.length}/${scope.length})` +
      `<br>⭐ ${esc(t('cop.tl.stars'))}: <b>${stars}</b> · ⚠ ${esc(t('cop.tl.risk'))}: <b>${risky}</b>` +
      (attr.length ? `<br>🔥 ${esc(fmt('cop.tl.attr', { n: attr.length, names: attr.slice(0, 3).map(p => p.firstName).join(', ') }))}` : '');
    if (v.role === 'hr' && window.SuccLogic) {
      const kps = Store.list('keyPositions').filter(SuccLogic.kpIsKey);
      const unc = kps.filter(kp => !(kp.successors || []).length);
      if (kps.length) html += `<br>🎯 ${esc(fmt('cop.tl.kp', { n: kps.length, unc: unc.length }))}`;
    }
    html += `<br><small style="color:var(--text-muted)">🔒 ${esc(t('cop.tl.privacy'))}</small>`;
    bot(th, html, chipsOf([{ label: v.role === 'hr' ? t('nav.talent') : t('nav.myteam'), act: 'nav', val: v.role === 'hr' ? '#/talent' : '#/myteam' }]));
  }
  function rF360(th, text) {
    const v = va();
    if (v.role === 'employee') return bot(th, '🔒 ' + t('cop.tl.denied'));
    const m = matchPeople(text);
    let list = Store.list('feedback360').filter(f => f.status === 'closed');
    if (v.role === 'manager') { const ids = new Set(teamOf(v.personId).map(p => p.id)); list = list.filter(f => ids.has(f.subjectId)); }
    if (m.length) list = list.filter(f => m.some(p => p.id === f.subjectId));
    const f = list.slice(-1)[0];
    if (!f) return bot(th, t('cop.f3.noneClosed'));
    const agg = Feedback360.aggregate(f);
    if (!agg) return bot(th, t('cop.r.anon'));
    const subj = byId(f.subjectId);
    bot(th, `<b>360°</b> · ${esc((subj || {}).name || '')} (${agg.n}×)<br>` +
      Object.entries(agg.ratings).map(([k, r2]) => `${esc(t('rev.area.' + k) !== 'rev.area.' + k ? t('rev.area.' + k) : k)}: <b>${r2 ? esc(ReviewLogic.scaleWord(r2.label)) : '-'}</b>`).join(' · ') +
      (agg.strengths.length ? `<br><b>+</b> ${esc(agg.strengths[0])}` : ''),
      chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: '#/people' }]));
  }
  function rHowto(th, text) {
    const n = norm(text);
    const topics = [
      ['hodnocen|review', 'cop.h.review', '#/myreviews'], ['alignment|kaskad', 'cop.h.align', '#/goals'],
      ['cil|goal', 'cop.h.goals', '#/goals'],
      ['kudos|uznani|pochval', 'cop.h.kudos', '#/kudos'], ['konstruktivn|vazb', 'cop.h.fb', '#/kudos'],
      ['1 ?: ?1|check', 'cop.h.checkin', '#/checkins'],
      ['nps|puls', 'cop.h.nps', '#/home'], ['360', 'cop.h.f360', '#/people'],
      ['cyklus|cycle', 'cop.h.cycle', '#/hr'], ['copilot|vypn|zapn', 'cop.h.copilot', '#/settings'],
    ];
    /* primární zdroj = stejná knowledge base jako sekce Nápověda (HelpKB) */
    const kb = window.HelpKB ? HelpKB.answer(text) : null;
    if (kb) {
      const body = (kb.items && kb.items.length ? kb.items : [kb.text]).map(x => `<li>${esc(x)}</li>`).join('');
      return bot(th, `<b>${esc(kb.title)}</b><ul>${body}</ul>`,
        chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: kb.hash }, { label: t('nav.help'), act: 'nav', val: '#/help' }]
          .concat((kb.related || []).map(r2 => ({ label: r2.title, act: 'ask', val: t('cop.kb.askAbout') + ' ' + r2.title })))));
    }
    /* záloha: kurátorované mini odpovědi */
    const hit = topics.find(([rx]) => new RegExp(rx).test(n));
    if (hit) return bot(th, esc(t(hit[1])), chipsOf([{ label: t('cop.ch.open'), act: 'nav', val: hit[2] }, { label: t('nav.help'), act: 'nav', val: '#/help' }]));
    bot(th, capabilitiesHtml(), defaultChips());
  }
  /* changelog: co je v aplikaci nového */
  function rChangelog(th) {
    if (!window.HelpKB) return bot(th, t('cop.r.noData'));
    const log = HelpKB.changelog().slice(0, 4);
    bot(th, `<b>${esc(t('help.newsTitle'))}</b><br>` +
      log.map(e => `· <b>${esc(e.title)}</b> <small>(${esc(e.date)})</small><br><span style="color:var(--text-muted)">${esc(e.desc)}</span>`).join('<br>'),
      chipsOf([{ label: t('help.news'), act: 'nav', val: '#/help/news' }]));
  }
  function copOff(th) {
    bot(th, t('cop.off.confirm'), chipsOf([{ label: t('cop.off.yes'), val: 'coff:ok' }, { label: t('common.cancel'), val: 'coff:no' }]));
    th.state = { flow: 'coff', step: 'confirm', data: {} };
  }
  function contCopOff(th, input) {
    th.state = null;
    if (input.val !== 'coff:ok') return bot(th, t('cop.cancelled'));
    bot(th, t('cop.off.bye'));
    saveTh(th);
    Store.patchSettings({ copilotEnabled: false });
    if (window.App) { location.hash = '#/settings'; App.render(); }
  }

  /* ================= router ================= */
  function capabilitiesHtml() {
    /* Copilot je zároveň nápověda - ukážeme i témata, která umí vysvětlit */
    const kbTopics = window.HelpKB ? HelpKB.topics(va().role).map(x => `<li>${esc(x.title)}</li>`).join('') : '';
    return `<b>${esc(t('cop.f.capabilities'))}</b><ul>` +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `<li>${esc(t('cop.cap.' + i))}</li>`).join('') + '</ul>' +
      (kbTopics ? `<b>${esc(t('cop.kb.topicsTitle'))}</b><ul>${kbTopics}</ul>` : '');
  }
  /* chip „Vysvětli mi <téma>" - vrací se zpět do znalostní báze */
  function askTopicChip(id) {
    const tp = window.HelpKB ? HelpKB.topics(va().role).find(x => x.id === id) : null;
    return tp ? [{ label: tp.title, act: 'ask', val: t('cop.kb.askAbout') + ' ' + tp.title }] : [];
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
    if (intent === 'howto') return rHowto(th, text);
    if (intent === 'greet') { welcome(th); return; }
    if (intent === 'copOff') return copOff(th);
    if (intent === 'schedule' && !isTask) return startSchedule(th, text);
    if (intent === 'remind') return startRemind(th, text);
    if (intent === 'conv') return startConv(th, text);
    if (intent === 'confirm') return startConfirm(th);
    if (intent === 'self') return startSelf(th);
    if (intent === 'kudos') return startKudos(th, text);
    if (intent === 'fb') return startFb(th, text);
    if (intent === 'checkin') return startCheckin(th, text);
    if (intent === 'eval') return startEval(th, text);
    if (intent === 'goalAdd') return startGoalAdd(th, text);
    if (intent === 'goalProg') return startGoalProg(th, text);
    if (intent === 'cycle') return startCycle(th);
    if (intent === 'npsFill') return startNpsFill(th);
    if (intent === 'f360Fill') return startF360Fill(th);
    if (intent === 'f360Req') return startF360Req(th, text);
    if (intent === 'kpiSet') return startKpiSet(th, text);
    if (intent === 'personAdd') return startPersonAdd(th, text);
    if (intent === 'theme') return startTheme(th, text);
    if (intent === 'lang') return startLang(th, text);
    if (intent === 'r.completion') return rCompletion(th);
    if (intent === 'r.atrisk') return rAtRisk(th);
    if (intent === 'r.mood') return rMood(th);
    if (intent === 'r.enps') return rEnps(th);
    if (intent === 'r.kudos') return rKudos(th);
    if (intent === 'r.goals') return rGoals(th);
    if (intent === 'r.stale') return rStale(th);
    if (intent === 'r.kpi') return rKpi(th);
    if (intent === 'r.person') return rPerson(th, text);
    if (intent === 'r.team') return rTeam(th);
    if (intent === 'r.notif') return rNotif(th);
    if (intent === 'r.changelog') return rChangelog(th);
    if (intent === 'r.scale') return rScale(th);
    if (intent === 'r.talent') return rTalent(th);
    if (intent === 'r.f360') return rF360(th, text);
    bot(th, esc(t('cop.f.sorry')) + '<br><br>' + capabilitiesHtml(), defaultChips());
  }

  /* registry pokračování flows (thread.state.flow → handler) */
  const CONT = {
    kudos: contKudos, fb: contFb, checkin: contCheckin, self: contSelf, semi: contSemi, eval: contEval,
    schedule: contSchedule, goal: contGoalAdd, goalp: contGoalProg, confirm: contConfirm,
    conv: contConv, cycle: contCycle, nps: contNpsFill, f360f: contF360Fill, f360r: contF360Req,
    kpi: contKpiSet, person: contPersonAdd, theme: contTheme, langf: contLang, coff: contCopOff,
  };

  function reply(th, input) {
    /* input: {text} volný vstup | {val,label} odpověď chipem */
    if (th.state) {
      if (input.text && RX.cancel.test(norm(input.text))) { th.state = null; bot(th, t('cop.cancelled')); saveTh(th); return; }
      const h = CONT[th.state.flow];
      if (h) h(th, input);
      else { th.state = null; route(th, input.text || ''); }
    } else route(th, input.text || input.label || '');
    saveTh(th);
  }
  /* jednorázové zpracování (testy, naplánované úlohy) */
  function process(th, text) { userMsg(th, text); reply(th, { text }); return th; }

  window.Copilot = {
    enabled, threads, newThread, saveTh, userMsg, reply, process, welcome,
    prompts, savePrompt, tasks, runDueTasks, matchPeople, detect, parseSchedule, recs, ownerKey,
    parseDateCz, fuzzyPick,
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
