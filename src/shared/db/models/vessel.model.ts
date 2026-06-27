import { Schema, model, type InferSchemaType } from 'mongoose';

export type GeoPoint = {
  type: 'Point';
  coordinates: [number, number];
};

const VesselSchema = new Schema(
  {
    mmsi: { type: String, required: true, unique: true },
    name: { type: String, default: null },
    vesselType: { type: Number, default: null },
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

    sog: { type: Number, default: null }, // knots
    cog: { type: Number, default: null }, // degrees 0–359.9
    heading: { type: Number, default: null }, // degrees 0–359
    lastSeen: { type: Date, default: Date.now },
    rawSentence: { type: String, default: null },
  },
  { timestamps: true },
);

VesselSchema.index({ location: '2dsphere' }, { sparse: true });
VesselSchema.index({ lastSeen: 1 });

export type VesselDoc = InferSchemaType<typeof VesselSchema>;
export const Vessel = model('Vessel', VesselSchema);
