"""Deterministic Massive transport, routing and estimation regression tests."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd
import pytest
import requests

from data_provider.base import DataFetchError, DataFetcherManager
from data_provider.massive_fetcher import MassiveFetcher, estimate_volume_profile
from src.core.config_registry import get_field_definition
from src.services.analysis_context_builder import AnalysisContextBuilder
from tests.test_analysis_context_builder import _artifacts


@pytest.fixture
def fetcher():
    MassiveFetcher._cache.clear()
    MassiveFetcher._requests.clear()
    with patch('src.config.get_config', return_value=SimpleNamespace(massive_api_key='test-secret', massive_requests_per_minute=5)):
        yield MassiveFetcher()


def bars(n=120, low=90, high=110, close=100):
    return pd.DataFrame({'date': pd.date_range('2025-01-01', periods=n).strftime('%Y-%m-%d'),
                         'low': low, 'high': high, 'close': close, 'volume': 1000.0})


def response(status=200, data=None):
    return Mock(status_code=status, json=Mock(return_value=data or {'status': 'OK'}))


def test_uniform_profile_and_disclosure():
    chip = estimate_volume_profile('AAPL', bars())
    assert chip.avg_cost == pytest.approx(100)
    assert chip.profit_ratio == pytest.approx(.5)
    assert chip.cost_90_low == pytest.approx(91, abs=.1)
    assert chip.cost_90_high == pytest.approx(109, abs=.1)
    assert chip.to_dict()['is_estimated'] is True
    assert chip.sample_days == 120
    assert '不是实际持仓成本' in chip.get_chip_status(100)
    pack = AnalysisContextBuilder.build(_artifacts(market='us', chip_data=chip))
    assert pack.blocks['chip'].status.value == 'estimated'
    assert 'volume_profile_estimate' in pack.blocks['chip'].warnings


def test_volume_weighted_profile():
    f = bars(20, 10, 10, 10)
    f.loc[10:, ['low','high','close']] = 20
    f.loc[10:, 'volume'] = 3000
    chip = estimate_volume_profile('AAPL', f)
    assert chip.avg_cost == pytest.approx(17.5, abs=.05)
    assert 10 <= chip.cost_90_low <= chip.cost_90_high <= 20


def test_flat_price_and_bad_data():
    chip = estimate_volume_profile('AAPL', bars(low=100, high=100))
    assert chip.avg_cost == 100
    assert chip.concentration_90 == 0
    assert chip.profit_ratio == 1
    bad = bars(20)
    bad.loc[0, 'volume'] = float('inf')
    with pytest.raises(DataFetchError, match='at least 20'):
        estimate_volume_profile('AAPL', bad)


def test_profile_window_deduplication():
    f = bars(150)
    f = pd.concat([f, f.tail(1)])
    assert estimate_volume_profile('AAPL', f).sample_days == 120


@pytest.mark.parametrize('status,reason', [(401,'permission'), (403,'permission'), (429,'rate limit'), (500,'HTTP')])
def test_http_errors_do_not_leak_key(fetcher, status, reason):
    with patch('data_provider.massive_fetcher.requests.get', return_value=response(status)):
        with pytest.raises(DataFetchError, match=reason) as exc:
            fetcher._get('https://api.massive.com/test')
    assert 'test-secret' not in str(exc.value)


def test_transport_credentials_and_local_limit(fetcher):
    with patch('data_provider.massive_fetcher.requests.get', return_value=response()) as http:
        for _ in range(5):
            fetcher._get('https://api.massive.com/test')
        with pytest.raises(DataFetchError, match='Local rate'):
            fetcher._get('https://api.massive.com/test')
    assert http.call_count == 5
    assert http.call_args.kwargs['headers'] == {'Authorization': 'Bearer test-secret'}
    assert http.call_args.kwargs['allow_redirects'] is False
    assert 'test-secret' not in http.call_args.args[0]


def test_network_error_redacted(fetcher):
    with patch('data_provider.massive_fetcher.requests.get', side_effect=requests.ConnectionError('test-secret')):
        with pytest.raises(DataFetchError) as exc:
            fetcher._get('https://api.massive.com/test')
    assert 'test-secret' not in str(exc.value)


def test_daily_normalization_and_profile_reuse(fetcher):
    dates = pd.date_range('2025-01-01', periods=120, tz='America/New_York')
    raw = [{'t': int(d.timestamp()*1000), 'o': 100, 'h': 110, 'l': 90, 'c': 100, 'v': 1000, 'vw': 101} for d in dates]
    with patch('data_provider.massive_fetcher.requests.get', return_value=response(data={'status':'OK', 'adjusted':True, 'results':raw})) as http:
        daily = fetcher.get_daily_data('AAPL', '2025-01-01', '2025-05-01')
        again = fetcher._fetch_raw_data('AAPL', '2025-02-01', '2025-05-01')
    assert len(daily) == 120
    assert daily.iloc[0]['amount'] == 101000
    assert 'ma20' in daily
    assert len(again) < len(daily)
    assert http.call_count == 1
    assert http.call_args.kwargs['params']['adjusted'] == 'true'


@pytest.mark.parametrize('data', [{'results':[]}, {'results':[{'c':1}]}, {'next_url':'https://evil.test'}, {'adjusted':False}])
def test_invalid_or_truncated_data_rejected(fetcher,data):
    with patch.object(fetcher,'_get', return_value=data):
        with pytest.raises(DataFetchError):
            fetcher._fetch_raw_data('AAPL', '2025-01-01', '2025-05-01')


def test_market_capability_and_key_config(fetcher):
    assert fetcher.is_available_for_request('daily_data')
    assert not fetcher.is_available_for_request('realtime_quote')
    with pytest.raises(DataFetchError):
        fetcher._fetch_raw_data('600519','2025-01-01','2025-05-01')
    field = get_field_definition('MASSIVE_API_KEY')
    assert field['is_sensitive'] and field['ui_control'] == 'password'
    assert field['category'] == 'data_source'


def test_manager_us_daily_and_chip_routes(fetcher):
    manager = DataFetcherManager(fetchers=[fetcher])
    with patch.object(fetcher, 'get_daily_data', return_value=pd.DataFrame({'close':[100]})):
        df, source = manager.get_daily_data('AAPL')
    assert source == 'MassiveFetcher' and not df.empty
    with patch('src.config.get_config', return_value=SimpleNamespace(enable_chip_distribution=True, massive_api_key="test-secret")):
        with patch.object(fetcher, 'get_chip_distribution', return_value=estimate_volume_profile('AAPL',bars())) as chip_call:
            assert manager.get_chip_distribution('AAPL').is_estimated
            assert manager.get_chip_distribution('hk00700') is None
            assert manager.get_chip_distribution('600519') is None
            chip_call.assert_called_once()


def test_configured_us_failure_is_missing():
    pack = AnalysisContextBuilder.build(_artifacts(market='us', chip_data=None, metadata={'us_chip_enabled':True}))
    assert pack.blocks['chip'].status.value == 'missing'


def test_report_does_not_turn_estimate_into_real_holders():
    from src.analyzer import AnalysisResult, normalize_chip_structure_availability
    chip = estimate_volume_profile('AAPL', bars())
    result = AnalysisResult(code='AAPL', name='Apple', sentiment_score=50, trend_prediction='震荡', operation_advice='观望', decision_type='hold', confidence_level='中')
    result.dashboard = {'data_perspective': {'chip_structure': {'profit_ratio':'真实获利盘99%', 'chip_health':'主力控盘'}}}
    normalize_chip_structure_availability(result, chip)
    cs = result.dashboard['data_perspective']['chip_structure']
    assert '估算' in cs['avg_cost'] and '美元' in cs['avg_cost']
    assert '成交量比例' in cs['profit_ratio']
    assert '非真实持仓' in cs['chip_health']
    assert '主力控盘' not in str(cs)


def test_massive_failure_falls_back_to_yahoo(fetcher):
    from data_provider.yfinance_fetcher import YfinanceFetcher
    yahoo = YfinanceFetcher()
    manager = DataFetcherManager(fetchers=[fetcher, yahoo])
    with patch.object(fetcher, 'get_daily_data', side_effect=DataFetchError('rate limit')), patch.object(yahoo, 'get_daily_data', return_value=pd.DataFrame({'close':[99]})):
        df, source = manager.get_daily_data('AAPL')
    assert source == 'YfinanceFetcher' and df.iloc[0]['close'] == 99

@pytest.mark.parametrize('language', ['zh','en'])
def test_estimated_prompt_avoids_real_holder_thresholds(language):
    from src.analyzer import GeminiAnalyzer
    chip = estimate_volume_profile('AAPL',bars()).to_dict()
    analyzer = GeminiAnalyzer.__new__(GeminiAnalyzer)
    analyzer._skill_instructions_override = ''
    analyzer._default_skill_policy_override = ''
    analyzer._use_legacy_default_prompt_override = True
    with patch('src.analyzer.get_config', return_value=SimpleNamespace(news_max_age_days=3, news_strategy_profile='short')):
        prompt = analyzer._format_prompt({'code':'AAPL','chip':chip}, 'Apple', report_language=language)
    assert 'massive_volume_profile' in prompt
    assert 'Volume-weighted estimated cost (USD)' in prompt
    assert '| **获利比例**' not in prompt
    assert '| **Profit Ratio**' not in prompt
