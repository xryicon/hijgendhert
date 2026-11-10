// Parse abbreviated OSRS amounts exactly, without floating-point rounding.
// With a suffix, comma and dot are decimal separators; bare whole GP also
// accept Dutch thousands separators. Never silently strip invalid characters.
export function parsePkGp(input: string): number | null {
  const text = input.trim().replace(/\s+/g, '');
  if (!text || text.length > 32) return null;
  let amount: bigint;
  const abbreviated = /^(\d+)(?:[.,](\d{1,6}))?([km])$/i.exec(text);
  if (abbreviated) {
    const fraction = abbreviated[2] || '';
    const scale = BigInt(10) ** BigInt(fraction.length);
    const units = BigInt(abbreviated[3].toLowerCase() === 'k' ? 1000 : 1000000);
    const numerator = BigInt(abbreviated[1] + fraction) * units;
    if (numerator % scale !== BigInt(0)) return null;
    amount = numerator / scale;
  } else if (/^\d+$/.test(text)) amount = BigInt(text);
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) amount = BigInt(text.replaceAll('.', ''));
  else return null;
  return amount >= BigInt(1) && amount <= BigInt(100000000000) ? Number(amount) : null;
}
