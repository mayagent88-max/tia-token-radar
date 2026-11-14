// Token Radar — model radar-2. One sealed snapshot in, one ranked board out.
//
// The board ranks EVERY protocol that records no token (342 in this snapshot:
// the 40 watchlist rows plus every other pre-token protocol), strongest implied
// value first. Live-token protocols are kept apart: the board shows the market's
// own market cap for them, never a model number.
//
// Implied value uses only the snapshot's own figures — TVL, 7-day change, age
// since first listing, category, chain count — never a protocol name. No name
// is special-cased anywhere in this file; the same function scores all 342.
//
//   implied = round( tvl x catMultiple x chainMult x growthMult
//                     x maturityMult x scaleMult x recordMult )
//
// catMultiple  — value kept per TVL dollar, by category (table below). A vault,
//   curator or lending book earns fees on money that stays; a bridge, a staking
//   receipt or an exchange venue mostly passes value through, so it keeps less.
// chainMult    — 1 + 0.03 x min(chains - 1, 10): each extra chain up to ten adds
//   3%, capped at 1.30. Reach across chains is worth something, but the eleventh
//   chain adds nothing new.
// growthMult   — asymmetric. Gains: 1 + clamp(g, 0, 120)/100 x 0.55. Losses:
//   1 + clamp(g, -60, 0)/100 x 1.00. A falling TVL is punished about twice as
//   hard as a rising one is rewarded: hot money leaves faster than it arrives.
// maturityMult — 0.55 + 0.45 x sqrt(min(age, 1460) / 1460). A protocol that has
//   run years with no token has survived without one, so its launch, if it ever
//   comes, is worth closer to full value; a brand-new one is discounted. Age
//   unknown uses 365 days.
// recordMult    — how clean a launch this record is, from the same signals
//   the house watchlist rule uses (never a name): an exchange venue's token
//   (0.10), a versioned pool (0.50), a wrapped/staked product of a token that
//   already trades (0.25), a bridge moving other chains' value (0.35), a name
//   beginning with an exchange's name (0.25). The factors multiply. Without
//   it, the board's top would be exchanges and wrapped BTC — venues and
//   receipts, not launches — so the discount is what makes the ranking a
//   launch radar instead of a TVL table with a different hat on.
//   are dampened, small ones lifted: the radar exists to find the early ones,
//   and a straight TVL multiple would just reprint the TVL table.
//
// "Records no token" is DefiLlama's record, not proof: a protocol on this board
// may still have a token its record does not carry. Nothing here predicts
// whether or when a token launches; implied value is this entry's own claim.

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
  scale_reference_usd: number;
  scale_exponent: number;
  scale_min: number;
  scale_max: number;
  /** Record-cleanliness factors: exchange venue, versioned pool, wrapped or
   * staked product, bridge, exchange-prefixed name. Each multiplies in. */
  record_cex: number;
  record_versioned: number;
  record_wrapped: number;
  record_bridge: number;
  record_exchange_prefix: number;
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
  scale_reference_usd: 100_000_000,
  scale_exponent: -0.08,
  scale_min: 0.7,
  scale_max: 1.2,
  record_cex: 0.1,
  record_versioned: 0.5,
  record_wrapped: 0.25,
  record_bridge: 0.35,
  record_exchange_prefix: 0.25,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live view and comparables carry, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    chain_multiplier: number;
    maturity_multiplier: number;
    scale_multiplier: number;
    record_multiplier: number;
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
  category_multiple: number;
  growth_multiplier: number;
  chain_multiplier: number;
  maturity_multiplier: number;
  scale_multiplier: number;
  record_multiplier: number;
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
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  rows: RadarRow[];
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

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name: a receipt of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name: the house watchlist rule's own list. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Bridge categories: the record moves other chains' value, it is not itself the launch. */
const BRIDGE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge']);

/**
 * How clean a launch this record is: the product of every record signal that
 * applies. Derived only from the snapshot's category and name pattern — the
 * same signals the house watchlist rule uses — never from a hardcoded name.
 */
export function recordMultiplier(p: SnapshotProtocol, model: ModelConstants): number {
  let m = 1;
  if (p.category === 'CEX') m *= model.record_cex;
  if (VERSIONED.test(p.name)) m *= model.record_versioned;
  if (WRAPPED_WORD.test(p.name)) m *= model.record_wrapped;
  if (p.category !== null && BRIDGE_CATEGORIES.has(p.category)) m *= model.record_bridge;
  if (EXCHANGE_PREFIX.test(p.name)) m *= model.record_exchange_prefix;
  return m;
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): {
  implied: number;
  catMult: number;
  growthPct: number;
  growthMult: number;
  chainMult: number;
  maturityMult: number;
  scaleMult: number;
  recordMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiple(protocol.category, model);
  const recordMult = recordMultiplier(protocol, model);
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
  const scaleRaw = Math.pow(protocol.tvl_usd / model.scale_reference_usd, model.scale_exponent);
  const scaleMult = Math.min(model.scale_max, Math.max(model.scale_min, scaleRaw));
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * catMult * chainMult * growthMult * maturityMult * scaleMult * recordMult),
  );
  return { implied, catMult, growthPct, growthMult, chainMult, maturityMult, scaleMult, recordMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is in, first.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol that records no token, whatever its
  // size, category or version marker. A CEX record or a versioned pool is still
  // a protocol with no token on record; its farm plan says so plainly.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isPreToken(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  // Total order: implied value desc, slug asc breaks every tie, so two runs
  // of the same snapshot write the same board byte for byte.
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.catMult,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      chain_multiplier: round4(s.chainMult),
      maturity_multiplier: round4(s.maturityMult),
      scale_multiplier: round4(s.scaleMult),
      record_multiplier: round4(s.recordMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
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
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    scale_multiplier: row.model.scale_multiplier,
    record_multiplier: row.model.record_multiplier,
    watch,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_total: liveTotal,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
