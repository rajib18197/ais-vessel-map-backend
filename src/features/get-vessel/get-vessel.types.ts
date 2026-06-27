import type { ParamsDictionary } from 'express-serve-static-core';

export interface GetVesselParams extends ParamsDictionary {
  mmsi: string;
}
