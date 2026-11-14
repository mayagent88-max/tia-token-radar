# Token Radar — make.fun token-radar-01

A web dashboard that ranks every protocol recording no token by what its
launch would be worth, each with a concrete farm plan. Built from the sealed
DefiLlama snapshot in the kit (`input/snapshot.json`, as of 2026-11-14).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, scores the
198 clean pre-token protocols with the radar-3 model in `lib/model.ts`,
writes `board.json` + `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored `vendor/makefun-board.ts`. Two runs on the
same snapshot write byte-identical output. Open `out/dashboard/index.html`
in a browser — the page is static and needs no network.

## The model (radar-3)

`implied = round(k × TVL^b × categoryAdj × chainMult × growthMult × maturityMult)`

The power law is fitted at run time from the snapshot's own live tokens
(log-log regression of market cap on TVL, n=115, market cap ≥ $100K,
exchange venues excluded): **mcap = 3,415.8 × TVL^0.4619**, R² 16.3%.
A protocol ten times the TVL is worth about 2.9x as much — not ten times
as much, which is why the old linear board's top was several times too big.

- **categoryAdj** — the v1 category table centred on the flat 0.21x the old
  board kept per TVL dollar (0.57×–1.52×): vaults, curators and lending
  books keep more; bridges, staking receipts and exchange venues keep less.
  The power law sets the scale; the table only moves a row relative to it.
- **chainMult** — `1 + 0.03 × min(chains − 1, 10)`, capped at 1.30×.
- **growthMult** — asymmetric: gains `1 + clamp(g, 0, 120)/100 × 0.55`,
  losses `1 + clamp(g, −60, 0)/100 × 1.00`. Falling TVL is punished about
  twice as hard as rising TVL is rewarded.
- **maturityMult** — `0.55 + 0.45 × sqrt(min(age, 1460)/1460)`; age unknown
  uses 365 days.

Every row also carries an **80% range** (implied ÷/× 12.12, from the
full-model residual σ 0.85 dex — TVL alone explains only 16% of log
market-cap variance, and the board says so) and a **farm verdict**:
"worth it" only when implied ≥ $10M, 7-day TVL change ≥ −10%, and listed
≥ 90 days; anything else is "skip" with the binding reason named.
Farm cost is the capital ($50–$250 by TVL) plus gas ($4–$8 setup, $2/week
for the hold); the hold is 30–60 days by age.

Coverage trail, computed from the same snapshot: **758 tracked → 416
already have a token → 144 set aside → 198 ranked**. Set aside are the
pre-token records that are not clean launches (versioned pools, wrapped /
staked receipts, bridges, exchange venues, exchange-borrowed names) —
listed on the board with their reasons instead of being discounted into
the ranking.

No protocol name is special-cased; the same function scores all 198 rows.
"Records no token" is DefiLlama's record, not proof a token does not exist,
and nothing here predicts whether or when a token launches.

## The dashboard

Dark board, sortable table (rank, name, TVL, 7d, age, chains, implied value
with its 80% range, farm cost/hold/verdict), filters (search, category,
chain, min TVL, min implied value, verdict, momentum, age, watchlist-only),
an Export CSV button for the filtered rows, a pre-token / set-aside /
live-token tab, a calibration panel with the fitted power-law chart and
formula, the coverage trail, a detail view per protocol (model breakdown,
range, farm verdict, live-token comparison, farm plan), and the full model
+ methodology on the page. URL hash supported: `#detail=<slug>`,
`#chain=<name>`, `#category=<name>`, `#q=<text>`, `#min=<usd>`,
`#minImp=<usd>`, `#verdict=worth it|skip`, `#growth=rising|falling`,
`#age=new|established`, `#watch=1`, `#tab=live|set-aside`.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — radar-3 model, calibration fit, farm plans, snapshot parsing
- `vendor/makefun-board.ts` — make.fun dossier library, byte-for-byte from the kit
- `dashboard/` — `index.html`, `app.css`, `app.js` (static, no network)
- `screenshots/` — 1-board, 2-detail, 3-filtered (1440×900)

License: MIT (`LICENSE`).
