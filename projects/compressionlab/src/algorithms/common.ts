/** Compare Unicode code points explicitly, independent of browser locale. */
export const compareSymbols = (a: string, b: string): number =>
  (a.codePointAt(0) ?? -1) - (b.codePointAt(0) ?? -1);

export const utf8Bytes = (input: string): number => new TextEncoder().encode(input).length;
export const jsonBits = (value: unknown): number => utf8Bytes(JSON.stringify(value)) * 8;
export const indexBits = (alphabetSize: number): number =>
  alphabetSize <= 1 ? 0 : Math.ceil(Math.log2(alphabetSize));

export function requireInteger(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in [${min}, ${max}]`);
  }
}

/** UTF-8 size and cyclic transforms require well-formed Unicode text. */
export const isWellFormedUnicode = (input: string): boolean => !/[\uD800-\uDFFF]/u.test(input);
export function requireUnicode(input: string): void {
  if (!isWellFormedUnicode(input)) throw new TypeError('Unpaired UTF-16 surrogate is not supported');
}
