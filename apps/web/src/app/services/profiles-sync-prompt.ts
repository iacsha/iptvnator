import {
    DestroyRef,
    EnvironmentInjector,
    Injectable,
    inject,
} from '@angular/core';
import { NotificationService } from '@iptvnator/services/notifications';
import { onProfileStateRefused } from '@iptvnator/services/profiles';
import { ProfileSeparationService } from './profiles-separation';

/** One prompt per this long, however many writes are refused. */
export const SYNC_PROMPT_INTERVAL_MS = 15_000;

/**
 * A write refused because its sync is off (`ProfileStateUnavailableError`)
 * must not vanish: the profile's data has nowhere to go but the household's,
 * so the user is asked to turn the syncs on. The toast stays until acted on.
 */
@Injectable({ providedIn: 'root' })
export class ProfilesSyncPrompt {
    // Looked up when a prompt is due, so loading the runtime stays cheap.
    private readonly injector = inject(EnvironmentInjector);
    private lastShown = 0;

    constructor() {
        inject(DestroyRef).onDestroy(onProfileStateRefused(() => this.show()));
    }

    private show(): void {
        const now = Date.now();
        if (now - this.lastShown < SYNC_PROMPT_INTERVAL_MS) return;
        this.lastShown = now;
        this.injector
            .get(NotificationService)
            .error('PROFILES.SYNC_PROMPT.MESSAGE', undefined, {
                action: {
                    labelKey: 'PROFILES.SYNC_PROMPT.ACTION',
                    run: () => void this.turnOn(),
                },
            });
    }

    private async turnOn(): Promise<void> {
        const notifications = this.injector.get(NotificationService);
        if (await this.injector.get(ProfileSeparationService).enableAll())
            notifications.success('PROFILES.SYNC_PROMPT.DONE');
        else notifications.error('PROFILES.SYNC_PROMPT.FAILED');
    }
}
