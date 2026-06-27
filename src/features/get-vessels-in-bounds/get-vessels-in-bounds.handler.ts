import { Router } from 'express';
import { validatedRoute } from '../../shared/middleware/validate.middleware.js';
import { getVesselsInBoundsQuerySchema } from './get-vessels-in-bounds.schema.js';
import { getVesselsInBounds } from './get-vessels-in-bounds.usecase.js';
import { catchAsync } from '../../shared/utils/catch-async.js';

export const getVesselsInBoundsRouter = Router();

getVesselsInBoundsRouter.get(
  '/',
  validatedRoute(
    { query: getVesselsInBoundsQuerySchema },
    catchAsync(async (req, res) => {
      const { swLng, swLat, neLng, neLat } = req.validatedQuery;
      const vessels = await getVesselsInBounds({ swLng, swLat, neLng, neLat });
      res.status(200).json({ status: 'success', results: vessels.length, data: { vessels } });
    }),
  ),
);
