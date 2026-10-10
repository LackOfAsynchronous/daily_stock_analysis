import apiClient from './index';
import { normalizeCandles, type StockCandle } from '../utils/stockCandles';

const cache = new Map<string, { loadedAt: number; data: StockCandle[] }>();
const pending = new Map<string, Promise<StockCandle[]>>();
const CACHE_TTL = 10 * 60 * 1000;

/** Share requests across mounts and periods; keep API credentials on the backend. */
export function getChartHistory(code: string, refresh = false): Promise<StockCandle[]> {
  const key = code.trim();
  const existing = pending.get(key);
  if (existing) return existing;
  const cached = cache.get(key);
  if (!refresh && cached && Date.now() - cached.loadedAt < CACHE_TTL) return Promise.resolve(cached.data);
  const request = apiClient.get<{ data: StockCandle[] }>(`/api/v1/stocks/${encodeURIComponent(key)}/history`, {
    params: { period: 'daily', days: 365 }, timeout: 60000,
  }).then(({ data }) => {
    const rows = normalizeCandles(data.data ?? []);
    if (rows.length) {
      if (cache.size >= 20) cache.delete(cache.keys().next().value!);
      cache.set(key, { loadedAt: Date.now(), data: rows });
    }
    return rows;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
