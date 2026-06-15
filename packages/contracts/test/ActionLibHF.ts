import { expect } from "chai";
import { network } from "hardhat";
import { MaxUint256 } from "ethers";

const { ethers } = await network.connect();

// ── MANDATORY hard-fixture unit tests for the ActionLib HF/oracle engine ─────
// Pure, deterministic numeric fixtures — a 10ⁿ scaling error is caught here,
// not by fork tests that happen to use 18-decimal tokens.
//
// Worked example used throughout:
//   collateral C = $1000, debt D = $500, liquidationThreshold LT = 8000 (80%)
//   ⇒ HF = C·LT/BPS / D = 1000·0.8/500 = 1.6
//   target HF 2.0  ⇒ target debt $400 (repay $100) ; target collateral $1250
//                    (supply $250).
const e18 = (n: bigint) => n * 10n ** 18n;
const WAD = 10n ** 18n;

describe("ActionLib — HF/oracle engine (hard fixtures)", function () {
  async function harness() {
    return await ethers.deployContract("ActionLibHarness");
  }

  describe("18-decimal normalization", function () {
    it("scales an 8-decimal base/price value ×1e10", async function () {
      const h = await harness();
      // $1000 in Aave 8-dec = 1000e8 = 1e11 → 1000e18.
      expect(await h.normalizeBase(1000n * 10n ** 8n)).to.equal(e18(1000n));
      // $1 price (8-dec) → 1e18.
      expect(await h.normalizeBase(1n * 10n ** 8n)).to.equal(WAD);
    });
  });

  describe("base ↔ token conversion (non-18 decimals)", function () {
    it("converts base→token at 18 decimals", async function () {
      const h = await harness();
      // $250 base, price $1 (1e18), 18-dec → 250 tokens.
      expect(await h.baseToToken(e18(250n), WAD, 18)).to.equal(e18(250n));
    });

    it("converts base→token at 6 decimals", async function () {
      const h = await harness();
      // $100 base, price $1, 6-dec → 100 * 1e6.
      expect(await h.baseToToken(e18(100n), WAD, 6)).to.equal(100n * 10n ** 6n);
    });

    it("converts base→token for a high-priced 18-dec token (floors)", async function () {
      const h = await harness();
      // $100 base, price $600 (WBNB), 18-dec → 100e18*1e18/600e18, floored.
      const expected = (e18(100n) * WAD) / e18(600n);
      expect(await h.baseToToken(e18(100n), e18(600n), 18)).to.equal(expected);
    });

    it("token→base is the inverse scale", async function () {
      const h = await harness();
      // 1 WBNB (1e18) at $600 → $600 base (600e18).
      expect(await h.tokenToBase(WAD, e18(600n), 18)).to.equal(e18(600n));
    });

    it("returns 0 when the price is 0 (defensive)", async function () {
      const h = await harness();
      expect(await h.baseToToken(e18(100n), 0n, 18)).to.equal(0n);
    });
  });

  describe("inverse target-HF math (four directions)", function () {
    const C = e18(1000n);
    const D = e18(500n);
    const LT = 8000n;
    const target = e18(2n); // HF 2.0

    it("targetDebtBase — debt side (Borrow/Repay)", async function () {
      const h = await harness();
      // D' = C·LT·WAD/(BPS·target) = 1000·0.8/2 = $400.
      expect(await h.targetDebtBase(C, LT, target)).to.equal(e18(400n));
    });

    it("targetCollateralBase — collateral side (Supply/Withdraw)", async function () {
      const h = await harness();
      // C' = target·D·BPS/(LT·WAD) = 2·500/0.8 = $1250.
      expect(await h.targetCollateralBase(D, LT, target)).to.equal(e18(1250n));
    });

    it("Repay raises HF: ΔD = D − D' = $100", async function () {
      const h = await harness();
      const targetDebt = await h.targetDebtBase(C, LT, target);
      expect(D - targetDebt).to.equal(e18(100n));
    });

    it("Supply raises HF: ΔC = C' − C = $250", async function () {
      const h = await harness();
      const targetColl = await h.targetCollateralBase(D, LT, target);
      expect(targetColl - C).to.equal(e18(250n));
    });

    it("Borrow lowers HF toward a target below current (1.2): borrow more", async function () {
      const h = await harness();
      // target 1.2 < current 1.6 ⇒ borrow. D' = 1000·0.8/1.2 = 666.66..
      const targetDebt = await h.targetDebtBase(C, LT, e18(12n) / 10n);
      expect(targetDebt).to.be.greaterThan(D); // more debt than now → borrow ΔD>0
    });

    it("Withdraw lowers HF toward a target below current (1.2): remove collateral", async function () {
      const h = await harness();
      // target 1.2 ⇒ C' = 1.2·500/0.8 = $750 < C ⇒ withdraw ΔC = 250.
      const targetColl = await h.targetCollateralBase(D, LT, e18(12n) / 10n);
      expect(C - targetColl).to.equal(e18(250n));
    });
  });

  describe("maxSafeWithdrawBase + haircut", function () {
    it("returns uint256.max when there is no debt (withdraw all)", async function () {
      const h = await harness();
      expect(await h.maxSafeWithdrawBase(e18(1000n), 0n, 8000n)).to.equal(MaxUint256);
    });

    it("keeps HF ≥ 1 (collateral floor) minus the haircut", async function () {
      const h = await harness();
      // floor = D·BPS/LT = 500·1.25 = $625; free = $375; haircut 0.5% → 373.125.
      const expected = (e18(375n) * 9950n) / 10000n;
      expect(await h.maxSafeWithdrawBase(e18(1000n), e18(500n), 8000n)).to.equal(expected);
    });

    it("returns 0 when the collateral is already at/below the HF=1 floor", async function () {
      const h = await harness();
      // floor = 625; collateral 600 < 625 ⇒ nothing safely withdrawable.
      expect(await h.maxSafeWithdrawBase(e18(600n), e18(500n), 8000n)).to.equal(0n);
    });

    it("applyHaircut deducts exactly HAIRCUT_BPS", async function () {
      const h = await harness();
      expect(await h.applyHaircut(e18(1000n))).to.equal((e18(1000n) * 9950n) / 10000n);
      expect(await h.HAIRCUT_BPS()).to.equal(50n);
    });
  });

  describe("requireValidTargetHF", function () {
    it("exposes the 1.05 floor", async function () {
      const h = await harness();
      expect(await h.MIN_TARGET_HF()).to.equal((105n * WAD) / 100n);
    });

    it("reverts at or below the floor", async function () {
      const h = await harness();
      await expect(h.requireValidTargetHF((105n * WAD) / 100n))
        .to.be.revertedWithCustomError(h, "InvalidTargetHealthFactor");
      await expect(h.requireValidTargetHF(WAD)) // 1.0
        .to.be.revertedWithCustomError(h, "InvalidTargetHealthFactor");
    });

    it("accepts a target above the floor", async function () {
      const h = await harness();
      await h.requireValidTargetHF((106n * WAD) / 100n); // no revert
      await h.requireValidTargetHF(e18(2n));
    });
  });
});
