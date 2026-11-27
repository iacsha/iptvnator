import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { from, of } from 'rxjs';
import { ParentalLockService } from '@iptvnator/services';
import { prepareSourceConnection } from '@iptvnator/services/source-sync/connection';
import {
    DEFAULT_PROFILE_ID,
    PROFILE_LIMIT,
} from '@iptvnator/shared/interfaces/profiles';
import { DialogService } from '@iptvnator/ui/components/confirm-dialog';
import {
    ADULT_ID,
    fail,
    fakeRuntime,
    KIDS_ID,
    ok,
    PIN_ID,
    syntheticProfile,
} from '../profiles/profiles.stub';
import { ProfileSeparationService } from '../services/profiles-separation';
import { ProfilesRuntime } from '../services/profiles-runtime';
import { SettingsProfilesSectionComponent } from './settings-profiles-section.component';

const NAS = 'synthetic-nas';

async function setup(
    options: {
        profiles?: ReturnType<typeof syntheticProfile>[];
        parental?: boolean;
        hasPin?: boolean;
        unreadable?: boolean;
        forced?: boolean;
        setupPin?: boolean;
        syncs?: { activity: boolean; favorites: boolean; history: boolean };
    } = {}
) {
    localStorage.setItem(
        'iptvnator:source-server',
        JSON.stringify({ apiUrl: 'https://nas.example/api', instanceId: NAS })
    );
    await prepareSourceConnection();
    const fake = fakeRuntime(options.profiles);
    const dialogOpen = jest.fn();
    const confirmPin = jest.fn(async () => options.parental ?? true);
    const setupPin = jest.fn(async () => options.setupPin ?? true);
    const syncs = signal(
        options.syncs ?? { activity: true, favorites: true, history: true }
    );
    const enableAll = jest.fn(async () => {
        syncs.set({ activity: true, favorites: true, history: true });
        return true;
    });
    const separation = {
        parts: syncs,
        allOn: () => Object.values(syncs()).every(Boolean),
        busy: signal(false),
        load: jest.fn(async () => null),
        enableAll,
    };
    const openConfirmDialog = jest.fn(async (data: { onConfirm: () => void }) =>
        data.onConfirm()
    );
    TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), SettingsProfilesSectionComponent],
        providers: [
            { provide: ProfilesRuntime, useValue: fake.runtime },
            { provide: MatDialog, useValue: { open: dialogOpen } },
            {
                provide: ParentalLockService,
                useValue: {
                    confirmPin,
                    initialize: async () => undefined,
                    hasPin: () => options.hasPin ?? true,
                    pinState: async () =>
                        options.unreadable
                            ? 'unreadable'
                            : (options.hasPin ?? true)
                              ? 'set'
                              : 'none',
                    forced: () => options.forced ?? false,
                    setupPin,
                    setForced: jest.fn(),
                },
            },
            { provide: ProfileSeparationService, useValue: separation },
            { provide: DialogService, useValue: { openConfirmDialog } },
        ],
    });
    const fixture = TestBed.createComponent(SettingsProfilesSectionComponent);
    const settle = async () => {
        // The runtime arrives through a dynamic import.
        for (let turn = 0; turn < 3; turn++)
            await new Promise((resolve) => setTimeout(resolve, 0));
        await fixture.whenStable();
        fixture.detectChanges();
    };
    fixture.detectChanges();
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const q = (id: string) =>
        el.querySelector<HTMLElement>(`[data-test-id="${id}"]`);
    const click = async (id: string) => {
        q(id)!.click();
        await settle();
    };
    /** The next dialog the section opens closes with `result`. */
    const answerDialog = (result: unknown) =>
        dialogOpen.mockImplementationOnce(
            (
                _component: unknown,
                config: {
                    data: {
                        submit?: (form: unknown) => Promise<unknown>;
                    };
                }
            ) => ({
                // A profile form is submitted like the real dialog does.
                afterClosed: () =>
                    result && typeof result === 'object' && config.data.submit
                        ? from(
                              config.data
                                  .submit(result)
                                  .then((outcome) =>
                                      outcome === null ? true : undefined
                                  )
                          )
                        : of(result),
            })
        );
    return {
        fake,
        fixture,
        el,
        q,
        click,
        answerDialog,
        dialogOpen,
        confirmPin,
        openConfirmDialog,
        setupPin,
        enableAll,
        syncs,
    };
}

describe('SettingsProfilesSectionComponent', () => {
    beforeEach(() => localStorage.clear());

    it('lists profiles in order with kids and PIN badges, and no delete or reorder for Default', async () => {
        const { q, el } = await setup();
        const rows = Array.from(
            el.querySelectorAll('[data-test-id^="profile-row-"]')
        ).map((row) => row.getAttribute('data-test-id'));
        expect(rows).toEqual([
            `profile-row-${DEFAULT_PROFILE_ID}`,
            `profile-row-${ADULT_ID}`,
            `profile-row-${KIDS_ID}`,
            `profile-row-${PIN_ID}`,
        ]);
        expect(
            q(`profile-row-${KIDS_ID}`)!.querySelector(
                '[data-test-id="profile-badge-kids"]'
            )
        ).toBeTruthy();
        expect(
            q(`profile-row-${PIN_ID}`)!.querySelector(
                '[data-test-id="profile-badge-pin"]'
            )
        ).toBeTruthy();
        expect(q(`profile-delete-${DEFAULT_PROFILE_ID}`)).toBeNull();
        expect(q(`profile-move-up-${DEFAULT_PROFILE_ID}`)).toBeNull();
        expect(
            (q(`profile-move-up-${ADULT_ID}`) as HTMLButtonElement).disabled
        ).toBe(true);
        expect(
            (q(`profile-move-down-${PIN_ID}`) as HTMLButtonElement).disabled
        ).toBe(true);
    });

    it('renders the household switch and turns profiles on through the client', async () => {
        const { fake, q, fixture } = await setup();
        fake.client.setEnabled.mockResolvedValue(ok({}));
        expect(q('profiles-enabled')).toBeTruthy();
        await fixture.componentInstance.facade.setEnabled(false);
        expect(fake.client.setEnabled).toHaveBeenCalledWith(false);
        expect(fake.runtime.refresh).toHaveBeenCalled();
    });

    describe('the note on what is still shared', () => {
        const note = (q: (id: string) => HTMLElement | null) =>
            ['favorites', 'history', 'activity'].filter((id) =>
                q(`profiles-shared-note-${id}`)
            );

        it('lists every part when all syncs are off', async () => {
            const { q } = await setup({
                syncs: { activity: false, favorites: false, history: false },
            });
            expect(note(q)).toEqual(['favorites', 'history', 'activity']);
            expect(q('profiles-shared-note-favorites')?.textContent).toContain(
                'SETTINGS.PROFILES.SHARED_NOTE_FAVORITES'
            );
        });

        it('lists only the parts whose sync is off', async () => {
            const { q } = await setup({
                syncs: { activity: true, favorites: false, history: true },
            });
            expect(note(q)).toEqual(['favorites']);
        });

        it('is gone when all syncs are on', async () => {
            const { q } = await setup();
            expect(q('profiles-shared-note')).toBeNull();
            expect(note(q)).toEqual([]);
        });
    });

    it('offers only the switch while profiles are off', async () => {
        const { fake, fixture, q } = await setup();
        expect(q('profiles-start-ask')).toBeTruthy();
        fake.list.update((list) => list && { ...list, enabled: false });
        fixture.detectChanges();
        expect(q('profiles-enabled')).toBeTruthy();
        expect(q('profiles-start-ask')).toBeNull();
        expect(q('profiles-consent-offer')).toBeNull();
    });

    it('stores the start-up choice per server instance and device', async () => {
        const { click } = await setup();
        await click('profiles-start-last');
        expect(
            localStorage.getItem(`iptvnator-server:${NAS}:profiles-start-v1`)
        ).toBe('last');
        await click('profiles-start-ask');
        expect(
            localStorage.getItem(`iptvnator-server:${NAS}:profiles-start-v1`)
        ).toBe('ask');
    });

    it('adds a profile with the form values and refreshes the runtime', async () => {
        const { fake, click, answerDialog } = await setup();
        fake.client.create.mockResolvedValue(ok({}));
        answerDialog({
            name: 'New one',
            colour: '#14b8a6',
            emoji: '🦊',
            kids: true,
            pin: null,
        });
        await click('profile-add');
        expect(fake.client.create).toHaveBeenCalledWith({
            name: 'New one',
            colour: '#14b8a6',
            emoji: '🦊',
            kids: true,
        });
        expect(fake.runtime.refresh).toHaveBeenCalled();
    });

    describe('turning profiles off', () => {
        it('asks the parental PIN while the kids lock is forced, and stays on when it is refused', async () => {
            const { fake, fixture, confirmPin } = await setup({
                forced: true,
                parental: false,
            });
            fake.client.setEnabled.mockResolvedValue(ok({}));
            await fixture.componentInstance.facade.setEnabled(false);
            expect(confirmPin).toHaveBeenCalledTimes(1);
            expect(fake.client.setEnabled).not.toHaveBeenCalled();
        });

        it('turns them off once the parental PIN is accepted, and without a prompt when no lock is forced', async () => {
            const forced = await setup({ forced: true, parental: true });
            forced.fake.client.setEnabled.mockResolvedValue(ok({}));
            await forced.fixture.componentInstance.facade.setEnabled(false);
            expect(forced.fake.client.setEnabled).toHaveBeenCalledWith(false);
            TestBed.resetTestingModule();

            const plain = await setup();
            plain.fake.client.setEnabled.mockResolvedValue(ok({}));
            await plain.fixture.componentInstance.facade.setEnabled(false);
            expect(plain.confirmPin).not.toHaveBeenCalled();
            expect(plain.fake.client.setEnabled).toHaveBeenCalledWith(false);
        });
    });

    describe('the parental PIN of a kids profile', () => {
        const kidsForm = {
            name: 'Kai',
            colour: '#14b8a6',
            emoji: null,
            kids: true,
            pin: null,
        };

        it('is set up when the first kids profile is created, and cancel aborts the create', async () => {
            const { fake, click, answerDialog, setupPin } = await setup({
                hasPin: false,
                setupPin: false,
            });
            answerDialog(kidsForm);
            await click('profile-add');
            expect(setupPin).toHaveBeenCalledTimes(1);
            expect(fake.client.create).not.toHaveBeenCalled();
        });

        it('is set up before the create is sent', async () => {
            const { fake, click, answerDialog, setupPin } = await setup({
                hasPin: false,
            });
            fake.client.create.mockResolvedValue(ok({}));
            answerDialog(kidsForm);
            await click('profile-add');
            expect(setupPin).toHaveBeenCalledTimes(1);
            expect(fake.client.create).toHaveBeenCalled();
        });

        it('never replaces a PIN that only failed to read', async () => {
            const { fake, click, answerDialog, setupPin, q } = await setup({
                unreadable: true,
            });
            answerDialog(kidsForm);
            await click('profile-add');
            expect(setupPin).not.toHaveBeenCalled();
            expect(fake.client.create).not.toHaveBeenCalled();
            expect(q('profiles-error')?.textContent).toContain(
                'PROFILES.ERRORS.PARENTAL_PIN_UNREADABLE'
            );
        });

        it('is not asked for again when a PIN exists, nor for an adult profile', async () => {
            const { fake, click, answerDialog, setupPin } = await setup({
                hasPin: true,
            });
            fake.client.create.mockResolvedValue(ok({}));
            answerDialog(kidsForm);
            await click('profile-add');
            answerDialog({ ...kidsForm, kids: false, name: 'Ana' });
            await click('profile-add');
            expect(setupPin).not.toHaveBeenCalled();
        });

        it('is set up when a profile is edited to kids, and cancel aborts the edit', async () => {
            const { fake, click, answerDialog, setupPin } = await setup({
                hasPin: false,
                setupPin: false,
            });
            answerDialog({
                name: 'Synthetic 1',
                colour: '#3b82f6',
                emoji: null,
                kids: true,
                pin: undefined,
            });
            await click(`profile-edit-${ADULT_ID}`);
            expect(setupPin).toHaveBeenCalledTimes(1);
            expect(fake.client.update).not.toHaveBeenCalled();
        });
    });

    describe('what is separate per profile', () => {
        it('lists each part with its state given the consent', async () => {
            const { q } = await setup({
                syncs: { activity: true, favorites: false, history: true },
            });
            expect(q('profiles-part-favorites')!.dataset['separate']).toBe(
                'false'
            );
            expect(q('profiles-part-history')!.dataset['separate']).toBe(
                'true'
            );
            expect(q('profiles-part-activity')!.dataset['separate']).toBe(
                'true'
            );
        });

        it('offers one button to turn the syncs on, never without a click', async () => {
            const { q, click, enableAll, syncs } = await setup({
                syncs: { activity: false, favorites: false, history: true },
            });
            expect(q('profiles-consent-offer')).toBeTruthy();
            expect(enableAll).not.toHaveBeenCalled();
            await click('profiles-consent-accept');
            expect(enableAll).toHaveBeenCalledTimes(1);
            expect(syncs()).toEqual({
                activity: true,
                favorites: true,
                history: true,
            });
            expect(q('profiles-consent-offer')).toBeNull();
        });

        it('lets the user skip the offer and says so when a sync cannot be turned on', async () => {
            const { q, click, enableAll } = await setup({
                syncs: { activity: false, favorites: false, history: false },
            });
            await click('profiles-consent-skip');
            expect(q('profiles-consent-offer')).toBeNull();
            expect(enableAll).not.toHaveBeenCalled();
        });

        it('reports a sync that stays off', async () => {
            const { q, click, enableAll } = await setup({
                syncs: { activity: false, favorites: true, history: true },
            });
            enableAll.mockResolvedValueOnce(false);
            await click('profiles-consent-accept');
            expect(q('profiles-consent-failed')).toBeTruthy();
        });

        it('shows no offer when every sync is on', async () => {
            const { q } = await setup();
            expect(q('profiles-consent-offer')).toBeNull();
        });
    });

    it('sends a PIN only for an adult profile that set one', async () => {
        const { fake, click, answerDialog } = await setup();
        fake.client.create.mockResolvedValue(ok({}));
        answerDialog({
            name: 'Pin',
            colour: '#22c55e',
            emoji: null,
            kids: false,
            pin: '2468',
        });
        await click('profile-add');
        expect(fake.client.create).toHaveBeenCalledWith({
            name: 'Pin',
            colour: '#22c55e',
            pin: '2468',
        });
    });

    it('disables add at the profile limit', async () => {
        const many = Array.from({ length: PROFILE_LIMIT }, (_, index) =>
            syntheticProfile(
                index === 0
                    ? DEFAULT_PROFILE_ID
                    : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                index
            )
        );
        const { q } = await setup({ profiles: many });
        expect((q('profile-add') as HTMLButtonElement).disabled).toBe(true);
        expect(q('profiles-limit')).toBeTruthy();
    });

    it('sends only the changed fields when editing, and nothing when nothing changed', async () => {
        const { fake, click, answerDialog } = await setup();
        fake.client.update.mockResolvedValue(ok({}));
        answerDialog({
            name: 'Renamed',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: undefined,
        });
        await click(`profile-edit-${ADULT_ID}`);
        expect(fake.client.update).toHaveBeenCalledWith(ADULT_ID, {
            name: 'Renamed',
        });

        fake.client.update.mockClear();
        answerDialog({
            name: 'Synthetic 1',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: undefined,
        });
        await click(`profile-edit-${ADULT_ID}`);
        expect(fake.client.update).not.toHaveBeenCalled();
    });

    it('asks for the current PIN to change a PIN, sends it with the update and never shows it', async () => {
        const { fake, click, answerDialog, dialogOpen, el } = await setup();
        fake.client.update.mockResolvedValue(ok({}));
        answerDialog({
            name: 'Synthetic 3',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: '9999',
        });
        dialogOpen.mockReturnValueOnce({ afterClosed: () => of(true) });
        await click(`profile-edit-${PIN_ID}`);
        const pinDialog = dialogOpen.mock.calls[1][1].data;
        await pinDialog.submit('1234');
        expect(fake.client.update).toHaveBeenCalledWith(PIN_ID, {
            pin: '9999',
            currentPin: '1234',
        });
        expect(el.textContent).not.toContain('1234');
    });

    it('asks for the current PIN when another device set one since the list loaded', async () => {
        const { fake, click, answerDialog, dialogOpen } = await setup();
        fake.client.update
            .mockResolvedValueOnce(fail({ code: 'pin_required' }))
            .mockResolvedValue(ok({}));
        answerDialog({
            name: 'Renamed',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: undefined,
        });
        dialogOpen.mockReturnValueOnce({ afterClosed: () => of(true) });
        await click(`profile-edit-${ADULT_ID}`);
        expect(fake.client.update).toHaveBeenCalledTimes(1);
        const pinDialog = dialogOpen.mock.calls[1][1].data;
        await pinDialog.submit('1234');
        expect(fake.client.update).toHaveBeenLastCalledWith(ADULT_ID, {
            name: 'Renamed',
            currentPin: '1234',
        });
        expect(fake.runtime.handleProfileError).not.toHaveBeenCalled();
    });

    it('waits out a refresh already in flight before it asks afresh', async () => {
        const { fake, click, answerDialog } = await setup();
        fake.client.update.mockResolvedValue(ok({}));
        const order: string[] = [];
        fake.runtime.idle.mockImplementation(async () => {
            order.push('idle');
        });
        fake.runtime.refresh.mockImplementation(async () => {
            order.push('refresh');
        });
        answerDialog({
            name: 'Renamed',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: undefined,
        });
        await click(`profile-edit-${ADULT_ID}`);
        expect(order.slice(-2)).toEqual(['idle', 'refresh']);
    });

    it('asks for the parental PIN before clearing kids, and stops when it is refused', async () => {
        const { fake, click, answerDialog, confirmPin } = await setup({
            parental: false,
        });
        answerDialog({
            name: 'Synthetic 2',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: undefined,
        });
        await click(`profile-edit-${KIDS_ID}`);
        expect(confirmPin).toHaveBeenCalledTimes(1);
        expect(fake.client.update).not.toHaveBeenCalled();
    });

    it('clears kids once the parental PIN is accepted', async () => {
        const { fake, click, answerDialog, confirmPin } = await setup();
        fake.client.update.mockResolvedValue(ok({}));
        answerDialog({
            name: 'Synthetic 2',
            colour: '#3b82f6',
            emoji: null,
            kids: false,
            pin: undefined,
        });
        await click(`profile-edit-${KIDS_ID}`);
        expect(confirmPin).toHaveBeenCalled();
        expect(fake.client.update).toHaveBeenCalledWith(KIDS_ID, {
            kids: false,
        });
    });

    it('deletes a plain profile after a confirmation', async () => {
        const { fake, click, openConfirmDialog } = await setup();
        fake.client.remove.mockResolvedValue(ok(undefined));
        await click(`profile-delete-${ADULT_ID}`);
        expect(openConfirmDialog).toHaveBeenCalledTimes(1);
        expect(fake.client.remove).toHaveBeenCalledWith(ADULT_ID);
    });

    it('asks the PIN of a PIN profile and deletes with it', async () => {
        const { fake, click, dialogOpen } = await setup();
        fake.client.remove.mockResolvedValue(ok(undefined));
        dialogOpen.mockReturnValueOnce({ afterClosed: () => of(true) });
        await click(`profile-delete-${PIN_ID}`);
        await dialogOpen.mock.calls[0][1].data.submit('1234');
        expect(fake.client.remove).toHaveBeenCalledWith(PIN_ID, '1234');
    });

    it('asks the parental PIN before deleting a kids profile and aborts when refused', async () => {
        const { fake, click, confirmPin, openConfirmDialog } = await setup({
            parental: false,
        });
        await click(`profile-delete-${KIDS_ID}`);
        expect(confirmPin).toHaveBeenCalled();
        expect(openConfirmDialog).not.toHaveBeenCalled();
        expect(fake.client.remove).not.toHaveBeenCalled();
    });

    it('reorders with every id once, Default first', async () => {
        const { fake, click } = await setup();
        fake.client.reorder.mockResolvedValue(ok({}));
        await click(`profile-move-up-${KIDS_ID}`);
        expect(fake.client.reorder).toHaveBeenCalledWith([
            DEFAULT_PROFILE_ID,
            KIDS_ID,
            ADULT_ID,
            PIN_ID,
        ]);
    });

    it.each([
        [{ code: 'profile_name_taken' as const }],
        [{ code: 'profile_limit' as const }],
        [{ code: 'offline' as const }],
        [{ code: 'default_profile' as const }],
    ])(
        'keeps the form open and returns %p when the save fails',
        async (error) => {
            const { fake, click, dialogOpen } = await setup();
            fake.client.create.mockResolvedValue(fail(error));
            dialogOpen.mockReturnValueOnce({
                afterClosed: () => of(undefined),
            });
            await click('profile-add');
            const submit = dialogOpen.mock.calls[0][1].data.submit;
            await expect(
                submit({
                    name: 'X',
                    colour: '#3b82f6',
                    emoji: null,
                    kids: false,
                    pin: undefined,
                })
            ).resolves.toEqual(error);
            expect(fake.runtime.handleProfileError).toHaveBeenCalledWith(
                error.code,
                undefined
            );
        }
    );

    it('shows an offline state with retry when the list never loaded', async () => {
        const { fake, fixture, el } = await setup();
        fake.list.set(null);
        fake.state.set('offline');
        fixture.detectChanges();
        expect(
            el.querySelector('app-state-view[variant="offline"]')
        ).toBeTruthy();
    });

    it('moves through the start-up options with the arrow keys', async () => {
        localStorage.setItem(
            `iptvnator-server:${NAS}:profiles-start-v1`,
            'ask'
        );
        const { q, fixture } = await setup();
        const ask = q('profiles-start-ask')!;
        const last = q('profiles-start-last')!;
        expect(ask.tabIndex).toBe(0);
        expect(last.tabIndex).toBe(-1);
        ask.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowRight',
                cancelable: true,
            })
        );
        fixture.detectChanges();
        expect(last.getAttribute('aria-checked')).toBe('true');
        expect(last.tabIndex).toBe(0);
        expect(document.activeElement).toBe(last);
        last.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true })
        );
        fixture.detectChanges();
        expect(ask.getAttribute('aria-checked')).toBe('true');
    });
});
