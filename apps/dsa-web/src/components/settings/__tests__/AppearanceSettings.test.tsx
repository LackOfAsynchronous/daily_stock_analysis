import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { UiLanguageProvider } from '../../../contexts/UiLanguageContext';
import { UI_LANGUAGE_STORAGE_KEY } from '../../../utils/uiLanguage';
import { AppearanceSettings } from '../AppearanceSettings';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
  })) });
});

it('applies and persists theme and language independently through dropdowns', () => {
  localStorage.setItem('theme', 'system');
  localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, 'zh');
  const page = render(<ThemeProvider><UiLanguageProvider><AppearanceSettings /></UiLanguageProvider></ThemeProvider>);
  const theme = screen.getByRole('combobox', { name: '主题' });
  expect(theme).toHaveValue('system');
  expect(screen.getByRole('combobox', { name: '界面语言' })).toHaveValue('zh');
  fireEvent.change(theme, { target: { value: 'dark' } });
  expect(localStorage.getItem('theme')).toBe('dark');
  expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe('zh');
  fireEvent.change(screen.getByRole('combobox', { name: '界面语言' }), { target: { value: 'en' } });
  expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Language' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
  expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe('en');
  page.unmount();
  render(<ThemeProvider><UiLanguageProvider><AppearanceSettings /></UiLanguageProvider></ThemeProvider>);
  expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
  expect(screen.getByRole('combobox', { name: 'UI language' })).toHaveValue('en');
  localStorage.clear();
});
