import { TestBed } from '@angular/core/testing';
import {
    ActivatedRouteSnapshot,
    Router,
    RouterStateSnapshot,
    UrlTree,
    provideRouter,
} from '@angular/router';
import { prepareSourceConnection } from '@iptvnator/services/source-sync/connection';
import { DEFAULT_PROFILE_ID } from '@iptvnator/shared/interfaces/profiles';
import {
    writeActiveProfileId,
    writeProfilesStart,
} from '../services/profiles-preferences';
import { ProfilesRuntime } from '../services/profiles-runtime';
import {
    PROFILES_GUARD_TIMEOUT_MS,
    profilePickerGuard,
    profilePickerRouteGuard,
} from './profile-picker.guard';
import {
    markProfilePicked,
    resetProfilePickedForTests,
} from './profile-picker-route';
import { ParentalLockService } from '@iptvnator/services';
import { writeKidsLast } from '../services/profiles-preferences';
import {
    ADULT_ID,
    fakeRuntime,
    PIN_ID,
    syntheticProfile,
} from './profiles.stub';

const NAS = 'synthetic-nas';

async function connect(instanceId: string | null): Promise<void> {
    localStorage.clear();
    if (instanceId)
        localStorage.setItem(
            'iptvnator:source-server',
            JSON.stringify({ apiUrl: 'https://nas.example/api', instanceId })
        );
    await prepareSourceConnection();
}
const setForced = jest.fn();
function setup(fake = fakeRuntime()) {
    TestBed.configureTestingModule({
        providers: [
            provideRouter([]),
            { provide: ParentalLockService, useValue: { setForced } },
            { provide: ProfilesRuntime, useValue: fake.runtime },
        ],
    });
    const router = TestBed.inject(Router);
    const run = (url = '/workspace/dashboard') =>
        TestBed.runInInjectionContext(() =>
            profilePickerGuard(
                {} as ActivatedRouteSnapshot,
                { url } as RouterStateSnapshot
            )
        ) as Promise<boolean | UrlTree>;
    const target = (result: boolean | UrlTree) =>
        result instanceof UrlTree ? router.serializeUrl(result) : result;
    return { fake, run, target, router };
}

describe('profilePickerGuard', () => {
    beforeEach(async () => {
        setForced.mockClear();
        await connect(NAS);
        resetProfilePickedForTests();
    });
    afterEach(() => jest.useRealTimers());

    it('holds the parental lock on from the first moment when the last profile was kids', async () => {
        writeKidsLast(NAS, true);
        const { run, fake } = setup();
        fake.state.set('offline');
        await expect(run()).resolves.toBe(true);
        expect(setForced).toHaveBeenCalledWith(true);
        // Even when the picker was already answered this session.
        setForced.mockClear();
        markProfilePicked();
        await expect(run()).resolves.toBe(true);
        expect(setForced).toHaveBeenCalledWith(true);
    });

    it('leaves the lock alone when the last profile was not kids', async () => {
        const { run } = setup();
        await run();
        expect(setForced).not.toHaveBeenCalled();
    });

    it('does not block without a source server or after the picker was answered', async () => {
        const first = setup();
        await connect(null);
        await expect(first.run()).resolves.toBe(true);
        await connect(NAS);
        markProfilePicked();
        await expect(first.run()).resolves.toBe(true);
        expect(first.fake.runtime.refresh).not.toHaveBeenCalled();
    });

    it('routes to the picker with the return url when the device asks', async () => {
        const { run, target } = setup();
        expect(target(await run('/workspace/playlists/abc?x=1'))).toBe(
            '/profile-picker?returnUrl=%2Fworkspace%2Fplaylists%2Fabc%3Fx%3D1'
        );
    });

    it('sanitises a return url that is not an in-app path', async () => {
        const { run, target } = setup();
        expect(target(await run('//evil.test/path'))).toBe(
            '/profile-picker?returnUrl=%2Fworkspace'
        );
    });

    it('does not ask when the household has profiles off, or only the Default profile', async () => {
        const off = setup();
        off.fake.list.update((list) => ({ ...list!, enabled: false }));
        await expect(off.run()).resolves.toBe(true);
        TestBed.resetTestingModule();
        const single = setup(
            fakeRuntime([syntheticProfile(DEFAULT_PROFILE_ID, 0)])
        );
        await expect(single.run()).resolves.toBe(true);
    });

    it('uses the last profile when asked to, unless it is gone or has a PIN', async () => {
        writeProfilesStart(NAS, 'last');
        writeActiveProfileId(NAS, ADULT_ID);
        const valid = setup();
        await expect(valid.run()).resolves.toBe(true);
        TestBed.resetTestingModule();

        writeActiveProfileId(NAS, PIN_ID);
        const pin = setup();
        expect(pin.target(await pin.run())).toContain('/profile-picker');
        TestBed.resetTestingModule();

        localStorage.clear();
        writeProfilesStart(NAS, 'last');
        const none = setup();
        expect(none.target(await none.run())).toContain('/profile-picker');
    });

    it('does not block when the server is offline or the runtime is not capable', async () => {
        const offline = setup();
        offline.fake.state.set('offline');
        await expect(offline.run()).resolves.toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(offline.fake.runtime.holdDefault).toHaveBeenCalled();
        TestBed.resetTestingModule();
        const old = setup();
        old.fake.runtime.capable.set(false);
        await expect(old.run()).resolves.toBe(true);
    });

    it('does not block when the runtime fails to answer', async () => {
        const { run, fake } = setup();
        fake.runtime.refresh.mockRejectedValueOnce(new Error('synthetic'));
        await expect(run()).resolves.toBe(true);
    });

    it('does not wait for a slow server beyond the bound', async () => {
        jest.useFakeTimers();
        const { run, fake } = setup();
        fake.runtime.refresh.mockImplementation(
            () => new Promise(() => undefined)
        );
        const result = run();
        await jest.advanceTimersByTimeAsync(PROFILES_GUARD_TIMEOUT_MS + 1);
        await expect(result).resolves.toBe(true);
        await jest.advanceTimersByTimeAsync(0);
        // A late list must not switch to a saved profile without its PIN.
        expect(fake.runtime.holdDefault).toHaveBeenCalled();
    });

    it('does not build the runtime for a state other than ready', async () => {
        const { run, fake } = setup();
        fake.state.set('checking');
        await expect(run()).resolves.toBe(true);
    });
});

describe('profilePickerRouteGuard', () => {
    it('keeps /profile-picker closed without a connected server', async () => {
        await connect(null);
        TestBed.configureTestingModule({ providers: [provideRouter([])] });
        const result = TestBed.runInInjectionContext(() =>
            profilePickerRouteGuard(
                {} as ActivatedRouteSnapshot,
                {} as RouterStateSnapshot
            )
        );
        expect(result).toBeInstanceOf(UrlTree);
        expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
            '/workspace'
        );
    });

    it('opens it while a server is connected', async () => {
        await connect(NAS);
        TestBed.configureTestingModule({
            providers: [provideRouter([])],
        });
        expect(
            TestBed.runInInjectionContext(() =>
                profilePickerRouteGuard(
                    {} as ActivatedRouteSnapshot,
                    {} as RouterStateSnapshot
                )
            )
        ).toBe(true);
    });
});
