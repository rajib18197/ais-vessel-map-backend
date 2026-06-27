import { Router } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { validatedRoute } from '../../shared/middleware/validate.middleware';
import { getVesselParamsSchema } from './get-vessel.schema';
import { getVesselByMmsi } from './get-vessel.usecase.js';

export const getVesselRouter = Router();

getVesselRouter.get(
  '/:mmsi',
  validatedRoute(
    { params: getVesselParamsSchema },
    catchAsync(async (req, res) => {
      const { mmsi } = req.validatedParams;
      const vessel = await getVesselByMmsi(mmsi);
      res.status(200).json({ status: 'success', data: { vessel } });
    }),
  ),
);
