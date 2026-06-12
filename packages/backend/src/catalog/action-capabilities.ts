/**
 * Single source of truth for on-chain action **amount-mode** capabilities.
 *
 * Mirrors `enum AmountMode` in
 * `packages/contracts/contracts/libraries/ActionLib.sol`. This is intentionally a
 * hand-maintained, reviewed list (not parsed from Solidity): the value set changes
 * rarely and a change there already requires a redeploy + re-seed, at which point
 * this is the obvious co-edit. The catalog-integrity guard cross-checks the
 * LLM-/UI-facing `paramSchema` against this list so stale or contradictory metadata
 * fails CI instead of users.
 */

/** Amount/selection mode — integer values are the on-chain ABI encoding. */
export enum AmountMode {
  FIXED = 0,
  FROM_SLOT = 1,
  MAX_AVAILABLE = 2,
  TARGET_HF = 3,
}

/** A mode that, when advertised, requires a specific auxiliary field (by widget). */
export interface ModeFieldRequirement {
  mode: AmountMode;
  /** `x-ui-widget` the required field must carry (e.g. 'health-factor' for TARGET_HF). */
  widget: string;
}

export interface ActionCapability {
  /** Modes the deployed action resolves; any other mode reverts on-chain. */
  supportedModes: readonly AmountMode[];
  /** Fields that MUST exist in the schema when the given mode is advertised. */
  modeFields?: readonly ModeFieldRequirement[];
}

/**
 * Every Aave amount action resolves all four modes (FIXED / FROM_SLOT /
 * MAX_AVAILABLE / TARGET_HF) — see each action's `_resolveAmount` /`_targetHf*`
 * and `test/AaveHfModes.fork.ts`. TARGET_HF needs the `health-factor` target field.
 */
const AAVE_AMOUNT_ACTION: ActionCapability = {
  supportedModes: [
    AmountMode.FIXED,
    AmountMode.FROM_SLOT,
    AmountMode.MAX_AVAILABLE,
    AmountMode.TARGET_HF,
  ],
  modeFields: [{ mode: AmountMode.TARGET_HF, widget: 'health-factor' }],
};

/**
 * `contractKey` → capability. Only actions with selectable amount modes appear
 * here; a step without an entry simply skips the mode rules (it still gets the
 * generic stale-phrase / ABI-lockstep / role checks).
 */
export const ACTION_CAPABILITIES: Record<string, ActionCapability> = {
  AaveV3SupplyAction: AAVE_AMOUNT_ACTION,
  AaveV3WithdrawAction: AAVE_AMOUNT_ACTION,
  AaveV3BorrowAction: AAVE_AMOUNT_ACTION,
  AaveV3RepayAction: AAVE_AMOUNT_ACTION,
};
