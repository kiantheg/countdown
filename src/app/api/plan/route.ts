import { NextResponse } from "next/server";
import { itinerary, planSync } from "../../../lib/trip";

export const dynamic = "force-dynamic";

// Serve the validated published snapshot. The private Google Doc is read by
// the scheduled sync, so no Drive credentials are exposed to site visitors.
export function GET() {
  return NextResponse.json({ ...planSync, days: itinerary }, {
    headers: { "Cache-Control": "no-store" },
  });
}
