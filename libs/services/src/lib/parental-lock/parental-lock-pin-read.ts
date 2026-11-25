import type { WritableSignal } from '@angular/core';
import { hashParentalLockPin } from '@iptvnator/shared/interfaces';
import type { ParentalLockStorageService } from './parental-lock-storage';

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

/** Hashes and writes a new PIN, then publishes it. False when it could not be stored. */
export async function storeParentalLockPin(
    storage: Pick<ParentalLockStorageService, 'writePinHash'>,
    pin: string,
    pinHash: WritableSignal<string | null>,
    pinUnreadable: WritableSignal<boolean>
): Promise<boolean> {
    try {
        const hash = await hashParentalLockPin(pin);
        if (!(await storage.writePinHash(hash))) {
            return false;
        }
        pinHash.set(hash);
        pinUnreadable.set(false);
        return true;
    } catch (error) {
        console.error('Failed to store the parental lock PIN.', error);
        return false;
    }
}
