import { NextRequest, NextResponse } from "next/server";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_CACHE_ENTRIES = 100;
const ARRIVAL_BUFFER_SEC = 15 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

type ProviderRecord = Record<string, unknown>;

function record(value: unknown): ProviderRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ProviderRecord)
    : {};
}

function parseArrivalTime(value: string): number | null {
  // Accept both ISO timestamps and the flight provider's "YYYY-MM-DD HH:mmZ".
  if (!/^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    return null;
  }
  const calendarDate = value.slice(0, 10);
  const date = new Date(`${calendarDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== calendarDate) {
    return null;
  }
  const timestamp = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function durationSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,9})?s$/.test(value)) return null;
  const seconds = Number(value.slice(0, -1));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const arrivalTime = params.get("arrivalTime")?.trim() ?? "";
  const arrivalTerminal = params.get("arrivalTerminal")?.trim() ?? "";
  const arrivalAirport = params.get("arrivalAirport")?.trim() ?? "";
  const arrivalIata = params.get("arrivalIata")?.trim().toUpperCase() ?? "";
  const destination = params.get("destination")?.trim() ?? "";
  const stopParams = params.getAll("stop");
  const stops = stopParams.map((stop) => stop.trim()).filter(Boolean);

  if ((!arrivalAirport && !arrivalIata) || !destination) {
    return NextResponse.json(
      { error: "Choose an arrival airport and enter a destination to plan your drive." },
      { status: 400 }
    );
  }
  if (arrivalIata && !/^[A-Z]{3}$/.test(arrivalIata)) {
    return NextResponse.json(
      { error: "Use a three-letter airport code like SFO or JFK." },
      { status: 400 }
    );
  }
  if (stopParams.length > 3) {
    return NextResponse.json(
      { error: "Add up to three stops along the way." },
      { status: 400 }
    );
  }
  if (arrivalAirport.length > 200 || arrivalTerminal.length > 40 || destination.length > 500 || stops.some((stop) => stop.length > 500)) {
    return NextResponse.json(
      { error: "Use a shorter airport, terminal, destination, or stop name." },
      { status: 400 }
    );
  }

  const arrivalTimestamp = parseArrivalTime(arrivalTime);
  const now = Date.now();
  if (arrivalTimestamp === null) {
    return NextResponse.json(
      { error: "Provide a valid flight arrival time with its timezone." },
      { status: 400 }
    );
  }
  if (arrivalTimestamp < now - DAY_MS || arrivalTimestamp > now + 366 * DAY_MS) {
    return NextResponse.json(
      { error: "Choose a flight arriving within the next year or the past 24 hours." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Drive estimates are unavailable right now. You can still open the route in Google Maps." },
      { status: 503 }
    );
  }

  const airport = arrivalIata === "JFK"
    ? "John F. Kennedy International Airport"
    : arrivalIata === "SFO"
      ? "San Francisco International Airport"
      : arrivalAirport || `${arrivalIata} airport`;
  const terminal = /^terminal\b/i.test(arrivalTerminal) ? arrivalTerminal : `Terminal ${arrivalTerminal}`;
  const origin = arrivalTerminal ? `${airport} ${terminal}` : airport;
  // Google does not accept past departure times for driving routes.
  const bufferedDeparture = arrivalTimestamp + ARRIVAL_BUFFER_SEC * 1000;
  const departureTime = new Date(Math.max(bufferedDeparture, now));
  const cacheKey = JSON.stringify([origin, destination, stops, arrivalTime]);
  const cached = cache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return NextResponse.json(cached.payload);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let rawPayload: unknown;
  try {
    const response = await fetch(GOOGLE_ROUTES_URL, {
      cache: "no-store",
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters",
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        intermediates: stops.map((stop) => ({ address: stop })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        ...(bufferedDeparture > now ? { departureTime: departureTime.toISOString() } : {}),
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "IMPERIAL",
      }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Drive estimates are temporarily unavailable. Please try again soon." },
        { status: response.status === 429 ? 503 : 502 }
      );
    }
    rawPayload = await response.json();
  } catch {
    return NextResponse.json(
      {
        error: controller.signal.aborted
          ? "The route provider took too long to respond. Please try again."
          : "Could not load your drive estimate. Please try again soon.",
      },
      { status: controller.signal.aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = record(rawPayload);
  if (rawPayload === null || typeof rawPayload !== "object" || Array.isArray(rawPayload) || payload.error || (payload.routes !== undefined && !Array.isArray(payload.routes))) {
    return NextResponse.json(
      { error: "The route provider returned an unreadable estimate. Please try again soon." },
      { status: 502 }
    );
  }
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  const route = record(routes[0]);
  const legs = Array.isArray(route.legs) ? route.legs.map(record) : [];
  if (!legs.length) {
    return NextResponse.json(
      { error: "No drive route found. Check the destination and any stops." },
      { status: 404 }
    );
  }
  const legDurations = legs.map((leg) => durationSeconds(leg.duration));
  if (legDurations.some((duration) => duration === null) || legs.length !== stops.length + 1) {
    return NextResponse.json(
      { error: "The route provider returned an incomplete estimate. Please try again soon." },
      { status: 502 }
    );
  }

  const routePoints = [origin, ...stops, destination];
  const mappedLegs = legs.map((leg, index) => {
    const durationSec = legDurations[index] ?? 0;
    const distanceMeters = leg.distanceMeters;
    return {
      from: routePoints[index],
      to: routePoints[index + 1],
      durationSec,
      durationText: formatDuration(durationSec),
      distanceText: typeof distanceMeters === "number" && Number.isFinite(distanceMeters) && distanceMeters >= 0
        ? `${(distanceMeters / 1609.344).toFixed(1)} mi`
        : "Distance unavailable",
    };
  });
  const totalDurationSec = durationSeconds(route.duration) ?? mappedLegs.reduce(
    (sum, leg) => sum + leg.durationSec,
    0
  );
  const driveArrivalTime = new Date(departureTime.getTime() + totalDurationSec * 1000);
  if (!Number.isFinite(driveArrivalTime.getTime())) {
    return NextResponse.json(
      { error: "The route provider returned an invalid arrival estimate. Please try again soon." },
      { status: 502 }
    );
  }

  const responsePayload = {
    route: {
      origin,
      destination,
      stops,
      departureTime: departureTime.toISOString(),
      arrivalTime: driveArrivalTime.toISOString(),
      bufferSec: ARRIVAL_BUFFER_SEC,
      bufferText: formatDuration(ARRIVAL_BUFFER_SEC),
      totalDurationSec,
      totalDurationText: formatDuration(totalDurationSec),
      legs: mappedLegs,
    },
  };

  for (const [key, entry] of cache) {
    if (Date.now() >= entry.expiresAt) cache.delete(key);
  }
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload: responsePayload,
  });

  return NextResponse.json(responsePayload);
}
