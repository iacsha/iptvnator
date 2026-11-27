import { Injectable, effect, inject } from '@angular/core';
import { ParentalLockService } from '@iptvnator/services';
import { sourceConnection } from '@iptvnator/services/source-sync/connection';
import { readKidsLast, writeKidsLast } from './profiles-preferences';
import { ProfilesRuntime } from './profiles-runtime';

/**
 * Holds the parental lock on while a kids profile is active, and while this
 * device cannot yet tell who is watching.
 *
 * The device remembers that its last profile was a kids profile
 * (`readKidsLast`), so a slow or offline server, or start-up giving up and
 * holding Default, never opens the library to a child: the lock stays forced
 * until the runtime answers, and for the rest of a session held on Default.
 * A device with no local parental PIN never forces the lock from the
 * remembered flag: a kids profile saved on another device must not trap it.
 * The forced state lives in memory only. The remembered flag is a per-device
 * `localStorage` key and never syncs.
 */
@Injectable({ providedIn: 'root' })
export class ProfilesKidsLock {
    private readonly runtime = inject(ProfilesRuntime);
    private readonly lock = inject(ParentalLockService);
    /** The kids profile this device is in, to lock again when it moves to another. */
    private kidsId: string | null = null;

    constructor() {
        effect(() => this.apply());
    }

    private apply(): void {
        const instanceId = sourceConnection()?.instanceId;
        // Everything read here is a signal, so a change of profile, answer or
        // hold runs this again.
        const state = this.runtime.state();
        const held = this.runtime.held();
        const kids =
            this.runtime.enabled() && this.runtime.active()?.kids === true;
        // A parent's PIN for one kids profile does not carry into the next.
        const kidsId = kids ? (this.runtime.active()?.id ?? null) : null;
        if (kidsId && this.kidsId && kidsId !== this.kidsId) this.lock.lock();
        this.kidsId = kidsId;
        if (!instanceId) {
            this.lock.setForced(false);
            return;
        }
        // Only a verified answer from this server is final; offline, a slow
        // check and a start-up held on Default are not.
        const answered =
            (state === 'ready' || state === 'unsupported') && !held;
        if (answered) writeKidsLast(instanceId, kids);
        // Not knowing yet whether a PIN exists keeps the lock forced; once it
        // is known, a device without one is never locked: nobody could unlock.
        const pin = this.runtime.localPin();
        const remembered =
            !answered &&
            readKidsLast(instanceId) &&
            (pin === 'unknown' || pin === 'set');
        this.lock.setForced(kids || remembered);
    }
}
