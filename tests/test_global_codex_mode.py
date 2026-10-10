import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.config import Config
from src.agent.agent_backend import resolve_agent_backend_id
from src.agent.llm_adapter import LLMToolAdapter
from src.llm.backend_factory import create_generation_backend
from src.llm.codex_runtime import CodexGenerationBackend, tool_completion
from src.llm.generation_backend import GenerationError


def test_global_mode_routes_multi_agent_without_api_keys():
    cfg = Config(local_codex_mode=True, agent_arch='multi', agent_backend='codex_app_server')
    assert cfg.is_agent_available()
    assert resolve_agent_backend_id(cfg) == 'litellm'
    with patch('src.agent.llm_adapter.Router', side_effect=AssertionError('API router constructed')):
        adapter = LLMToolAdapter(cfg)
    assert adapter.is_available
    assert adapter.primary_provider == 'codex'
    assert isinstance(create_generation_backend('litellm', config=cfg), CodexGenerationBackend)


def test_global_mode_off_preserves_chat_backend():
    assert resolve_agent_backend_id(Config(agent_backend='codex_app_server')) == 'codex_app_server'


@pytest.mark.parametrize('data', [
    {'content': '', 'tool_calls': [{'name': 'shell', 'arguments': {}}]},
    {'content': '', 'tool_calls': [{'name': 'quote', 'arguments': {'code': 123}}]},
    {'content': '', 'tool_calls': [{'name': 'quote', 'arguments': {}}]},
    {'content': '', 'tool_calls': [], 'unexpected': 'injection'},
])
def test_tool_selection_rejects_undeclared_names_and_invalid_arguments(data):
    tool = {'type': 'function', 'function': {'name': 'quote', 'parameters': {
        'type': 'object', 'required': ['code'], 'properties': {'code': {'type': 'string'}},
    }}}
    with patch('src.llm.codex_runtime.complete', return_value=SimpleNamespace(final_text=json.dumps(data))):
        with pytest.raises(Exception):
            tool_completion(Config(), [], [tool])


def test_tool_selection_preserves_valid_arguments_and_actual_model():
    data = {'content': '', 'tool_calls': [{'name': 'quote', 'arguments': {'code': 'AXTI'}}]}
    turn = SimpleNamespace(final_text=json.dumps(data), model='actual-model', usage={'total_tokens': 12})
    tool = {'type': 'function', 'function': {'name': 'quote', 'parameters': {'type': 'object'}}}
    with patch('src.llm.codex_runtime.complete', return_value=turn):
        result = tool_completion(Config(), [], [tool])
    assert result['tool_calls'][0]['arguments'] == {'code': 'AXTI'}
    assert result['tool_calls'][0]['id'].startswith('codex_')
    assert result['model'] == 'actual-model'


def test_generation_failure_never_allows_api_fallback():
    with patch('src.llm.codex_runtime.complete', side_effect=TimeoutError):
        with pytest.raises(GenerationError) as error:
            CodexGenerationBackend(Config()).generate('test', {})
    assert not error.value.fallbackable


def test_generation_preserves_model_usage_and_validator():
    turn = SimpleNamespace(final_text='{"ok":true}', model='actual-model', usage={'total_tokens': 12})
    with patch('src.llm.codex_runtime.complete', return_value=turn):
        result = CodexGenerationBackend(Config()).generate('test', {}, response_validator=json.loads)
    assert result.model == 'actual-model'
    assert result.usage['total_tokens'] == 12


def test_agent_text_uses_codex_instead_of_api():
    turn = SimpleNamespace(final_text='answer', model='actual-model', usage=None)
    adapter = LLMToolAdapter(Config(local_codex_mode=True))
    with patch('src.llm.codex_runtime.complete', return_value=turn), \
         patch('litellm.completion', side_effect=AssertionError('API called')):
        response = adapter.call_text([{'role': 'user', 'content': 'test'}])
    assert response.provider == 'codex'
    assert response.model == 'actual-model'
    assert response.content == 'answer'


def test_agent_error_does_not_turn_into_success():
    adapter = LLMToolAdapter(Config(local_codex_mode=True))
    with patch('src.llm.codex_runtime.complete', side_effect=TimeoutError):
        assert adapter.call_text([]).provider == 'error'


def test_research_codex_stage_allows_cold_start_but_respects_total_budget():
    from src.agent.research import ResearchAgent
    from src.agent.tools.registry import ToolRegistry
    agent = ResearchAgent(ToolRegistry(), LLMToolAdapter(Config(local_codex_mode=True)))
    assert agent._stage_timeout(30, 200) == 120
    assert agent._stage_timeout(30, 17) == 17
    assert agent._stage_timeout(15, 0) is None
    agent.llm_adapter._config.local_codex_mode = False
    assert agent._stage_timeout(30, 200) == 30


def test_status_global_mode_does_not_require_api_route():
    from src.services.agent_backend_status_service import AgentBackendStatusService
    from src.services.generation_backend_status_service import GenerationBackendStatusService
    cfg = GenerationBackendStatusService(effective_map={'LOCAL_CODEX_MODE': 'true'}).build_effective_config()
    assert cfg.local_codex_mode
    assert cfg.generation_backend == 'codex_cli'
    assert cfg.generation_fallback_backend == ''
    service = AgentBackendStatusService(config=cfg)
    with patch.object(service, '_codex_cheap_status', return_value={'backend': 'codex_app_server', 'available': True}):
        assert service.get_status()['backend'] == 'codex_global'


def test_screening_codex_path_needs_no_api_key(monkeypatch):
    from src.services.screening.config import Config as ScreeningConfig
    from src.services.screening.ranker import rank_candidates_with_metadata
    from src.services.screening.models import Pick
    monkeypatch.setenv('LOCAL_CODEX_MODE', 'true')
    assert ScreeningConfig().has_llm_config()
    response = '{"ranked":[{"code":"AXTI","score":80,"ranking_reason":"test"}]}'
    with patch('src.config.get_config', return_value=Config(local_codex_mode=True)), \
         patch('src.llm.codex_runtime.complete', return_value=response), \
         patch('litellm.completion', side_effect=AssertionError('API called')):
        result = rank_candidates_with_metadata([Pick(1, 'AXTI', 'AXT', 70, 70)], '', '', '', max_retries=0)
    assert result.ranked
    assert result.coverage == 1
    assert result.model_used.startswith('codex/')


def test_image_extraction_codex_path_needs_no_api_key():
    import io
    from PIL import Image
    from src.services.image_stock_extractor import extract_stock_codes_from_image
    image = io.BytesIO()
    Image.new('RGB', (20, 20), 'white').save(image, format='PNG')
    with patch('src.services.image_stock_extractor.get_config', return_value=Config(local_codex_mode=True)), \
         patch('src.llm.codex_runtime.complete', return_value='AXTI') as complete, \
         patch('src.services.image_stock_extractor._resolve_vision_model', side_effect=AssertionError('API vision called')):
        extract_stock_codes_from_image(image.getvalue(), 'image/png')
    assert complete.call_args.kwargs['images'][0].startswith('data:image/png;base64,')
