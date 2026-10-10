import { describe, expect, it } from 'vitest';
import { aggregateCandles, movingAverage, normalizeCandles, type StockCandle } from '../stockCandles';
const bar = (date: string, close = 11, volume: number | null = 100): StockCandle => ({ date, open: 10, high: 20, low: 5, close, volume });
describe('stock candles', () => {
  it('sorts dates, rejects invalid OHLC and dates, keeps zero volume and deduplicates dates', () => {
    const result = normalizeCandles([bar('2026-01-06'), bar('2026-02-30'), bar('2026-01-05', 9),
      bar('2026-01-05', 12, 0), bar('2026-01-07', NaN), bar('2026-01-08', 21)]);
    expect(result.map((row) => row.date)).toEqual(['2026-01-05', '2026-01-06']);
    expect(result[0].close).toBe(12);
    expect(result[0].volume).toBe(0);
  });
  it('aggregates by exchange calendar week across year boundaries without modifying daily input', () => {
    const daily = [bar('2025-12-31', 12), { ...bar('2026-01-02', 14, 200), open: 13, high: 25 }, bar('2026-01-05', 9)];
    expect(aggregateCandles(daily, 'weekly')).toEqual([
      { date: '2026-01-02', open: 10, high: 25, low: 5, close: 14, volume: 300 }, bar('2026-01-05', 9),
    ]);
    expect(daily[0].close).toBe(12);
  });
  it('separates calendar months and preserves missing volume', () => {
    const daily = [bar('2026-01-02', 12, null), bar('2026-01-30', 13), bar('2026-02-02', 11)];
    const monthly = aggregateCandles(daily, 'monthly');
    expect(monthly.map((row) => row.date)).toEqual(['2026-01-30', '2026-02-02']);
    expect(monthly[0]).toMatchObject({ open: 10, close: 13, volume: null });
  });
  it('computes MAs only after enough bars and uses the current candle period', () => {
    const daily = [bar('2026-01-05', 10), bar('2026-01-06', 12), bar('2026-01-07', 14), bar('2026-01-08', 16)];
    expect(movingAverage(daily, 3)).toEqual([{ time: '2026-01-07', value: 12 }, { time: '2026-01-08', value: 14 }]);
    expect(movingAverage(aggregateCandles(daily, 'weekly'), 3)).toEqual([]);
  });
});
