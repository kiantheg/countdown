import { NextRequest, NextResponse } from "next/server";

const RAPIDAPI_AERODATABOX_BASE = "https://aerodatabox.p.rapidapi.com";
const RAPIDAPI_AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 60_000;

export async function GET(request: NextRequest) {
  const number = request.nextUrl.searchParams.get("number");
  const date = request.nextUrl.searchParams.get("date");
  if (!number) {
    return NextResponse.json(
      { error: "Provide a flight number like DL123." },
      { status: 400 }
    );
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Provide a flight date like 2026-03-05." },
      { status: 400 }
    );
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json(
      { error: "Missing RAPIDAPI_KEY on the server." },
      { status: 500 }
    );
  }
  const rapidApiHost =
    process.env.RAPIDAPI_AERODATABOX_HOST ?? RAPIDAPI_AERODATABOX_HOST;

  const cleaned = number.replace(/\s+/g, "").toUpperCase();
  const path = date
    ? `/flights/number/${encodeURIComponent(cleaned)}/${date}`
    : `/flights/number/${encodeURIComponent(cleaned)}`;
  const cacheKey = `${path}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload);
  }

  const url = new URL(`${RAPIDAPI_AERODATABOX_BASE}${path}`);
  url.searchParams.set("dateLocalRole", "Both");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": rapidApiHost,
      Accept: "application/json",
    },
  });

  if (response.status === 204) {
    return NextResponse.json(
      { error: `No flight found for ${cleaned}.` },
      { status: 404 }
    );
  }

  if (!response.ok) {
    let details = `Flight provider error (${response.status}).`;
    const body = await response.text();
    try {
      const errorPayload = JSON.parse(body);
      details = errorPayload?.message || details;
    } catch {
      if (body.trim()) {
        details = body.trim();
      }
    }
    return NextResponse.json({ error: details }, { status: 502 });
  }

  const rawPayload = await response.json();
  const flights = Array.isArray(rawPayload) ? rawPayload : [];
  const flight = flights[0];
  if (!flight) {
    return NextResponse.json(
      { error: `No flight found for ${cleaned}.` },
      { status: 404 }
    );
  }

  const arrival = flight.arrival ?? {};
  const departure = flight.departure ?? {};
  const arrivalTime =
    arrival.predictedTime?.utc ||
    arrival.revisedTime?.utc ||
    arrival.scheduledTime?.utc ||
    arrival.runwayTime?.utc ||
    null;
  const scheduledArrivalTime = arrival.scheduledTime?.utc ?? null;
  const scheduledDepartureTime = departure.scheduledTime?.utc ?? null;

  const payload = {
    flight: {
      airline: flight.airline?.name ?? "American Airlines",
      flightNumber: flight.number ?? cleaned,
      status: flight.status ?? "Unknown",
      arrivalTime,
      scheduledArrivalTime,
      scheduledDepartureTime,
      arrivalTimezone: arrival.airport?.timeZone ?? null,
      arrivalAirport: arrival.airport?.name ?? null,
      arrivalIata: arrival.airport?.iata ?? null,
      departureAirport: departure.airport?.name ?? null,
      departureIata: departure.airport?.iata ?? null,
      departureTimezone: departure.airport?.timeZone ?? null,
      gate: arrival.gate ?? null,
      terminal: arrival.terminal ?? null,
      baggage: arrival.baggageBelt ?? null,
      updatedAt: flight.lastUpdatedUtc ?? null,
    },
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });

  return NextResponse.json(payload);
}
