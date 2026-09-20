import { DEFAULT_SETTINGS } from '../../../src/settings/defaults';

describe('Settings defaults', () => {
  test('plugin theme colors are disabled by default', () => {
    expect(DEFAULT_SETTINGS.usePluginThemeColors).toBe(false);
  });

  test('viewsButtonAlignment defaults to right', () => {
    expect(DEFAULT_SETTINGS.viewsButtonAlignment).toBe('right');
  });
});

