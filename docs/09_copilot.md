# 09 — TeamPulse Copilot (realizační dokument)

**Verze:** 1.3 · **Datum:** 2026-07-30 · **Stav:** plné pokrytí aplikace + nápověda v chatu (simulovaný engine) · **Soubory:** `js/copilot.js`, `js/help.js`

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
| Pololetní check | hodnocený | kratší flow: reflexe + progress cílů chipy → `self_done` (typ semi) |
| Vyhodnocení člena týmu | manažer, HR | ratingy s **tichou shodou**, rozhodnutí u cílů Souhlasím / K rozhovoru, silné stránky → `form.mgr`, status → `manager_done`, náhled skóre + pásma |
| Potvrzení hodnocení | hodnocený | komentář + Souhlasím/Nesouhlasím → `confirmed` (materializace nových cílů / semi změn přes `ReviewLogic`) nebo návrat k rozhovoru |
| Hodnoticí rozhovor | manažer, HR | „naplánuj rozhovor s X na zítra" → `conversationDate` + `conversation_scheduled`; „rozhovor proběhl" → `conversation_done` |
| Nový cyklus | HR | typ chipem (roční/pololetní/probace) + potvrzení → hromadné založení `reviews` (pending_self) |
| Připomenutí | manažer, HR | „připomeň Petrovi / všem v riziku" → notifikace eskalace |
| Cíle | všichni | „přidej cíl…" (oblast/KPI/váha chipy → insert `goals`), „nastav progress na 60 %" (fuzzy match názvu) |
| KPI | HR (zápis), všichni (čtení) | „nastav KPI X na 55 %" → `company.kpis`; „jak jsme na tom s KPI" → firemní + týmové bary |
| eNPS odpověď | všichni s pending vlnou | chipy 0-10 (NPS + 3 dimenze) + komentář → response BEZ identity, `respondedIds` odděleně |
| 360 vyžádání | manažer, HR | automatický návrh respondentů (manažer + podřízení + kolegové, 3-5) + potvrzení → `feedback360` insert |
| 360 vyplnění | pozvaný respondent | ratingy chipy + silné stránky + rozvoj → odpověď respondenta; po všech `closed` |
| Přidání člověka | manažer, HR | jméno + oddělení chipem + manažer chipem → `people` insert |
| Vzhled + jazyk | všichni | „přepni na glass" / „switch to english" → settings |
| Vypnutí Copilota | všichni | „vypni se" + potvrzení → `copilotEnabled:false` a přesměrování do Nastavení |
| Reporting | dle role | stav hodnocení, rizika, nálada+stale, eNPS, kudos, cíle, KPI, **kdo je X** (karta člověka), **můj tým v kostce**, notifikace, hodnoticí škála, **talent přehled** (jen mgr/HR: hvězdy, riziko, retenč. rizika, klíčové pozice), 360 výsledky (agregát), mini nápověda „jak na…" |
| Naplánované úlohy | všichni | `copilotTasks`; denně/týdně/měsíčně/jednorázově; spouští se při otevření Copilota a přeplánují se |

Nerozpoznaný vstup → přehled schopností **a témata nápovědy** (žádné halucinace).

## 3b. Copilot jako nápověda (znalostní báze)

Copilot odpovídá i na otázky **o aplikaci samotné**. Obsah se nikde nedubluje: zdrojem je `HelpKB` (`js/help.js`) — tedy přesně to, co je v sekci Nápověda. Jeden zdroj pravdy, texty žijí v i18n (cs/en/de).

- **Témata** (`HelpKB.topics`): příručka pro moji roli, průběh hodnocení v 5 fázích, typy hodnocení, model cílů a váhy, hodnoticí škála, zpětná vazba (uznání + konstruktivní vazba), moduly (talent, nálada, 1:1, přehledy), **shoda a potvrzení**, **stavy a kdo je na tahu**, **kdo co vidí (soukromí)**, Copilot. Poslední tři přibyly s verzí 1.2 — chyběly a přitom je to nejčastější dotaz uživatelů.
- **Rozpoznání dotazu:** tázací rámce („jak funguje / co je / kde najdu / proč / kdo vidí / co když") mají v routeru přednost před akcemi — „zapiš 1:1 s Petrem" je akce, „jak zapíšu 1:1?" je nápověda. Dotazy s odpovědí z dat (novinky, škála, notifikace) mají přednost před textem.
- **Když rámec chybí** („jaké jsou typy hodnocení?"), sáhne router na konci po `HelpKB.search` a odpoví z nápovědy místo „tohle neumím".
- **Volba tématu:** každé téma má klíčová slova (`kw`, bez diakritiky, cs/en/de), která váží nejvíc; pak název, nejlepší odstavec a pokrytí dotazu. Porovnává se na hranici slova a přes kmen, takže „nástupnictví" nespadne do „stupnice" a „hodnocením" sedne na „hodnocení".
- **Odpověď** = nadpis + celé téma v odrážkách (trefené odstavce první) + chipy „Otevřít (sekce)", „Nápověda" a dvě související témata bez duplicit.
- **Objevitelnost:** uvítání nabízí příklady otázek a chip s vysvětlením procesu, „co umíš" vypisuje i seznam témat pro moji roli.
- **Práh relevance:** odpověď se vezme jen když dotaz trefil klíčové slovo tématu, nebo pokryl většinu svých nosných slov (4+ znaků). Jinak Copilot přizná, že to neví (`cop.kb.noMatch`) — „jak si změním heslo" ani „kolik stojí licence" už nevrátí náhodné téma. Krátká zájmena („si", „mi") jsou ve stop-listu, protože jako podřetězec sedla skoro všude.

### Dotazy na moje data (v1.3)

Tři otázky, které vypadají jako nápověda, ale odpověď je v datech, mají vlastní intenty — text nápovědy by tu byl vyhýbavý:

| Dotaz | Intent | Odpověď |
|---|---|---|
| „kdo mě hodnotí", „kdo je můj manažer" | `r.myEval` | jméno a role hodnotitele (fallback na nadřízeného) + proklik na hodnocení |
| „co mám dnes udělat", „co mě čeká" | `r.myTodo` | co visí na mně: sebehodnocení, potvrzení, vyhodnocení týmu, rozhovory, eNPS, 360, kvartální check — chipy spouští akci rovnou v chatu |
| „kdo v týmu nemá nástupce" | `r.succGaps` | nekryté klíčové pozice ve scope (manažer tým, HR firma; zaměstnanec nikdy) |

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
- Talent data: zaměstnanec NIKDY (denied hláška); manažer jen vlastní tým, HR celá firma - a pouze agregáty (počty v matici, retenční rizika, pokrytí klíčových pozic). Jednotlivé checky, červené karty a checklisty zůstávají výhradně v modulu Talent.

## 7. UI

Dvousloupcový layout: vlevo historie vláken (pin 📌, mazání), uložené prompty (spuštění klikem, uložení ikonou u vstupu) a naplánované úlohy; vpravo chat — zprávy s pulzním T-avatarem, chipy, typing indikátor, Enter odesílá. Vypnutí/zapnutí: karta v Nastavení (`settings.copilotEnabled`, default zapnuto) — vypnutí schová položku menu i mobilní tab, historie zůstává. Styly `cop-*` v `app.css` vč. variant pro 4 témata a mobilní chat-first breakpoint.

## 8. Testy

`test-headless.js` bloky 13 + 13b + 22 + 23 (~105 checků): migrace kolekcí, welcome + chipy, intent parser, všechny flows end-to-end (propis do Store + stavové přechody), plánování a spouštění úloh, prompty per persona, práva zaměstnance, vypnutí, i18n úplnost `cop.*` (×3 jazyky), render smoke.

Blok 23 hlídá práh relevance (5 dotazů mimo doménu musí být odmítnuto), správné směrování dotazů na moje data, jméno hodnotitele z dat, práva u nástupnictví a i18n. Blok 22 hlídá nápovědu v chatu: 12 otázek musí (a) být rozpoznáno jako dotaz, (b) trefit **konkrétní** téma — ne jen „nějakou odpověď", (c) vrátit věcný text, ne výpis schopností. Dál se ověřuje, že odpověď obsahuje texty z klíčů `help.*` (jeden zdroj pravdy), nabízí prokliky na související témata, že nová témata jsou i v sekci Nápověda, a i18n ve třech jazycích.

## 9. Roadmap

1. LLM adapter (Azure OpenAI EU) za `Copilot.reply` — function-calling nad stávajícími akcemi, RAG nad nápovědou/směrnicemi HR (`HelpKB` už je připravená jako korpus).
2. Copilot jako samostatná PWA na `copilot.teampulse.cz` (mobilní app) — stejný Store přes Supabase.
3. Další flows: návrhy cílů z KPI, sumarizace 1:1 historie před rozhovorem, kalibrační podklady. (Pololetní check, rozhovory, cyklus, eNPS, 360, KPI a správa lidí už chat umí - v1.1.)
4. Push notifikace pro naplánované úlohy (dnes se spouští při otevření).
