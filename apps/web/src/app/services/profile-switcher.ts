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
import type { ProfilesRuntime } from './profiles-runtime';
import { loadProfilesRuntime } from './profiles-runtime.providers';

export { PROFILE_SWITCHER };

type Appearance = typeof import('../profiles/profile-appearance');

function entryOf(
    appearance: Appearance,
    profile: ServerProfile
): ProfileSwitcherEntry {
    return {
        id: profile.id,
        name: profile.name,
        glyph: profile.emoji || appearance.profileInitial(profile.name),
        colour: profile.colour,
        textColour: appearance.readableTextColour(profile.colour),
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
    // The tile helpers load with the runtime: nothing renders before it.
    const appearance = signal<Appearance | null>(null);
    if (sourceConnection())
        void Promise.all([
            loadProfilesRuntime(injector),
            import('../profiles/profile-appearance'),
        ])
            .then(([loaded, loadedAppearance]) => {
                appearance.set(loadedAppearance);
                runtime.set(loaded);
            })
            .catch(() => undefined);

    const active = computed(() => {
        const current = runtime()?.active();
        const helpers = appearance();
        return current && helpers ? entryOf(helpers, current) : null;
    });
    return {
        available: computed(() => {
            const loaded = runtime();
            return !!loaded && loaded.capable() && loaded.enabled();
        }),
        active,
        others: computed(() => {
            const loaded = runtime();
            const helpers = appearance();
            const current = loaded?.activeId();
            if (!helpers) return [];
            return (loaded?.list()?.profiles ?? [])
                .filter((profile) => profile.id !== current)
                .map((profile) => entryOf(helpers, profile));
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
            const notifications = injector.get(NotificationService);
            // The kid stays blocked; the action only opens Settings > Parental lock.
            if (result === 'needs-parental-pin')
                notifications.error(
                    'PROFILES.ERRORS.KIDS_NEEDS_PARENTAL_PIN',
                    undefined,
                    {
                        action: {
                            labelKey: 'PROFILES.PICKER.OPEN_PARENTAL_LOCK',
                            run: () =>
                                void router.navigate([
                                    '/workspace/settings',
                                    'parental',
                                ]),
                        },
                    }
                );
            else if (result === 'unavailable')
                notifications.error('PROFILES.ERRORS.GENERIC');
        },
        manage(): void {
            void router.navigate(['/workspace/settings', 'profiles']);
        },
    };
}
