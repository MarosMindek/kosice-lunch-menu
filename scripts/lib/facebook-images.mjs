// A size variant of the SAME already public image; do not alter authentication/signature fields.
export function publicImageVariants(src) {
  const u = new URL(src);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.fbcdn.net')) throw Error('Unexpected image host');
  const max = u.searchParams.get('cstp')?.match(/^mx(\d+)x(\d+)$/);
  const size = max ? Math.min(2048, Math.max(+max[1], +max[2])) : 0;
  if (size >= 500 && /[?&]ctp=[sp]\d+x\d+(?:&|$)/.test(src)) {
    return [...new Set([src.replace(/([?&]ctp=)[sp]\d+x\d+/, `$1s${size}x${size}`), src])];
  }
  return [src];
}
