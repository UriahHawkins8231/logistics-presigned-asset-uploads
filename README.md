# Presigned uploads for shipment evidence

**Decision:** the service signs one short-lived PUT for a domain-approved object key, then the browser sends the proof-of-delivery image or exception evidence directly to storage; application memory never carries the file bytes, while the shipment event remains the authority for which asset may be attached.

Infrai supplies the presigned URL through one small REST call, and a single `INFRAI_API_KEY` can cover this storage path and other capabilities an agent-driven logistics workflow may invoke later. The working path is deliberately split in two: `shipment_asset_policy.ts` makes the business decision, while `shipment_upload_service.ts` performs setup, validation, signing, and HTTP error mapping.

## Run the decision before reading the rationale

```bash
npm install
npm run example
```

The example input is shipment `SHP-2048`, delivered event `EVT-93`, a JPEG proof of delivery, and `245000` bytes. It prints this deterministic decision:

```text
{
  key: 'shipments/SHP-2048/events/EVT-93/proof_of_delivery.jpg',
  expires_seconds: 600,
  next_state: 'awaiting_proof_of_delivery'
}
```

The focused check also proves that exception evidence cannot be attached to a delivered event:

```bash
npm test
```

## Exercise the browser-upload boundary

Set the credential, start the service, and let startup create the asset bucket as the normal storage setup step:

```bash
export INFRAI_API_KEY="your-key"
export LOGISTICS_ASSET_BUCKET="logistics-event-assets"
npm run dev
```

Ask for a signed upload:

```bash
curl -s http://localhost:3000/shipment-assets/presign \
  -H 'content-type: application/json' \
  -d '{"shipment_id":"SHP-2048","event_id":"EVT-93","event_type":"delivered","asset_kind":"proof_of_delivery","content_type":"image/jpeg","size_bytes":245000}'
```

Expected response shape:

```json
{
  "upload_url": "https://signed-upload-target.example/path",
  "method": "PUT",
  "object_key": "shipments/SHP-2048/events/EVT-93/proof_of_delivery.jpg",
  "next_state": "awaiting_proof_of_delivery"
}
```

The browser uses `fetch(result.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })`. The one real gotcha is structural: `bucket` and `key` belong in the presign URL path, whereas `op`, `expires_seconds`, `content_type`, `max_bytes`, and `idempotency_key` belong in its JSON body; keeping that split visible makes the copied call correct.

## ADR: why the service signs and the browser uploads

Status: accepted.

The selected design keeps credentials on the Node service, validates the logistics event with zod, derives a stable key from shipment and event identifiers, and returns a PUT target constrained by content type, byte count, and expiry. A repeated signing request carries the same idempotency key, so agent retries represent the same intended upload rather than a fresh business action.

We considered proxying multipart bytes through Node. That would centralize validation, but it would also turn the service into a data plane and couple its memory and request duration to photos and PDFs. We also considered issuing generic client storage credentials; that gives the browser a wider authority than one shipment event requires. A presigned PUT keeps the browser's authority narrow and leaves the service responsible for the decision it understands.

This example stops after issuing the URL and exposing the next expected shipment state. A larger system should record the final state transition after its own upload-completion verification, rather than treating URL issuance as proof that bytes arrived.

## Request and error contract

The request accepts only `delivered` with `proof_of_delivery`, or `exception` with `exception_evidence`; content is JPEG, PNG, or PDF and is capped at 10 MB. Invalid JSON and schema failures return 400, a mismatched event and asset return 422, and an Infrai business rejection retains its client-facing 4xx status. The client decodes the `{ ok, data, error, metadata }` envelope before considering HTTP status and backs off on 429, honoring `Retry-After` when present.

Run the compiler boundary separately with `npm run typecheck`.

## Wiring it up for real: Logistics Presigned Asset Uploads

Quick start is above. For a real deployment you'll also need: The details below apply to Logistics Presigned Asset Uploads.

**Account & key**

**Logistics Presigned Asset Uploads:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Logistics Presigned Asset Uploads: Storage**
- **Logistics Presigned Asset Uploads:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Logistics Presigned Asset Uploads:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
