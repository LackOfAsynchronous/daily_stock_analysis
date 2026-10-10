"""Private context lifecycle and injection boundaries for the shared Codex runtime."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from src.llm.codex_runtime import (
    _personalized_instructions, complete, load_user_investment_context,
)


@pytest.fixture
def memory_file(tmp_path, monkeypatch):
    monkeypatch.setenv('ENV_FILE', str(tmp_path / '.env'))
    path = tmp_path / 'data' / 'user_memory' / 'USER_INVESTMENT_CONTEXT.md'
    path.parent.mkdir(parents=True)
    return path


def test_absent_memory_preserves_existing_task(memory_file):
    assert load_user_investment_context() == ''
    assert _personalized_instructions('Return strict JSON') == 'Return strict JSON'


def test_memory_edits_and_removal_apply_without_restart(memory_file):
    memory_file.write_text('Historical account on 2025-01-01; current holdings UNKNOWN', encoding='utf-8')
    assert '2025-01-01' in load_user_investment_context()
    memory_file.write_text('Research all sectors', encoding='utf-8')
    assert load_user_investment_context() == 'Research all sectors'
    memory_file.unlink()
    assert load_user_investment_context() == ''


@pytest.mark.parametrize('raw', [b'X' * 65_537, b'\xff'])
def test_invalid_existing_memory_is_not_silently_dropped(memory_file, raw):
    memory_file.write_bytes(raw)
    with pytest.raises((ValueError, UnicodeDecodeError)):
        load_user_investment_context()


def test_complete_injects_context_without_changing_prompt_or_tools(memory_file):
    memory_file.write_text('Past: 2025-01-01; AI is not a screening restriction.', encoding='utf-8')
    client = MagicMock()
    client.__enter__.return_value = client
    client.inspect_external_tool_isolation.return_value = {'passed': True}
    client.start_thread.return_value = 'test-thread'
    client.run_turn.return_value = SimpleNamespace(final_text='{"ok":true}')
    with patch('src.llm.codex_runtime.build_hardened_command', return_value=['codex']), \
         patch('src.llm.codex_runtime.CodexAppServerTransport', return_value=client):
        answer = complete(SimpleNamespace(), 'Original task', system_prompt='Return strict JSON')
    assert answer == '{"ok":true}'
    args = client.start_thread.call_args.kwargs
    assert args['tool_names'] == []
    assert args['developer_instructions'].startswith('Return strict JSON')
    assert '2025-01-01' in args['developer_instructions']
    assert 'not current market evidence' in args['developer_instructions']
    assert 'candidate universe or hard screening rules' in args['developer_instructions']
    assert client.run_turn.call_args.args[1] == 'Original task'
