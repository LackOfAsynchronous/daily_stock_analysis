import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Chart from '../StockCandlestickChart';
const { getHistory, create, remove, setData, disconnect } = vi.hoisted(() => ({ getHistory: vi.fn(), create: vi.fn(), remove: vi.fn(), setData: vi.fn(), disconnect: vi.fn() }));
vi.mock('../../../api/stockHistory', () => ({ getChartHistory: getHistory }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'candles', HistogramSeries: 'volume', LineSeries: 'line',
  ColorType: { Solid: 'solid' }, CrosshairMode: { Normal: 0 }, createChart: create,
}));
const rows = [{ date: '2026-01-05', open: 10, high: 12, low: 9, close: 11, volume: 100 }];
beforeEach(() => {
  vi.clearAllMocks();
  getHistory.mockResolvedValue(rows);
  create.mockImplementation(() => ({ addSeries: () => ({ setData, priceScale: () => ({ applyOptions: vi.fn() }) }),
    timeScale: () => ({ setVisibleLogicalRange: vi.fn() }), subscribeCrosshairMove: vi.fn(), applyOptions: vi.fn(), remove }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect; });
});
it('loads candles, changes period without refetching, and releases chart resources', async () => {
  const page = render(<Chart stockCode="AXTI" />);
  await screen.findByTestId('stock-candlestick-canvas');
  fireEvent.click(screen.getByRole('button', { name: '周 K' }));
  expect(screen.getByRole('button', { name: '周 K' })).toHaveAttribute('aria-pressed', 'true');
  expect(getHistory).toHaveBeenCalledTimes(1);
  expect(setData).toHaveBeenCalledWith([{ time: '2026-01-05', open: 10, high: 12, low: 9, close: 11 }]);
  page.unmount();
  expect(remove).toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalled();
});
it('offers a retry when data is unavailable', async () => {
  getHistory.mockRejectedValueOnce(new Error('network'));
  render(<Chart stockCode="AXTI" />);
  await screen.findByText(/暂无可用历史行情/);
  fireEvent.click(screen.getByRole('button', { name: '刷新行情' }));
  await screen.findByTestId('stock-candlestick-canvas');
  expect(getHistory).toHaveBeenLastCalledWith('AXTI', true);
});
it('ignores a late response for the previous stock', async () => {
  let resolveOld!: (value: typeof rows) => void;
  getHistory.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
  const page = render(<Chart stockCode="AXTI" />);
  page.rerender(<Chart stockCode="WFC" />);
  await screen.findByTestId('stock-candlestick-canvas');
  resolveOld([{ ...rows[0], close: 10.5 }]);
  await waitFor(() => expect(screen.getByRole('heading', { name: /WFC/ })).toBeInTheDocument());
  expect(screen.queryByText(/10.50/)).not.toBeInTheDocument();
});
