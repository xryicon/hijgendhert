export const normalizePlayerName = (value: string) => value.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');

// Vinext page params retain URL escaping. Decode once before constructing an API query.
export function playerNameFromRoute(value: string): string | null {
  try {
    const name = decodeURIComponent(value).trim();
    return /^[a-zA-Z0-9 _-]{1,30}$/.test(name) ? name : null;
  } catch { return null; }
}
