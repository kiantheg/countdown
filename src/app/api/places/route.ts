import { NextRequest, NextResponse } from "next/server";

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 30_000;
const PROVIDER_TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 100;

function unavailable(status = 502) {
  return NextResponse.json(
    { error: "Address suggestions are unavailable right now. You can still enter an address." },
    { status }
  );
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ predictions: [] });
  }
  if (query.length > 500) {
    return NextResponse.json(
      { error: "Use a shorter place name or address." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return unavailable(503);

  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload);
  }

  const url = new URL(GOOGLE_PLACES_AUTOCOMPLETE_URL);
  url.searchParams.set("input", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  url.searchParams.set("components", "country:us");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let payload: unknown;
  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return unavailable(response.status === 429 ? 503 : 502);
    payload = await response.json();
  } catch {
    return unavailable(controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return unavailable();
  }
  const result = payload as Record<string, unknown>;
  if (result.status !== "OK" && result.status !== "ZERO_RESULTS") {
    return unavailable(result.status === "REQUEST_DENIED" || result.status === "OVER_QUERY_LIMIT" ? 503 : 502);
  }
  if (result.status === "OK" && !Array.isArray(result.predictions)) {
    return unavailable();
  }

  const predictions = result.status === "OK" && Array.isArray(result.predictions)
    ? result.predictions
      .filter((item): item is { place_id: string; description: string } =>
        item !== null && typeof item === "object" &&
        typeof item.place_id === "string" && item.place_id.trim().length > 0 &&
        typeof item.description === "string" && item.description.trim().length > 0
      )
      .slice(0, 6)
      .map((item) => ({ placeId: item.place_id, description: item.description }))
    : [];

  const responsePayload = { predictions };
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
