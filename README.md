# Token Radar — make.fun token-radar-01

A web dashboard that ranks every protocol recording no token by what its
launch would be worth, each with a concrete farm plan. Built from the sealed
DefiLlama snapshot in the kit (`input/snapshot.json`, as of 2026-11-14).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, scores all
342 pre-token protocols with the radar-2 model in `lib/model.ts`, writes
`board.json` + `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored `vendor/makefun-board.ts`. Two runs on the
same snapshot write byte-identical output. Open `out/dashboard/index.html`
in a browser — the page is static and needs no network.

## The model (radar-2)

`implied = round(tvl × categoryMultiple × chainMult × growthMult × maturityMult × scaleMult × recordMult)`

- **categoryMultiple** — value kept per TVL dollar, by category (0.12×–0.32×,
  table in `lib/model.ts` and on the dashboard): vaults, curators and lending
  books keep more; bridges, staking receipts and exchange venues keep less.
- **chainMult** — `1 + 0.03 × min(chains − 1, 10)`, capped at 1.30×.
- **growthMult** — asymmetric: gains `1 + clamp(g, 0, 120)/100 × 0.55`,
  losses `1 + clamp(g, −60, 0)/100 × 1.00`. Falling TVL is punished about
  twice as hard as rising TVL is rewarded.
- **maturityMult** — `0.55 + 0.45 × sqrt(min(age, 1460)/1460)`; age unknown
  uses 365 days.
- **scaleMult** — `(tvl / $100M)^−0.08`, clamped to [0.70, 1.20]: small books
  lifted, very large ones trimmed, so the board is not a TVL table.

No protocol name is special-cased; the same function scores all 342 rows.
"Records no token" is DefiLlama's record, not proof a token does not exist,
and nothing here predicts whether or when a token launches.

## The dashboard

Dark board, sortable table (rank, name, TVL, 7d, age, chains, implied value),
filters (search, category, chain, min TVL, watchlist-only), a pre-token /
live-token tab, a detail view per protocol (model breakdown, live-token
comparison, farm plan), and the full model + methodology on the page.
URL hash supported: `#detail=<slug>`, `#chain=<name>`, `#category=<name>`,
`#q=<text>`, `#min=<usd>`, `#watch=1`, `#tab=live`.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — radar-2 model, farm plans, snapshot parsing
- `vendor/makefun-board.ts` — make.fun dossier library, byte-for-byte from the kit
- `dashboard/` — `index.html`, `app.css`, `app.js` (static, no network)
- `screenshots/` — 1-board, 2-detail, 3-filtered (1440×900)

License: MIT (`LICENSE`).
