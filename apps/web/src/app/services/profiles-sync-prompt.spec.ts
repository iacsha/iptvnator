import { TestBed } from '@angular/core/testing';
import { NotificationService } from '@iptvnator/services/notifications';
import { refuseProfileState } from '@iptvnator/services/profiles';
import { ProfileSeparationService } from './profiles-separation';
import { ProfilesSyncPrompt } from './profiles-sync-prompt';

describe('ProfilesSyncPrompt', () => {
    function setup(enabled = true) {
        const error = jest.fn();
        const success = jest.fn();
        const enableAll = jest.fn(async () => enabled);
        TestBed.configureTestingModule({
            providers: [
                { provide: NotificationService, useValue: { error, success } },
                { provide: ProfileSeparationService, useValue: { enableAll } },
            ],
        });
        TestBed.inject(ProfilesSyncPrompt);
        return { error, success, enableAll };
    }

    it('turns a refused write into a prompt, once for a burst', () => {
        const { error } = setup();
        refuseProfileState();
        refuseProfileState();
        expect(error).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(
            'PROFILES.SYNC_PROMPT.MESSAGE',
            undefined,
            expect.objectContaining({
                action: expect.objectContaining({
                    labelKey: 'PROFILES.SYNC_PROMPT.ACTION',
                }),
            })
        );
    });

    it('turns the syncs on only when the action is used, and says how it went', async () => {
        const { error, success, enableAll } = setup();
        refuseProfileState();
        expect(enableAll).not.toHaveBeenCalled();
        error.mock.calls[0][2].action.run();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(enableAll).toHaveBeenCalledTimes(1);
        expect(success).toHaveBeenCalledWith('PROFILES.SYNC_PROMPT.DONE');
    });

    it('says so when a sync could not be turned on', async () => {
        const { error, enableAll } = setup(false);
        refuseProfileState();
        error.mock.calls[0][2].action.run();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(enableAll).toHaveBeenCalled();
        expect(error).toHaveBeenLastCalledWith('PROFILES.SYNC_PROMPT.FAILED');
    });
});
