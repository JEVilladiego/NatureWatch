# Security Specification: BantayKalikasan

## 1. Data Invariants
1. Reports may only be created anonymously by residents with initial status 'pending', triageStatus 'pending', a server-set `createdAt`, a single 'pending' history entry, a `BK-XXXXX` reference code, and no aiTriage/final fields.
2. Description must not exceed 500 characters and must not contain executable script or prompt injections (treated as untrusted raw input).
3. Severity values (if present in final or aiTriage) must be clamped integers between 1 and 5.
4. Categories must be one of the 9 strictly defined enum values.
5. Official-only updates: only authenticated officials may update 'status', 'statusHistory', and 'final'.
6. Clients cannot write or modify 'aiTriage' or 'triageStatus' (reserved for the Vercel API using the Admin SDK).
7. Location must contain valid geographic coordinates within Binangonan / Rizal bounds (latitude -90 to 90, longitude -180 to 180).
8. Photos are stored compressed (<= ~800KB data URL) in `report_images/{reportId}`, created only in the same batch as their report, readable only by officials, never updatable or deletable by clients.

## 2. The "Dirty Dozen" Payloads (Negative Tests)
1. Injecting `aiTriage` on client report create: Attempting to bypass AI triage by supplying forged `{ aiTriage: { severity: 1 } }`. Expected: PERMISSION_DENIED.
2. Injecting `final` override on anonymous create: Attempting to auto-resolve or override on submission. Expected: PERMISSION_DENIED.
3. Setting status to `resolved` on anonymous create: Expected: PERMISSION_DENIED.
4. Description length denial-of-wallet attack (>500 characters). Expected: PERMISSION_DENIED.
5. Anonymous user attempting to read (`get` or `list`) the `reports` collection directly. Expected: PERMISSION_DENIED.
6. Non-official attempting to update `status` or `final` review notes. Expected: PERMISSION_DENIED.
7. Official attempting to overwrite immutable fields such as `referenceCode`, `createdAt`, `location`, or `rawInput`. Expected: PERMISSION_DENIED.
8. Injection of invalid category string (e.g., `hack_category`) in `final.category`. Expected: PERMISSION_DENIED.
9. Out-of-bounds severity in `final.severity` (e.g., `severity: 10` or `severity: 0`). Expected: PERMISSION_DENIED.
10. Unauthenticated document deletion on `/reports/{reportId}`. Expected: PERMISSION_DENIED.
11. Malicious document ID injection (>128 chars or illegal characters). Expected: PERMISSION_DENIED.
12. Spoofing an official by registering an account with a known official's email address. Expected: PERMISSION_DENIED (officials are identified only by an `officials/{uid}` document or a role claim, never by email).
13. Forged `createdAt` in the past/future on create. Expected: PERMISSION_DENIED (must equal `request.time`).
14. Creating a `report_images` document without its report, or overwriting an existing one. Expected: PERMISSION_DENIED.
15. Official setting `final.reviewedBy` to another official's UID. Expected: PERMISSION_DENIED.
