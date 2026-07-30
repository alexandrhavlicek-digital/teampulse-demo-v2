/* TeamPulse demo v2 - nápověda jako knowledge base (2026-07-30)
   -------------------------------------------------------------------------
   Jediný zdroj pravdy o tom, "jak aplikace funguje": datově řízená témata
   (HelpKB.topics), fulltextové hledání bez diakritiky (HelpKB.search),
   changelog (HelpKB.changelog) a API pro Copilota (HelpKB.answer) - chat
   odpovídá ze STEJNÉHO obsahu jako sekce Nápověda, nic se nedubluje.
   Texty žijí v i18n (cs/en/de); tady je jen struktura. */
(function () {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* témata: id, ikona, proklik, role (kde se ukazuje), titulek + body z i18n */
  const DEF = [
    { id: 'proc-employee', ico: 'doc', hash: '#/myreviews', roles: ['employee'], title: 'help.employee.title', keys: n => range('help.employee.', 7), numbered: true },
    { id: 'proc-manager', ico: 'target', hash: '#/team', roles: ['manager'], title: 'help.manager.title', keys: n => range('help.manager.', 8), numbered: true },
    { id: 'proc-hr', ico: 'gauge', hash: '#/hr', roles: ['hr'], title: 'help.hr.title', keys: n => range('help.hr.', 7), numbered: true },
    { id: 'types', ico: 'calendar', hash: '#/hr', roles: ['employee', 'manager', 'hr'], title: 'help.types.title', keys: n => range('help.types.', 3) },
    { id: 'goals', ico: 'spark', hash: '#/goals', roles: ['employee', 'manager', 'hr'], title: 'help.goalsModel.title', keys: n => range('help.goalsModel.', 6) },
    { id: 'feedback', ico: 'coach', hash: '#/kudos', roles: ['employee', 'manager', 'hr'], title: 'help.fb.title', keys: n => range('help.fb.', 4) },
    { id: 'mod-employee', ico: 'grid9', hash: '#/home', roles: ['employee'], title: 'help.mod.title', keys: n => range('help.mod.employee.', 4) },
    { id: 'mod-manager', ico: 'grid9', hash: '#/myteam', roles: ['manager'], title: 'help.mod.title', keys: n => range('help.mod.manager.', 8) },
    { id: 'mod-hr', ico: 'grid9', hash: '#/talent', roles: ['hr'], title: 'help.mod.title', keys: n => range('help.mod.hr.', 8) },
    { id: 'copilot', ico: 'copilot', hash: '#/copilot', roles: ['employee', 'manager', 'hr'], title: 'help.cop.title', keys: n => range('help.cop.', 3) },
    { id: 'flow', ico: 'refresh', hash: '#/myreviews', roles: ['employee', 'manager', 'hr'], title: 'help.flowTitle', keys: n => range('help.flow.', 5), numbered: true },
  ];
  function range(prefix, n) { return Array.from({ length: n }, (_, i) => prefix + (i + 1)); }

  /* changelog - nejnovější nahoře; datum je součást dat, texty v i18n */
  const LOG = [
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
      }));
  }
  /* fulltext bez diakritiky napříč VŠEMI tématy (i mimo aktuální roli - výsledek nese role badge) */
  const STOP = new Set(['jak', 'funguje', 'funguji', 'fungujou', 'co', 'je', 'jsou', 'se', 'na', 'do', 'pro', 'the', 'how', 'does', 'do', 'what', 'is', 'are', 'wie', 'was', 'ist', 'sind', 'und', 'der', 'die', 'das']);
  function search(q) {
    const nq = norm(q).trim();
    if (nq.length < 2) return [];
    let words = nq.split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w));
    if (!words.length) words = nq.split(/\s+/).filter(w => w.length >= 2);
    return topics(null).map(tp => {
      const hits = tp.items.map((it, i) => ({ i, score: words.filter(w => norm(it).includes(w)).length }))
        .filter(h => h.score > 0);
      const titleScore = words.filter(w => norm(tp.title).includes(w)).length;
      const score = titleScore * 2 + hits.reduce((s, h) => s + h.score, 0);
      return { topic: tp, hits: hits.sort((a, b) => b.score - a.score).map(h => h.i), score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
  }
  function changelog() {
    return LOG.map(e => ({ date: e.date, ico: e.ico, hash: e.hash, title: t(e.key + '.t'), desc: t(e.key + '.d') }));
  }
  /* pro Copilota: nejlepší odpověď na dotaz - téma + nejrelevantnější odstavec */
  function answer(q) {
    const res = search(q);
    if (!res.length) return null;
    const best = res[0];
    const idx = best.hits.length ? best.hits[0] : 0;
    return { title: best.topic.title, text: best.topic.items[idx], hash: best.topic.hash, id: best.topic.id };
  }
  window.HelpKB = { topics, search, changelog, answer };
})();
