import { TestBed } from '@angular/core/testing';
import { ParentalLockService } from '@iptvnator/services';
import { prepareSourceConnection } from '@iptvnator/services/source-sync/connection';
import { ADULT_ID, fakeRuntime, KIDS_ID } from '../profiles/profiles.stub';
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
    TestBed.configureTestingModule({
        providers: [
            { provide: ProfilesRuntime, useValue: fake.runtime },
            { provide: ParentalLockService, useValue: { setForced } },
        ],
    });
    TestBed.inject(ProfilesKidsLock);
    const settle = () => TestBed.tick();
    return { fake, setForced, settle };
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
