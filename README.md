# TeamPulse — Demo v2 (bez AI)

**Verze:** 2.0.0 · **Datum:** 2026-06-12 · **Připravil:** Alex Havlíček

Klikatelné demo TeamPulse — **Performance & Growth Platform bez AI funkcí**. AI vrstva byla odstraněna ze security důvodů (HR tool s údaji o lidech). Demo se vrací k jádru původního zadání (Wunderman 2015, validováno s HR lidmi) v moderním kabátě a doplňuje ho o prvky sounáležitosti (kudos, 1:1 check-iny).

## Co demo umí

**Onboarding s generátorem virtuální firmy.** Návštěvník si vybere: fiktivní firmu (IT & software / cestovní kancelář / výrobce auto komponentů) a velikost 15–200 lidí, nebo prázdné prostředí. Vygeneruje se kompletní firma — název, lidé s avatary, jmény a rolemi, org chart, oddělení, KPI podle odvětví a rozběhnutý hodnoticí cyklus v různých stavech. Z prázdného prostředí jde firma kdykoliv naimportovat (Lidé → Importovat firmu).

**Tři designy přepínatelné za běhu** (onboarding, 🎨 v top baru, Nastavení):
- **Korporát** — klasický, čistý, důvěryhodný
- **Glass** — Apple-like skleněný vzhled (blur, světlo, pill buttony)
- **Gen Z** — maximalismus: výrazné barvy, tučné fonty, tvrdé stíny

**Tři role** (přepínač vpravo nahoře): HR, manažer, zaměstnanec — každá má vlastní navigaci a dashboard, věrně dle původního zadání (Hodnocený / Hodnotitel / HR).

**Workflow hodnocení 1:1 dle ověřeného procesu:**
1. Výzva (notifikace, cc hodnotitel) → 2. Sebehodnocení = **Verze 1** (wizard 5 kroků, autosave) → 3. Příprava hodnotitele = **Verze 2 draft** (vidí odpovědi hodnoceného, soukromá poznámka) → 4. Rozhovor + aktualizace = **Verze 2 final** + termín příštího hodnocení → 5. Potvrzení hodnoceným = **Verze 3** (shoda obou stran; možnost žádat znovuotevření).

**Model cílů (dle původní metodiky, rozšířeno):** každá ze tří oblastí (Týmová spolupráce / Osobní rozvoj / Kvalita práce) má vlastní cíle — počet na oblast definuje HR v Pravidlech cílů (min. 2, max. 5, výchozí 3/2/3). Váhy cílů v oblasti musí dát přesně 100 % — systém jinak nepustí dál (wizard i uzavření manažerem). Cíle se vážou na firemní KPI nebo týmové KPI oddělení; vazba je povinná u Týmové spolupráce a Kvality práce, u Osobního rozvoje volitelná (rozvojové cíle). Hodnocený cíle a váhy navrhuje, manažer je při verzi 2 potvrzuje (po jednom či hromadně) — bez potvrzení všech cílů nelze hodnocení uzavřít. Po potvrzení verze 3 se nové cíle automaticky založí do dalšího období. Z ratingů se počítá **vážené skóre** a **indikativní pásmo odměňování** (mimořádná prémie / standardní / rozvojový plán / riziko) — vidí jen manažer a HR, rozhodnutí zůstává na lidech.

Dále: škála TN/PO/KV/NR/NU/N-A, vážené SMART cíle vč. firemních KPI dle odvětví (cestovka přebírá reálný model: podíl online 13 %, pojištění u 50 % objednávek, náklady ≤ 2,2 %…), HR centrum (dokončenost, rozložení stavů, riziková hodnocení, rozložení ratingů, 30denní notifikační osa, spuštění nového cyklu), kudos zeď, 1:1 check-iny, nápověda se škálou a 5 fázemi, tiskový výstup (Ctrl/Cmd+P z detailu hodnocení), jazyky CZ / EN / DE.

## Spuštění a nasazení

Lokálně: otevři `index.html` v prohlížeči (funguje offline; Google Fonts mají fallback).

**Produkce:** [https://demo.teampulse.cz](https://demo.teampulse.cz) (Cloudflare Pages)

**Cloudflare Pages přes GitHub:**
1. Repo `teampulse-demo-v2` na GitHubu (kořen = obsah dema).
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Build command: *(žádný)* · Build output directory: `/`.
4. Custom doména: `demo.teampulse.cz` (CNAME → `<project>.pages.dev`).
5. Každý push do `main` = automatický deploy; PR dostávají preview URL.

## Architektura a napojení na Supabase

```
demo-v2/
  index.html        – shell
  css/app.css       – layout + komponenty + 3 témata ([data-theme])
  js/i18n.js        – slovníky CZ/EN/DE (t('key'))
  js/store.js       – ★ datová vrstva (localStorage adapter)
  js/generator.js   – generátor firem, odvětví, KPI, seed dat
  js/reviews.js     – workflow hodnocení (wizard, manažer, potvrzení, tisk) + UI helpery
  js/app.js         – router, shell, onboarding, ostatní pohledy
```

★ **Celá aplikace mluví výhradně se `Store`** (`list/get/insert/update/remove/replaceAll`, `getCompany/setCompany`, `getSettings/patchSettings`). Napojení backendu = implementace stejného rozhraní nad Supabase (async varianty + RLS per tenant, viz stub v `store.js` a `docs/07_rls_strategy.md`). Kolekce mapují 1:1 na tabulky: `people`, `reviews`, `goals`, `kudos`, `checkins`, `notifications`.

## Co demo záměrně neumí

Žádná auth/SSO (v MVP Supabase Auth), žádná AI (odstraněna ze security důvodů), žádná persistence napříč zařízeními (localStorage), e-maily se simulují in-app zvonečkem.

## Reset

Nastavení → Resetovat demo, nebo v konzoli: `localStorage.removeItem('teampulse_demo_v2')`.
