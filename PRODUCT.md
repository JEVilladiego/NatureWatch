# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Rizal Province Residents**: Citizens encountering environmental violations (such as illegal dumping, open burning, water pollution entering waterways or Laguna de Bay, illegal tree cutting in the Sierra Madre, quarrying, or wildlife issues) in their barangay. They need to report issues quickly in the field from mobile devices without creating accounts or revealing personal identities, and check follow-up progress via an anonymous reference code (`BK-XXXXX`).
- **PG-ENRO & MENRO Officers**: Authorized personnel of the Provincial Government - Environment and Natural Resources Office (PG-ENRO) and municipal MENROs across Rizal. They access an authenticated dashboard to review incoming incidents, inspect AI assessments, verify photos and geolocation, override categories/severities, monitor duplicate clusters, and manage cases across `pending`, `in_progress`, and `resolved` statuses.

## Product Purpose

Provide a zero-friction, reliable environmental incident intake and automated triage system for the Provincial Government of Rizal (PG-ENRO) and its 14 component LGUs. Success means frictionless citizen reporting with zero personal data collection barriers, rapid automated AI classification and severity prioritization for environmental officers, and full compliance with Philippine Data Privacy regulations (RA 10173).

## Positioning

Unlike generic civic reporting tools or bureaucratic hotline queues, BantayKalikasan is an unauthenticated, mobile-first PWA backed by serverless Google Gemini multimodal triage and strict privacy boundaries. It allows citizens to submit evidence without barriers while providing provincial and municipal environmental officers with instantaneous structured incident intelligence—all sustained on a zero-cost serverless infrastructure.

## Operating Context

- Field reporting by residents on intermittent mobile networks, requiring client-side image compression (~100–250KB) and offline Firestore queue synchronization.
- Geographic jurisdiction: Entire Province of Rizal (Antipolo City and 13 municipalities: Angono, Baras, Binangonan, Cainta, Cardona, Jalajala, Morong, Pililla, Rodriguez, San Mateo, Tanay, Taytay, and Teresa) spanning Sierra Madre upland watersheds, urban centers, lakeside settlements, and Talim Island.
- Dual-language operation: Tagalog/Filipino primary for accessible citizen reporting, with English available.
- Provincial and municipal office desktop/tablet environment for PG-ENRO/MENRO officers actively triaging reports, dispatching inspection teams, and resolving complaints.

## Capabilities and Constraints

- **Capabilities**:
  - Anonymous incident reporting with image upload and dual location capture (automatic GPS or manual pin/barangay selection).
  - Automated AI triage via Google Gemini running on serverless API, scoring severity (1–5), categorizing across 9 incident types, and producing officer reasoning.
  - Live officer dashboard with real-time Firestore sync (`onSnapshot`), leaflet map visualization with duplicate detection, and manual override capabilities.
  - Public status inquiry by reference code returning official status updates without leaking incident details.
  - Automated cron sweep (`/api/cron-triage`) and manual triage re-runs for failed evaluations.
- **Constraints**:
  - Republic Act No. 10173 (Data Privacy Act of 2012): Absolutely zero resident personal data (PII) collected. Exact coordinates and photos are restricted exclusively to authenticated MENRO personnel.
  - Zero-cost architecture bounds: Firebase Spark tier (compressed images stored in Firestore `report_images/{id}` under 1MB document limits; no Firebase Storage / Blaze plan), Vercel Hobby tier limits (60s execution timeout).
  - Pre-approved authentication: Officer accounts must be pre-provisioned in `officials/{uid}`; public self-registration is explicitly disabled.

## Brand Commitments

- Entity: Provincial Government - Environment and Natural Resources Office (PG-ENRO), Lalawigan ng Rizal, in coordination with local municipal MENROs.
- Voice: Civic, vigilant, community-protective, trustworthy, and authoritative ("Bantay Kalikasan").
- Language: Authentic everyday Filipino / Tagalog terminology paired with clean English.

## Evidence on Hand

- Production-grade codebase with active Firestore security rules (`firestore.rules`), security specification (`security_spec.md`), and serverless API handlers (`api/`).
- 9 established environmental categories and severity scale (1–5) configured in `src/types/report.ts` and `api/_lib/triage.ts`.
- Rizal provincial geographic context (14 LGUs and complete barangay registry, province-wide coordinates).
- Absences to preserve: No fabricated case studies, synthetic statistics, or unverified regulatory claims.

## Product Principles

- **Zero Barrier to Report**: Any resident can report an incident in seconds without login, identity disclosure, or heavy mobile bandwidth requirements.
- **Privacy by Architecture**: Resident privacy is guaranteed by database security rules and API boundaries, not just cosmetic UI measures.
- **AI Triage with Human Authority**: AI accelerates incident classification and prioritization, but municipal officers retain complete override and dispatch authority.
- **Graceful Offline Tolerance**: Intermittent connectivity in rural or lakeside areas does not drop reports; data is buffered locally and automatically synchronized.

## Accessibility & Inclusion

- Bilingual interface (Tagalog/Filipino and English) ensuring accessibility across diverse resident demographics.
- Mobile-first responsive layout with high-contrast UI elements and accessible touch targets for sunny outdoor conditions.
- Fallback manual barangay and landmark selection when geolocation permissions or hardware are unavailable.
