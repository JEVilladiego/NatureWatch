# NatureWatch

**NatureWatch** is a mobile-first environmental incident reporting and AI triage system for the Provincial Government of Rizal - Environment and Natural Resources Office (**PG-ENRO**) and local MENROs across **Rizal Province, Philippines** (Antipolo City and 13 municipalities).

Residents report illegal dumping, open burning, water pollution, illegal tree cutting, quarrying, and wildlife issues **without an account**. Each report is triaged by Google Gemini, and environmental officers manage cases on a live map dashboard with duplicate clustering and human-in-the-loop overrides.

---

## Architecture

| Layer | Technology | Cost |
|---|---|---|
| Frontend (PWA) | React 19, TypeScript, Tailwind v4, Leaflet | Vercel Hobby (free) |
| API | Vercel serverless functions in `api/` (`firebase-admin`, Gemini, Zod) | Vercel Hobby (free) |
| Database | Firebase **Firestore** (reports **and** compressed photos) | Firebase Spark (free) |
| Auth | Firebase Authentication (email/password, officials only) | Free |

There is **no Firebase Cloud Functions and no Firebase Storage**: nothing here requires the Blaze plan.

### Data flow

1. The resident fills in the form. The photo is compressed in the browser to roughly 100-250KB.
2. The client writes the report (`reports/{id}`) and the photo (`report_images/{id}`) in **one atomic Firestore batch**. Firestore's persistent cache queues it while offline and syncs it automatically when the connection returns.
3. Once the server confirms the write, the client calls `POST /api/triage { reportId }`.
4. `api/triage` claims the report (`pending` to `processing`) in a transaction, reads the description and photo **from Firestore** (never from the request), calls Gemini with a JSON schema, validates with Zod, and writes `aiTriage` and `triageStatus`. After two failed attempts the report is marked `failed` ("Needs manual review").
5. Officials sign in, see reports live (`onSnapshot`), override category/severity, and move cases through `pending`, `in_progress` and `resolved`.
6. Residents check progress with their reference code via `GET /api/status?code=BK-XXXXX`, which returns only the municipal action status.

If a resident closes the app before step 3, the report stays `pending`. Officials can press **Run AI triage again**, and a daily Vercel Cron job (`/api/cron-triage`) sweeps leftovers.

### API routes

| Route | Access | Purpose |
|---|---|---|
| `POST /api/triage` | public (only affects `pending` reports) | Run Gemini triage |
| `GET /api/status?code=` | public, rate limited | Safe status lookup |
| `POST /api/retry-triage` | officials | Re-run triage for a failed report |
| `POST /api/alert` | officials | Push alert for urgent reports (FCM topic `officials_urgent_alerts`) |
| `GET /api/cron-triage` | `CRON_SECRET` | Daily sweep of untriaged reports |

### Security and privacy (RA 10173)

- No resident personal data is collected.
- Photos and exact coordinates are readable only by officials (Firestore rules); the public lookup never returns them, and official names are hidden.
- An **official** is a user with a document at `officials/{uid}` (or a `role: official` custom claim). Email addresses are never trusted.
- Resident text is treated as untrusted data inside delimiters in the Gemini prompt.
- Clients can never write `aiTriage`, `triageStatus`, or delete anything. See [firestore.rules](firestore.rules) and [security_spec.md](security_spec.md).

---

## Categories and severity

Nine categories: `solid_waste`, `water_pollution`, `air_pollution_burning`, `illegal_logging_vegetation`, `illegal_quarrying_extraction`, `wildlife`, `noise_other`, `other`, `not_environmental`. Severity runs from 1 (cosmetic) to 5 (critical emergency). Definitions live in `src/types/report.ts` and the Gemini prompt in `api/_lib/triage.ts`.

---

## Setup

### 1. Firebase (console.firebase.google.com)
1. Create a project (stay on the free **Spark** plan; do **not** enable Storage).
2. **Build > Firestore Database** > Create database (production mode, region `asia-southeast1`).
3. **Build > Authentication** > Sign-in method > enable **Email/Password**. Then Settings > User actions: **disable "Enable create (sign-up)"** so nobody can self-register. Add each MENRO officer under Users.
4. Project settings > General > add a **Web app** and paste its config into [firebase-applet-config.json](firebase-applet-config.json) (set `firestoreDatabaseId` to `(default)` unless you named it).
5. Make someone an official: in Firestore create collection `officials`, with a document whose **ID is the user's UID** (from Authentication > Users). Any field works, e.g. `name`.
6. Project settings > Service accounts > **Generate new private key**. Use it only for the Vercel environment variables below. **Never commit it.**

### 2. Deploy the security rules
```bash
npm i -g firebase-tools
firebase login
# put your project ID in .firebaserc, then:
firebase deploy --only firestore:rules
```

### 3. Vercel
1. Import the repo (Framework: Vite).
2. Add the environment variables from [.env.example](.env.example): `GEMINI_API_KEY`, `GEMINI_MODEL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET` (and `FIREBASE_DATABASE_ID` if not `(default)`).
3. In Firebase Authentication > Settings > **Authorized domains**, add your `*.vercel.app` domain.

### Local development
```bash
npm install
cp .env.example .env     # fill in the values
npm run dev:api          # vercel dev: serves the app and the /api routes together
npm run dev              # frontend only (no /api)
npm run lint
```

---

## Known limitations

- Triage depends on the resident's device reaching `/api/triage` after the write is confirmed; the retry button and the daily cron are the safety nets.
- Firestore Spark limits (1 GiB storage, 20k writes/day) apply. Photos are the main storage cost; prune resolved reports after the 90-day retention period.
- Vercel Hobby functions are limited in duration (60s is configured). Gemini rate limits apply: configure billing alerts on the API key.
- Browser geolocation needs HTTPS and permission; the draggable pin and barangay selector are the fallbacks.
- The service worker file (`public/sw.js`) exists but is not registered yet.
