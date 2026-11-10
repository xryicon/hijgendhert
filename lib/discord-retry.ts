export function discordRetryDeadline(value: unknown, now = Date.now()): number {
  const timestamp = typeof value === 'string' && /^\d{10,16}$/.test(value) ? Number(value) : typeof value === 'number' ? value : 0;
  return Number.isSafeInteger(timestamp) && timestamp > now ? timestamp : 0;
}

export function discordWaitLabel(seconds: number): string {
  const remaining = Math.max(0, Math.ceil(seconds));
  if (remaining >= 3600) return `${Math.floor(remaining / 3600)}u ${Math.ceil((remaining % 3600) / 60)}m`;
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}
