import { TestBed } from '@angular/core/testing';
import type { Playlist } from '@iptvnator/shared/interfaces';
import { setActivePersonalScope } from '@iptvnator/services/profiles';
import type { PersonalScope } from '@iptvnator/shared/interfaces/profiles';
import { favoritesPlaylistBridgeFactory } from './favorites-sync.providers';
import { historyPlaylistBridgeFactory } from './history-sync.providers';

const KIDS: PersonalScope = 'profile:11111111-1111-4111-8111-111111111111';

const playlist = {
    _id: 'synthetic-playlist',
    title: 'Synthetic',
    favorites: ['http://example.invalid/a'],
    recentlyViewed: [{ url: 'http://example.invalid/b' }],
} as unknown as Playlist;

describe('playlist bridges before any sync was turned on', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => setActivePersonalScope('shared'));

    const bridges = () =>
        TestBed.runInInjectionContext(() => ({
            favorites: favoritesPlaylistBridgeFactory(),
            history: historyPlaylistBridgeFactory(),
        }));

    it('shows the Default profile the playlist as it is', async () => {
        const { favorites, history } = bridges();
        expect(await favorites.project(playlist)).toBe(playlist);
        expect(await history.project(playlist)).toBe(playlist);
    });

    it('shows another profile no favorites and no history of the household', async () => {
        setActivePersonalScope(KIDS);
        const { favorites, history } = bridges();
        expect((await favorites.project(playlist)).favorites).toEqual([]);
        expect((await history.project(playlist)).recentlyViewed).toEqual([]);
        // The household's document is left alone.
        expect(playlist.favorites).toHaveLength(1);
    });
});
