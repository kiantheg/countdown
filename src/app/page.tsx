"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FlightInfo = {
  airline: string;
  flightNumber: string;
  status: string;
  arrivalTime: string | null;
  scheduledArrivalTime: string | null;
  scheduledDepartureTime: string | null;
  arrivalTimezone: string | null;
  arrivalAirport: string | null;
  arrivalIata: string | null;
  departureAirport: string | null;
  departureIata: string | null;
  departureTimezone: string | null;
  gate: string | null;
  terminal: string | null;
  baggage: string | null;
  updatedAt: string | null;
};

type FlightResponse = {
  flight: FlightInfo;
  error?: string;
};

type DriveLeg = {
  from: string;
  to: string;
  durationSec: number;
  durationText: string;
  distanceText: string;
};

type DriveInfo = {
  origin: string;
  destination: string;
  stops: string[];
  departureTime: string;
  arrivalTime: string;
  bufferSec: number;
  bufferText: string;
  totalDurationSec: number;
  totalDurationText: string;
  legs: DriveLeg[];
};

type DriveResponse = {
  route: DriveInfo;
  error?: string;
};

type PlacePrediction = {
  placeId: string;
  description: string;
};

const DEFAULT_FLIGHT_NUMBER = "AA166";
const DEFAULT_FLIGHT_DATE = "2026-04-29";
const DEFAULT_DESTINATION = "30 Riverside Blvd, New York, NY 10069";
const DRIVE_TIMEZONE = "America/New_York";
const DEFAULT_ORIGIN_LABEL = "JFK American Airlines Terminal 8";

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
};

const formatTime = (date: Date, timeZone?: string | null) => {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone,
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat("en-US", options).format(date);
    }
  }
  return new Intl.DateTimeFormat("en-US", options).format(date);
};

const formatSlot = (value: number) => String(value).padStart(2, "0");

const TICKER_ITEMS = [
  "NYC arrival countdown",
  "American Airlines AA166",
  "SFO → JFK on April 29, 2026",
  "JFK Terminal 8 → 30 Riverside Blvd",
  "NYC arrival countdown",
  "American Airlines AA166",
  "SFO → JFK on April 29, 2026",
  "JFK Terminal 8 → 30 Riverside Blvd",
];

export default function Home() {
  const [query, setQuery] = useState(DEFAULT_FLIGHT_NUMBER);
  const [dateQuery, setDateQuery] = useState(DEFAULT_FLIGHT_DATE);
  const [flight, setFlight] = useState<FlightInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [drive, setDrive] = useState<DriveInfo | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [destination, setDestination] = useState(DEFAULT_DESTINATION);
  const [stops, setStops] = useState<string[]>([]);
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [activePlaceField, setActivePlaceField] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const routeFormRef = useRef<HTMLFormElement | null>(null);

  const fetchFlight = useCallback(async (number: string, date: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/flight?number=${encodeURIComponent(number)}&date=${encodeURIComponent(date)}`
      );
      const payload: FlightResponse = await response.json();
      if (!response.ok) {
        setFlight(null);
        setError(payload.error ?? "Unable to fetch this flight right now.");
        return;
      }
      setFlight(payload.flight);
      setLastRefreshed(new Date());
    } catch {
      setFlight(null);
      setError("Network error while loading flight status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlight(DEFAULT_FLIGHT_NUMBER, DEFAULT_FLIGHT_DATE);
  }, [fetchFlight]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchFlight(query, dateQuery);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchFlight, query, dateQuery]);

  useEffect(() => {
    if (!flight?.arrivalTime) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [flight?.arrivalTime]);

  const arrivalDate = useMemo(() => {
    if (!flight?.arrivalTime) return null;
    const parsed = new Date(flight.arrivalTime);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, [flight?.arrivalTime]);

  const scheduledArrivalDate = useMemo(() => {
    if (!flight?.scheduledArrivalTime) return null;
    const parsed = new Date(flight.scheduledArrivalTime);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, [flight?.scheduledArrivalTime]);

  const scheduledDepartureDate = useMemo(() => {
    if (!flight?.scheduledDepartureTime) return null;
    const parsed = new Date(flight.scheduledDepartureTime);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, [flight?.scheduledDepartureTime]);

  // Flight progress: % of scheduled flight time elapsed
  const flightProgressPercent = useMemo(() => {
    if (!scheduledDepartureDate || !scheduledArrivalDate) return null;
    const total =
      scheduledArrivalDate.getTime() - scheduledDepartureDate.getTime();
    if (total <= 0) return null;
    const elapsed = now - scheduledDepartureDate.getTime();
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  }, [scheduledDepartureDate, scheduledArrivalDate, now]);

  const driveStartTime = flight?.arrivalTime ?? flight?.scheduledArrivalTime;

  const fetchDrive = useCallback(async () => {
    if (!driveStartTime) {
      setDrive(null);
      setDriveError(null);
      return;
    }

    setDriveLoading(true);
    setDriveError(null);

    try {
      const params = new URLSearchParams({
        arrivalTime: driveStartTime,
        destination: destination.trim() || DEFAULT_DESTINATION,
      });
      if (flight?.arrivalAirport) {
        params.set("arrivalAirport", flight.arrivalAirport);
      }
      if (flight?.arrivalIata) {
        params.set("arrivalIata", flight.arrivalIata);
      }
      if (flight?.terminal) {
        params.set("arrivalTerminal", flight.terminal);
      }
      stops
        .map((stop) => stop.trim())
        .filter(Boolean)
        .forEach((stop) => params.append("stop", stop));
      const response = await fetch(`/api/drive?${params.toString()}`);
      const payload: DriveResponse = await response.json();
      if (!response.ok) {
        setDrive(null);
        setDriveError(payload.error ?? "Unable to fetch drive ETA.");
        return;
      }
      setDrive(payload.route);
    } catch {
      setDrive(null);
      setDriveError("Network error while loading drive ETA.");
    } finally {
      setDriveLoading(false);
    }
  }, [
    destination,
    driveStartTime,
    flight?.arrivalAirport,
    flight?.arrivalIata,
    flight?.terminal,
    stops,
  ]);

  useEffect(() => {
    fetchDrive();
  }, [fetchDrive]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (
        routeFormRef.current &&
        !routeFormRef.current.contains(event.target as Node)
      ) {
        setActivePlaceField(null);
        setPlacePredictions([]);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const activePlaceQuery = useMemo(() => {
    if (!activePlaceField) return "";
    if (activePlaceField === "destination") return destination;
    if (!activePlaceField.startsWith("stop-")) return "";
    const index = Number.parseInt(activePlaceField.replace("stop-", ""), 10);
    if (Number.isNaN(index)) return "";
    return stops[index] ?? "";
  }, [activePlaceField, destination, stops]);

  useEffect(() => {
    const query = activePlaceQuery.trim();
    if (!activePlaceField || query.length < 3) {
      setPlacePredictions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setPlaceLoading(true);
      try {
        const response = await fetch(
          `/api/places?query=${encodeURIComponent(query)}`
        );
        const payload = await response.json();
        if (!response.ok) {
          setPlacePredictions([]);
          return;
        }
        setPlacePredictions(
          Array.isArray(payload.predictions) ? payload.predictions : []
        );
      } catch {
        setPlacePredictions([]);
      } finally {
        setPlaceLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [activePlaceField, activePlaceQuery]);

  const status = (flight?.status ?? "").toLowerCase();
  const isLandedStatus = status === "landed" || status === "arrived";
  const remainingMs = arrivalDate ? arrivalDate.getTime() - now : null;
  const isLanded = isLandedStatus || (remainingMs !== null && remainingMs <= 0);
  const countdown = remainingMs !== null ? formatCountdown(remainingMs) : null;

  const statusTone = isLanded
    ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
    : "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await fetchFlight(trimmed, dateQuery);
  };

  const onRouteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetchDrive();
  };

  const addStop = () => setStops((current) => [...current, ""]);

  const updateStop = (index: number, value: string) => {
    setStops((current) =>
      current.map((stop, stopIndex) => (stopIndex === index ? value : stop))
    );
  };

  const removeStop = (index: number) => {
    setStops((current) => current.filter((_, stopIndex) => stopIndex !== index));
  };

  const applyPlacePrediction = (prediction: PlacePrediction) => {
    if (!activePlaceField) return;
    if (activePlaceField === "destination") {
      setDestination(prediction.description);
    } else if (activePlaceField.startsWith("stop-")) {
      const index = Number.parseInt(activePlaceField.replace("stop-", ""), 10);
      if (!Number.isNaN(index)) {
        updateStop(index, prediction.description);
      }
    }
    setPlacePredictions([]);
    setActivePlaceField(null);
  };

  const routeTitle = `${drive?.origin ?? DEFAULT_ORIGIN_LABEL} \u2192 ${
    drive?.destination ?? DEFAULT_DESTINATION
  }`;

  return (
    <div className="brand-shell relative min-h-screen overflow-hidden text-slate-100">
      {/* Ambient orbs */}
      <div
        aria-hidden
        className="ambient-orb pointer-events-none absolute left-0 top-0 h-96 w-96 -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#1d4ed8]/30 blur-[140px]"
      />
      <div
        aria-hidden
        className="ambient-orb ambient-orb-delayed pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/3 rounded-full bg-[#38bdf8]/20 blur-[160px]"
      />
      <div
        aria-hidden
        className="fabric-texture pointer-events-none absolute inset-0 opacity-80"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-7 px-6 py-10 sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.06fr_0.94fr] lg:gap-8 lg:py-14">

        {/* Top rail */}
        <section className="top-rail reveal flex items-center justify-between rounded-full px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-sky-100 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live tracking
            </span>
            <span className="hidden text-slate-600 sm:inline">·</span>
            <span className="hidden sm:inline">Kian x Becca • NYC Visit</span>
          </div>
          <span>April 29 arrival</span>
        </section>

        {/* Left column — description + flight search */}
        <section className="reveal flex flex-col gap-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-500/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-sky-200 shadow-sm">
            ✈ Becca visits Kian
          </div>
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold uppercase tracking-tight text-white sm:text-5xl lg:text-6xl">
              Becca visits Kian in NYC.
            </h1>
            <p className="max-w-lg text-base text-slate-300 sm:text-lg">
              Tracking American Airlines {DEFAULT_FLIGHT_NUMBER} from SFO to JFK
              on April 29, 2026. Live arrival estimates update as the flight
              status changes.
            </p>
          </div>
          <div className="divider-thread" />

          {/* Flight search form */}
          <form
            onSubmit={onSubmit}
            className="soft-panel flex flex-col gap-4 rounded-3xl p-6"
          >
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-200">
                Flight details
              </label>
              {lastRefreshed && (
                <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                  Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_auto]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={DEFAULT_FLIGHT_NUMBER}
                className="h-12 rounded-full border border-slate-700 bg-slate-950/80 px-5 text-base font-medium text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
              <input
                type="date"
                value={dateQuery}
                onChange={(event) => setDateQuery(event.target.value)}
                className="h-12 rounded-full border border-slate-700 bg-slate-950/80 px-5 text-base font-medium text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
              <button
                type="submit"
                disabled={loading}
                className="brand-cta h-12 min-w-[122px] whitespace-nowrap rounded-full bg-sky-500 px-6 text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Tracking…" : "Update"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="rounded-full bg-slate-900/80 px-3 py-1">
                Default: AA166 · Apr 29, 2026
              </span>
              <span className="rounded-full bg-slate-900/80 px-3 py-1">
                Powered by AeroDataBox
              </span>
            </div>
            {error ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </form>

          <div className="lookbook-note reveal-delay-1 rounded-3xl p-6 text-sm text-slate-300">
            <p className="font-semibold text-white">
              Becca&apos;s flight lands at JFK Terminal 8 on April 29, 2026.
            </p>
            <p className="mt-3">
              The drive route updates from JFK American Airlines Terminal 8 to
              30 Riverside Blvd once we have a live arrival estimate.
            </p>
          </div>
        </section>

        {/* Right column — countdown + flight info */}
        <section className="soft-panel stitch-line reveal reveal-delay-1 flex flex-col gap-6 rounded-[32px] p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">
                Arrival clock
              </p>
              <h2 className="font-display text-2xl font-semibold text-white">
                {flight
                  ? `${flight.airline} ${flight.flightNumber}`
                  : "Awaiting flight"}
              </h2>
            </div>
            {flight ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${statusTone}`}
              >
                {isLanded ? "✓ Arrived" : (flight.status || "unknown")}
              </span>
            ) : null}
          </div>

          {/* Flight progress bar */}
          {flightProgressPercent !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
                <span>{flight?.departureIata ?? "SFO"}</span>
                <span className="text-sky-300 tabular-nums">
                  {isLanded ? "Landed" : `${Math.round(flightProgressPercent)}% en route`}
                </span>
                <span>{flight?.arrivalIata ?? "JFK"}</span>
              </div>
              <div className="relative h-2 overflow-visible rounded-full bg-slate-800">
                <div
                  className="progress-bar-fill h-full rounded-full transition-all duration-1000"
                  style={{ width: `${flightProgressPercent}%` }}
                />
                {!isLanded && (
                  <span
                    className="absolute -top-[7px] text-base transition-all duration-1000"
                    style={{
                      left: `clamp(0px, calc(${flightProgressPercent}% - 10px), calc(100% - 20px))`,
                    }}
                  >
                    ✈️
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Countdown tiles */}
          <div className="grid grid-cols-4 gap-3 rounded-3xl border border-slate-800 bg-slate-950/75 px-5 py-6 text-white">
            {countdown && !isLanded ? (
              [
                ["Days", countdown.days],
                ["Hrs", countdown.hours],
                ["Mins", countdown.minutes],
                ["Secs", countdown.seconds],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="count-tile flex flex-col items-center gap-2 rounded-2xl px-2 py-4"
                >
                  <span className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">
                    {formatSlot(value as number)}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                    {label}
                  </span>
                </div>
              ))
            ) : isLanded ? (
              <div className="col-span-4 flex flex-col items-center gap-2 py-4 text-center">
                <span className="text-3xl">🎉</span>
                <span className="text-lg font-semibold text-emerald-300">She&apos;s here!</span>
              </div>
            ) : (
              <div className="col-span-4 text-center text-sm text-slate-300">
                Enter a flight number to start the countdown.
              </div>
            )}
          </div>

          {/* Arrival details */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              {flight && arrivalDate ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-[0.2em] text-sky-200">
                    {flight.arrivalTime !== flight.scheduledArrivalTime ? "Estimated arrival" : "Scheduled arrival"}
                  </span>
                  <span className="text-xl font-semibold text-white tabular-nums">
                    {formatTime(arrivalDate, flight.arrivalTimezone)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {flight.arrivalAirport
                      ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                      : "Arrival airport pending"}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-300">
                  Live arrival time will appear here once we find the flight.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                  Departure
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.departureAirport
                    ? `${flight.departureAirport} (${flight.departureIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                  Arrival airport
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.arrivalAirport
                    ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                  Terminal
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.terminal || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                  Gate
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.gate || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                  Scheduled departure
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {scheduledDepartureDate
                    ? formatTime(scheduledDepartureDate, flight?.departureTimezone)
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                  Scheduled arrival
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {scheduledArrivalDate
                    ? formatTime(scheduledArrivalDate, flight?.arrivalTimezone)
                    : "-"}
                </p>
              </div>
              {flight?.baggage ? (
                <div className="col-span-2 rounded-2xl border border-sky-500/20 bg-sky-500/8 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                    Baggage belt
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    Belt {flight.baggage}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="text-xs text-slate-500">
              {flight?.updatedAt
                ? `Last update: ${new Date(flight.updatedAt).toLocaleString()}`
                : ""}
              {isLanded ? " · Flight has arrived." : ""}
            </div>
          </div>
        </section>

        {/* Drive ETA — full width */}
        <section className="soft-panel stitch-line reveal reveal-delay-2 flex flex-col gap-6 rounded-[32px] p-7 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">
                Drive ETA
              </p>
              <h3 className="font-display text-xl font-semibold text-white sm:text-2xl">
                {routeTitle}
              </h3>
            </div>
            <span className="hidden rounded-full border border-sky-500/35 bg-sky-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200 sm:inline">
              Arrival + 15 min
            </span>
          </div>

          {/* Route config form */}
          <form
            ref={routeFormRef}
            onSubmit={onRouteSubmit}
            className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                  Destination
                </label>
                <input
                  value={destination}
                  onFocus={() => setActivePlaceField("destination")}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setActivePlaceField("destination");
                  }}
                  placeholder={DEFAULT_DESTINATION}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                />
                {activePlaceField === "destination" &&
                (placePredictions.length > 0 || placeLoading) ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-lg">
                    {placeLoading ? (
                      <div className="px-3 py-2 text-xs text-slate-300">
                        Searching places…
                      </div>
                    ) : (
                      placePredictions.map((prediction) => (
                        <button
                          key={prediction.placeId || prediction.description}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyPlacePrediction(prediction);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-100 transition hover:bg-sky-500/10"
                        >
                          {prediction.description}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2 self-end">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                    drive?.origin ?? DEFAULT_ORIGIN_LABEL
                  )}&destination=${encodeURIComponent(destination || DEFAULT_DESTINATION)}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-xs font-semibold uppercase tracking-[0.15em] text-sky-200 transition hover:bg-sky-500/10"
                >
                  Open
                </a>
                <button
                  type="submit"
                  disabled={driveLoading}
                  className="brand-cta h-11 rounded-xl bg-sky-500 px-5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {driveLoading ? "Updating…" : "Update"}
                </button>
              </div>
            </div>

            {/* Optional stops */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200">
                  Optional stops
                </p>
                <button
                  type="button"
                  onClick={addStop}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-200 transition hover:bg-sky-500/10"
                >
                  + Add stop
                </button>
              </div>
              {stops.length ? (
                <div className="space-y-2">
                  {stops.map((stop, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <div className="relative">
                        <input
                          value={stop}
                          onFocus={() => setActivePlaceField(`stop-${index}`)}
                          onChange={(event) => {
                            updateStop(index, event.target.value);
                            setActivePlaceField(`stop-${index}`);
                          }}
                          placeholder={`Stop ${index + 1} address`}
                          className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
                        />
                        {activePlaceField === `stop-${index}` &&
                        (placePredictions.length > 0 || placeLoading) ? (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-lg">
                            {placeLoading ? (
                              <div className="px-3 py-2 text-xs text-slate-300">
                                Searching places…
                              </div>
                            ) : (
                              placePredictions.map((prediction) => (
                                <button
                                  key={prediction.placeId || prediction.description}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    applyPlacePrediction(prediction);
                                  }}
                                  className="block w-full rounded-lg px-3 py-2 text-left text-xs text-slate-100 transition hover:bg-sky-500/10"
                                >
                                  {prediction.description}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStop(index)}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-200 transition hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No stops added. Route goes directly from JFK Terminal 8 to 30 Riverside Blvd.
                </p>
              )}
            </div>
          </form>

          {/* Drive results */}
          {driveLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              Calculating drive ETA…
            </div>
          ) : driveError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {driveError}
            </div>
          ) : drive ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-200">
                  Estimated arrival at 30 Riverside Blvd
                </p>
                <p className="mt-2 text-2xl font-semibold text-white tabular-nums">
                  {formatTime(new Date(drive.arrivalTime), DRIVE_TIMEZONE)}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Total drive time: {drive.totalDurationText}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Includes a {drive.bufferText} post-arrival buffer before
                  departure.
                </p>
              </div>
              <div className="grid gap-3">
                {drive.legs.map((leg, index) => (
                  <div
                    key={`${leg.from}-${index}`}
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200">
                      Leg {index + 1}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {leg.durationText} · {leg.distanceText}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {leg.from} → {leg.to}
                    </p>
                  </div>
                ))}
              </div>

              {/* Google Maps embed */}
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  {process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ? (
                    <iframe
                      title="Drive route map"
                      className="h-80 w-full rounded-xl border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/directions?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY}&origin=${encodeURIComponent(
                        drive.origin
                      )}&destination=${encodeURIComponent(
                        drive.destination
                      )}${
                        drive.stops?.length
                          ? `&waypoints=${encodeURIComponent(drive.stops.join("|"))}`
                          : ""
                      }&mode=driving`}
                    />
                  ) : (
                    <div className="rounded-xl bg-slate-900 px-4 py-6 text-sm text-slate-300">
                      Map preview requires a Google Maps Embed API key.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              Drive ETA will appear once we have a flight arrival time.
            </div>
          )}
        </section>

        {/* Ticker */}
        <section className="soft-panel reveal reveal-delay-3 overflow-hidden rounded-[32px] px-0 py-3 text-xs uppercase tracking-[0.18em] text-sky-200 lg:col-span-2">
          <div className="ticker-track flex gap-10 px-6">
            {TICKER_ITEMS.map((item, i) => (
              <span key={i} className="shrink-0">{item}</span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
