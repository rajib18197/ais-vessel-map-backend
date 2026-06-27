import { getAllVessels } from './get-all-vessels.usecase.js';
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

function mockFind(resolveWith: unknown[]) {
  (Vessel.find as jest.Mock).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(resolveWith) }),
  });
}

describe('getAllVessels usecase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an empty array when no active vessels exist', async () => {
    mockFind([]);
    const result = await getAllVessels();
    expect(result).toEqual([]);
  });

  it('queries only vessels seen within the active window', async () => {
    mockFind([mockVessel]);
    await getAllVessels();

    const findCall = (Vessel.find as jest.Mock).mock.calls[0][0];
    expect(findCall).toHaveProperty('lastSeen.$gte');

    const cutoff = findCall.lastSeen.$gte as Date;
    const fifteenMinutesAgo = Date.now() - ACTIVE_VESSEL_WINDOW_MS;
    // Allow 1 second of test execution drift
    expect(cutoff.getTime()).toBeGreaterThan(fifteenMinutesAgo - 1000);
  });

  it('returns vessel data in the expected shape', async () => {
    mockFind([mockVessel]);
    const result = await getAllVessels();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      mmsi: '123456789',
      name: 'Test Vessel',
      sog: 12.5,
    });
  });
});
