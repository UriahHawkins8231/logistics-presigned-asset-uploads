import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_storage.js";
import {
  AssetPolicyError,
  decideShipmentAsset,
  uploadRequestSchema,
} from "./shipment_asset_policy.js";

const bucket = process.env.LOGISTICS_ASSET_BUCKET ?? "logistics-event-assets";
const port = Number(process.env.PORT ?? 3000);

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const bucketReady = infrai.storage.bucket.create(bucket);

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/shipment-assets/presign") {
    json(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = uploadRequestSchema.parse(await readJson(request));
    const decision = decideShipmentAsset(input);
    await bucketReady;
    const signed = await infrai.storage.object.presign(bucket, decision.key, {
      op: "put",
      expires_seconds: decision.expires_seconds,
      content_type: input.content_type,
      max_bytes: input.size_bytes,
      idempotency_key: `${input.shipment_id}:${input.event_id}:${input.asset_kind}`,
    });
    json(response, 201, {
      upload_url: signed.url,
      method: "PUT",
      object_key: decision.key,
      next_state: decision.next_state,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid request body", issues: error.issues });
    } else if (error instanceof AssetPolicyError) {
      json(response, 422, { error: error.message });
    } else if (error instanceof InfraiError) {
      json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.message,
      });
    } else {
      json(response, 500, { error: "Request could not be completed" });
    }
  }
});

server.listen(port, () => {
  console.log(`Shipment upload service listening on http://localhost:${port}`);
});
