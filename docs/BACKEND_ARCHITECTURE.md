# NatureWatch: Backend Architecture & System Reference

Technical specification for NatureWatch's serverless backend, data pipelines, database models, and external service integrations.

---

## 1. Overview of the Serverless Architecture

NatureWatch uses a serverless event-driven architecture rather than a traditional monolithic application server (such as a standalone Express or Django daemon running 24/7 on a virtual machine).

The system consists of four primary infrastructure layers:

1. **Compute & API Endpoints**: Hosted on **Vercel Serverless Functions** (Node.js 22 LTS micro-services in the `/api` directory). Functions execute on-demand in isolated runtimes when requests arrive and terminate immediately after responding.
2. **Database & Real-Time Sync**: Hosted on **Google Cloud Firebase Firestore**, providing NoSQL document storage, client-side offline cache synchronization, and real-time document listeners via `onSnapshot`.
3. **AI Classification & Triage**: Orchestrated via `/api/triage`, calling the **Google Gemini 2.5 Flash** API with multimodal input (text description + compressed photo) along with ambient weather and protected area context.
4. **Satellite & Sensor Ingestion**: Executed via **Vercel Cron Jobs**, regularly querying the NASA FIRMS VIIRS active fire API and OpenWeatherMap telemetry for ambient weather conditions.

### Architectural Rationale
- **Cost & Maintenance**: By utilizing the serverless and free tiers of Vercel and Firebase Spark, the project incurs \$0 in idle compute and database hosting expenses, requiring no operating system updates or server daemon management.
- **Resilience**: Traffic spikes during community incidents or seasonal burn periods are absorbed by serverless scaling rather than overloading a fixed server process.
- **Privacy by Structure**: Sensitive operations (fetching report photos, full coordinates, and running AI analysis) are handled within secure serverless functions using private Firebase Admin credentials, never exposing database administrative access to client applications.

---

## 2. High-Level System Architecture

```
                                  +-------------------------------------------------------------+
                                  |                     NATUREWATCH CLIENTS                     |
                                  |                                                             |
                                  |  [Citizen Web Reporter (PWA)]      [MENRO Officer Dashboard] |
                                  +------------------------------+------------------------------+
                                                                 |
                                       +-------------------------+-------------------------+
                                       |                                                   |
                             HTTPS / JSON Post                                    Live WebSocket Sync
                           (Citizen / Admin API)                                     (onSnapshot)
                                       |                                                   |
                                       v                                                   v
      +---------------------------------------------------------------+    +-------------------------------+
      |              VERCEL SERVERLESS COMPUTE LAYER (/api)           |    |     GOOGLE CLOUD FIRESTORE    |
      |                                                               |    |       (NoSQL Document DB)     |
      |  - POST /api/triage       (Claim report, weather, Gemini AI)  |--->|                               |
      |  - GET  /api/status       (Anonymous case status lookup)      |    |  * reports/                   |
      |  - POST /api/sync-firms   (NASA VIIRS thermal ingestion)      |    |  * report_images/             |
      |  - POST /api/alert        (Urgent FCM notification dispatch)  |    |  * officials/                 |
      |  - GET  /api/cron-triage  (Daily sweep for untriaged reports) |    |  * auditLogs/                 |
      |  - GET  /api/cron-firms   (Daily satellite hotspot check)     |    |                               |
      +---------------+-------------------------------+---------------+    +---------------+---------------+
                      |                               |                                    ^
                      v                               v                                    |
      +-------------------------------+   +-------------------------------+                |
      |     EXTERNAL DATA SERVICES    |   |      GOOGLE GEMINI 2.5 FLASH  |                |
      |                               |   |                               |                |
      |  - NASA FIRMS VIIRS (375m)    |   |  - Multimodal Vision + Text   |----------------+
      |  - OpenWeatherMap API         |   |  - Spatial GIS Context        |  Writes category,
      |  - MGB Rizal Quarry Permits   |   |  - Zod Schema Validation      |  severity (1-5), and
      |  - 188+ Barangay Centroids    |   |  - Anti-Spam / Validity Check |  summary to Firestore
      +-------------------------------+   +-------------------------------+
```

---

## 3. Data Pipelines

### Pipeline A: Citizen Incident Intake & Offline Queue
1. **Submission**: Residents report incidents without requiring login or collecting personal contact information.
2. **Client-Side Compression**: Photos are scaled down using client-side canvas processing (~100–250 KB JPEG) to minimize mobile data usage.
3. **Atomic Firestore Batch**: Writes two documents simultaneously:
   - `reports/{id}`: Metadata, timestamp, coordinates, and report text.
   - `report_images/{id}`: Stores the compressed photo payload.
4. **Offline Handling**: If internet connectivity is unavailable, Firestore's persistent local cache stores the write. As soon as the device reconnects to network coverage, the write synchronizes with the cloud database.
5. **Triage Trigger**: Once the client receives confirmation of the Firestore write, it sends a `POST /api/triage { reportId }` request.

### Pipeline B: Automated AI Triage (`/api/triage`)
1. **Atomic Claim**: The serverless function begins a Firestore transaction checking that the report status is `pending`. It updates `triageStatus: 'processing'`, preventing duplicate processing.
2. **Data Isolation**: The function retrieves image data and description directly from the Firestore database using `firebase-admin`, rather than trusting arbitrary payload data from the HTTP request body.
3. **Context Gathering**:
   - Queries OpenWeatherMap for current atmospheric readings (wind speed, rain, humidity).
   - Checks whether the coordinates fall within known protected landscapes or watershed zones (e.g., Upper Marikina River Basin, Pamitinan, Kaliwa Watershed, Masungi Georeserve).
4. **Gemini API Call**: Ingests the entire photographic evidence deck (Primary close-up, Wide scene context, and Landmark orientation), resident description, atmospheric telemetry, and protected area directives into Gemini 2.5 Flash for composite multi-photo cross-verification.
5. **Schema Validation (Zod)**: Validates structured output containing:
   - `category`: One of 9 environmental categories.
   - `severity`: Integer rating from 1 (minor) to 5 (critical).
   - `confidence`: Confidence score (0.0 to 1.0).
   - `summary`: Short summary of the incident.
   - `reasoning`: Explanation referencing relevant environmental standards.
   - `isSpam`: Boolean indicator if the image or description is non-environmental or spam.
6. **Notification**: If the severity is 4 or 5 and not flagged as spam, the function triggers Firebase Cloud Messaging (FCM) to notify subscribed officer accounts.

### Pipeline C: NASA FIRMS Satellite Thermal Hotspot Ingestion
1. **Scheduled Ingestion**: A daily cron job (`/api/cron-firms`) runs at 06:00 UTC. Environmental officers can also trigger sync on demand via `POST /api/sync-firms`.
2. **Spatial Bounding Box**: Queries the NASA FIRMS VIIRS 375m sensor for thermal anomalies located within Rizal Province (`[121.09, 14.27, 121.46, 14.84]`).
3. **Spatial Overlap**: Compares coordinates against protected area boundaries and identifies the nearest barangay.
4. **Report Ingestion**: Automatically creates records prefixed with `SAT-` containing Fire Radiative Power (FRP) and brightness temperature values.

---

## 4. Serverless API Endpoint Reference

All backend endpoints are located in the `/api/` directory:

| Endpoint | Method | Access | Function | Notes |
|---|---|---|---|---|
| `/api/triage` | `POST` | Public | Initiates Gemini AI triage for a pending report | Rate-limited (20 req/min); reads directly from Firestore; idempotent |
| `/api/status` | `GET` | Public | Anonymous case status lookup | Rate-limited (30 req/min); validates format (`BK-XXXXX`); hides photos and coordinates |
| `/api/retry-triage` | `POST` | Officers | Retries triage for a failed or pending report | Requires Firebase ID token verification; checks `officials/{uid}` record |
| `/api/alert` | `POST` | Officers | Dispatches mobile push notifications | Authenticated; broadcasts to FCM topic `officials_urgent_alerts` |
| `/api/sync-firms` | `POST` | Officers | On-demand NASA satellite hotspot sweep | Authenticated; maximum execution limit of 60 seconds |
| `/api/cron-firms` | `GET` | Cron | Scheduled daily NASA satellite data ingestion | Protected by `Authorization: Bearer CRON_SECRET` |
| `/api/cron-triage` | `GET` | Cron | Scheduled daily sweep for untriaged reports | Protected by `Authorization: Bearer CRON_SECRET` |

---

## 5. Database Schema & Data Models

NatureWatch uses Google Cloud Firestore in native mode (`asia-southeast1` Singapore region).

### Collection: `reports`
```typescript
interface ReportDocument {
  id: string;                               // Unique document ID
  referenceCode: string;                    // Tracking code (e.g. "BK-HAGFS", "SAT-202610-01")
  createdAt: Timestamp;                     // Submission timestamp
  status: 'pending' | 'in_progress' | 'resolved' | 'spam';
  statusHistory: Array<{
    status: ReportStatus;
    changedAt: string;
    changedBy: 'resident' | string;         // Official UID or "resident"
    notes?: string;
  }>;
  location: {
    lat: number;                            // Latitude
    lng: number;                            // Longitude
    source: 'gps' | 'manual_pin';
    accuracyMeters: number | null;
    municipality: string;                   // One of 14 Rizal LGUs
    barangay: string;                       // Barangay name
    landmark?: string;
    geohash: string;                        // Geohash for spatial queries
  };
  rawInput: {
    description: string;                    // Resident-submitted text
    hasImage: boolean;
    exif?: {
      latitude?: number | null;
      longitude?: number | null;
      cameraModel?: string;
      captureTimestamp?: string;
    };
  };
  triageStatus: 'pending' | 'processing' | 'done' | 'failed';
  aiTriage?: {
    category: IncidentCategory;             // 9 environmental categories
    severity: 1 | 2 | 3 | 4 | 5;
    confidence: number;
    summary: string;
    reasoning: string;
    model: string;                          // "gemini-2.5-flash"
    triagedAt: string;
    weather?: WeatherContext;               // Weather at incident time
    airQuality?: AirQualitySnapshot;
    protectedZone?: ProtectedZoneHit;       // Overlap with protected areas
    isSpam: boolean;
    authenticity: {
      isPlausible: boolean;
      isSyntheticOrStock: boolean;
      consistencyScore: number;
      forensicNotes: string;
    };
  };
  final?: {                                 // Officer Override Values
    category: IncidentCategory;
    severity: 1 | 2 | 3 | 4 | 5;
    overriddenBy: string;
    overriddenAt: string;
    notes?: string;
  };
  duplicateClusterId?: string | null;       // Spatial cluster identifier
  satelliteHotspot?: SatelliteHotspotData;  // Data populated for NASA FIRMS records
}
```

### Collection: `report_images`
- `id`: Matches the corresponding `reportId`.
- `data`: Base64 string of compressed JPEG image (~100–250 KB).
- `createdAt`: Timestamp.
- *Keeping image data in a separate collection ensures queue queries against `reports` do not download heavy image payloads unnecessarily.*

### Collection: `officials`
- `id`: Matches the Firebase Auth user UID.
- `name`: Officer name.
- `municipality`: Assigned LGU jurisdiction.
- `role`: `'official'` or `'admin'`.
- *Only authenticated users with a corresponding document in this collection can access report images, view exact GPS data, or submit status overrides.*

---

## 6. GIS Spatial Integration

Spatial queries and boundary calculations are implemented in TypeScript using GeoJSON datasets:

1. **Provincial Boundary**:
   - `public/geojson/rizal-boundary.geojson` defines the jurisdiction limits for coordinate validation.
2. **MGB Quarry Mining Permits**:
   - `public/geojson/rizal-mgb-quarries.geojson` provides boundaries and status (active, exploration, cancelled) from MGB Region IV-A.
   - The system checks distance relative to these boundaries to assist officers in determining whether quarrying is authorized.
3. **Protected Landscapes & Watersheds**:
   - `public/geojson/rizal-protected-areas.geojson` covers the Upper Marikina River Basin, Kaliwa Watershed, Pamitinan, Hinulugang Taktak, and Masungi Georeserve.
   - Used during AI triage and on the dashboard map to flag incidents inside conservation areas.
4. **188+ Rizal Barangay Centroids**:
   - `src/lib/barangayCoordinates.ts` contains coordinates for all official barangays across Rizal.
   - Used as a fallback position when users select a barangay manually without pinpointing an exact location.

---

## 7. Data Privacy & Security (RA 10173)

- **Anonymous Intake**: The citizen reporting form does not collect names, contact numbers, email addresses, or national identification.
- **Redacted Public Status**: The public endpoint `/api/status` returns workflow stages only. It does not return photos, exact coordinates, or officer names.
- **Access Control via Firestore Rules**: [firestore.rules](firestore.rules) allows public creation of reports with strict schema validation, while read access to report evidence and write access to triage fields are restricted to authenticated officials.
- **No Client Deletion**: Clients have no permission to delete reports from the database.

---

## 8. Field Inspection Dispatch Worksheet

- **Component**: [FieldInspectionModal.tsx](file:///home/jevilladiego/Documents/NatureWatch/src/components/FieldInspectionModal.tsx).
- **Function**: Compiles report information into a standardized document format for printing.
- **Contents**:
  - Official header and incident reference code.
  - Incident category, severity rating, and timestamp.
  - Resolved coordinates, barangay, municipality, and a Google Maps navigation link.
  - Proximity to nearest MGB quarry permit and protected area classification.
  - Standard checklist for field officers (site assessment, evidence collection, inspector signature lines).
- **Print Layout**: Mounted via React Portal (`document.body`) with `@media print` rules to ensure proper page breaks and full document rendering on A4 portrait paper.

---

## 9. Technical FAQ & Design Decisions

#### Why use a serverless architecture with Firebase and Vercel instead of a traditional VM server?
For an LGU environmental office, minimizing operational overhead and ongoing hosting costs is a key priority. A dedicated server requires operating system updates, firewall maintenance, and consistent hosting fees regardless of traffic. A serverless design scales automatically during incident spikes, runs on zero-cost tiers under normal usage, and reduces server management responsibilities.

#### How does the system handle submissions when a user is offline?
Firestore includes an offline persistence cache. When a resident submits a report without network connectivity, the write is recorded in the local cache immediately. Once the device reconnects to mobile data or Wi-Fi, the batch write synchronizes with the cloud database, after which the automated triage process is triggered.

#### How are API endpoints protected against unauthorized or excessive AI requests?
The `/api/triage` endpoint only accepts a `reportId` parameter and operates exclusively on reports currently marked as `pending`. It does not accept arbitrary prompt text or image files in the request body, fetching the required data directly from Firestore via administrative credentials. Rate limiting is also applied per IP address.

#### How does the architecture protect user privacy under Republic Act No. 10173?
No personally identifiable information is collected during report creation. The public tracking feature (`/api/status`) redacts exact coordinates, photos, and officer identities, displaying only the progress milestones of the report.

#### What happens if the Gemini API is unreachable or rate-limited?
If an AI evaluation call fails, the report is marked as `triageStatus: 'failed'`. The incident remains in the dashboard queue and is flagged for manual review by an officer. Officers can also trigger a re-triage from the dashboard, and a scheduled daily cron job checks for any pending or failed reports.

#### How are non-environmental or duplicate submissions filtered?
Gemini evaluates submissions against 9 environmental categories and flags non-environmental submissions or potential spam. On the dashboard, reports located within ~100 meters of each other in the same category are grouped under a cluster identifier to help officers detect duplicate complaints.

#### How does the AI handle multiple submitted photos?
When residents attach multiple photos (up to 3 slots: Primary, Wide Scene, and Landmark), the serverless function feeds all images simultaneously into Gemini's multimodal context window. The system instruction directs the model to cross-correlate all viewpoints—for example, preventing false emergency escalations if an isolated close-up looks like an active fire but wide-scene imagery reveals a benign domestic cookstove or non-hazardous environment.

#### How does the system cross-reference quarry reports with legal permits?
The application includes GeoJSON boundaries of official MGB Region IV-A mining tenements. When reviewing a quarry incident, the system calculates distance from official permit zones, showing whether the coordinates fall inside an active permit, within a 500-meter buffer, or in an unauthorized area.

#### How is NASA FIRMS satellite data ingested and utilized?
A scheduled cron job queries NASA's VIIRS 375m sensor endpoint for thermal anomalies within Rizal's bounding box. Any detected anomalies are checked against protected area boundaries and recorded as satellite incidents (`SAT-` prefix) on the dashboard map.

#### How are permissions and data integrity enforced in Firestore?
Security is enforced at the database level through declarative rules in `firestore.rules`. Unauthenticated users may only write reports conforming to strict schema requirements. Internal fields (such as `aiTriage` and `triageStatus`) and access to stored photos are restricted to verified accounts in the `officials` collection.

#### How are field inspection worksheets generated and printed?
The dashboard includes a worksheet generator that compiles the incident dossier, coordinates, GIS zone proximity, and an inspector checklist into a formatted view. The component is portaled directly into `document.body` and utilizes print media queries to render cleanly on standard A4 paper without interface clipping.

---

## 10. Code Verification Commands

```bash
# TypeScript compilation check
npm run lint

# Check for unused local variables
npx tsc --noEmit --noUnusedLocals

# Validate GeoJSON layers and barangay coordinates
npm run check:data

# Production build
npm run build
```
