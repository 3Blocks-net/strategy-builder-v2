import { Injectable } from '@nestjs/common';

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

@Injectable()
export class ContractErrorService {
  getErrors(): Record<string, string> {
    return CONTRACT_ERRORS;
  }
}
