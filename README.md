# BantayKalikasan

**BantayKalikasan** is a mobile-first environmental incident reporting and AI triage system developed for local government units (LGUs), specifically designed for the Municipal Environment and Natural Resources Office (MENRO) of **Binangonan, Rizal, Philippines**.

It empowers residents to report illegal dumping, open burning, water pollution, illegal tree cutting, or unauthorized quarrying without creating an account. Each report is automatically triaged by a Google Gemini Flash model, while MENRO officers monitor a live GIS dashboard with duplicate spatial clustering and human-in-the-loop overrides.

---

## Key Architecture Decisions

1. **Offline-First & AI-Decoupled**:
   - The resident client **never waits on Gemini**. Reports are written to Firestore immediately with `triageStatus: "pending"` and queued locally via `persistentLocalCache` with multi-tab support.
   - Images are compressed client-side (~500KB, max 1600px) and uploaded via an IndexedDB retry queue with exponential backoff.
   - Triage runs asynchronously on the backend / Cloud Function, passing inline bytes to Gemini rather than public URLs.
2. **Failure-Tolerant AI**:
   - Gemini responses are strictly constrained to JSON schemas and validated server-side using **Zod**.
   - If Gemini fails or times out after 2 retries, `triageStatus` transitions to `"failed"`. The report still appears on the dashboard with a `"Needs manual review"` badge.
3. **Human in the Loop**:
   - AI outputs are recommendations. Officials can adjust category and severity in `final`. The dashboard presents `final` when available, falling back to `aiTriage`.
4. **Untrusted Input Protection**:
   - Resident descriptions are treated strictly as untrusted data enclosed within delimiters (`<untrusted_resident_description>`). System prompts instruct Gemini to ignore prompt injection attempts.
5. **Philippine Data Privacy Act (RA 10173) Compliance**:
   - Zero resident Personally Identifiable Information (PII) is captured.
   - Evidence photos are kept in non-public Cloud Storage and loaded via authenticated signed URLs / secure proxies.
   - Public reference status lookups (`/status/[referenceCode]`) display solely the municipal action status, never exposing photos or exact coordinates.
   - Data retention: Reports are retained for 90 days after case resolution before archiving.

---

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4, Progressive Web App (PWA) with Service Worker and Web App Manifest
- **Map & GIS**: Leaflet with OpenStreetMap tiles, draggable pin picker, and severity marker clustering
- **Database & Auth**: Firebase Firestore (Enterprise free tier) & Firebase Authentication
- **AI**: Gemini (`@google/genai` TypeScript SDK, defaulting to `gemini-3.8-flash`)
- **Validation**: Zod schema validation
- **Backend / Cloud Functions**: Express.js dev & production server (`server.ts`) + standalone Firebase Cloud Function (`functions/src/index.ts`)

---

## Category & Severity Standards

### 9 Core Categories (Single Source of Truth)
- `solid_waste`: Illegal dumping, uncollected trash, estero / creek clogging
- `water_pollution`: Sewage discharge, chemical sludge, Laguna de Bay runoff
- `air_pollution_burning`: Open burning (*siga*), burning of rubber/plastics, toxic smoke
- `illegal_logging_vegetation`: Unauthorized tree cutting, watershed clearing in upland hills
- `illegal_quarrying_extraction`: Unauthorized gravel/soil extraction, slope stripping
- `wildlife`: Poaching, endangered raptor / bird selling, distressed wildlife
- `noise_other`: Heavy generator noise, industrial vibration
- `other`: Legitimate environmental hazards not listed above
- `not_environmental`: Potholes, parking, civil disputes, or irrelevant photos

### Severity Scale (1 - 5)
- **1**: Minor / cosmetic litter, isolated dry trash
- **2**: Low concern, localized dust or nuisance
- **3**: Moderate hazard, clogged creek, action needed within 3-5 days
- **4**: Urgent hazard, active plastic burning, water supply pollution
- **5**: Critical emergency, toxic chemical discharge into Laguna de Bay, massive landslide risk

---

## Firebase Deployment & Setup

### 1. Deploy Firestore & Storage Security Rules
The rules have already been provisioned and deployed via the AI Studio Firebase Fax service:
```bash
firebase deploy --only firestore:rules,storage:rules
```

### 2. Deploy Cloud Functions
To deploy the automated asynchronous triage Cloud Function:
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### 3. Grant Custom Claims to Officials
Authorized MENRO staff require the `role: "official"` custom claim or can sign in via their registered official email:
```javascript
// admin-script.js
const admin = require('firebase-admin');
admin.initializeApp();

async function setOfficialRole(uid) {
  await admin.auth().setCustomUserClaims(uid, { role: 'official' });
  console.log(`Granted official role to ${uid}`);
}

setOfficialRole('OFFICIAL_UID_HERE');
```

### 4. Firebase App Check (reCAPTCHA v3 / Turnstile)
In the Firebase Console:
1. Navigate to **App Check** -> **Apps**.
2. Register your web app domain with **reCAPTCHA v3** or **Cloudflare Turnstile**.
3. Enforce App Check on **Cloud Firestore** and **Cloud Storage**.

---

## Seed Data for Binangonan, Rizal

The application includes 15 realistic seed incident reports spanning lakeside and upland barangays (Batingan, Calumpang, Tagpos, Pantok, Darangan, Talim Island, Layunan, Libis, Pag-asa).

- You can click **"Load 15 Demo Reports"** on the MENRO Dashboard to immediately populate and test map clustering, filters, and human overrides.
- Or trigger programmatically:
  ```bash
  curl -X POST http://localhost:3000/api/seed
  ```

---

## Known Limitations

- **Browser Geolocation**: Mobile browsers require HTTPS and user permission to acquire high-accuracy GPS. The app provides a draggable map pin and a barangay selector as fallbacks.
- **Client Offline Storage**: IndexedDB offline image queues depend on device storage limits.
- **Gemini Rate Limits**: In production, configure Google Cloud billing alerts and rate limits on the Gemini API key.
