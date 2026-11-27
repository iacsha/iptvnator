import { XTREAM_FAVORITE_IDENTITY_CONFLICT } from '@iptvnator/shared/interfaces';
import { ProfileStateUnavailableError } from '@iptvnator/services/profiles/active-scope';

/**
 * The toast for a failed favorite write, or `null` for none. A write refused
 * because a profile's sync is off already asked to turn it on; a second toast
 * would replace that action.
 */
export function favoriteSaveFailureKey(error: unknown): string | null {
    if (error instanceof ProfileStateUnavailableError) return null;
    return error instanceof Error &&
        error.message === XTREAM_FAVORITE_IDENTITY_CONFLICT
        ? 'PORTALS.FAVORITE_IDENTITY_CONFLICT'
        : 'PORTALS.FAVORITE_SAVE_FAILED';
}
