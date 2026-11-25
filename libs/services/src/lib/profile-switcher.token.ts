import { InjectionToken, type Signal } from '@angular/core';

/** One household profile as the rail's switcher draws it. */
export interface ProfileSwitcherEntry {
    readonly id: string;
    readonly name: string;
    /** The emoji, or the first letter of the name. */
    readonly glyph: string;
    readonly colour: string;
    /** Black or white, readable on `colour`. */
    readonly textColour: string;
}

/**
 * The household profile switcher of the workspace rail. The shell library
 * cannot import the app, which owns the profiles runtime, so the app provides
 * the real one. The default (none) keeps the switcher out of every other host.
 */
export interface ProfileSwitcher {
    /** Profiles are on and the connected server supports them. */
    readonly available: Signal<boolean>;
    readonly active: Signal<ProfileSwitcherEntry | null>;
    /** Every profile but the active one, in the household's order. */
    readonly others: Signal<readonly ProfileSwitcherEntry[]>;
    /** Switches this device to the profile, asking for any PIN first. */
    choose(id: string): Promise<void>;
    /** Opens Settings > Profiles. */
    manage(): void;
}

export const PROFILE_SWITCHER = new InjectionToken<ProfileSwitcher | null>(
    'PROFILE_SWITCHER',
    { providedIn: 'root', factory: () => null }
);
