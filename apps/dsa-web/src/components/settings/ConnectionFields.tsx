import type { ReactNode } from 'react';
import { Select } from '../common';
import { SettingsField } from './SettingsField';
import type { ConfigValidationIssue, SystemConfigItem } from '../../types/systemConfig';


interface Props {
  items: SystemConfigItem[];
  onChange: (key: string, value: string) => void;
  issues: Record<string, ConfigValidationIssue[]>;
  disabled?: boolean;
  title?: string;
  description?: string;
  collapseAdvanced?: boolean;
}
export function ConnectionFields({ items, onChange, issues, disabled, title, description, collapseAdvanced = true }: Props) {
  const field = (item: SystemConfigItem) => <SettingsField key={item.key} item={item} value={item.value}
    disabled={disabled} onChange={onChange} issues={issues[item.key] || []} />;
  const basic = items.filter((item) => !collapseAdvanced || /(?:API_KEYS?|TOKEN|HOST|BASE_URL|BASE_URLS|MODEL)$/.test(item.key));
  const advanced = items.filter((item) => !basic.includes(item));
  return <div className="space-y-3">
    {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
    {description ? <p className="text-xs leading-6 text-muted-text">{description}</p> : null}
    <div className="divide-y divide-[var(--settings-border-soft)]">{basic.map(field)}</div>
    {advanced.length ? <details className="rounded-xl border settings-border p-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">高级配置</summary>
      <div className="mt-3 divide-y divide-[var(--settings-border-soft)]">{advanced.map(field)}</div>
    </details> : null}
  </div>;
}
export function ProviderSelector({ label, value, onChange, options, disabled, children }: {
  label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean; children?: ReactNode;
}) {
  return <div className="space-y-4">
    <Select label={label} value={value} onChange={onChange} options={[{ value: '', label: '请选择…' }, ...options]}
      disabled={disabled} />
    {value ? children : <p className="rounded-xl border border-dashed settings-border p-5 text-sm text-muted-text">
      先选择服务商，再配置对应密钥和参数。切换选择不会更改已保存的配置。
    </p>}
  </div>;
}
