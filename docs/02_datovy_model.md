# Datový model a rozhraní Store

**Verze:** 1.1 · **Datum:** 2026-07-22 · **Zdroj pravdy:** `js/store.js`, `js/generator.js`, `js/talent.js`

## 1. Princip

Celá aplikace komunikuje výhradně přes `window.Store` (localStorage adapter). Napojení Supabase = implementace stejného rozhraní (async varianty), nic jiného se v aplikaci nemění. Kolekce mapují 1:1 na budoucí tabulky.

```js
Store.getCompany() / setCompany(c)
Store.getSettings() / patchSettings(p)
Store.list(coll) / get(coll, id) / insert(coll, item) / update(coll, id, patch)
Store.remove(coll, id) / replaceAll(coll, items) / resetAll()
```

Kolekce: `people`, `reviews`, `goals`, `kudos`, `checkins`, `notifications`, `keyPositions`, `talentChecks`. Chybějící kolekce se do starších localStorage DB doplňují automaticky při `load()` (migrace přes `blank()`).

## 2. Entity

### company (singleton)
```
name, industry (it|travel|auto|null), size, createdAt
departments: [{key, name}]
kpis:       [{id, title, desc, target, current(0-100), weight}]        // firemní KPI
teamKpis:   [{id, deptKey, dept, title, target, current}]              // týmové KPI
goalPolicy: {teamwork: 2-5, growth: 2-5, quality: 2-5}                 // počty cílů na oblast
competencies: null | [{key, title, weight, areaKey}]                   // kompetenční rámec (Σ=100)
```

### people
```
id, firstName, lastName, name, initials, hue, female
role, deptKey, dept, managerId (→people.id | null), isHead, isLead
email, hiredMonthsAgo, photoUrl?   // volitelná fotka; avatar() má fallback na iniciály
```
Org chart se odvozuje z `managerId` (kořen = bez manažera).

### reviews
```
id, subjectId, evaluatorId, type (probation|semi|annual)
period, status (viz stavový automat), startedAt, deadline
form: {
  wizardStep, mgrPrefilled,
  self: {success, challenge, improve, areas{teamwork,growth,quality}, summary},
  compRatings: {self: {compKey: rating}, mgr: {...}},        // jen při detailním rámci
  mgr: {areas{}, areaComments{}, strengths, growthAreas, talking, privateNote, summary},
  goalsEval: [{goalId, title, areaKey, weight, kpiRef, outcome, rating,
               mgrRating, mgrNote, mgrDecision (null|agree|discuss), mgrConfirmed}],
  newGoals:  [{id, areaKey, title, desc, weight, kpiRef, mgrDecision, mgrConfirmed}],
  mgr.talent: {potential, readiness, attrition, mobility, languages},  // soukromá talent sekce, jen annual; viz 08
  trainings: [string], employeeComment, conversationDate, nextReviewDate,
  versions: [{label: v1_self|v2_draft|v2_final|v3_confirmed, at}]
}
```

### goals
```
id, ownerId, areaKey (teamwork|growth|quality), title, desc
weight (Σ v oblasti = 100), progress (0-100)
kpiRef: null | {type: company|team, id}
confirmedByManager, due, type (personal|company), period
```

### keyPositions / talentChecks (modul Talent & nástupnictví — detail v 08)
```
keyPositions: {id, deptKey, dept, title, holderId, checklist{q1..q12: bool|null},
               proposedBy, confirmedByHr, successors: [{personId, level, readiness}]}
talentChecks: {id, period, managerId, status (draft|debate|final),
               items: [{personId, box|null, source, note, attrition}],
               createdAt, sentAt, discussedAt}
```

### kudos / checkins / notifications
```
kudos:    {id, fromId, toId, msg, value (team|quality|growth|client), at}
checkins: {id, managerId, employeeId, at, mood, notes, next}
notifications: {id, text, forRole, at, read}
```

### settings (singleton, per-device)
```
theme (corp|glass|genz), locale (cs|en|de), onboarded, viewAs {role, personId}
```

## 3. Mapování na Supabase (plán)

| Demo kolekce | Tabulka | Poznámka |
|---|---|---|
| company | `tenants` + `tenant_settings` | kpis/teamKpis → `kpis` tabulka s `scope` (company/team) + `dept_key` |
| people | `users` + `manager_relationships` | RLS: tenant_id; viz docs/07_rls_strategy.md v kořeni repa |
| reviews | `reviews` + `review_versions` (snapshoty jsonb) | `form` → normalizovat: `review_section_responses`, `review_goal_evals` |
| goals | `goals` | FK `kpi_id` nullable + check constraint na KPI_REQUIRED dle oblasti |
| kudos / checkins | `feedback` (typ kudos) / `checkins` | |
| notifications | `notifications` + scheduler (pg-boss / Supabase cron) | |
| keyPositions | `key_positions` + `succession_candidates` | RLS: mgr svůj strom, HR vše; subjekt nikdy |
| talentChecks | `talent_checks` + `talent_check_items` | draft čitelný JEN autorem; final propisuje overridy do matice |

Validace, které musí backend vynucovat serverově (ne jen v UI): součet vah cílů v oblasti = 100; KPI vazba povinná u teamwork/quality; přechody stavového automatu (guardy z funkční specifikace §4); zápis verze při každém přechodu; přechody talent checku draft→debate→final (debate autor, final jen HR) a úplný zákaz přístupu subjektů k talent datům (talent sekce, matice, checky).
