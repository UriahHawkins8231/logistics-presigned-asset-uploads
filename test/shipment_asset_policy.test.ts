import assert from "node:assert/strict";
import test from "node:test";
import {
  AssetPolicyError,
  decideShipmentAsset,
  uploadRequestSchema,
} from "../src/shipment_asset_policy.js";

test("a delivered event produces a proof-of-delivery object key and state", () => {
  const input = uploadRequestSchema.parse({
    shipment_id: "SHP-2048",
    event_id: "EVT-93",
    event_type: "delivered",
    asset_kind: "proof_of_delivery",
    content_type: "image/jpeg",
    size_bytes: 245_000,
  });

  assert.deepEqual(decideShipmentAsset(input), {
    key: "shipments/SHP-2048/events/EVT-93/proof_of_delivery.jpg",
    expires_seconds: 600,
    next_state: "awaiting_proof_of_delivery",
  });
});

test("exception evidence cannot be attached to a delivered event", () => {
  const input = uploadRequestSchema.parse({
    shipment_id: "SHP-2048",
    event_id: "EVT-94",
    event_type: "delivered",
    asset_kind: "exception_evidence",
    content_type: "image/png",
    size_bytes: 120_000,
  });

  assert.throws(() => decideShipmentAsset(input), AssetPolicyError);
});
