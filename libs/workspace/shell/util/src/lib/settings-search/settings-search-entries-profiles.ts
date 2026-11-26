import { SettingsSearchEntry } from './settings-search.types';

/** Profiles section rows, in page order. */
export const PROFILES_SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] =
    [
        {
            id: 'profiles-enabled',
            section: 'profiles',
            labelKey: 'SETTINGS.PROFILES.ENABLED',
            descriptionKey: 'SETTINGS.PROFILES.ENABLED_DESCRIPTION',
            keywords: ['profiles', 'household', 'family', 'kids', 'users'],
            requires: ['profiles'],
        },
        {
            id: 'profiles-start',
            section: 'profiles',
            labelKey: 'SETTINGS.PROFILES.START',
            descriptionKey: 'SETTINGS.PROFILES.START_DESCRIPTION',
            keywords: ['profiles', "who's watching", 'picker', 'startup', 'last'],
            requires: ['profiles'],
        },
        {
            id: 'profiles-consent',
            section: 'profiles',
            labelKey: 'SETTINGS.PROFILES.CONSENT_TITLE',
            descriptionKey: 'SETTINGS.PROFILES.CONSENT_BODY',
            keywords: ['profiles', 'sync', 'favorites', 'history', 'separate'],
            requires: ['profiles'],
        },
    ];
