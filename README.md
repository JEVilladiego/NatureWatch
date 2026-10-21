# NatureWatch

NatureWatch is an environmental incident reporting and management system for Rizal Province, Philippines (covering Antipolo City and 13 municipalities).

It allows residents to submit incident reports—such as illegal waste dumping, open burning (*siga*), water pollution, unauthorized tree cutting, or quarrying concerns—without needing to create an account. Submitted reports receive automated initial categorization and severity assessment via Google Gemini, while provincial and municipal environmental officers review cases, inspect spatial GIS overlays, and generate field inspection worksheets from a web dashboard.

---

## Features

- **Incident Reporting**:
  - Web-based reporting form accessible on mobile and desktop.
  - Client-side image compression (~100–250 KB) to reduce upload bandwidth.
  - Location selection via device GPS, draggable map pin, or municipality and barangay dropdowns.
  - Offline write buffering using Firestore's local cache for areas with weak connectivity.
  - Anonymous submission: no account creation or personal contact information required.

- **AI-Assisted Triage (Google Gemini)**:
  - Generates initial category recommendation across 9 environmental categories (`solid_waste`, `water_pollution`, `air_pollution_burning`, `illegal_logging_vegetation`, `illegal_quarrying_extraction`, `wildlife`, `noise_other`, `other`, `not_environmental`).
  - Estimates severity rating on a 1–5 scale.
  - Provides a short summary and reasoning for reviewing officers.
  - Ingests ambient weather context (temperature, wind, precipitation) and checks whether the coordinate falls within a known protected area.
  - Flags non-environmental or suspicious submissions for manual officer review.

- **Officer Dashboard**:
  - Authenticated view for environmental officers (PG-ENRO and local MENROs).
  - Real-time incident queue updated via Firestore listeners.
  - Human-in-the-loop override: officers can adjust categories, severities, and case status (`pending`, `in_progress`, `resolved`, `spam`).
  - Spatial grouping: detects nearby reports within ~100 meters to identify duplicate complaints.

- **GIS Mapping & Reference Layers**:
  - Province and municipal boundary outlines.
  - Quarry permit boundaries and status based on Mines and Geosciences Bureau (MGB Region IV-A) data.
  - Protected area boundaries (e.g., Upper Marikina River Basin Protected Landscape, Kaliwa Watershed, Pamitinan, Hinulugang Taktak, Masungi Georeserve).
  - Barangay centroid dataset for Rizal Province to resolve approximate locations when exact GPS is unavailable.

- **Satellite Thermal Hotspots (NASA FIRMS)**:
  - Integration with NASA FIRMS (VIIRS 375m sensor) for thermal anomaly and active fire detection across Rizal's bounding box.
  - Automated daily check via scheduled cron job and manual sync option on the dashboard.

- **Field Inspection Worksheet**:
  - Generates a printable A4 inspection sheet containing case details, coordinates, Google Maps navigation link, GIS zone context, and an on-site checklist for field inspectors.

- **Public Status Tracking**:
  - Residents can check the progress of their report using an anonymous reference code (e.g., `BK-XXXXX`).
  - Returns only workflow status and timeline without exposing photos, exact coordinates, or officer identities.

- **Language Support**:
  - Interface available in Filipino (Tagalog) and English.

---

## System Architecture

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Leaflet | Responsive web interface for residents and officers |
| **API Layer** | Vercel Serverless Functions (`api/`), Node.js | Backend endpoints for triage, status lookup, and data synchronization |
| **Database** | Google Cloud Firebase Firestore | NoSQL document database with real-time updates and offline caching |
| **Authentication** | Firebase Authentication | Email/password sign-in restricted to pre-authorized officer accounts |
| **AI Triage** | Google Gemini 2.5 Flash (`@google/genai`) | Multimodal analysis of report text, photos, and contextual data |
| **Remote Sensing** | NASA FIRMS VIIRS | Thermal hotspot data for active fire monitoring |
| **Weather Data** | OpenWeatherMap API | Ambient atmospheric conditions for incident context |

> For in-depth architectural details, API endpoint documentation, and database schemas, see [docs/BACKEND_ARCHITECTURE.md](docs/BACKEND_ARCHITECTURE.md).

---

## Data Flow

```
1. Resident Submits Report
   └── Image compressed in browser (~150KB)
   └── Written to Firestore (reports/ and report_images/) in an atomic batch
   └── Stored in local cache first if offline

2. Backend Triage (/api/triage)
   └── Triggered once the report is saved to Firestore
   └── Claims the report in a Firestore transaction
   └── Retrieves image, current weather, and protected area intersection
   └── Calls Gemini API with structured schema validation
   └── Updates report with category, severity (1-5), summary, and reasoning
   └── Sends push notification for high-severity reports (severity >= 4)

3. Officer Review & Management
   └── Officers log in to view real-time incident queue on Leaflet map
   └── Review AI suggestions, photo evidence, and GIS overlaps
   └── Override category or severity if needed, update status, and add notes
   └── Generate printable Field Inspection Worksheet for deployed personnel

4. Public Status Lookup (/api/status)
   └── Resident enters reference code (BK-XXXXX)
   └── Returns current status history and municipal action stage
   └── Coordinates, photos, and officer details remain private
```

---

## Privacy and Security (RA 10173)

- **No Personal Data Collection**: The public reporting form does not request citizen names, phone numbers, email addresses, or identification.
- **Data Redaction in Public Lookup**: The public status endpoint (`/api/status`) returns only workflow milestones. Exact GPS coordinates, photos, and officer names are never returned to public queries.
- **Role-Based Access**: Officer access requires an authenticated account present in the `officials` Firestore collection. Public self-registration is disabled.
- **Database Rules**: Firestore security rules ([firestore.rules](firestore.rules)) enforce field validation, character length limits, coordinate boundaries, and prevent client-side deletions.
