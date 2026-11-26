import { fileURLToPath } from 'node:url';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NotificationService } from '@iptvnator/services/notifications';
import { DEFAULT_PROFILE_ID } from '@iptvnator/shared/interfaces/profiles';
import { ProfileChoiceService } from '../profiles/profile-choice.service';
import { fakeRuntime, KIDS_ID } from '../profiles/profiles.stub';

const fake = fakeRuntime();

jest.unstable_mockModule('@iptvnator/services/source-sync/connection', () => ({
    sourceConnection: () => ({ url: 'https://server.test' }),
}));
jest.unstable_mockModule(
    fileURLToPath(new URL('./profiles-runtime.providers.ts', import.meta.url)),
    () => ({ loadProfilesRuntime: async () => fake.runtime })
);
const { profileSwitcherFactory } = await import('./profile-switcher');

describe('profileSwitcherFactory: kids profile without a parental PIN', () => {
    const navigate = jest.fn(async () => true);
    const error = jest.fn();
    const choose = jest.fn(async () => 'needs-parental-pin');

    async function build() {
        TestBed.configureTestingModule({
            providers: [
                { provide: Router, useValue: { navigate } },
                { provide: NotificationService, useValue: { error } },
                { provide: ProfileChoiceService, useValue: { choose } },
            ],
        });
        const switcher = runInInjectionContext(
            TestBed.inject(EnvironmentInjector),
            profileSwitcherFactory
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        return switcher;
    }

    beforeEach(() => {
        navigate.mockClear();
        error.mockClear();
        choose.mockClear();
    });

    it('keeps the message and offers a button to Settings > Parental lock', async () => {
        const switcher = await build();
        await switcher.choose(KIDS_ID);
        expect(error).toHaveBeenCalledTimes(1);
        const [key, , options] = error.mock.calls[0];
        expect(key).toBe('PROFILES.ERRORS.KIDS_NEEDS_PARENTAL_PIN');
        expect(options.action.labelKey).toBe(
            'PROFILES.PICKER.OPEN_PARENTAL_LOCK'
        );
        // The kid is not let in, and nothing opens until the button is used.
        expect(fake.runtime.select).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        options.action.run();
        expect(navigate).toHaveBeenCalledWith([
            '/workspace/settings',
            'parental',
        ]);
    });

    it('shows no Settings button for other refusals', async () => {
        choose.mockResolvedValueOnce('unavailable');
        const switcher = await build();
        await switcher.choose(DEFAULT_PROFILE_ID);
        expect(error).toHaveBeenCalledWith('PROFILES.ERRORS.GENERIC');
    });
});
