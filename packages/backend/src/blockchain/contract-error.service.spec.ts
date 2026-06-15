import { Interface } from 'ethers';
import { ContractErrorService } from './contract-error.service';

describe('ContractErrorService', () => {
  let service: ContractErrorService;

  beforeEach(() => {
    service = new ContractErrorService();
  });

  it('returns a mapping of error names to messages', () => {
    const errors = service.getErrors();
    expect(typeof errors).toBe('object');
    expect(Object.keys(errors).length).toBeGreaterThan(0);
  });

  it('includes CallerNotOwner', () => {
    const errors = service.getErrors();
    expect(errors['CallerNotOwner']).toBeDefined();
    expect(typeof errors['CallerNotOwner']).toBe('string');
  });

  it('includes TriggerNotMet', () => {
    const errors = service.getErrors();
    expect(errors['TriggerNotMet']).toBeDefined();
  });

  it('includes FeeTokenNotAccepted', () => {
    const errors = service.getErrors();
    expect(errors['FeeTokenNotAccepted']).toBeDefined();
  });

  it('includes all major vault errors', () => {
    const errors = service.getErrors();
    const requiredErrors = [
      'CallerNotOwner',
      'TriggerNotMet',
      'FeeTokenNotAccepted',
      'AutomationNotActive',
      'AutomationDoesNotExist',
      'NoSteps',
      'FirstStepMustBeCondition',
      'MaxStepsExceeded',
    ];
    for (const name of requiredErrors) {
      expect(errors[name]).toBeDefined();
    }
  });

  describe('decodeRevert — fallback chain (PEC-219 #05)', () => {
    // The vault wraps the real reason as ActionExecutionFailed(stepIndex, reason).
    const wrapper = new Interface([
      'error ActionExecutionFailed(uint32 stepIndex, bytes reason)',
    ]);
    const wrap = (stepIndex: number, reason: string) =>
      wrapper.encodeErrorResult('ActionExecutionFailed', [stepIndex, reason]);

    const errStr = (msg: string) =>
      new Interface(['error Error(string)']).encodeErrorResult('Error', [msg]);
    const panic = (code: number) =>
      new Interface(['error Panic(uint256)']).encodeErrorResult('Panic', [code]);

    it('decodes an Error(string) reason — e.g. an Aave code', () => {
      // Aave V3 reverts with numeric code strings via require(...)
      const out = service.decodeRevert(wrap(2, errStr('36')));
      expect(out).toBe('Step 2: 36');
    });

    it('decodes an Error(string) reason — e.g. a PancakeSwap require message', () => {
      // PancakeSwap/Uniswap V3 reverts with require strings
      const out = service.decodeRevert(wrap(1, errStr('Too little received')));
      expect(out).toBe('Step 1: Too little received');
    });

    it('decodes a Panic(uint256) reason', () => {
      const out = service.decodeRevert(wrap(0, panic(0x11)));
      expect(out).toBe('Step 0: panic 0x11');
    });

    it('decodes a known project custom-error reason to friendly text', () => {
      const inner = new Interface([
        'error ContextSlotOutOfBounds(uint32 slot)',
      ]).encodeErrorResult('ContextSlotOutOfBounds', [4]);
      const out = service.decodeRevert(wrap(3, inner));
      expect(out).toBe('Step 3: A context slot index is out of bounds.');
    });

    it('falls back to "Step N: 0x<selector>" for an unknown custom error', () => {
      const unknown = '0xdeadbeef'; // unknown 4-byte selector, no args
      const out = service.decodeRevert(wrap(5, unknown));
      expect(out).toBe('Step 5: 0xdeadbeef');
    });

    it('uses the keeper fallback message when there is no data', () => {
      expect(service.decodeRevert('0x', 'execution reverted: HF too low')).toBe(
        'execution reverted: HF too low',
      );
      expect(service.decodeRevert(null, null)).toBe('Execution reverted');
    });

    it('handles a bare (unwrapped) Error(string) without a step prefix', () => {
      expect(service.decodeRevert(errStr('boom'))).toBe('boom');
    });
  });
});
