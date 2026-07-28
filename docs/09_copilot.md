# 09 — TeamPulse Copilot (realizační dokument)

**Verze:** 1.0 · **Datum:** 2026-07-28 · **Stav:** nástřel v demu (simulovaný engine) · **Soubor:** `js/copilot.js`

## 1. Koncept

Copilot je chatový „parťák" nad daty v systému — poslední položka v menu, rozhraní ve stylu Claude / ChatGPT / Gemini. Uživatel zadává dotazy a akce přirozeným jazykem (CZ/EN/DE) a Copilot odpovídá **výhradně z dat, na která má aktuální persona právo**. Kde je potřeba strukturovaná volba (škála, nálada, hodnota firmy, souhlas), nabídne klikací chipy přímo v chatu.

Zároveň jde o **koncept budoucí mobilní aplikace**: na mobilu se sekce chová chat-first (skrytý postranní panel, plná výška), s možností přepnout do klasických modulů přes spodní navigaci. V hlavičce chatu je badge „Budoucí mobilní app".

## 2. Bez AI — simulovaný engine (security pivot 2026-06)

Demo **nevolá žádné externí AI**. Engine je deterministický:

1. **Intent parser** — regexy nad normalizovaným vstupem (lowercase, bez diakritiky), klíčová slova ve třech jazycích. Pořadí testů řeší kolize (schedule > self > kudos-stats > kudos > … > eval > goals).
2. **Slot-filling flows** — stavový automat per vlákno (`thread.state = {flow, step, data}`). Chybějící sloty se doptávají textem nebo chipy; „zruš/cancel/stop" flow kdykoliv ukončí.
3. **Fuzzy match jmen** — 4-znakové stemy bez diakritiky zvládají české skloňování („pochval **Janu**" → Jana); víc kandidátů → výběr chipem.
4. **Šablonové odpovědi** — i18n klíče `cop.*` + data ze Store (progressbary, výčty, skóre).
5. **Skloňování jmen** (`js/czname.js`) — vokativ v uvítání („Ahoj, Jakube!"), akuzativ („Uznání pro Terezu", „Jdeme vyhodnotit Davida Nováka") a instrumentál („Záznam 1:1 s Petrem Veselým"). Jen locale cs; křestní jméno musí být v whitelistu českých jmen, jinak se celé jméno neskloňuje (cizí jména bezpečně beze změny).

Produkční výhled: rozhraní `Copilot.reply(thread, input)` je jediný vstupní bod — dá se vyměnit za LLM adapter (Azure OpenAI EU, function-calling nad stejnými akcemi) beze změny UI. Akční funkce (kudos, checkin, self, eval, reporty) pak poslouží jako **tools** s vynucenými právy.

## 3. Co umí (flows propsané do dat)

| Flow | Kdo | Výsledek v datech |
|---|---|---|
| Uznání (kudos) | všichni | `kudos` insert + notifikace; hodnota firmy chipem |
| Záznam 1:1 | manažer, HR | `checkins` insert (nálada chipem, poznámky, další krok) |
| Sebehodnocení | hodnocený | reflexe 3 otázky + ratingy oblastí/kompetencí chipy → `form.self` (`compRatings.self` v detailním režimu), status → `self_done` |
| Vyhodnocení člena týmu | manažer, HR | ratingy s **tichou shodou** (chip „Souhlasím se sebehodnocením"), rozhodnutí u cílů Souhlasím / K rozhovoru (rozpory → body k rozhovoru), silné stránky → `form.mgr`, status → `manager_done`, náhled skóre + pásma |
| Reporting | dle role | stav hodnocení, rizika termínů, nálada z 1:1 (+stale), eNPS (s anonymitní pojistkou), kudos statistiky, plnění cílů |
| Naplánované úlohy | všichni | `copilotTasks`; denně/týdně/měsíčně/jednorázově; spouští se při otevření Copilota a přeplánují se |

Nerozpoznaný vstup → přehled schopností (žádné halucinace).

## 4. Proaktivita

Nové vlákno začíná uvítáním `„Ahoj {jméno}…"` + **doporučení počítaná ze stavu dat persony** (max 3): čekající sebehodnocení (s chipem „Vyplnit v chatu"), hodnocení k potvrzení, počet čekajících vyhodnocení v týmu, lidé bez 1:1 přes 30 dní, dokončenost a rizika (HR), běžící eNPS vlna, žádost o 360. Chipy vedou buď do flow v chatu, nebo navigují do modulu.

## 5. Datový model (Store)

```
copilotThreads  { id, ownerKey:'role|personId', title, pinned, createdAt, updatedAt,
                  msgs:[{id, who:'user'|'bot', text?, html?, chips?:[{label,act:'ans'|'ask'|'nav',val}], at}],
                  state:{flow,step,data} | null }
copilotPrompts  { id, ownerKey, label, text, at }          — uložené prompty
copilotTasks    { id, ownerKey, text, freq:'daily'|'weekly'|'monthly'|'once', nextAt, at }
```

`ownerKey` = role + personId → **historie, prompty i úlohy jsou per persona** (přepnutí role v demu = jiný uživatel, žádný únik dat). Supabase pozn.: kolekce 1:1 na tabulky, `ownerKey` → `user_id` + RLS.

## 6. Práva (invarianty)

- Zaměstnanec: reporting jen nad vlastními daty (žádný výčet cizích hodnocení), nemůže zapisovat 1:1 ani vyhodnocovat.
- Manažer: scope = přímý tým (vyhodnocení jen vlastní podřízení se `self_done`).
- eNPS: agregát až od MIN_N odpovědí — Copilot jinak čísla odmítne (`cop.r.anon`).
- Talent data (matice, checky, červené karty) Copilot **záměrně nevystavuje vůbec**.

## 7. UI

Dvousloupcový layout: vlevo historie vláken (pin 📌, mazání), uložené prompty (spuštění klikem, uložení ikonou u vstupu) a naplánované úlohy; vpravo chat — zprávy s pulzním T-avatarem, chipy, typing indikátor, Enter odesílá. Vypnutí/zapnutí: karta v Nastavení (`settings.copilotEnabled`, default zapnuto) — vypnutí schová položku menu i mobilní tab, historie zůstává. Styly `cop-*` v `app.css` vč. variant pro 4 témata a mobilní chat-first breakpoint.

## 8. Testy

`test-headless.js` blok 13 (~30 checků): migrace kolekcí, welcome + chipy, intent parser, všechny 4 flows end-to-end (propis do Store + stavové přechody), plánování a spouštění úloh, prompty per persona, práva zaměstnance, vypnutí, i18n úplnost `cop.*` (×3 jazyky), render smoke.

## 9. Roadmap

1. LLM adapter (Azure OpenAI EU) za `Copilot.reply` — function-calling nad stávajícími akcemi, RAG nad nápovědou/směrnicemi HR.
2. Copilot jako samostatná PWA na `copilot.teampulse.cz` (mobilní app) — stejný Store přes Supabase.
3. Další flows: pololetní check, docházka na rozhovory, návrhy cílů z KPI, sumarizace 1:1 historie před rozhovorem.
4. Push notifikace pro naplánované úlohy (dnes se spouští při otevření).
