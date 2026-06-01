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
});
