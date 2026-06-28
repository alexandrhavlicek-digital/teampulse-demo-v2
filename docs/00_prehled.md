# TeamPulse — přehled systému (executive summary)

**Verze dokumentace:** 1.0 · **Datum:** 2026-06-12 · **Stav:** demo v2 (bez AI)

## Co je TeamPulse

Performance & Growth platforma pro firmy 15–300 lidí. Digitalizuje hodnoticí proces ověřený v praxi (Wunderman 2015, DER Touristik 2025) a doplňuje ho o prvky průběžné práce s lidmi: cíle vázané na firemní KPI, uznání (kudos) a 1:1 check-iny. **Záměrně bez AI funkcí** — jde o HR systém s osobními údaji, bezpečnost a důvěra mají přednost (rozhodnutí 2026-06).

## Klíčové principy

1. **Hodnocení je dialog, ne monolog.** Základem je sebehodnocení; hodnocení se uzavírá výhradně vzájemnou shodou (potvrzením obou stran). Neshoda v hodnocení cíle se automaticky stává bodem hodnoticího rozhovoru.
2. **Cíle táhnou strategii.** Osobní cíle visí pod třemi oblastmi hodnocení a vážou se na firemní či týmové KPI. Váhy cílů v oblasti dávají vždy přesně 100 % — vynucuje systém.
3. **Čas manažera je nejdražší měna.** Tichá shoda (předvyplnění ze sebehodnocení), podklady z období (kudos, check-iny, plnění cílů) a rollover cílů snižují systémovou práci z ~60 na ~15–20 minut na hodnoceného.
4. **Odměňování doporučujeme, nepočítáme.** Vážené skóre → indikativní pásmo viditelné jen manažerovi a HR. Rozhodnutí zůstává na lidech.

## Hlavní funkce (demo v2)

Onboarding s generátorem fiktivní firmy (IT / cestovní kancelář / automotive výroba, 15–200 lidí) nebo prázdné prostředí s pozdějším importem. Tři role (hodnocený, hodnotitel, HR) s odlišnou navigací. Hodnoticí workflow v 5 fázích s verzemi v1/v2/v3 a auditní stopou. Šestikrokový wizard sebehodnocení s autosave. Kompetenční rámec: jednoduchý (3 oblasti) / detailní (7 vážených kompetencí dle DER modelu). Správa firemních a týmových KPI. HR centrum: cykly, eskalace, rozložení stavů a ratingů, pravidla cílů, pásma odměňování. Org chart s pan/zoom a sbalováním větví. Kudos, 1:1 check-iny, tisk/PDF, nápověda dle rolí, tři designová témata, jazyky CZ/EN/DE.

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
