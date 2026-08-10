/* TeamPulse demo v2 - nápověda jako knowledge base (2026-07-30)
   -------------------------------------------------------------------------
   Jediný zdroj pravdy o tom, "jak aplikace funguje": datově řízená témata
   (HelpKB.topics), fulltextové hledání bez diakritiky (HelpKB.search),
   changelog (HelpKB.changelog) a API pro Copilota (HelpKB.answer) - chat
   odpovídá ze STEJNÉHO obsahu jako sekce Nápověda, nic se nedubluje.
   Texty žijí v i18n (cs/en/de); tady je jen struktura. */
(function () {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* klíčová slova modulů (talent, nálada, 1:1, přehledy) - sdílí všechny role */
  const MOD_KW = ['1 1', '1:1', 'check in', 'checkin', 'nalada', 'talent', '9 box', '9box', 'matice',
    'nastupnic', 'succession', 'klicova pozice', 'klicove pozice', 'retenc', 'prehled', 'org chart', 'organizacni'];

  /* témata: id, ikona, proklik, role (kde se ukazuje), titulek + body z i18n */
  const DEF = [
    { id: 'proc-employee', ico: 'doc', hash: '#/myreviews', roles: ['employee'], title: 'help.employee.title', keys: n => range('help.employee.', 7), numbered: true, kw: ['postup', 'krok za krokem', 'navod', 'prirucka', 'co mam delat', 'jak mam', 'step by step', 'meine schritte'] },
    { id: 'proc-manager', ico: 'target', hash: '#/team', roles: ['manager'], title: 'help.manager.title', keys: n => range('help.manager.', 8), numbered: true, kw: ['postup', 'krok za krokem', 'navod', 'prirucka', 'co mam delat', 'jak mam', 'step by step', 'meine schritte'] },
    { id: 'proc-hr', ico: 'gauge', hash: '#/hr', roles: ['hr'], title: 'help.hr.title', keys: n => range('help.hr.', 7), numbered: true, kw: ['postup', 'krok za krokem', 'navod', 'prirucka', 'co mam delat', 'jak mam', 'step by step', 'meine schritte'] },
    { id: 'types', ico: 'calendar', hash: '#/hr', roles: ['employee', 'manager', 'hr'], title: 'help.types.title', keys: n => range('help.types.', 3), kw: ['typy', 'druhy', 'rocni', 'pololetni', 'probace', 'zkusebni', 'jak casto', 'kadence', 'review types', 'how often', 'arten'] },
    { id: 'goals', ico: 'spark', hash: '#/goals', roles: ['employee', 'manager', 'hr'], title: 'help.goalsModel.title', keys: n => range('help.goalsModel.', 6), kw: ['cil', 'cile', 'cilu', 'vaha', 'vahy', 'smart', 'kpi', 'progress', 'plneni', 'goal', 'weight', 'ziel'] },
    { id: 'feedback', ico: 'coach', hash: '#/kudos', roles: ['employee', 'manager', 'hr'], title: 'help.fb.title', keys: n => range('help.fb.', 4), kw: ['vazba', 'zpetna vazba', 'sbi', 'konstruktivn', 'pochval', 'kudos', 'uznani', 'feedback', 'praise'] },
    { id: 'mod-employee', ico: 'grid9', hash: '#/home', roles: ['employee'], title: 'help.mod.title', keys: n => range('help.mod.employee.', 4), kw: MOD_KW },
    { id: 'mod-manager', ico: 'grid9', hash: '#/myteam', roles: ['manager'], title: 'help.mod.title', keys: n => range('help.mod.manager.', 8), kw: MOD_KW },
    { id: 'mod-hr', ico: 'grid9', hash: '#/talent', roles: ['hr'], title: 'help.mod.title', keys: n => range('help.mod.hr.', 8), kw: MOD_KW },
    { id: 'onboarding', ico: 'sprout', hash: '#/onboarding', roles: ['employee', 'manager', 'hr'], title: 'help.onb.title', keys: n => range('help.onb.', 7), kw: ['onboarding', 'novacek', 'novacka', 'novacci', 'nastup', 'zkusebni doba', 'zkusebka', 'buddy', 'zaskolen', 'zaskolovatel', 'adaptace', 'probace', 'new hire', 'probation', 'einarbeitung', 'probezeit'] },
    { id: 'copilot', ico: 'copilot', hash: '#/copilot', roles: ['employee', 'manager', 'hr'], title: 'help.cop.title', keys: n => range('help.cop.', 3), kw: ['copilot', 'chat', 'asistent', 'parták', 'assistant'] },
    { id: 'flow', ico: 'refresh', hash: '#/myreviews', roles: ['employee', 'manager', 'hr'], title: 'help.flowTitle', keys: n => range('help.flow.', 5), numbered: true, kw: ['proces', 'prubeh', 'faze', 'kroky', 'funguje hodnocen', 'probiha hodnocen', 'workflow', 'ablauf', 'phasen'] },
    { id: 'scale', ico: 'spark', hash: '#/myreviews', roles: ['employee', 'manager', 'hr'], title: 'help.scaleTitle', keys: n => ['TN', 'PO', 'KV', 'NR', 'NU'].map(k => 'help.scale.' + k), kw: ['skala', 'skale', 'stupnic', 'stupne', 'hodnotici skala', 'rating scale', 'skala bewertung'] },
    { id: 'agreement', ico: 'check', hash: '#/myreviews', roles: ['employee', 'manager', 'hr'], title: 'help.agree.title', keys: n => range('help.agree.', 4), kw: ['shoda', 'shode', 'potvrzen', 'potvrdit', 'nesouhlas', 'souhlas', 'spor', 'agreement', 'disagree', 'einigung'] },
    { id: 'ball', ico: 'clock', hash: '#/team', roles: ['employee', 'manager', 'hr'], title: 'help.ball.title', keys: n => range('help.ball.', 4), kw: ['na tahu', 'stav', 'stavy', 'status', 'kdo je na tahu', 'pripomen', 'waiting on'] },
    { id: 'privacy', ico: 'lock', hash: '#/help', roles: ['employee', 'manager', 'hr'], title: 'help.privacy.title', keys: n => range('help.privacy.', 4), kw: ['kdo vidi', 'kdo uvidi', 'pristup', 'soukrom', 'anonym', 'gdpr', 'moje data', 'privacy', 'who sees', 'datenschutz'] },
  ];
  function range(prefix, n) { return Array.from({ length: n }, (_, i) => prefix + (i + 1)); }

  /* changelog - nejnovější nahoře; datum je součást dat, texty v i18n */
  const LOG = [
    { date: '2026-08-10', ico: 'sprout', hash: '#/onboarding', key: 'ch.onb' },
    { date: '2026-07-30', ico: 'target', hash: '#/goals', key: 'ch.gc' },
    { date: '2026-07-30', ico: 'tree', hash: '#/goals', key: 'ch.gal' },
    { date: '2026-07-30', ico: 'coach', hash: '#/kudos', key: 'ch.fb' },
    { date: '2026-07-30', ico: 'heartPulse', hash: '#/people', key: 'ch.f360' },
    { date: '2026-07-28', ico: 'copilot', hash: '#/copilot', key: 'ch.cop' },
    { date: '2026-07-26', ico: 'gauge', hash: '#/checkins', key: 'ch.enps' },
    { date: '2026-07-22', ico: 'grid9', hash: '#/talent', key: 'ch.talent' },
    { date: '2026-06-12', ico: 'logo', hash: '#/home', key: 'ch.base' },
  ];

  function topics(role) {
    return DEF
      .filter(d => !role || d.roles.includes(role))
      .map(d => ({
        id: d.id, ico: d.ico, hash: d.hash, roles: d.roles, numbered: !!d.numbered,
        title: t(d.title),
        items: d.keys().map(k => t(k)),
        kw: d.kw || [],
      }));
  }
  /* fulltext bez diakritiky napříč VŠEMI tématy (i mimo aktuální roli - výsledek nese role badge) */
  /* Slova bez informační hodnoty. Krátká zájmena („si", „mi") jsou zvlášť zrádná -
     jako podřetězec sedí skoro všude a dělala falešné shody („jak si změním heslo"). */
  const STOP = new Set(['jak', 'jaky', 'jaka', 'jake', 'jaky', 'kdo', 'komu', 'koho', 'kdy', 'kde', 'proc',
    'funguje', 'funguji', 'fungujou', 'co', 'je', 'jsou', 'se', 'si', 'na', 'do', 'pro', 'mi', 'me', 'mne',
    'muj', 'moje', 'mych', 'mym', 'ti', 'tam', 'ten', 'ta', 'to', 'tohle', 'chci', 'mam', 'mate', 'byt',
    'the', 'how', 'does', 'do', 'what', 'is', 'are', 'my', 'me', 'can', 'who',
    'wie', 'was', 'ist', 'sind', 'und', 'der', 'die', 'das', 'ich', 'mein', 'meine']);
  function search(q) {
    /* interpunkci pryč - „hodnocení?" musí sednout na „hodnocení" */
    const nq = norm(q).replace(/[^a-z0-9]+/g, ' ').trim();
    if (nq.length < 2) return [];
    let words = nq.split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
    if (!words.length) words = nq.split(/\s+/).filter(w => w.length >= 3);
    /* české tvary („hodnocení / hodnocením") porovnáváme přes kmen */
    const stem = w => (w.length > 5 ? w.slice(0, w.length - 2) : w);
    const terms = words.map(w => ({ w, st: stem(w) }));
    const inText = (txt, tm) => txt.includes(tm.w) || txt.includes(tm.st);
    return topics(null).map(tp => {
      /* interpunkci pryč i v obsahu, ať „1:1" sedne na dotaz „zapíšu 1:1" */
      const flat = x => norm(x).replace(/[^a-z0-9]+/g, ' ');
      const nTitle = flat(tp.title);
      const nItems = tp.items.map(flat);
      const kws = tp.kw || [];
      const hits = nItems.map((it, i) => ({
        i, score: terms.filter(tm => inText(it, tm)).length + kws.filter(k => nq.indexOf(k) >= 0 && it.indexOf(k) >= 0).length * 2,
      })).filter(h => h.score > 0);
      const titleScore = terms.filter(tm => inText(nTitle, tm)).length;
      /* název váží nejvíc, pak nejlepší odstavec a pokrytí dotazu - ne počet odstavců,
         jinak by dlouhá témata (příručka role) vyhrávala nad konkrétními. */
      const best = hits.length ? hits[0].score : 0;
      const covered = terms.filter(tm => inText(nTitle, tm) || nItems.some(it => inText(it, tm))).length;
      /* klíčová slova tématu (kw) hledáme v celém dotazu - „kdo vidí moje data" → soukromí */
      const kwScore = (tp.kw || []).filter(k => new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(nq)).length;
      const score = kwScore * 6 + titleScore * 3 + best * 2 + covered;
      const strongHit = terms.some(tm => tm.w.length >= 4 && (inText(nTitle, tm) || nItems.some(it => inText(it, tm))));
      return { topic: tp, hits: hits.sort((a, b) => b.score - a.score).map(h => h.i), score, kwScore, covered, strongHit, terms: terms.length };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
  }
  function changelog() {
    return LOG.map(e => ({ date: e.date, ico: e.ico, hash: e.hash, title: t(e.key + '.t'), desc: t(e.key + '.d') }));
  }
  /* pro Copilota: nejlepší odpověď na dotaz - téma, nejrelevantnější odstavce
     (items = celé téma, aby chat odpovídal souvisle, ne jednou větou) a další témata */
  /* Práh relevance: „jak si změním heslo" nebo „kolik stojí licence" do nápovědy nepatří.
     Bereme odpověď jen když dotaz trefil klíčové slovo tématu, nebo pokryl aspoň
     polovinu svých slov (u jednoslovných dotazů stačí jedno). Jinak null → Copilot
     přizná, že to neví, místo aby vrátil náhodné téma. */
  function relevant(r) {
    if (!r) return false;
    if (r.kwScore > 0) return true;
    /* většina nosných slov dotazu musí sedět - jinak je to trefa náhodou */
    const need = Math.max(1, Math.ceil(r.terms * 0.6));
    /* musí sedět i aspoň jedno „nosné" slovo (4+ znaků), ne jen krátké spojky */
    return r.covered >= need && r.score >= 3 && r.strongHit;
  }
  function answer(q) {
    const res = search(q).filter(relevant);
    if (!res.length) return null;
    const best = res[0];
    const idx = best.hits.length ? best.hits[0] : 0;
    /* nejprve trefené odstavce, pak zbytek tématu - ať odpověď dává smysl i bez proklikávání */
    const order = best.hits.concat(best.topic.items.map((_, i) => i).filter(i => !best.hits.includes(i)));
    return {
      title: best.topic.title, text: best.topic.items[idx],
      items: order.slice(0, 6).map(i => best.topic.items[i]),
      hash: best.topic.hash, id: best.topic.id,
      /* související témata: bez duplicit názvů (mod-* mají stejný titulek pro každou roli) */
      related: res.slice(1).filter((r, i2, arr) => r.topic.title !== best.topic.title
        && arr.findIndex(x => x.topic.title === r.topic.title) === i2)
        .slice(0, 2).map(r => ({ id: r.topic.id, title: r.topic.title, hash: r.topic.hash })),
    };
  }
  window.HelpKB = { topics, search, changelog, answer, relevant };
})();
