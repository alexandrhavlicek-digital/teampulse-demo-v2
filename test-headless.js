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
load('js/generator.js');
load('js/reviews.js');
load('js/talent.js');
load('js/feedback360.js');

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

/* --- 10) empty state: prázdná firma nesmí spadnout --- */
Generator.installEmpty();
try { const r2 = fakeEl(); TalentViews.renderHr(r2); ok(true, 'renderHr na prázdné firmě OK'); }
catch (e) { ok(false, 'renderHr na prázdné firmě spadl: ' + e.message); }

console.log(failed ? `\n${failed} TEST(Ů) SELHALO` : '\nVŠECHNY TESTY PROŠLY');
process.exit(failed ? 1 : 0);
