import { TestBed } from '@angular/core/testing';
import {
    PwaXtreamDataSource,
    type IXtreamDataSource,
} from '@iptvnator/portal/xtream/data-access';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { setActivePersonalScope } from '@iptvnator/services/profiles';
import { activityDataSourceFactory } from './activity-sync.providers';

const KIDS = 'profile:11111111-1111-4111-8111-111111111111';

/** No sync has ever been turned on here: the raw stores are the household's. */
describe('the data source for a profile without any sync consent', () => {
    let raw: Record<string, jest.Mock>;
    let source: IXtreamDataSource;

    beforeEach(() => {
        localStorage.clear();
        raw = {
            getFavorites: jest.fn(async () => ['household']),
            addFavorite: jest.fn(async () => undefined),
            getRecentItems: jest.fn(async () => ['household']),
            addRecentItem: jest.fn(async () => undefined),
            getPlaybackPosition: jest.fn(async () => ({ household: true })),
            savePlaybackPosition: jest.fn(async () => undefined),
        };
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: { supportsXtreamSqliteDataSource: false },
                },
                {
                    provide: PwaXtreamDataSource,
                    useValue: raw,
                },
            ],
        });
        source = TestBed.runInInjectionContext(() => {
            const factory = activityDataSourceFactory();
            return factory;
        });
    });
    afterEach(() => setActivePersonalScope('shared'));

    it('keeps the Default profile on the household stores', async () => {
        await source.getFavorites?.('s' as never);
        expect(raw['getFavorites']).toHaveBeenCalled();
    });

    it('gives another profile empty reads and refuses its writes', async () => {
        setActivePersonalScope(KIDS);
        await expect(
            Promise.resolve(source.getFavorites('s'))
        ).resolves.toEqual([]);
        await expect(
            Promise.resolve(source.getRecentItems('s'))
        ).resolves.toEqual([]);
        await expect(
            Promise.resolve(source.getPlaybackPosition('s', 1, 'vod'))
        ).resolves.toBe(null);
        await expect(
            Promise.resolve().then(() => source.addFavorite('s', 1, 'vod'))
        ).rejects.toThrow('sync turned on');
        await expect(
            Promise.resolve().then(() =>
                source.savePlaybackPosition('s', {} as never)
            )
        ).rejects.toThrow('sync turned on');
        expect(raw['getFavorites']).not.toHaveBeenCalled();
        expect(raw['getRecentItems']).not.toHaveBeenCalled();
        expect(raw['getPlaybackPosition']).not.toHaveBeenCalled();
        expect(raw['addFavorite']).not.toHaveBeenCalled();
        expect(raw['savePlaybackPosition']).not.toHaveBeenCalled();
    });
});
