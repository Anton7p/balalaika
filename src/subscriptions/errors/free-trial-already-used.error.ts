export class FreeTrialAlreadyUsedError extends Error {
  readonly code = 'FREE_TRIAL_ALREADY_USED' as const;

  constructor() {
    super('Free trial already used');
    this.name = 'FreeTrialAlreadyUsedError';
  }

  static is(err: unknown): err is FreeTrialAlreadyUsedError {
    return err instanceof FreeTrialAlreadyUsedError;
  }
}
