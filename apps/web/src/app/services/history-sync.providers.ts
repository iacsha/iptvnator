import { EnvironmentInjector, inject } from '@angular/core';
import type { HistoryPlaylistBridge } from '@iptvnator/services/history-events';
import { activePersonalScope } from '@iptvnator/services/profiles/active-scope';
import { DEFAULT_PERSONAL_SCOPE } from '@iptvnator/shared/interfaces/profiles';
import { historyProfileUsed } from './history-consent';
export function historyPlaylistBridgeFactory(): HistoryPlaylistBridge {
    const injector = inject(EnvironmentInjector);
    return {
        active: historyProfileUsed,
        project: async (playlist) =>
            historyProfileUsed()
                ? (await loadHistoryRuntime(injector)).project(playlist)
                : activePersonalScope() === DEFAULT_PERSONAL_SCOPE
                  ? playlist
                  : // Before any sync, the playlist's archive is the household's.
                    { ...playlist, recentlyViewed: [] },
        mutate: async (playlist, action) =>
            historyProfileUsed()
                ? (await loadHistoryRuntime(injector)).mutate(playlist, action)
                : null,
    };
}
export async function loadHistoryRuntime(injector: EnvironmentInjector) {
    const { HistorySyncRuntime } = await import('./history-sync-runtime');
    return injector.get(HistorySyncRuntime);
}
export async function invokeHistory(
    injector: EnvironmentInjector,
    raw: import('@iptvnator/portal/xtream/data-access').IXtreamDataSource,
    method: string,
    args: unknown[]
) {
    return (await loadHistoryRuntime(injector)).invoke(raw, method, args);
}
