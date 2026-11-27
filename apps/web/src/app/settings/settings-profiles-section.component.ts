import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    EnvironmentInjector,
    computed,
    inject,
    signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '@ngx-translate/core';
import { sourceConnection } from '@iptvnator/services/source-sync/connection';
import {
    DEFAULT_PROFILE_ID,
    PROFILE_LIMIT,
    type ServerProfile,
} from '@iptvnator/shared/interfaces/profiles';
import { StateViewComponent } from '@iptvnator/ui/state';
import { ProfileAvatarComponent } from '../profiles/profile-avatar.component';
import {
    readProfilesStart,
    type ProfilesStartPreference,
} from '../services/profiles-preferences';
import { ProfileSeparationService } from '../services/profiles-separation';
import { loadProfilesRuntime } from '../services/profiles-runtime.providers';
import type { ProfilesRuntime } from '../services/profiles-runtime';
import { SettingsProfilesFacade } from './settings-profiles.facade';

/** Settings → Profiles: acts at once, no save bar. Shown only while the profiles UI is on. */
@Component({
    selector: 'app-settings-profiles-section',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [SettingsProfilesFacade],
    imports: [
        MatButtonModule,
        MatIconModule,
        MatSlideToggleModule,
        ProfileAvatarComponent,
        StateViewComponent,
        TranslatePipe,
    ],
    templateUrl: './settings-profiles-section.component.html',
    styleUrl: './settings-profiles-section.component.scss',
})
export class SettingsProfilesSectionComponent {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly facade = inject(SettingsProfilesFacade);
    readonly runtime = signal<ProfilesRuntime | null>(null);
    readonly failed = signal(false);
    readonly separation = inject(ProfileSeparationService);
    /** "Not now": the offer stays away until the next visit. */
    readonly offerDismissed = signal(false);
    readonly consentFailed = signal(false);
    readonly limit = PROFILE_LIMIT;
    readonly defaultId = DEFAULT_PROFILE_ID;
    readonly instanceId = sourceConnection()?.instanceId;
    readonly startPref = signal<ProfilesStartPreference>(
        readProfilesStart(this.instanceId)
    );

    readonly profiles = computed<readonly ServerProfile[]>(
        () => this.runtime()?.list()?.profiles ?? []
    );
    readonly enabled = computed(() => this.runtime()?.enabled() ?? false);
    readonly atLimit = computed(() => this.profiles().length >= this.limit);
    readonly loaded = computed(() => this.runtime()?.list() != null);
    /** Which parts of a profile are separate on this device, given each sync's consent. */
    readonly parts = computed(() => {
        const separate = this.separation.parts();
        return [
            {
                id: 'favorites',
                labelKey: 'SETTINGS.PROFILES.PART_FAVORITES',
                noteKey: 'SETTINGS.PROFILES.SHARED_NOTE_FAVORITES',
                separate: separate?.favorites ?? false,
            },
            {
                id: 'history',
                labelKey: 'SETTINGS.PROFILES.PART_HISTORY',
                noteKey: 'SETTINGS.PROFILES.SHARED_NOTE_HISTORY',
                separate: separate?.history ?? false,
            },
            {
                id: 'activity',
                labelKey: 'SETTINGS.PROFILES.PART_ACTIVITY',
                noteKey: 'SETTINGS.PROFILES.SHARED_NOTE_ACTIVITY',
                separate: separate?.activity ?? false,
            },
        ];
    });
    /** The parts every profile still shares because their sync is off; empty when all are on. */
    readonly sharedParts = computed(() =>
        this.parts().filter((part) => !part.separate)
    );
    readonly showOffer = computed(
        () =>
            this.enabled() &&
            !!this.separation.parts() &&
            !this.separation.allOn() &&
            !this.offerDismissed()
    );
    readonly offline = computed(
        () => !this.loaded() && this.runtime()?.state() === 'offline'
    );

    constructor() {
        void this.separation.load();
        void loadProfilesRuntime(inject(EnvironmentInjector))
            .then((runtime) => {
                this.facade.attach(runtime);
                this.runtime.set(runtime);
                void runtime.refresh();
            })
            .catch(() => this.failed.set(true));
    }

    /** The one button of the offer: turns on the syncs that are off, nothing else. */
    async turnOnSyncs(): Promise<void> {
        this.consentFailed.set(false);
        if (!(await this.separation.enableAll())) this.consentFailed.set(true);
    }

    reload(): void {
        void this.runtime()?.refresh();
    }

    setStart(value: ProfilesStartPreference): void {
        this.facade.setStart(this.instanceId, value);
        this.startPref.set(value);
    }

    /**
     * The start-up choices are one radio group: one Tab stop, and the arrow
     * keys (the TV D-pad sends the same ones) move and select.
     */
    onStartKey(event: KeyboardEvent): void {
        const steps: Readonly<Record<string, number>> = {
            ArrowLeft: -1,
            ArrowUp: -1,
            ArrowRight: 1,
            ArrowDown: 1,
        };
        const step = steps[event.key];
        if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        const next = this.startPref() === 'ask' ? 'last' : 'ask';
        this.setStart(next);
        this.host.nativeElement
            .querySelector<HTMLElement>(
                `[data-test-id="profiles-start-${next}"]`
            )
            ?.focus();
    }

    async move(profile: ServerProfile, delta: -1 | 1): Promise<void> {
        await this.facade.move(profile, delta);
        this.restoreMoveFocus(profile.id, delta);
    }

    isFirstMovable(index: number): boolean {
        return index <= 1;
    }

    /**
     * A moved row is re-inserted, which drops keyboard focus: put it back on
     * the same button, or on its twin when the row reached an end.
     */
    private restoreMoveFocus(id: string, delta: -1 | 1): void {
        queueMicrotask(() => {
            const root = this.host.nativeElement;
            const pick = (direction: string) =>
                root.querySelector<HTMLButtonElement>(
                    `[data-test-id="profile-move-${direction}-${id}"]:not([disabled])`
                );
            (
                pick(delta < 0 ? 'up' : 'down') ??
                pick(delta < 0 ? 'down' : 'up')
            )?.focus();
        });
    }
}
