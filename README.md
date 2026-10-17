# AthletePulse — Sports Injury-Awareness & Athlete-Coach Platform

> Production-minded, security-hardened backend and responsive web platform connecting athletes with their coaching staff through structured training logs, natural language discomfort reporting, clinical safety triage, and closed-loop feedback.

---

## ⚡ Tech Stack & Architecture

- **Framework**: Next.js App Router (TypeScript, Node.js runtime)
- **Database**: MongoDB Atlas with Mongoose ODM (Indexes, compound unique constraints, automated in-memory fallback)
- **Validation**: Zod runtime schema validation on all inputs, environment variables, and AI responses
- **Authentication**: Real signed JWT sessions stored in `HttpOnly`, `Secure` (in production), `SameSite=Lax` cookies + Bearer token support
- **Cryptography**: `bcryptjs` password hashing with salt rounds
- **AI Extraction**: Groq / OpenAI-compatible JSON extraction with deterministic rule-based zero-downtime fallback
- **REST APIs**: Full RESTful suite structured under `/api/v1`

---

## 🔒 Security & Data Isolation Architecture

1. **Identity Resolution**: Identity and role permissions are strictly resolved from authenticated sessions. The server **never** trusts client-supplied `userId` or `role`.
2. **Cross-User Data Isolation**:
   - **Athletes** can access **only** their own logs and received feedback. Querying any record belonging to another athlete immediately returns `404 Not Found` (never leaks record existence).
   - **Coaches** can access **only** athletes assigned to their roster (`coachId === coach._id`). Attempting to access an unassigned athlete returns `404 Not Found`.
3. **Password Protection**: Passwords are hashed with bcrypt. User password hashes are marked `{ select: false }` in Mongoose and are never exposed in queries or JSON payloads.
4. **Rate Limiting**: In-memory sliding window rate limiter protects sensitive endpoints (`/api/v1/auth/login`, `/api/v1/auth/register`) against brute force and registration spam.
5. **CSRF & Safe Headers**: HttpOnly cookies with SameSite lax policies prevent cross-site request forgery and script access.
6. **Safe Error Handling**: Centralized error interceptor shields stack traces and database secrets from client responses.

---

## 🏥 Clinical Safety & Triage Rules

AthletePulse is a training logbook and communication platform, **not a clinical diagnostic device**.

1. **Preserved Original Text**: Athletes describe workouts and symptoms in everyday language. Original text is preserved completely unchanged and auditable.
2. **Transparent Review Escalation**:
   - **Reported Severity**: Athlete self-reported 0–10 rating.
   - **Review Priority**: Conservative rule-based indicator (`urgent`, `high`, `medium`, `low`) directing coach triage attention.
   - **Transparent Flags**: The system records and displays the exact user-reported terms that triggered the priority (e.g. `Flagged term: "pop"`, `Flagged term: "numbness"`).
3. **Emergency Red Flag Escalation**:
   - Symptoms describing acute trauma (e.g. `cannot bear weight`, `loss of consciousness`, `deformity`, `chest pain`) immediately display urgent-care guidance in the portal rather than waiting for coach review.
4. **Symptom Patterns Disclaimer**:
   - Recurring complaints over a 14 or 30-day window are explicitly labeled:  
     `"Pattern in reported symptoms (not a predicted injury)"`.
5. **Human Clinical Authority**:
   - AI never diagnoses injuries, predicts risk, or prescribes rehabilitation routines. Coaches and qualified clinicians decide training modifications.

---

## 📦 Data Models

### 1. User (`src/models/User.ts`)
- `_id`: ObjectId
- `name`: string
- `email`: string (unique, normalized lowercase)
- `passwordHash`: string (bcrypt hash, excluded by default)
- `role`: `'athlete' | 'coach'`
- `sport`: string (e.g. "Competitive Swimming", "Marathon Running")
- `coachId`: ObjectId reference to User (assigned coach for athletes)
- `createdAt`, `updatedAt`: Date (UTC)

### 2. DailyLog (`src/models/DailyLog.ts`)
- `_id`: ObjectId
- `athleteId`: ObjectId reference to User (indexed)
- `workoutDescription`: string (original workout text preserved)
- `discomfortText`: string (original discomfort text preserved)
- `activity`: string
- `durationMinutes`: number (optional)
- `energyLevel`: number (1–10)
- `fatigueLevel`: number (1–10)
- `affectedBodyPart`: string (e.g. "knee", "shoulder", "hamstring", "achilles")
- `bodySide`: `'left' | 'right' | 'bilateral' | 'center' | 'unspecified'`
- `symptomType`: `'sharp_pain' | 'dull_ache' | 'tightness' | 'stiffness' | 'swelling' | 'throbbing' | 'soreness' | 'weakness' | 'numbness_tingling' | 'other' | 'none'`
- `onset`: `'acute' | 'gradual' | 'insidious' | 'post_workout' | 'unknown'`
- `reportedSeverity`: number (0–10)
- `extractionConfidence`: number (0.0–1.0)
- `extractionStatus`: `'not_requested' | 'pending' | 'success' | 'failed' | 'fallback'`
- `reviewPriority`: `'urgent' | 'high' | 'medium' | 'low'` (indexed)
- `reviewStatus`: `'pending' | 'reviewed' | 'addressed' | 'dismissed'` (indexed)
- `triageFlags`: string[] (transparent triggering words)
- `emergencyGuidance`: string (immediate clinical warning if acute red flags detected)
- `reviewNotes`: string (coach notes)
- `reviewedBy`: ObjectId reference to User
- `reviewedAt`: Date
- `idempotencyKey`: string (sparse index for duplicate prevention)
- `createdAt`, `updatedAt`: Date (UTC)

### 3. CoachFeedback (`src/models/CoachFeedback.ts`)
- `_id`: ObjectId
- `athleteId`: ObjectId reference to User (indexed)
- `coachId`: ObjectId reference to User (indexed)
- `logId`: ObjectId reference to DailyLog (indexed)
- `message`: string (coach guidance text)
- `activityModification`: string (human-authored training modifications)
- `acknowledgementStatus`: `'pending' | 'acknowledged'` (indexed)
- `acknowledgedAt`: Date (UTC timestamp of receipt confirmation)
- `createdAt`, `updatedAt`: Date (UTC)

### 4. Notification (`src/models/Notification.ts`)
- `_id`: ObjectId
- `recipientId`: ObjectId reference to User (indexed)
- `type`: `'new_report' | 'new_feedback' | 'feedback_acknowledged'`
- `title`: string
- `message`: string
- `relatedLogId`: ObjectId reference to DailyLog
- `relatedFeedbackId`: ObjectId reference to CoachFeedback
- `readAt`: Date or null
- `createdAt`, `updatedAt`: Date (UTC)

---

## 🌐 Complete API Reference (`/api/v1`)

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register new account with rate-limiting & bcrypt hashing |
| `POST` | `/api/v1/auth/login` | Public | Authenticate credentials & emit HttpOnly session cookie |
| `POST` | `/api/v1/auth/logout` | Public | Clear session cookie |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieve current user profile & assigned coach/athlete counts |
| `POST` | `/api/v1/logs` | Athlete | Submit daily workout & discomfort log with AI triage & idempotency |
| `GET` | `/api/v1/logs/mine` | Athlete | Paginated list of personal logs with date/status filters |
| `GET` | `/api/v1/logs/:id` | Athlete / Assigned Coach | Retrieve individual log (strictly verified; returns 404 on unassigned) |
| `PATCH` | `/api/v1/logs/:id` | Athlete / Assigned Coach | Correct extracted fields (athlete) or update review status (coach) |
| `GET` | `/api/v1/coach/dashboard` | Coach | Paginated triage dashboard: counts, recurring symptom patterns, prioritized queue |
| `GET` | `/api/v1/coach/athletes` | Coach | List athletes assigned to this coach's roster with active metrics |
| `GET` | `/api/v1/coach/athletes/:athleteId/logs` | Coach | Retrieve logs for an assigned athlete (verified roster) |
| `GET` | `/api/v1/coach/athletes/:athleteId/history` | Coach | Recurring complaint timeline over configurable window (14–30 days) |
| `GET` | `/api/v1/coach/logs/:logId` | Coach | Detailed report review: source text, AI extraction confidence, audit history |
| `PATCH` | `/api/v1/coach/logs/:logId/review` | Coach | Update review status (`reviewed`, `addressed`, `dismissed`) with notes |
| `POST` | `/api/v1/coach/logs/:logId/feedback` | Coach | Create non-destructive feedback & activity modifications |
| `GET` | `/api/v1/feedback/mine` | Athlete | Retrieve all feedback received from coaching staff |
| `PATCH` | `/api/v1/feedback/:id/acknowledge` | Athlete | Acknowledge received coach feedback with UTC timestamp |
| `GET` | `/api/v1/athletes/:athleteId/body-map-history` | Athlete / Assigned Coach | Aggregated anatomical hotspots & severity breakdown |
| `GET` | `/api/v1/notifications` | Authenticated | List in-app notifications with unread count |
| `PATCH` | `/api/v1/notifications/:id/read` | Authenticated | Mark notification as read |

---

## 🚀 Setup & Local Execution

### 1. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure your environment variables:
```env
# Optional MongoDB Atlas URI. If left blank or unset, AthletePulse automatically boots an in-memory MongoDB!
MONGODB_URI=

# Secret for signing session cookies
SESSION_SECRET=super-secure-athletepulse-session-secret-key-32-chars-min

# Optional LLM Provider (groq / openai). If unset, the deterministic clinical rule-based engine runs with zero downtime!
AI_PROVIDER=
GROQ_API_KEY=
OPENAI_API_KEY=
AI_MODEL=llama-3.3-70b-versatile

APP_URL=http://localhost:3000
NODE_ENV=development
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Automated Tests
Execute the 36-test integration suite:
```bash
npm run test
```
*Tests verify bcrypt cryptography, JWT cookies, role permissions, AI extraction fallbacks, emergency red flags, feedback loops, and cross-user data isolation (proving Athlete A cannot read Athlete B's logs and unassigned coaches receive 404s).*

### 4. Seed Fictional Demo Accounts
```bash
npm run seed
```

#### Demo Accounts Created:
1. **Assigned Coach**: `coach@athletepulse.test` / `password123` (Coach Marcus Vance)
2. **Athlete 1**: `elena.swimmer@athletepulse.test` / `password123` (Elena Rostova - Swim)
3. **Athlete 2**: `marcus.runner@athletepulse.test` / `password123` (Marcus Miller - Marathon)
4. **Stranger Coach**: `stranger.coach@athletepulse.test` / `password123` (Coach Lisa Ray - demonstrates cross-user boundary)
5. **Solo Athlete**: `solo.athlete@athletepulse.test` / `password123` (David Chen)

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deployment Instructions

1. **MongoDB Atlas**:
   - Create a MongoDB Atlas free-tier cluster.
   - Whitelist network IP addresses (`0.0.0.0/0` for serverless Vercel).
   - Copy connection string to `MONGODB_URI`.
2. **Vercel**:
   - Import the repository into Vercel.
   - Set environment variables: `MONGODB_URI`, `SESSION_SECRET`, `NODE_ENV=production`, `APP_URL=https://your-domain.vercel.app`.
   - Build command: `npm run build`
   - Output directory: Default (`.next`).
3. **Run Production Verification**:
   ```bash
   npm run build
   npm run start
   ```
