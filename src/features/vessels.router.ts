import { Router } from 'express';
import { getAllVesselsRouter } from './get-all-vessels/get-all-vessels.handler.js';
import { getVesselRouter } from './get-vessel/get-vessel.handler.js';

export const vesselsRouter = Router();

vesselsRouter.use('/', getAllVesselsRouter);
vesselsRouter.use('/', getVesselRouter);
