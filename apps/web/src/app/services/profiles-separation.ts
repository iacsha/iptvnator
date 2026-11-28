import {
    EnvironmentInjector,
    Injectable,
    computed,
    inject,
    signal,
} from '@angular/core';
import type { ActivitySyncRuntime } from './activity-sync-runtime';
import { loadActivityRuntime } from './activity-sync.providers';
import type { FavoritesSyncRuntime } from './favorites-sync-runtime';
import { loadFavoritesRuntime } from './favorites-sync.providers';
import type { HistorySyncRuntime } from './history-sync-runtime';
import { loadHistoryRuntime } from './history-sync.providers';

export interface SeparatedParts {
    readonly activity: boolean;
    readonly favorites: boolean;
    readonly history: boolean;
}

interface Runtimes {
    readonly activity: ActivitySyncRuntime;
    readonly favorites: FavoritesSyncRuntime;
    readonly history: HistorySyncRuntime;
}

/**
 * Which parts of a profile are kept apart on this device, and the one action
 * that turns all of them on. A profile is separate for a domain only while
 * that domain's sync is on here (a device without the sync has nowhere to put
 * a profile's data but the household's). Turning a sync on goes through the
 * domain's own consent function, and only ever from an explicit click.
 */
@Injectable({ providedIn: 'root' })
export class ProfileSeparationService {
    private readonly injector = inject(EnvironmentInjector);
    private readonly runtimes = signal<Runtimes | null>(null);
    private loading?: Promise<Runtimes | null>;

    /** `null` until the three runtimes have loaded. */
    readonly parts = computed<SeparatedParts | null>(() => {
        const runtimes = this.runtimes();
        return runtimes
            ? {
                  activity: runtimes.activity.enabled(),
                  favorites: runtimes.favorites.enabled(),
                  history: runtimes.history.enabled(),
              }
            : null;
    });
    readonly allOn = computed(() => {
        const parts = this.parts();
        return !!parts && parts.activity && parts.favorites && parts.history;
    });
    readonly busy = signal(false);

    load(): Promise<Runtimes | null> {
        return (this.loading ??= Promise.all([
            loadActivityRuntime(this.injector),
            loadFavoritesRuntime(this.injector),
            loadHistoryRuntime(this.injector),
        ])
            .then(([activity, favorites, history]) => {
                const runtimes = { activity, favorites, history };
                this.runtimes.set(runtimes);
                return runtimes;
            })
            .catch(() => {
                this.loading = undefined;
                return null;
            }));
    }

    /** Turns on every sync that is off. True when all three are on afterwards. */
    async enableAll(): Promise<boolean> {
        if (this.busy()) return false;
        this.busy.set(true);
        try {
            const runtimes = await this.load();
            if (!runtimes) return false;
            for (const runtime of [
                runtimes.activity,
                runtimes.favorites,
                runtimes.history,
            ]) {
                if (runtime.enabled()) continue;
                try {
                    await runtime.setEnabled(true);
                } catch {
                    // Reported by the final check: that sync stays off.
                }
            }
            return this.allOn();
        } finally {
            this.busy.set(false);
        }
    }
}
