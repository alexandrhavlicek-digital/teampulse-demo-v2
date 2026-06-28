# Testování — scénáře a smoke testy

**Verze:** 1.0 · **Datum:** 2026-06-12

## 1. Automatizované smoke testy

Headless testy běží přes jsdom (Node 18+): načtou `index.html` + skripty a klikají skutečným DOM. Historie testů pokrývá: onboarding → generování firmy (počty lidí/hodnocení/cílů, váhy oblastí = 100 %), průchod všemi pohledy ve 3 rolích, kompletní lifecycle hodnocení (wizard 6 kroků → manažer → rozhovor → potvrzení → materializace cílů), blokace špatných vah, blokace finalizace bez rozhodnutí/při rozporu, auto-rozpor při neshodě ratingů, kompetenční rámec (přepnutí, validace vah, prefill, skóre), prázdná firma + import, správa firemních KPI, org chart (sbalování, zoom).

Spuštění: `node smoke.js` (vyžaduje `npm i jsdom`). Před release vždy: `node --check js/*.js` + kompletní smoke sada.

## 2. Manuální regresní scénáře

### S1 — Onboarding a generátor
Vyber cestovní kancelář, 50 lidí, téma Glass → vygeneruje se firma s názvem, org chartem, KPI dle odvětví a běžícím cyklem. Ověř: jména skloňovaná správně (ženská příjmení -ová), HR persona existuje, jazykové přepínání CZ/EN/DE mění UI texty.

### S2 — Kompletní hodnoticí smyčka (klíčový scénář)
1. Jako zaměstnanec vyplň všech 6 kroků; v kroku 4 zkus dát váhy 30/30/30 → systém nepustí dál; oprav na 30/30/40 → projde. Odešli.
2. Přepni na manažera → otevři hodnocení. Ověř: ratingy předvyplněné, karta Podklady z období, u cíle změň rating na jiný než zaměstnanec → cíl se sám označí **K rozhovoru** a objeví se ve žlutém bloku.
3. Zkus naplánovat rozhovor bez rozhodnutí u všech cílů → blokace. Rozhodni vše, naplánuj, „Rozhovor proběhl".
4. Zkus uzavřít s otevřeným rozporem → blokace s hláškou o shodě. Vyřeš rozpor, zadej termín příštího hodnocení, uzavři.
5. Přepni na zaměstnance → potvrď. Ověř: stav „Uzavřeno dohodou", nové cíle v Cílech pro další období, vážené skóre viditelné jen pro manažera/HR.

### S3 — HR řízení
Pravidla cílů: změň na 4/2/3 → nový wizard nabízí 4 cíle v Týmové spolupráci s vahami 4×25. Kompetenční rámec: přepni na detailní, uprav váhu na nesoučet 100 → uložení blokováno. Firemní KPI: přidej, edituj kliknutím na řádek, ověř v nabídce vazby cílů. Spusť nový cyklus → vzniknou hodnocení jen lidem bez běžícího.

### S4 — Prázdné prostředí
Onboarding → Prázdné prostředí → Lidé je prázdné s CTA. Přidej člověka ručně; pak Importovat firmu (automotive, 30) → kompletní data, persona přepínač funguje.

### S5 — Org chart
Výchozí pohled = ředitel + vedoucí; ＋ s počtem rozbalí větev; drag posouvá; kolečko zoomuje k kurzoru; reset vrátí pohled; na mobilu posun prstem, zoom tlačítky.

### S6 — Témata a tisk
Přepni Corp/Glass/GenZ za běhu — žádný stav se neztratí. Tisk z detailu hodnocení: A4 výstup s oblastmi, cíli (oba ratingy + poznámky + potvrzení), bez soukromé poznámky při tisku pro hodnoceného.

## 3. Mobilní checklist (≤ 540 px)

Spodní tab-bar místo sidebaru; všechny touch targety ≥ 40 px; wizard použitelný na výšku; org chart pan prstem bez scrollování stránky; modaly scrollovatelné; safe-area na iOS.

## 4. Známá omezení dema

Stav žije v localStorage (jeden prohlížeč = jeden svět); změna datového modelu mezi verzemi může vyžadovat reset dema; „odeslané" notifikace jsou jen in-app; soukromou poznámku vidí v read-only i HR (produkce: zúžit na hodnotitele).
