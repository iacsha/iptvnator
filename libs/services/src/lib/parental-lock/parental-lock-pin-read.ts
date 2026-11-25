import type { WritableSignal } from '@angular/core';

/**
 * Applies a PIN read to the service's signals. A failed read (`null`) is not
 * an absent PIN: the session stays locked, because `enabled` treats an
 * unreadable PIN as set.
 */
export function applyParentalLockPinRead(
    read: { hash: string | null } | null,
    pinHash: WritableSignal<string | null>,
    pinUnreadable: WritableSignal<boolean>
): void {
    if (read === null) {
        console.error('The parental lock PIN could not be read.');
        pinUnreadable.set(true);
        return;
    }
    pinHash.set(read.hash);
    pinUnreadable.set(false);
}
