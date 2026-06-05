import { Injectable } from '@nestjs/common';
import { Interface } from 'ethers';

const CONTRACT_ERRORS: Record<string, string> = {
  CallerNotOwner: 'You are not the owner of this vault.',
  TriggerNotMet: 'The automation trigger condition is not met.',
  FeeTokenNotAccepted: 'The selected token is not accepted as a fee token.',
  FeeTooHigh: 'The fee rate exceeds the maximum allowed (10%).',
  TokenNotAccepted: 'This token is not accepted by the fee registry.',
  ZeroAddress: 'A zero address was provided where a valid address is required.',
  NoSteps: 'The automation must contain at least one step.',
  FirstStepMustBeCondition:
    'The first step of a public automation must be a condition.',
  InvalidStepReference: 'A step references a non-existent step index.',
  ZeroTargetAddress: 'A step has a zero target contract address.',
  ZeroSelector: 'A step has a zero function selector.',
  AutomationNotActive: 'This automation is currently paused.',
  AutomationDoesNotExist: 'The specified automation does not exist.',
  ConditionCallFailed: 'The condition check call failed unexpectedly.',
  ActionExecutionFailed: 'The action execution failed unexpectedly.',
  MaxStepsExceeded: 'The automation exceeded the maximum step limit (256).',
  ContextSlotOutOfBounds: 'A context slot index is out of bounds.',
  ContextDiffLengthMismatch:
    'The context diff arrays have mismatched lengths.',
  ZeroRecipient: 'A zero recipient address was provided.',
  ETHTransferFailed: 'The ETH transfer failed.',
  ImplementationNotSet:
    'The vault implementation has not been set on the factory.',
  InvalidImplementation: 'The provided implementation address is invalid.',
  InsufficientFeeDeposit:
    'The vault does not have enough fee deposit to cover gas compensation.',
  NothingToWithdraw: 'There is nothing available to withdraw.',
  WithdrawExceedsDeposit:
    'The withdrawal amount exceeds the available deposit.',
  SlotOutOfBounds: 'The context slot index is out of bounds.',
  ZeroInterval: 'The interval must be greater than zero.',
  ZeroDelta: 'The timer delta must be greater than zero.',
  ZeroFeeRegistry: 'The fee registry address must not be zero.',
  ZeroToken: 'The token address must not be zero.',
  OracleNotExist: 'No price oracle is configured for this token.',
  NegativePriceNotAllowed: 'The price oracle returned a negative price.',
};

/**
 * Error fragments the decoder recognises (PEC-219 #05). The OUTER wrappers
 * `ActionExecutionFailed`/`ConditionCallFailed` carry the step index + the raw
 * inner reason (slice #02). The inner reason is then decoded against this set.
 *
 * Note on Aave V3 / PancakeSwap V3: both predominantly revert with
 * `Error(string)` (Aave numeric codes, PancakeSwap require messages like "STF"
 * / "Too little received"), which `Interface.parseError` handles natively — so
 * the `Error(string)` branch covers them. The custom-error branch handles the
 * project's own 4-byte errors below. Unknown selectors fall back to hex.
 */
const ERROR_SIGNATURES: string[] = [
  'error ConditionCallFailed(uint32 stepIndex, bytes reason)',
  'error ActionExecutionFailed(uint32 stepIndex, bytes reason)',
  'error NoSteps()',
  'error FirstStepMustBeCondition()',
  'error InvalidStepReference(uint32 stepIndex)',
  'error ZeroTargetAddress(uint32 stepIndex)',
  'error ZeroSelector(uint32 stepIndex)',
  'error AutomationNotActive()',
  'error AutomationDoesNotExist()',
  'error CallerNotOwner()',
  'error TriggerNotMet()',
  'error MaxStepsExceeded()',
  'error ContextSlotOutOfBounds(uint32 slot)',
  'error ContextDiffLengthMismatch()',
  'error ZeroRecipient()',
  'error ETHTransferFailed()',
  'error InsufficientFeeDeposit()',
  'error NothingToWithdraw()',
  'error WithdrawExceedsDeposit()',
  'error ZeroInterval()',
  'error ZeroDelta()',
  'error ZeroFeeRegistry()',
  'error ZeroToken()',
  'error OracleNotExist()',
  'error NegativePriceNotAllowed()',
];

const OUTER_WRAPPERS = new Set(['ActionExecutionFailed', 'ConditionCallFailed']);

@Injectable()
export class ContractErrorService {
  private readonly iface = new Interface(ERROR_SIGNATURES);

  getErrors(): Record<string, string> {
    return CONTRACT_ERRORS;
  }

  /**
   * Decode a revert into a human-readable reason.
   *
   * `errorData` is the raw revert bytes the keeper captured (`e.data`). It may
   * be the outer `ActionExecutionFailed`/`ConditionCallFailed(stepIndex, reason)`
   * wrapper (slice #02) — unwrapped to a `"Step N: …"` prefix + the inner reason.
   * The reason runs the fallback chain: Error(string) → Panic → known custom
   * error → `0x<selector>`. `fallback` (the keeper's `shortMessage`) is used when
   * there is nothing decodable.
   */
  decodeRevert(errorData?: string | null, fallback?: string | null): string {
    const fb = fallback?.trim() || 'Execution reverted';
    if (!errorData || errorData === '0x') return fb;

    let prefix = '';
    let reason = errorData;

    const outer = this.tryParse(errorData);
    if (outer && OUTER_WRAPPERS.has(outer.name)) {
      prefix = `Step ${Number(outer.args[0])}: `;
      reason = outer.args[1] as string;
    }

    if (!reason || reason === '0x') {
      return prefix ? `${prefix}reverted without reason` : fb;
    }

    const decoded = this.decodeReason(reason);
    return decoded !== null ? `${prefix}${decoded}` : `${prefix}${this.selectorOf(reason)}`;
  }

  private decodeReason(reason: string): string | null {
    const desc = this.tryParse(reason);
    if (!desc) return null;
    if (desc.name === 'Error') return String(desc.args[0]);
    if (desc.name === 'Panic') {
      const code = BigInt(desc.args[0]);
      return `panic 0x${code.toString(16)}`;
    }
    return CONTRACT_ERRORS[desc.name] ?? desc.name;
  }

  private tryParse(data: string): { name: string; args: ReadonlyArray<any> } | null {
    try {
      const d = this.iface.parseError(data);
      return d ? { name: d.name, args: d.args } : null;
    } catch {
      return null;
    }
  }

  private selectorOf(data: string): string {
    const hex = data.startsWith('0x') ? data : `0x${data}`;
    return hex.slice(0, 10);
  }
}
