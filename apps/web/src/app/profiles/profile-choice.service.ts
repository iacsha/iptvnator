import { EnvironmentInjector, Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ParentalLockService } from '@iptvnator/services';
import type { ServerProfile } from '@iptvnator/shared/interfaces/profiles';
import { ProfilesRuntime } from '../services/profiles-runtime';
import { loadProfileSwitch } from '../services/profiles-runtime.providers';
import { ProfilePinDialogComponent } from './profile-pin-dialog.component';

/**
 * - `selected`: this device is on the profile.
 * - `cancelled`: a PIN prompt was closed, or a choice is already running.
 * - `needs-parental-pin`: a kids profile, and no parental PIN exists on this
 *   device. Nothing was changed.
 * - `unavailable`: the profile is gone or profiles were turned off.
 */
export type ProfileChoice =
    'selected' | 'cancelled' | 'needs-parental-pin' | 'unavailable';

/**
 * The one way to move this device to another profile: the start-up picker and
 * the rail's switcher both come here. Leaving a kids profile and a profile PIN
 * ask for their PIN first. Entering a kids profile needs a parental PIN that a
 * parent set up in Settings: a PIN is never set up here, because whoever sets
 * the first PIN owns the lock, and a child choosing a profile must not.
 */
@Injectable({ providedIn: 'root' })
export class ProfileChoiceService {
    private readonly runtime = inject(ProfilesRuntime);
    private readonly dialog = inject(MatDialog);
    private readonly parentalLock = inject(ParentalLockService);
    private readonly injector = inject(EnvironmentInjector);

    readonly busy = signal(false);
    /** A failed request clears the browser's server check: redo it before the next PIN try. */
    private offlineBefore = false;

    async choose(profile: ServerProfile): Promise<ProfileChoice> {
        if (this.busy()) return 'cancelled';
        this.busy.set(true);
        try {
            const current = this.runtime.active();
            if (
                current?.kids &&
                current.id !== profile.id &&
                !(await this.parentalLock.confirmPin({
                    titleKey: 'PROFILES.PICKER.LEAVE_KIDS_TITLE',
                    descriptionKey: 'PROFILES.PICKER.LEAVE_KIDS_DESCRIPTION',
                }))
            )
                return 'cancelled';
            if (profile.kids) {
                await this.parentalLock.initialize();
                if (!this.parentalLock.hasPin()) return 'needs-parental-pin';
            }
            if (profile.hasPin && !(await this.askPin(profile)))
                return 'cancelled';
            if (!this.runtime.select(profile.id)) return 'unavailable';
            // The workspace opens on the chosen profile's state, never the old one's.
            const profileSwitch = await loadProfileSwitch(this.injector);
            await profileSwitch.apply(this.runtime.scope());
            return 'selected';
        } finally {
            this.busy.set(false);
        }
    }

    private async askPin(profile: ServerProfile): Promise<boolean> {
        const ref = ProfilePinDialogComponent.open(this.dialog, {
            titleKey: 'PROFILES.PIN_DIALOG.UNLOCK_TITLE',
            titleParams: { name: profile.name },
            descriptionKey: 'PROFILES.PIN_DIALOG.UNLOCK_DESCRIPTION',
            submitKey: 'PROFILES.PIN_DIALOG.UNLOCK',
            submit: async (pin) => {
                if (this.offlineBefore) {
                    this.offlineBefore = false;
                    await this.runtime.recheck();
                }
                const result = await this.runtime
                    .client()
                    .unlock(profile.id, pin);
                if (!result.ok && result.error.code === 'offline')
                    this.offlineBefore = true;
                if (!result.ok)
                    this.runtime.handleProfileError(
                        result.error.code,
                        profile.id
                    );
                return result;
            },
        });
        return (await firstValueFrom(ref.afterClosed())) === true;
    }
}
