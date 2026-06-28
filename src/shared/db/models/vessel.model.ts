import { Schema, model, type InferSchemaType } from 'mongoose';

export type GeoPoint = {
  type: 'Point';
  coordinates: [number, number];
};

const VesselSchema = new Schema(
  {
    // ── Required fields (per spec) ───────────────────────────────────────────
    mmsi: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    location: {
      type: new Schema(
        {
          type: { type: String, enum: ['Point'], required: true },
          coordinates: { type: [Number], required: true },
        },
        { _id: false },
      ),
      required: false,
      default: undefined,
    },
    sog: { type: Number, default: null },
    cog: { type: Number, default: null },
    heading: { type: Number, default: null },
    vesselType: { type: Number, default: null },
    // ── UX fields ────────────────────────────────────────────────────────────
    navStatus: { type: Number, default: null },
    rot: { type: Number, default: null },
    callsign: { type: String, default: null },
    imo: { type: Number, default: null },
    destination: { type: String, default: null },
    etaMonth: { type: Number, default: null },
    etaDay: { type: Number, default: null },
    etaHour: { type: Number, default: null },
    etaMinute: { type: Number, default: null },
    draught: { type: Number, default: null },
    dimA: { type: Number, default: null },
    dimB: { type: Number, default: null },
    dimC: { type: Number, default: null },
    dimD: { type: Number, default: null },
    classB: { type: Boolean, default: false },
    // ── Meta ─────────────────────────────────────────────────────────────────
    lastSeen: { type: Date, default: Date.now },
    rawSentence: { type: String, default: null },
  },
  { timestamps: true },
);

VesselSchema.index({ location: '2dsphere' }, { sparse: true });
VesselSchema.index({ lastSeen: 1 });
VesselSchema.index({ navStatus: 1 });

export type VesselDoc = InferSchemaType<typeof VesselSchema>;
export const Vessel = model('Vessel', VesselSchema);
