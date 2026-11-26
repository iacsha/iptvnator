import {
    Component,
    input,
    signal,
    ChangeDetectionStrategy,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
    PROFILE_SWITCHER,
    ServerStorageStatusService,
    type ProfileSwitcherEntry,
} from '@iptvnator/services';
import { WorkspaceShellRailComponent } from './workspace-shell-rail.component';

@Component({
    selector: 'app-workspace-shell-rail-links',
    template: '',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: true,
})
class MockWorkspaceShellRailLinksComponent {
    readonly links = input<unknown[]>([]);
    readonly selectedSection = input<string | null>(null);
    readonly activeClass = input('active');
}

describe('WorkspaceShellRailComponent', () => {
    let fixture: ComponentFixture<WorkspaceShellRailComponent>;
    const entry = (id: string, name: string): ProfileSwitcherEntry => ({
        id,
        name,
        glyph: name[0],
        colour: '#336699',
        textColour: '#ffffff',
    });
    const available = signal(false);
    const others = signal<ProfileSwitcherEntry[]>([]);
    const choose = jest.fn(async (_id: string) => undefined);
    const manage = jest.fn();

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [WorkspaceShellRailComponent],
            providers: [
                provideRouter([]),
                {
                    provide: PROFILE_SWITCHER,
                    useValue: {
                        available,
                        active: signal(entry('default', 'Ana')),
                        others,
                        choose,
                        manage,
                    },
                },
                {
                    provide: TranslateService,
                    useValue: {
                        instant: (key: string) => key,
                        get: (key: string) => of(key),
                        stream: (key: string) => of(key),
                        onLangChange: of(null),
                        onTranslationChange: of(null),
                        onDefaultLangChange: of(null),
                        currentLang: 'en',
                        defaultLang: 'en',
                    },
                },
            ],
        })
            .overrideComponent(WorkspaceShellRailComponent, {
                set: {
                    imports: [
                        MatIcon,
                        MatMenu,
                        MatMenuItem,
                        MatMenuTrigger,
                        MatTooltip,
                        MockWorkspaceShellRailLinksComponent,
                        RouterLink,
                        TranslatePipe,
                    ],
                },
            })
            .compileComponents();

        fixture = TestBed.createComponent(WorkspaceShellRailComponent);
    });

    it('renders provider context region and active settings shortcut state', () => {
        fixture.componentRef.setInput('primaryContextLinks', [
            {
                icon: 'movie',
                tooltip: 'Movies',
                path: ['/workspace', 'xtreams', 'pl-1', 'vod'],
                section: 'vod',
            },
        ]);
        fixture.componentRef.setInput(
            'railProviderClass',
            'rail-context-region rail-context-region--xtreams'
        );
        fixture.componentRef.setInput('isSettingsRoute', true);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('.rail-context-region--xtreams')
        ).not.toBeNull();
        expect(
            fixture.nativeElement.querySelector('.rail-shortcut.is-active')
        ).not.toBeNull();
    });

    it('has no brand mark duplicating the first workspace link', () => {
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('img')).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.app-rail')?.firstElementChild
                ?.tagName
        ).toBe('APP-WORKSPACE-SHELL-RAIL-LINKS');
    });

    describe('server status', () => {
        const instance = {
            service: 'iptvnator',
            apiVersion: 1,
            instanceId: 'i',
            storage: 'server',
            auth: 'none',
        } as const;
        const indicator = (): HTMLElement | null =>
            fixture.nativeElement.querySelector(
                '[data-test-id="rail-server-status"]'
            );

        it('hides the indicator without server storage', () => {
            fixture.detectChanges();

            expect(indicator()).toBeNull();
        });

        it('shows the connection state and links to Settings → Server', () => {
            const status = TestBed.inject(ServerStorageStatusService);
            status.activate(instance, () => undefined);
            fixture.detectChanges();

            expect(indicator()?.dataset['state']).toBe('online');
            expect(indicator()?.getAttribute('href')).toBe(
                '/workspace/settings/server'
            );

            status.reportOffline();
            fixture.detectChanges();

            expect(indicator()?.dataset['state']).toBe('offline');
            expect(indicator()?.textContent).toContain('cloud_off');
            expect(indicator()?.getAttribute('aria-label')).toBe(
                'SERVER_STORAGE.STATUS_OFFLINE'
            );
        });
    });

    describe('profile switcher', () => {
        const button = (): HTMLButtonElement | null =>
            fixture.nativeElement.querySelector(
                '[data-test-id="rail-profile-switcher"]'
            );

        beforeEach(() => {
            available.set(false);
            others.set([entry('kid', 'Kai')]);
            choose.mockClear();
            manage.mockClear();
        });

        it('stays out of the rail while profiles are not available', () => {
            fixture.detectChanges();
            expect(button()).toBeNull();
        });

        // The picker skips a lone Default, so the switcher has nothing to offer either.
        it('stays out of the rail while the active profile is the only one', () => {
            available.set(true);
            others.set([]);
            fixture.detectChanges();
            expect(button()).toBeNull();
        });

        it('shows once a second profile exists', () => {
            available.set(true);
            others.set([]);
            fixture.detectChanges();
            expect(button()).toBeNull();
            others.set([entry('kid', 'Kai')]);
            fixture.detectChanges();
            expect(button()).not.toBeNull();
        });

        // A source server connection is not the server-storage mode: the
        // status stays inactive in the web build and the switcher must show.
        it('shows without the server-storage status', () => {
            available.set(true);
            fixture.detectChanges();
            expect(
                fixture.nativeElement.querySelector(
                    '[data-test-id="rail-server-status"]'
                )
            ).toBeNull();
            expect(button()).not.toBeNull();
        });

        it('is a 44 px nav-item button with a name', () => {
            available.set(true);
            fixture.detectChanges();
            const trigger = button()!;
            expect(trigger.tagName).toBe('BUTTON');
            expect(trigger.classList).toContain('nav-item');
            expect(trigger.classList).toContain('rail-shortcut');
            expect(trigger.getAttribute('aria-label')).toBe(
                'PROFILES.SWITCHER.BUTTON'
            );
            expect(trigger.textContent?.trim()).toBe('A');
        });

        it('lists the other profiles and Manage profiles', () => {
            available.set(true);
            fixture.detectChanges();
            button()!.click();
            fixture.detectChanges();
            const kid = document.querySelector<HTMLElement>(
                '[data-test-id="rail-profile-kid"]'
            );
            expect(kid?.textContent).toContain('Kai');
            kid!.click();
            expect(choose).toHaveBeenCalledWith('kid');
            fixture.detectChanges();
            button()!.click();
            fixture.detectChanges();
            document
                .querySelector<HTMLElement>(
                    '[data-test-id="rail-profile-manage"]'
                )!
                .click();
            expect(manage).toHaveBeenCalled();
        });
    });
});
