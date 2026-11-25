import { InjectionToken } from '@angular/core';
import type { Playlist } from '@iptvnator/shared/interfaces';
import { DEFAULT_PERSONAL_SCOPE } from '@iptvnator/shared/interfaces/profiles';
import {
    activePersonalScope,
    ProfileStateUnavailableError,
} from './lib/profiles/active-scope';
/** App composition supplies the optional domain; ordinary source/legacy writes never enqueue. */
export interface FavoritesPlaylistBridge {
    active(): boolean;
    project<T extends Playlist>(playlist: T): Promise<T>;
    mutate(
        playlist: Playlist,
        transform: (
            current: NonNullable<Playlist['favorites']>
        ) => NonNullable<Playlist['favorites']>,
        persistLocal?: (
            favorites: NonNullable<Playlist['favorites']>
        ) => Promise<void>
    ): Promise<Playlist | null>;
}
export const FAVORITES_PLAYLIST_BRIDGE =
    new InjectionToken<FavoritesPlaylistBridge>('Favorites', {
        providedIn: 'root',
        factory: () => ({
            active: () => false,
            project: async (playlist) => playlist,
            mutate: async () => null,
        }),
    });

/** Explicit actions only. Keep this small bridge available for a first offline write. */
export async function mutateFavoritePlaylist(
    playlist: Playlist,
    transform: (
        current: NonNullable<Playlist['favorites']>
    ) => NonNullable<Playlist['favorites']>,
    bridge: FavoritesPlaylistBridge,
    persist: (playlist: Playlist) => Promise<Playlist>
): Promise<Playlist> {
    if (!playlist) throw new Error('Favorite source unavailable');
    // The playlist document is the household's: a profile never writes through it.
    const household = activePersonalScope() === DEFAULT_PERSONAL_SCOPE;
    const mutated = await bridge.mutate(
        playlist,
        transform,
        async (favorites) => {
            if (!household) throw new ProfileStateUnavailableError();
            await persist({ ...playlist, favorites });
        }
    );
    if (mutated) return mutated;
    if (!household) throw new ProfileStateUnavailableError();
    return persist({
        ...playlist,
        favorites: transform(playlist.favorites ?? []),
    });
}
