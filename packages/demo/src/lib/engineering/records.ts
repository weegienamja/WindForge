/** Summarise explicit numeric columns, never infer units or run spreadsheet formulas. */
export function summariseRecord(name: string, text: string) {
  if (!/\.csv$/i.test(name))
    return (
      'Text extract; ' + text.split(/\r?\n/).length + ' lines. No measured quantities inferred.'
    );
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' && !quoted) {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  const head = rows.shift();
  if (
    !head ||
    quoted ||
    !rows.length ||
    head.length < 2 ||
    head.length > 40 ||
    rows.some((r) => r.length !== head.length)
  )
    return 'Irregular CSV; raw extract retained. No statistics calculated.';
  const stats = head
    .map((h, i) => {
      if (!/[[(].+[\])]/.test(h)) return null;
      const vs = rows.map((r) => r[i]!.trim()).filter(Boolean);
      if (
        !vs.length ||
        !vs.every(
          (x) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(x) && Number.isFinite(Number(x)),
        )
      )
        return null;
      const n = vs.map(Number);
      return (
        h.trim() +
        ': ' +
        Math.min(...n) +
        ' to ' +
        Math.max(...n) +
        ' (' +
        n.length +
        ' numeric observations, ' +
        (rows.length - n.length) +
        ' missing)'
      );
    })
    .filter(Boolean);
  return (
    rows.length +
    ' data rows. ' +
    (stats.length
      ? stats.join('; ')
      : 'No purely numeric column with an explicit header unit. Raw values retained.')
  );
}
