# Talent & nástupnictví — realizační dokument

**Verze:** 1.0 · **Datum:** 2026-07-22 · **Zdroj pravdy:** `js/talent.js` (+ zásahy v `reviews.js`, `app.js`, `generator.js`, `store.js`)
**Koncepty (proč to je, jak to je):** `../../docs/koncept_talent_reporting_9box_360.md` a `../../docs/koncept_succession_planning.md` v kořeni repa — rozhodnutí zadavatele jsou v §7 succession konceptu. Metodický zdroj: succession planning proces DERTOUR Group (2025).

Tento dokument je určen vývojáři, který modul přebírá. Popisuje **co je implementováno a jak přesně**, včetně invariantů, které nesmí porušit.

---

## 1. Co modul dělá

Nad existujícím hodnoticím procesem (dokumenty 01–02) staví vrstvu **lidí**: kdo roste, koho držet, kdo koho nahradí. Šest funkcí:

1. **Talent sekce** — soukromá část manažerského ročního hodnocení (potenciál, připravenost na další roli, riziko odchodu, mobilita, jazyky).
2. **9-box matice** (HR záložka *Talent & Reporty*) — výkon × potenciál, fotkové žetony, trend, retenční priority.
3. **Můj tým** — manažerský read-only dashboard: mini matice + karty lidí.
4. **Klíčové pozice + nástupci** — 12otázkový checklist (většina ANO → klíčová), přiřazení nástupců, overlay v org chartu.
5. **Kvartální talent check** — vynucený moment: manažer potvrdí/posune lidi v matici (drag & drop), odešle, proběhne debata s HR, stav se zamrazí.
6. **Tisková sestava pro poradu vedení** — souhrn talentu a nástupnictví na jeden tisk.

### Závazný princip: soukromí

| Data | Zaměstnanec | Manažer | HR |
|---|---|---|---|
| Talent sekce (potenciál, riziko odchodu…) | **nikdy** | svůj tým | vše |
| Pozice v matici / 9-box | **nikdy** | svůj tým | vše |
| Klíčové pozice, nástupci, org overlay | **nikdy** | vidí (overlay + Můj tým) | vše + správa |
| Talent check | **nikdy** | svůj (draft jen on) | stav vždy; obsah až po odeslání |
| Tisk hodnocení | talent data se **netisknou vůbec** (ani s `withPrivate`) | | |

Kontrolní body v kódu: `fullReadHtml(r, withPrivate)` renderuje talent jen s `withPrivate`; `printReview` talent nezná; org overlay se počítá jen když `viewAs().role ∈ {hr, manager}`; route `#/talentcheck` má guard v `views.talentcheck` (employee → redirect). Testy tato pravidla hlídají (viz §9).

---

## 2. Soubory a veřejná API

Vše je vanilla JS (IIFE, žádný build). Pořadí načítání v `index.html` je závazné: `i18n → icons → store → generator → reviews → talent → app`.

### js/talent.js (jádro modulu)

| Objekt | API | Účel |
|---|---|---|
| `window.TalentLogic` | `scoreInfo(pid)` → `{cur:{score,review}, prev}` | dvě poslední spočitatelná skóre (trend) |
| | `talentOf(pid)` → `{tal, review}` \| null | nejnovější vyplněná talent sekce (jakýkoli stav review) |
| | `perfCol(score)` → 1\|2\|3\|null | prahy **< 0.95 / < 1.10 / ≥ 1.10** — konzistentní s pásmy odměňování |
| | `entryOf(person)` → entry | kompletní odvození pozice, viz §4 |
| | `BOXES` | 3×3 klíče polí `b{pot}{perf}` (b33 = Hvězda) |
| `window.TalentGrid` | `gridHtml(entries, opts)` | sdílená grid komponenta; `opts.drag` zapne drop zóny (`data-cell="row:col"`) a `draggable` žetony |
| | `tokenHtml(entry, opts)` | fotkový žeton (avatar, trend ▲▼, ✎ override marker) |
| `window.SuccLogic` | `kpYes/kpAnswered(kp)`, `kpIsKey(kp)` (**≥ 7 ANO z 12**), `kpRated(kp)` (≥ 7 zodpovězeno), `succMaps()` | checklist logika + mapy pro org overlay |
| `window.TalentCheck` | `tcCadence()` → `'q'\|'semi'\|'off'`, `tcPeriod()` → `'Q3 2026'`/`'H2 2026'`, `tcOf(managerId)`, `tcStart(me, team)` | kvartální check |
| `window.TalentViews` | `renderHr(root)`, `renderMyTeam(root)`, `renderCheck(root, managerIdParam)`, `profileModal(pid)`, `printBoardReport()` | pohledy |

Interní (neexportované, ale důležité): `kpEditModal` (editor pozice, reuse i z talent checku), `successionCardHtml`, `tcHrCardHtml`, `tcPersonModal`, `finalOverrideBox` (§4).

### Zásahy do existujících souborů

- **reviews.js** — `avatar()` podporuje `person.photoUrl` (fallback iniciály); talent sekce v `renderManagerEditor` (jen `r.type === 'annual'`; helpery `ensureTalent`, `talentSectionHtml`, `bindTalentSection`); `bindScaleRows` má guard `if (!row.dataset.scale) return` — **talentové segmentové řady používají `.scale-row` bez `data-scale` a mají vlastní handler**; `fullReadHtml` renderuje talent souhrn s `withPrivate`.
- **app.js** — NAV položky `myteam` (manager) a `talent` (hr); `views.talent/myteam/talentcheck` (s role guardem); org chart overlay (`succ.kpByHolder`, `succ.succLevel` + legenda); kadence checku v HR centru (`co.cycleConfig.talentCheck`); `render()` volá `closeModal()` (navigace zavírá modaly).
- **store.js** — kolekce `keyPositions`, `talentChecks` v `blank()` + **migrace v `load()`**: chybějící kolekce se do starší DB doplní z `blank()`. Každou novou kolekci přidávej sem, jinak `insert` spadne na starých datech.
- **generator.js** — `filledMgr` seeduje `form.mgr.talent` a koreluje výkon s potenciálem (`mgrSeedBias` hi/lo, ať Hvězda ani Riziko nejsou prázdné); seed 4 klíčových pozic s vynucenými počty ANO `[10, 9, 8, 5]` (3 klíčové, 1 bez nástupce, 1 neklíčová = ukázka filtru); seed 2 talent checků (final s overridem + debate).
- **icons.js** — ikona `grid9`.

### CSS (css/app.css, sekce na konci souboru)

`.nine-grid .ng-*` (grid, buňky, žetony, trend/override markery, drop zvýraznění `.ng-over`), `.tal-legend`, `.mt-*` (karty Můj tým), `.kp-*` (řádky pozic, checklist, nástupcovské chipy), `.org-kp / .org-succ-* / .org-flag / .org-legend` (overlay), `.tc-tray / .tc-banner`. Témata se řeší proměnnými + pár `[data-theme]` variant u gridu; nové barvy neber napřímo, vždy `var(--…)`.

### i18n

Jmenné prostory: `tal.*` (matice), `mt.*` (Můj tým), `kp.*` (klíčové pozice vč. 12 otázek `kp.q1–q12` a 4 okruhů `kp.cat.*`), `tc.*` (talent check), `rev.talent.*` (talent sekce). **Každý klíč musí existovat v cs/en/de** — hlídá test (fallback na cs by prošel UI, ale test spadne).

---

## 3. Datový model (přírůstky)

### form.mgr.talent (uvnitř reviews.form)
```
talent: {
  potential: null | 'low'|'mid'|'high',      // osa Y matice
  readiness: null | 'r1'|'r12'|'no',         // do 1 roku / 1-2 roky / zatím ne
  attrition: null | 'low'|'mid'|'high',      // riziko odchodu (retenční priority)
  mobility:  bool,
  languages: string,
}
```
Bez migrace: starší hodnocení talent nemají → člověk je v matici „bez odhadu".

### keyPositions
```
{ id, deptKey, dept, title, holderId (→people.id | null),
  checklist: { q1..q12: true|false|null },   // tri-state; ukládají se ODPOVĚDI, ne jen výsledek
  proposedBy, confirmedByHr,
  successors: [{ personId, level: 'key'|'successor', readiness: 'r1'|'r12'|'no' }] }
```
Odvozené (nikdy neukládat): `isKey = kpYes ≥ 7`, `rated = kpAnswered ≥ 7`, nekrytá = `isKey && successors.length === 0`.

### talentChecks
```
{ id, period: 'Q3 2026'|'H2 2026', managerId, status: 'draft'|'debate'|'final',
  items: [{ personId,
            box: null | {pot: 1-3, perf: 1-3},   // JEN pro source='override'!
            source: 'computed'|'override',
            note, attrition }],
  createdAt, sentAt, discussedAt }
```
**Invariant:** u `source: 'computed'` je `box` vždy `null` — vypočtená pozice se odvozuje živě (`entryOf`), aby draft nezastarával. Override je jediná ukládaná pozice. Jeden check na dvojici (managerId, period).

*Odchylka od konceptu:* koncept (§4) navrhoval per-person `talentSnapshots`; implementace používá per-manažer `talentChecks` s items — přesněji modeluje workflow (manažer odesílá celek, HR debatuje celek) a stavový automat je na jednom místě. Při přenosu do Supabase lze normalizovat na `talent_checks` + `talent_check_items`.

### Mapování na Supabase (doplnění tabulky v 02)

| Kolekce | Tabulky | RLS |
|---|---|---|
| `form.mgr.talent` | sloupce/`jsonb` v `review_manager_sections` | čtení: evaluator + HR; subjekt NIKDY (na úrovni sloupců / view) |
| `keyPositions` | `key_positions` + `succession_candidates` | mgr: čtení pro svůj strom, návrh; HR: vše |
| `talentChecks` | `talent_checks` + `talent_check_items` | **draft čitelný jen autorem**; debate/final: autor + HR; zaměstnanec nikdy |

Serverově vynutit: přechody `draft→debate→final` (jen vpřed; `debate` nastavuje autor, `final` jen HR), zákaz čtení cizího draftu, zákaz jakéhokoli přístupu subjektů k talent datům.

---

## 4. Odvození pozice v matici (algoritmus)

`entryOf(person)` — jediné místo pravdy, používají ho všechny pohledy:

1. **Osa X (výkon):** `perfCol(score)`, kde `score` = `ReviewLogic.computeScore` z nejnovějšího review, kde je spočitatelné (manažerské ratingy oblastí/kompetencí + vážené cíle; škála TN 1.2 … NU 0.7). Prahy 0.95 / 1.10.
2. **Osa Y (potenciál):** `talentOf(pid)` → nejnovější `form.mgr.talent.potential` (low/mid/high → řádek 1/2/3).
3. **Override:** `finalOverrideBox(pid)` — pokud existuje **finální** (prodiskutovaný) talent check s overridem pro daného člověka, jeho `box` má přednost před výpočtem (bere se nejnovější dle `discussedAt`). Vrací se `overridden: true`.
4. **Trend:** znaménko rozdílu dvou posledních spočitatelných skóre (`scoreInfo`).

Bez talent sekce nebo bez skóre → člověk není v matici („bez odhadu"; v talent checku ho lze do matice přetáhnout ručně = override).

---

## 5. Stavový automat talent checku

```
(žádný) --manažer otevře #/talentcheck--> draft
draft   --„Odeslat k debatě s HR"------> debate   (sentAt, notifikace HR)
debate  --HR „Označit prodiskutováno"--> final    (discussedAt, notifikace manažerovi)
```

- **draft**: edituje jen manažer (drag & drop, poznámky, riziko odchodu, úprava nástupců přes `kpEditModal`). HR vidí v kartě stavů jen badge „Rozpracováno" — **obsah draftu HR nevidí** (princip „nejdřív sám, pak debata" z DERTOUR praxe; chráníme záměrně).
- **debate**: pro manažera read-only; HR otevře obsah přes `#/talentcheck/<managerId>` a po kalibrační debatě finalizuje.
- **final**: zamrazlý snapshot kvartálu; overridy se od té chvíle propisují do matice (§4 bod 3).

Kadence: `co.cycleConfig.talentCheck` = `'q'` (default, rozhodnutí 2026-07-22) | `'semi'` | `'off'`; nastavuje HR v HR centru (karta Pravidla cílů). `'off'` skryje banner v Můj tým i HR kartu stavů. Období se značí `Q1–Q4 RRRR`, při pololetní kadenci `H1/H2 RRRR`.

Vstupy do flow: banner v **Můj tým** (když check pro aktuální období neexistuje nebo je draft), HR karta **Talent check — stav** v Talent & Reporty (proklik na debate/final checky).

---

## 6. Routy a vstupní body

| Route | Role | Obsah |
|---|---|---|
| `#/talent` | hr | Talent & Reporty: KPI řádek, retenční priority, karta stavů checků, Nástupnictví, 9-box, bez odhadu, legenda |
| `#/myteam` | manager | banner checku, retenční callout, mini 9-box, klíčové pozice týmu, karty lidí |
| `#/talentcheck` | manager | check aktuálního období (založí draft, pokud není) |
| `#/talentcheck/<managerId>` | hr | read-only obsah checku + finalizace (jen debate/final) |
| `#/org` | všichni | overlay + legenda **jen pro hr/manager** |
| Manažerský editor hodnocení | evaluator | talent sekce (jen typ annual) |
| Tisk: `TalentViews.printBoardReport()` | hr | sestava pro poradu (print-root) |

---

## 7. Drag & drop (implementační detail)

HTML5 DnD: `dragstart` na `.ng-token[draggable]` ukládá `personId` do `dataTransfer`; `.ng-cell[data-cell="row:col"]` má `dragover` (preventDefault + `.ng-over`) a `drop` (zapíše `{pot, perf}` + `source:'override'`). Klik na žeton v draftu otevírá `tcPersonModal` (poznámka — uvidí ji HR při debatě, riziko odchodu, reset na vypočtenou pozici = `box:null, source:'computed'`). **Limit: DnD funguje myší; na dotykových zařízeních zatím posun není** — klikový fallback („vybrat → klepnout na pole") je kandidát na drobnou iteraci.

---

## 8. Seed generátoru (proč demo „žije")

Talent sekce se seeduje v `filledMgr` (deterministický `rnd()` se seedem): potenciál 22/50/28 %, readiness a attrition korelované s potenciálem. `mgrSeedBias`: u 60 % vysokého potenciálu se ratingy zvednou (TN/PO) → obsazená Hvězda; u 30 % ne-vysokého sníží → obsazené Riziko/Nekonzistentní. Klíčové pozice: 4 u heads/leads, počty ANO `[10,9,8,5]`, druhá bez nástupců (vacancy risk pro „aha" moment), čtvrtá neklíčová (checklist jako filtr). Talent checky: první manažer `final` s 1 overridem (žeton s ✎), druhý `debate` (HR má co finalizovat) + notifikace.

---

## 9. Testování

`node test-headless.js` z adresáře `demo-v2` (Node 18+, bez závislostí — stubovaný DOM/localStorage, soubory se načítají evalem v pořadí jako v index.html). Pokrývá: generátor a seed (talent, pozice, checky), prahy a umístění v matici, override → `entryOf`, stavové přechody checku, migraci Store, render HR/Můj tým/check bez pádu, soukromí (talent jen s `withPrivate`, tisk bez talentu, sekce jen pro annual) a úplnost i18n cs/en/de. **Před každým commitem musí být vše zelené.** Vizuální kontrola: Playwright + Chromium (viz 07_testovani.md).

---

## 10. Známé limity a plán (stav k 2026-07-22)

- DnD jen myší (mobil čte, neposouvá) — viz §7.
- Trend šipek jde z rozdílu skóre hodnocení, ne z historie checků; jemnější kvartální trend lze doplnit čtením `talentChecks` (final) po obdobích.
- Otázky checklistu jsou v i18n, ne editovatelná data per firma (koncept je chce jako data — kandidát na iteraci s HR nastavením).
- Ze succession konceptu **zbývá**: checklist kandidáta (21 otázek, práh default 16/21, doporučený ne povinný), červená karta + matice potřebnosti, 360 zpětná vazba. Pořadí a zdůvodnění: koncept §6.

## 11. Checklist pro další iteraci (drž tento postup)

1. Nová kolekce? → `store.js blank()` (migrace je automatická) + `generator.js` (`install`, `installEmpty`, seed).
2. Logika + pohledy do `js/talent.js` (nebo nového souboru — pak přidej `<script>` do index.html **před app.js**).
3. Texty do `i18n.js` — vždy cs + en + de.
4. Role guard: cokoliv talentového nesmí vidět employee — zkontroluj NAV roles, view guard i render podmínky.
5. Testy do `test-headless.js` (min.: render bez pádu, i18n úplnost, soukromí).
6. Bump `?v=` v index.html (cache bust; formát `RRRRMMDD[a-z]`).
7. Aktualizuj tento dokument (§ čeho se změna týká) + 00_prehled (mapa) + případně příručky 05/06.
8. Commit do větve, merge do `main` rozhoduje zadavatel (deploy = GitHub Actions → Cloudflare Pages, viz 03).
