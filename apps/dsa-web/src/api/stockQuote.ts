import apiClient from './index';

export interface StockQuote {
  stock_code: string;
  stock_name?: string | null;
  current_price?: number | null;
  change?: number | null;
  change_percent?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prev_close?: number | null;
  volume?: number | null;
  amount?: number | null;
  /** Backend fetch time, not the exchange quote timestamp. */
  update_time?: string | null;
}

export async function getStockQuote(code: string, signal?: AbortSignal): Promise<StockQuote> {
  const response = await apiClient.get<StockQuote>(`/api/v1/stocks/${encodeURIComponent(code)}/quote`, {
    timeout: 60000, signal,
  });
  return response.data;
}
