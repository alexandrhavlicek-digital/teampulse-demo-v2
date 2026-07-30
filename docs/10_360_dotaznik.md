# 10 — 360° dotazník: analýza a design (v2)

**Verze:** 1.0 · **Datum:** 2026-07-30 · **Stav:** implementováno v demo-v2 · **Soubory:** `js/feedback360.js`, i18n klíče `f360.item.*`, `f360.freq.*`, `scale.short.*`

## 1. Proč redesign

Původní dotazník ukazoval respondentovi tlačítka **TN / PO / KV / NR / NU / N-A** — interní zkratky hodnoticí škály, kterým běžný uživatel nerozumí, a chtěl po něm ohodnotit abstraktní kompetence („Leadership") bez opory v pozorovatelném chování. Obojí je proti best practice 360 zpětné vazby.

## 2. Co říká praxe (rešerše 2026-07)

Klíčové závěry z oborových zdrojů (Lumus360, ETS, Explorance, Qualtrics):

1. **Behaviorální, pozorovatelné výroky.** Otázky mají popisovat konkrétní chování („Sdílí informace, které ostatní potřebují…"), ne vlastnosti nebo kompetence jako pojmy. Respondent hodnotí, co skutečně vidí.
2. **Frekvenční škála se slovními kotvami.** Pro rozvojové 360 je doporučená škála „jak často chování vidím" (Téměř vždy → Téměř nikdy), 5 bodů, **každý bod plně pojmenovaný slovem** — žádné číselné ani písmenné zkratky. Tříbodové škály jsou nespolehlivé.
3. **„Nemohu posoudit" je povinná volba.** Respondent, který chování neměl možnost pozorovat, nesmí být nucen hádat — jinak data degradují. N/A se z průměrů vynechává.
4. **Krátké a konzistentní.** Jednotná škála pro celý dotazník; raději méně dobrých položek než dlouhý formulář. (Enterprise programy mívají ~40 položek / 20 minut; pro lightweight in-app 360 v TeamPulse je cíl **~8 položek / 4 minuty**.)
5. **Otevřené komentáře jsou nejcennější část výstupu.** Účastníci je konzistentně hodnotí jako nejužitečnější — dotazník má mít 2 dobře vedené otevřené otázky s návodem ke konkrétnosti (situace + dopad).

## 3. Nový dotazník (implementace)

**Škála (jednotná, slovní):** Téměř vždy · Často · Občas · Zřídka · Téměř nikdy + „Nemohu posoudit". Interně se mapuje na stávající stupně (Téměř vždy→TN … Téměř nikdy→NU), takže agregace, „tři pohledy" i srovnání se sebehodnocením fungují beze změny datového modelu.

**Item banka — jednoduchý režim (3 oblasti, 8 výroků):**

| Oblast | Výrok |
|---|---|
| Spolupráce | Sdílí informace a znalosti, které ostatní potřebují ke své práci. |
| Spolupráce | Komunikuje otevřeně a s respektem — i když se nedaří. |
| Spolupráce | Nabídne pomoc, i když to není přímo jeho/její úkol. |
| Rozvoj | Aktivně si říká o zpětnou vazbu a pracuje s ní. |
| Rozvoj | Učí se nové věci a přináší je do týmu. |
| Kvalita | Dodává práci ve slíbené kvalitě a termínu. |
| Kvalita | Přemýšlí o dopadu své práce na zákazníka a kolegy. |
| Kvalita | Když narazí na problém, přichází s návrhem řešení. |

**Detailní kompetenční režim (7 výroků):** jeden behaviorální výrok na kompetenci DER modelu (coop, leadership, analysis, selfmgmt, customer, expertise, results — texty v `f360.item.comp.*`); pro custom kompetence generický výrok `f360.item.generic`.

**Otevřené otázky (s vodítkem ke konkrétnosti):**
- „V čem je tento kolega / tato kolegyně silný/á? Co má určitě dělat dál?"
- „Co by mu/jí pomohlo být ještě lepší? Buď konkrétní — situace a dopad."

**UX dotazníku:** úvod s anonymitou a odhadem času, číslované výroky, progress (n/8), Odeslat aktivní až po zodpovězení všeho (N/A se počítá jako odpověď), CZ/EN/DE.

**Datový model:** `respondent.items = {itemId: stupeň|'NA'}` (nové) + `respondent.ratings` odvozené průměrem přes oblast (`Feedback360.deriveFromItems`) — zpětně kompatibilní s agregací a semináři dat pro Supabase.

## 4. Zkratky pryč z celé aplikace

Nový helper `ReviewLogic.scaleWord(k)` → **Vynikající / Nad očekáváním / Splňuje očekávání / Potřebuje rozvoj / Nedostatečné / Bez hodnocení** (`scale.short.*` ×3 jazyky). Nahrazeno všude, kde uživatel viděl zkratku: tlačítka škály v hodnoticím wizardu (sebehodnocení i manažer, vč. malých řad u cílů), badge „Ty: …", čtecí pohledy a potvrzení, tisková sestava, HR rozložení ratingů, Nápověda, výstup „tři pohledy" u 360 a všechny chipy + shrnutí v Copilotu. Zkratky zůstávají POUZE jako interní klíče v datech (Store/Supabase) — UI je nikdy nezobrazuje.

## 5. Zdroje rešerše

- Lumus360: 360 Feedback Questionnaire Design — Best Practice Guide (lumus360.co.uk)
- ETS: 360 degree feedback rating scales — what's best practice (etsplc.com)
- Explorance: Which Response Scale is Best for 360 Degree Feedback Evaluations (explorance.com)
- Qualtrics: 360-Degree Feedback Review Programs (qualtrics.com)
