import { z } from "zod";

export const uploadRequestSchema = z.object({
  shipment_id: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  event_id: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  event_type: z.enum(["delivered", "exception"]),
  asset_kind: z.enum(["proof_of_delivery", "exception_evidence"]),
  content_type: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  size_bytes: z.number().int().positive().max(10_000_000),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export type UploadDecision = {
  key: string;
  expires_seconds: number;
  next_state: "awaiting_proof_of_delivery" | "awaiting_exception_evidence";
};

export class AssetPolicyError extends Error {}

const expectedAsset = {
  delivered: "proof_of_delivery",
  exception: "exception_evidence",
} as const;

const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
} as const;

export function decideShipmentAsset(input: UploadRequest): UploadDecision {
  if (input.asset_kind !== expectedAsset[input.event_type]) {
    throw new AssetPolicyError(`Asset kind does not match the ${input.event_type} event`);
  }

  const extension = extensionByContentType[input.content_type];
  return {
    key: `shipments/${input.shipment_id}/events/${input.event_id}/${input.asset_kind}.${extension}`,
    expires_seconds: 600,
    next_state: input.event_type === "delivered"
      ? "awaiting_proof_of_delivery"
      : "awaiting_exception_evidence",
  };
}
