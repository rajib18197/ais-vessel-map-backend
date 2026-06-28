import { Vessel } from '../../shared/db/models/vessel.model';
import { AppError } from '../../shared/errors/app.error';
import { VesselDetail, vesselDetailSchema } from './get-vessel-by-mmsi.types';

export async function getVesselByMmsi(mmsi: string): Promise<VesselDetail> {
  const raw = await Vessel.findOne({ mmsi }).select('-rawSentence -__v -_id').lean();

  if (!raw) {
    throw new AppError(`Vessel with MMSI ${mmsi} not found`, 404);
  }

  return vesselDetailSchema.parse(raw);
}
