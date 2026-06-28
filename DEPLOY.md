# Deploy checklist — demo.teampulse.cz

## Hotovo (automaticky)

- Cloudflare Pages projekt: **teampulse-demo-v2**
- Produkční URL: **https://teampulse-demo-v2.pages.dev**
- Custom doména zaregistrovaná v Pages: **demo.teampulse.cz** (status: pending → active po DNS)
- Git repozitář inicializovaný lokálně, CI workflow v `.github/workflows/deploy.yml`

## Ruční krok — DNS (≈2 min)

`demo.teampulse.cz` aktuálně míří na **A záznamy** (Active24 parking). Pro Pages je potřeba **CNAME**:

1. Otevři [Cloudflare DNS pro teampulse.cz](https://dash.cloudflare.com/4b2de46fe56832fbf0b7d175e875ff15/teampulse.cz/dns)
2. Smaž všechny **A / AAAA** záznamy pro název `demo`
3. Přidej **CNAME**:
   - **Name:** `demo`
   - **Target:** `teampulse-demo-v2.pages.dev`
   - **Proxy:** zapnuto (oranžový mráček)
4. Počkej 1–5 min, ověř: `curl -sI https://demo.teampulse.cz/ | head`

Alternativně: Pages → teampulse-demo-v2 → **Custom domains** → znovu potvrď `demo.teampulse.cz` (wizard někdy DNS vytvoří sám).

## GitHub (≈5 min)

`gh` není přihlášený. Po `gh auth login`:

```bash
gh repo create teampulse-demo-v2 --public --source=. --remote=origin --push
```

Nebo ručně vytvoř repo na GitHubu a:

```bash
git remote add origin git@github.com:<user>/teampulse-demo-v2.git
git push -u origin main
```

### CI deploy

V GitHub repo → **Settings → Secrets → Actions** přidej:

- `CLOUDFLARE_API_TOKEN` — token s oprávněním **Cloudflare Pages: Edit**

Každý push do `main` spustí deploy přes `wrangler-action`.

### Pages + Git (volitelně)

Místo GitHub Actions můžeš v Pages projektu připojit Git repo (Build command prázdný, output `/`).

## Lokální deploy

```bash
npx wrangler pages deploy . --project-name=teampulse-demo-v2 --branch=main
```

## Ověření

- [ ] https://teampulse-demo-v2.pages.dev/ — onboarding TeamPulse
- [ ] https://demo.teampulse.cz/ — stejný obsah (po DNS)
- [ ] Security headers: `X-Frame-Options`, `X-Content-Type-Options`
- [ ] Hash routing: `#/home`, `#/people`
