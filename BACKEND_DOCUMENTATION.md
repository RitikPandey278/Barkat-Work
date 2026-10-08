# BarkatWork Backend Documentation

## 1. Overview

This backend is an Express API with two authentication endpoints:

- `POST /api/auth/send-otp`
- `POST /api/auth/verify-otp`

The backend uses:

- Firebase Admin SDK + Firestore for users and OTP request storage.
- Baileys for sending OTP messages through a linked WhatsApp account.
- JWT for the login/registration token returned after OTP verification.
- bcryptjs for hashing registration passwords.

Important: this is not Firebase Phone Authentication. Firebase is being used as a server-side database through Firestore. The OTP is generated and verified by this backend.

## 2. Request flow

```text
Client
  -> POST /api/auth/send-otp
  -> Express router
  -> authController.sendOtp
  -> authService.findUser / createOtp
  -> Firestore: Users and otpRequests
  -> whatsappService.sendWhatsAppMessage
  -> WhatsApp recipient

Client
  -> POST /api/auth/verify-otp
  -> Express router
  -> authController.verifyOtp
  -> authService.verifyOtp
  -> Firestore lookup and hash comparison
  -> optional user create/update
  -> JWT token response
```

## 3. How OTP is sent

### Step 1: Mobile normalization

The number is converted to digits only. A 10-digit Indian number receives the `91` country code. Numbers with 11 to 15 digits are accepted as-is.

Examples:

- `9876543210` becomes `919876543210`.
- `+91 9876543210` becomes `919876543210`.

### Step 2: User lookup

The server checks the Firestore `Users` collection. It first checks a document whose ID is the normalized mobile number, then queries the `mobile` field as a fallback.

### Step 3: OTP generation and storage

The server generates a cryptographically random 6-digit OTP using `crypto.randomInt(100000, 1000000)`.

It does not store the plain OTP. It stores a SHA-256 hash in `otpRequests/{mobile}` with:

- `mobile`
- `purpose`: `LOGIN` or `REGISTER`
- `name` for registration
- `passwordHash` for registration
- `otpHash`
- `expiresAt`: current time + 5 minutes
- `createdAt`

One mobile number has one active OTP record. Sending another OTP overwrites the previous record.

### Step 4: WhatsApp delivery

`whatsappService.js` uses Baileys and the session stored in `auth_info_baileys/`. The server:

1. Checks that a WhatsApp socket is connected.
2. Checks the recipient with `socket.onWhatsApp()`.
3. Sends text to `{normalizedNumber}@s.whatsapp.net`.

The registration or login OTP is therefore sent through the linked WhatsApp account, not through SMS and not through Firebase Auth.

## 4. Send OTP endpoint

### URL

`POST /api/auth/send-otp`

### Registration body

```json
{
  "mobile": "9876543210",
  "name": "Example User",
  "password": "at-least-6-chars",
  "isLogin": false
}
```

For a new mobile number, `name` is required and the password must be at least 6 characters long.

### Login body

```json
{
  "mobile": "9876543210",
  "isLogin": true
}
```

If `isLogin` is true and the user does not exist, the endpoint returns `404`.

### Success responses

Registration:

```json
{
  "success": true,
  "message": "Registration OTP sent successfully",
  "isNewUser": true
}
```

Login:

```json
{
  "success": true,
  "message": "Login OTP sent successfully",
  "isNewUser": false
}
```

### Common errors

- `400`: invalid mobile, or missing/short registration details.
- `404`: login requested for an unregistered mobile.
- `503`: Firebase or WhatsApp OTP service failed.

## 5. OTP verification endpoint

### URL

`POST /api/auth/verify-otp`

### Body

```json
{
  "mobile": "9876543210",
  "otp": "123456"
}
```

The OTP must be exactly 6 digits.

### Verification sequence

1. Normalize the mobile number.
2. Read `otpRequests/{mobile}`.
3. Reject when the record does not exist.
4. Reject when `expiresAt` is older than the current time.
5. SHA-256 hash the submitted OTP and compare it with `otpHash`.
6. For `REGISTER`, create a user when one does not already exist.
7. For `LOGIN`, require an existing user and mark it verified.
8. Delete the OTP request after successful verification.
9. Return a JWT that expires in 30 days.

### Successful response

```json
{
  "success": true,
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": "...",
    "name": "...",
    "mobile": "...",
    "role": "USER",
    "isVerified": true
  }
}
```

The response does not return the password hash or OTP hash.

## 6. Firestore usage

### `Users` collection

Typical user document fields:

```text
mobile
name
passwordHash
role: "USER"
isVerified: true
createdAt
updatedAt (after login verification)
```

### `Seekers` job notifications

Job broadcasts read both `Users` and `Seekers`. A profile matches a job when
its `skill`/`category` and `location`/`city` match the job's
`category`/`title` and `location`/`city` (case-insensitive partial matching).
The profile can provide `mobile` or `phone`. Set `whatsappNotifications` or
`pushNotifications` to `false` to opt out.

For direct OneSignal push delivery, store the subscription ID in
`oneSignalPlayerId`, `onesignalPlayerId`, or `playerId`. If no matching profile
has a player ID, the service falls back to the existing OneSignal `category`
and `city` tags.

The preferred document ID is the normalized mobile number. A query by `mobile` also supports older or differently keyed documents.

### `otpRequests` collection

Document ID: normalized mobile number.

Fields:

```text
mobile
purpose: "LOGIN" | "REGISTER"
name
passwordHash
otpHash
expiresAt
createdAt
```

Firebase Admin credentials are loaded in `config/firebase.js`. The code supports either one JSON service-account variable or three separate credential variables.

## 7. JWT behavior

After successful verification, the server signs this payload:

```json
{
  "id": "user-document-id",
  "mobile": "normalized-mobile",
  "role": "USER"
}
```

The signing secret comes from `JWT_SECRET`. Token lifetime is 30 days. There is currently no middleware in this backend that verifies the token for protected routes because only authentication routes are present.

## 8. File inventory

### Application files

| File | Responsibility |
|---|---|
| `Server.js` | Loads environment variables, mounts root health check, starts local WhatsApp and HTTP server, and runs Render keep-alive ping. |
| `app.js` | Creates Express app, enables CORS and JSON parsing, mounts `/api/auth`. |
| `api/index.js` | Exports the Express app for Vercel serverless deployment. |
| `routers/authRoutes.js` | Defines send-OTP and verify-OTP routes. |
| `controllers/authController.js` | Validates request input, selects login/registration flow, sends API responses. |
| `services/authService.js` | Normalizes numbers, creates/verifies OTPs, reads/writes users, hashes passwords, creates JWTs. |
| `services/whatsappService.js` | Connects Baileys to WhatsApp, saves QR, reconnects, and sends messages. |
| `config/firebase.js` | Initializes Firebase Admin and returns a cached Firestore instance. |
| `package.json` | Dependencies and `start`/`dev` scripts. |
| `package-lock.json` | Locked npm dependency versions. |
| `vercel.json` | Rewrites all Vercel requests to `api/index`. |
| `.env` | Local secrets/configuration; should never be committed. |
| `.env.example` | Intended environment template; currently empty. |
| `.gitignore` | Ignores dependencies, environment files, logs, and WhatsApp auth state. |
| `qr.png` | Generated WhatsApp pairing QR image. |
| `BACKEND_DOCUMENTATION.md` | This document. |

### Runtime/generated files

`auth_info_baileys/` contains the WhatsApp multi-file authentication state. It includes credentials, keys, and device/session data. It must remain private and must not be shared or committed.

## 9. Startup and deployment

### Local/Render

`npm start` runs `Server.js`. When `VERCEL` is not set, it starts the WhatsApp connection and listens on `PORT` or port `5000`. It also pings `RENDER_EXTERNAL_URL` every 14 minutes, or localhost when that variable is absent.

### Vercel

Vercel loads `api/index.js`, which exports the Express app. `Server.js` is not used as the long-running entry point, so the WhatsApp connection is not started by that branch. A persistent Baileys socket is not a good fit for a normal serverless function; WhatsApp sending should run on a persistent server or use an official messaging provider for a Vercel deployment.

## 10. Environment variables

The current `.env` contains these key names:

```text
PORT
JWT_SECRET
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
MONGO_URI
```

`MONGO_URI` is currently unused by the source code. Firebase can alternatively be configured with `FIREBASE_SERVICE_ACCOUNT_JSON` instead of the three separate Firebase credential variables.

## 11. Important production observations

1. There is no rate limit or maximum attempt counter for OTP verification. A request can be tried repeatedly until expiry.
2. OTP sending has no cooldown. Repeated requests can send many WhatsApp messages.
3. The API returns `detail: error.message` in error responses. Internal error details should be logged server-side but not returned to clients in production.
4. CORS is configured with `origin: true` and credentials enabled. This should be restricted to the real frontend origins.
5. `auth_info_baileys/` and `qr.png` are sensitive. Anyone with the session state may be able to use the linked WhatsApp account.
6. `JWT_SECRET` must be a long random production secret. If it is missing, token creation fails.
7. The registration password hash is stored in the pending OTP document before OTP verification. It is hashed, but abandoned OTP records should be expired/deleted periodically.
8. Firebase Admin access bypasses normal client Firestore security rules, so service-account credentials must remain server-only.
9. The current code has no authenticated/protected business routes yet; it only implements authentication.

## 12. Short conclusion

The current backend is a WhatsApp OTP authentication API. Firestore stores the user and a hashed temporary OTP, Baileys delivers the plain OTP through a linked WhatsApp account, and successful verification creates or verifies the user and returns a 30-day JWT. Firebase is the database layer here, not the OTP delivery or Firebase Phone Auth layer.