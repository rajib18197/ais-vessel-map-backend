import { Router } from 'express';
import { getVesselRouter } from './get-vessel/get-vessel.handler.js';
import { getVesselsInBoundsRouter } from './get-vessels-in-bounds/get-vessels-in-bounds.handler.js';
import { getAllVesselsRouter } from './get-all-vessels/get-all-vessels.handler.js';

export const vesselsRouter = Router();

vesselsRouter.use('/in-bounds', getVesselsInBoundsRouter);
vesselsRouter.use('/', getAllVesselsRouter);
vesselsRouter.use('/', getVesselRouter);
