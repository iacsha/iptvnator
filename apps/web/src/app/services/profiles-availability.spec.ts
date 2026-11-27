import { TestBed } from '@angular/core/testing';
import { ParentalLockService } from '@iptvnator/services';
import { prepareSourceConnection } from '@iptvnator/services/source-sync/connection';
import { fakeRuntime } from '../profiles/profiles.stub';
import { profilesAvailabilityFactory } from './profiles-availability';
import { PROFILES_REQUEST } from './profiles-request.token';
import { ProfilesRuntime } from './profiles-runtime';

async function connect(instanceId: string | null): Promise<void> {
    localStorage.clear();
    if (instanceId)
        localStorage.setItem(
            'iptvnator:source-server',
            JSON.stringify({ apiUrl: 'https://nas.example/api', instanceId })
        );
    await prepareSourceConnection();
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('profilesAvailabilityFactory', () => {
    it('is unsupported without touching the network without a connected server', async () => {
        await connect(null);
        const request = jest.fn();
        const fake = fakeRuntime();
        TestBed.configureTestingModule({
            providers: [
                { provide: PROFILES_REQUEST, useValue: request },
                { provide: ProfilesRuntime, useValue: fake.runtime },
            ],
        });
        const available = TestBed.runInInjectionContext(
            profilesAvailabilityFactory
        );
        await settle();
        TestBed.tick();
        expect(available()).toBe('unsupported');
        expect(request).not.toHaveBeenCalled();
        expect(fake.runtime.refresh).not.toHaveBeenCalled();
    });

    it('tells unsupported, off and on apart for a connected server', async () => {
        await connect('synthetic-nas');
        const fake = fakeRuntime();
        fake.runtime.capable.set(false);
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: ParentalLockService,
                    useValue: { setForced: jest.fn() },
                },
                { provide: ProfilesRuntime, useValue: fake.runtime },
            ],
        });
        const available = TestBed.runInInjectionContext(
            profilesAvailabilityFactory
        );
        fake.runtime.state.set('checking');
        await settle();
        TestBed.tick();
        // Not answered yet: a direct visit to the section waits.
        expect(available()).toBe('on');
        fake.runtime.state.set('unsupported');
        TestBed.tick();
        expect(available()).toBe('unsupported');
        fake.runtime.capable.set(true);
        fake.runtime.state.set('ready');
        TestBed.tick();
        expect(available()).toBe('on');
        fake.list.update((list) => list && { ...list, enabled: false });
        TestBed.tick();
        expect(available()).toBe('off');
        fake.list.update((list) => list && { ...list, enabled: true });
        TestBed.tick();
        expect(available()).toBe('on');
    });
});
