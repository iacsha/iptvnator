import {
    DEFAULT_PERSONAL_SCOPE,
    type PersonalScope,
} from '@iptvnator/shared/interfaces/profiles';

let active: PersonalScope = DEFAULT_PERSONAL_SCOPE;

/** A profile's state has nowhere to live without its sync; it never falls back to the household's document. */
export class ProfileStateUnavailableError extends Error {
    constructor() {
        super('Profile state needs its sync turned on');
    }
}

const refusalListeners = new Set<() => void>();

/** Tells `listener` whenever a profile's state is refused for lack of its sync (the app turns it into a prompt). */
export function onProfileStateRefused(listener: () => void): () => void {
    refusalListeners.add(listener);
    return () => refusalListeners.delete(listener);
}

/** The error to throw when a write has nowhere to go, after telling the listeners. */
export function refuseProfileState(): ProfileStateUnavailableError {
    for (const listener of refusalListeners) {
        try {
            listener();
        } catch {
            // A broken prompt must not turn a refused write into a crash.
        }
    }
    return new ProfileStateUnavailableError();
}

/** Whose personal state this device reads and writes; `'shared'` until a profile is chosen. */
export const activePersonalScope = (): PersonalScope => active;
export const setActivePersonalScope = (scope: PersonalScope): void => {
    active = scope;
};
