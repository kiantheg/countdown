import { NextRequest, NextResponse } from "next/server";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 60_000;

const WAYPOINT = "1256 West St, Hayward, CA";
const DESTINATION = "757 Campus Drive, Stanford, CA 94305";
const STOP_BUFFER_SEC = 15 * 60;

const formatDuration = (seconds: number) => {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
};

export async function GET(request: NextRequest) {
  const arrivalTime = request.nextUrl.searchParams.get("arrivalTime");
  const arrivalTerminal = request.nextUrl.searchParams.get("arrivalTerminal");
  if (!arrivalTime) {
    return NextResponse.json(
      { error: "Provide arrivalTime to calculate drive ETA." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY on the server." },
      { status: 500 }
    );
  }

  const parsed = new Date(arrivalTime);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json(
      { error: "arrivalTime must be a valid ISO date." },
      { status: 400 }
    );
  }

  const departureTime = new Date(parsed.getTime() + 15 * 60 * 1000);
  const origin = arrivalTerminal
    ? `San Francisco International Airport Terminal ${arrivalTerminal}`
    : "San Francisco International Airport";

  const cacheKey = `${origin}|${WAYPOINT}|${DESTINATION}|${departureTime.toISOString()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload);
  }

  const response = await fetch(GOOGLE_ROUTES_URL, {
    cache: "no-store",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters",
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: DESTINATION },
      intermediates: [{ address: WAYPOINT }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      departureTime: departureTime.toISOString(),
      computeAlternativeRoutes: false,
      languageCode: "en-US",
      units: "IMPERIAL",
    }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Drive provider error (${response.status}).` },
      { status: 502 }
    );
  }

  const payload = await response.json();
  if (payload.error?.message) {
    return NextResponse.json(
      { error: payload.error.message },
      { status: 502 }
    );
  }

  const route = payload.routes?.[0];
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  if (!legs.length) {
    return NextResponse.json(
      { error: "No drive route found." },
      { status: 404 }
    );
  }

  const legAddresses = [
    { from: origin, to: WAYPOINT },
    { from: WAYPOINT, to: DESTINATION },
  ];

  const mappedLegs = legs.map((leg: any, index: number) => {
    const duration = leg.duration;
    const durationSec = Number.parseInt(
      String(duration ?? "0").replace("s", ""),
      10
    );
    const distanceMeters = leg.distanceMeters ?? 0;
    const distanceMiles = distanceMeters / 1609.344;
    return {
      from: legAddresses[index]?.from ?? "Unknown",
      to: legAddresses[index]?.to ?? "Unknown",
      durationSec: Number.isNaN(durationSec) ? 0 : durationSec,
      durationText: formatDuration(
        Number.isNaN(durationSec) ? 0 : durationSec
      ),
      distanceText: `${distanceMiles.toFixed(1)} mi`,
    };
  });

  const baseDurationSec = mappedLegs.reduce(
    (sum: number, leg: { durationSec: number }) => sum + leg.durationSec,
    0
  );
  const bufferStops = Math.max(0, mappedLegs.length - 1);
  const bufferSec = bufferStops * STOP_BUFFER_SEC;
  const totalDurationSec = baseDurationSec + bufferSec;
  const driveArrivalTime = new Date(
    departureTime.getTime() + totalDurationSec * 1000
  );

  const responsePayload = {
    route: {
      origin,
      waypoint: WAYPOINT,
      destination: DESTINATION,
      departureTime: departureTime.toISOString(),
      arrivalTime: driveArrivalTime.toISOString(),
      bufferSec,
      bufferStops,
      bufferText: bufferSec ? formatDuration(bufferSec) : "0 min",
      totalDurationSec,
      totalDurationText: formatDuration(totalDurationSec),
      legs: mappedLegs,
    },
  };

  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload: responsePayload,
  });

  return NextResponse.json(responsePayload);
}
