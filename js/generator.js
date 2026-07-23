/* TeamPulse demo v2 - virtual company generator
   Builds a complete fictional company: people, roles, org chart,
   industry KPIs (company + team), per-area goals and seeded reviews. */
(function () {

  /* ---------------- name pools ---------------- */
  const MALE = ['Jakub','Tomáš','Petr','Martin','Ondřej','Lukáš','Marek','David','Filip','Vojtěch','Adam','Michal','Jan','Daniel','Šimon','Matěj','Radek','Karel','Aleš','Patrik','Štěpán','Roman','Viktor','Dominik'];
  const FEMALE = ['Tereza','Anna','Kateřina','Lucie','Eliška','Veronika','Barbora','Markéta','Klára','Adéla','Nikola','Petra','Hana','Simona','Karolína','Alena','Monika','Jana','Zuzana','Kristýna','Michaela','Denisa','Ivana','Sára'];
  const SURNAMES = ['Novák','Svoboda','Dvořák','Černý','Procházka','Kučera','Veselý','Horák','Němec','Marek','Pokorný','Pospíšil','Hájek','Král','Jelínek','Růžička','Beneš','Fiala','Sedláček','Doležal','Zeman','Kolář','Navrátil','Čermák','Urban','Vaněk','Blažek','Kratochvíl','Šimek','Holub','Kovář','Bartoš','Polák','Šťastný','Musil'];

  function femSurname(s) {
    if (s.endsWith('ý')) return s.slice(0, -1) + 'á';
    if (s.endsWith('ek')) return s.slice(0, -2) + 'ková';
    if (s.endsWith('ec')) return s.slice(0, -2) + 'cová';
    return s + 'ová';
  }

  /* ---------------- goal policy & areas ----------------
     Tři oblasti hodnocení (Wunderman). Každá oblast má N cílů
     (HR konfiguruje, min 2). Váhy cílů v oblasti = vždy 100 %.
     KPI vazba: teamwork + quality povinná, growth volitelná. */
  const AREAS = ['teamwork', 'growth', 'quality'];
  const DEFAULT_GOAL_POLICY = { teamwork: 3, growth: 2, quality: 3 };
  const KPI_REQUIRED = { teamwork: true, growth: false, quality: true };
  const WEIGHT_PRESETS = { 2: [50, 50], 3: [30, 30, 40], 4: [25, 25, 25, 25], 5: [20, 20, 20, 20, 20] };

  /* Detailní kompetenční knihovna (dle DER Touristik modelu) - váhy = 100 %.
     Mapování na 3 oblasti drží zpětnou kompatibilitu reportingu. */
  const COMP_LIB = [
    { key: 'coop',       title: 'Spolupráce',                                weight: 15, areaKey: 'teamwork' },
    { key: 'leadership', title: 'Leadership',                                weight: 20, areaKey: 'teamwork' },
    { key: 'analysis',   title: 'Schopnost analýzy a vyvozování závěrů',     weight: 10, areaKey: 'growth' },
    { key: 'selfmgmt',   title: 'Sebeřízení',                                weight: 15, areaKey: 'growth' },
    { key: 'customer',   title: 'Orientace na zákazníka',                    weight: 10, areaKey: 'quality' },
    { key: 'expertise',  title: 'Odbornost',                                 weight: 10, areaKey: 'quality' },
    { key: 'results',    title: 'Dosahování výsledků',                       weight: 20, areaKey: 'quality' },
  ];

  /* ---------------- industry templates ---------------- */
  const INDUSTRIES = {
    it: {
      companyNames: ['Bitwise Studio', 'CodeFox', 'Datapond', 'Pixelmint', 'Cloudberry Labs'],
      ceoTitle: 'CEO',
      depts: [
        { key: 'dev',  name: 'Vývoj',            head: 'Head of Engineering', roles: ['Frontend Developer','Backend Developer','Fullstack Developer','Mobile Developer','Tech Lead'] , share: 0.34 },
        { key: 'qa',   name: 'QA & DevOps',      head: 'QA & DevOps Lead',    roles: ['QA Engineer','Test Automation Engineer','DevOps Engineer'], share: 0.12 },
        { key: 'prod', name: 'Produkt & Design', head: 'Head of Product',     roles: ['Product Manager','UX Designer','UI Designer','Product Analyst'], share: 0.14 },
        { key: 'sales',name: 'Obchod & Marketing', head: 'Head of Sales',     roles: ['Account Manager','Sales Representative','Marketing Specialist','Content Specialist'], share: 0.18 },
        { key: 'cs',   name: 'Zákaznická podpora', head: 'Support Lead',      roles: ['Support Specialist','Onboarding Specialist'], share: 0.10 },
        { key: 'ops',  name: 'Finance & Office', head: 'Finance Manager',     roles: ['Účetní','Office Manager'], share: 0.06 },
        { key: 'hr',   name: 'HR',               head: 'HR Manager',          roles: ['HR Specialist'], share: 0.06 },
      ],
      kpis: [
        { title: 'Velocity týmů', desc: 'Průměrná dokončenost sprint commitmentu napříč squady.', target: '85 %', current: 78, weight: 25 },
        { title: 'Kvalita releasů', desc: 'Max. 2 kritické bugy na release v produkci.', target: '≤ 2', current: 64, weight: 25 },
        { title: 'Spokojenost klientů (CSAT)', desc: 'Průměr CSAT u klientských projektů.', target: '4,5 / 5', current: 86, weight: 20 },
        { title: 'Uptime platformy', desc: 'Dostupnost produkčního prostředí.', target: '99,9 %', current: 95, weight: 15 },
        { title: 'Time-to-hire', desc: 'Obsazení otevřené pozice do 45 dní.', target: '45 dní', current: 70, weight: 15 },
      ],
      teamKpiPool: ['Dodržení sprint commitmentu', 'Spokojenost interních zákazníků', 'Dodržení termínů oddělení', 'Chybovost výstupů oddělení'],
      goalTemplates: {
        teamwork: [
          ['Mentoring juniora', 'Vést jednoho juniora - párové programování 2× týdně, společný rozvojový plán.'],
          ['Sdílení know-how', 'Připravit 2 interní tech talky a doplnit dokumentaci svého modulu.'],
          ['Spolupráce s QA', 'Společné plánování testů u každé epiky, zkrátit zpětnou vazbu QA → dev.'],
        ],
        growth: [
          ['Certifikace', 'Dokončit certifikaci (AWS / Azure / Scrum) do konce období.'],
          ['Prezentační dovednosti', 'Odprezentovat 3 demo session pro klienty nebo tým.'],
          ['Architektura systému', 'Samostudium + návrh architektury jedné služby pod dohledem mentora.'],
        ],
        quality: [
          ['Pokrytí testy', 'Zvýšit unit test coverage kritických modulů na 80 %.'],
          ['Rychlost code review', 'Průměrný čas na review PR pod 24 hodin.'],
          ['Snížení incidentů', 'Snížit počet P1 incidentů o 30 % proti minulému pololetí.'],
        ],
      },
    },
    travel: {
      companyNames: ['Modrá Zeměkoule', 'SunWave Travel', 'Cesty & Moře', 'Azurito Tours', 'Horizont Travel'],
      ceoTitle: 'Generální ředitel/ka',
      depts: [
        { key: 'sales', name: 'Prodej zájezdů',   head: 'Vedoucí prodeje',        roles: ['Prodejce zájezdů','Specialista poboček','Rezervační specialista'], share: 0.30 },
        { key: 'online',name: 'Online & Digital', head: 'Head of Digital',        roles: ['E-commerce Specialist','Online Marketing Specialist','Web Analyst','Content Specialist'], share: 0.16 },
        { key: 'prod',  name: 'Produkt & Nákup',  head: 'Vedoucí produktu',       roles: ['Produktový manažer destinace','Kontraktor ubytování','Letenkový specialista'], share: 0.16 },
        { key: 'care',  name: 'Zákaznický servis',head: 'Vedoucí servisu',        roles: ['Specialista péče o zákazníky','Reklamační specialista','Delegát'], share: 0.18 },
        { key: 'fin',   name: 'Finance',          head: 'Finanční manažer/ka',    roles: ['Účetní','Fakturant/ka'], share: 0.08 },
        { key: 'hr',    name: 'HR',               head: 'HR Manager',             roles: ['HR Specialist'], share: 0.06 },
        { key: 'it',    name: 'IT',               head: 'IT Manager',             roles: ['IT Specialista'], share: 0.06 },
      ],
      kpis: [
        { title: 'Podíl online prodeje 13 %', desc: 'Podíl online kanálu na celkovém prodeji na CZ trhu, s důrazem na konverzní poměr.', target: '13 %', current: 72, weight: 30 },
        { title: 'Pojištění u 50 % online objednávek', desc: 'Alespoň polovina online prodaných zájezdů obsahuje připojištění (vč. upsellu).', target: '50 %', current: 66, weight: 30 },
        { title: 'Náklady Digital ≤ 2,2 %', desc: 'Podíl nákladů digitálního týmu na provozních nákladech CZ trhu.', target: '2,2 %', current: 81, weight: 15 },
        { title: 'Termíny projektů ±10 %', desc: 'Projekty digitálního oddělení doručené max. s 10% odchylkou od plánu.', target: '±10 %', current: 75, weight: 15 },
        { title: 'NPS zákazníků', desc: 'Net Promoter Score po návratu ze zájezdu.', target: '60+', current: 84, weight: 10 },
      ],
      teamKpiPool: ['Plnění prodejního plánu oddělení', 'NPS oddělení', 'Vyřízení požadavků v SLA', 'Podíl upsellu doplňkových služeb'],
      goalTemplates: {
        teamwork: [
          ['Synchronizace kanálů', 'Měsíční synchronizace e-commerce × marketing × pobočky, sdílený zápis.'],
          ['Zaučení kolegy', 'Zaučit nového kolegu na rezervační systém do 6 týdnů.'],
          ['Workshopy destinací', 'Připravit 2 interní workshopy k destinacím pro tým.'],
        ],
        growth: [
          ['Znalost destinací', 'Absolvovat 2 studijní cesty nebo produktová školení destinací.'],
          ['Jazykové dovednosti', 'Posunout angličtinu/němčinu o úroveň - certifikovaný kurz.'],
          ['Revenue management', 'Projít kurz revenue managementu a aplikovat na 1 destinaci.'],
        ],
        quality: [
          ['Konverze nabídek', 'Zvýšit konverzní poměr vlastních nabídek o 15 %.'],
          ['Upsell pojištění', 'Polovina mých objednávek obsahuje připojištění.'],
          ['Reklamace do 14 dnů', 'Vyřídit 90 % reklamací do 14 dnů.'],
        ],
      },
    },
    auto: {
      companyNames: ['KovoTech Components', 'AutoDíl CZ', 'Precista Parts', 'MetalForm Auto', 'DrivePart Industries'],
      ceoTitle: 'Ředitel/ka závodu',
      depts: [
        { key: 'vyroba', name: 'Výroba',        head: 'Vedoucí výroby',      roles: ['Operátor CNC','Operátor lisovny','Seřizovač','Směnový mistr','Svářeč'], share: 0.40 },
        { key: 'kvalita',name: 'Kvalita',       head: 'Manažer kvality',     roles: ['Technik kvality','Metrolog','Auditor procesů'], share: 0.12 },
        { key: 'log',    name: 'Logistika',     head: 'Vedoucí logistiky',   roles: ['Plánovač výroby','Skladník','Disponent'], share: 0.14 },
        { key: 'udrzba', name: 'Údržba',        head: 'Vedoucí údržby',      roles: ['Mechanik','Elektrotechnik'], share: 0.08 },
        { key: 'konstr', name: 'Konstrukce & Technologie', head: 'Vedoucí konstrukce', roles: ['Konstruktér','Procesní technolog','Projektový inženýr'], share: 0.12 },
        { key: 'fin',    name: 'Finance & Nákup', head: 'Finanční manažer/ka', roles: ['Účetní','Nákupčí'], share: 0.08 },
        { key: 'hr',     name: 'HR',            head: 'HR Manager',          roles: ['HR Specialist','Mzdová účetní'], share: 0.06 },
      ],
      kpis: [
        { title: 'Zmetkovitost < 50 PPM', desc: 'Počet vadných dílů na milion dodaných zákazníkovi.', target: '< 50 PPM', current: 68, weight: 30 },
        { title: 'OEE linek 82 %', desc: 'Celková efektivita zařízení klíčových linek.', target: '82 %', current: 74, weight: 25 },
        { title: 'Včasnost dodávek (OTD)', desc: 'Podíl dodávek doručených zákazníkům včas.', target: '98 %', current: 88, weight: 20 },
        { title: 'Úrazovost LTIFR', desc: 'Bez pracovních úrazů s pracovní neschopností.', target: '0', current: 92, weight: 15 },
        { title: 'Fluktuace < 12 %', desc: 'Roční dobrovolná fluktuace ve výrobě.', target: '< 12 %', current: 61, weight: 10 },
      ],
      teamKpiPool: ['OEE oddělení', 'PPM oddělení', 'Plnění plánu výroby/práce', 'Úrazovost oddělení (cíl 0)'],
      goalTemplates: {
        teamwork: [
          ['Předávání směn', 'Strukturované předání směny - zápis bez výpadku informací.'],
          ['Zaškolení operátora', 'Zaškolit 1 nového operátora dle kvalifikační matice.'],
          ['Kaizen v týmu', 'Podat 4 zlepšovací návrhy, 2 z nich zrealizovat s týmem.'],
        ],
        growth: [
          ['Kvalifikační matice', 'Rozšířit kvalifikaci o obsluhu druhé linky / stroje.'],
          ['Školení kvality', 'Absolvovat školení IATF 16949 / metrologie.'],
          ['Základy TPM', 'Převzít autonomní údržbu vlastního pracoviště.'],
        ],
        quality: [
          ['5S nad 90 %', 'Udržet audit 5S nad 90 % po celé období.'],
          ['Zmetkovitost linky', 'Snížit zmetkovitost na své lince pod cílové PPM.'],
          ['Bez reklamací', 'Nulové zákaznické reklamace na svěřeném projektu.'],
        ],
      },
    },
  };

  /* ---------------- seeded review texts ---------------- */
  const SELF_TEXTS = {
    success: [
      'Dotáhl/a jsem {proj} včas a bez eskalací. Nejvíc si cením spolupráce s kolegy z vedlejšího týmu - bez nich by to nešlo.',
      'Povedlo se mi zlepšit {metric} oproti minulému období. Začal/a jsem si líp plánovat týden a je to znát.',
      'Zapracoval/a jsem na zpětné vazbě z minulého hodnocení - hlavně na komunikaci. Tým mi potvrdil, že je to lepší.',
    ],
    challenge: [
      'Nejtěžší bylo období, kdy odešel kolega a převzal/a jsem část jeho agendy. Pomohlo mi rozdělit si priority s nadřízeným.',
      'Tlak na termíny v {proj}. Naučil/a jsem se dřív říkat, když něco nestíhám, místo tichého přesčasování.',
    ],
    improve: [
      'Chci se zlepšit v prezentování výsledků. Pomohl by mi kurz prezentačních dovedností a víc příležitostí mluvit na poradách.',
      'Rád/a bych šel/šla hlouběji do {skill}. Potřebuji k tomu čas na samostudium a mentora.',
    ],
  };
  const MGR_TEXTS = {
    strengths: 'Spolehlivost a tah na branku. Výborná spolupráce v týmu, kolegové se na ni/něj obracejí.',
    growth: 'Více proaktivní komunikace směrem ke stakeholderům. Doporučuji kurz prezentačních dovedností.',
    talking: 'Probrat kariérní směřování na další rok. Ocenit zvládnutí náročného období. Domluvit konkrétní rozvojový plán.',
    privateNote: 'Pozor - zvažuje nabídky zvenku, klíčový člověk. Promyslet retenční plán.',
  };
  const GOAL_OUTCOMES = [
    'Splněno - průběžně dokládáno na 1:1, výsledek nad plán.',
    'Splněno částečně (cca 80 %), zbytek přechází do dalšího období.',
    'Splněno. Klíčová byla změna přístupu po prvním kvartálu.',
    'Nesplněno dle plánu - objektivní překážky (změna priorit), dohodnut nový rámec.',
  ];
  const KUDOS_MSGS = [
    'Díky za záchranu prezentace pro klienta na poslední chvíli! 🙏',
    'Skvělé zaučení nového kolegy - ptal se, kdo ho to tak dobře nastavil.',
    'Bez tebe by inventura trvala dvojnásobek času. Díky!',
    'Oceňuji klidnou hlavu při páteční krizi. Profesionální výkon.',
    'Tvoje dokumentace k procesu ušetřila všem hodiny práce.',
    'Díky za upřímnou zpětnou vazbu - posunula mě.',
    'Parádní výsledek u zákazníka, chválil tě jmenovitě!',
  ];

  /* ---------------- helpers ---------------- */
  let seed = 42;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const HUES = [355, 25, 45, 95, 145, 175, 205, 235, 265, 295, 325];
  function makePerson(roleTitle, deptKey, deptName, managerId, isHead) {
    const female = rnd() < 0.48;
    const first = pick(female ? FEMALE : MALE);
    const last = female ? femSurname(pick(SURNAMES)) : pick(SURNAMES);
    const hue = HUES[Math.floor(rnd() * HUES.length)];
    return {
      id: uid(), firstName: first, lastName: last, female,
      name: first + ' ' + last,
      initials: first[0] + last[0],
      hue,
      role: roleTitle, deptKey, dept: deptName,
      managerId: managerId || null, isHead: !!isHead,
      email: (first + '.' + last).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '') + '@firma.cz',
      hiredMonthsAgo: 3 + Math.floor(rnd() * 90),
    };
  }

  /* ---------------- org builder ---------------- */
  function buildCompany(industryKey, size, opts) {
    seed = (opts && opts.seed) || (Date.now() % 100000);
    const ind = INDUSTRIES[industryKey];
    const companyName = pick(ind.companyNames);
    const people = [];

    const ceo = makePerson(ind.ceoTitle, 'vedeni', 'Vedení', null, true);
    people.push(ceo);

    const heads = {};
    ind.depts.forEach(d => {
      const h = makePerson(d.head, d.key, d.name, ceo.id, true);
      heads[d.key] = h; people.push(h);
    });

    let remaining = Math.max(0, size - people.length);
    const buckets = ind.depts.map(d => ({ d, n: Math.round(remaining * d.share) }));
    let allocated = buckets.reduce((s, b) => s + b.n, 0);
    while (allocated < remaining) { buckets[0].n++; allocated++; }
    while (allocated > remaining) { const b = buckets.find(x => x.n > 0); b.n--; allocated--; }

    buckets.forEach(({ d, n }) => {
      const leads = [];
      const numLeads = n >= 8 ? Math.floor(n / 8) : 0;
      for (let i = 0; i < numLeads; i++) {
        const lead = makePerson('Team Lead - ' + d.name, d.key, d.name, heads[d.key].id, false);
        lead.isLead = true; leads.push(lead); people.push(lead);
      }
      for (let i = 0; i < n - numLeads; i++) {
        const mgr = leads.length ? leads[i % leads.length] : heads[d.key];
        people.push(makePerson(pick(d.roles), d.key, d.name, mgr.id, false));
      }
    });

    /* team KPIs - 2 per department */
    const teamKpis = [];
    ind.depts.forEach(d => {
      shuffle(ind.teamKpiPool).slice(0, 2).forEach(title => {
        teamKpis.push({
          id: uid(), deptKey: d.key, dept: d.name, title,
          target: '100 %', current: 55 + Math.floor(rnd() * 40),
        });
      });
    });

    const company = {
      name: companyName,
      industry: industryKey,
      size: people.length,
      departments: [{ key: 'vedeni', name: 'Vedení' }].concat(ind.depts.map(d => ({ key: d.key, name: d.name }))),
      kpis: ind.kpis.map(k => Object.assign({ id: uid() }, k)),
      teamKpis,
      goalPolicy: Object.assign({}, DEFAULT_GOAL_POLICY),
      competencies: null, // null = jednoduchý režim (3 oblasti); array = detailní rámec
      cycleConfig: { semiEnabled: true }, // pololetní check stavu lze vypnout
      createdAt: new Date().toISOString(),
    };
    return { company, people, ceo, heads };
  }

  /* ---------------- per-area goals for a person ---------------- */
  function weightsFor(n) { return (WEIGHT_PRESETS[n] || Array(n).fill(Math.round(100 / n))).slice(); }

  function kpiRefFor(areaKey, person, company) {
    if (areaKey === 'growth' && rnd() < 0.5) return null; // rozvojový cíl bez vazby
    const teamK = company.teamKpis.filter(k => k.deptKey === person.deptKey);
    if (teamK.length && rnd() < 0.5) return { type: 'team', id: pick(teamK).id };
    return { type: 'company', id: pick(company.kpis).id };
  }

  function goalsForPerson(p, company, tpls, period) {
    const out = [];
    AREAS.forEach(areaKey => {
      const n = Math.max(2, company.goalPolicy[areaKey] || 2);
      const ws = weightsFor(n);
      const pool = shuffle(tpls[areaKey]);
      for (let i = 0; i < n; i++) {
        const tpl = pool[i % pool.length];
        out.push({
          id: uid(), ownerId: p.id, areaKey,
          title: tpl[0] + (i >= pool.length ? ' II' : ''),
          desc: tpl[1],
          weight: ws[i],
          progress: Math.floor(rnd() * 90),
          kpiRef: kpiRefFor(areaKey, p, company),
          confirmedByManager: true,
          due: '2026-12-31', type: 'personal', period,
        });
      }
    });
    return out;
  }

  /* ---------------- review form ---------------- */
  const CURRENT_PERIOD = 'Rok 2026';
  const PAST_PERIOD = 'Rok 2025';
  const SCALE = ['TN', 'PO', 'KV', 'NR', 'NU', 'NA'];

  function emptyForm() {
    return {
      self: { success: '', challenge: '', improve: '', areas: { teamwork: null, growth: null, quality: null }, summary: '' },
      mgr: { areas: { teamwork: null, growth: null, quality: null }, areaComments: { teamwork: '', growth: '', quality: '' }, strengths: '', growthAreas: '', talking: '', privateNote: '', summary: '' },
      goalsEval: [],   // [{goalId,title,areaKey,weight,kpiRef,outcome,rating,mgrConfirmed}]
      newGoals: [],    // [{id,areaKey,title,desc,weight,kpiRef,mgrConfirmed}]
      trainings: [],
      employeeComment: '', conversationDate: null, nextReviewDate: null,
      versions: [],
    };
  }

  function goalsEvalFrom(goals, p) {
    return goals.filter(g => g.ownerId === p.id && g.type === 'personal')
      .map(g => ({ goalId: g.id, title: g.title, areaKey: g.areaKey, weight: g.weight, kpiRef: g.kpiRef, outcome: '', rating: null, mgrConfirmed: false }));
  }

  function newGoalsFrom(p, company, tpls) {
    const list = [];
    AREAS.forEach(areaKey => {
      const n = Math.max(2, company.goalPolicy[areaKey] || 2);
      const ws = weightsFor(n);
      const pool = shuffle(tpls[areaKey]);
      for (let i = 0; i < n; i++) {
        const tpl = pool[i % pool.length];
        list.push({
          id: uid(), areaKey, title: tpl[0] + (i >= pool.length ? ' II' : ''), desc: tpl[1],
          weight: ws[i], kpiRef: kpiRefFor(areaKey, p, company), mgrConfirmed: false,
        });
      }
    });
    return list;
  }

  function filledSelf(form, p, ind) {
    const proj = ind === 'auto' ? 'projekt nové linky' : ind === 'travel' ? 'letní kampaň' : 'release 2.4';
    const metric = ind === 'auto' ? 'zmetkovitost na své lince' : ind === 'travel' ? 'konverzi svých nabídek' : 'rychlost code review';
    const skill = ind === 'auto' ? 'seřizování CNC' : ind === 'travel' ? 'revenue managementu' : 'architektury systému';
    form.self.success = pick(SELF_TEXTS.success).replace('{proj}', proj).replace('{metric}', metric);
    form.self.challenge = pick(SELF_TEXTS.challenge).replace('{proj}', proj);
    form.self.improve = pick(SELF_TEXTS.improve).replace('{skill}', skill);
    form.self.areas = { teamwork: pick(['TN','PO','KV','KV']), growth: pick(['PO','KV','KV','NR']), quality: pick(['TN','PO','KV','KV']) };
    form.self.summary = 'Období hodnotím jako náročné, ale úspěšné. Chci pokračovat v rozvoji a převzít víc odpovědnosti.';
    form.goalsEval.forEach(g => { g.outcome = pick(GOAL_OUTCOMES); g.rating = pick(['TN','PO','KV','KV','NR']); });
    return form;
  }
  function filledMgr(form) {
    /* talent sekce (soukromá, jen mgr+HR) - plní 9-box matici v Talent & Reporty */
    const roll = rnd();
    const potential = roll < 0.22 ? 'high' : roll < 0.72 ? 'mid' : 'low';
    form.mgr.talent = {
      potential,
      readiness: potential === 'high' ? pick(['r1', 'r1', 'r12']) : potential === 'mid' ? pick(['r12', 'no', 'no']) : 'no',
      attrition: potential === 'high' ? pick(['low', 'mid', 'mid', 'high']) : pick(['low', 'low', 'low', 'mid', 'high']),
      mobility: rnd() < 0.35, languages: pick(['AJ', 'AJ, NJ', 'NJ', 'AJ (B2)', '-']),
    };
    /* výkon koreluje s potenciálem, ať matice při demu žije (Hvězda ani Riziko nesmí být prázdné) */
    const hi = potential === 'high' && rnd() < 0.6;
    const lo = !hi && potential !== 'high' && rnd() < 0.3;
    form.mgr.areas = hi
      ? { teamwork: pick(['TN','TN','PO']), growth: pick(['TN','PO']), quality: pick(['TN','PO','PO']) }
      : lo
        ? { teamwork: pick(['KV','NR']), growth: pick(['NR','NR','NU']), quality: pick(['KV','NR','NR']) }
        : { teamwork: pick(['TN','PO','KV']), growth: pick(['PO','KV','NR']), quality: pick(['PO','KV','KV']) };
    form.mgrSeedBias = hi ? 'hi' : lo ? 'lo' : null;
    form.mgr.areaComments = {
      teamwork: 'Týmová spolupráce dlouhodobě silná, je oporou ostatním.',
      growth: 'Rozvoj jde správným směrem, doporučuji cílený kurz.',
      quality: 'Stabilní kvalita, výjimečně drobné nedotaženosti pod tlakem.',
    };
    form.mgr.strengths = MGR_TEXTS.strengths;
    form.mgr.growth = undefined;
    form.mgr.growthAreas = MGR_TEXTS.growth;
    form.mgr.talking = MGR_TEXTS.talking;
    form.mgr.privateNote = MGR_TEXTS.privateNote;
    form.mgr.summary = 'Celkově kvalitní a stabilní výkon (KV až PO). Dohodli jsme se na rozvojovém plánu a cílech níže.';
    form.goalsEval.forEach(g => {
      g.mgrConfirmed = true; g.mgrDecision = 'agree';
      if (form.mgrSeedBias === 'hi') g.rating = pick(['TN', 'TN', 'PO']);
      if (form.mgrSeedBias === 'lo') g.rating = pick(['KV', 'NR', 'NR', 'NU']);
      g.mgrRating = g.rating;
    });
    delete form.mgrSeedBias;
    form.newGoals.forEach(g => { g.mgrConfirmed = true; g.mgrDecision = 'agree'; });
    return form;
  }

  /* ---------------- seed everything ---------------- */
  function seedAll(companyPack) {
    const { company, people, heads } = companyPack;
    const ind = INDUSTRIES[company.industry];
    const reviews = [], goals = [], kudos = [], checkins = [], notifications = [];
    const employees = people.filter(p => p.managerId);
    const today = Date.now();
    const day = 86400000;

    /* personal goals per area (current period) */
    employees.forEach(p => { goalsForPerson(p, company, ind.goalTemplates, CURRENT_PERIOD).forEach(g => goals.push(g)); });

    /* company KPIs as goals of heads (alignment view) */
    company.kpis.forEach((k, i) => {
      const headList = Object.values(heads);
      goals.push({
        id: uid(), ownerId: headList[i % headList.length].id, areaKey: 'quality',
        title: k.title, desc: k.desc, weight: k.weight, progress: k.current,
        kpiRef: { type: 'company', id: k.id }, confirmedByManager: true,
        due: '2026-12-31', type: 'company', period: CURRENT_PERIOD,
      });
    });

    /* reviews - current cycle in mixed states + past closed */
    const states = ['pending_self','self_in_progress','self_done','manager_in_progress','manager_done','conversation_scheduled','awaiting_employee_confirmation','confirmed'];
    const participants = shuffle(employees).slice(0, Math.ceil(employees.length * 0.85));
    participants.forEach((p, idx) => {
      const st = states[idx % states.length];
      const form = emptyForm();
      form.goalsEval = goalsEvalFrom(goals, p);
      const started = today - (3 + Math.floor(rnd() * 25)) * day;
      const afterSelf = ['self_done','manager_in_progress','manager_done','conversation_scheduled','awaiting_employee_confirmation','confirmed'].includes(st);
      if (afterSelf) {
        form.newGoals = newGoalsFrom(p, company, ind.goalTemplates);
        filledSelf(form, p, company.industry);
        form.versions.push({ label: 'v1_self', at: started + 4 * day });
      }
      if (['manager_done','conversation_scheduled','awaiting_employee_confirmation','confirmed'].includes(st)) {
        filledMgr(form);
        form.versions.push({ label: 'v2_draft', at: started + 12 * day });
      }
      if (['awaiting_employee_confirmation','confirmed'].includes(st)) {
        form.conversationDate = new Date(started + 18 * day).toISOString().slice(0, 10);
        form.nextReviewDate = '2026-12-15';
        form.versions.push({ label: 'v2_final', at: started + 19 * day });
      }
      if (st === 'confirmed') {
        form.employeeComment = 'Souhlasím se závěry, díky za férový rozhovor.';
        form.versions.push({ label: 'v3_confirmed', at: started + 22 * day });
      }
      reviews.push({
        id: uid(), subjectId: p.id, evaluatorId: p.managerId,
        type: p.hiredMonthsAgo < 4 ? 'probation' : 'annual',
        period: CURRENT_PERIOD, status: st,
        startedAt: started, deadline: started + 30 * day,
        form,
      });
      /* past closed review for history & rating distribution */
      if (rnd() < 0.6 && p.hiredMonthsAgo > 14) {
        const pf = emptyForm();
        pf.goalsEval = goalsEvalFrom(goals, p);
        pf.newGoals = newGoalsFrom(p, company, ind.goalTemplates);
        filledMgr(filledSelf(pf, p, company.industry));
        pf.employeeComment = 'Potvrzuji.';
        pf.versions = [
          { label: 'v1_self', at: today - 220 * day }, { label: 'v2_draft', at: today - 210 * day },
          { label: 'v2_final', at: today - 205 * day }, { label: 'v3_confirmed', at: today - 200 * day }];
        reviews.push({
          id: uid(), subjectId: p.id, evaluatorId: p.managerId, type: 'annual',
          period: PAST_PERIOD, status: 'closed_by_hr',
          startedAt: today - 230 * day, deadline: today - 200 * day, form: pf,
        });
      }
    });

    /* kudos */
    for (let i = 0; i < Math.min(14, employees.length); i++) {
      const from = pick(employees), to = pick(employees.filter(e => e.id !== from.id));
      kudos.push({
        id: uid(), fromId: from.id, toId: to.id,
        msg: pick(KUDOS_MSGS), value: pick(['team','quality','growth','client']),
        at: today - Math.floor(rnd() * 20) * day,
      });
    }

    /* check-ins for managers */
    people.filter(p => p.isHead || p.isLead).forEach(m => {
      const reports = people.filter(p => p.managerId === m.id);
      reports.slice(0, 2).forEach(r => {
        checkins.push({
          id: uid(), managerId: m.id, employeeId: r.id,
          at: today - Math.floor(rnd() * 14) * day,
          mood: pick(['🙂', '😄', '😐']),
          notes: pick(['Kapacita OK, chce víc zpětné vazby k novému úkolu.', 'Probráno workload - domluvena priorita A/B.', 'Spokojenost dobrá, zájem o školení.']),
          next: pick(['Poslat tipy na kurz', 'Zarezervovat follow-up za 2 týdny', 'Propojit s kolegou z druhého týmu']),
        });
      });
    });

    /* klíčové pozice (succession) - 3 klíčové (1 nekrytá = vacancy risk), 1 neklíčová jako ukázka filtru */
    const keyPositions = [];
    const holders = people.filter(p => p.isHead || p.isLead).slice(0, 4);
    const yesCounts = [10, 9, 8, 5];
    holders.forEach((h, i) => {
      const yesN = yesCounts[i] != null ? yesCounts[i] : 8;
      const order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const checklist = {};
      order.forEach((q, j) => { checklist['q' + q] = j < yesN; });
      const reports = people.filter(p => p.managerId === h.id);
      const successors = (i === 1 || yesN < 7) ? [] : reports.slice(0, i === 0 ? 2 : 1)
        .map((r2, j) => {
          const s = { personId: r2.id, level: j === 0 ? 'key' : 'successor', readiness: j === 0 ? 'r1' : 'r12' };
          /* první klíčový nástupce má vyplněný checklist kandidáta (18/21 → vhodný) */
          if (i === 0 && j === 0) {
            s.checklist21 = {};
            const ord = shuffle(Array.from({ length: 21 }, (_, k) => k + 1));
            ord.forEach((q, k) => { s.checklist21['q' + q] = k < 18; });
          }
          return s;
        });
      keyPositions.push({
        id: uid(), deptKey: h.deptKey, dept: h.dept, title: h.role, holderId: h.id,
        checklist, proposedBy: null, confirmedByHr: true, successors,
      });
    });

    /* kvartální talent checky v různých stavech (ať HR karta při demu žije):
       1. manažer = final s jedním overridem, 2. = debate (čeká na HR), zbytek bez checku */
    const talentChecks = [];
    const qNow = 'Q' + (Math.floor(new Date().getMonth() / 3) + 1) + ' ' + new Date().getFullYear();
    const mgrsWithTeam = people.filter(m => people.some(p => p.managerId === m.id) && m.managerId).slice(0, 2);
    mgrsWithTeam.forEach((m, i) => {
      const team = people.filter(p => p.managerId === m.id);
      const items = team.map((p, j) => {
        const override = i === 0 && j === 0; /* první člověk prvního manažera posunut nahoru */
        return {
          personId: p.id,
          box: override ? { pot: 3, perf: 2 } : null, /* computed pozice se doplní za běhu; override je explicitní */
          source: override ? 'override' : 'computed',
          note: override ? 'Výrazný posun po převzetí projektu - navrhuju vyšší potenciál.' : '',
          attrition: null,
        };
      });
      talentChecks.push({
        id: uid(), period: qNow, managerId: m.id, status: i === 0 ? 'final' : 'debate',
        items, createdAt: today - (12 - i * 3) * day, sentAt: today - (8 - i * 3) * day,
        discussedAt: i === 0 ? today - 5 * day : null,
      });
    });
    if (mgrsWithTeam[1]) notifications.push({ id: uid(), text: 'Talent check k debatě: ' + mgrsWithTeam[1].name, forRole: 'hr', at: today - 2 * day, read: false });

    /* červená karta: jeden „potřebný potížista" (drží klíčovou pozici → priorita č. 1) */
    const redCards = [];
    const rcHolder = keyPositions.find(kp => kp.successors && !kp.successors.length && kp.holderId);
    if (rcHolder) redCards.push({
      id: uid(), personId: rcHolder.holderId, needed: true, trouble: true,
      note: 'Kritická odbornost a kontakty, ale opakované konflikty v týmu.',
      byId: null, at: today - 9 * day,
    });

    /* 360: jedna uzavřená (agregát ze 4 odpovědí) + jedna běžící s pozvánkami */
    const feedback360 = [];
    const f360subjA = keyPositions[0] && keyPositions[0].successors[0] ? people.find(p => p.id === keyPositions[0].successors[0].personId) : null;
    if (f360subjA) {
      const others = shuffle(employees.filter(p => p.id !== f360subjA.id)).slice(0, 4);
      feedback360.push({
        id: uid(), subjectId: f360subjA.id, requestedById: f360subjA.managerId,
        period: CURRENT_PERIOD, deadline: today - 3 * day, status: 'closed',
        respondents: others.map(p => ({
          personId: p.id, group: p.deptKey === f360subjA.deptKey ? 'peer' : 'internal', status: 'done',
          ratings: { teamwork: pick(['TN','PO','PO','KV']), growth: pick(['PO','KV','KV']), quality: pick(['TN','PO','KV']) },
          strengths: pick(['Vždy si najde čas pomoct, i když sám hoří.', 'Skvěle vysvětluje složité věci.', 'Drží slovo - na co kývne, to dodá.', 'Klid v krizi, tým se o něj opírá.']),
          growth: pick(['Víc delegovat, nedělat všechno sám.', 'Říkat si o zpětnou vazbu dřív.', 'Prezentovat výsledky i mimo tým.', 'Nebát se konfliktu, když je věcný.']),
        })),
      });
    }
    const f360subjB = shuffle(employees.filter(p => !f360subjA || p.id !== f360subjA.id))[0];
    if (f360subjB) {
      const invitees = shuffle(employees.filter(p => p.id !== f360subjB.id)).slice(0, 3);
      feedback360.push({
        id: uid(), subjectId: f360subjB.id, requestedById: f360subjB.managerId,
        period: CURRENT_PERIOD, deadline: today + 7 * day, status: 'collecting',
        respondents: invitees.map(p => ({ personId: p.id, group: p.deptKey === f360subjB.deptKey ? 'peer' : 'internal', status: 'invited', ratings: {}, strengths: '', growth: '' })),
      });
    }

    return { reviews, goals, kudos, checkins, notifications, keyPositions, talentChecks, redCards, feedback360 };
  }

  /* ---------------- public API ---------------- */
  window.Generator = {
    INDUSTRIES, AREAS, KPI_REQUIRED, WEIGHT_PRESETS, DEFAULT_GOAL_POLICY, COMP_LIB,
    CURRENT_PERIOD, PAST_PERIOD, SCALE,
    emptyForm, weightsFor, goalsEvalFrom,
    generate(industryKey, size) {
      const pack = buildCompany(industryKey, size, {});
      const seeded = seedAll(pack);
      return Object.assign({ people: pack.people }, { company: pack.company }, seeded);
    },
    install(industryKey, size) {
      const g = this.generate(industryKey, size);
      Store.setCompany(g.company);
      Store.replaceAll('people', g.people);
      Store.replaceAll('reviews', g.reviews);
      Store.replaceAll('goals', g.goals);
      Store.replaceAll('kudos', g.kudos);
      Store.replaceAll('checkins', g.checkins);
      Store.replaceAll('notifications', g.notifications);
      Store.replaceAll('keyPositions', g.keyPositions || []);
      Store.replaceAll('talentChecks', g.talentChecks || []);
      Store.replaceAll('redCards', g.redCards || []);
      Store.replaceAll('feedback360', g.feedback360 || []);
      return g;
    },
    installEmpty() {
      Store.setCompany({ name: 'Moje firma', industry: null, size: 0, departments: [], kpis: [], teamKpis: [], goalPolicy: Object.assign({}, DEFAULT_GOAL_POLICY), competencies: null, cycleConfig: { semiEnabled: true }, createdAt: new Date().toISOString() });
      ['people','reviews','goals','kudos','checkins','notifications','keyPositions','talentChecks','redCards','feedback360'].forEach(c => Store.replaceAll(c, []));
    },
  };
})();
