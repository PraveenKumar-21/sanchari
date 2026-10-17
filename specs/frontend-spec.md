# Frontend Spec — Sanchari Trip Planner

> Status: Draft | Owner: Praveen Kumar | Last updated: 2026-10-17
> Related: [goal-spec.md](./goal-spec.md) · [api-contract-spec.md](./api-contract-spec.md)

## 1. Overview
A responsive single-page app (SPA) where a User signs up, creates Trips with one or more Destinations, plans Activities day by day, and exports the Itinerary as a PDF. It runs in desktop and mobile browsers (F-1) and talks to the backend only through the REST API in `api-contract-spec.md`. The backend is the source of truth for all data and validation; the frontend validates the same rules up front for fast feedback.

Glossary terms (Trip, Destination, Day, Day Number, Travel Day, Activity, etc.) are used exactly as defined in `goal-spec.md` §9.

## 2. Tech Stack
- **Framework:** React 19 + Vite
- **Language:** TypeScript (`strict` mode)
- **Styling / UI library:** Tailwind CSS + shadcn/ui (Radix primitives); icons from `lucide-react`
- **State management:** TanStack Query for server state; React state for local UI. No global store library.
- **Data fetching:** a thin `fetch` wrapper (`lib/api`) used by TanStack Query hooks
- **Routing:** React Router (declarative mode)
- **Forms & validation:** React Hook Form + Zod (Zod schemas mirror the API contract's validation rules)
- **Dates:** `date-fns`. Dates are handled as `YYYY-MM-DD` strings, with no time zones (see §6.4)
- **PDF:** `@react-pdf/renderer`, generated in the browser and lazy-loaded (see §4.6)
- **Toasts:** `sonner` (shadcn's toast component)
- **Build tool:** Vite
- **Testing:** Vitest + React Testing Library + MSW (mock API); Playwright for end-to-end tests
- **Code quality:** ESLint + Prettier

## 3. Pages & Routes
| Route | Page | Auth Required | Description |
|-------|------|---------------|-------------|
| `/` | — | — | Redirects to `/trips` if logged in, otherwise to `/login` |
| `/login` | Login | No (logged-in users are redirected to `/trips`) | Log in with username + password (F-2) |
| `/signup` | Sign Up | No (logged-in users are redirected to `/trips`) | Create an account (F-2) |
| `/trips` | Trip List | Yes | All of the User's Trips (F-6) |
| `/trips/new` | Create Trip | Yes | Trip form: name, Trip Type, Destinations (F-3, F-4) |
| `/trips/:tripId` | Itinerary | Yes | Day-by-day planning and PDF export (F-5, F-7) |
| `/trips/:tripId/edit` | Edit Trip | Yes | Same form as Create Trip, pre-filled (F-4) |
| `*` | Not Found | No | Unknown route, or a Trip that doesn't exist or isn't the User's |

## 4. Page Specifications

### 4.1 Login
- **Route:** `/login`
- **Purpose:** Authenticate an existing User (UC-1).
- **Layout / sections:** Centered card with the app name, username field, password field (with show/hide toggle), "Log in" button, and a link to Sign Up.
- **Components used:** `AuthForm`
- **Data needed:** `POST /auth/login`
- **User actions:** Submit credentials; go to Sign Up.
- **Loading / empty / error states:** Button shows a spinner and is disabled while submitting. Invalid credentials show one generic message ("Incorrect username or password") without saying which field was wrong.
- **Acceptance criteria:**
  - [ ] Successful login goes to `returnTo` if present (see §8), otherwise to `/trips`
  - [ ] Pressing Enter submits the form
  - [ ] A logged-in User who visits `/login` is redirected to `/trips`

### 4.2 Sign Up
- **Route:** `/signup`
- **Purpose:** Create an Account (UC-1).
- **Layout / sections:** Same card layout as Login, with username, password, and confirm password fields, a "Create account" button, and a link to Login.
- **Components used:** `AuthForm`
- **Data needed:** `POST /auth/signup`
- **User actions:** Submit; go to Login.
- **Loading / empty / error states:** Inline field errors from client validation and from the API (e.g. "Username is already taken").
- **Acceptance criteria:**
  - [ ] Username and password rules (defined in the API contract) are validated before submitting, with inline messages
  - [ ] Confirm password must match
  - [ ] On success, the User is logged in and taken to `/trips`
  - [ ] A visible note says there is no password recovery in this version (goal-spec §8)

### 4.3 Trip List
- **Route:** `/trips`
- **Purpose:** Show all of the User's Trips and let them open, create, edit, or delete one (UC-5, F-6).
- **Layout / sections:**
  - Header row: "My Trips" title and a "New Trip" button
  - **Upcoming & ongoing** section: Trips whose end date is today or later, earliest start date first
  - **Past** section: Trips whose end date is before today, most recent first
  - Responsive card grid: 1 column on mobile, 2 at `md`, 3 at `lg`
- **Components used:** `TripCard`, `EmptyState`, `ConfirmDialog`
- **Data needed:** `GET /trips`, `DELETE /trips/:tripId`
- **User actions:** Click a card to open its Itinerary. The card's menu (⋯) offers Edit and Delete. Click "New Trip" to create one.
- **TripCard content:** Trip name, Trip Type badge, Destinations shown as "Kyoto → Osaka → Tokyo" (truncated after 3 with "+N more"), Trip Dates ("12 – 19 Mar 2027"), and the trip length ("8 days").
- **Loading / empty / error states:** Skeleton cards while loading. Empty state: "No trips yet" with a "Plan your first trip" button. Error state with a Retry button.
- **Acceptance criteria:**
  - [ ] Only the logged-in User's Trips appear
  - [ ] Deleting asks for confirmation ("Delete *Japan Spring*? This removes all its days and activities.") and removes the card when it succeeds
  - [ ] No pagination in the MVP

### 4.4 Create Trip / Edit Trip
- **Route:** `/trips/new`, `/trips/:tripId/edit`
- **Purpose:** Set a Trip's name, Trip Type, and Destinations (UC-2, UC-3, F-3, F-4).
- **Layout / sections:**
  - **Trip details:** name (text), Trip Type (four-option radio group: Solo, Couple, Family, Group of Friends)
  - **Destinations:** a repeating list; each row has a destination name, a start date, and an end date (date-range picker), plus a remove button. An "Add destination" button sits below.
  - **Summary line:** "8 days · 12 – 19 Mar 2027", updated live
  - Footer: "Cancel" and "Create trip" / "Save changes"
- **Components used:** `TripForm`, `TripTypeRadio`, `DestinationFields`, `DateRangePicker`, `ConfirmDialog`
- **Data needed:** Create: `POST /trips`. Edit: `GET /trips/:tripId` (to pre-fill) and `PUT /trips/:tripId`.
- **Validation (mirrors goal-spec §8; the backend enforces the same rules):**
  - Name is required, 1–100 characters
  - Trip Type is required
  - 1–10 Destinations; each name is required, 1–100 characters
  - Each Destination's end date is on or after its start date
  - Destinations are kept sorted by start date (re-sorted automatically when a date changes)
  - Each Destination starts on the previous one's end date (a Travel Day) or the day after. Overlaps and gaps show an error on the affected row: "Must start on 14 Mar or 15 Mar"
  - Total Trip length is at most 60 days
- **Helpful defaults:** A newly added Destination's start date defaults to the previous Destination's end date.
- **Editing dates that remove Days (Edit only):** Before saving, compare the new Trip Dates with the current Itinerary. If any removed date has Activities, show a `ConfirmDialog` listing them ("Day 7 · 18 Mar — 2 activities will be deleted") and save only after the User confirms. See §7.4 and Open Questions.
- **Loading / empty / error states:** Edit shows a skeleton while loading the Trip. API validation errors are mapped onto their fields; anything else is shown as a toast.
- **Acceptance criteria:**
  - [ ] Create, when it succeeds, goes to the new Trip's Itinerary
  - [ ] Save, when it succeeds, goes back to the Itinerary
  - [ ] Cancel with unsaved changes asks "Discard changes?"
  - [ ] The submit button is disabled while saving

### 4.5 Itinerary
- **Route:** `/trips/:tripId`
- **Purpose:** Plan Activities day by day (UC-4, F-5) and export the PDF (UC-6, F-7).
- **Layout / sections:**
  - **Trip header:** name, Trip Type badge, Trip Dates, Destination list. Actions: "Export PDF" (primary), and a menu (⋯) with Edit trip and Delete trip.
  - **Day jump nav:** a sticky list of Day Numbers at `lg` and wider (left sidebar); a horizontally scrollable strip of Day chips below `lg`. Clicking a Day scrolls to it.
  - **Day cards:** one per Day, Day 1 through Day N, in order. Card header: "Day 3 · Sat 14 Mar · Kyoto". A Travel Day header shows both Destinations: "Day 3 · Sat 14 Mar · Kyoto → Osaka".
  - **Activities in a Day card:** an ordered list of `ActivityItem`s, followed by an "Add activity" input.
- **Components used:** `TripHeader`, `DayNav`, `DayCard`, `ActivityItem`, `ActivityInput`, `ExportPdfButton`, `ConfirmDialog`
- **Data needed:** `GET /trips/:tripId` (Trip, Destinations, and Activities); create, update, reorder, and delete Activity endpoints (see API contract).
- **User actions:**
  - **Add:** type in "Add activity" and press Enter or click Add. The input clears and keeps focus, so several can be added in a row.
  - **Edit:** click the Activity text (or its Edit button) to edit it in place. Enter or blur saves; Esc cancels.
  - **Delete:** a delete button removes the Activity right away, with an "Undo" toast for 5 seconds (no confirmation dialog).
  - **Reorder:** "Move up" / "Move down" buttons on each Activity (drag-and-drop is post-MVP).
- **Activity rules:** free text, 1–500 characters, with leading and trailing whitespace trimmed. Line breaks are not allowed (one line per Activity).
- **Loading / empty / error states:** Skeleton header and Day cards while loading. A Day with no Activities shows muted text: "Nothing planned yet". A missing or other User's Trip shows the Not Found page.
- **Acceptance criteria:**
  - [ ] Every date in the Trip Dates appears as exactly one Day, numbered from 1
  - [ ] Activity add, edit, delete, and reorder update the screen immediately (optimistic) and roll back with an error toast if the API call fails
  - [ ] All Activity actions work by keyboard and on touch screens

### 4.6 Itinerary Export (PDF)
Not a route; triggered by "Export PDF" on the Itinerary page (F-7).
- **Generation:** in the browser with `@react-pdf/renderer`, using the Trip data already loaded. The library is loaded with a dynamic `import()` only when the button is clicked. The button shows "Preparing PDF…" while it works.
- **Page format:** A4 portrait, with the system sans-serif font and black text on white.
- **Content:**
  1. Title block: Trip name, Trip Type, Trip Dates, trip length
  2. Destinations table: name, dates, number of nights
  3. One section per Day: "Day N — Weekday, DD Month YYYY — Destination(s)", followed by a numbered list of Activities, or "No activities planned"
  4. Footer on each page: "Generated by Sanchari on <date>" and "Page X of Y"
- **Filename:** `<trip-name-slug>-itinerary.pdf` (e.g. `japan-spring-itinerary.pdf`)
- **Acceptance criteria:**
  - [ ] Downloads on desktop Chrome, Firefox, and Safari; on iOS and Android it downloads or opens in the browser's PDF viewer
  - [ ] A Day with many Activities flows onto the next page without cutting text in half
  - [ ] Text is selectable (not an image)

### 4.7 Not Found
- Simple message ("We couldn't find that page") with a link back to `/trips` (or `/login` if logged out).

## 5. Component Inventory
| Component | Responsibility | Props / Inputs | Used In |
|-----------|----------------|----------------|---------|
| `AppShell` | Header (app name, user menu with username and Log out) and page container | `children` | All signed-in pages |
| `ProtectedRoute` | Redirects to `/login?returnTo=…` when there's no Session | — | Router |
| `PublicOnlyRoute` | Redirects logged-in Users to `/trips` | — | Router |
| `AuthForm` | Username/password form for login or signup | `mode: 'login' \| 'signup'` | Login, Sign Up |
| `TripCard` | Trip summary card with Edit/Delete menu | `trip: TripSummary` | Trip List |
| `TripForm` | Create/edit form with validation | `initialValues?`, `onSubmit`, `mode` | Create, Edit Trip |
| `TripTypeRadio` | Four-option Trip Type picker | form field | `TripForm` |
| `DestinationFields` | Repeating Destination rows with add/remove | form field array | `TripForm` |
| `DateRangePicker` | Start/end date picker (shadcn Calendar in a Popover) | `value`, `onChange`, `min?`, `max?` | `DestinationFields` |
| `TripHeader` | Trip summary and page actions | `trip: TripDetail` | Itinerary |
| `DayNav` | Jump-to-Day sidebar or strip | `days: Day[]` | Itinerary |
| `DayCard` | Day header and its Activity list | `day: Day` | Itinerary |
| `ActivityItem` | Shows, edits in place, moves, and deletes one Activity | `activity`, `isFirst`, `isLast` | `DayCard` |
| `ActivityInput` | Add-activity input | `date`, `tripId` | `DayCard` |
| `ExportPdfButton` | Lazy-loads the PDF library and triggers the download | `trip: TripDetail` | Itinerary |
| `ItineraryPdfDocument` | `@react-pdf/renderer` document layout | `trip: TripDetail` | `ExportPdfButton` |
| `ConfirmDialog` | Reusable confirmation (shadcn AlertDialog) | `title`, `description`, `confirmLabel`, `onConfirm`, `destructive?` | Many |
| `EmptyState` / `ErrorState` | Standard empty and error displays | `title`, `action?` | Many |

shadcn/ui components to add: Button, Input, Label, Form, Card, Badge, RadioGroup, Popover, Calendar, AlertDialog, DropdownMenu, Skeleton, Sonner.

## 6. State Management
### 6.1 Global state
None besides TanStack Query's cache. The Session is represented by the `['me']` query (§8), so there's no separate auth store.

### 6.2 Server state / caching
| Query key | Endpoint | Invalidated by |
|-----------|----------|----------------|
| `['me']` | `GET /auth/me` | login, signup, logout |
| `['trips']` | `GET /trips` | create, update, or delete a Trip |
| `['trip', tripId]` | `GET /trips/:tripId` | update the Trip; Activity changes are applied optimistically and then refetched |

- Defaults: `staleTime` 30 seconds, refetch on window focus, 1 retry for queries, 0 for mutations.
- **Logout** clears the whole query cache so no data from the previous User remains.

### 6.3 Local / form state
React Hook Form for the Trip and auth forms; component state for in-place Activity editing and dialog visibility.

### 6.4 Date handling
- Dates travel and are stored as `YYYY-MM-DD` strings; there are no times or time zones (goal-spec §8).
- Convert to `Date` only for display and calculations, using `date-fns` `parseISO` (local midnight). Never use `new Date('YYYY-MM-DD')`, which parses as UTC and can shift the day.
- "Today" (used to split Upcoming and Past) is the browser's local date.
- Shared helpers in `lib/dates.ts`: `listTripDates(destinations)`, `dayNumber(tripStart, date)`, `destinationsForDate(destinations, date)` (two on a Travel Day), and `validateDestinationSequence(destinations)`. These are the most heavily unit-tested code in the frontend.

### 6.5 Persistence
Nothing is stored in `localStorage` or `sessionStorage`; all data is on the server.

## 7. User Flows

### 7.1 Sign up and first trip
1. A visitor opens `/` and is redirected to `/login`, then clicks "Sign up".
2. They enter a username, password, and confirmation, then submit. They're now logged in and land on `/trips`, which shows the empty state.
3. They click "Plan your first trip" to open `/trips/new`.
4. They enter the name "Japan Spring" and pick Trip Type Couple.
5. Destination 1: Kyoto, 12–14 Mar. Then "Add destination": Osaka, whose start date defaults to 14 Mar; they set the end to 16 Mar.
6. They click "Create trip" and land on `/trips/:id`, which shows Day 1–5. Day 3 (14 Mar) is labeled "Kyoto → Osaka".

### 7.2 Plan a day
1. On the Itinerary, the User clicks "Day 2" in the Day nav and the page scrolls to it.
2. They type "Fushimi Inari at sunrise", press Enter, then type "Nishiki Market lunch" and press Enter.
3. Each Activity appears immediately; failures roll back with a toast.
4. They click "Move up" on the second Activity; the order is saved.

### 7.3 Export PDF
1. The User clicks "Export PDF"; the button shows "Preparing PDF…".
2. The PDF library loads on first use, the document renders, and `japan-spring-itinerary.pdf` downloads.

### 7.4 Shorten a Destination
1. From the Itinerary menu, the User chooses "Edit trip" and changes Osaka's end date from 16 Mar to 15 Mar.
2. On save, the app sees that 16 Mar (Day 5) has 2 Activities and shows a confirmation: "Day 5 · 16 Mar — 2 activities will be deleted."
3. Confirm saves the change and goes back to the Itinerary, which now shows Day 1–4. Cancel goes back to the form with no changes saved.

**Rule:** Activities belong to a calendar date, not to a Day Number. If the Trip's start date moves, Day Numbers are recalculated and each Activity stays on its date.

## 8. Authentication (Client Side)
- **Login / signup flow:** On success, the API sets the Session. The frontend then refetches `['me']` and navigates.
- **Token storage:** The frontend stores no tokens itself. Recommended: the backend issues an HTTP-only, `Secure`, `SameSite=Lax` session cookie, and every request is sent with `credentials: 'include'`. (Final mechanism to be confirmed in `backend-spec.md` / `api-contract-spec.md`.)
- **Determining the Session:** On app load, call `GET /auth/me`. While it's pending, show a full-page spinner. 200 means logged in; 401 means logged out.
- **Protected route handling:** `ProtectedRoute` redirects a logged-out User to `/login?returnTo=<current path>`. After login they're sent to `returnTo`, but only if it's an internal path starting with `/`, to prevent open redirects.
- **Session expiry behavior:** Any API call that returns 401 clears the cache, shows a toast ("Your session has expired, please log in again"), and redirects to `/login?returnTo=…`.
- **Logout:** `POST /auth/logout`, then clear the cache and go to `/login`.

## 9. Design System
- **Colors / theme:** shadcn/ui CSS-variable theme with a neutral base and a single teal accent for primary actions and the Trip Type badges. Light and dark modes follow the operating system setting (`prefers-color-scheme`); a manual toggle is post-MVP.
- **Typography:** System font stack (no web fonts to load). Scale: page title `text-2xl`/`3xl`, section `text-lg`, body `text-sm`/`base`.
- **Spacing / grid:** Tailwind's default 4 px spacing scale. Content max width `max-w-5xl`, centered. Page padding `px-4` on mobile, `px-6` at `md`.
- **Iconography:** `lucide-react` (Plane, MapPin, CalendarDays, Plus, Pencil, Trash2, ChevronUp, ChevronDown, FileDown).
- **Breakpoints / responsive behavior:** Mobile-first, with Tailwind defaults (`sm` 640, `md` 768, `lg` 1024). Works down to a 360 px width. Below `lg`, the Itinerary is a single column with the horizontal Day strip; at `lg` and wider, it has the Day nav sidebar.

## 10. Accessibility
- **Target standard:** WCAG 2.2 AA.
- **Keyboard navigation:** Everything works by keyboard. Focus is visible. Dialogs trap focus and return it when closed (Radix does this). Activity reordering uses buttons, not dragging alone.
- **Screen readers:** Every icon-only button has an `aria-label` (e.g. "Move 'Nishiki Market lunch' up"). Form errors are linked with `aria-describedby`. Toasts are announced through a live region. Day cards are `<section>`s headed by the Day title.
- **Touch:** Tap targets are at least 44 × 44 px on mobile.
- **Contrast:** Text and controls meet AA contrast in both themes.

## 11. Error Handling & Feedback
- **API client:** Every non-2xx response is parsed into the contract's standard error shape (`{ error: { code, message, details } }`) and thrown as an `ApiError`.
- **Handling by error code:**
  | Code | Frontend behavior |
  |------|-------------------|
  | `VALIDATION_ERROR` | Map `details` onto form fields; otherwise show a toast |
  | `UNAUTHORIZED` | Session expiry flow (§8) |
  | `FORBIDDEN` / `NOT_FOUND` | Not Found page for page loads; a toast for actions |
  | `CONFLICT` | Show the message (e.g. "Username is already taken") on the relevant field |
  | Network error / `INTERNAL_ERROR` | Toast "Something went wrong" with Retry where possible |
- **Form validation messages:** Shown inline under the field after the field loses focus or on submit.
- **Toasts / notifications:** Success toasts only for actions without an obvious visual result (e.g. "Trip deleted"). Error toasts for failures, and an Undo toast for Activity delete.
- **Unexpected crashes:** A top-level React error boundary shows "Something went wrong" with a Reload button.

## 12. Performance
- **Targets:** LCP under 2.5 s on a mid-range phone over 4G. Initial JS under 200 KB gzipped, not counting the PDF chunk.
- **Code splitting:** Each route is lazy-loaded. `@react-pdf/renderer` is loaded only when "Export PDF" is clicked.
- **Image optimization:** There are no images in the MVP; icons are SVG.
- **Rendering:** A 60-day Itinerary renders all Day cards without list virtualization. This is acceptable at this size; revisit if it's slow.

## 13. Testing Strategy
- **Unit (Vitest):** `lib/dates.ts` (Day Numbers, Travel Days, sequence validation, the 60-day limit), Zod schemas, and the API error parser.
- **Component (Vitest + RTL + MSW):** `TripForm` validation and submit, `ActivityItem` edit/delete/reorder including rollback on failure, `ProtectedRoute` redirects.
- **End-to-end (Playwright, against the real backend):** one test per goal-spec §7 success checklist item, run in Desktop Chrome and a mobile viewport (Pixel 7). Includes checking that a PDF downloads.

## 14. Folder Structure
```
frontend/
  index.html
  vite.config.ts            # dev proxy: /api → backend
  components.json           # shadcn/ui config
  src/
    main.tsx                # providers: QueryClient, Router, Toaster
    App.tsx                 # route table
    routes/                 # page components: LoginPage, TripListPage, ItineraryPage, ...
    features/
      auth/                 # AuthForm, useMe/useLogin/useSignup/useLogout, ProtectedRoute
      trips/                # TripCard, TripForm, DestinationFields, trip queries/mutations
      itinerary/            # DayNav, DayCard, ActivityItem, ActivityInput, activity mutations
      pdf/                  # ExportPdfButton, ItineraryPdfDocument
    components/
      ui/                   # shadcn/ui generated components
      layout/               # AppShell, EmptyState, ErrorState, ConfirmDialog
    lib/
      api/                  # fetch client, ApiError, endpoint functions
      dates.ts
      utils.ts              # shadcn cn() helper
    types/
      api.ts                # request/response types from api-contract-spec
  tests/
    e2e/                    # Playwright
```

## 15. Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Base URL of the API. In development, leave it as `/api/v1` and let Vite's proxy forward to the backend, so cookies stay on the same origin. | `/api/v1` |

## 16. Open Questions
- **Session mechanism:** cookie session (recommended above) or bearer token? To be settled in the backend spec and API contract.
- **PDF generation in the browser vs. on the server:** This spec generates in the browser, so the backend needs no PDF dependency (e.g. headless Chrome). If the API contract adds a server-side export endpoint, §4.6 changes accordingly.
- **Confirming deletion of Activities when dates shrink:** the frontend computes the affected Days from loaded data. Should `PUT /trips/:tripId` also require an explicit flag (e.g. `confirmDeleteActivities: true`) and reject with `409` otherwise, so the server is safe even if the client is stale? Recommended: yes.
- **Shared types:** hand-written `types/api.ts`, or generated from an OpenAPI document produced by the backend? Depends on the backend stack.
