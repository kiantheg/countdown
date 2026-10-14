import { NextRequest, NextResponse } from "next/server";

const RAPIDAPI_AERODATABOX_BASE = "https://aerodatabox.p.rapidapi.com";
const RAPIDAPI_AERODATABOX_HOST = "aerodatabox.p.rapidapi.com";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_CACHE_ENTRIES = 100;

type ProviderRecord = Record<string, unknown>;

function record(value: unknown): ProviderRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ProviderRecord)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function departureDate(flight: ProviderRecord): string | null {
  const departure = record(flight.departure);
  const scheduledTime = record(departure.scheduledTime);
  const localTime = text(scheduledTime.local);
  if (localTime && isCalendarDate(localTime.slice(0, 10))) {
    return localTime.slice(0, 10);
  }

  // UTC can fall on the next day, especially for evening and red-eye flights.
  // Only derive the departure date when the departure airport's zone is known.
  const utcTime = text(scheduledTime.utc);
  const timeZone = text(record(departure.airport).timeZone);
  if (!utcTime || !timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(utcTime));
    const part = (type: string) => parts.find((value) => value.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const number = request.nextUrl.searchParams.get("number");
  const date = request.nextUrl.searchParams.get("date");
  const cleaned = number?.replace(/\s+/g, "").toUpperCase() ?? "";
  if (!/^(?:[A-Z][A-Z0-9]|[0-9][A-Z]|[A-Z]{3})\d{1,4}[A-Z]?$/.test(cleaned)) {
    return NextResponse.json(
      { error: "Provide a flight number like B6615." },
      { status: 400 }
    );
  }
  if (date !== null && !isCalendarDate(date)) {
    return NextResponse.json(
      { error: "Provide a valid departure date like 2026-10-28." },
      { status: 400 }
    );
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return NextResponse.json(
      { error: "Live flight updates are unavailable right now." },
      { status: 503 }
    );
  }
  const rapidApiHost =
    process.env.RAPIDAPI_AERODATABOX_HOST ?? RAPIDAPI_AERODATABOX_HOST;
  const path = date
    ? `/flights/number/${encodeURIComponent(cleaned)}/${date}`
    : `/flights/number/${encodeURIComponent(cleaned)}`;
  const cached = cache.get(path);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload);
  }

  const noFlight = () => NextResponse.json(
    { error: `No live flight information found for ${cleaned}${date ? ` on ${date}` : ""}. Check again closer to departure.` },
    { status: 404 }
  );
  const url = new URL(`${RAPIDAPI_AERODATABOX_BASE}${path}`);
  url.searchParams.set("dateLocalRole", "Departure");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let rawPayload: unknown;

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": rapidApiHost,
        Accept: "application/json",
      },
    });
    if (response.status === 204 || response.status === 404) return noFlight();
    if (!response.ok) {
      return NextResponse.json(
        { error: "Live flight updates are temporarily unavailable. Please try again soon." },
        { status: response.status === 429 ? 503 : 502 }
      );
    }
    rawPayload = await response.json();
  } catch {
    return NextResponse.json(
      {
        error: controller.signal.aborted
          ? "The flight provider took too long to respond. Please try again."
          : "Could not load live flight updates. Please try again soon.",
      },
      { status: controller.signal.aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!Array.isArray(rawPayload)) {
    return NextResponse.json(
      { error: "The flight provider returned an unreadable update. Please try again soon." },
      { status: 502 }
    );
  }
  const flights = rawPayload
    .filter((value) => value !== null && typeof value === "object" && !Array.isArray(value))
    .map(record);
  const flight = date
    ? flights.find((candidate) => departureDate(candidate) === date)
    : flights[0];
  if (!flight) return noFlight();

  const arrival = record(flight.arrival);
  const departure = record(flight.departure);
  const arrivalAirport = record(arrival.airport);
  const departureAirport = record(departure.airport);
  const arrivalTime =
    text(record(arrival.revisedTime).utc) ||
    text(record(arrival.runwayTime).utc) ||
    text(record(arrival.predictedTime).utc) ||
    text(record(arrival.scheduledTime).utc);

  const payload = {
    flight: {
      airline: text(record(flight.airline).name) ?? "Airline unavailable",
      flightNumber: text(flight.number) ?? cleaned,
      status: text(flight.status) ?? "Unknown",
      arrivalTime,
      scheduledArrivalTime: text(record(arrival.scheduledTime).utc),
      scheduledDepartureTime: text(record(departure.scheduledTime).utc),
      arrivalTimezone: text(arrivalAirport.timeZone),
      arrivalAirport: text(arrivalAirport.name),
      arrivalIata: text(arrivalAirport.iata),
      departureAirport: text(departureAirport.name),
      departureIata: text(departureAirport.iata),
      departureTimezone: text(departureAirport.timeZone),
      gate: text(arrival.gate),
      terminal: text(arrival.terminal),
      baggage: text(arrival.baggageBelt),
      updatedAt: text(flight.lastUpdatedUtc),
    },
  };

  for (const [key, entry] of cache) {
    if (Date.now() >= entry.expiresAt) cache.delete(key);
  }
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(path, { expiresAt: Date.now() + CACHE_TTL_MS, payload });

  return NextResponse.json(payload);
}
