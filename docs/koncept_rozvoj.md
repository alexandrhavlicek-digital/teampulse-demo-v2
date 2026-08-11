# Koncept: Rozvojová část hodnocení — kurzy, skills, napojení na Edunio

*Návrh 2026-08-11 — **MVP implementováno v demu týž den** (js/dev.js; vrstva 1, ruční katalog). Vychází z dnešního stavu (`reviews.js` krok 5: šest natvrdo zadrátovaných štítků ve `f.trainings`, bez katalogu, bez role manažera a bez návazného sledování) a z veřejně dostupných integračních možností Edunia.*

---

## Princip

Hodnocení má dnes dva hmatatelné výstupy: skóre a nové cíle. Třetím výstupem má být **rozvojový plán** — konkrétní seznam kurzů a rozvojových aktivit, na kterém se zaměstnanec s manažerem shodli, s životním cyklem přes celé období (zvoleno → schváleno → probíhá → hotovo) a se zpětnou stopou v dalším hodnocení. Klíčová změna oproti dnešku: rozvoj není poznámka pod čarou v sebehodnocení, ale plnohodnotná dohoda obou stran, stejně jako cíle.

Druhý princip: **katalog není podmínkou zájmu.** Zaměstnanec má mít možnost projevit zájem o skill (soft i hard), i když na něj HR zrovna žádný kurz nemá — právě tahle „neuspokojená poptávka" je pro HR nejcennější report při nákupu školení.

## Datový model (Store)

Tři nové kolekce, vše přes stávající Store abstrakci (Supabase-ready):

**`skillTags`** — číselník dovedností, spravuje HR. Položka: `{ id, label, type: 'soft'|'hard', compKeys: [] }`. Předpřipravený seed: soft skills společné (komunikace, prezentace, time management, zpětná vazba, leadership, řešení konfliktů…), hard skills podle odvětví z generátoru (travel: revenue management, GDS, jazyky; IT: cloud, security…; auto: lean, kvalita…). Vazba `compKeys` na kompetenční rámec umožní doporučování (viz níže).

**`devCatalog`** — katalog rozvojových aktivit, spravuje HR v HR centru. Položka: `{ id, title, desc, kind: 'course'|'elearning'|'mentoring'|'book'|'conference'|'other', skillIds: [], provider: 'internal'|'edunio'|'external', url, durationH, deptKeys: null|[], active }`. `provider` + `url` je zároveň příprava na Edunio (deep link na kurz).

**`devPlans`** — rozvojový plán osoby na období, vzniká materializací při potvrzení hodnocení (v3), stejný vzor jako `materializeNewGoals`. Položka plánu: `{ id, personId, period, reviewId, items: [{ id, catalogId|null, title, skillIds, source: 'self'|'manager', decision: 'approved'|'discuss'|null, status: 'planned'|'in_progress'|'done'|'dropped', note, at }] }`. `catalogId: null` + vlastní `title` = volný zájem mimo katalog.

Ve formuláři hodnocení se `f.trainings` (pole stringů) nahradí `f.devItems` (pole položek výše, bez statusu) — s migrací starých dat při bootu (string → custom položka), stejně jako se dělal backfill u onboardingu.

## Flow v hodnocení

**Zaměstnanec — krok 5 (Rozvoj).** Místo šesti štítků fulltextový picker nad katalogem (vzor f360/rcModal — žádné velké selecty, pravidlo z 2026-08-10) + přepínač Soft/Hard skills se štítky zájmu + volné pole „vlastní přání". Každá volba nese „proč" (nepovinná poznámka). Výstup: seznam `devItems` se `source: 'self'`.

**Manažer — krok Hodnocení (sekce ratings).** Pod silnými stránkami a oblastmi rozvoje nový blok Rozvojový plán: vidí zaměstnancovy volby a u každé rozhoduje **Schvaluji / K rozhovoru** — identický vzor jako u cílů, včetně auto-propisu rozporů do Bodů k rozhovoru. Navíc může přidat vlastní položky (`source: 'manager'`) — „určené" aktivity. A jedna chytrost bez AI: u kompetencí ohodnocených „Potřebuje rozvoj" nebo hůř se přes `skillTags.compKeys` nabídnou relevantní kurzy z katalogu jako jednoklikové návrhy („Analýza: 2 kurzy v katalogu"). Finalizace v2 vyžaduje rozhodnutí u všech položek — stejná disciplína jako u cílů.

**Potvrzení (v3).** Schválené položky se materializují do `devPlans` na další období. Zamítnuté nezanikají — zůstávají v historii hodnocení jako projevený zájem (report pro HR).

## Mimo hodnocení

**Zaměstnanec** dostane kartu Můj rozvoj (navrhuju jako sekci na Přehledu + detail v profilu, ne novou položku menu) — položky plánu s možností posunout status (zahájeno → hotovo), u Edunio kurzů proklik na `url`.

**Manažer** v Můj tým vidí souhrn plánů týmu: kdo nemá žádnou rozvojovou aktivitu, kdo má hotovo, co běží. Dokončené položky se automaticky ukážou v **Podkladech z období** při příštím hodnocení — tím se kruh uzavírá a rozvoj přestává být jednorázový výstřel.

**HR** v HR centru spravuje katalog a skills číselník a dostane report poptávky: nejžádanější kurzy a skilly (včetně zájmů bez kurzu!), míra schválení, pokrytí lidí rozvojovou aktivitou po odděleních, dokončenost. To je přesně podklad pro jednání s dodavateli školení.

## Napojení na Edunio — vrstevnatě

Edunio veřejně deklaruje REST/GraphQL API, SSO přes firemní identity a synchronizaci se mzdovými/HR systémy (Helios, SAP, OKbase, Workday) včetně **evidence absolvovaných kurzů** — přesně to, co potřebujeme. Návrh je ale vrstevnatý, aby demo fungovalo hned a produkt nebyl na Edunio závislý:

1. **Vrstva 1 — ruční katalog (demo, MVP).** HR spravuje katalog ručně, jak Alex popsal. Technicky rozhraní `LearningProvider` (`listCourses()`, `enrollUrl(course, person)`, `syncCompletions()`) s implementací `ManualProvider` nad Store. Vše ostatní v aplikaci mluví jen s tímto rozhraním.
2. **Vrstva 2 — import.** CSV/XLSX import katalogu pro firmy, které mají kurzy v tabulce nebo jiném LMS bez API. Levný mezikrok, řeší reálný stav většiny SMB.
3. **Vrstva 3 — EdunioProvider (produkce, až s backendem).** Katalog se stahuje z Edunio API, „zvolit kurz" = zápis + deep link se SSO, dokončení se synchronizují zpět a propisují do statusu položky plánu i do Podkladů. Stejné rozhraní zvládne i Seduo či jiné LMS — provider je konfigurační volba per tenant, konzistentně s hybridní multi-tenancy architekturou.

V demu vrstvu 3 reprezentuje jen `provider: 'edunio'` u položek katalogu s proklikem — poctivé „připraveno na", žádná fake integrace.

## MVP scope pro demo a pracnost

První iterace (odhad 1,5–2 dny včetně testů): kolekce + migrace `f.trainings`, seed katalogu a skills per odvětví, picker v kroku 5, manažerský blok s rozhodnutími a doporučeními dle kompetencí, materializace do `devPlans`, Můj rozvoj na Přehledu, správa katalogu v HR centru, report poptávky, i18n cs/en/de, headless testy. Mimo první iteraci: import CSV, kapacity/rozpočty kurzů, notifikace kolem statusů, Copilot intenty.

## Otevřené otázky

1. Musí manažer rozhodnout o každé zaměstnancově volbě (návrh: ano, stejná disciplína jako u cílů), nebo volby ≤ N projdou automaticky?
2. Kde bydlí Můj rozvoj — sekce na Přehledu (návrh), nebo samostatná položka v menu?
3. Má HR vidět zamítnuté zájmy jmenovitě, nebo jen agregovaně (návrh: agregovaně — je to citlivé, jmenovitě jen schválené)?
