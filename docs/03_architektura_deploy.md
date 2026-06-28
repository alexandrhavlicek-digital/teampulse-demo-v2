# Architektura a nasazení

**Verze:** 1.0 · **Datum:** 2026-06-12

## 1. Stack dema

Statická aplikace bez build kroku: vanilla JS (ES2020), CSS custom properties, hash-router. Žádné externí JS závislosti (ikony i generátor jsou vlastní); Google Fonts s degradací na systémové fonty — demo funguje offline.

```
demo-v2/
  index.html        shell (onboarding, app, modal/toast/print vrstvy)
  css/app.css       design system + 3 témata ([data-theme]) + print
  js/i18n.js        slovníky CZ/EN/DE, t('key')
  js/icons.js       vlastní SVG set „Pulse" (24px grid, stroke 1.8), icon(name, size)
  js/store.js       ★ datová vrstva (viz 02_datovy_model.md)
  js/generator.js   generátor firem, KPI, kompetenční knihovna, seed dat
  js/reviews.js     workflow hodnocení + sdílené UI helpery (window.UI, ReviewLogic)
  js/app.js         router, shell, onboarding, ostatní pohledy
  docs/             tato dokumentace
```

Pořadí načítání skriptů je závazné: i18n → icons → store → generator → reviews → app.

## 2. Témata

Tři vizuální světy přepínané za běhu atributem `data-theme` na `<html>`: **corp** (editorial enterprise), **glass** (liquid glass, Apple-like — plovoucí dock sidebar, blur, spekulární hrany), **genz** (neon brutalism — tvrdé stíny, gradient text). Témata nesou i strukturální rozdíly (tvar navigace, radiusy, typografická škála) přes CSS proměnné + per-téma selektory. Nové komponenty: vždy stavět na proměnných (`--accent`, `--surface`, `--hairline`, `--radius`…), nikdy na napevno daných barvách.

## 3. Nasazení — Cloudflare Pages přes GitHub

1. Repo na GitHub (demo-v2 je podsložka).
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git.
3. **Build command: žádný** · **Build output directory: `demo-v2`**.
4. Push do main = produkční deploy; PR dostávají preview URL automaticky.
5. Custom doména přes Cloudflare DNS (CNAME na pages.dev).

EU residency poznámky (z hosting analýzy v kořeni repa): Supabase region Frankfurt; pozor na region edge functions, retenci CF logů a US jurisdikci CF — řešit DPA a politiky před produkcí.

## 4. Plán napojení Supabase (fáze 2)

1. `createSupabaseStore(client)` se stejným rozhraním jako localStorage adapter (async); volání v app vrstvě převést na await (mechanická změna).
2. Auth: Supabase Auth (e-mail + Microsoft/Google SSO); `viewAs` nahradí skutečná session role.
3. RLS per tenant (hybridní model: RLS pro SMB, dedikované schéma enterprise — viz rozhodnutí 2026-06).
4. Notifikační scheduler: Supabase cron → e-maily (Resend/Postmark EU).
5. Demo režim zůstává: lokální Store jako fallback pro „vyzkoušej bez registrace" — generátor firem se nezahazuje, je to akviziční funnel.

## 5. Konvence kódu

Žádné emoji v UI vrstvě — pouze ikonový set Pulse (`icon('name', size)`); emoji jen v uživatelském obsahu (kudos texty, mood). Texty výhradně přes `t('key')` a slovníky ve třech jazycích. XSS: veškerý dynamický text přes `esc()`. Stav hodnocení měnit jen přes `transition()` (zapisuje notifikaci), formulář přes `saveForm()`.
