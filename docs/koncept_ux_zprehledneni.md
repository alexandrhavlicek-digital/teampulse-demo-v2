# Koncept: UX zpřehlednění — org chart, cíle, hodnocení

*Návrh řešení tří bodů z uživatelského feedbacku, 2026-08-11. Vychází ze současného stavu kódu (`app.js` — views.org a views.goals, `reviews.js` — renderWizard a renderManagerEditor).*

---

## 1. Org chart — vycentrování

**Dnešní stav.** Plátno umí pan (tažením), zoom (kolečko, +/−) a fullscreen, ale startovní pozice je natvrdo `translate(24px, 16px) scale(1)` — strom se vykreslí od levého horního rohu a u širší firmy přeteče doprava. Tlačítko „reset" jen vrací tutéž pevnou pozici, žádné skutečné vycentrování ani přizpůsobení obsahu neexistuje. Po rozbalení větve se navíc obsah rozšíří a uživatel ho musí ručně dohledávat.

**Návrh.** Přidat jedinou funkci `fitCenter()`, která změří nezvětšený rozměr `.org-stage` (offsetWidth/Height) proti viditelnému `.org-canvas` a nastaví:

- zoom `z = clamp(min((canvasW − 48) / stageW, (canvasH − 48) / stageH, 1), 0.3, 2.2)` — strom se zmenší tak, aby se vešel, ale nikdy se nenafukuje nad 100 %,
- posun `x = (canvasW − stageW·z) / 2`, `y = 24` — horizontálně na střed, nahoře kotven u CEO.

Volá se ve čtyřech momentech: při prvním vykreslení pohledu (místo pevného startu), po kliknutí na dosavadní „reset" (přejmenovat ikonou/titulkem na **Vycentrovat**), při vstupu do/výstupu z fullscreenu a volitelně po sbalení/rozbalení uzlu — tady navrhuji jemnější variantu: dorovnat jen tehdy, když se obsah po změně nevejde do viditelné plochy, aby plátno neskákalo pod rukama při procházení. Jako bonus dvojklik do prázdné plochy plátna = totéž co Vycentrovat.

**Pracnost:** malá — jedna funkce, čtyři místa volání, jeden i18n titulek. Žádná změna dat ani CSS.

---

## 2. Seznam cílů — konec „monster plachty"

**Dnešní stav.** Stránka Cíle má dnes jen dva taby (Seznam | Provázanost). Tab Seznam je jedna dlouhá plachta: karta se všemi firemními KPI, pod ní karta se všemi týmovými KPI (u HR všechna oddělení najednou), a teprve pod tím tři oblasti s řádky osobních cílů. U firmy se 100+ lidmi to pro HR znamená stovky řádků pod sebou; firemní a týmové KPI navíc vizuálně splývají s osobními cíli, přestože jde o jiný typ obsahu.

**Návrh — rozdělit obsah do tabů podle typu, uvnitř sbalovat.** Rozšířit stávající segmentový přepínač (`lang-seg`, stav `glUi.tab` už existuje) na čtyři taby:

**Cíle | Firemní KPI | Týmové KPI | Provázanost**

- **Cíle** — jen osobní cíle. Tři oblasti jako sbalitelné sekce; hlavička sekce nese název oblasti, počet cílů, součet vah a mini progress, takže i sbalená dává přehled. Default: HR sbaleno (otvírá cíleně, k dispozici má stávající filtr jméno/oddělení), zaměstnanec a manažer rozbaleno (mají jednotky cílů). Tlačítko „+ přidat cíl" zůstává jen tady.
- **Firemní KPI** — dnešní bary, s prostorem na popis a cílovou hodnotu, které se dnes tísní v title atributu.
- **Týmové KPI** — seskupit podle oddělení do accordionů (hlavička: oddělení, počet KPI, průměrné plnění). Manažerovi se jeho oddělení otevře automaticky, HR vidí vše sbalené.
- **Provázanost** — beze změny.

Na tabech drobné badge s počty (např. „Cíle 12", „Týmové KPI 8"), ať je vidět objem bez přepnutí.

*Zvažovaná alternativa:* nechat vše na jedné stránce a jen zavést accordiony. Zavrhuji — u HR role by stránka pořád začínala dvěma KPI kartami, které s osobními cíli nesouvisí, a scroll problém by se jen zmírnil, ne vyřešil. Taby oddělují typy obsahu čistěji a využívají už zavedený vzor.

**Pracnost:** cca půl dne — rozšíření `glUi` stavu, rozpad renderu na taby, sbalitelné sekce (nový lehký CSS vzor, použitelný pak i jinde), i18n klíče cs/en/de.

---

## 3. Hodnocení — průvodce vs. plachta

**Diagnóza.** Sebehodnocení zaměstnance **už dnes je** 6krokový průvodce s progress páskem. Skutečná „plachta", na kterou feedback míří, je **manažerský editor**: na jedné stránce je sedm karet — sebehodnocení, podklady z období, rozhodování o cílech (staré + nové), hodnocení oblastí/kompetencí s texty, talent blok, skóre a naplánování rozhovoru. Desítky vstupů, které splývají.

**Návrh — dva rovnocenné režimy zobrazení, uživatel si volí.** Přesně jak zaznělo ve feedbacku: v hlavičce editoru segmentový přepínač **Průvodce | Vše naráz**. Volba se ukládá per osoba do Store (`uiPrefs.reviewMode`), takže se pamatuje napříč hodnoceními. Default navrhuji **Průvodce** — nový uživatel dostane vedenou cestu, zkušený si jednou přepne a zůstane mu plachta.

**Manažerský průvodce — 5 kroků:**

1. **Podklady** — sebehodnocení zaměstnance + podklady z období (kudos, check-iny, plnění cílů, 360). Čistě ke čtení, manažer se zorientuje, než začne hodnotit.
2. **Vyhodnocení cílů** — uplynulé cíle: rating (prefill tichou shodou), poznámka, Souhlasím / K rozhovoru, tlačítko Potvrdit vše.
3. **Nové cíle** — návrhy zaměstnance: úprava vah, rozhodnutí, živá kontrola Σ 100 % na oblast.
4. **Hodnocení** — oblasti/kompetence (s badge „Vy: …" ze sebehodnocení), silné stránky, oblasti rozvoje, body k rozhovoru, soukromá poznámka, talent blok (jen roční typ).
5. **Shrnutí** — indikativní skóre, seznam rozporů k rozhovoru, termíny a akční tlačítka podle fáze (naplánovat rozhovor → rozhovor proběhl → finalizovat).

**Průběhový pásek.** Stávající `.wizard-steps` (anonymní tečky) povýšit na klikatelnou timeline s názvy kroků a stavem vyplněnosti (hotovo / rozpracováno / prázdné). Mezi kroky se chodí volně — tvrdé validace zůstávají tam, kde jsou dnes: u akcí (rozhodnout vše před naplánováním rozhovoru, Σ 100 % a shoda před finalizací). Autosave beze změny (collect() na každý change). Stejný pásek pak dostane i sebehodnocení — tam dnes tečky nejsou klikatelné a nemají popisky.

**Plachta zůstává a dostane drobnost navíc:** sticky mini-navigaci sekcí (kotvy s indikátorem vyplněnosti), takže i v režimu „vše naráz" je vidět, kde co je a co chybí.

**Symetrie u sebehodnocení:** doplnit zaměstnanci inverzní volbu — dnešní průvodce jako default, plus režim „vše naráz" pro ty, kdo chtějí formulář vyplnit jedním průchodem. Nízká priorita, ale naplní to „možnost obou dvou variant pohledu" u obou rolí.

**Technicky.** Klíč je nerozdvojit logiku: `renderManagerEditor` rozpadnout na sekční renderery (`sectionEvidence`, `sectionGoalsEval`, `sectionNewGoals`, `sectionRatings`, `sectionSummary`) + společný `collect()` a bindy. Průvodce renderuje jednu sekci, plachta všechny pod sebou — jedna definice formuláře, dva způsoby skládání. Pololetní check (semi) už má vlastní krátký 3krokový flow, toho se změna netýká.

**Pracnost:** 1–2 dny včetně rozšíření `test-headless.js` (průchod průvodcem oběma rolemi, přepnutí režimu, persistence preference).

---

## Doporučené pořadí a společné práce

1. Org chart fit & center — rychlá výhra, hodiny.
2. Taby na stránce Cíle — půl dne.
3. Duální režim hodnocení — 1–2 dny, největší dopad na hlavní flow aplikace.

Společné pro všechny tři: i18n klíče cs/en/de, bump cache verze v `index.html`, doplnění headless testů, krátká zmínka v příručkách (docs 04–06).

## Otevřené otázky pro rozhodnutí

1. Default režim hodnocení: Průvodce (můj návrh), nebo zachovat plachtu a průvodce jen nabízet?
2. Cíle: čtyři taby (návrh), nebo tři s vnitřním přepínačem Firemní/Týmové uvnitř tabu KPI?
3. Org chart: dorovnávat polohu i po každém sbalení/rozbalení uzlu, nebo jen tlačítkem a při prvním vykreslení (můj návrh: jen když se obsah nevejde)?
