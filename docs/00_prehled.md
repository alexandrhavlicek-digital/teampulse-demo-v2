# TeamPulse — přehled systému (executive summary)

**Verze dokumentace:** 1.4 · **Datum:** 2026-07-30 · **Stav:** demo v2 (bez externí AI) + modul Talent & nástupnictví + Copilot (nástřel) + průběžná konstruktivní vazba

## Co je TeamPulse

Performance & Growth platforma pro firmy 15–300 lidí. Digitalizuje hodnoticí proces ověřený v praxi (Wunderman 2015, DER Touristik 2025) a doplňuje ho o prvky průběžné práce s lidmi: cíle vázané na firemní KPI, uznání (kudos), konstruktivní zpětnou vazbu (SBI) a 1:1 check-iny. **Záměrně bez AI funkcí** — jde o HR systém s osobními údaji, bezpečnost a důvěra mají přednost (rozhodnutí 2026-06).

## Klíčové principy

1. **Hodnocení je dialog, ne monolog.** Základem je sebehodnocení; hodnocení se uzavírá výhradně vzájemnou shodou (potvrzením obou stran). Neshoda v hodnocení cíle se automaticky stává bodem hodnoticího rozhovoru.
2. **Cíle táhnou strategii.** Osobní cíle visí pod třemi oblastmi hodnocení a vážou se na firemní či týmové KPI. Váhy cílů v oblasti dávají vždy přesně 100 % — vynucuje systém. Záložka **Alignment** v sekci Cíle vazbu vizualizuje (KPI → navázané cíle, % pokrytí, KPI bez jediného cíle) — lehký pohled z existujících dat, žádná OKR kaskáda. Plnění cílů se neposouvá „od oka": mění se jen v **kvartálním checku** (či pololetním checku) s povinným komentářem a auditní stopou; KPI hodnoty spravuje HR odděleně.
3. **Čas manažera je nejdražší měna.** Tichá shoda (předvyplnění ze sebehodnocení), podklady z období (kudos, check-iny, plnění cílů) a rollover cílů snižují systémovou práci z ~60 na ~15–20 minut na hodnoceného.
4. **Odměňování doporučujeme, nepočítáme.** Vážené skóre → indikativní pásmo viditelné jen manažerovi a HR. Rozhodnutí zůstává na lidech.

## Hlavní funkce (demo v2)

Onboarding s generátorem fiktivní firmy (IT / cestovní kancelář / automotive výroba, 15–200 lidí) nebo prázdné prostředí s pozdějším importem. Tři role (hodnocený, hodnotitel, HR) s odlišnou navigací. Hodnoticí workflow v 5 fázích s verzemi v1/v2/v3 a auditní stopou. Šestikrokový wizard sebehodnocení s autosave. Kompetenční rámec: jednoduchý (3 oblasti) / detailní (7 vážených kompetencí dle DER modelu). Správa firemních a týmových KPI. HR centrum: cykly, eskalace, rozložení stavů a ratingů, pravidla cílů, pásma odměňování. Org chart s pan/zoom, sbalováním větví, viditelnými spojnicemi vztahů, fullscreen režimem a rychlým otevřením karty člověka („i" na žetonu, jen hodnotitel/HR). Kudos, 1:1 check-iny se dvěma taby — **Přehled** (analytika nálad v čase: Ø nálada, trend, vývoj po měsících, lidé bez 1:1 přes 30 dní; manažer po lidech, HR po týmech) a **Záznamy** (evidence rozhovorů s filtry), tisk/PDF, **nápověda jako prohledávatelná knowledge base** (témata dle rolí, fulltext hledání, tab Novinky s changelogem; stejný obsah čte i Copilot), čtyři designová témata (brand/corp/glass/genz), jazyky CZ/EN/DE.

**Modul Talent & nástupnictví (2026-07, dle DERTOUR succession metodiky):** soukromá talent sekce v manažerském hodnocení → 9-box matice s fotkovými žetony (HR záložka Talent & Reporty: retenční priority, trend, talent profily), manažerský dashboard Můj tým, klíčové pozice s 12otázkovým checklistem a nástupci (overlay v org chartu), kvartální talent check se stavy draft → debata s HR → zamrazený snapshot (drag & drop posuny s poznámkou), tisková sestava pro poradu vedení, checklist kandidáta na nástupce (21 otázek, práh HR), červená karta s maticí potřebnosti a anonymní 360° zpětná vazba (agregát od 3 odpovědí, výstup „tři pohledy"). Zaměstnanec z tohoto modulu nevidí nic; z 360 nikdo nevidí jednotlivé odpovědi — viz 08_talent_succession.md.

**Průběžná konstruktivní vazba (2026-07-30):** sekce Zpětná vazba spojuje veřejná uznání (kudos) a soukromou konstruktivní vazbu ve struktuře SBI (Situace – Chování – Dopad + volitelné doporučení), s typem ocenění / k rozvoji a štítkem oblasti či kompetence. Kdokoli ji může dát komukoli kdykoli během roku; vidí ji jen příjemce a jeho přímý manažer a propisuje se do Podkladů z období — manažer u ročního hodnocení nehodnotí po paměti. HR vidí pouze počty. Jde o odpověď na continuous-feedback vrstvu konkurenčních platforem při zachování workflow-light filozofie (viz 01 §14).

**TeamPulse Copilot (2026-07, nástřel):** chatový parťák nad daty v systému — poslední položka menu, rozhraní jako Claude/ChatGPT. Přirozeným jazykem (CZ/EN/DE) zvládne dát uznání, zapsat 1:1, provést sebehodnocením i manažerským vyhodnocením (volby přes klikací chipy, tichá shoda) a odpovídá na reportingové dotazy dle práv role. Historie a pin vláken, uložené prompty, naplánované úlohy, proaktivní uvítání s doporučeními ze stavu dat. **Bez externí AI** — deterministický simulovaný engine (security rozhodnutí trvá); zároveň koncept budoucí mobilní aplikace (chat-first na mobilu). V demu jde vypnout v Nastavení. Viz 09_copilot.md.

## Mapa dokumentace

| Dokument | Pro koho | Obsah |
|---|---|---|
| 01_funkcni_specifikace.md | Produkt / vývoj | Workflow, stavy, pravidla, validace |
| 02_datovy_model.md | Vývoj / backend | Entity, Store rozhraní, mapování na Supabase |
| 03_architektura_deploy.md | Vývoj / DevOps | Stack, struktura kódu, nasazení CF Pages |
| 04_prirucka_hodnoceny.md | Zaměstnanci | Krok za krokem hodnocením |
| 05_prirucka_hodnotitel.md | Manažeři | Hodnocení týmu, rozhovor, shoda |
| 06_prirucka_hr.md | HR | Cykly, KPI, pravidla, odměňování |
| 07_testovani.md | QA | Testovací scénáře a smoke testy |
| 08_talent_succession.md | Vývoj | **Realizační dokument** modulu Talent & nástupnictví (API, datový model, stavové automaty, soukromí) |
| 09_copilot.md | Produkt / vývoj | **Realizační dokument** Copilota (simulovaný engine, flows, práva, roadmap k LLM) |
| 10_360_dotaznik.md | Produkt / HR | Analýza a design 360° dotazníku (behaviorální výroky, slovní frekvenční škála, bez zkratek) |
