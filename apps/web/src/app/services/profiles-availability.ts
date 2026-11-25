import {
    EnvironmentInjector,
    effect,
    inject,
    signal,
    type Signal,
} from '@angular/core';
import { sourceConnection } from '@iptvnator/services/source-sync/connection';
import { loadProfilesRuntime } from './profiles-runtime.providers';

/**
 * Whether Settings → Profiles exists: a source server is connected that
 * supports profiles, or has not answered yet. Without a connected server this
 * touches neither the network nor the runtime chunk.
 */
export function profilesAvailabilityFactory(): Signal<boolean> {
    const available = signal(false);
    if (!sourceConnection()) return available.asReadonly();
    const injector = inject(EnvironmentInjector);
    available.set(true);
    void loadProfilesRuntime(injector)
        .then((runtime) =>
            effect(
                () => {
                    const answer = runtime.state();
                    available.set(
                        !!sourceConnection() &&
                            (runtime.capable() ||
                                answer === 'idle' ||
                                answer === 'checking' ||
                                answer === 'offline')
                    );
                },
                { injector }
            )
        )
        .catch(() => available.set(false));
    return available.asReadonly();
}
