/**
 * Wick-&-Wait fork price driver — BTCB/USDT only.
 *
 * Drives the pool price out of an OPEN position's range over time on the local BSC
 * fork so you can watch the WickWaitRebalanceCondition (TWAP + cooldown) decide.
 * Two modes:
 *   - persistent : push out and HOLD past the TWAP window W → trigger SHOULD fire.
 *   - wick       : push out briefly, snap back within W      → trigger should NOT fire.
 *
 * Real swaps through the PancakeSwap V3 router (so the `observe()` TWAP actually
 * moves), impersonating a BSC whale via raw eth_sendTransaction, advancing block
 * time with evm_increaseTime. Per step logs: time, spot tick, TWAP tick over W,
 * spot/twap in-or-out of range, and would-fire (TWAP breach; cooldown is automation
 * state, noted not modelled).
 *
 * Usage:
 *   POSITION_ID=<tokenId> MODE=persistent npx hardhat run scripts/wick-wait-price-driver.ts --network localhost
 *
 * Env (POSITION_ID required): MODE persistent|wick · SIDE above|below · WINDOW secs
 *   · BUFFER_TICKS · HOLD_STEPS · WHALE · MAX_SWAP (human units per chunk)
 */
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
provider.pollingInterval = 50; // fork automines; don't wait ethers' default 4s per tx

const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

const env = (k: string, d?: string) => process.env[k] ?? d;
const POSITION_ID = env("POSITION_ID");
const MODE = env("MODE", "persistent") as "persistent" | "wick";
const SIDE = env("SIDE", "above") as "above" | "below";
const WINDOW = Number(env("WINDOW", "1800"));
const BUFFER_TICKS = Number(env("BUFFER_TICKS", "200"));
const HOLD_STEPS = Number(env("HOLD_STEPS", "8"));
const WHALE = env("WHALE", "0xF977814e90dA44bFA03b6295A0616a897441aceC")!;
const MAX_SWAP = env("MAX_SWAP", "2000")!;

const NPM_ABI = ["function positions(uint256) view returns (uint96,address,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128,uint256,uint256,uint128,uint128)"];
const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const POOL_ABI = [
  "function slot0() view returns (uint160,int24 tick,uint16,uint16 observationCardinality,uint16 observationCardinalityNext,uint32,bool)",
  "function tickSpacing() view returns (int24)",
  "function observe(uint32[]) view returns (int56[] tickCumulatives,uint160[])",
];
const ercI = new ethers.Interface([
  "function approve(address,uint256) returns(bool)",
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
]);
const routerI = new ethers.Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
]);
const poolI = new ethers.Interface(["function increaseObservationCardinalityNext(uint16)"]);

// TickMath.getSqrtRatioAtTick — exact integer port (same as shared/backend lp-math).
// Used to cap swaps via sqrtPriceLimitX96 so the price lands AT a target tick instead of
// blowing through a thin pool to the extremes (which makes every later swap/observe slow).
const MAX_TICK = 887272;
function sqrtAtTick(tick: number): bigint {
  const a = BigInt(tick < 0 ? -tick : tick);
  if (a > BigInt(MAX_TICK)) throw new Error("TickMath: T");
  let r = (a & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  if ((a & 0x2n) !== 0n) r = (r * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((a & 0x4n) !== 0n) r = (r * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((a & 0x8n) !== 0n) r = (r * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((a & 0x10n) !== 0n) r = (r * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((a & 0x20n) !== 0n) r = (r * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((a & 0x40n) !== 0n) r = (r * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((a & 0x80n) !== 0n) r = (r * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((a & 0x100n) !== 0n) r = (r * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((a & 0x200n) !== 0n) r = (r * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((a & 0x400n) !== 0n) r = (r * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((a & 0x800n) !== 0n) r = (r * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((a & 0x1000n) !== 0n) r = (r * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((a & 0x2000n) !== 0n) r = (r * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((a & 0x4000n) !== 0n) r = (r * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((a & 0x8000n) !== 0n) r = (r * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((a & 0x10000n) !== 0n) r = (r * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((a & 0x20000n) !== 0n) r = (r * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((a & 0x40000n) !== 0n) r = (r * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((a & 0x80000n) !== 0n) r = (r * 0x48a170391f7dc42444e8fa2n) >> 128n;
  if (tick > 0) r = (2n ** 256n - 1n) / r;
  return (r >> 32n) + (r % (2n ** 32n) === 0n ? 0n : 1n);
}

async function txAs(to: string, data: string) {
  const hash = await provider.send("eth_sendTransaction", [{ from: WHALE, to, data, gas: "0x989680" }]);
  const rc = await provider.waitForTransaction(hash);
  if (!rc || rc.status === 0) throw new Error("tx reverted: " + hash);
  return rc;
}
async function call(to: string, iface: ethers.Interface, fn: string, args: unknown[]) {
  const res = await provider.call({ to, data: iface.encodeFunctionData(fn, args) });
  return iface.decodeFunctionResult(fn, res);
}
async function mine(seconds: number) {
  if (seconds > 0) await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}
const now = async () => (await provider.getBlock("latest"))!.timestamp;

async function main() {
  if (!POSITION_ID) throw new Error("POSITION_ID env var is required (your open LP position token-id).");
  await provider.send("hardhat_impersonateAccount", [WHALE]);
  await provider.send("hardhat_setBalance", [WHALE, "0x3635c9adc5dea00000"]);

  const npm = new ethers.Contract(POSITION_MANAGER, NPM_ABI, provider);
  const pos = await npm.positions(POSITION_ID);
  const token0: string = pos.token0, token1: string = pos.token1;
  const fee = Number(pos.fee), tickLower = Number(pos.tickLower), tickUpper = Number(pos.tickUpper);
  const set = new Set([token0.toLowerCase(), token1.toLowerCase()]);
  if (!set.has(BTCB.toLowerCase()) || !set.has(USDT.toLowerCase()))
    throw new Error(`Position ${POSITION_ID} is not a BTCB/USDT pool.`);

  const poolAddr: string = await new ethers.Contract(FACTORY, FACTORY_ABI, provider).getPool(token0, token1, fee);
  const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
  const spacing = Number(await pool.tickSpacing());
  console.log(`\nPosition #${POSITION_ID}  pool ${poolAddr} (fee ${fee}, spacing ${spacing})`);
  console.log(`Range [${tickLower}, ${tickUpper}]  mode=${MODE} side=${SIDE} W=${WINDOW}s\n`);

  await ensureTwapReady(poolAddr, fee, token0, token1);

  const pushUp = SIDE === "above";
  const tokenIn = pushUp ? token1 : token0;
  const tokenOut = pushUp ? token0 : token1;
  const decIn = Number((await call(tokenIn, ercI, "decimals", []))[0]);
  const maxChunk = ethers.parseUnits(MAX_SWAP, decIn);
  await txAs(tokenIn, ercI.encodeFunctionData("approve", [ROUTER, ethers.MaxUint256]));
  const target = pushUp ? tickUpper + BUFFER_TICKS : tickLower - BUFFER_TICKS;

  const swap = async (inTok: string, outTok: string, amountIn: bigint, limit: bigint = 0n) => {
    try {
      await txAs(ROUTER, routerI.encodeFunctionData("exactInputSingle", [{
        tokenIn: inTok, tokenOut: outTok, fee, recipient: WHALE,
        deadline: (await now()) + 600, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: limit,
      }]));
    } catch { /* limit reached / no-op swap → ignore, still advance a block */ }
    await mine(1);
  };
  // sqrtPriceLimit so the price stops AT a tick instead of overshooting the thin pool.
  const limitAt = (t: number) => sqrtAtTick(Math.max(-MAX_TICK + 1, Math.min(MAX_TICK - 1, t)));
  const targetLimit = limitAt(target);
  const balOf = async (t: string) => (await call(t, ercI, "balanceOf", [WHALE]))[0] as bigint;
  const curTick = async () => Number((await pool.slot0())[1]);
  const twapTick = async () => {
    const [cum] = await pool.observe([WINDOW, 0]);
    const delta = cum[1] - cum[0], w = BigInt(WINDOW);
    let t = delta / w;
    if (delta < 0n && delta % w !== 0n) t -= 1n;
    return Number(t);
  };
  const log = async (label: string) => {
    const t = await curTick(), tw = await twapTick();
    const inR = t >= tickLower && t < tickUpper, twR = tw >= tickLower && tw < tickUpper;
    console.log(`[${label.padEnd(9)}] ${new Date((await now()) * 1000).toISOString().slice(11, 19)}  spot=${String(t).padStart(8)}  twap=${String(tw).padStart(8)}  spot ${inR ? "IN " : "OUT"}  twap ${twR ? "IN " : "OUT"}  would-fire=${!twR ? "YES" : "no "}`);
  };

  await log("start");

  // Phase 1: push spot out to target.
  let g = 0;
  while ((pushUp ? await curTick() < target : await curTick() > target) && g++ < 40) {
    const bal = await balOf(tokenIn);
    const chunk = bal < maxChunk ? bal : maxChunk;
    if (chunk === 0n) { console.log("  ⚠ whale out of tokenIn"); break; }
    await swap(tokenIn, tokenOut, chunk, targetLimit);
    await log(`push ${g}`);
  }
  console.log((pushUp ? await curTick() >= target : await curTick() <= target) ? "  → spot OUT of range\n" : "  ⚠ target not fully reached; continuing\n");

  if (MODE === "wick") {
    console.log("WICK: snapping back into range…");
    await txAs(tokenOut, ercI.encodeFunctionData("approve", [ROUTER, ethers.MaxUint256]));
    const mid = Math.floor((tickLower + tickUpper) / 2);
    let g2 = 0;
    while ((pushUp ? await curTick() > mid : await curTick() < mid) && g2++ < 40) {
      const bal = await balOf(tokenOut);
      const chunk = bal < maxChunk ? bal : maxChunk;
      if (chunk === 0n) break;
      await swap(tokenOut, tokenIn, chunk, limitAt(mid));
    }
    await log("back-in");
    console.log("");
  }

  // Phase 3: HOLD over W with a keep-alive swap per step (writes observations).
  console.log(`HOLD: ${HOLD_STEPS + 2} steps × ~${Math.ceil(WINDOW / HOLD_STEPS)}s\n`);
  const step = Math.ceil(WINDOW / HOLD_STEPS) + 1;
  const tiny = ethers.parseUnits("1", decIn);
  // keep-alive direction: persistent re-pushes out; wick keeps it in (swap back toward in).
  const kaIn = MODE === "wick" ? tokenOut : tokenIn;
  const kaOut = MODE === "wick" ? tokenIn : tokenOut;
  // persistent: hold at target (stays OUT); wick: hold at mid (stays IN).
  const kaLimit = MODE === "wick" ? limitAt(Math.floor((tickLower + tickUpper) / 2)) : targetLimit;
  await txAs(kaIn, ercI.encodeFunctionData("approve", [ROUTER, ethers.MaxUint256]));
  for (let i = 1; i <= HOLD_STEPS + 2; i++) {
    await provider.send("evm_increaseTime", [step]);
    await swap(kaIn, kaOut, tiny, kaLimit);
    await log(`hold ${i}`);
  }

  console.log(`\nExpectation (${MODE}): ${MODE === "persistent"
    ? "TWAP crosses OUT ⇒ would-fire → YES (then cooldown gates the real rebalance)."
    : "brief excursion barely moves the W-mean ⇒ TWAP stays IN ⇒ would-fire stays no."}`);
  console.log("would-fire = TWAP-breach only; the live condition also needs the cooldown elapsed.");
}

async function ensureTwapReady(poolAddr: string, fee: number, t0: string, t1: string) {
  const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
  try { await pool.observe([WINDOW, 0]); return; }
  catch { console.log(`  warming up oracle for a ${WINDOW}s TWAP…`); }
  const t = () => Date.now();
  let m = t();
  const lap = (s: string) => { console.log(`    ${s} (${((t() - m) / 1000).toFixed(1)}s)`); m = t(); };
  const s0 = await pool.slot0();
  const tgt = Math.min(Number(s0[4]) + 4, 65535);
  await txAs(poolAddr, poolI.encodeFunctionData("increaseObservationCardinalityNext", [tgt])); lap("cardinality++");
  await txAs(t0, ercI.encodeFunctionData("approve", [ROUTER, ethers.MaxUint256])); lap("approve t0");
  const d0 = Number((await call(t0, ercI, "decimals", []))[0]);
  const tinySwap = async () => {
    try {
      await txAs(ROUTER, routerI.encodeFunctionData("exactInputSingle", [{
        tokenIn: t0, tokenOut: t1, fee, recipient: WHALE,
        deadline: (await now()) + 600, amountIn: ethers.parseUnits("0.01", d0), amountOutMinimum: 0n, sqrtPriceLimitX96: 0n,
      }]));
    } catch (e) { console.log("    warm swap reverted (ignored)"); }
  };
  // two observations spanning > W: swap now, jump past W, swap again.
  await tinySwap(); lap("warm swap 1 (cold slots)");
  await mine(WINDOW + 120); lap("jump > W");
  await tinySwap(); lap("warm swap 2");
  await mine(5); await tinySwap(); lap("warm swap 3");
  try { await pool.observe([WINDOW, 0]); console.log("    oracle ready ✓"); }
  catch (e: any) { console.log("    ⚠ observe still reverts: " + (e.shortMessage || e.message)); }
}

main().catch((e) => { console.error("ERR", e.message || e); process.exitCode = 1; });
