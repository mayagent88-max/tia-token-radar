// Token Radar — model radar-3. One sealed snapshot in, one ranked board out.
//
// The board ranks the protocols that are clean launches: they record no
// token AND they are not a versioned pool, a wrapped or staked product of a
// token that already trades, a bridge, an exchange venue, or a name borrowed
// from an exchange (198 in this snapshot). The rest of the pre-token records
// are set aside with their reason, not silently dropped and not discounted
// into the ranking. Live-token protocols are kept apart: the board shows the
// market's own market cap for them, never a model number — and they are the
// calibration set for the value model.
//
// Implied value is a POWER LAW calibrated from the tokens already in the
// snapshot, not a flat multiple of TVL. A log-log regression of market cap
// on TVL over the live-token protocols that report a market cap of at least
// $100k (excluding exchange venues) gives
//
//   mcap = k x TVL^b,   b ~ 0.46, k ~ 3416
//
// so a protocol ten times the TVL is worth about 10^0.46 = 2.9x as much, not
// ten times as much. That is why the old linear board's top was several
// times too big: a straight TVL multiple reprints the TVL table. The
// regression is fitted at run time from the snapshot itself, so the numbers
// on the dashboard are the snapshot's own, recomputed on every run.
//
//   implied = round( k x TVL^b x categoryAdj x chainMult x growthMult
//                     x maturityMult )
//
// categoryAdj — the v1 category table, centred on 0.21, the flat value the
//   old board kept per TVL dollar. A vault, curator or lending book keeps
//   more than the average (up to 1.52x); a bridge or receipt keeps less
//   (down to 0.57x). The power law sets the scale; the table only moves a
//   row relative to it.
// chainMult    — 1 + 0.03 x min(chains - 1, 10): each extra chain up to ten
//   adds 3%, capped at 1.30.
// growthMult   — asymmetric. Gains: 1 + clamp(g, 0, 120)/100 x 0.55. Losses:
//   1 + clamp(g, -60, 0)/100 x 1.00. A falling TVL is punished about twice
//   as hard as a rising one is rewarded: hot money leaves faster than it
//   arrives.
// maturityMult — 0.55 + 0.45 x sqrt(min(age, 1460) / 1460). A protocol that
//   has run years with no token has survived without one, so its launch, if
//   it ever comes, is worth closer to full value; a brand-new one is
//   discounted. Age unknown uses 365 days.
//
// Every row also carries a RANGE, not a single number: the 80% prediction
// interval of the calibration. The full model's log10 residuals on the
// calibration set have standard deviation sigma (~0.85 dex); the band is
// implied / 10^(1.2816 x sigma) to implied x 10^(1.2816 x sigma), about
// 12x either way. TVL alone explains only ~16% of log market-cap variance
// (R^2 ~ 0.16): the market's spread is wide, and the board says so instead
// of pretending the point estimate is a price.
//
// Every row also carries a FARM VERDICT, from the row's own figures:
// "worth it" only when the implied value is at least $10M, the 7-day TVL
// change is no worse than -10%, and the protocol has been listed at least
// 90 days (unknown age counts as 365 days, so it passes). Anything else is
// "skip", with the binding reason named. The farm cost is the capital the
// plan needs plus the gas to run it: setup gas ($4, or $8 for a $150+
// position) plus $2 a week for the hold. The hold is 30 days (60 for a
// protocol under 180 days old, 45 under a year).
//
// "Records no token" is DefiLlama's record, not proof: a protocol on this
// board may still have a token its record does not carry. Nothing here
// predicts whether or when a token launches; implied value is this entry's
// own claim.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Value kept per TVL dollar, by DefiLlama category; DEFAULT_MULTIPLE otherwise. */
  category_multiples: Record<string, number>;
  default_multiple: number;
  /** The flat value the old board kept per TVL dollar; category adjustments are centred on it. */
  flat_reference: number;
  chain_step: number;
  chain_cap: number;
  growth_up_weight: number;
  growth_down_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** The calibration set: live-token protocols with a market cap at or above this. */
  calibration_min_mcap_usd: number;
  /** Farm verdict gates. */
  verdict_min_implied_usd: number;
  verdict_min_growth_pct: number;
  verdict_min_age_days: number;
  /** Farm gas, in whole US dollars. */
  gas_setup_small_usd: number;
  gas_setup_large_usd: number;
  gas_setup_large_capital_usd: number;
  gas_weekly_usd: number;
}

export const MODEL: ModelConstants = {
  category_multiples: {
    'Risk Curators': 0.32,
    'Onchain Capital Allocator': 0.3,
    'Lending': 0.28,
    'Dexs': 0.26,
    'Yield Aggregator': 0.26,
    'Liquidity Manager': 0.24,
    'CDP': 0.24,
    'CDP Manager': 0.24,
    'Derivatives': 0.24,
    'Collateral Markets': 0.24,
    'Uncollateralized Lending': 0.24,
    'Prediction Market': 0.24,
    'Basis Trading': 0.22,
    'RWA': 0.22,
    'Yield': 0.22,
    'Leveraged Farming': 0.22,
    'Interest Rate Derivatives': 0.22,
    'Indexes': 0.22,
    'Farm': 0.2,
    'Insurance': 0.2,
    'Payments': 0.2,
    'Chain': 0.2,
    'Privacy': 0.2,
    'Options Vault': 0.2,
    'Staking Pool': 0.18,
    'Restaking': 0.18,
    'CeDeFi': 0.18,
    'OTC Marketplace': 0.18,
    'Governance Incentives': 0.18,
    'Liquid Staking': 0.17,
    'Liquid Restaking': 0.16,
    'Restaked BTC': 0.16,
    'Anchor BTC': 0.16,
    'Decentralized BTC': 0.16,
    'Dual-Token Stablecoin': 0.16,
    'Crypto Card Issuer': 0.16,
    'Bridge': 0.15,
    'Cross Chain Bridge': 0.15,
    'Canonical Bridge': 0.14,
    'Stablecoin Wrapper': 0.14,
    'CEX': 0.12,
  },
  default_multiple: 0.2,
  flat_reference: 0.21,
  chain_step: 0.03,
  chain_cap: 10,
  growth_up_weight: 0.55,
  growth_down_weight: 1.0,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  calibration_min_mcap_usd: 100_000,
  verdict_min_implied_usd: 10_000_000,
  verdict_min_growth_pct: -10,
  verdict_min_age_days: 90,
  gas_setup_small_usd: 4,
  gas_setup_large_usd: 8,
  gas_setup_large_capital_usd: 150,
  gas_weekly_usd: 2,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** Fallback calibration, fitted on the 2026-11-14 snapshot, used only when
 * the snapshot at hand cannot be fitted (fewer than 20 calibration points
 * or a non-finite fit). The live fit is always preferred. */
export const CALIBRATION_FALLBACK = {
  slope: 0.4619,
  intercept: 3.5335,
  k: 3415.8,
  sigma_full: 0.8455,
  band_factor: 12.12,
  r2: 0.163,
  residual_mean: 0.0753,
  n: 115,
};

/** How many live-token protocols the dashboard's Live view and comparables carry, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The power-law calibration fitted from the snapshot's own live tokens. */
export interface Calibration {
  /** Slope of log10(mcap) on log10(tvl): the power-law exponent. */
  slope: number;
  /** Intercept of the same fit: log10(k). */
  intercept: number;
  /** The scale: mcap = k x TVL^slope. */
  k: number;
  /** R^2 of the log-log fit: how much of log market cap TVL explains. */
  r2: number;
  /** Standard deviation of the full model's log10 residuals on the calibration set. */
  sigma_full: number;
  /** Mean of the full model's log10 residuals: live tokens sit this far above the adjusted prediction, in dex. */
  residual_mean: number;
  /** The 80% prediction-interval factor: low = implied / band_factor, high = implied x band_factor. */
  band_factor: number;
  /** Calibration points fitted. */
  n: number;
  /** Whether the live fit was used (true) or the fallback (false). */
  fitted: boolean;
  /** The calibration scatter, as [log10 TVL, log10 mcap] pairs rounded to 3 decimals, for the dashboard chart. */
  points: [number, number][];
  /** Mean log10 TVL of the calibration set, for the chart's axis. */
  mean_log_tvl: number;
  /** Mean log10 mcap of the calibration set. */
  mean_log_mcap: number;
}

/** One step of the coverage trail: tracked -> has token -> set aside -> ranked. */
export interface Trail {
  tracked: number;
  has_token: number;
  set_aside: number;
  ranked: number;
  set_aside_reasons: { reason: string; count: number }[];
}

/** A pre-token protocol set aside from the ranking, with its reason. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  reason: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  farm_cost_usd: number;
  farm_hold_days: number;
  farm_verdict: 'worth it' | 'skip';
  farm_verdict_reason: string;
  model: {
    category_adjustment: number;
    power_law_base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    chain_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  farm_cost_usd: number;
  farm_hold_days: number;
  farm_verdict: 'worth it' | 'skip';
  farm_verdict_reason: string;
  category_adjustment: number;
  power_law_base_usd: number;
  growth_multiplier: number;
  chain_multiplier: number;
  maturity_multiplier: number;
  /** True when the protocol is one of the snapshot's watchlist slugs. */
  watch: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  trail: Trail;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  worth_it_count: number;
  rows: RadarRow[];
  set_aside: SetAsideRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The value kept per TVL dollar for a category: the table, else the default. */
export function categoryMultiple(category: string | null, model: ModelConstants): number {
  if (category !== null && Object.hasOwn(model.category_multiples, category)) {
    return model.category_multiples[category]!;
  }
  return model.default_multiple;
}

/** The category adjustment: the table's multiple centred on the flat 0.21 reference. */
export function categoryAdjustment(category: string | null, model: ModelConstants): number {
  return categoryMultiple(category, model) / model.flat_reference;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name: a receipt of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name: the house watchlist rule's own list. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that pass value through instead of launching: the house watchlist rule's own list. */
const SET_ASIDE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * Why a pre-token record is set aside from the ranking, or null when it is
 * a clean launch. The order is fixed so one record gets one reason: the
 * version marker first, then wrapped/staked, then the exchange name, then
 * the pass-through category. Derived only from the snapshot's category and
 * name pattern — the same signals the house watchlist rule uses — never
 * from a hardcoded name.
 */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (VERSIONED.test(p.name)) return 'versioned pool — the name ends in a release marker, so this is a pool of another protocol';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped / staked product — a receipt of a token that already trades';
  if (EXCHANGE_PREFIX.test(p.name)) return 'named after an exchange — the record borrows an exchange venue\u2019s name';
  if (p.category !== null && SET_ASIDE_CATEGORIES.has(p.category)) return `category ${p.category} — passes value through instead of launching its own token`;
  return null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The power-law calibration, fitted at run time from the snapshot's own
 * live tokens: non-exchange protocols with a market cap at or above the
 * model's minimum and a positive TVL. Returns the fit plus the full model's
 * residual spread, which sets the range band. Falls back to the constants
 * fitted on the 2026-11-14 snapshot when the snapshot cannot be fitted.
 */
export function fitCalibration(snapshot: Snapshot, model: ModelConstants): Calibration {
  const pts = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd >= model.calibration_min_mcap_usd && p.tvl_usd > 0,
  );
  const fallback = (fitted: boolean): Calibration => ({
    slope: CALIBRATION_FALLBACK.slope,
    intercept: CALIBRATION_FALLBACK.intercept,
    k: CALIBRATION_FALLBACK.k,
    r2: CALIBRATION_FALLBACK.r2,
    sigma_full: CALIBRATION_FALLBACK.sigma_full,
    residual_mean: CALIBRATION_FALLBACK.residual_mean,
    band_factor: CALIBRATION_FALLBACK.band_factor,
    n: fitted ? pts.length : CALIBRATION_FALLBACK.n,
    fitted,
    points: pts.map((p) => [round3(Math.log10(p.tvl_usd)), round3(Math.log10(p.mcap_usd!))] as [number, number]),
    mean_log_tvl: pts.length ? round3(pts.reduce((s, p) => s + Math.log10(p.tvl_usd), 0) / pts.length) : 0,
    mean_log_mcap: pts.length ? round3(pts.reduce((s, p) => s + Math.log10(p.mcap_usd!), 0) / pts.length) : 0,
  });
  if (pts.length < 20) return fallback(false);
  const xs = pts.map((p) => Math.log10(p.tvl_usd));
  const ys = pts.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    syy += (ys[i]! - my) * (ys[i]! - my);
  }
  if (!(sxx > 0) || !(syy > 0)) return fallback(false);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept) || slope <= 0.05 || slope >= 1.5) return fallback(false);
  const k = Math.pow(10, intercept);
  const r2 = (sxy * sxy) / (sxx * syy);
  // The full model's residuals on the same set: the power law moved by the
  // row's own adjustments. Their spread is the range band.
  const residuals = pts.map((p) => {
    const v = fullPrediction(p, snapshot.as_of, model, k, slope);
    return Math.log10(p.mcap_usd! / v);
  });
  const rMean = residuals.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (const r of residuals) ss += (r - rMean) * (r - rMean);
  const sigmaFull = Math.sqrt(ss / (n - 1));
  if (!Number.isFinite(sigmaFull) || sigmaFull <= 0) return fallback(false);
  return {
    slope: round4(slope),
    intercept: round4(intercept),
    k: Math.round(k * 10) / 10,
    r2: round4(r2),
    sigma_full: round4(sigmaFull),
    residual_mean: round4(rMean),
    band_factor: round4(Math.pow(10, 1.2816 * sigmaFull)),
    n,
    fitted: true,
    points: pts.map((p) => [round3(Math.log10(p.tvl_usd)), round3(Math.log10(p.mcap_usd!))] as [number, number]),
    mean_log_tvl: round3(mx),
    mean_log_mcap: round3(my),
  };
}

/** The power law with the row's own adjustments, before rounding. */
function fullPrediction(p: SnapshotProtocol, asOf: string, model: ModelConstants, k: number, slope: number): number {
  const catAdj = categoryAdjustment(p.category, model);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = growthPct >= 0 ? 1 + (growthPct / 100) * model.growth_up_weight : 1 + (growthPct / 100) * model.growth_down_weight;
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), model.chain_cap);
  const chainMult = 1 + extraChains * model.chain_step;
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    model.maturity_range * Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  return k * Math.pow(p.tvl_usd, slope) * catAdj * chainMult * growthMult * maturityMult;
}

/** The five factors and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): {
  implied: number;
  low: number;
  high: number;
  base: number;
  catAdj: number;
  growthPct: number;
  growthMult: number;
  chainMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const catAdj = categoryAdjustment(protocol.category, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult =
    growthPct >= 0
      ? 1 + (growthPct / 100) * model.growth_up_weight
      : 1 + (growthPct / 100) * model.growth_down_weight;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const chainMult = 1 + extraChains * model.chain_step;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    model.maturity_range * Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const base = calibration.k * Math.pow(protocol.tvl_usd, calibration.slope);
  const implied = Math.max(1, Math.round(base * catAdj * chainMult * growthMult * maturityMult));
  const low = Math.max(1, Math.round(implied / calibration.band_factor));
  const high = Math.max(implied + 1, Math.round(implied * calibration.band_factor));
  return { implied, low, high, base: Math.round(base), catAdj, growthPct, growthMult, chainMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; setAside: SetAsideRow[]; trail: Trail } {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  const setAside: SetAsideRow[] = [];
  const reasons = new Map<string, number>();
  // The watchlist is the floor: every slug it names is in, first.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol that records no token AND is a
  // clean launch. Anything else is set aside with its reason.
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug) || !isPreToken(p)) continue;
    const reason = setAsideReason(p);
    if (reason === null) {
      chosen.set(p.slug, p);
    } else {
      setAside.push({
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        reason,
      });
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  // A watchlist slug is clean by the house rule, so it never lands in the
  // set-aside list; if one ever did, the board would still carry it and the
  // gate below would catch a missing slug.
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, ...v };
  });
  // Total order: implied value desc, slug asc breaks every tie, so two runs
  // of the same snapshot write the same board byte for byte.
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => {
    const farm = farmPlan(s.p, s.age);
    const verdict = farmVerdict(s.implied, s.growthPct, s.age, model);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: s.implied,
      implied_low_usd: s.low,
      implied_high_usd: s.high,
      farm_cost_usd: farm.costUsd,
      farm_hold_days: farm.holdDays,
      farm_verdict: verdict.verdict,
      farm_verdict_reason: verdict.reason,
      model: {
        category_adjustment: round4(s.catAdj),
        power_law_base_usd: s.base,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        chain_multiplier: round4(s.chainMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
  const trail: Trail = {
    tracked: snapshot.protocols.length,
    has_token: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    set_aside: setAside.length,
    ranked: board.length,
    set_aside_reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1)),
  };
  return { board, setAside, trail };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A row's farm cost and hold, in whole dollars and days. */
export function farmPlan(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): { costUsd: number; holdDays: number; capitalUsd: number } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const setup = capital >= model.gas_setup_large_capital_usd ? model.gas_setup_large_usd : model.gas_setup_small_usd;
  const weeks = Math.ceil(hold / 7);
  return { costUsd: capital + setup + model.gas_weekly_usd * weeks, holdDays: hold, capitalUsd: capital };
}

/** A row's farm verdict, from its own figures. */
export function farmVerdict(
  implied: number,
  growthPct: number,
  age: number | null,
  model: ModelConstants = MODEL,
): { verdict: 'worth it' | 'skip'; reason: string } {
  if (implied < model.verdict_min_implied_usd) {
    return { verdict: 'skip', reason: `implied value under $${Math.round(model.verdict_min_implied_usd / 1e6)}M` };
  }
  if (growthPct < model.verdict_min_growth_pct) {
    return { verdict: 'skip', reason: `TVL falling ${growthPct.toFixed(1)}% over 7 days` };
  }
  const ageForVerdict = age ?? model.unknown_age_days;
  if (ageForVerdict < model.verdict_min_age_days) {
    return { verdict: 'skip', reason: `listed under ${model.verdict_min_age_days} days ago` };
  }
  return { verdict: 'worth it', reason: 'implied value, momentum and age all clear the bar' };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c === 'cex') return `Trade $${capital} of spot volume on ${name} and keep a balance on the venue for the qualifying window.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis position on ${chain} and keep it open.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name} and use one of its native apps for a week.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $${capital} through ${name} on ${chain} and keep the account active.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s private pool on ${chain} and keep the note.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c === 'cex') return 'Place one small spot trade each week and keep a balance on the venue.';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Make one qualifying action each week, such as a borrow, a repay or a fresh supply.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return 'Make one qualifying action each week, such as a swap, a fresh deposit or a fee claim.';
  if (c.includes('bridge')) return 'Bridge a small amount each week, in both directions when the route allows it.';
  if (c.includes('staking') || c.includes('restak')) return 'Restake the rewards each week so the position keeps growing.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Open and close one small hedged position each week.';
  if (c.includes('prediction')) return 'Place one small market position each week.';
  if (c.includes('curator') || c.includes('allocator')) return 'Check the vault allocation each week and top it up once if the strategy changes.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Exchange records farm on the venue itself; every other record farms on-chain.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const venue = p.category === 'CEX';
  return [
    {
      text: venue
        ? `Use the account you already hold on ${p.name}, or open one with an email you control, and turn on two-factor authentication.`
        : `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: venue ? 'no fee to open the account' : 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: venue
        ? `Before you withdraw, open ${p.name}'s own rewards page from its official app and claim only from the link it publishes.`
        : `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: venue
        ? `Write the account, the dates and every trade in a farm log so you can repeat the position or unwind it.`
        : `Write the wallet, the dates and every transaction in a farm log, and revoke the approval after you unwind the position.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view and comparables. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watch: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    farm_cost_usd: row.farm_cost_usd,
    farm_hold_days: row.farm_hold_days,
    farm_verdict: row.farm_verdict,
    farm_verdict_reason: row.farm_verdict_reason,
    category_adjustment: row.model.category_adjustment,
    power_law_base_usd: row.model.power_law_base_usd,
    growth_multiplier: row.model.growth_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    watch,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = fitCalibration(snapshot, model);
  const { board, setAside, trail } = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    trail,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_total: liveTotal,
    worth_it_count: board.filter((r) => r.farm_verdict === 'worth it').length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    set_aside: setAside,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, farm steps, ranges and verdicts. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.implied_low_usd > 0 && r.implied_low_usd < r.implied_value_usd && r.implied_value_usd < r.implied_high_usd)) {
      return `${r.slug} has a range that does not bracket its implied value`;
    }
    if (r.farm_verdict !== 'worth it' && r.farm_verdict !== 'skip') return `${r.slug} has verdict ${r.farm_verdict}`;
    if (!Number.isSafeInteger(r.farm_cost_usd) || r.farm_cost_usd <= 0) return `${r.slug} has farm cost ${r.farm_cost_usd}`;
    if (!Number.isSafeInteger(r.farm_hold_days) || r.farm_hold_days <= 0) return `${r.slug} has farm hold ${r.farm_hold_days}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
