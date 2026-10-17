# API Contract Spec — Sanchari Trip Planner

> Status: Draft | Owner: _ | Last updated: _ | API Version: v1
> Related: [frontend-spec.md](./frontend-spec.md) · [backend-spec.md](./backend-spec.md)

## 1. Overview
- **Base URL:** `/api/v1`
- **Protocol / style:** REST over HTTPS, JSON
- **Content-Type:** `application/json`
- **Versioning strategy:**

## 2. Authentication
- **Scheme:** <!-- e.g., Bearer JWT in `Authorization` header, or HTTP-only cookie -->
- **How to obtain a token:**
- **Token refresh:**
- **Unauthenticated response:** `401`

## 3. Conventions
- **Naming:** <!-- camelCase or snake_case for JSON fields -->
- **IDs:** <!-- UUID, integer, etc. -->
- **Dates / times:** <!-- ISO 8601, timezone handling -->
- **Pagination:** <!-- e.g., `?page=1&limit=20` → response `meta` block -->
- **Filtering / sorting:**
- **Idempotency:**

## 4. Standard Response Shapes
### Success
```json
{
  "data": {},
  "meta": {}
}
```

### Error
```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message",
    "details": []
  }
}
```

### Error Codes
| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | VALIDATION_ERROR | |
| 401 | UNAUTHORIZED | |
| 403 | FORBIDDEN | |
| 404 | NOT_FOUND | |
| 409 | CONFLICT | |
| 500 | INTERNAL_ERROR | |

## 5. Shared Data Models (Schemas)
<!-- Define reusable objects referenced by endpoints. -->
### `<ModelName>`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
|       |      |          |             |

## 6. Endpoint Summary
| Method | Path | Auth | Description |
|--------|------|------|-------------|
|        |      |      |             |

## 7. Endpoint Details
<!-- Repeat this block per endpoint. -->
### `<METHOD> <path>`
- **Description:**
- **Auth required:** Yes / No
- **Path params:**
- **Query params:**

**Request body**
```json
{}
```

**Response `200`**
```json
{}
```

**Errors:** <!-- list status + code -->

**Notes:** <!-- side effects, permissions, rate limits -->

---

## 8. Rate Limiting
- **Limits:**
- **Headers returned:**

## 9. Changelog
| Version | Date | Change |
|---------|------|--------|
| v1      |      | Initial |

## 10. Open Questions
-
