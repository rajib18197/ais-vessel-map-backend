import { Vessel } from '../../shared/db/models/vessel.model';
import { AppError } from '../../shared/errors/app.error';
import {
  vesselSummarySchema,
  type VesselSummary,
} from '../get-all-vessels/get-all-vessels.types.js';

export async function getVesselByMmsi(mmsi: string): Promise<VesselSummary> {
  const raw = await Vessel.findOne({ mmsi }).select('-rawSentence -__v').lean();

  if (!raw) {
    throw new AppError(`Vessel with MMSI ${mmsi} not found`, 404);
  }

  return vesselSummarySchema.parse(raw);
}
