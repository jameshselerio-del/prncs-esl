/** An error whose message is safe to show to the user. `AUTH` tells the SPA to sign the user out. */
export class ApiError extends Error {
  readonly code?: 'AUTH';

  constructor(message: string, code?: 'AUTH') {
    super(message);
    this.code = code;
  }
}
