import { useTheme } from 'next-themes';
import { useUiLanguage } from '../../contexts/UiLanguageContext';
import { Select } from '../common/Select';
import { SettingsSectionCard } from './SettingsSectionCard';

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useUiLanguage();

  return (
    <>
      <SettingsSectionCard title={t('settings.appearanceTitle')} description={t('settings.appearanceDescription')}>
        <Select
          label={t('theme.theme')}
          value={theme ?? 'system'}
          onChange={setTheme}
          placeholder=""
          options={[
            { value: 'light', label: t('theme.light') },
            { value: 'dark', label: t('theme.dark') },
            { value: 'system', label: t('theme.system') },
          ]}
        />
      </SettingsSectionCard>
      <SettingsSectionCard title={t('settings.languageTitle')} description={t('settings.languageDescription')}>
        <Select
          label={t('language.uiLanguage')}
          value={language}
          onChange={(value) => { if (value === 'zh' || value === 'en') setLanguage(value); }}
          placeholder=""
          options={[{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]}
        />
      </SettingsSectionCard>
    </>
  );
}
