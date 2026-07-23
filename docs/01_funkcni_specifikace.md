# Funkční specifikace — hodnoticí proces

**Verze:** 1.1 · **Datum:** 2026-07-22 · **Zdroj pravdy:** kód v `demo-v2/js/`

## 1. Role a oprávnění

Tři role, kombinovatelné (hodnotitel je téměř vždy i hodnocený): **Hodnocený** vidí jen svá hodnocení a cíle. **Hodnotitel** navíc hodnocení svých podřízených (dle `managerId`), jejich podklady a skóre. **HR** vidí vše včetně všech hodnocení, skóre, pásem a soukromé poznámky NEvidí (ta je jen hodnotitele — pozn.: v demu HR poznámku vidí v read-only; v produkci zvážit zúžení).

## 2. Stavový automat hodnocení

```
pending_self → self_in_progress → self_done → manager_in_progress
→ manager_done | conversation_scheduled → conversation_done
→ awaiting_employee_confirmation → confirmed → closed_by_hr
(kdykoliv) → cancelled
```

Verze snímků: `v1_self` (odeslání sebehodnocení), `v2_draft` (manažer dokončil přípravu), `v2_final` (po rozhovoru), `v3_confirmed` (potvrzení hodnoceným). Každá verze se ukládá s časem do `form.versions` — auditní stopa.

## 3. Wizard sebehodnocení (6 kroků)

1. **Reflexe** — tři otevřené otázky (úspěchy, výzvy, rozvoj).
2. **Oblasti/kompetence** — škála TN/PO/KV/NR/NU/N-A. Při zapnutém detailním rámci se hodnotí kompetence místo oblastí.
3. **Vyhodnocení cílů minulého období** — seskupeno po oblastech; výsledek (text) + rating na cíl.
4. **Cíle na další období** — viz §5. Tvrdá validace: bez splnění nelze pokračovat ani odeslat.
5. **Školení a rozvoj** + závěrečné shrnutí.
6. **Náhled** — read-only kontrola, Uložit / Odeslat (v1).

Autosave po každé změně; BACK se vrací na předchozí krok; rozpracovaný wizard se otevírá na místě posledního záznamu (`form.wizardStep`).

## 4. Manažerský flow

- Vstup od stavu `self_done`. **Tichá shoda:** rating oblastí/kompetencí a ratingy cílů se předvyplní z hodnot hodnoceného (`mgrPrefilled` flag); manažer mění jen neshody.
- **Podklady z období:** kudos přijatá hodnoceným, 1:1 check-iny a plnění cílů od posledního hodnocení.
- **Rozhodnutí per cíl** (staré i nově navržené): `Souhlasím` / `K rozhovoru` (`mgrDecision`). U vyhodnocovaných cílů navíc vlastní rating (`mgrRating`) a nepovinná poznámka (`mgrNote`).
- **Auto-rozpor:** pokud se `mgrRating` liší od ratingu hodnoceného, cíl se označí `K rozhovoru` automaticky (i bez poznámky). Návrat ratingu ke shodě auto-rozpor zruší; ruční rozpor s poznámkou zůstává.
- Rozporované body se agregují do bloku **Body k rozhovoru z cílů** (agenda 1:1).
- **Guardy přechodů:** naplánovat rozhovor lze jen s rozhodnutím u všech cílů. Uzavřít v2 a poslat k potvrzení lze jen: bez otevřených rozporů (vše Souhlasím), váhy nových cílů = 100 % v každé oblasti, vyplněn termín příštího hodnocení.
- Soukromá poznámka hodnotitele — hodnocený ji nikdy nevidí (ani v tisku pro hodnoceného).

## 5. Model cílů

- Tři oblasti: Týmová spolupráce / Osobní rozvoj / Kvalita práce.
- **Počet cílů na oblast** definuje HR (`company.goalPolicy`, min 2, max 5, default 3/2/3).
- **Váhy v oblasti = přesně 100 %** (presety 50/50, 30/30/40, 4×25, 5×20; editovatelné). Validace ve wizardu (krok 4) i při manažerském uzavření.
- **Vazba na KPI** (`kpiRef = {type: company|team, id}`): povinná pro teamwork a quality, volitelná pro growth (`KPI_REQUIRED`).
- Cíle navrhuje hodnocený (krok 4, předvyplněno rolloverem z běžících cílů), manažer potvrzuje. Po `confirmed` se nové cíle materializují do dalšího období (`materializeNewGoals`).

## 6. Kompetenční rámec

`company.competencies = null` → jednoduchý režim (hodnotí se 3 oblasti). Pole 7 kompetencí (knihovna dle DER: spolupráce 15, leadership 20, analýza 10, sebeřízení 15, zákazník 10, odbornost 10, výsledky 20) → detailní režim: hodnotí se kompetence **místo** oblastí; agregace do oblastí přes `areaKey` mapping. Váhy editovatelné, součet 100 % vynucen. Ratingy ve `form.compRatings = {self, mgr}`.

## 7. Skóre a odměňování

`RATING_VALUE`: TN 1.2 · PO 1.1 · KV 1.0 · NR 0.85 · NU 0.7 (N/A se nepočítá).
Skóre oblasti = průměr (vážený rating kompetencí oblasti NEBO rating oblasti; vážený výsledek cílů oblasti dle `mgrRating ?? rating`). Celkové skóre = průměr oblastí.
Pásma: ≥1.10 mimořádná prémie / ≥0.95 standardní / ≥0.85 rozvojový plán / < 0.85 riziko. Viditelnost: hodnotitel + HR. **Žádný automatický výpočet odměny.**

## 8. Notifikace a eskalace (30denní osa)

Den 0 výzva (cc hodnotitel) · 5 reminder · 10 eskalace hodnotiteli · 15 reminder drafty · 18 plánování rozhovoru · 25 potvrzení · 30 cíl uzavřeno · 35+ HR eskalace. Riziko: ≤7 dní do termínu = žluté, po termínu = červené (blokováno). HR může poslat připomínku jedním klikem. V demu in-app zvoneček; v produkci e-mail + in-app.

## 9. HR cykly

Spuštění cyklu vytvoří `pending_self` hodnocení všem zaměstnancům bez běžícího hodnocení v období; `goalsEval` se naplní z aktuálních osobních cílů. Dashboard: dokončenost, rozložení stavů, riziková hodnocení, rozložení ratingů (kalibrace), pásma odměňování.

## 10. Typy hodnocení

| Typ | Účel | Rozsah formuláře | Skóre/pásmo |
|---|---|---|---|
| **Roční (annual)** | Hlavní hodnocení — páteř procesu | Plný wizard 6 kroků: reflexe, oblasti/kompetence, vyhodnocení cílů, nové cíle, rozvoj, náhled | ano |
| **Pololetní check (semi)** | Kontrola stavu v půli roku; volitelné (HR vypínatelné v Pravidlech cyklu) | 3 kroky: krátká reflexe (2 otázky), check cílů (progress + komentář + návrh změny váhy), náhled. Žádné hodnocení oblastí, žádné nové cíle | ne |
| **Nováček (probation)** | Týden před koncem zkušební doby; srovnávací moment | Adaptační otázky, oblasti/kompetence, **první zadání cílů** (krok vyhodnocení se přeskakuje), náhled | ano (z oblastí) |

Pravidla pololetního checku: změna váhy cíle je **návrh**, který potvrzuje manažer (Souhlasím / K rozhovoru); váhy v oblasti musí i po změně dát 100 %; po potvrzení hodnoceným (v3) se schválené váhy a progress propíšou do cílů. Nové cíle se v checku nezakládají. Cíle nováčka se po potvrzení zakládají do **běžícího** období (vyhodnotí se při dalším pravidelném hodnocení); u ročního do období následujícího. Typ cyklu volí HR při spuštění; probation cyklus cílí jen na lidi ve zkušební době.

## 11. Talent & nástupnictví (2026-07)

Nad procesem hodnocení stojí talentová vrstva: talent sekce v manažerské části ročního hodnocení (potenciál, připravenost, riziko odchodu, mobilita, jazyky — původně „mimo scope", nyní implementováno), 9-box matice, Můj tým, klíčové pozice s nástupci a kvartální talent check se stavovým automatem draft → debate → final. Kompletní funkční i technický popis: **08_talent_succession.md**. Pro tento dokument platí jediné doplňkové pravidlo rolí: veškerá talent data vidí pouze hodnotitel (svůj tým) a HR — hodnocený nikdy, ani v tisku.

## 12. Mimo scope dema (plán produkce)

Auth/SSO (Supabase Auth), e-mailové notifikace, multi-tenant RLS, šablony formulářů per pozice, NÁHLED ALL (read-only přehled vybraných vedoucích), kalibrační session, CMS pro tutoriály/dokumenty. Z talent modulu dále: checklist kandidáta na nástupce (21 otázek), červená karta + matice potřebnosti, 360 zpětná vazba (koncepty v kořeni repa).
