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
 * The forced state lives in memory only. The remembered flag is a per-device
 * `localStorage` key and never syncs.
 */
@Injectable({ providedIn: 'root' })
export class ProfilesKidsLock {
    private readonly runtime = inject(ProfilesRuntime);
    private readonly lock = inject(ParentalLockService);

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
        if (!instanceId) {
            this.lock.setForced(false);
            return;
        }
        // Only a verified answer from this server is final; offline, a slow
        // check and a start-up held on Default are not.
        const answered =
            (state === 'ready' || state === 'unsupported') && !held;
        if (answered) writeKidsLast(instanceId, kids);
        this.lock.setForced(kids || (!answered && readKidsLast(instanceId)));
    }
}
