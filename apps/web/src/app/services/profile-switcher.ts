import { EnvironmentInjector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
    PROFILE_SWITCHER,
    type ProfileSwitcher,
    type ProfileSwitcherEntry,
} from '@iptvnator/services';
import { NotificationService } from '@iptvnator/services/notifications';
import { sourceConnection } from '@iptvnator/services/source-sync/connection';
import type { ServerProfile } from '@iptvnator/shared/interfaces/profiles';
import {
    profileInitial,
    readableTextColour,
} from '../profiles/profile-appearance';
import type { ProfilesRuntime } from './profiles-runtime';
import { loadProfilesRuntime } from './profiles-runtime.providers';
import { PROFILES_UI_ENABLED_TOKEN } from './profiles-ui-enabled';

export { PROFILE_SWITCHER };

function entryOf(profile: ServerProfile): ProfileSwitcherEntry {
    return {
        id: profile.id,
        name: profile.name,
        glyph: profile.emoji || profileInitial(profile.name),
        colour: profile.colour,
        textColour: readableTextColour(profile.colour),
    };
}

/**
 * The rail's switcher. It exists for a connected server only, and loads the
 * profiles runtime lazily like the rest of the profiles UI, so nothing runs at
 * start-up without a connection. The choice itself (PIN prompts, the kids
 * rules, the switch) is `ProfileChoiceService`, shared with the picker.
 */
export function profileSwitcherFactory(): ProfileSwitcher {
    const injector = inject(EnvironmentInjector);
    const router = inject(Router);
    const runtime = signal<ProfilesRuntime | null>(null);
    if (inject(PROFILES_UI_ENABLED_TOKEN) && sourceConnection())
        void loadProfilesRuntime(injector)
            .then((loaded) => runtime.set(loaded))
            .catch(() => undefined);

    const active = computed(() => {
        const current = runtime()?.active();
        return current ? entryOf(current) : null;
    });
    return {
        available: computed(() => {
            const loaded = runtime();
            return !!loaded && loaded.capable() && loaded.enabled();
        }),
        active,
        others: computed(() => {
            const loaded = runtime();
            const current = loaded?.activeId();
            return (loaded?.list()?.profiles ?? [])
                .filter((profile) => profile.id !== current)
                .map(entryOf);
        }),
        async choose(id: string): Promise<void> {
            const loaded = runtime();
            const profile = loaded?.list()?.profiles.find((p) => p.id === id);
            if (!profile) return;
            const { ProfileChoiceService } =
                await import('../profiles/profile-choice.service');
            const result = await injector
                .get(ProfileChoiceService)
                .choose(profile);
            const key =
                result === 'needs-parental-pin'
                    ? 'PROFILES.ERRORS.KIDS_NEEDS_PARENTAL_PIN'
                    : result === 'unavailable'
                      ? 'PROFILES.ERRORS.GENERIC'
                      : null;
            if (key) injector.get(NotificationService).error(key);
        },
        manage(): void {
            void router.navigate(['/workspace/settings', 'profiles']);
        },
    };
}
