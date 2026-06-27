export interface VesselUpdateBase {
  mmsi: number;
  name?: string;
  vesselType?: number;
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
