# API Contract Spec — Sanchari Trip Planner

> Status: Draft | Owner: Praveen Kumar | Last updated: 2026-10-17 | API Version: v1
> Related: [goal-spec.md](./goal-spec.md) · [frontend-spec.md](./frontend-spec.md) · [backend-spec.md](./backend-spec.md)

This document is the human-readable contract between the frontend and the backend. Its code form is the set of Zod schemas in `shared/src/schemas/` (backend-spec §3.2). The backend generates an OpenAPI document from those schemas (`backend/openapi.json`). If this document and the schemas disagree, that's a bug: fix whichever one is wrong in the same commit.

Glossary terms are used as defined in `goal-spec.md` §9. Business rules are referenced by their IDs (BR-1 to BR-13) from `backend-spec.md` §6.

## 1. Overview
- **Base URL:** `/api/v1` (same origin as the frontend, e.g. `https://sanchari-trips.vercel.app/api/v1`)
- **Protocol / style:** REST over HTTPS, JSON
- **Content-Type:** Requests that have a body must send `Content-Type: application/json`; anything else gets `415`. Responses are `application/json; charset=utf-8`, except `204 No Content`.
- **Versioning strategy:** The version is in the URL path. Within `v1`, only *additive* changes are allowed: new endpoints, new optional request fields, and new response fields. Clients must ignore response fields they don't recognize. Any breaking change means `/api/v2`.
- **Health checks:** `GET /api/health` and `GET /api/health/ready` are outside the versioned base URL (§7.4).

## 2. Authentication
- **Scheme:** a session cookie (backend-spec §7).

  | Attribute | Value |
  |-----------|-------|
  | Name | `sanchari_session` |
  | Flags | `HttpOnly; Secure; SameSite=Lax; Path=/` |
  | `Max-Age` | 14 days |

  The cookie value is opaque. The frontend never reads it (it can't, because the cookie is `HttpOnly`) and never sends an `Authorization` header.
- **How to obtain a Session:** `POST /auth/signup` or `POST /auth/login` returns a `Set-Cookie` header.
- **Sending it:** the browser sends the cookie automatically. The frontend's `fetch` calls use `credentials: 'include'`.
- **Refresh:** there's no refresh endpoint. When less than half of a Session's lifetime remains, any authenticated response may carry a new `Set-Cookie` that extends it (a sliding Session).
- **Unauthenticated response:** `401 UNAUTHORIZED`, on every endpoint marked **Auth: Yes**.
- **CSRF requirements**, for `POST`, `PUT`, `PATCH`, and `DELETE`:
  - The `Origin` header must equal the app's origin; otherwise the response is `403 FORBIDDEN`. Browsers set this header automatically.
  - Requests that have a body must be `application/json`.

## 3. Conventions
- **Naming:** JSON fields are `camelCase`; URL paths are `kebab-case`; enum values are `lowercase`.
- **IDs:** UUID v4 strings, e.g. `"3f0c8a4e-6b1d-4c1e-9a57-2f8a7c1d9b10"`. An invalid UUID in a path gets `404 NOT_FOUND` (not `400`), the same as an ID that doesn't exist.
- **Calendar dates:** `"YYYY-MM-DD"` strings with no time and no time zone, e.g. `"2027-03-14"`. They must be real dates (`2027-02-30` is rejected).
- **Timestamps:** ISO 8601 in UTC with milliseconds, e.g. `"2026-10-17T09:46:12.345Z"`. Used only for `createdAt` and `updatedAt`.
- **Strings:** the server trims leading and trailing whitespace before validating and storing. Responses always contain the stored (trimmed) value. Usernames are also lowercased.
- **Unknown request fields:** rejected with `400 VALIDATION_ERROR`, so typos surface instead of being silently ignored.
- **Arrays:** always present in responses (`[]` when empty, never `null`). Optional fields are left out rather than sent as `null`.
- **Ordering:** collections are always returned in a defined order, stated for each endpoint.
- **Pagination:** none in v1 (Trips are capped at 200 per User, BR-11).
- **Filtering / sorting:** none in v1; the client sorts and groups itself (e.g. Upcoming and Past in the Trip List).
- **Idempotency:**
  - `GET`, `PUT`, and `DELETE` are idempotent by design. A repeated `DELETE` returns `404` the second time.
  - `POST` is not idempotent, and clients must not retry it automatically (frontend-spec §6.2 uses 0 mutation retries).
- **Request ID:** every response carries an `X-Request-Id` header. Quote it when reporting a bug; it matches the server logs.

## 4. Standard Response Shapes

### Success
```json
{
  "data": { }
}
```
- `data` is an object or an array, depending on the endpoint.
- `204 No Content` responses have no body.
- A `meta` field is reserved for future pagination and isn't sent in v1.

### Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary, safe to show to the User",
    "details": []
  }
}
```
- `code` is stable and machine-readable; the frontend uses it to decide what to do.
- `message` is English text and may change at any time; never compare against it in code.
- `details` is always an array, possibly empty. Its items depend on the `code` (see below).

### `details` item shapes
| Code | Item shape | Example |
|------|-----------|---------|
| `VALIDATION_ERROR` | `{ "path": string, "message": string }`. `path` is dot-separated into the request (body field, `params.x`, or `query.x`). | `{ "path": "destinations.1.startDate", "message": "Must start on 2027-03-14 or 2027-03-15" }` |
| `ACTIVITIES_WOULD_BE_DELETED` | `{ "date": "YYYY-MM-DD", "count": number }`, sorted by date | `{ "date": "2027-03-16", "count": 2 }` |
| `LIMIT_REACHED` | `{ "limit": "tripsPerUser" \| "activitiesPerDate", "max": number }` | `{ "limit": "activitiesPerDate", "max": 50 }` |
| All other codes | `[]` | |

### Error Codes
| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | `VALIDATION_ERROR` | The request failed schema or business-rule validation |
| 401 | `UNAUTHORIZED` | No Session, or it expired or is invalid |
| 401 | `INVALID_CREDENTIALS` | Login failed. The same response whether the username or the password was wrong. |
| 403 | `FORBIDDEN` | The `Origin` check failed |
| 404 | `NOT_FOUND` | No such route or resource, or the resource belongs to another User (BR-8) |
| 409 | `USERNAME_TAKEN` | Signup used a username that already exists (case-insensitive) |
| 409 | `ACTIVITIES_WOULD_BE_DELETED` | A Trip update would remove dates that have Activities, and it wasn't confirmed (BR-12) |
| 409 | `LIMIT_REACHED` | The 200-Trip or 50-Activities-per-date limit was reached (BR-11) |
| 409 | `CONFLICT` | The request is based on stale data (e.g. a reorder list that doesn't match the current Activities, BR-13) |
| 413 | `PAYLOAD_TOO_LARGE` | The body is over 100 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | A body was sent without `Content-Type: application/json` |
| 429 | `RATE_LIMITED` | Too many requests; see the `Retry-After` header (§8) |
| 500 | `INTERNAL_ERROR` | Unexpected server error. The `message` is generic. |

## 5. Shared Data Models (Schemas)

### `TripType` (enum)
| Value | Label shown in the UI |
|-------|------------------|
| `solo` | Solo |
| `couple` | Couple |
| `family` | Family |
| `friends` | Group of Friends |

### `User`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (uuid) | Yes | |
| username | string | Yes | Lowercase, 3–30 characters, `[a-z0-9_.-]` (BR-1) |
| createdAt | string (timestamp) | Yes | |

The password and its hash are never returned.

### `DestinationInput` (request)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | 1–100 characters after trimming |
| startDate | string (date) | Yes | |
| endDate | string (date) | Yes | On or after `startDate` |

### `Destination` (response)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | |
| startDate | string (date) | Yes | |
| endDate | string (date) | Yes | |

Destinations have no `id` in the API. They're always sent and returned as a complete, ordered list that belongs to the Trip (backend-spec §8, `updateTrip`). A Destination's position is its index in the `destinations` array, sorted by `startDate`.

### `TripSummary` (response)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (uuid) | Yes | |
| name | string | Yes | 1–100 characters |
| tripType | `TripType` | Yes | |
| startDate | string (date) | Yes | Derived: earliest Destination `startDate` (BR-7) |
| endDate | string (date) | Yes | Derived: latest Destination `endDate` |
| dayCount | integer | Yes | Number of Days, `endDate − startDate + 1`, from 1 to 60 |
| destinations | `Destination[]` | Yes | 1–10 items, sorted by `startDate` |
| createdAt | string (timestamp) | Yes | |
| updatedAt | string (timestamp) | Yes | Changes on Trip updates; Activity changes don't affect it |

### `TripDetail` (response)
Everything in `TripSummary`, plus:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| activities | `Activity[]` | Yes | All Activities of the Trip, sorted by `date`, then `position` |

Days aren't sent. The client derives them from `startDate`, `endDate`, and `destinations` using the `shared/` helpers (`listTripDates`, `dayNumber`, `destinationsForDate`).

### `Activity` (response)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (uuid) | Yes | |
| date | string (date) | Yes | Within the Trip's `startDate`…`endDate` |
| position | integer | Yes | 0-based index within its `date` (0 = first). Always continuous (0, 1, 2, …). |
| text | string | Yes | 1–500 characters, single line (BR-9) |
| createdAt | string (timestamp) | Yes | |
| updatedAt | string (timestamp) | Yes | |

## 6. Endpoint Summary
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | No | Create an Account and start a Session |
| POST | `/auth/login` | No | Start a Session |
| POST | `/auth/logout` | No | End the current Session (if any) |
| GET | `/auth/me` | Yes | The current User |
| GET | `/trips` | Yes | List the User's Trips |
| POST | `/trips` | Yes | Create a Trip |
| GET | `/trips/{tripId}` | Yes | Get a Trip with its Activities |
| PUT | `/trips/{tripId}` | Yes | Replace a Trip's name, Trip Type, and Destinations |
| DELETE | `/trips/{tripId}` | Yes | Delete a Trip and everything in it |
| POST | `/trips/{tripId}/activities` | Yes | Add an Activity |
| PATCH | `/trips/{tripId}/activities/{activityId}` | Yes | Edit an Activity's text |
| DELETE | `/trips/{tripId}/activities/{activityId}` | Yes | Delete an Activity |
| PUT | `/trips/{tripId}/days/{date}/activity-order` | Yes | Reorder the Activities on one date |
| GET | `/api/health` | No | Liveness (unversioned) |
| GET | `/api/health/ready` | No | Readiness, including the database (unversioned) |

## 7. Endpoint Details
The examples use one Trip throughout: *Japan Spring*, with Kyoto 12–14 Mar 2027 and Osaka 14–16 Mar 2027. That's 5 Days, and 14 Mar is a Travel Day.

### 7.1 Auth

#### `POST /auth/signup`
- **Description:** Create an Account and log the new User in (UC-1, F-2).
- **Auth required:** No
- **Rate limit:** 5 per hour per IP

**Request body**
```json
{
  "username": "Praveen_K",
  "password": "correct-horse-battery"
}
```
| Field | Rules |
|-------|-------|
| username | Lowercased, then 3–30 characters, `[a-z0-9_.-]` (BR-1) |
| password | 8–128 characters, not trimmed (BR-2) |

**Response `201`**, with `Set-Cookie: sanchari_session=…`
```json
{
  "data": {
    "id": "0b6f6a52-9a3e-4f0e-8a7b-6f1f4b2c9d11",
    "username": "praveen_k",
    "createdAt": "2026-10-17T09:46:12.345Z"
  }
}
```

**Errors:** `400 VALIDATION_ERROR`, `409 USERNAME_TAKEN`, `429 RATE_LIMITED`

**Notes:** Confirming the password ("confirm password" field) happens only on the frontend; it isn't sent to the API.

---

#### `POST /auth/login`
- **Description:** Verify credentials and start a Session (UC-1, F-2).
- **Auth required:** No
- **Rate limit:** 10 per minute per IP and username combination

**Request body**
```json
{
  "username": "praveen_k",
  "password": "correct-horse-battery"
}
```
The username is matched case-insensitively.

**Response `200`**, with `Set-Cookie: sanchari_session=…`
```json
{
  "data": {
    "id": "0b6f6a52-9a3e-4f0e-8a7b-6f1f4b2c9d11",
    "username": "praveen_k",
    "createdAt": "2026-10-17T09:46:12.345Z"
  }
}
```

**Errors:** `400 VALIDATION_ERROR` (missing fields only; the username and password rules are *not* applied here), `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`

**Notes:** If the request already carries a valid Session, it's replaced by the new one.

---

#### `POST /auth/logout`
- **Description:** End the current Session.
- **Auth required:** No (it works, and returns the same result, without a Session)

**Request body:** none

**Response `204`**, with `Set-Cookie: sanchari_session=; Max-Age=0; …`

**Errors:** `403 FORBIDDEN` (Origin check)

---

#### `GET /auth/me`
- **Description:** Return the current User. The frontend calls this on load to find out whether the User is logged in (frontend-spec §8).
- **Auth required:** Yes

**Response `200`**
```json
{
  "data": {
    "id": "0b6f6a52-9a3e-4f0e-8a7b-6f1f4b2c9d11",
    "username": "praveen_k",
    "createdAt": "2026-10-17T09:46:12.345Z"
  }
}
```

**Errors:** `401 UNAUTHORIZED`

### 7.2 Trips

#### `GET /trips`
- **Description:** List all of the User's Trips for the Trip List (UC-5, F-6).
- **Auth required:** Yes
- **Ordering:** by `startDate` ascending, then `createdAt` ascending

**Response `200`**: `TripSummary[]`
```json
{
  "data": [
    {
      "id": "7d2c1f8e-3a4b-4c5d-9e6f-1a2b3c4d5e6f",
      "name": "Japan Spring",
      "tripType": "couple",
      "startDate": "2027-03-12",
      "endDate": "2027-03-16",
      "dayCount": 5,
      "destinations": [
        { "name": "Kyoto", "startDate": "2027-03-12", "endDate": "2027-03-14" },
        { "name": "Osaka", "startDate": "2027-03-14", "endDate": "2027-03-16" }
      ],
      "createdAt": "2026-10-17T10:02:00.000Z",
      "updatedAt": "2026-10-17T10:02:00.000Z"
    }
  ]
}
```

**Errors:** `401 UNAUTHORIZED`

---

#### `POST /trips`
- **Description:** Create a Trip (UC-2, UC-3, F-3, F-4).
- **Auth required:** Yes

**Request body**
```json
{
  "name": "Japan Spring",
  "tripType": "couple",
  "destinations": [
    { "name": "Kyoto", "startDate": "2027-03-12", "endDate": "2027-03-14" },
    { "name": "Osaka", "startDate": "2027-03-14", "endDate": "2027-03-16" }
  ]
}
```
| Field | Rules |
|-------|-------|
| name | 1–100 characters after trimming (BR-3) |
| tripType | `TripType` (BR-4) |
| destinations | `DestinationInput[]`, 1–10 items (BR-5). May be sent in any order; the server sorts by `startDate`. Once sorted, they must form a valid sequence (BR-6), and the total length must be at most 60 days (BR-7). |

**Response `201`**: `TripDetail` (with `activities: []`), plus a `Location: /api/v1/trips/{id}` header
```json
{
  "data": {
    "id": "7d2c1f8e-3a4b-4c5d-9e6f-1a2b3c4d5e6f",
    "name": "Japan Spring",
    "tripType": "couple",
    "startDate": "2027-03-12",
    "endDate": "2027-03-16",
    "dayCount": 5,
    "destinations": [
      { "name": "Kyoto", "startDate": "2027-03-12", "endDate": "2027-03-14" },
      { "name": "Osaka", "startDate": "2027-03-14", "endDate": "2027-03-16" }
    ],
    "activities": [],
    "createdAt": "2026-10-17T10:02:00.000Z",
    "updatedAt": "2026-10-17T10:02:00.000Z"
  }
}
```

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `409 LIMIT_REACHED` (`tripsPerUser`)

**Validation error example:** a gap between Destinations
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid",
    "details": [
      { "path": "destinations.1.startDate", "message": "Must start on 2027-03-14 or 2027-03-15" }
    ]
  }
}
```
Note: `destinations.N` paths refer to the index *after* sorting by `startDate`. The frontend keeps its rows sorted the same way (frontend-spec §4.4), so the indexes match.

---

#### `GET /trips/{tripId}`
- **Description:** Get a Trip with all its Activities, for the Itinerary page and PDF export (F-5, F-7).
- **Auth required:** Yes
- **Path params:** `tripId` (uuid)

**Response `200`**: `TripDetail`
```json
{
  "data": {
    "id": "7d2c1f8e-3a4b-4c5d-9e6f-1a2b3c4d5e6f",
    "name": "Japan Spring",
    "tripType": "couple",
    "startDate": "2027-03-12",
    "endDate": "2027-03-16",
    "dayCount": 5,
    "destinations": [
      { "name": "Kyoto", "startDate": "2027-03-12", "endDate": "2027-03-14" },
      { "name": "Osaka", "startDate": "2027-03-14", "endDate": "2027-03-16" }
    ],
    "activities": [
      {
        "id": "a1b2c3d4-0000-4000-8000-000000000001",
        "date": "2027-03-13",
        "position": 0,
        "text": "Fushimi Inari at sunrise",
        "createdAt": "2026-10-17T10:05:00.000Z",
        "updatedAt": "2026-10-17T10:05:00.000Z"
      },
      {
        "id": "a1b2c3d4-0000-4000-8000-000000000002",
        "date": "2027-03-13",
        "position": 1,
        "text": "Nishiki Market lunch",
        "createdAt": "2026-10-17T10:05:30.000Z",
        "updatedAt": "2026-10-17T10:05:30.000Z"
      }
    ],
    "createdAt": "2026-10-17T10:02:00.000Z",
    "updatedAt": "2026-10-17T10:02:00.000Z"
  }
}
```

**Errors:** `401 UNAUTHORIZED`, `404 NOT_FOUND`

---

#### `PUT /trips/{tripId}`
- **Description:** Replace a Trip's name, Trip Type, and Destination list (F-4). Activities on dates that remain in the Trip are untouched. Activities on dates that are removed are deleted, but only when the request confirms it (BR-12).
- **Auth required:** Yes
- **Path params:** `tripId` (uuid)

**Request body**: the same fields as `POST /trips`, plus:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| confirmDeleteActivities | boolean | No (default `false`) | Must be `true` when the new dates would remove dates that have Activities |

Example: shortening Osaka to end on 15 Mar
```json
{
  "name": "Japan Spring",
  "tripType": "couple",
  "destinations": [
    { "name": "Kyoto", "startDate": "2027-03-12", "endDate": "2027-03-14" },
    { "name": "Osaka", "startDate": "2027-03-14", "endDate": "2027-03-15" }
  ]
}
```

**Response `409`**, if 16 Mar has Activities and the request didn't confirm
```json
{
  "error": {
    "code": "ACTIVITIES_WOULD_BE_DELETED",
    "message": "This change removes 1 day that has activities",
    "details": [
      { "date": "2027-03-16", "count": 2 }
    ]
  }
}
```
Nothing is changed. The client shows a confirmation (frontend-spec §7.4) and repeats the request with `"confirmDeleteActivities": true`.

**Response `200`**: `TripDetail`, reflecting the new state (with Activities on removed dates gone).

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND`, `409 ACTIVITIES_WOULD_BE_DELETED`

**Notes:**
- `PUT` replaces the whole thing: all of `name`, `tripType`, and `destinations` are required.
- Sending `confirmDeleteActivities: true` when nothing would be deleted is allowed and has no effect.
- The frontend can predict the `409` from its loaded data and ask first (frontend-spec §4.4). The server check is the safety net for stale data.

---

#### `DELETE /trips/{tripId}`
- **Description:** Delete a Trip with its Destinations and Activities (F-6).
- **Auth required:** Yes
- **Path params:** `tripId` (uuid)

**Response `204`**: no body

**Errors:** `401 UNAUTHORIZED`, `404 NOT_FOUND`

**Notes:** Permanent; there's no undo. The frontend asks for confirmation first.

### 7.3 Activities

#### `POST /trips/{tripId}/activities`
- **Description:** Add an Activity to a date (F-5). It's also used to **undo** a delete, by re-creating the Activity at its old `position`.
- **Auth required:** Yes
- **Path params:** `tripId` (uuid)

**Request body**
```json
{
  "date": "2027-03-13",
  "text": "Philosopher's Path walk",
  "position": 1
}
```
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| date | string (date) | Yes | Within the Trip's dates (BR-10) |
| text | string | Yes | 1–500 characters after trimming, no line breaks (BR-9) |
| position | integer | No | 0-based index to insert at. Values beyond the end are treated as "at the end". When omitted, the Activity is added at the end. Activities at or after this position move down by one. |

**Response `201`**: `Activity`
```json
{
  "data": {
    "id": "a1b2c3d4-0000-4000-8000-000000000003",
    "date": "2027-03-13",
    "position": 1,
    "text": "Philosopher's Path walk",
    "createdAt": "2026-10-17T10:07:00.000Z",
    "updatedAt": "2026-10-17T10:07:00.000Z"
  }
}
```

**Errors:** `400 VALIDATION_ERROR` (including a `date` outside the Trip, at path `date`), `401 UNAUTHORIZED`, `404 NOT_FOUND` (Trip), `409 LIMIT_REACHED` (`activitiesPerDate`)

**Notes:** Inserting shifts the `position` of later Activities on that date. A client doing optimistic updates should refetch the Trip afterwards, which it does anyway (frontend-spec §6.2). An Activity restored by undo gets a new `id`.

---

#### `PATCH /trips/{tripId}/activities/{activityId}`
- **Description:** Edit an Activity's text (F-5).
- **Auth required:** Yes
- **Path params:** `tripId` (uuid), `activityId` (uuid)

**Request body**
```json
{
  "text": "Fushimi Inari at sunrise (bring water)"
}
```
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| text | string | Yes | Same as on create (BR-9) |

**Response `200`**: `Activity` (with a new `updatedAt`)

**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 NOT_FOUND` (the Trip or Activity, or an Activity that isn't in this Trip)

**Notes:** In v1, only `text` can be changed. Moving an Activity to another date isn't supported (there's no UI for it in the MVP); it may be added later as an optional `date` field.

---

#### `DELETE /trips/{tripId}/activities/{activityId}`
- **Description:** Delete an Activity (F-5).
- **Auth required:** Yes
- **Path params:** `tripId` (uuid), `activityId` (uuid)

**Response `204`**: no body. The remaining Activities on that date are renumbered so positions stay continuous.

**Errors:** `401 UNAUTHORIZED`, `404 NOT_FOUND`

**Notes:** The frontend's "Undo" toast restores the Activity with `POST …/activities` using the deleted Activity's `date`, `text`, and `position`.

---

#### `PUT /trips/{tripId}/days/{date}/activity-order`
- **Description:** Set the order of all Activities on one date (F-5, the "Move up" and "Move down" buttons).
- **Auth required:** Yes
- **Path params:** `tripId` (uuid), `date` (`YYYY-MM-DD`, within the Trip's dates)

**Request body**
```json
{
  "activityIds": [
    "a1b2c3d4-0000-4000-8000-000000000002",
    "a1b2c3d4-0000-4000-8000-000000000001",
    "a1b2c3d4-0000-4000-8000-000000000003"
  ]
}
```
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| activityIds | string (uuid)[] | Yes | Exactly the IDs of the Activities currently on this date, each once, in the new order (BR-13) |

**Response `200`**: `Activity[]` for that date, in the new order with positions 0…n−1

**Errors:** `400 VALIDATION_ERROR` (badly formed body, duplicate IDs, or a date outside the Trip), `401 UNAUTHORIZED`, `404 NOT_FOUND` (Trip), `409 CONFLICT` (the list doesn't exactly match the Activities on this date, e.g. after an edit in another tab)

**Notes:** On a `409`, the client refetches the Trip and lets the User try again.

### 7.4 Health
These endpoints are under `/api` but not versioned (not under `/api/v1`), and have no `{ data }` envelope.

#### `GET /api/health`
- **Response `200`:** `{ "status": "ok" }`. The process is up; the database isn't checked.

#### `GET /api/health/ready`
- **Response `200`:** `{ "status": "ok" }`. The database answered.
- **Response `503`:** `{ "status": "unavailable" }`. The database can't be reached.

## 8. Rate Limiting
- **Limits:**

  | Scope | Limit | Key |
  |-------|-------|-----|
  | `POST /auth/signup` | 5 per hour | Client IP |
  | `POST /auth/login` | 10 per minute | Client IP + lowercased username |
  | All other endpoints | Not limited by the app (Vercel's platform DDoS protection applies) | — |

- **Headers returned** (on the two rate-limited routes above):

  | Header | Meaning |
  |--------|---------|
  | `x-ratelimit-limit` | Maximum requests allowed in the window |
  | `x-ratelimit-remaining` | Requests left in the current window |
  | `x-ratelimit-reset` | Seconds until the window resets |
  | `retry-after` | Seconds to wait (only on `429` responses) |

- **Exceeded:** `429 RATE_LIMITED` in the standard error shape.

## 9. Changelog
| Version | Date | Change |
|---------|------|--------|
| v1 | 2026-10-17 | Initial contract |

## 10. Open Questions
- None blocking. Possible additions within v1, all additive: an optional `date` field on `PATCH` to move an Activity to another date, and a `POST /trips/{tripId}/duplicate` endpoint (goal-spec §5, post-MVP).
