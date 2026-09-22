# Frozen OpenAPI contract

This project treats the OpenAPI contract as frozen, external source of truth.
It is vendored verbatim (byte-for-byte) into this repository and must never be
hand-edited.

- Source file: `openapi/wst-openapi.yaml`
- SHA-256: `856dde6de6f9338c027ac6d2bcf639d31e194fe693b68f1fb9970f03495a234a`

## Verifying the snapshot has not drifted

```
npm run api:check
```

This recomputes the SHA-256 of `openapi/wst-openapi.yaml`, compares it against
the hash recorded above, and regenerates `src/api/generated/schema.d.ts` into
a scratch buffer to confirm the committed generated types are still in sync
with the contract. Any mismatch fails the script.

## Regenerating types

Whenever the upstream contract is intentionally updated (a new frozen
snapshot is provided), replace `openapi/wst-openapi.yaml`, update the SHA-256
above to match, then run:

```
npm run api:generate
```

and commit the resulting `src/api/generated/schema.d.ts`.

## Usage in application code

Application code must not hand-write duplicate schema types for anything the
contract already describes. Instead, derive types from the generated
`components['schemas']` and `paths` maps (see `src/api/types.ts` for the thin,
named re-exports used across the app).
