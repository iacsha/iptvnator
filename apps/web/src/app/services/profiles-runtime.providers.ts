import type { EnvironmentInjector } from '@angular/core';
import type { ProfilesRuntime } from './profiles-runtime';
import type { ProfileSwitchService } from './profile-switch.service';

/** The switch drives the sync runtimes, so it loads with the runtime and never at start-up. */
export async function loadProfileSwitch(
    injector: EnvironmentInjector
): Promise<ProfileSwitchService> {
    const { ProfileSwitchService } = await import('./profile-switch.service');
    return injector.get(ProfileSwitchService);
}

/**
 * Keeps the runtime and its transport out of the initial bundle. The kids
 * lock and the prompt for a refused write come with it: they must exist
 * wherever a profile can be active.
 */
export async function loadProfilesRuntime(
    injector: EnvironmentInjector
): Promise<ProfilesRuntime> {
    const [{ ProfilesRuntime }, { ProfilesKidsLock }, { ProfilesSyncPrompt }] =
        await Promise.all([
            import('./profiles-runtime'),
            import('./profiles-kids-lock'),
            import('./profiles-sync-prompt'),
        ]);
    const runtime = injector.get(ProfilesRuntime);
    injector.get(ProfilesKidsLock);
    injector.get(ProfilesSyncPrompt);
    return runtime;
}
