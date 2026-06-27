import { getVesselsInBounds } from './get-vessels-in-bounds.usecase.js';
import { Vessel } from '../../shared/db/models/vessel.model.js';
import { ACTIVE_VESSEL_WINDOW_MS } from '../../config/constants.js';

jest.mock('../../shared/db/models/vessel.model.js');

const mockVessel = {
  mmsi: '123456789',
  name: 'Test Vessel',
  vesselType: 70,
  location: { type: 'Point', coordinates: [103.8, 1.35] },
  sog: 12.5,
  cog: 180,
  heading: 182,
  lastSeen: new Date(),
};

const validBounds = {
  swLng: 103.0,
  swLat: 1.0,
  neLng: 104.0,
  neLat: 2.0,
};

function mockFind(resolveWith: unknown[]) {
  (Vessel.find as jest.Mock).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(resolveWith) }),
  });
}

describe('getVesselsInBounds usecase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns vessels within the given bounds', async () => {
    mockFind([mockVessel]);

    const result = await getVesselsInBounds(validBounds);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ mmsi: '123456789' });
  });

  it('returns empty array when no vessels exist in bounds', async () => {
    mockFind([]);

    const result = await getVesselsInBounds(validBounds);

    expect(result).toEqual([]);
  });

  it('queries with the correct geospatial $box filter', async () => {
    mockFind([mockVessel]);

    await getVesselsInBounds(validBounds);

    const findCall = (Vessel.find as jest.Mock).mock.calls[0][0];
    expect(findCall.location).toEqual({
      $geoWithin: {
        $box: [
          [103.0, 1.0],
          [104.0, 2.0],
        ],
      },
    });
  });

  it('only returns vessels seen within the active window', async () => {
    mockFind([mockVessel]);

    await getVesselsInBounds(validBounds);

    const findCall = (Vessel.find as jest.Mock).mock.calls[0][0];
    expect(findCall).toHaveProperty('lastSeen.$gte');

    const cutoff = findCall.lastSeen.$gte as Date;
    const fifteenMinutesAgo = Date.now() - ACTIVE_VESSEL_WINDOW_MS;
    expect(cutoff.getTime()).toBeGreaterThan(fifteenMinutesAgo - 1000);
  });

  it('passes bounds to the query in the correct [lng, lat] order', async () => {
    mockFind([mockVessel]);

    await getVesselsInBounds(validBounds);

    const findCall = (Vessel.find as jest.Mock).mock.calls[0][0];
    const box = findCall.location.$geoWithin.$box;
    expect(box[0]).toEqual([validBounds.swLng, validBounds.swLat]);
    expect(box[1]).toEqual([validBounds.neLng, validBounds.neLat]);
  });
});
