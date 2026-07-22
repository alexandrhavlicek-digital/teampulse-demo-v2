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
  for (const m of src.matchAll(/t\('((?:tal|rev\.talent)[^']*)'/g)) keysUsed.add(m[1]);
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

/* --- 10) empty state: prázdná firma nesmí spadnout --- */
Generator.installEmpty();
try { const r2 = fakeEl(); TalentViews.renderHr(r2); ok(true, 'renderHr na prázdné firmě OK'); }
catch (e) { ok(false, 'renderHr na prázdné firmě spadl: ' + e.message); }

console.log(failed ? `\n${failed} TEST(Ů) SELHALO` : '\nVŠECHNY TESTY PROŠLY');
process.exit(failed ? 1 : 0);
