import { getVesselByMmsi } from './get-vessel.usecase.js';
import { Vessel } from '../../shared/db/models/vessel.model.js';
import { AppError } from '../../shared/errors/app.error.js';

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

function mockFindOne(resolveWith: unknown) {
  (Vessel.findOne as jest.Mock).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(resolveWith) }),
  });
}

describe('getVesselByMmsi usecase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the vessel when found', async () => {
    mockFindOne(mockVessel);

    const result = await getVesselByMmsi('123456789');

    expect(result).toMatchObject({
      mmsi: '123456789',
      name: 'Test Vessel',
      sog: 12.5,
    });
  });

  it('queries by the correct mmsi', async () => {
    mockFindOne(mockVessel);

    await getVesselByMmsi('123456789');

    expect(Vessel.findOne).toHaveBeenCalledWith({ mmsi: '123456789' });
  });

  it('throws a 404 AppError when vessel is not found', async () => {
    mockFindOne(null);

    await expect(getVesselByMmsi('999999999')).rejects.toThrow(AppError);
    await expect(getVesselByMmsi('999999999')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Vessel with MMSI 999999999 not found',
    });
  });

  it('throws an operational error so the global handler exposes the message', async () => {
    mockFindOne(null);

    await expect(getVesselByMmsi('999999999')).rejects.toMatchObject({
      isOperational: true,
    });
  });
});
