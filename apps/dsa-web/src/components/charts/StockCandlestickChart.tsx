import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, createChart } from 'lightweight-charts';
import { useUiLanguage } from '../../contexts/UiLanguageContext';
import { getChartHistory } from '../../api/stockHistory';
import { aggregateCandles, movingAverage, type CandlePeriod, type StockCandle } from '../../utils/stockCandles';

const MA_COLORS = ['#eab308', '#38bdf8', '#a78bfa'];
const WINDOWS = [5, 10, 20];

export default function StockCandlestickChart({ stockCode }: { stockCode: string }) {
  const { language } = useUiLanguage();
  const { resolvedTheme } = useTheme();
  const en = language === 'en';
  const container = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<CandlePeriod>('daily');
  const [reload, setReload] = useState(0);
  const [averages, setAverages] = useState([true, true, true]);
  const [state, setState] = useState<{ code: string; rows: StockCandle[]; loading: boolean; error: boolean }>({ code: stockCode, rows: [], loading: true, error: false });
  const [hover, setHover] = useState<StockCandle | null>(null);
  const rows = useMemo(() => aggregateCandles(state.code === stockCode ? state.rows : [], period), [state, stockCode, period]);
  const loading = state.code !== stockCode || state.loading;
  const selected = rows.find((row) => row.date === hover?.date) ?? rows[rows.length - 1];

  useEffect(() => {
    let current = true;
    getChartHistory(stockCode, reload > 0).then(
      (data) => { if (current) setState({ code: stockCode, rows: data, loading: false, error: false }); },
      () => { if (current) setState({ code: stockCode, rows: [], loading: false, error: true }); },
    );
    return () => { current = false; };
  }, [stockCode, reload]);

  useEffect(() => {
    if (!container.current || !rows.length || loading) return;
    const dark = resolvedTheme === 'dark';
    const chart = createChart(container.current, {
      height: 380,
      width: container.current.clientWidth,
      layout: { background: { type: ColorType.Solid, color: dark ? '#111827' : '#ffffff' }, textColor: dark ? '#cbd5e1' : '#475569', attributionLogo: true },
      grid: { vertLines: { color: dark ? '#1e293b' : '#f1f5f9' }, horzLines: { color: dark ? '#1e293b' : '#f1f5f9' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { timeVisible: false, borderVisible: false },
      localization: { locale: en ? 'en-US' : 'zh-CN' },
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444', priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    candles.setData(rows.map((row) => ({ time: row.date, open: row.open, high: row.high, low: row.low, close: row.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(rows.filter((row) => row.volume !== null).map((row) => ({ time: row.date, value: row.volume!, color: row.close >= row.open ? '#22c55e70' : '#ef444470' })));
    WINDOWS.forEach((window, index) => {
      if (!averages[index]) return;
      const line = chart.addSeries(LineSeries, { color: MA_COLORS[index], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      line.setData(movingAverage(rows, window));
    });
    const byDate = new Map(rows.map((row) => [row.date, row]));
    chart.subscribeCrosshairMove((event) => {
      const time = event.time;
      const date = typeof time === 'string' ? time : time && typeof time === 'object'
        ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}` : '';
      setHover(byDate.get(date) ?? null);
    });
    const visibleBars = period === 'daily' ? 252 : period === 'weekly' ? 52 : 12;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, rows.length - visibleBars), to: rows.length + 2 });
    const observer = new ResizeObserver(([entry]) => chart.applyOptions({ width: Math.max(1, Math.floor(entry.contentRect.width)) }));
    observer.observe(container.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [rows, resolvedTheme, averages, en, loading, period]);

  return <section className="min-w-0 rounded-lg border settings-border bg-card/90 p-4 shadow-soft-card md:p-5" aria-label={en ? 'Interactive candlestick chart' : '交互式 K 线图'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-foreground">{stockCode} · {en ? 'Candlestick chart' : 'K 线图'}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {(['daily', 'weekly', 'monthly'] as const).map((value, index) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setHover(null); }} className={`rounded-lg border px-3 py-1.5 text-sm ${period === value ? 'border-primary text-primary bg-primary/10' : 'settings-border text-muted-text'}`}>
          {(en ? ['Day', 'Week', 'Month'] : ['日 K', '周 K', '月 K'])[index]}
        </button>)}
        <button type="button" disabled={loading} onClick={() => { setState({ code: stockCode, rows: [], loading: true, error: false }); setHover(null); setReload((value) => value + 1); }} className="rounded-lg border settings-border px-3 py-1.5 text-sm disabled:opacity-50">{en ? 'Refresh' : '刷新行情'}</button>
      </div>
    </div>
    <div className="my-3 flex flex-wrap gap-4 text-xs">
      {WINDOWS.map((window, index) => <label key={window} style={{ color: MA_COLORS[index] }} className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={averages[index]} onChange={() => setAverages((previous) => previous.map((value, i) => i === index ? !value : value))} />MA{window}</label>)}
      <span className="text-muted-text">{en ? 'Green up · Red down · Drag / scroll to explore' : '绿涨红跌 · 拖动平移 / 滚轮缩放'}</span>
    </div>
    <div className="mb-2 min-h-9 text-xs tabular-nums text-muted-text">
      {selected ? <span>{selected.date} · {en ? 'O' : '开'} {selected.open.toFixed(2)} · {en ? 'H' : '高'} {selected.high.toFixed(2)} · {en ? 'L' : '低'} {selected.low.toFixed(2)} · {en ? 'C' : '收'} {selected.close.toFixed(2)} · {en ? 'Vol' : '量'} {selected.volume?.toLocaleString(language) ?? '—'}</span> : null}
    </div>
    {loading ? <p role="status" className="py-16 text-center text-muted-text">{en ? 'Loading historical prices…' : '正在加载历史行情…'}</p>
      : state.error || !rows.length ? <p role="status" className="py-16 text-center text-muted-text">{en ? 'Historical prices unavailable. Check the data source and retry.' : '暂无可用历史行情，请检查数据源配置后点击“刷新行情”重试。'}</p>
      : <div ref={container} className="w-full overflow-hidden rounded-xl" data-testid="stock-candlestick-canvas" />}
    <p className="mt-1 text-[10px] text-muted-text">TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="underline">TradingView</a></p>
  </section>;
}
