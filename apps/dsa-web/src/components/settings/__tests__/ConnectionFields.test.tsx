import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionFields, ProviderSelector } from '../ConnectionFields';
import { apiProviderForKey, dataProviderForKey, CLI_KEYS } from '../connectionSettingsGroups';
import type { SystemConfigItem } from '../../../types/systemConfig';

it('requires a provider before exposing configuration children', () => {
  const onChange = vi.fn();
  const props = { label: '选择数据源', value: '', onChange, options: [{value:'massive',label:'Massive'}] };
  const view = render(<ProviderSelector {...props}><p>Private settings</p></ProviderSelector>);
  expect(screen.queryByText('Private settings')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('选择数据源'), { target: { value: 'massive' } });
  expect(onChange).toHaveBeenCalledWith('massive');
  view.rerender(<ProviderSelector {...props} value="massive"><p>Private settings</p></ProviderSelector>);
  expect(screen.getByText('Private settings')).toBeInTheDocument();
});

describe('field grouping', () => {
  it('keeps API, CLI and data source fields in their own scopes', () => {
    expect(apiProviderForKey('DEEPSEEK_API_KEY')).toBe('deepseek');
    expect(apiProviderForKey('ANSPIRE_LLM_MODEL')).toBe('anspire');
    expect(dataProviderForKey('ANSPIRE_API_KEYS')).toBe('anspire');
    expect(dataProviderForKey('MASSIVE_REQUESTS_PER_MINUTE')).toBe('massive');
    expect(dataProviderForKey('REALTIME_SOURCE_PRIORITY')).toBeUndefined();
    expect(CLI_KEYS.has('LOCAL_CODEX_MODE')).toBe(true);
    expect(CLI_KEYS.has('DEEPSEEK_API_KEY')).toBe(false);
  });
  it('keeps credentials masked and tuning collapsed until requested', () => {
    const items = [
      { key: 'MASSIVE_API_KEY', value: '******', rawValueExists: true, isMasked: true,
        schema: { key: 'MASSIVE_API_KEY', title:'Massive API Key', uiControl: 'password', isSensitive:true, isEditable:true } },
      { key: 'MASSIVE_REQUESTS_PER_MINUTE', value: '5', rawValueExists: true, isMasked: false,
        schema: { key:'MASSIVE_REQUESTS_PER_MINUTE', uiControl:'number', isEditable:true } },
    ] as SystemConfigItem[];
    render(<ConnectionFields items={items} issues={{}} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('******')).toHaveAttribute('type','password');
    expect(screen.getByText('高级配置').closest('details')).not.toHaveAttribute('open');
  });
});
