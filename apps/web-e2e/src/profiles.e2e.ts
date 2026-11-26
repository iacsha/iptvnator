import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { addM3uUrlPlaylist } from './sources-pwa.helpers';
import {
    STORAGE_BACKEND_URL,
    newServerPage,
} from './server-storage-pwa.helpers';

/**
 * Household profiles on a self-hosted server (#2224): the start-up picker,
 * creating a profile, per-profile favorites, the rail switcher and the kids
 * rules, against the real web backend with server storage.
 */
test.use({ serviceWorkers: 'block', testIdAttribute: 'data-test-id' });

const PIN = '2468';

interface Created {
    id: string;
}

test.describe('household profiles @self-hosted', () => {
    // One shared server database: keep it to one browser, one test at a time.
    test.describe.configure({ mode: 'serial' });
    test.skip(
        ({ browserName }) => browserName !== 'chromium',
        'One shared server database'
    );

    let instanceId = '';
    let headers: Record<string, string> = {};
    const ids: Record<'ana' | 'ben' | 'kai', string> = {
        ana: '',
        ben: '',
        kai: '',
    };

    async function createProfile(
        request: APIRequestContext,
        data: Record<string, unknown>
    ): Promise<string> {
        const created = await request.post(
            `${STORAGE_BACKEND_URL}/v1/profiles`,
            {
                headers,
                data,
            }
        );
        expect(created.ok()).toBe(true);
        return ((await created.json()) as Created).id;
    }

    test.beforeEach(async ({ request }) => {
        const instance = await (
            await request.get(`${STORAGE_BACKEND_URL}/v1/instance`)
        ).json();
        expect(instance.capabilities).toContain('profiles-v1');
        instanceId = instance.instanceId;
        headers = { 'X-IPTVnator-Instance-Id': instanceId };
        await request.delete(`${STORAGE_BACKEND_URL}/v1/playlists`);
        expect(
            (
                await request.patch(`${STORAGE_BACKEND_URL}/v1/profiles`, {
                    headers,
                    data: { enabled: true },
                })
            ).ok()
        ).toBe(true);
        ids.ana = await createProfile(request, { name: 'Synthetic Ana' });
        ids.ben = await createProfile(request, { name: 'Synthetic Ben' });
        ids.kai = await createProfile(request, {
            name: 'Synthetic Kai',
            kids: true,
        });
    });

    test.afterEach(async ({ request }) => {
        for (const id of Object.values(ids))
            await request.delete(`${STORAGE_BACKEND_URL}/v1/profiles/${id}`, {
                headers,
            });
        await request.patch(`${STORAGE_BACKEND_URL}/v1/profiles`, {
            headers,
            data: { enabled: false },
        });
        await request.delete(`${STORAGE_BACKEND_URL}/v1/playlists`);
    });

    const switcher = (page: Page) => page.getByTestId('rail-profile-switcher');

    async function pickAtStart(page: Page, id: string): Promise<void> {
        // A cold dev server can be slower than the guard's 1.5 s wait, and a
        // slow start rightly lets the user in as Default: load until it asks.
        await expect(async () => {
            await page.goto('/workspace/sources');
            await expect(page).toHaveURL(/\/profile-picker/, { timeout: 5000 });
        }).toPass({ timeout: 45_000 });
        await expect(
            page.getByRole('heading', { name: /who.?s watching/i })
        ).toBeVisible();
        await page.getByTestId(`profile-tile-${id}`).click();
    }

    async function switchTo(page: Page, id: string): Promise<void> {
        await switcher(page).click();
        await page.getByTestId(`rail-profile-${id}`).click();
    }

    /**
     * Opens an in-app path without reloading: the "who's watching" answer
     * lives in memory for the app start, so `page.goto` would ask again.
     */
    async function openInApp(page: Page, path: string): Promise<void> {
        await page.evaluate((target) => {
            window.history.pushState({}, '', target);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }, path);
        await expect(page).toHaveURL(new RegExp(`${path}$`));
    }

    async function setParentalPin(page: Page): Promise<void> {
        await openInApp(page, '/workspace/settings/parental');
        await page
            .locator(
                '[data-test-id="parental-lock-enabled"] button[role="switch"]'
            )
            .click();
        await page.getByTestId('parental-lock-pin').fill(PIN);
        await page.getByTestId('parental-lock-pin-confirm').fill(PIN);
        await page.getByTestId('parental-lock-pin-submit').click();
        await expect(
            page.locator(
                '[data-test-id="parental-lock-enabled"] button[role="switch"]'
            )
        ).toHaveAttribute('aria-checked', 'true');
    }

    test('asks who is watching at start-up and shows the rail switcher', async ({
        browser,
    }) => {
        const page = await newServerPage(browser);
        try {
            await pickAtStart(page, ids.ana);
            await expect(page).toHaveURL(/\/workspace\/sources/);
            await expect(switcher(page)).toBeVisible();
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Ana/);
            const box = await switcher(page).boundingBox();
            expect(box?.width).toBeGreaterThanOrEqual(44);
            expect(box?.height).toBeGreaterThanOrEqual(44);

            await switcher(page).click();
            await expect(
                page.getByTestId(`rail-profile-${ids.ben}`)
            ).toBeVisible();
            await expect(
                page.getByTestId(`rail-profile-${ids.ana}`)
            ).toHaveCount(0);
            await page.getByTestId('rail-profile-manage').click();
            await expect(page).toHaveURL(/\/workspace\/settings\/profiles/);
        } finally {
            await page.context().close();
        }
    });

    test('creates a profile in Settings and chooses it', async ({
        browser,
    }) => {
        const page = await newServerPage(browser);
        try {
            await pickAtStart(page, ids.ana);
            await openInApp(page, '/workspace/settings/profiles');
            await page.getByTestId('profile-add').click();
            await page
                .getByRole('textbox', { name: /^Name/ })
                .fill('Synthetic Cleo');
            await page
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            await expect(
                page.locator('.profiles-row__name', {
                    hasText: 'Synthetic Cleo',
                })
            ).toBeVisible();

            await switcher(page).click();
            await page
                .getByRole('menuitem', { name: /Synthetic Cleo/ })
                .click();
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Cleo/);
        } finally {
            await page.context().close();
        }
    });

    test('keeps favorites apart between two profiles', async ({ browser }) => {
        const page = await newServerPage(browser);
        try {
            await pickAtStart(page, ids.ana);
            // Separation needs the syncs: one click turns the three on.
            await openInApp(page, '/workspace/settings/profiles');
            await page.getByTestId('profiles-consent-accept').click();
            await expect(
                page.getByTestId('profiles-consent-offer')
            ).toHaveCount(0);

            await openInApp(page, '/workspace/sources');
            await addM3uUrlPlaylist(page, 'Shared M3U');
            await page.locator('.favorite-button').first().click();
            await page
                .getByRole('link', { name: 'Global favorites', exact: true })
                .click();
            await expect(
                page.locator('app-global-favorites-list .channel-name')
            ).toHaveCount(1);

            await switchTo(page, ids.ben);
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Ben/);
            await page
                .getByRole('link', { name: 'Global favorites', exact: true })
                .click();
            await expect(
                page.locator('app-global-favorites-list .channel-name')
            ).toHaveCount(0);

            await switchTo(page, ids.ana);
            await page
                .getByRole('link', { name: 'Global favorites', exact: true })
                .click();
            await expect(
                page.locator('app-global-favorites-list .channel-name')
            ).toHaveCount(1);
        } finally {
            await page.context().close();
        }
    });

    test('blocks a kids profile until a parent has set a parental PIN, then forces the lock', async ({
        browser,
    }) => {
        const page = await newServerPage(browser);
        try {
            await pickAtStart(page, ids.ana);
            // No parental PIN on this device: the kids profile is refused with a message.
            await switcher(page).click();
            await page.getByTestId(`rail-profile-${ids.kai}`).click();
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Ana/);
            await expect(
                page.getByText(/parental PIN on this device first/i)
            ).toBeVisible();

            await setParentalPin(page);
            // Unlocked by setting it up, then the kids profile locks it again.
            await switchTo(page, ids.kai);
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Kai/);
            await openInApp(page, '/workspace/settings/parental');
            await expect(
                page.getByTestId('parental-lock-forced')
            ).toBeVisible();
            await expect(
                page.locator(
                    '[data-test-id="parental-lock-enabled"] button[role="switch"]'
                )
            ).toBeDisabled();
            await expect(
                page.getByTestId('parental-lock-unlock')
            ).toBeVisible();

            // Leaving the kids profile asks for the parental PIN.
            await switcher(page).click();
            await page.getByTestId(`rail-profile-${ids.ana}`).click();
            await page.getByTestId('parental-lock-pin').fill(PIN);
            await page.getByTestId('parental-lock-pin-submit').click();
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Ana/);
        } finally {
            await page.context().close();
        }
    });

    test('keeps the lock forced on a slow start after a kids profile', async ({
        browser,
    }) => {
        const page = await newServerPage(browser);
        try {
            await pickAtStart(page, ids.ana);
            await setParentalPin(page);
            await switchTo(page, ids.kai);
            await expect(switcher(page)).toHaveAccessibleName(/Synthetic Kai/);

            // The server stops answering for profiles: start-up gives up and holds Default.
            await page.route('**/v1/profiles**', (route) => route.abort());
            await page.goto('/workspace/settings/parental');
            await expect(page.getByTestId('parental-lock-forced')).toBeVisible({
                timeout: 15_000,
            });
            await expect(
                page.getByTestId('parental-lock-unlock')
            ).toBeVisible();
        } finally {
            await page.context().close();
        }
    });
});
