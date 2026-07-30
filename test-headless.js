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
load('js/feedback.js');
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

/* --- 13b) Copilot v2: plné pokrytí aplikace --- */
(function () {
  Store.patchSettings({ viewAs: null, copilotEnabled: true });
  const ps6 = Store.list('people');
  const anyP = ps6.find(p => p.managerId);
  const last6 = t2 => t2.msgs[t2.msgs.length - 1];

  /* intent parser v2 */
  const det = [
    ['naplánuj rozhovor s Janou na zítra', 'conv'],
    ['připomeň mi každý týden stav hodnocení', 'schedule'],
    ['potvrzuji své hodnocení', 'confirm'],
    ['chci odpovědět na eNPS pulse', 'npsFill'],
    ['vyžádej 360 pro ' + anyP.firstName, 'f360Req'],
    ['chci vyplnit 360° zpětnou vazbu', 'f360Fill'],
    ['přidej cíl zlepšit angličtinu', 'goalAdd'],
    ['nastav progress cíle na 60 %', 'goalProg'],
    ['jak jsme na tom s KPI?', 'r.kpi'],
    ['nastav KPI na 55 %', 'kpiSet'],
    ['kdo je ' + anyP.firstName + ' ' + anyP.lastName + '?', 'r.person'],
    ['jak je na tom můj tým?', 'r.team'],
    ['co je nového?', 'r.notif'],
    ['co znamená TN?', 'r.scale'],
    ['ukaž talent přehled', 'r.talent'],
    ['spusť nový cyklus', 'cycle'],
    ['přepni na glass téma', 'theme'],
    ['přidej člověka Jan Testovací', 'personAdd'],
    ['jak funguje hodnocení?', 'howto'],
    ['vypni se, copilote', 'copOff'],
  ];
  let badD = [];
  det.forEach(([txt, want]) => { const g8 = Copilot.detect(txt); if (g8 !== want) badD.push(`"${txt}"→${g8}≠${want}`); });
  ok(badD.length === 0, badD.length ? 'detect v2: ' + badD.join('; ') : `detect v2 OK (${det.length} frází)`);
  ok(Copilot.detect('připomeň ' + anyP.firstName + ' hodnocení') === 'remind', 'detect: remind (jiné osobě) ≠ schedule');

  /* cíl: přidání (zaměstnanec) */
  const emp6 = ps6.find(p => p.managerId && !ps6.some(x => x.managerId === p.id));
  Store.patchSettings({ viewAs: { role: 'employee', personId: emp6.id } });
  const thA = Copilot.newThread();
  const gb = Store.list('goals').length;
  Copilot.process(thA, 'přidej cíl: Zlepšit prezentační dovednosti');
  if (thA.state && thA.state.step === 'title') Copilot.reply(thA, { text: 'Zlepšit prezentační dovednosti' });
  if (thA.state && thA.state.step === 'area') Copilot.reply(thA, { val: 'growth' });
  if (thA.state && thA.state.step === 'kpi') Copilot.reply(thA, { val: '' });
  if (thA.state && thA.state.step === 'weight') Copilot.reply(thA, { val: '30' });
  const newG = Store.list('goals').slice(-1)[0];
  ok(Store.list('goals').length === gb + 1 && newG.ownerId === emp6.id && !thA.state, 'goalAdd: cíl založen přes chat');
  /* cíl: progress */
  Copilot.process(thA, 'nastav progress cíle prezentační na 60 %');
  ok(Store.get('goals', newG.id).progress === 60 && !thA.state, 'goalProg: progress 60 % (fuzzy match názvu)');

  /* potvrzení hodnocení (zaměstnanec) */
  const rc6 = Store.list('reviews').find(r => r.status === 'awaiting_employee_confirmation');
  Store.patchSettings({ viewAs: { role: 'employee', personId: rc6.subjectId } });
  const thB = Copilot.newThread();
  Copilot.process(thB, 'potvrzuji hodnocení');
  if (thB.state && thB.state.step === 'comment') Copilot.reply(thB, { val: '' });
  if (thB.state && thB.state.step === 'decide') Copilot.reply(thB, { val: 'agree' });
  ok(Store.get('reviews', rc6.id).status === 'confirmed' && !thB.state, 'confirm: hodnocení potvrzeno shodou přes chat');

  /* rozhovor (manažer) */
  const rv6 = Store.list('reviews').find(r => r.period === Generator.CURRENT_PERIOD && r.status === 'manager_done' && r.evaluatorId);
  if (rv6) {
    Store.patchSettings({ viewAs: { role: 'manager', personId: rv6.evaluatorId } });
    const thC = Copilot.newThread();
    const subj6 = Store.get('people', rv6.subjectId);
    Copilot.process(thC, 'naplánuj rozhovor s ' + subj6.firstName + ' ' + subj6.lastName + ' na zítra');
    if (thC.state && thC.state.step === 'who') Copilot.reply(thC, { val: rv6.subjectId });
    const rv6b = Store.get('reviews', rv6.id);
    ok(rv6b.status === 'conversation_scheduled' && !!rv6b.form.conversationDate, 'conv: rozhovor naplánován + datum');
  } else ok(true, 'conv: žádné manager_done v seedu (přeskočeno)');

  /* eNPS odpověď (zaměstnanec s pending vlnou) */
  const wave6 = NPS.openWave();
  const emp7 = ps6.find(p => p.managerId && !(wave6.respondedIds || []).includes(p.id));
  Store.patchSettings({ viewAs: { role: 'employee', personId: emp7.id } });
  const thD = Copilot.newThread();
  const nb6 = wave6.responses.length;
  Copilot.process(thD, 'chci odpovědět na eNPS');
  ['9', '8', '7', '8'].forEach(v9 => { if (thD.state) Copilot.reply(thD, { val: v9 }); });
  if (thD.state && thD.state.step === 'comment') Copilot.reply(thD, { val: '' });
  const w6b = Store.get('npsWaves', wave6.id);
  ok(w6b.responses.length === nb6 + 1 && !('personId' in w6b.responses[w6b.responses.length - 1]), 'npsFill: odpověď uložena BEZ identity');
  ok((w6b.respondedIds || []).includes(emp7.id), 'npsFill: respondedIds odděleně');

  /* 360 vyžádání (HR) + vyplnění (respondent) */
  Store.patchSettings({ viewAs: null });
  const thE = Copilot.newThread();
  const fb6 = Store.list('feedback360').length;
  const subj7 = ps6.find(p => p.managerId && ps6.filter(x => x.deptKey === p.deptKey).length >= 4);
  Copilot.process(thE, 'vyžádej 360 pro ' + subj7.firstName + ' ' + subj7.lastName);
  if (thE.state && thE.state.step === 'who') Copilot.reply(thE, { val: subj7.id });
  if (thE.state && thE.state.step === 'confirm') Copilot.reply(thE, { val: 'ok' });
  const newF = Store.list('feedback360').slice(-1)[0];
  ok(Store.list('feedback360').length === fb6 + 1 && newF.respondents.length >= 3, '360 request: založeno s ≥3 respondenty');
  const resp6 = newF.respondents[0];
  Store.patchSettings({ viewAs: { role: 'employee', personId: resp6.personId } });
  const thF = Copilot.newThread();
  Copilot.process(thF, 'chci vyplnit 360 zpětnou vazbu');
  let g9 = 0;
  while (thF.state && thF.state.step === 'rate' && g9++ < 12) Copilot.reply(thF, { val: 'PO' });
  if (thF.state && thF.state.step === 'strengths') Copilot.reply(thF, { text: 'Skvělá spolupráce.' });
  if (thF.state && thF.state.step === 'growth') Copilot.reply(thF, { text: 'Více delegovat.' });
  ok(Store.get('feedback360', newF.id).respondents[0].status === 'done', '360 fill: odpověď respondenta uložena');

  /* KPI set (HR) + report */
  Store.patchSettings({ viewAs: null });
  const thG = Copilot.newThread();
  const kpi6 = Store.getCompany().kpis[0];
  Copilot.process(thG, 'nastav KPI ' + kpi6.title + ' na 55 %');
  if (thG.state && thG.state.step === 'which') Copilot.reply(thG, { val: kpi6.id });
  if (thG.state && thG.state.step === 'pct') Copilot.reply(thG, { val: '55' });
  ok(Store.getCompany().kpis[0].current === 55, 'kpiSet: KPI aktualizováno na 55 %');
  Copilot.process(thG, 'jak jsme na tom s KPI?');
  ok(last6(thG).html.includes(kpi6.title.slice(0, 10)), 'r.kpi: report obsahuje KPI');

  /* nový cyklus (HR) - kandidáti = lidé bez běžícího hodnocení */
  const rb6 = Store.list('reviews').length;
  const thH = Copilot.newThread();
  Copilot.process(thH, 'spusť nový cyklus hodnocení');
  if (thH.state && thH.state.step === 'type') Copilot.reply(thH, { val: 'annual' });
  if (thH.state && thH.state.step === 'confirm') Copilot.reply(thH, { val: 'ok' });
  ok(Store.list('reviews').length > rb6 || last6(thH).html.includes(t('cop.cy.nobody')), 'cycle: cyklus spuštěn (nebo nikdo nesplňuje)');

  /* kdo je X + můj tým + talent práva */
  Copilot.process(thH, 'kdo je ' + anyP.firstName + ' ' + anyP.lastName + '?');
  ok(last6(thH).html.includes(anyP.lastName), 'r.person: karta člověka');
  Copilot.process(thH, 'ukaž talent přehled');
  ok(last6(thH).html.includes(t('cop.tl.title')), 'r.talent: HR vidí přehled');
  Store.patchSettings({ viewAs: { role: 'employee', personId: emp6.id } });
  const thI = Copilot.newThread();
  Copilot.process(thI, 'ukaž talent matici');
  ok(last6(thI).html.includes(t('cop.tl.denied')), 'r.talent: zaměstnanec NIKDY (denied)');

  /* přidání člověka (HR) + téma */
  Store.patchSettings({ viewAs: null });
  const thJ = Copilot.newThread();
  const pb6 = Store.list('people').length;
  Copilot.process(thJ, 'přidej člověka Jan Testovací');
  if (thJ.state && thJ.state.step === 'name') Copilot.reply(thJ, { text: 'Jan Testovací' });
  if (thJ.state && thJ.state.step === 'dept') Copilot.reply(thJ, { val: (Store.getCompany().departments[1] || Store.getCompany().departments[0]).key });
  if (thJ.state && thJ.state.step === 'mgr') Copilot.reply(thJ, { val: anyP.managerId });
  ok(Store.list('people').length === pb6 + 1 && Store.list('people').slice(-1)[0].name === 'Jan Testovací', 'personAdd: člověk založen');
  Store.remove('people', Store.list('people').slice(-1)[0].id);
  Copilot.process(thJ, 'přepni na glass téma');
  ok(Store.getSettings().theme === 'glass', 'theme: přepnuto na glass');
  Store.patchSettings({ theme: 'brand' });

  /* i18n úplnost v2 (vč. dynamických klíčů) */
  const copSrc6 = fs.readFileSync('js/copilot.js', 'utf8');
  const keys6 = new Set();
  for (const m of copSrc6.matchAll(/'(cop\.[a-z0-9.]+)'/gi)) keys6.add(m[1]);
  [7, 8, 9, 10].forEach(i => keys6.add('cop.cap.' + i));
  let miss6 = [];
  ['cs', 'en', 'de'].forEach(loc => {
    I18N.setLocale(loc);
    keys6.forEach(k => { if (k.endsWith('.') || /\.(cap|t\.freq|h)\.$/.test(k)) return; if (t(k) === k) miss6.push(loc + ':' + k); });
  });
  I18N.setLocale('cs');
  ok(miss6.length === 0, miss6.length ? 'chybí v2 klíče: ' + miss6.slice(0, 10).join(', ') : `cop.* v2 i18n kompletní (${keys6.size} klíčů × 3)`);
  Store.patchSettings({ viewAs: null });
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

/* --- 16) UX opravy: 360 respondent v seedu, eNPS draft, scroll fix --- */
(function () {
  Generator.install('travel', 60);
  Store.patchSettings({ viewAs: null });
  /* pohled respondenta 360 v demu: persona zaměstnance (subjekt vyplnitelného hodnocení) má pozvánku */
  const er8 = Store.list('reviews').find(r => ['pending_self', 'self_in_progress'].includes(r.status));
  ok(er8 && Feedback360.pendingFor(er8.subjectId).length >= 1, 'seed: demo zaměstnanec má pozvánku k 360 (pohled respondenta na Přehledu)');
  /* eNPS draft: soukromé rozpracování, nikdy v responses */
  NPS.saveDraft('p1', 'w1', { main: 7, work: 5, growth: 6, support: 8, comment: 'x' });
  ok(NPS.draftOf('p1', 'w1').main === 7, 'eNPS draft: uložení a načtení (prefill)');
  ok(!Store.list('npsWaves').some(w => w.responses.some(r => r.draft || r.personId)), 'eNPS draft: nic se nepropsalo do anonymních responses');
  NPS.clearDraft('p1', 'w1');
  ok(NPS.draftOf('p1', 'w1') === null, 'eNPS draft: smazání po odeslání');
  /* ženská příjmení z kmenů na -a (Procházka → Procházková, ne „Procházkaová") */
  ok(!Store.list('people').some(p => /a(ová)$/.test(p.lastName || '')), 'ženská příjmení bez paskvilu -aová');
  /* scroll fix: re-render téže stránky drží pozici, navigace scrolluje nahoru */
  const appSrc8 = fs.readFileSync('js/app.js', 'utf8');
  ok(appSrc8.includes('sameRoute') && appSrc8.includes('window.scrollTo(0, sy)'), 'scroll: slider/uložení nehází stránku nahoru');
  /* 360 picker: nový UX (chips vybraných, hledání, skupiny) + i18n */
  const f3Src = fs.readFileSync('js/feedback360.js', 'utf8');
  ok(f3Src.includes('f3-selrow') && f3Src.includes('#f3-q') && f3Src.includes('f3-grp'), '360 picker: chips + hledání + skupiny dle relevance');
  let miss8 = [];
  ['cs', 'en', 'de'].forEach(loc => {
    I18N.setLocale(loc);
    ['f360.search', 'f360.grp.mgr', 'f360.grp.reports', 'f360.grp.peers', 'f360.grp.others',
     'f360.noneSelected', 'f360.max6', 'nps.draftSaved', 'nps.draftNote', 'nps.draft'].forEach(k => { if (t(k) === k) miss8.push(loc + ':' + k); });
  });
  I18N.setLocale('cs');
  ok(miss8.length === 0, miss8.length ? 'chybí klíče: ' + miss8.join(', ') : '360 picker + eNPS draft i18n kompletní (cs/en/de)');
})();

/* --- 17) 360 dotazník v2: behaviorální výroky, slovní škála, žádné zkratky v UI --- */
(function () {
  I18N.setLocale('cs');
  /* slovní škála */
  ok(ReviewLogic.scaleWord('TN') === 'Vynikající' && ReviewLogic.scaleWord('KV') === 'Splňuje očekávání', 'scaleWord: slovní podoba stupňů (cs)');
  ok(ReviewLogic.scaleWord(null) === '-', 'scaleWord: prázdné → pomlčka');
  /* item banka: jednoduchý režim 8 výroků, detailní 7 */
  const co9 = Store.getCompany();
  co9.competencies = null; Store.setCompany(co9);
  ok(Feedback360.items().length === 8, `item banka: 8 výroků v jednoduchém režimu (${Feedback360.items().length})`);
  ok(Feedback360.items().every(it => it.text.length > 20 && !/^f360\./.test(it.text)), 'výroky: přeložené behaviorální věty');
  co9.competencies = Generator.COMP_LIB.map(c => Object.assign({}, c)); Store.setCompany(co9);
  ok(Feedback360.items().length === 7, 'item banka: 7 výroků v detailním režimu');
  ok(!Feedback360.items().some(it => /^f360\./.test(it.text)), 'detailní výroky přeložené (žádné klíče)');
  co9.competencies = null; Store.setCompany(co9);
  /* odvození ratingů z odpovědí (N/A se vynechává) */
  const list9 = Feedback360.items();
  const ans9 = {}; list9.forEach(it => { ans9[it.id] = it.key === 'growth' ? 'NA' : 'TN'; });
  const der9 = Feedback360.deriveFromItems(ans9, list9);
  ok(der9.teamwork === 'TN' && der9.quality === 'TN' && !('growth' in der9), 'deriveFromItems: Ø per oblast, N/A vynecháno');
  const ans10 = {}; list9.forEach(it => { ans10[it.id] = 'KV'; });
  ok(Feedback360.deriveFromItems(ans10, list9).teamwork === 'KV', 'deriveFromItems: střed škály');
  /* i18n úplnost nové sady */
  let miss9 = [];
  ['cs', 'en', 'de'].forEach(loc => {
    I18N.setLocale(loc);
    ['5', '4', '3', '2', '1', 'na'].forEach(k => { if (t('f360.freq.' + k) === 'f360.freq.' + k) miss9.push(loc + ':freq.' + k); });
    ['TN', 'PO', 'KV', 'NR', 'NU', 'NA'].forEach(k => { if (t('scale.short.' + k) === 'scale.short.' + k) miss9.push(loc + ':short.' + k); });
    ['team1', 'team2', 'team3', 'grow1', 'grow2', 'qual1', 'qual2', 'qual3'].forEach(k => { if (t('f360.item.' + k) === 'f360.item.' + k) miss9.push(loc + ':item.' + k); });
    ['coop', 'leadership', 'analysis', 'selfmgmt', 'customer', 'expertise', 'results'].forEach(k => { if (t('f360.item.comp.' + k) === 'f360.item.comp.' + k) miss9.push(loc + ':comp.' + k); });
    if (t('f360.respIntro') === 'f360.respIntro') miss9.push(loc + ':respIntro');
  });
  I18N.setLocale('cs');
  ok(miss9.length === 0, miss9.length ? 'chybí: ' + miss9.slice(0, 8).join(', ') : '360 v2 i18n kompletní (cs/en/de)');
  /* žádné zkratky v uživatelském UI (statická kontrola šablon) */
  const rSrc9 = fs.readFileSync('js/reviews.js', 'utf8');
  ok(!rSrc9.includes('<b>${s.k}</b>') && !rSrc9.includes('<b>${x.k}</b>'), 'wizard: tlačítka škály bez zkratek (scaleWord)');
  const fSrc9 = fs.readFileSync('js/feedback360.js', 'utf8');
  ok(fSrc9.includes('f36-opt') && fSrc9.includes("t('f360.freq.'") && !fSrc9.includes('<b>${sd.k}</b>'), '360 dotazník: frekvenční slova, žádné zkratky');
  const cSrc9 = fs.readFileSync('js/copilot.js', 'utf8');
  ok(cSrc9.includes('ReviewLogic.scaleWord(k)') && cSrc9.includes('freqChips'), 'copilot: chipy škály slovně + 360 items flow');
})();

/* --- 18) průběžná konstruktivní vazba (SBI) --- */
(function () {
  I18N.setLocale('cs');
  Generator.install('it', 50);
  const fb = Store.list('feedback');
  ok(fb.length >= 6, `seed: konstruktivní vazby vygenerovány (${fb.length})`);
  ok(fb.every(i => i.sit && i.beh && i.imp && ['praise', 'develop'].includes(i.kind)), 'seed: SBI kompletní + platný typ');
  ok(fb.every(i => i.fromId !== i.toId), 'seed: nikdo nedává vazbu sám sobě');
  /* viditelnost: odesílatel, příjemce, manažer příjemce - nikdo jiný */
  const it0 = fb[0];
  const toP = Store.get('people', it0.toId);
  ok(Feedback.canSee(it0, it0.fromId) && Feedback.canSee(it0, it0.toId), 'viditelnost: odesílatel + příjemce vidí');
  ok(!toP.managerId || Feedback.canSee(it0, toP.managerId), 'viditelnost: manažer příjemce vidí');
  const outsider = Store.list('people').find(p =>
    p.id !== it0.fromId && p.id !== it0.toId && p.id !== toP.managerId);
  ok(outsider && !Feedback.canSee(it0, outsider.id), 'viditelnost: nikdo další vazbu nevidí');
  /* podklady z období + tisk (zdrojová kontrola) */
  const revSrcF = fs.readFileSync('js/reviews.js', 'utf8');
  ok(revSrcF.includes('Feedback.forEvidence'), 'Podklady z období: vazby se propisují manažerovi');
  const printBlockF = revSrcF.slice(revSrcF.indexOf('function printReview'), revSrcF.indexOf('/* ====================== dispatcher'));
  ok(!printBlockF.includes('Feedback.'), 'printReview: vazba se netiskne');
  /* tagy dle aktivního rámce */
  const coF = Store.getCompany();
  coF.competencies = null; Store.setCompany(coF);
  ok(Feedback.tags().length === 3 && Feedback.tags()[0].kind === 'area', 'tagy: 3 oblasti v jednoduchém režimu');
  coF.competencies = Generator.COMP_LIB.map(c => Object.assign({}, c)); Store.setCompany(coF);
  ok(Feedback.tags().length === 7 && Feedback.tags()[0].kind === 'comp', 'tagy: 7 kompetencí v detailním režimu');
  coF.competencies = null; Store.setCompany(coF);
  /* i18n úplnost */
  let missF = [];
  ['cs', 'en', 'de'].forEach(loc => {
    I18N.setLocale(loc);
    ['fb.pageTitle', 'fb.tab', 'fb.sub', 'fb.give', 'fb.privacy', 'fb.kind', 'fb.kind.praise', 'fb.kind.develop',
     'fb.tag', 'fb.optional', 'fb.sit', 'fb.sitHint', 'fb.beh', 'fb.behHint', 'fb.imp', 'fb.impHint',
     'fb.sug', 'fb.sugHint', 'fb.fillSbi', 'fb.received', 'fb.sent', 'fb.team',
     'fb.noneReceived', 'fb.noneSent', 'fb.noneTeam', 'fb.notif',
     'cop.fb.who', 'cop.fb.whoAmbig', 'cop.fb.kind', 'cop.fb.sit', 'cop.fb.beh', 'cop.fb.imp',
     'cop.fb.sug', 'cop.fb.skip', 'cop.fb.tag', 'cop.fb.preview', 'cop.fb.done', 'cop.h.fb'].forEach(k => { if (t(k) === k) missF.push(loc + ':' + k); });
  });
  I18N.setLocale('cs');
  ok(missF.length === 0, missF.length ? 'chybí klíče: ' + missF.slice(0, 8).join(', ') : 'fb i18n kompletní (cs/en/de)');
  /* Copilot: detekce + celý flow e2e */
  ok(Copilot.detect('dej vazbu Janě') === 'fb', 'detect: „dej vazbu" → fb flow');
  ok(Copilot.detect('chci dát konstruktivní zpětnou vazbu') === 'fb', 'detect: „konstruktivní" → fb flow');
  ok(Copilot.detect('vyžádej 360 na Janu') !== 'fb', 'detect: 360 požadavek nejde do fb');
  const psF = Store.list('people');
  const mgrF = psF.find(p => psF.some(x => x.managerId === p.id));
  const repF = psF.find(p => p.managerId === mgrF.id);
  Store.patchSettings({ viewAs: { role: 'manager', personId: mgrF.id } });
  const thF = Copilot.newThread();
  const beforeF = Store.list('feedback').length;
  Copilot.process(thF, 'dej vazbu ' + repF.firstName + ' ' + repF.lastName);
  ok(thF.state && thF.state.flow === 'fb', 'copilot: flow fb spuštěn');
  if (thF.state && thF.state.step === 'who') Copilot.reply(thF, { val: repF.id, label: repF.name });
  if (thF.state && thF.state.step === 'kind') Copilot.reply(thF, { val: 'develop', label: 'k rozvoji' });
  if (thF.state && thF.state.step === 'sit') Copilot.reply(thF, { text: 'Úterní schůzka s klientem' });
  if (thF.state && thF.state.step === 'beh') Copilot.reply(thF, { text: 'Prezentace šla do detailu bez shrnutí' });
  if (thF.state && thF.state.step === 'imp') Copilot.reply(thF, { text: 'Klient se ztrácel v číslech' });
  if (thF.state && thF.state.step === 'sug') Copilot.reply(thF, { val: 'skip', label: 'skip' });
  if (thF.state && thF.state.step === 'tag') Copilot.reply(thF, { val: 'area:quality', label: 'Kvalita' });
  if (thF.state && thF.state.step === 'confirm') Copilot.reply(thF, { val: 'ok', label: 'ok' });
  ok(Store.list('feedback').length === beforeF + 1 && !thF.state, 'copilot: flow uloží vazbu do Store');
  const savedF = Store.list('feedback').slice(-1)[0];
  ok(savedF.toId === repF.id && savedF.kind === 'develop' && savedF.tagKey === 'quality' && savedF.fromId === mgrF.id, 'copilot: data vazby správně (příjemce/typ/tag/autor)');
  Store.patchSettings({ viewAs: null });
})();

/* --- 10) empty state: prázdná firma nesmí spadnout --- */
Generator.installEmpty();
try { const r2 = fakeEl(); TalentViews.renderHr(r2); ok(true, 'renderHr na prázdné firmě OK'); }
catch (e) { ok(false, 'renderHr na prázdné firmě spadl: ' + e.message); }

console.log(failed ? `\n${failed} TEST(Ů) SELHALO` : '\nVŠECHNY TESTY PROŠLY');
process.exit(failed ? 1 : 0);
