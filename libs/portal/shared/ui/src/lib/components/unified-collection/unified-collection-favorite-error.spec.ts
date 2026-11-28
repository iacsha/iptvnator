import { XTREAM_FAVORITE_IDENTITY_CONFLICT } from '@iptvnator/shared/interfaces';
import { ProfileStateUnavailableError } from '@iptvnator/services/profiles/active-scope';
import { favoriteSaveFailureKey } from './unified-collection-favorite-error';

describe('favoriteSaveFailureKey', () => {
    it('names an identity conflict', () => {
        expect(
            favoriteSaveFailureKey(new Error(XTREAM_FAVORITE_IDENTITY_CONFLICT))
        ).toBe('PORTALS.FAVORITE_IDENTITY_CONFLICT');
    });

    it('names any other failed write', () => {
        expect(favoriteSaveFailureKey(new Error('SQLite write failed'))).toBe(
            'PORTALS.FAVORITE_SAVE_FAILED'
        );
        expect(favoriteSaveFailureKey('not an error')).toBe(
            'PORTALS.FAVORITE_SAVE_FAILED'
        );
    });

    it('shows nothing for a write refused for lack of sync, so the sync prompt stays', () => {
        expect(
            favoriteSaveFailureKey(new ProfileStateUnavailableError())
        ).toBeNull();
    });
});
