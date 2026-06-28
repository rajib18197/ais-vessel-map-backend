/**
 * Domain-level representation of a decoded AIS message, normalized away
 * from the raw `ais-stream-decoder` wire format. This is intentionally a
 * discriminated union on `hasPosition` rather than one big optional bag —
 * a position update is *required* to carry `lat`/`lon`, and the type
 * system should make that fact impossible to violate at any call site.
 */

export interface VesselUpdateBase {
  mmsi: number;
  name?: string;
  vesselType?: number;
  navStatus?: number;
  rot?: number;
  callsign?: string;
  imo?: number;
  destination?: string;
  etaMonth?: number;
  etaDay?: number;
  etaHour?: number;
  etaMinute?: number;
  draught?: number;
  dimA?: number;
  dimB?: number;
  dimC?: number;
  dimD?: number;
  classB?: boolean;
  receivedAt: Date;
}

export interface VesselPositionUpdate extends VesselUpdateBase {
  hasPosition: true;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  heading?: number;
}

export interface VesselStaticUpdate extends VesselUpdateBase {
  hasPosition: false;
}

export type VesselUpdate = VesselPositionUpdate | VesselStaticUpdate;

export interface AisFeedConfig {
  host: string;
  port: number;
  protocol: 'tcp' | 'udp';
  reconnectDelayMs: number;
}
