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

export const NOTIFICATION_CHANNELS = [
  ['wechat', '企业微信', ['WECHAT_', 'WECOM_']],
  ['feishu', '飞书 Webhook / App Bot', ['FEISHU_']],
  ['dingtalk', '钉钉', ['DINGTALK_']],
  ['telegram', 'Telegram', ['TELEGRAM_']],
  ['email', '邮件', ['EMAIL_']],
  ['pushover', 'Pushover', ['PUSHOVER_']],
  ['ntfy', 'ntfy', ['NTFY_']],
  ['gotify', 'Gotify', ['GOTIFY_']],
  ['pushplus', 'PushPlus', ['PUSHPLUS_']],
  ['serverchan3', 'Server酱3', ['SERVERCHAN3_']],
  ['custom', '自定义 Webhook / Bark', ['CUSTOM_WEBHOOK_']],
  ['discord', 'Discord', ['DISCORD_']],
  ['slack', 'Slack', ['SLACK_']],
  ['astrbot', 'AstrBot', ['ASTRBOT_']],
] as const;
export const NOTIFICATION_BASIC_KEYS = new Set([
  'WECHAT_WEBHOOK_URL', 'FEISHU_WEBHOOK_URL', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_CHAT_ID',
  'DINGTALK_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  'EMAIL_SENDER', 'EMAIL_PASSWORD', 'EMAIL_RECEIVERS',
  'PUSHOVER_USER_KEY', 'PUSHOVER_API_TOKEN', 'NTFY_URL', 'NTFY_TOKEN', 'GOTIFY_URL', 'GOTIFY_TOKEN',
  'PUSHPLUS_TOKEN', 'SERVERCHAN3_SENDKEY', 'CUSTOM_WEBHOOK_URLS',
  'DISCORD_WEBHOOK_URL', 'DISCORD_BOT_TOKEN', 'DISCORD_MAIN_CHANNEL_ID',
  'SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'ASTRBOT_URL', 'ASTRBOT_TOKEN',
]);
export function notificationChannelForKey(key: string): string | undefined {
  return NOTIFICATION_CHANNELS.find(([, , prefixes]) => prefixes.some((prefix) => key.startsWith(prefix)))?.[0];
}
