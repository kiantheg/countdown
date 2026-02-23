"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
const DEFAULT_DESTINATION = "30 Riverside Blvd, New York, NY 10069";
const DRIVE_TIMEZONE = "America/New_York";

const getNextMarch5 = () => {
  const today = new Date();
  const year = today.getFullYear();
  const candidate = new Date(`${year}-03-05T00:00:00`);
  const nextYear = year + 1;
  return (today > candidate ? nextYear : year).toString() + "-03-05";
};

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

export default function Home() {
  const [query, setQuery] = useState(DEFAULT_FLIGHT_NUMBER);
  const [dateQuery, setDateQuery] = useState(getNextMarch5());
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
  const routeFormRef = useRef<HTMLFormElement | null>(null);

  const fetchFlight = async (number: string, date: string) => {
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
    } catch (err) {
      setFlight(null);
      setError("Network error while loading flight status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlight(DEFAULT_FLIGHT_NUMBER, getNextMarch5());
  }, []);

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

  const driveStartTime = flight?.arrivalTime ?? flight?.scheduledArrivalTime;

  const fetchDrive = async () => {
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
    } catch (err) {
      setDrive(null);
      setDriveError("Network error while loading drive ETA.");
    } finally {
      setDriveLoading(false);
    }
  };

  useEffect(() => {
    fetchDrive();
  }, [driveStartTime, flight?.terminal]);

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
    ? "bg-emerald-100 text-emerald-800"
    : "bg-amber-100 text-amber-800";

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

  return (
    <div className="brand-shell relative min-h-screen overflow-hidden text-[#3b2e28]">
      <div
        aria-hidden
        className="ambient-orb pointer-events-none absolute left-0 top-0 h-96 w-96 -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#ffd7c9]/60 blur-[140px]"
      />
      <div
        aria-hidden
        className="ambient-orb ambient-orb-delayed pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/3 rounded-full bg-[#c8e8ff]/55 blur-[160px]"
      />
      <div
        aria-hidden
        className="fabric-texture pointer-events-none absolute inset-0 opacity-80"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-7 px-6 py-10 sm:px-10 sm:py-12 lg:grid lg:grid-cols-[1.06fr_0.94fr] lg:gap-8 lg:py-14">
        <section className="top-rail reveal flex items-center justify-between rounded-full px-5 py-3 text-[11px] uppercase tracking-[0.24em] text-[#6c4f58] lg:col-span-2">
          <span>Becca x Kian • NYC Visit</span>
          <span>Spring Arrival Edit</span>
        </section>
        <section className="reveal flex flex-col gap-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#ddbea8] bg-[#fff0e2] px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#7a4f3f] shadow-sm">
            Becca visits NYC
          </div>
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold uppercase tracking-tight text-[#4b3529] sm:text-5xl lg:text-6xl">
              Countdown to New York.
            </h1>
            <p className="max-w-lg text-base text-[#6a5146] sm:text-lg">
              Tracking American Airlines {DEFAULT_FLIGHT_NUMBER} from SFO to JFK
              on March 5. Live arrival estimates update as the flight status
              changes.
            </p>
          </div>
          <div className="divider-thread" />

          <form
            onSubmit={onSubmit}
            className="soft-panel flex flex-col gap-4 rounded-3xl p-6"
          >
            <label className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7f5a4a]">
              Flight details
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_auto]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={DEFAULT_FLIGHT_NUMBER}
                className="h-12 rounded-full border border-[#d7bda8] bg-[#fff9f3] px-5 text-base font-medium text-[#543d31] outline-none transition focus:border-[#c98163] focus:ring-2 focus:ring-[#edc8b5]"
              />
              <input
                type="date"
                value={dateQuery}
                onChange={(event) => setDateQuery(event.target.value)}
                className="h-12 rounded-full border border-[#d7bda8] bg-[#fff9f3] px-5 text-base font-medium text-[#543d31] outline-none transition focus:border-[#c98163] focus:ring-2 focus:ring-[#edc8b5]"
              />
              <button
                type="submit"
                disabled={loading}
                className="brand-cta h-12 min-w-[122px] whitespace-nowrap rounded-full bg-[#e5a989] px-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#4d3428] transition hover:bg-[#db9a78] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Tracking" : "Update"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#73584b]">
              <span className="rounded-full bg-[#f4dfd0] px-3 py-1">
                Default: AA166 on Mar 5
              </span>
              <span className="rounded-full bg-[#efe2d3] px-3 py-1">
                Powered by AeroDataBox
              </span>
            </div>
            {error ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </form>

          <div className="lookbook-note reveal-delay-1 rounded-3xl p-6 text-sm text-[#6f5649]">
            <p className="font-medium text-[#4f382d]">
              Becca's trip is set for SFO to JFK on March 5.
            </p>
            <p className="mt-3">
              We will show the best live estimate available until touchdown.
            </p>
          </div>
        </section>

        <section className="soft-panel stitch-line reveal reveal-delay-1 flex flex-col gap-6 rounded-[32px] p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7f5a4a]">
                Arrival clock
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#4f382d]">
                {flight
                  ? `${flight.airline} ${flight.flightNumber}`
                  : "Awaiting flight"}
              </h2>
            </div>
            {flight ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${statusTone}`}
              >
                {flight.status || "unknown"}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-3 rounded-3xl border border-[#e3c7b2] bg-[#fff1e5] px-5 py-6 text-[#4f382d]">
            {countdown ? (
              [
                ["Days", countdown.days],
                ["Hours", countdown.hours],
                ["Mins", countdown.minutes],
                ["Secs", countdown.seconds],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="count-tile flex flex-col items-center gap-2 rounded-2xl px-2 py-4"
                >
                  <span className="font-display text-2xl sm:text-3xl">
                    {formatSlot(value as number)}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                    {label}
                  </span>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-center text-sm text-[#7f5a4a]">
                Enter a flight number to start the countdown.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[#d7bda8] bg-[#fff8f1] px-4 py-3 text-sm text-[#6f5649]">
              {flight && arrivalDate ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#7f5a4a]">
                    Estimated arrival
                  </span>
                  <span className="text-lg font-semibold text-[#4f382d]">
                    {formatTime(arrivalDate, flight.arrivalTimezone)}
                  </span>
                  <span className="text-xs text-[#7f5a4a]">
                    {flight.arrivalAirport
                      ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                      : "Arrival airport pending"}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-[#7f5a4a]">
                  Live arrival time will appear here once we find the flight.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-[#73584b]">
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Departure
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                  {flight?.departureAirport
                    ? `${flight.departureAirport} (${flight.departureIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Arrival airport
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                  {flight?.arrivalAirport
                    ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Arrival terminal
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                  {flight?.terminal || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Arrival gate
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                  {flight?.gate || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Scheduled departure
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                  {scheduledDepartureDate
                    ? formatTime(
                        scheduledDepartureDate,
                        flight?.departureTimezone
                      )
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Scheduled arrival
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                  {scheduledArrivalDate
                    ? formatTime(
                        scheduledArrivalDate,
                        flight?.arrivalTimezone
                      )
                    : "-"}
                </p>
              </div>
            </div>

            <div className="text-xs text-[#7f5a4a]">
              {flight?.updatedAt
                ? `Last update: ${new Date(flight.updatedAt).toLocaleString()}`
                : ""}
              {isLanded ? " Flight has arrived." : ""}
            </div>
          </div>
        </section>

        <section className="soft-panel stitch-line reveal reveal-delay-2 flex flex-col gap-6 rounded-[32px] p-7 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7f5a4a]">
                Drive ETA
              </p>
              <h3 className="font-display text-2xl font-semibold text-[#4f382d]">
                JFK Terminal 8 → 30 Riverside Blvd
              </h3>
            </div>
            <span className="rounded-full border border-[#ddbea8] bg-[#fff0e2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#7a4f3f]">
              Arrival + 15 min
            </span>
          </div>
          <form
            ref={routeFormRef}
            onSubmit={onRouteSubmit}
            className="rounded-2xl border border-[#d7bda8] bg-[#fff8f1] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7f5a4a]">
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
                  className="mt-2 h-11 w-full rounded-xl border border-[#d7bda8] bg-[#fffdf9] px-4 text-sm font-medium text-[#543d31] outline-none transition focus:border-[#c98163] focus:ring-2 focus:ring-[#edc8b5]"
                />
                {activePlaceField === "destination" &&
                (placePredictions.length > 0 || placeLoading) ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[#d7bda8] bg-[#fffdf9] p-1 shadow-lg">
                    {placeLoading ? (
                      <div className="px-3 py-2 text-xs text-[#7f5a4a]">
                        Searching places...
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
                          className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[#543d31] transition hover:bg-[#fdf0e6]"
                        >
                          {prediction.description}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <button
                type="submit"
                disabled={driveLoading}
                className="brand-cta h-11 self-end rounded-xl bg-[#e5a989] px-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#4d3428] transition hover:bg-[#db9a78] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {driveLoading ? "Updating" : "Update route"}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Optional stops
                </p>
                <button
                  type="button"
                  onClick={addStop}
                  className="rounded-lg border border-[#d7bda8] bg-[#fff1e5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7a4f3f] transition hover:bg-[#fde7d8]"
                >
                  Add stop
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
                        className="h-10 w-full rounded-xl border border-[#d7bda8] bg-[#fffdf9] px-4 text-sm text-[#543d31] outline-none transition focus:border-[#c98163] focus:ring-2 focus:ring-[#edc8b5]"
                      />
                      {activePlaceField === `stop-${index}` &&
                      (placePredictions.length > 0 || placeLoading) ? (
                        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[#d7bda8] bg-[#fffdf9] p-1 shadow-lg">
                          {placeLoading ? (
                            <div className="px-3 py-2 text-xs text-[#7f5a4a]">
                              Searching places...
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
                                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-[#543d31] transition hover:bg-[#fdf0e6]"
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
                        className="rounded-xl border border-[#d7bda8] bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7a4f3f] transition hover:bg-[#fdf0e6]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#7f5a4a]">
                  No stops added. Route goes directly from JFK Terminal 8 to 30
                  Riverside Blvd.
                </p>
              )}
            </div>
          </form>

          {driveLoading ? (
            <div className="rounded-2xl border border-[#d7bda8] bg-[#fff8f1] px-4 py-3 text-sm text-[#7f5a4a]">
              Calculating drive ETA...
            </div>
          ) : driveError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {driveError}
            </div>
          ) : drive ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[#d7bda8] bg-[#fff8f1] px-4 py-4 text-sm text-[#6f5649]">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7f5a4a]">
                  Estimated arrival in Manhattan
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#4f382d]">
                  {formatTime(new Date(drive.arrivalTime), DRIVE_TIMEZONE)}
                </p>
                <p className="mt-2 text-xs text-[#7f5a4a]">
                  Total drive time: {drive.totalDurationText}
                </p>
                <p className="mt-1 text-xs text-[#7f5a4a]">
                  Includes a {drive.bufferText} post-arrival buffer before
                  departure.
                </p>
              </div>
              <div className="grid gap-3">
                {drive.legs.map((leg, index) => (
                  <div
                    key={`${leg.from}-${index}`}
                    className="rounded-2xl border border-[#d7bda8] bg-[#fffaf5]/95 px-4 py-3 text-xs text-[#73584b]"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#7f5a4a]">
                      Leg {index + 1}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#4f382d]">
                      {leg.durationText} · {leg.distanceText}
                    </p>
                    <p className="mt-1 text-xs text-[#7f5a4a]">
                      {leg.from} → {leg.to}
                    </p>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-[#d7bda8] bg-[#fff8f1] p-3">
                  {process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ? (
                    <iframe
                      title="Drive route map"
                      className="h-72 w-full rounded-xl border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/directions?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY}&origin=${encodeURIComponent(
                        drive.origin
                      )}&destination=${encodeURIComponent(
                        drive.destination
                      )}${
                        drive.stops?.length
                          ? `&waypoints=${encodeURIComponent(
                              drive.stops.join("|")
                            )}`
                          : ""
                      }&mode=driving`}
                    />
                  ) : (
                    <div className="rounded-xl bg-[#fffaf5]/95 px-4 py-6 text-sm text-[#7f5a4a]">
                      Map preview requires a Google Maps Embed API key.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#d7bda8] bg-[#fff8f1] px-4 py-3 text-sm text-[#7f5a4a]">
              Drive ETA will appear once we have a flight arrival time.
            </div>
          )}
        </section>
        <section className="soft-panel reveal reveal-delay-3 overflow-hidden rounded-[32px] px-0 py-3 text-xs uppercase tracking-[0.18em] text-[#7f5a4a] lg:col-span-2">
          <div className="ticker flex gap-10 px-6">
            <span>New York arrival countdown</span>
            <span>American Airlines AA166</span>
            <span>JFK Terminal 8 to 30 Riverside Blvd</span>
            <span>Soft timing buffer plus live ETA</span>
            <span>New York arrival countdown</span>
            <span>American Airlines AA166</span>
            <span>JFK Terminal 8 to 30 Riverside Blvd</span>
          </div>
        </section>
      </main>
    </div>
  );
}
