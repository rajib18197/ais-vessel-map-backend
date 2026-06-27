import { Router } from 'express';
import { getAllVesselsRouter } from './get-all-vessels/get-all-vessels.handler.js';

export const vesselsRouter = Router();

vesselsRouter.use('/', getAllVesselsRouter);
