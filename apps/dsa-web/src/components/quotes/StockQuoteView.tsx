import { lazy, Suspense, useEffect, useState } from 'react';
import { getStockQuote, type StockQuote } from '../../api/stockQuote';
import { useUiLanguage } from '../../contexts/UiLanguageContext';
import { Button } from '../common';

const StockCandlestickChart = lazy(() => import('../charts/StockCandlestickChart'));

export function StockQuoteView({ stockCode, stockName, onAnalyze, analyzing }: {
  stockCode: string;
  stockName?: string;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  const { language } = useUiLanguage();
  const en = language === 'en';
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ quote: StockQuote | null; error: boolean; loading: boolean }>({ quote: null, error: false, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    getStockQuote(stockCode, controller.signal).then(
      (quote) => { if (!controller.signal.aborted) setState({ quote, error: false, loading: false }); },
      () => { if (!controller.signal.aborted) setState({ quote: null, error: true, loading: false }); },
    );
    return () => controller.abort();
  }, [stockCode, reload]);
  const quote = state.quote;
  const number = (value: number | null | undefined, digits = 2) => (
    typeof value === 'number' && Number.isFinite(value)
      ? value.toLocaleString(en ? 'en-US' : 'zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—'
  );
  const amplitude = quote?.high != null && quote.low != null && quote.prev_close != null && quote.prev_close > 0
    ? (quote.high - quote.low) / quote.prev_close * 100 : null;
  const fields = [
    [en ? 'Open' : '今开', number(quote?.open)],
    [en ? 'Previous close' : '昨收', number(quote?.prev_close)],
    [en ? 'High' : '最高', number(quote?.high)],
    [en ? 'Low' : '最低', number(quote?.low)],
    [en ? 'Volume (shares)' : '成交量（股）', number(quote?.volume, 0)],
    [en ? 'Turnover' : '成交额', number(quote?.amount)],
    [en ? 'Amplitude' : '振幅', amplitude === null ? '—' : `${number(amplitude)}%`],
  ];
  const direction = quote?.change_percent == null ? 'text-foreground' : quote.change_percent >= 0 ? 'text-success' : 'text-danger';
  return <div className="space-y-4" data-testid="stock-quote-view">
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="home-action-ai" size="sm" onClick={onAnalyze} disabled={analyzing} isLoading={analyzing} loadingText={en ? 'Analyzing…' : '分析中…'}>
        {en ? 'AI analysis' : 'AI 分析'}
      </Button>
    </div>
    <section className="dashboard-card p-5 text-foreground" aria-label={en ? 'Stock quote' : '基本行情'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{quote?.stock_name || stockName || stockCode}</h2>
          <p className="mt-1 text-sm text-muted-text">{stockCode}</p>
        </div>
        <Button size="sm" variant="secondary" disabled={state.loading} onClick={() => { setState({ quote: null, error: false, loading: true }); setReload((value) => value + 1); }}>
          {en ? 'Refresh quote' : '刷新报价'}
        </Button>
      </div>
      {state.loading ? <p role="status" className="py-6 text-muted-text">{en ? 'Loading quote…' : '正在加载基本行情…'}</p>
        : state.error ? <p role="alert" className="py-6 text-warning">{en ? 'Quote unavailable. Retry or check your data sources. Historical chart loads separately.' : '暂时无法获取报价，请刷新重试或检查数据源。K 线独立加载。'}</p>
          : <>
            <div className={`my-5 flex flex-wrap items-baseline gap-3 tabular-nums ${direction}`}>
              <span className="text-4xl font-semibold">{quote?.current_price != null && quote.current_price > 0 ? number(quote.current_price) : '—'}</span>
              <span>{quote?.change != null && quote.change > 0 ? '+' : ''}{number(quote?.change)}</span>
              <span>{quote?.change_percent != null && quote.change_percent > 0 ? '+' : ''}{number(quote?.change_percent)}{quote?.change_percent != null ? '%' : ''}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              {fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-text">{label}</dt><dd className="mt-1 break-words text-base font-medium tabular-nums text-foreground">{value}</dd></div>)}
            </dl>
          </>}
    </section>
    <Suspense fallback={<p role="status" className="text-muted-text">{en ? 'Loading chart…' : '正在加载 K 线图…'}</p>}>
      <StockCandlestickChart key={stockCode} stockCode={stockCode} />
    </Suspense>
  </div>;
}
