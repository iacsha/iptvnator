import {
    EnvironmentInjector,
    effect,
    inject,
    signal,
    type Signal,
} from '@angular/core';
import type { SettingsProfilesState } from '@iptvnator/services';
import { sourceConnection } from '@iptvnator/services/source-sync/connection';
import { loadProfilesRuntime } from './profiles-runtime.providers';

/**
 * Whether profiles are unsupported, off or on here. Without a connected
 * server this touches neither the network nor the runtime chunk, and the
 * answer is `'unsupported'`. A server that has not answered yet, or is
 * offline, counts as `'on'` so the section can show its own status.
 */
export function profilesAvailabilityFactory(): Signal<SettingsProfilesState> {
    const state = signal<SettingsProfilesState>('unsupported');
    if (!sourceConnection()) return state.asReadonly();
    const injector = inject(EnvironmentInjector);
    state.set('on');
    void loadProfilesRuntime(injector)
        .then((runtime) =>
            effect(
                () => {
                    const answer = runtime.state();
                    const pending =
                        answer === 'idle' ||
                        answer === 'checking' ||
                        answer === 'offline';
                    state.set(
                        !sourceConnection() || !(runtime.capable() || pending)
                            ? 'unsupported'
                            : runtime.list() && !runtime.enabled()
                              ? 'off'
                              : 'on'
                    );
                },
                { injector }
            )
        )
        .catch(() => state.set('unsupported'));
    return state.asReadonly();
}
