export const CLI_KEYS = new Set([
  'LOCAL_CODEX_MODE', 'GENERATION_BACKEND', 'GENERATION_FALLBACK_BACKEND',
  'OPENCODE_CLI_MODEL', 'GENERATION_BACKEND_TIMEOUT_SECONDS',
  'GENERATION_BACKEND_MAX_OUTPUT_BYTES', 'GENERATION_BACKEND_MAX_CONCURRENCY',
  'LOCAL_CLI_BACKEND_MAX_CONCURRENCY',
]);
export const DATA_PROVIDERS = [
  ['massive', 'Massive · 美股', 'MASSIVE_'], ['tushare', 'Tushare · A 股', 'TUSHARE_'],
  ['tickflow', 'TickFlow', 'TICKFLOW_'], ['futu', '富途 OpenD', 'FUTU_'],
  ['pytdx', '通达信 Pytdx', 'PYTDX_'], ['anspire', 'Anspire · 新闻搜索', 'ANSPIRE_'],
  ['tavily', 'Tavily · 新闻搜索', 'TAVILY_'], ['serpapi', 'SerpAPI · 新闻搜索', 'SERPAPI_'],
  ['brave', 'Brave · 新闻搜索', 'BRAVE_'], ['bocha', 'Bocha · 新闻搜索', 'BOCHA_'],
  ['minimax', 'MiniMax · 新闻搜索', 'MINIMAX_'], ['searxng', 'SearXNG · 新闻搜索', 'SEARXNG_'],
  ['yfinance', 'Yahoo Finance · 免费行情', '__YFINANCE_'],
  ['akshare', 'AkShare · 免费行情', '__AKSHARE_'], ['baostock', 'Baostock · 免费行情', '__BAOSTOCK_'],
] as const;
export function apiProviderForKey(key: string): string | undefined {
  if (key.startsWith('ANSPIRE_')) return 'anspire';
  if (key.startsWith('AIHUBMIX_')) return 'aihubmix';
  for (const name of ['deepseek', 'gemini', 'anthropic', 'openai', 'ollama']) {
    if (key.startsWith(name.toUpperCase() + '_')) return name;
  }
  return undefined;
}
export function dataProviderForKey(key: string): string | undefined {
  return DATA_PROVIDERS.find(([, , prefix]) => key.startsWith(prefix))?.[0];
}
