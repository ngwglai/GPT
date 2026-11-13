export async function secureEqual(provided: string, expected: string) {
  const hashes = await Promise.all([provided, expected].map(value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
  return crypto.subtle.timingSafeEqual(hashes[0], hashes[1]);
}
