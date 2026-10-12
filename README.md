# California trip planner

A Next.js trip dashboard for Kian’s October 28–November 3, 2026 visit to Becca.

## Development

```bash
npm install
npm run dev
npm run build
```

Trip dates, confirmed flight schedules, itinerary entries, and calendar export live in `src/lib/trip.ts`. The current plan is a snapshot of the linked Google Doc as of October 12; edits to the Doc do not automatically sync.

The booked schedule and countdown work without API access. Optional live flight updates use `RAPIDAPI_KEY` (AeroDataBox), with optional `RAPIDAPI_AERODATABOX_HOST`. Keep these in server environment variables, never in client code. The retained `/api/drive` and `/api/places` endpoints use `GOOGLE_MAPS_API_KEY`, but the route UI no longer depends on them.

The flight card checks automatically every five minutes from 48 hours before departure through 12 hours after scheduled arrival. Unavailable updates fall back to the booking. All flight timestamps include explicit offsets; activity times use America/Los_Angeles. The return lands November 4. The calendar export includes the visit, both flights, and anniversary.

The outbound airport transfer defaults to 710 Bowdoin St, Stanford, CA 94305 (the full street address listed by Stanford). Its Google Maps share embed previews the direct SFO route without an API key; edited destinations and stops open through the Google Maps directions button. Preview travel times describe current conditions, not the trip date. The previous in-site drive estimate and autocomplete controls were removed because the server key's billing/API access is unavailable. Booking references, ticket numbers, and account details are not included.

## Hosting

The existing Vercel Git integration deploys `main` to https://countdown-eta-three.vercel.app.
