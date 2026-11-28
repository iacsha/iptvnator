import { refuseProfileState } from '@iptvnator/services/profiles/active-scope';

/** The raw favorites are the household's: a profile reads nothing from them and never writes. */
export function profileRawFallback(method: string): [] | false {
    if (method === 'getFavorites') return [];
    if (method === 'isFavorite') return false;
    throw refuseProfileState();
}

/** The raw recents are the household's: a profile reads nothing from them and never writes. */
export function profileHistoryFallback(method: string): [] {
    if (method === 'getRecentItems') return [];
    throw refuseProfileState();
}
