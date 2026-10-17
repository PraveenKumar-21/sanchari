# Goal Spec — Sanchari Trip Planner

> Status: Draft | Owner: Praveen Kumar | Last updated: 2026-10-17

## 1. Problem Statement
<!-- What problem does this app solve? Who has this problem today, and how do they cope without this tool? -->
Travelers planning a trip — often across more than one city or region — typically scatter their day-by-day plans across notes apps, spreadsheets, or chat threads. This makes it hard to keep an itinerary organized, hand it to travel companions, or reference it while traveling. This app gives travelers a single place to plan a trip destination by destination and day by day, and to export a clean, printable itinerary they can share.

## 2. Target Users
<!-- Who uses this app? e.g. solo travelers, families, groups of friends. Include any relevant personas. -->
Any traveler planning a trip, regardless of who they're traveling with — solo, as a couple, with family, or with a group of friends. In the MVP, one person (the Trip Owner) plans the trip; companions receive the exported PDF rather than accessing the app.

## 3. Core Use Cases
<!-- The primary user journeys, as short scenarios. -->
- **UC-1:** As a user, I want to sign up and log in so that my trips are saved and private to me.
- **UC-2:** As a user, I want to create a trip and add one or more destinations to it so that my whole journey is in one place.
- **UC-3:** As a user, I want to enter a start and end date for each destination so that the app lays out my trip as Day 1 through Day N.
- **UC-4:** As a user, I want to add, edit, and remove activities for each day so that I can plan the trip day by day.
- **UC-5:** As a user, I want to see a list of all my trips so that I can pick one up and keep planning.
- **UC-6:** As a user, once I'm happy with the plan, I want to export the itinerary as a PDF so that I can print it or share it with my companions.

## 4. Core Features (MVP)
<!-- Bullet list of must-have features for v1. Be specific enough to scope work, not exhaustive. -->
- **F-1 Responsive web app:** usable on desktop and mobile browsers (no native mobile app).
- **F-2 Accounts:** sign up with username + password; log in and log out. Each user sees only their own trips.
- **F-3 Create trip:** a trip has a name, a trip type (Solo, Couple, Family, Group of Friends), and one or more destinations.
- **F-4 Manage destinations:** add, edit, and remove a trip's destinations; each destination has a name, start date, and end date. Destinations are ordered automatically by start date. The trip's overall date range is derived from its destinations.
- **F-5 Day-by-day planning:** open a trip's itinerary and see Day 1 through Day N, each labeled with its date and destination; add, edit, delete, and reorder free-text activities on any day.
- **F-6 Trip list:** view all of the user's trips with name, destinations, and dates; open, edit, or delete a trip.
- **F-7 PDF export:** export a trip's itinerary as a PDF at any time.

## 5. Nice-to-Have Features (Post-MVP)
<!-- Features explicitly deferred. Helps prevent scope creep. -->
- Email-based account flows: email verification and password reset
- Optional time of day on activities (e.g. "09:30 — Museum visit")
- Duplicate an existing trip as a starting point for a new one

## 6. Out of Scope
<!-- Explicitly excluded from this project, to avoid ambiguity later. -->
- Pre-defined activity options (e.g. picking activities from a dropdown) — activities are free text only
- Activity suggestions based on trip type or destination
- Collaboration: sharing a trip with other accounts, co-editing, or public share links
- Bookings, budgets/expenses, maps, weather, or any other third-party integrations
- Offline mode
- Native mobile apps

## 7. Success Metrics
<!-- How do we know this app is working? -->
The MVP is done when a new user, on both a desktop browser and a mobile browser, can:
- [ ] Sign up, log out, and log back in (F-2)
- [ ] Create a trip with at least two destinations (F-3, F-4)
- [ ] See the trip appear in their trip list, and not see anyone else's trips (F-2, F-6)
- [ ] Plan activities across every day of the trip, and edit or delete them (F-5)
- [ ] Change a destination's dates and see the days update correctly (F-4, F-5)
- [ ] Export the itinerary as a readable, printable PDF (F-7)
- [ ] Complete the whole flow, from signup to PDF, for a 3-day trip in under 10 minutes

## 8. Constraints & Assumptions
<!-- Budget, timeline, team size, must-use tech, offline requirements, target platforms (web/mobile), etc. -->
**Constraints**
- Timeline: 2 weekends
- Team size: 1 person
- Target platform: web only, built responsively for mobile browsers
- Tech stack: to be chosen in `frontend-spec.md` and `backend-spec.md`
- Hosting: free tiers only: Vercel Hobby (app) + Neon Free (Postgres); details in `backend-spec.md` §17

**Assumptions** (validate while writing the other specs)
- A trip has 1–10 destinations and lasts at most 60 days in total.
- Destinations are ordered by start date. Consecutive destinations may share a boundary date (a travel day) but otherwise must not overlap. Gaps between destinations are not allowed.
- Dates are calendar dates with no time zones.
- If a destination's dates change so that some days drop out of the trip, the user is warned, and activities on the removed days are deleted only after they confirm.
- Trip Type is a label only in the MVP; it doesn't change app behavior.
- Usernames are unique. Without email-based recovery, a forgotten password means the account can't be recovered in the MVP.

## 9. Glossary
<!-- Domain terms specific to this app and their precise meaning, to keep frontend/backend/API specs consistent. -->
| Term | Definition |
|------|------------|
| User | A person with an account (username + password) who can create, view, edit, and delete their own Trips. |
| Account | The stored record of a User's credentials: a unique Username and a hashed Password. |
| Username | A unique identifier the User picks at signup and uses to log in. |
| Session | The authenticated state after a User logs in, lasting until they log out or it expires. |
| Trip Owner | The User who created a Trip. In the MVP, only the Trip Owner can view or change it. |
| Trip | A planned journey with a name, a Trip Type, one or more Destinations, and an Itinerary. Belongs to exactly one Trip Owner. |
| Trip Type | Who a Trip is for: one of Solo, Couple, Family, or Group of Friends. A label only in the MVP. |
| Destination | A place (e.g. a city or region) visited during a Trip, with its own start date and end date. A Trip has one or more Destinations, ordered by start date. |
| Travel Day | A date shared by two consecutive Destinations: the end date of one and the start date of the next. That Day is labeled with both Destinations. |
| Trip Dates | A Trip's overall date range: from the earliest Destination start date to the latest Destination end date. Derived, never entered directly. |
| Itinerary | The full day-by-day plan for a Trip: one Day for each date in the Trip Dates, each holding that Day's Activities. |
| Day | A single date within the Trip Dates, labeled with its Day Number, its calendar date, and its Destination(s). Holds an ordered list of Activities. |
| Day Number | A Day's position in the Trip, counted from Day 1 (the first date) through Day N (the last date), where N = (last date − first date) + 1. |
| Activity | A free-text entry describing something planned for a specific Day. A User can add, edit, delete, and reorder Activities within a Day. |
| Trip List | The screen showing all of a User's Trips, with each Trip's name, Destinations, and Trip Dates. |
| Itinerary Export | A PDF of a Trip's Itinerary (Trip details, Destinations, and each Day's Activities), generated on demand for printing or sharing. |
