import { EventEmitter } from 'node:events';
import type { VesselDoc } from '../db/models/vessel.model.js';

export interface VesselEvents {
  'vessel:updated': (vessel: VesselDoc) => void;
  'vessel:created': (vessel: VesselDoc) => void;
}

class TypedVesselEmitter extends EventEmitter {
  emit<E extends keyof VesselEvents>(event: E, ...args: Parameters<VesselEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  on<E extends keyof VesselEvents>(event: E, listener: VesselEvents[E]): this {
    return super.on(event, listener);
  }

  off<E extends keyof VesselEvents>(event: E, listener: VesselEvents[E]): this {
    return super.off(event, listener);
  }
}

// Singleton
export const vesselEmitter = new TypedVesselEmitter();

vesselEmitter.setMaxListeners(50);
