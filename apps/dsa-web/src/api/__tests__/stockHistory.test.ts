import { beforeEach, expect, it, vi } from 'vitest';
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../index', () => ({ default: { get } }));
beforeEach(() => { vi.resetModules(); get.mockReset(); });
const rows = [{ date: '2026-01-05', open: 10, high: 12, low: 9, close: 11, volume: 0 }];
it('shares in-flight requests, caches successful results, and refreshes on demand', async () => {
  get.mockResolvedValue({ data: { data: rows } });
  const { getChartHistory } = await import('../stockHistory');
  const first = getChartHistory('AXTI');
  expect(getChartHistory('AXTI')).toBe(first);
  expect(await first).toEqual(rows);
  await getChartHistory('AXTI');
  expect(get).toHaveBeenCalledTimes(1);
  await getChartHistory('AXTI', true);
  expect(get).toHaveBeenCalledTimes(2);
  expect(get.mock.calls[0][1].params).toEqual({ period: 'daily', days: 365 });
});
it('does not cache empty responses or failures', async () => {
  get.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: { data: [] } }).mockResolvedValueOnce({ data: { data: rows } });
  const { getChartHistory } = await import('../stockHistory');
  await expect(getChartHistory('WFC')).rejects.toThrow('network');
  expect(await getChartHistory('WFC')).toEqual([]);
  expect(await getChartHistory('WFC')).toEqual(rows);
  expect(get).toHaveBeenCalledTimes(3);
});
