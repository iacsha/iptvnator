import {
    DEFAULT_PROFILE_ID,
    type ServerProfile,
    type ServerProfileList,
} from '@iptvnator/shared/interfaces/profiles';

export interface ProfilesStartInput {
    readonly connected: boolean;
    readonly capable: boolean;
    readonly enabled: boolean;
    readonly startPref: 'ask' | 'last';
    readonly lastId: string | null;
    /** This device has a parental PIN; a kids profile is not restored without one. */
    readonly hasParentalPin?: boolean;
    readonly profiles: readonly (Pick<ServerProfile, 'id' | 'hasPin'> &
        Partial<Pick<ServerProfile, 'kids'>>)[];
}

export function needsPicker(input: ProfilesStartInput): boolean {
    if (
        !input.connected ||
        !input.capable ||
        !input.enabled ||
        // A lone Default needs no choice, unless its PIN must be asked.
        (input.profiles.length <= 1 && !input.profiles[0]?.hasPin)
    )
        return false;
    if (input.startPref === 'ask') return true;
    const last = input.profiles.find((profile) => profile.id === input.lastId);
    return (
        !last ||
        last.hasPin ||
        (last.kids === true && input.hasParentalPin !== true)
    );
}

export function resolveActiveProfileId(
    list: ServerProfileList | null,
    storedId: string | null
): string {
    if (
        !list?.enabled ||
        !storedId ||
        !list.profiles.some((profile) => profile.id === storedId)
    )
        return DEFAULT_PROFILE_ID;
    return storedId;
}
