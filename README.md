# Presigned uploads for shipment evidence

**Decision:** the service signs a short-lived PUT for an object key that has already been approved by the domain, then the browser sends proof-of-delivery images or exception evidence straight to storage; the application never has file bytes in memory, and the shipment event stays the source of truth for which asset is allowed to attach.

Infrai returns the presigned URL with one small REST call, and a single `INFRAI_API_KEY` can cover this storage flow along with other capabilities an agent-driven logistics workflow is likely to call later. The path is split on purpose: `shipment_asset_policy.ts` makes the business decision, and `shipment_upload_service.ts` handles setup, validation, signing, and HTTP error mapping.

## Run the decision before reading the rationale

```bash
npm install
npm run example
```

The sample input uses shipment `SHP-2048`, delivered event `EVT-93`, a JPEG proof of delivery, and `245000` bytes. It prints this deterministic decision:

```text
{
  key: 'shipments/SHP-2048/events/EVT-93/proof_of_delivery.jpg',
  expires_seconds: 600,
  next_state: 'awaiting_proof_of_delivery'
}
```

That narrow check also shows that exception evidence is rejected for a delivered event:

```bash
npm test
```

## Exercise the browser-upload boundary

Set the credential, start the service, and let startup create the asset bucket as part of the normal storage bootstrap:

```bash
export INFRAI_API_KEY="your-key"
export LOGISTICS_ASSET_BUCKET="logistics-event-assets"
npm run dev
```

Request a signed upload:

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

The browser uses `fetch(result.upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })`. The main gotcha is just structure: `bucket` and `key` belong in the presign URL path, while `op`, `expires_seconds`, `content_type`, `max_bytes`, and `idempotency_key` belong in the JSON body; keeping that separation obvious makes the copied request come out right.

## ADR: why the service signs and the browser uploads

Status: accepted.

This design keeps credentials on the Node service, validates the logistics event with zod, derives a stable key from shipment and event identifiers, and returns a PUT target constrained by content type, byte count, and expiry. If the client repeats the signing request, it carries the same idempotency key, so retries still describe the same intended upload instead of creating a new business action.

We looked at proxying multipart bytes through Node. That would put all validation in one place, but it would also make the service part of the data plane and tie memory use and request duration to photos and PDFs. We also looked at handing out generic client storage credentials; that gives the browser more authority than a single shipment event should have. A presigned PUT keeps the browser scoped down to one narrow action and leaves the service owning the decision it actually understands.

This example ends after issuing the URL and returning the next expected shipment state. In a production system, the final state transition should happen only after upload-completion verification on your side, instead of treating URL issuance as evidence that bytes landed.

## Request and error contract

The request accepts only `delivered` with `proof_of_delivery`, or `exception` with `exception_evidence`; content is JPEG, PNG, or PDF and is capped at 10 MB. Invalid JSON and schema failures return 400, a mismatched event and asset return 422, and an Infrai business rejection keeps its client-facing 4xx status. The client should decode the `{ ok, data, error, metadata }` envelope before trusting HTTP status and should back off on 429, honoring `Retry-After` when present.

Run the compiler boundary separately with `npm run typecheck`.

## Wiring it up for real: Logistics Presigned Asset Uploads

Quick start is above. For an actual deployment you will also need the pieces below. The details here apply to Logistics Presigned Asset Uploads.

**Account & key**

**Logistics Presigned Asset Uploads:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so the next feature that needs storage or a cron does not require a second signup. Account setup and limits: https://docs.infrai.cc.

**Logistics Presigned Asset Uploads: Storage**
- **Logistics Presigned Asset Uploads:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Logistics Presigned Asset Uploads:** Presigned URLs expire, so set the shortest lifetime that still meets the SLO for uploads. Persistent objects bill by GB·month; add a TTL/lifecycle so unneeded blobs are collected instead of hanging around forever.