import { decideShipmentAsset, uploadRequestSchema } from "./shipment_asset_policy.js";

const input = uploadRequestSchema.parse({
  shipment_id: "SHP-2048",
  event_id: "EVT-93",
  event_type: "delivered",
  asset_kind: "proof_of_delivery",
  content_type: "image/jpeg",
  size_bytes: 245_000,
});

console.log(decideShipmentAsset(input));
