// Size readable roster pages to the available stage, rather than growing it.
export function seaRosterLayout(width: number, height: number, count: number) {
  const rows = Math.max(1, Math.floor((height + 8) / 62));
  const columns = width >= 400 && count > rows ? 2 : 1;
  const capacity = rows * columns;
  return { rows, columns, capacity, pages: Math.max(1, Math.ceil(count / capacity)) };
}
