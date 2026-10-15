export class MailError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function errorCode(error: unknown): string {
  return error instanceof MailError ? error.code : 'OPERATION_FAILED';
}
