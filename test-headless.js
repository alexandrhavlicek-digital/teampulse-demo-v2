/* Headless smoke test pro Talent & Reporty (iterace 1).
   Spouštění: node test-headless.js (z adresáře demo-v2). */
const fs = require('fs');

/* --- minimal browser stubs --- */
const g = globalThis;
g.window = g;
const lsData = {};
g.localStorage = {
  getItem: k => (k in lsData ? lsData[k] : null),
  setItem: (k, v) => { lsData[k] = String(v); },
  removeItem: k => { delete lsData[k]; },
};
const fakeEl = () => ({
  innerHTML: '', hidden: false, style: {}, dataset: {}, classList: { add() {}, remove() {} },
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, onclick: null,
});
g.document = {
  documentElement: { lang: 'cs', dataset: {} },
  getElementById: () => fakeEl(),
  querySelectorAll: () => [],
  addEventListener() {},
};
g.location = { hash: '#/home', reload() {} };
g.addEventListener = () => {};

const load = f => (0, eval)(fs.readFileSync(f, 'utf8'));
load('js/i18n.js');
load('js/icons.js');
load('js/store.js');
load('js/czname.js');
load('js/generator.js');
load('js/reviews.js');
load('js/talent.js');
load('js/feedback360.js');
load('js/app.js'); /* boot proběhne proti stub DOM (onboarding větev) - dává window.App a AppFilters */

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };

/* --- 1) generátor seeduje talent sekci --- */
Generator.install('travel', 60);
const reviews = Store.list('reviews');
const withTalent = reviews.filter(r => r.form.mgr.talent && r.form.mgr.talent.potential);
ok(reviews.length > 20, `reviews vygenerovány (${reviews.length})`);
ok(withTalent.length > 5, `talent sekce v seedu (${withTalent.length}×)`);
ok(withTalent.every(r => ['low', 'mid', 'high'].includes(r.form.mgr.talent.potential)), 'potenciál má platné hodnoty');
ok(withTalent.every(r => ['low', 'mid', 'high'].includes(r.form.mgr.talent.attrition)), 'riziko odchodu má platné hodnoty');

/* --- 2) TalentLogic umisťuje lidi do matice --- */
const people = Store.list('people').filter(p => p.managerId);
const entries = people.map(p => TalentLogic.entryOf(p));
const placed = entries.filter(e => e.row && e.col);
ok(placed.length > 5, `lidí umístěno v matici (${placed.length}/${people.length})`);
ok(placed.every(e => e.row >= 1 && e.row <= 3 && e.col >= 1 && e.col <= 3), 'souřadnice v rozsahu 1-3');
const trends = entries.filter(e => e.trend !== 0);
ok(trends.length > 0, `trend spočítán u lidí s historií (${trends.length}×)`);

/* --- 3) perfCol prahy dle konceptu (0.95 / 1.10) --- */
ok(TalentLogic.perfCol(0.90) === 1 && TalentLogic.perfCol(1.0) === 2 && TalentLogic.perfCol(1.15) === 3, 'prahy výkonu 0.95/1.10');
ok(TalentLogic.perfCol(null) === null, 'null skóre → bez sloupce');

/* --- 4) grid HTML se vyrenderuje ve všech jazycích --- */
['cs', 'en', 'de'].forEach(loc => {
  I18N.setLocale(loc);
  const html = TalentGrid.gridHtml(entries);
  ok(html.includes('nine-grid') && html.includes('ng-token'), `gridHtml OK (${loc})`);
  ok(!html.includes('tal.box.'), `žádné nepřeložené klíče v gridu (${loc})`);
});
I18N.setLocale('cs');

/* --- 5) avatar: photoUrl fallback --- */
const p0 = people[0];
ok(UI.avatar(p0, 40).includes(p0.initials), 'avatar bez fotky = iniciály');
p0.photoUrl = 'https://example.com/x.jpg';
ok(UI.avatar(p0, 40).includes('<img'), 'avatar s photoUrl = fotka');
delete p0.photoUrl;

/* --- 6) soukromí: talent nesmí do zaměstnaneckého čtení ani do tisku --- */
const revSrc = fs.readFileSync('js/reviews.js', 'utf8');
ok(/withPrivate && f\.mgr\.talent/.test(revSrc), 'fullReadHtml: talent jen s withPrivate');
const printBlock = revSrc.slice(revSrc.indexOf('function printReview'), revSrc.indexOf('/* ====================== dispatcher'));
ok(!printBlock.includes('talent'), 'printReview: talent se netiskne vůbec');

/* --- 7) talent jen pro roční typ v manažerském editoru --- */
ok(revSrc.includes("r.type === 'annual' ? talentSectionHtml(f)"), 'talent sekce jen pro annual');

/* --- 8) i18n úplnost: tal.* a rev.talent.* klíče ve všech jazycích --- */
const keysUsed = new Set();
[fs.readFileSync('js/talent.js', 'utf8'), revSrc].forEach(src => {
  for (const m of src.matchAll(/(?<![A-Za-z.])t\('((?:tal|rev\.talent)[^']*)'/g)) keysUsed.add(m[1]);
});
/* dynamické klíče */
['pot.low','pot.mid','pot.high','rd.r1','rd.r12','rd.no','att.low','att.mid','att.high'].forEach(k => keysUsed.add('tal.' + k));
TalentLogic.BOXES.flat().forEach(b => { keysUsed.add('tal.box.' + b); keysUsed.add('tal.act.' + b); });
['tal.','rev.talent.'].forEach(() => {});
let missing = [];
['cs', 'en', 'de'].forEach(loc => {
  I18N.setLocale(loc);
  keysUsed.forEach(k => {
    if (k.includes('${') || k.endsWith('.')) return; // šablonové fragmenty
    const v = t(k);
    if (v === k) missing.push(loc + ':' + k);
  });
});
I18N.setLocale('cs');
ok(missing.length === 0, missing.length ? 'chybí klíče: ' + missing.slice(0, 8).join(', ') : 'i18n klíče kompletní (cs/en/de)');
ok(t('nav.talent') === 'Talent & Reporty', 'nav.talent cs');

/* --- 9) HR view se vyrenderuje bez pádu --- */
const root = fakeEl();
try { TalentViews.renderHr(root); ok(root.innerHTML.includes('nine-grid'), 'TalentViews.renderHr vyrenderován'); }
catch (e) { ok(false, 'renderHr spadl: ' + e.message); }

/* --- 9b) Můj tým: render pro manažera s největším týmem --- */
/* App definuje app.js (v testu neběží - potřebuje plný DOM); stub se stejným chováním */
g.App = g.App || { viewAs: () => Store.getSettings().viewAs || { role: 'hr', personId: null } };
(function () {
  const ps2 = Store.list('people');
  const counts = {};
  ps2.forEach(p => { if (p.managerId) counts[p.managerId] = (counts[p.managerId] || 0) + 1; });
  const mgrId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  Store.patchSettings({ viewAs: { role: 'manager', personId: mgrId } });
  const r3 = fakeEl();
  try {
    TalentViews.renderMyTeam(r3);
    ok(r3.innerHTML.includes('mt-card') && r3.innerHTML.includes('nine-grid'), `renderMyTeam vyrenderován (tým ${counts[mgrId]} lidí)`);
    ok(!r3.innerHTML.includes('mt.'), 'žádné nepřeložené mt.* klíče');
  } catch (e) { ok(false, 'renderMyTeam spadl: ' + e.message); }
  /* manažer bez týmu → empty state */
  const noTeam = ps2.find(p => !ps2.some(x => x.managerId === p.id));
  Store.patchSettings({ viewAs: { role: 'manager', personId: noTeam.id } });
  const r4 = fakeEl();
  try { TalentViews.renderMyTeam(r4); ok(r4.innerHTML.includes('empty'), 'renderMyTeam empty state OK'); }
  catch (e) { ok(false, 'renderMyTeam empty spadl: ' + e.message); }
  Store.patchSettings({ viewAs: null });
})();

/* --- 11) succession: klíčové pozice --- */
(function () {
  const kps = Store.list('keyPositions');
  ok(kps.length === 4, `seed keyPositions (${kps.length}/4)`);
  const keyOnes = kps.filter(SuccLogic.kpIsKey);
  ok(keyOnes.length === 3, `3 klíčové dle checklistu (${keyOnes.length})`);
  const uncovered = keyOnes.filter(kp => !kp.successors.length);
  ok(uncovered.length >= 1, `aspoň 1 nekrytá pozice (${uncovered.length})`);
  ok(kps.some(kp => !SuccLogic.kpIsKey(kp)), 'checklist funguje jako filtr (1 neklíčová)');
  /* prahy */
  const mk = yes => ({ checklist: Object.fromEntries(Array.from({ length: 12 }, (_, i2) => ['q' + (i2 + 1), i2 < yes])) });
  ok(SuccLogic.kpIsKey(mk(7)) && !SuccLogic.kpIsKey(mk(6)), 'práh většiny: 7/12 ANO');
  /* mapy pro org overlay */
  const maps = SuccLogic.succMaps();
  ok(Object.keys(maps.kpByHolder).length === 3, 'org overlay: jen klíčové pozice');
  ok(Object.keys(maps.succLevel).length >= 2, 'org overlay: nástupci namapováni');
  /* HR view obsahuje sekci */
  Store.patchSettings({ viewAs: null });
  const r5 = fakeEl();
  TalentViews.renderHr(r5);
  ok(r5.innerHTML.includes('kp-row') && r5.innerHTML.includes('kp-add-btn'), 'sekce Nástupnictví v HR view');
  ok(!r5.innerHTML.match(/kp\.\w/), 'žádné nepřeložené kp.* klíče');
})();

/* --- 11b) kvartální talent check --- */
(function () {
  const checks = Store.list('talentChecks');
  ok(checks.length === 2, `seed talentChecks (${checks.length}/2)`);
  ok(checks.some(c => c.status === 'final') && checks.some(c => c.status === 'debate'), 'stavy final + debate v seedu');
  /* override z finálního checku se propíše do matice */
  const fin = checks.find(c => c.status === 'final');
  const ovItem = fin.items.find(i => i.source === 'override');
  ok(!!ovItem, 'finální check má override');
  const e = TalentLogic.entryOf(Store.get('people', ovItem.personId));
  ok(e.row === ovItem.box.pot && e.col === ovItem.box.perf && e.overridden, 'override se propsal do entryOf');
  /* period + kadence */
  ok(/^Q[1-4] \d{4}$/.test(TalentCheck.tcPeriod()), 'tcPeriod formát Q');
  const co2 = Store.getCompany(); co2.cycleConfig = Object.assign({}, co2.cycleConfig, { talentCheck: 'semi' }); Store.setCompany(co2);
  ok(/^H[12] \d{4}$/.test(TalentCheck.tcPeriod()), 'tcPeriod formát H při pololetní kadenci');
  co2.cycleConfig.talentCheck = 'q'; Store.setCompany(co2);
  /* tcStart vytvoří draft s computed items */
  const ps3 = Store.list('people');
  const mgr3 = ps3.find(m => ps3.some(p => p.managerId === m.id) && !TalentCheck.tcOf(m.id));
  const team3 = ps3.filter(p => p.managerId === mgr3.id);
  const draft = TalentCheck.tcStart(mgr3, team3);
  ok(draft.status === 'draft' && draft.items.length === team3.length && draft.items.every(i => i.source === 'computed' && i.box === null), 'tcStart: draft s computed items');
  /* workflow: draft → debate → final */
  Store.update('talentChecks', draft.id, { status: 'debate', sentAt: Date.now() });
  Store.update('talentChecks', draft.id, { status: 'final', discussedAt: Date.now() });
  ok(TalentCheck.tcOf(mgr3.id).status === 'final', 'přechody stavů fungují');
  Store.remove('talentChecks', draft.id);
  /* render checku pro manažera (draft se založí) */
  Store.patchSettings({ viewAs: { role: 'manager', personId: mgr3.id } });
  const r6 = fakeEl();
  try {
    TalentViews.renderCheck(r6, null);
    ok(r6.innerHTML.includes('nine-grid') && r6.innerHTML.includes('data-cell'), 'renderCheck: editovatelný grid s drop zónami');
    ok(!r6.innerHTML.match(/tc\.\w/), 'žádné nepřeložené tc.* klíče');
  } catch (err) { ok(false, 'renderCheck spadl: ' + err.message); }
  const created = TalentCheck.tcOf(mgr3.id);
  if (created) Store.remove('talentChecks', created.id);
  Store.patchSettings({ viewAs: null });
})();

/* --- 11c) checklist kandidáta --- */
(function () {
  const mkc = (yes, no) => { const cl = {}; for (let i2 = 1; i2 <= yes; i2++) cl['q' + i2] = true; for (let i2 = yes + 1; i2 <= yes + no; i2++) cl['q' + i2] = false; return cl; };
  ok(SuccLogic.candThreshold() === 16, 'práh default 16/21');
  ok(SuccLogic.candResult(mkc(16, 0)) === 'fit', '16 ANO → vhodný');
  ok(SuccLogic.candResult(mkc(10, 6)) === 'notfit', '6 NE → už nedosáhne prahu');
  ok(SuccLogic.candResult(mkc(10, 3)) === null, 'rozpracováno → bez verdiktu');
  const kpsC = Store.list('keyPositions');
  const withCl = kpsC.flatMap(kp => kp.successors || []).filter(s => s.checklist21 && Object.keys(s.checklist21).length);
  ok(withCl.length >= 1 && SuccLogic.candResult(withCl[0].checklist21) === 'fit', 'seed: nástupce s checklistem 18/21 → vhodný');
})();

/* --- 11d) červená karta --- */
(function () {
  const rcs = Store.list('redCards');
  ok(rcs.length === 1, `seed redCards (${rcs.length}/1)`);
  ok(RedCard.rcQuadrant(rcs[0]) === 'nt', 'seed: potřebný potížista');
  const maps2 = SuccLogic.succMaps();
  ok(maps2.red[rcs[0].personId] === 'nt', 'červená karta v org overlay mapách');
  ok(RedCard.rcQuadrant({ needed: false, trouble: false }) === 'dp', 'kvadranty matice potřebnosti');
  const r7 = fakeEl();
  TalentViews.renderHr(r7);
  ok(r7.innerHTML.includes('rc-grid') && !r7.innerHTML.match(/rc\.\w/), 'matice potřebnosti v HR view, klíče přeložené');
})();

/* --- 11e) 360 zpětná vazba --- */
(function () {
  const fs360 = Store.list('feedback360');
  ok(fs360.length === 2, `seed feedback360 (${fs360.length}/2)`);
  const closed = fs360.find(f => f.status === 'closed');
  const agg = Feedback360.aggregate(closed);
  ok(agg && agg.n >= 3, `agregát z uzavřené 360 (${agg && agg.n} odpovědí)`);
  ok(agg.ratings.teamwork && ['TN','PO','KV','NR','NU'].includes(agg.ratings.teamwork.label), 'agregovaný rating mapuje na škálu');
  ok(agg.strengths.length > 0 && agg.growth.length > 0, 'otevřené texty v agregátu (bez atribuce)');
  /* anonymita: pod 3 odpovědi žádný agregát */
  const collecting = fs360.find(f => f.status === 'collecting');
  ok(Feedback360.aggregate(collecting) === null, 'anonymita: <3 odpovědi → žádný agregát');
  /* pending pro respondenta */
  const invitee = collecting.respondents[0].personId;
  ok(Feedback360.pendingFor(invitee).length === 1, 'pendingFor najde pozvánku respondenta');
  /* vyplnění odpovědi → done, po všech → closed */
  collecting.respondents.forEach(r8 => {
    r8.ratings = { teamwork: 'PO', growth: 'KV', quality: 'PO' }; r8.strengths = 'x'; r8.growth = 'y'; r8.status = 'done';
  });
  collecting.status = 'closed'; Store.update('feedback360', collecting.id, {});
  ok(Feedback360.aggregate(collecting) !== null, 'po 3 odpovědích agregát existuje');
  /* tři pohledy render */
  const tv = Feedback360Views.threeViewsHtml(closed.subjectId);
  ok(tv.includes('f360') === false && tv.includes('<table'), 'tři pohledy: tabulka bez nepřeložených klíčů');
})();

/* --- 11f) filtry + karta člověka: i18n klíče kompletní --- */
(function () {
  const need = ['flt.person', 'flt.reset', 'flt.noMatch', 'pc.manager', 'pc.reviews', 'pc.evidence', 'pc.holdsKey', 'pc.succOf', 'pc.no360'];
  let miss = [];
  ['cs', 'en', 'de'].forEach(loc => { I18N.setLocale(loc); need.forEach(k => { if (t(k) === k) miss.push(loc + ':' + k); }); });
  I18N.setLocale('cs');
  ok(miss.length === 0, miss.length ? 'chybí: ' + miss.join(', ') : 'flt.* + pc.* klíče kompletní (cs/en/de)');
})();

/* --- 11g) řazení tabulek: applySort --- */
(function () {
  const items = [{ n: 'B', v: 2 }, { n: 'A', v: null }, { n: 'C', v: 1 }];
  AppFilters.sortState('t1').key = 'v'; AppFilters.sortState('t1').dir = 1;
  const sorted = AppFilters.applySort(items, 't1', { v: x => x.v });
  ok(sorted[0].v === 1 && sorted[1].v === 2 && sorted[2].v === null, 'applySort: čísla vzestupně, null na konec');
  AppFilters.sortState('t1').dir = -1;
  const desc = AppFilters.applySort(items, 't1', { v: x => x.v });
  ok(desc[0].v === 2 && desc[1].v === 1, 'applySort: sestupně po druhém kliku');
  AppFilters.sortState('t2').key = 'n'; AppFilters.sortState('t2').dir = 1;
  const byName = AppFilters.applySort(items, 't2', { n: x => x.n });
  ok(byName.map(x => x.n).join('') === 'ABC', 'applySort: řetězce přes localeCompare');
  ok(AppFilters.STATUS_ORDER.indexOf('pending_self') < AppFilters.STATUS_ORDER.indexOf('confirmed'), 'STATUS_ORDER drží pořadí procesu');
  ok(t('flt.sort') !== 'flt.sort', 'flt.sort přeložen');
})();

/* --- 11h) manažerský velín: podstrom a scope --- */
(function () {
  const ps4 = Store.list('people');
  /* najdi manažera manažerů (jeho přímý podřízený sám někoho vede) */
  const mm = ps4.find(m => ps4.some(p => p.managerId === m.id && ps4.some(x => x.managerId === p.id)));
  if (!mm) { ok(true, 'velín: žádný manažer manažerů v seedu (přeskočeno)'); return; }
  Store.patchSettings({ viewAs: { role: 'manager', personId: mm.id } });
  const r9 = fakeEl();
  TalentViews.renderMyTeam(r9);
  ok(r9.innerHTML.includes('data-mt-scope="sub"'), 'velín: přepínač podtýmů se nabízí');
  ok(r9.innerHTML.includes('kpi-num'), 'velín: KPI řádek vyrenderován');
  ok(!r9.innerHTML.match(/mt\.\w/), 'žádné nepřeložené mt.* klíče ve velínu');
  Store.patchSettings({ viewAs: null });
})();

/* --- 11i) eNPS pulse --- */
(function () {
  load('js/nps.js');
  const ws = Store.list('npsWaves');
  ok(ws.length === 4, `seed npsWaves (${ws.length}/4)`);
  ok(ws.filter(w => w.status === 'closed').length === 3 && !!NPS.openWave(), '3 uzavřené + 1 běžící vlna');
  /* ANONYMITA: odpovědi nesmí nést identitu */
  ok(ws.every(w => w.responses.every(r => !('personId' in r) && !('name' in r))), 'odpovědi bez identity (žádné personId)');
  /* kategorie a výpočet */
  ok(NPS.npsCat(6) === 'det' && NPS.npsCat(7) === 'pass' && NPS.npsCat(9) === 'prom', 'kategorie 0-6/7-8/9-10');
  ok(NPS.enps([{nps:9},{nps:9},{nps:2}]) === 33, 'eNPS = %prom - %det');
  ok(NPS.enps([{nps:9},{nps:9}]) === null, 'guard: pod 3 odpovědi žádné číslo');
  const last = NPS.closedWaves().slice(-1)[0];
  const firmScore = NPS.enps(NPS.slice(last, null));
  ok(firmScore != null && firmScore >= -100 && firmScore <= 100, `firemní eNPS spočítán (${firmScore})`);
  /* malý tým → tooFew (žádný únik) */
  const tiny = NPS.slice(last, { teamIds: new Set(['neexistujici']) });
  ok(NPS.enps(tiny) === null, 'malý/prázdný tým → žádná data');
  /* pending pro zaměstnance, který neodpověděl */
  const emp = Store.list('people').find(p => p.managerId && !(NPS.openWave().respondedIds || []).includes(p.id));
  ok(!!NPS.pendingWaveFor(emp.id), 'pendingWaveFor najde běžící vlnu');
  /* HR karta render + i18n */
  const html = NPSViews.hrCardHtml();
  ok(html.includes('nps-matrix') && html.includes('nps-dist'), 'HR karta: matice + rozložení');
  ok(!html.match(/nps\.\w/), 'žádné nepřeložené nps.* klíče');
  /* engagement */
  ok(NPS.engagement({ dims: { work: 8, growth: 6, support: 7 } }) === 7, 'engagement = průměr dimenzí');
})();

/* --- 11j) 1:1 check-iny: seed s historií pro tab Přehled --- */
(function () {
  const cis = Store.list('checkins');
  ok(cis.length > 0, `seed checkins (${cis.length}×)`);
  const DAY = 24 * 3600 * 1000;
  const span = Math.max(...cis.map(c => c.at)) - Math.min(...cis.map(c => c.at));
  ok(span > 90 * DAY, `historie 1:1 přes 90 dní (span ${Math.round(span / DAY)} d) — graf po měsících má data`);
  ok(cis.every(c => ['😟', '😐', '🙂', '😄'].includes(c.mood)), 'všechny nálady z platné škály');
  /* každý pár manažer×report má sérii (trend spočitatelný) */
  const byPair = {};
  cis.forEach(c => { const k = c.managerId + '|' + c.employeeId; byPair[k] = (byPair[k] || 0) + 1; });
  ok(Object.values(byPair).every(n => n >= 5), 'každý seedovaný pár má min. 5 záznamů');
})();

/* --- 12) store migrace: stará DB bez keyPositions --- */
(function () {
  const raw = JSON.parse(localStorage.getItem('teampulse_demo_v2'));
  delete raw.keyPositions;
  localStorage.setItem('teampulse_demo_v2', JSON.stringify(raw));
  /* nová instance store přes reload souboru */
  load('js/store.js');
  try {
    Store.insert('keyPositions', { id: 'test1', title: 'X', checklist: {}, successors: [] });
    ok(Store.get('keyPositions', 'test1') !== null, 'migrace: insert do doplněné kolekce funguje');
    Store.remove('keyPositions', 'test1');
  } catch (e) { ok(false, 'migrace selhala: ' + e.message); }
})();

/* --- 13) Copilot: simulovaný engine + akční flows --- */
(function () {
  load('js/copilot.js');
  ok(Array.isArray(Store.list('copilotThreads')) && Array.isArray(Store.list('copilotTasks')), 'store migrace: copilot kolekce existují');

  /* HR persona: welcome + reporting */
  Store.patchSettings({ viewAs: null, copilotEnabled: true });
  ok(Copilot.enabled(), 'copilot je defaultně zapnutý');
  const th = Copilot.newThread();
  ok(th.msgs.length === 1 && th.msgs[0].who === 'bot' && th.msgs[0].html.length > 20, 'nový chat začíná proaktivním uvítáním');
  ok((th.msgs[0].chips || []).length > 0, 'uvítání nabízí akční chipy');
  const last = t2 => t2.msgs[t2.msgs.length - 1];
  Copilot.process(th, 'Jaký je stav hodnocení?');
  ok(last(th).who === 'bot' && last(th).html.includes(t('cop.r.completion')), 'report: stav hodnocení odpovídá daty');
  Copilot.process(th, 'Jaká je nálada v týmu?');
  ok(last(th).html.includes(t('cop.r.mood')) || last(th).html.includes('1:1'), 'report: nálada z 1:1');
  Copilot.process(th, 'eNPS?');
  ok(last(th).html.includes('eNPS') || last(th).html.includes(t('cop.r.anon')) || last(th).html.includes(t('cop.r.noData')), 'report: eNPS (nebo anonymita)');

  /* intent parser */
  ok(Copilot.detect('pochval Janu za prezentaci') === 'kudos', 'detect: kudos');
  ok(Copilot.detect('kolik lidí nemá uzavřené hodnocení?') === 'r.completion', 'detect: completion');
  ok(Copilot.detect('připomeň mi každý týden stav hodnocení') === 'schedule', 'detect: schedule před reportem');
  ok(Copilot.detect('chci vyplnit sebehodnocení') === 'self', 'detect: self');
  ok(Copilot.detect('xyzzy nesmysl') === null, 'detect: fallback');

  /* kudos flow end-to-end */
  const ps5 = Store.list('people');
  const pK = ps5.find(p => p.managerId);
  const kb = Store.list('kudos').length;
  Copilot.process(th, 'pochval ' + pK.name + ' za skvělou práci na projektu');
  if (th.state && th.state.step === 'who') Copilot.reply(th, { val: pK.id, label: pK.name });
  if (th.state && th.state.step === 'msg') Copilot.reply(th, { text: 'skvělá práce na projektu' });
  if (th.state && th.state.step === 'value') Copilot.reply(th, { val: 'quality', label: 'q' });
  if (th.state && th.state.step === 'confirm') Copilot.reply(th, { val: 'ok', label: 'ok' });
  ok(Store.list('kudos').length === kb + 1 && !th.state, 'kudos flow: propsáno do Store');
  ok(Store.list('kudos').slice(-1)[0].toId === pK.id, 'kudos flow: správný příjemce');

  /* 1:1 flow (manažer) */
  const counts5 = {};
  ps5.forEach(p => { if (p.managerId) counts5[p.managerId] = (counts5[p.managerId] || 0) + 1; });
  const mgr5 = Object.keys(counts5).sort((a, b) => counts5[b] - counts5[a])[0];
  const emp5 = ps5.find(p => p.managerId === mgr5);
  Store.patchSettings({ viewAs: { role: 'manager', personId: mgr5 } });
  const th2 = Copilot.newThread();
  const cb5 = Store.list('checkins').length;
  Copilot.process(th2, 'zapiš 1:1 s ' + emp5.firstName + ' ' + emp5.lastName);
  if (th2.state && th2.state.step === 'who') Copilot.reply(th2, { val: emp5.id, label: emp5.name });
  if (th2.state && th2.state.step === 'mood') Copilot.reply(th2, { val: '🙂', label: '🙂' });
  if (th2.state && th2.state.step === 'notes') Copilot.reply(th2, { text: 'Řešili jsme projekt a kapacity.' });
  if (th2.state && th2.state.step === 'next') Copilot.reply(th2, { val: '', label: 'skip' });
  ok(Store.list('checkins').length === cb5 + 1 && !th2.state, '1:1 flow: záznam uložen');
  ok(Store.list('checkins').slice(-1)[0].managerId === mgr5, '1:1 flow: manažer = aktuální persona');

  /* sebehodnocení flow (zaměstnanec) */
  const er5 = Store.list('reviews').find(r => ['pending_self', 'self_in_progress'].includes(r.status));
  Store.patchSettings({ viewAs: { role: 'employee', personId: er5.subjectId } });
  const th3 = Copilot.newThread();
  Copilot.process(th3, 'chci vyplnit sebehodnocení');
  Copilot.reply(th3, { text: 'Povedla se mi migrace klientů.' });
  Copilot.reply(th3, { text: 'Náročné bylo Q2.' });
  Copilot.reply(th3, { text: 'Chci se zlepšit v prezentování.' });
  let g5 = 0;
  while (th3.state && th3.state.step === 'rate' && g5++ < 12) Copilot.reply(th3, { val: 'PO', label: 'PO' });
  if (th3.state && th3.state.step === 'confirm') Copilot.reply(th3, { val: 'ok', label: 'ok' });
  const er5b = Store.get('reviews', er5.id);
  ok(er5b.status === 'self_done' && !th3.state, 'self flow: status → self_done');
  ok(er5b.form.self.success.includes('migrace') && (er5b.form.self.areas.teamwork === 'PO' || (er5b.form.compRatings && Object.keys(er5b.form.compRatings.self).length)), 'self flow: form.self propsán');

  /* vyhodnocení flow (manažer) */
  const rv5 = Store.list('reviews').find(r => r.period === Generator.CURRENT_PERIOD && r.status === 'self_done' && r.evaluatorId);
  Store.patchSettings({ viewAs: { role: 'manager', personId: rv5.evaluatorId } });
  const th4 = Copilot.newThread();
  Copilot.process(th4, 'vyhodnoť ' + (Store.get('people', rv5.subjectId) || {}).name);
  if (th4.state && th4.state.step === 'who') Copilot.reply(th4, { val: rv5.subjectId, label: 'x' });
  let g6 = 0;
  while (th4.state && g6++ < 40) {
    const s5 = th4.state.step;
    if (s5 === 'rate') Copilot.reply(th4, { val: 'KV', label: 'KV' });
    else if (s5 === 'goals') Copilot.reply(th4, { val: 'agree', label: 'ok' });
    else if (s5 === 'strengths') Copilot.reply(th4, { val: 'Tahoun týmu.', label: 'x' });
    else if (s5 === 'confirm') Copilot.reply(th4, { val: 'ok', label: 'ok' });
    else break;
  }
  const rv5b = Store.get('reviews', rv5.id);
  ok(rv5b.status === 'manager_done', 'eval flow: status → manager_done');
  ok(Object.values(rv5b.form.mgr.areas).every(Boolean) || (rv5b.form.compRatings && Object.keys(rv5b.form.compRatings.mgr).length), 'eval flow: ratingy manažera propsány');
  ok(rv5b.form.goalsEval.every(g7 => g7.mgrConfirmed && g7.mgrDecision), 'eval flow: rozhodnutí u všech cílů');

  /* naplánované úlohy */
  Copilot.process(th4, 'připomeň mi každý týden stav hodnocení');
  const tk5 = Copilot.tasks();
  ok(tk5.length === 1 && tk5[0].freq === 'weekly' && /hodnocen/.test(tk5[0].text), `úloha uložena (${tk5.length ? tk5[0].text : '-'})`);
  Store.update('copilotTasks', tk5[0].id, { nextAt: Date.now() - 1000 });
  const ml5 = th4.msgs.length;
  Copilot.runDueTasks(th4);
  ok(th4.msgs.length > ml5, 'due úloha se spustila při otevření');
  ok(Copilot.tasks()[0].nextAt > Date.now(), 'opakovaná úloha se přeplánovala');

  /* uložené prompty + práva zaměstnance + vypnutí */
  ok(!!Copilot.savePrompt('Jaká je nálada v týmu?') && Copilot.prompts().length === 1, 'prompt uložen per persona');
  Store.patchSettings({ viewAs: { role: 'employee', personId: er5.subjectId } });
  const th6 = Copilot.newThread();
  Copilot.process(th6, 'Jaký je stav hodnocení?');
  ok(!last(th6).html.includes(t('cop.r.openList').split('(')[0].trim()), 'práva: zaměstnanec nevidí výčet cizích hodnocení');
  ok(Copilot.prompts().length === 0, 'práva: prompty jsou per persona');
  Store.patchSettings({ copilotEnabled: false });
  ok(!Copilot.enabled(), 'vypnutí copilota v nastavení');
  Store.patchSettings({ copilotEnabled: true, viewAs: null });

  /* i18n úplnost cop.* */
  const copSrc = fs.readFileSync('js/copilot.js', 'utf8');
  const copKeys = new Set();
  for (const m of copSrc.matchAll(/(?<![A-Za-z.])(?:t|fmt)\('(cop\.[^']*)'/g)) copKeys.add(m[1]);
  ['daily', 'weekly', 'monthly', 'once'].forEach(k => copKeys.add('cop.t.freq.' + k));
  [1, 2, 3, 4, 5, 6].forEach(i => copKeys.add('cop.cap.' + i));
  let missC = [];
  ['cs', 'en', 'de'].forEach(loc => {
    I18N.setLocale(loc);
    copKeys.forEach(k => { if (k.endsWith('.')) return; /* dynamické fragmenty */ if (t(k) === k) missC.push(loc + ':' + k); });
  });
  I18N.setLocale('cs');
  ok(missC.length === 0, missC.length ? 'chybí cop.* klíče: ' + missC.slice(0, 8).join(', ') : `cop.* i18n kompletní (${copKeys.size} klíčů × 3 jazyky)`);

  /* render smoke (stub DOM) */
  try { CopilotViews.render(fakeEl()); ok(true, 'CopilotViews.render nespadne na stub DOM'); }
  catch (e) { ok(false, 'CopilotViews.render spadl: ' + e.message); }
})();

/* --- 14) skloňování českých jmen (CzName) --- */
(function () {
  I18N.setLocale('cs');
  const F = [
    ['Marek', 'voc', 'Marku'], ['Marek', 'acc', 'Marka'], ['Marek', 'ins', 'Markem'],
    ['Petr', 'voc', 'Petře'], ['Tomáš', 'voc', 'Tomáši'], ['Tomáš', 'acc', 'Tomáše'],
    ['Jan', 'voc', 'Jane'], ['Karel', 'voc', 'Karle'], ['Karel', 'acc', 'Karla'],
    ['Daniel', 'voc', 'Danieli'], ['Ondřej', 'acc', 'Ondřeje'], ['Vojtěch', 'voc', 'Vojtěchu'],
    ['Radek', 'voc', 'Radku'], ['Aleš', 'voc', 'Aleši'], ['Štěpán', 'voc', 'Štěpáne'],
    ['Jana', 'voc', 'Jano'], ['Jana', 'acc', 'Janu'], ['Jana', 'ins', 'Janou'],
    ['Lucie', 'acc', 'Lucii'], ['Lucie', 'ins', 'Lucií'], ['Tereza', 'voc', 'Terezo'],
  ];
  let badF = [];
  F.forEach(([n, k, e]) => { if (CzName.first(n, k) !== e) badF.push(`${n}/${k}→${CzName.first(n, k)}≠${e}`); });
  ok(badF.length === 0, badF.length ? 'křestní: ' + badF.join(', ') : `křestní jména OK (${F.length} tvarů)`);
  const FU = [
    ['Jana Nováková', 'acc', 'Janu Novákovou'], ['Jana Nováková', 'ins', 'Janou Novákovou'],
    ['Petr Černý', 'acc', 'Petra Černého'], ['Petr Černý', 'ins', 'Petrem Černým'],
    ['Tomáš Němec', 'acc', 'Tomáše Němce'], ['Marek Svoboda', 'ins', 'Markem Svobodou'],
    ['Karel Vaněk', 'acc', 'Karla Vaňka'], ['David Kovář', 'acc', 'Davida Kováře'],
    ['Lucie Sedláčková', 'acc', 'Lucii Sedláčkovou'], ['Adam Kratochvíl', 'ins', 'Adamem Kratochvílem'],
  ];
  let badU = [];
  FU.forEach(([n, k, e]) => { if (CzName.full(n, k) !== e) badU.push(`${n}/${k}→${CzName.full(n, k)}≠${e}`); });
  ok(badU.length === 0, badU.length ? 'celá jména: ' + badU.join(', ') : `celá jména OK (${FU.length} tvarů)`);
  /* cizí jména se neskloňují */
  ok(CzName.full('John Smith', 'acc') === 'John Smith' && CzName.first('Ching', 'voc') === 'Ching', 'cizí jména beze změny');
  /* mimo cs locale beze změny */
  I18N.setLocale('en');
  ok(CzName.first('Marek', 'voc') === 'Marek' && CzName.full('Jana Nováková', 'acc') === 'Jana Nováková', 'EN/DE: neskloňuje se');
  I18N.setLocale('cs');
  /* generátorová jména: každé křestní je v whitelistu (skloňování pokryje celé demo) */
  const genSrc = fs.readFileSync('js/generator.js', 'utf8');
  const mM = genSrc.match(/const MALE = \[([^\]]+)\]/)[1];
  const mF = genSrc.match(/const FEMALE = \[([^\]]+)\]/)[1];
  const allFirst = (mM + ',' + mF).match(/'([^']+)'/g).map(x => x.slice(1, -1));
  const unknown = allFirst.filter(n => !CzName.isCzech(n));
  ok(unknown.length === 0, unknown.length ? 'mimo whitelist: ' + unknown.join(', ') : `všechna generátorová jména ve whitelistu (${allFirst.length})`);
  /* nasazení: pozdrav v aplikaci i Copilotu používá vokativ */
  const appSrc2 = fs.readFileSync('js/app.js', 'utf8');
  const copSrc2 = fs.readFileSync('js/copilot.js', 'utf8');
  ok(appSrc2.includes("CzName.first(me.firstName, 'voc')"), 'app: pozdrav na Přehledu skloňuje (vokativ)');
  ok(copSrc2.includes("CzName.first(p.firstName, 'voc')") && copSrc2.includes("CzName.full") , 'copilot: vokativ + akuzativ/instrumentál ve flows');
})();

/* --- 15) mobilní navigace: všechny sekce dostupné --- */
(function () {
  const appSrc3 = fs.readFileSync('js/app.js', 'utf8');
  ok(appSrc3.includes("id=\"mn-more\"") && appSrc3.includes('moreItems'), 'mobilní menu „Více" existuje');
  /* moreItems = visible − mobileTabs → sjednocení pokrývá všechny viditelné položky NAV */
  ok(appSrc3.includes('visible.filter(n => !n.sec && !mobileTabs.includes(n))'), 'Více = zbytek viditelného menu (kompletní pokrytí rolí)');
  ok(t('nav.more') === 'Více', 'nav.more cs');
  ['en', 'de'].forEach(loc => { I18N.setLocale(loc); ok(t('nav.more') !== 'nav.more', 'nav.more ' + loc); });
  I18N.setLocale('cs');
})();

/* --- 10) empty state: prázdná firma nesmí spadnout --- */
Generator.installEmpty();
try { const r2 = fakeEl(); TalentViews.renderHr(r2); ok(true, 'renderHr na prázdné firmě OK'); }
catch (e) { ok(false, 'renderHr na prázdné firmě spadl: ' + e.message); }

console.log(failed ? `\n${failed} TEST(Ů) SELHALO` : '\nVŠECHNY TESTY PROŠLY');
process.exit(failed ? 1 : 0);
