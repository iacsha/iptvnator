import { InjectionToken, signal, type Signal } from '@angular/core';

/**
 * What Settings can say about household profiles on this runtime:
 * `'unsupported'` (no source server is connected, or it does not support
 * profiles), `'off'` (the server supports them and they are turned off) or
 * `'on'`. A server that has not answered yet counts as `'on'`, so a direct
 * visit to Settings → Profiles waits instead of being redirected.
 */
export type SettingsProfilesState = 'unsupported' | 'off' | 'on';

/**
 * The app provides the real answer; the default (`'unsupported'`) keeps the
 * section, its search rows and its command palette entry out of every other
 * host.
 */
export const SETTINGS_PROFILES_STATE = new InjectionToken<
    Signal<SettingsProfilesState>
>('SETTINGS_PROFILES_STATE', {
    providedIn: 'root',
    factory: () => signal<SettingsProfilesState>('unsupported').asReadonly(),
});
