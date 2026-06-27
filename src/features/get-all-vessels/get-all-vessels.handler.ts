import { Router } from 'express';
import { catchAsync } from '../../shared/utils/catch-async';
import { getAllVessels } from './get-all-vessels.usecase';

export const getAllVesselsRouter = Router();

getAllVesselsRouter.get(
  '/',
  catchAsync(async (_req, res) => {
    const vessels = await getAllVessels();

    res.status(200).json({
      status: 'success',
      results: vessels.length,
      data: { vessels },
    });
  }),
);
