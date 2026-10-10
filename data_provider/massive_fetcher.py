# -*- coding: utf-8 -*-
"""Massive completed US daily bars and an explicitly estimated volume profile."""
import hashlib
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from threading import RLock
from urllib.parse import quote
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import requests

from .base import BaseFetcher, DataFetchError
from .realtime_types import ChipDistribution
from .us_index_mapping import is_us_stock_code

_BASE_URL = "https://api.massive.com"
_ESTIMATE_NOTE = (
    "成交成本分布估算：按近120个已完成交易日的成交量在每日高低价区间均匀分配；"
    "不是实际持仓成本，未模拟换手后持仓留存，不可视为真实获利盘或主力持仓。"
)


def estimate_volume_profile(code: str, bars: pd.DataFrame) -> ChipDistribution:
    """Volume-weighted histogram, deliberately not a shareholder model."""
    required = ["low", "high", "close", "volume"]
    if not all(c in bars.columns for c in ["date", *required]):
        raise DataFetchError("[Massive] Incomplete bars for cost estimate")
    frame = bars.copy()
    for col in required:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=["date", *required])
    frame = frame[np.isfinite(frame[required]).all(axis=1)]
    frame = frame[(frame.low > 0) & (frame.high >= frame.low)
                  & (frame.close >= frame.low) & (frame.close <= frame.high)
                  & (frame.volume > 0)]
    frame = frame.sort_values("date").drop_duplicates("date", keep="last").tail(120)
    if len(frame) < 20:
        raise DataFetchError("[Massive] Cost estimate requires at least 20 valid completed daily bars")
    lo, hi = float(frame.low.min()), float(frame.high.max())
    if hi == lo:
        prices, weights = np.array([lo]), np.array([1.0])
    else:
        edges = np.linspace(lo, hi, 257)
        prices = (edges[:-1] + edges[1:]) / 2
        weights = np.zeros(256)
        for row in frame.itertuples():
            if row.high == row.low:
                i = min(255, max(0, int(np.searchsorted(edges, row.close, side="right") - 1)))
                weights[i] += row.volume
            else:
                overlap = np.maximum(0, np.minimum(edges[1:], row.high) - np.maximum(edges[:-1], row.low))
                weights += overlap / (row.high - row.low) * row.volume
        weights /= weights.sum()
    cumulative = np.cumsum(weights)

    def percentile(p):
        return float(prices[min(len(prices) - 1, np.searchsorted(cumulative, p))])

    low90, high90, low70, high70 = (percentile(p) for p in (.05, .95, .15, .85))
    reference = float(frame.close.iloc[-1])
    return ChipDistribution(
        code=code, date=str(frame.date.iloc[-1]), source="massive_volume_profile",
        profit_ratio=float(weights[prices <= reference].sum()),
        avg_cost=float(np.dot(prices, weights)),
        cost_90_low=low90, cost_90_high=high90,
        concentration_90=(high90 - low90) / (high90 + low90),
        cost_70_low=low70, cost_70_high=high70,
        concentration_70=(high70 - low70) / (high70 + low70),
        is_estimated=True, estimation_method="volume_profile_uniform_daily_v1",
        estimation_note=_ESTIMATE_NOTE, sample_days=len(frame),
        reference_price=reference, currency="USD",
    )


class MassiveFetcher(BaseFetcher):
    name = "MassiveFetcher"
    priority = 1
    _lock = RLock()
    _requests = defaultdict(deque)
    _cache = {}

    def __init__(self):
        from src.config import get_config
        config = get_config()
        self._api_key = (getattr(config, "massive_api_key", None) or "").strip()
        self._rate = max(1, int(getattr(config, "massive_requests_per_minute", 5)))
        self._credential_id = hashlib.sha256(self._api_key.encode()).hexdigest()

    def is_available_for_request(self, capability=""):
        return bool(self._api_key) and capability in ("", "daily_data", "chip_distribution")

    def _get(self, url: str, params=None):
        with self._lock:
            now = time.monotonic()
            recent = self._requests[self._credential_id]
            while recent and now - recent[0] >= 60:
                recent.popleft()
            if len(recent) >= self._rate:
                raise DataFetchError("[Massive] Local rate limit reached; retry after one minute")
            recent.append(now)
        try:
            response = requests.get(url, params=params,
                                    headers={"Authorization": f"Bearer {self._api_key}"},
                                    timeout=20, allow_redirects=False)
        except requests.RequestException:
            raise DataFetchError("[Massive] Network request failed") from None
        if response.status_code in (401, 403):
            raise DataFetchError("[Massive] API key or plan permission denied (401/403)")
        if response.status_code == 429:
            raise DataFetchError("[Massive] Provider rate limit reached (429); retry later")
        if response.status_code != 200:
            raise DataFetchError(f"[Massive] HTTP {response.status_code}")
        try:
            data = response.json()
        except ValueError:
            raise DataFetchError("[Massive] Invalid JSON response") from None
        if not isinstance(data, dict) or data.get("status") in {"ERROR", "NOT_AUTHORIZED"}:
            raise DataFetchError("[Massive] Provider rejected request")
        return data

    def _fetch_raw_data(self, stock_code: str, start_date: str, end_date: str) -> pd.DataFrame:
        if not self._api_key or not is_us_stock_code(stock_code):
            raise DataFetchError("[Massive] Configured key and US stock symbol required")
        symbol = stock_code.strip().upper()
        cutoff = (datetime.now(ZoneInfo("America/New_York")).date() - timedelta(days=1)).isoformat()
        end_date = min(end_date, cutoff)
        cache_key = (self._credential_id, symbol, end_date)
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached and cached[0] <= start_date and time.monotonic() - cached[1] < 3600:
                return cached[2][cached[2].date >= start_date].copy()
        # One request serves daily analysis and the 120-session estimate.
        profile_start = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=240)).date().isoformat()
        request_start = min(start_date, profile_start)
        url = f"{_BASE_URL}/v2/aggs/ticker/{quote(symbol, safe='')}/range/1/day/{request_start}/{end_date}"
        data = self._get(url, {"adjusted": "true", "sort": "asc", "limit": 50000})
        # Daily history fits one page; fail visibly rather than use truncation.
        if data.get("next_url"):
            raise DataFetchError("[Massive] Daily history exceeded a single page; shorten date range")
        if data.get("adjusted") is False:
            raise DataFetchError("[Massive] Split-adjusted daily bars required")
        raw = pd.DataFrame(data.get("results") or [])
        if raw.empty:
            raise DataFetchError("[Massive] No completed daily bars returned")
        if not all(c in raw for c in ("t", "o", "h", "l", "c", "v")):
            raise DataFetchError("[Massive] Incomplete daily response")
        raw["date"] = pd.to_datetime(raw["t"], unit="ms", utc=True).dt.tz_convert("America/New_York").dt.strftime("%Y-%m-%d")
        raw = raw[(raw.date >= request_start) & (raw.date <= end_date)]
        raw = raw.sort_values("date").drop_duplicates("date", keep="last")
        with self._lock:
            if len(self._cache) >= 128:
                self._cache.pop(next(iter(self._cache)))
            self._cache[cache_key] = (request_start, time.monotonic(), raw.copy())
        return raw[raw.date >= start_date].copy()

    def _normalize_data(self, df: pd.DataFrame, stock_code: str) -> pd.DataFrame:
        df = df.rename(columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"}).copy()
        for col in ("open", "high", "low", "close", "volume"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["code"] = stock_code
        df["pct_chg"] = df.close.pct_change().fillna(0) * 100
        df["amount"] = pd.to_numeric(df.get("vw", df.close), errors="coerce") * df.volume
        return df[["code", "date", "open", "high", "low", "close", "volume", "amount", "pct_chg"]]

    def get_chip_distribution(self, stock_code: str) -> ChipDistribution:
        end = (datetime.now(ZoneInfo("America/New_York")).date() - timedelta(days=1)).isoformat()
        start = (datetime.strptime(end, "%Y-%m-%d") - timedelta(days=240)).date().isoformat()
        raw = self._fetch_raw_data(stock_code, start, end)
        return estimate_volume_profile(stock_code, self._normalize_data(raw, stock_code))
