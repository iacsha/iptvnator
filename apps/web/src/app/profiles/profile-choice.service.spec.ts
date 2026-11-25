import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ParentalLockService } from '@iptvnator/services';
import { ProfileSwitchService } from '../services/profile-switch.service';
import { ProfilesRuntime } from '../services/profiles-runtime';
import { ProfileChoiceService } from './profile-choice.service';
import {
    ADULT_ID,
    fakeRuntime,
    KIDS_ID,
    ok,
    PIN_ID,
    syntheticProfile,
} from './profiles.stub';

function setup(
    options: { hasPin?: boolean; leave?: boolean; forced?: boolean } = {}
) {
    const fake = fakeRuntime();
    const confirmPin = jest.fn(async () => options.leave ?? true);
    const setupPin = jest.fn(async () => true);
    const apply = jest.fn(async (_scope: string) => undefined);
    const open = jest.fn();
    TestBed.configureTestingModule({
        providers: [
            { provide: ProfilesRuntime, useValue: fake.runtime },
            { provide: MatDialog, useValue: { open } },
            {
                provide: ParentalLockService,
                useValue: {
                    confirmPin,
                    initialize: async () => undefined,
                    hasPin: () => options.hasPin ?? true,
                    forced: () => options.forced ?? false,
                    setupPin,
                },
            },
            { provide: ProfileSwitchService, useValue: { apply } },
        ],
    });
    const profile = (id: string) =>
        fake.list()!.profiles.find((candidate) => candidate.id === id)!;
    return {
        fake,
        confirmPin,
        setupPin,
        apply,
        open,
        profile,
        service: TestBed.inject(ProfileChoiceService),
    };
}

describe('ProfileChoiceService', () => {
    it('selects a plain profile and finishes the switch before it resolves', async () => {
        const { service, fake, apply, profile } = setup();
        await expect(service.choose(profile(ADULT_ID))).resolves.toBe(
            'selected'
        );
        expect(fake.runtime.select).toHaveBeenCalledWith(ADULT_ID);
        expect(apply).toHaveBeenCalledWith('shared');
    });

    it('blocks a kids profile on a device without a parental PIN and never sets one up', async () => {
        const { service, fake, setupPin, apply, profile } = setup({
            hasPin: false,
        });
        await expect(service.choose(profile(KIDS_ID))).resolves.toBe(
            'needs-parental-pin'
        );
        expect(setupPin).not.toHaveBeenCalled();
        expect(fake.runtime.select).not.toHaveBeenCalled();
        expect(apply).not.toHaveBeenCalled();
    });

    it('enters a kids profile when a parental PIN exists', async () => {
        const { service, profile, fake } = setup({ hasPin: true });
        await expect(service.choose(profile(KIDS_ID))).resolves.toBe(
            'selected'
        );
        expect(fake.runtime.select).toHaveBeenCalledWith(KIDS_ID);
    });

    it('asks the parental PIN to leave a kids profile, and stays when it is refused', async () => {
        const { service, fake, confirmPin, profile } = setup({ leave: false });
        fake.activeId.set(KIDS_ID);
        await expect(service.choose(profile(ADULT_ID))).resolves.toBe(
            'cancelled'
        );
        expect(confirmPin).toHaveBeenCalledTimes(1);
        expect(fake.runtime.select).not.toHaveBeenCalled();
    });

    it('asks the parental PIN to leave the Default a slow start held while the lock is forced', async () => {
        const { service, confirmPin, fake, profile } = setup({
            forced: true,
            leave: false,
        });
        await expect(service.choose(profile(ADULT_ID))).resolves.toBe(
            'cancelled'
        );
        expect(confirmPin).toHaveBeenCalledTimes(1);
        expect(fake.runtime.select).not.toHaveBeenCalled();

        confirmPin.mockResolvedValueOnce(true);
        await expect(service.choose(profile(ADULT_ID))).resolves.toBe(
            'selected'
        );
    });

    it('does not ask to stay on the kids profile it is on', async () => {
        const { service, fake, confirmPin, profile } = setup();
        fake.activeId.set(KIDS_ID);
        await service.choose(profile(KIDS_ID));
        expect(confirmPin).not.toHaveBeenCalled();
    });

    it('asks a PIN profile for its PIN through the server', async () => {
        const { service, fake, open, profile } = setup();
        fake.client.unlock.mockResolvedValue(ok(undefined));
        open.mockImplementation(
            (
                _c: unknown,
                config: { data: { submit: (p: string) => Promise<unknown> } }
            ) => ({
                afterClosed: () => of(true),
                config,
            })
        );
        await expect(service.choose(profile(PIN_ID))).resolves.toBe('selected');
        expect(open).toHaveBeenCalled();
    });

    it('stays put when the PIN prompt is closed', async () => {
        const { service, fake, open, profile } = setup();
        open.mockReturnValue({ afterClosed: () => of(undefined) });
        await expect(service.choose(profile(PIN_ID))).resolves.toBe(
            'cancelled'
        );
        expect(fake.runtime.select).not.toHaveBeenCalled();
    });

    it('reports a profile that is gone', async () => {
        const { service, fake } = setup();
        fake.runtime.select.mockReturnValueOnce(false);
        await expect(
            service.choose(syntheticProfile(ADULT_ID, 1))
        ).resolves.toBe('unavailable');
    });

    it('runs one choice at a time', async () => {
        const { service, apply, profile } = setup();
        let release!: () => void;
        apply.mockImplementationOnce(
            () =>
                new Promise<undefined>(
                    (resolve) => (release = () => resolve(undefined))
                )
        );
        const first = service.choose(profile(ADULT_ID));
        await new Promise((resolve) => setTimeout(resolve, 5));
        await expect(service.choose(profile(PIN_ID))).resolves.toBe(
            'cancelled'
        );
        release();
        await expect(first).resolves.toBe('selected');
    });
});
