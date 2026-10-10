export interface StockCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}
export type CandlePeriod = 'daily' | 'weekly' | 'monthly';

/** Reject malformed bars and sort/deduplicate exchange calendar dates before charting. */
export function normalizeCandles(rows: StockCandle[]): StockCandle[] {
  const dates = new Map<string, StockCandle>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const day = new Date(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== row.date) continue;
    if (![row.open, row.high, row.low, row.close].every((value) => Number.isFinite(value) && value > 0)) continue;
    if (row.high < Math.max(row.open, row.close, row.low) || row.low > Math.min(row.open, row.close)) continue;
    dates.set(row.date, { ...row, volume: row.volume !== null && Number.isFinite(row.volume) && row.volume >= 0 ? row.volume : null });
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function aggregateCandles(rows: StockCandle[], period: CandlePeriod): StockCandle[] {
  if (period === 'daily') return rows;
  const result: StockCandle[] = [];
  let previousKey = '';
  for (const row of rows) {
    const date = new Date(`${row.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const key = period === 'monthly' ? row.date.slice(0, 7) : date.toISOString().slice(0, 10);
    const previous = result[result.length - 1];
    if (key !== previousKey) {
      result.push({ ...row });
      previousKey = key;
    } else {
      previous.date = row.date;
      previous.high = Math.max(previous.high, row.high);
      previous.low = Math.min(previous.low, row.low);
      previous.close = row.close;
      // Missing volume must not be presented as a complete weekly/monthly total.
      previous.volume = previous.volume === null || row.volume === null ? null : previous.volume + row.volume;
    }
  }
  return result;
}

export function movingAverage(rows: StockCandle[], window: number) {
  let sum = 0;
  return rows.flatMap((row, index) => {
    sum += row.close;
    if (index >= window) sum -= rows[index - window].close;
    return index >= window - 1 ? [{ time: row.date, value: sum / window }] : [];
  });
}
