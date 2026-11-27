import { TestBed } from '@angular/core/testing';
import { ParentalLockService } from '@iptvnator/services';
import { prepareSourceConnection } from '@iptvnator/services/source-sync/connection';
import {
    ADULT_ID,
    fakeRuntime,
    KIDS_ID,
    syntheticProfile,
} from '../profiles/profiles.stub';
import { ProfilesKidsLock } from './profiles-kids-lock';
import { readKidsLast, writeKidsLast } from './profiles-preferences';
import { ProfilesRuntime } from './profiles-runtime';

const NAS = 'synthetic-nas';

async function setup(connected = true) {
    localStorage.clear();
    if (connected)
        localStorage.setItem(
            'iptvnator:source-server',
            JSON.stringify({
                apiUrl: 'https://nas.example/api',
                instanceId: NAS,
            })
        );
    await prepareSourceConnection();
    const fake = fakeRuntime();
    const setForced = jest.fn();
    const lock = jest.fn();
    TestBed.configureTestingModule({
        providers: [
            { provide: ProfilesRuntime, useValue: fake.runtime },
            { provide: ParentalLockService, useValue: { setForced, lock } },
        ],
    });
    TestBed.inject(ProfilesKidsLock);
    const settle = () => TestBed.tick();
    return { fake, setForced, lock, settle };
}

describe('ProfilesKidsLock', () => {
    afterEach(async () => {
        localStorage.clear();
        await prepareSourceConnection();
    });

    it('forces the lock while a kids profile is active and remembers it for the next start', async () => {
        const { fake, setForced, settle } = await setup();
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
        expect(readKidsLast(NAS)).toBe(false);

        fake.activeId.set(KIDS_ID);
        settle();
        expect(setForced).toHaveBeenLastCalledWith(true);
        expect(readKidsLast(NAS)).toBe(true);

        fake.activeId.set(ADULT_ID);
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
        expect(readKidsLast(NAS)).toBe(false);
    });

    it('locks the session again when one kids profile gives way to another', async () => {
        const { fake, lock, settle } = await setup();
        const SECOND = '44444444-4444-4444-8444-444444444444';
        fake.list.update(
            (list) =>
                list && {
                    ...list,
                    profiles: [
                        ...list.profiles,
                        syntheticProfile(SECOND, 4, { kids: true }),
                    ],
                }
        );
        fake.activeId.set(KIDS_ID);
        settle();
        expect(lock).not.toHaveBeenCalled();
        fake.activeId.set(SECOND);
        settle();
        expect(lock).toHaveBeenCalledTimes(1);
        // Staying on the same kids profile asks for nothing more.
        fake.list.update((list) => list && { ...list });
        settle();
        expect(lock).toHaveBeenCalledTimes(1);
    });

    it('keeps the lock forced until the runtime answers when the last profile was kids', async () => {
        const { fake, setForced, settle } = await setup();
        writeKidsLast(NAS, true);
        fake.state.set('checking');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(true);

        fake.state.set('offline');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(true);
        expect(readKidsLast(NAS)).toBe(true);

        // The answer: Default is active.
        fake.state.set('ready');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
        expect(readKidsLast(NAS)).toBe(false);
    });

    it('keeps the lock forced when start-up held Default after a slow answer', async () => {
        const { fake, setForced, settle } = await setup();
        writeKidsLast(NAS, true);
        fake.runtime.held.set(true);
        fake.state.set('ready');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(true);
        expect(readKidsLast(NAS)).toBe(true);

        // A choice in the picker or the switcher ends the hold.
        fake.runtime.held.set(false);
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
    });

    it('does not force the lock from the remembered flag when this device has no PIN', async () => {
        const { fake, setForced, settle } = await setup();
        writeKidsLast(NAS, true);
        fake.runtime.localPin.set('unknown');
        fake.state.set('offline');
        settle();
        // Not knowing yet: stay locked.
        expect(setForced).toHaveBeenLastCalledWith(true);
        fake.runtime.localPin.set('none');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
        fake.runtime.localPin.set('unreadable');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
        // With a PIN the remembered lock holds again.
        fake.runtime.localPin.set('set');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(true);
    });

    it('lets a server without profiles forget the flag', async () => {
        const { fake, setForced, settle } = await setup();
        writeKidsLast(NAS, true);
        fake.state.set('unsupported');
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
        expect(readKidsLast(NAS)).toBe(false);
    });

    it('does not force anything without a connected server', async () => {
        const { setForced, settle } = await setup(false);
        settle();
        expect(setForced).toHaveBeenLastCalledWith(false);
    });
});
