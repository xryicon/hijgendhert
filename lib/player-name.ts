export const normalizePlayerName = (value: string) => value.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
