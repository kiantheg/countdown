"use client";

import { useEffect, useMemo, useState } from "react";

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

const DEFAULT_FLIGHT_NUMBER = "AA166";
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

  useEffect(() => {
    if (!driveStartTime) {
      setDrive(null);
      setDriveError(null);
      return;
    }

    const fetchDrive = async () => {
      setDriveLoading(true);
      setDriveError(null);

      try {
        const params = new URLSearchParams({
          arrivalTime: driveStartTime,
        });
        if (flight?.terminal) {
          params.set("arrivalTerminal", flight.terminal);
        }
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

    fetchDrive();
  }, [driveStartTime, flight?.terminal]);

  const status = (flight?.status ?? "").toLowerCase();
  const isLandedStatus = status === "landed" || status === "arrived";
  const remainingMs = arrivalDate ? arrivalDate.getTime() - now : null;
  const isLanded = isLandedStatus || (remainingMs !== null && remainingMs <= 0);
  const countdown = remainingMs !== null ? formatCountdown(remainingMs) : null;

  const statusTone = isLanded
    ? "bg-emerald-200 text-emerald-800"
    : "bg-amber-200 text-amber-800";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await fetchFlight(trimmed, dateQuery);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#fff5ee] via-[#fffdfa] to-[#eef7ff] text-[#2f2430]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-96 w-96 -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#ffd7c9]/60 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/3 rounded-full bg-[#c8e8ff]/55 blur-[160px]"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-14 sm:px-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-20">
        <section className="flex flex-col gap-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e6cab8] bg-[#ffeade] px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#7f4f56] shadow-sm">
            Becca visits NYC
          </div>
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold uppercase tracking-tight text-[#4b3642] sm:text-5xl lg:text-6xl">
              Countdown to New York.
            </h1>
            <p className="max-w-lg text-base text-[#5f5160] sm:text-lg">
              Tracking American Airlines {DEFAULT_FLIGHT_NUMBER} from SFO to JFK
              on March 5. Live arrival estimates update as the flight status
              changes.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4 rounded-3xl border border-[#dcc6b8] bg-white/95 p-6 shadow-sm backdrop-blur"
          >
            <label className="text-sm font-semibold uppercase tracking-[0.2em] text-[#7a6577]">
              Flight details
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_0.7fr_auto]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={DEFAULT_FLIGHT_NUMBER}
                className="h-12 rounded-full border border-[#dcc6b8] bg-[#fff8f2] px-5 text-base font-medium text-[#4f3a46] outline-none transition focus:border-[#d98973] focus:ring-2 focus:ring-[#f2c4b4]"
              />
              <input
                type="date"
                value={dateQuery}
                onChange={(event) => setDateQuery(event.target.value)}
                className="h-12 rounded-full border border-[#dcc6b8] bg-[#fff8f2] px-5 text-base font-medium text-[#4f3a46] outline-none transition focus:border-[#d98973] focus:ring-2 focus:ring-[#f2c4b4]"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-12 rounded-full bg-[#f8b9a3] px-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#5d3d46] transition hover:bg-[#f5a98f] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Tracking" : "Update"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#6f6270]">
              <span className="rounded-full bg-[#f8e6dd] px-3 py-1">
                Default: AA166 on Mar 5
              </span>
              <span className="rounded-full bg-[#e2f1ff] px-3 py-1">
                Powered by AeroDataBox
              </span>
            </div>
            {error ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </form>

          <div className="rounded-3xl border border-[#dcc6b8] bg-white/92 p-6 text-sm text-[#665b69] shadow-sm">
            <p className="font-medium text-[#4f3a46]">
              Becca's trip is set for SFO to JFK on March 5.
            </p>
            <p className="mt-3">
              We will show the best live estimate available until touchdown.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-[32px] border border-[#dcc6b8] bg-white/95 p-7 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7a6577]">
                Arrival clock
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#4f3a46]">
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

          <div className="grid grid-cols-4 gap-3 rounded-3xl border border-[#ebd2c4] bg-[#fff2e9] px-5 py-6 text-[#4f3a46]">
            {countdown ? (
              [
                ["Days", countdown.days],
                ["Hours", countdown.hours],
                ["Mins", countdown.minutes],
                ["Secs", countdown.seconds],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="font-display text-2xl sm:text-3xl">
                    {formatSlot(value as number)}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                    {label}
                  </span>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-center text-sm text-[#7a6577]">
                Enter a flight number to start the countdown.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[#dcc6b8] bg-[#fff8f2] px-4 py-3 text-sm text-[#665b69]">
              {flight && arrivalDate ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#7a6577]">
                    Estimated arrival
                  </span>
                  <span className="text-lg font-semibold text-[#4f3a46]">
                    {formatTime(arrivalDate, flight.arrivalTimezone)}
                  </span>
                  <span className="text-xs text-[#7a6577]">
                    {flight.arrivalAirport
                      ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                      : "Arrival airport pending"}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-[#7a6577]">
                  Live arrival time will appear here once we find the flight.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-[#6f6270]">
              <div className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                  Departure
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                  {flight?.departureAirport
                    ? `${flight.departureAirport} (${flight.departureIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                  Arrival airport
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                  {flight?.arrivalAirport
                    ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                  Arrival terminal
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                  {flight?.terminal || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                  Arrival gate
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                  {flight?.gate || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                  Scheduled departure
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                  {scheduledDepartureDate
                    ? formatTime(
                        scheduledDepartureDate,
                        flight?.departureTimezone
                      )
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                  Scheduled arrival
                </p>
                <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                  {scheduledArrivalDate
                    ? formatTime(
                        scheduledArrivalDate,
                        flight?.arrivalTimezone
                      )
                    : "-"}
                </p>
              </div>
            </div>

            <div className="text-xs text-[#7a6577]">
              {flight?.updatedAt
                ? `Last update: ${new Date(flight.updatedAt).toLocaleString()}`
                : ""}
              {isLanded ? " Flight has arrived." : ""}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-[32px] border border-[#dcc6b8] bg-white/95 p-7 shadow-sm backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#7a6577]">
                Drive ETA
              </p>
              <h3 className="font-display text-2xl font-semibold text-[#4f3a46]">
                JFK Terminal 8 → 30 Riverside Blvd
              </h3>
            </div>
            <span className="rounded-full border border-[#e6cab8] bg-[#ffeade] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#7f4f56]">
              Arrival + 15 min
            </span>
          </div>

          {driveLoading ? (
            <div className="rounded-2xl border border-[#dcc6b8] bg-[#fff8f2] px-4 py-3 text-sm text-[#7a6577]">
              Calculating drive ETA...
            </div>
          ) : driveError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {driveError}
            </div>
          ) : drive ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-[#dcc6b8] bg-[#fff8f2] px-4 py-4 text-sm text-[#665b69]">
                <p className="text-xs uppercase tracking-[0.2em] text-[#7a6577]">
                  Estimated arrival in Manhattan
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#4f3a46]">
                  {formatTime(new Date(drive.arrivalTime), DRIVE_TIMEZONE)}
                </p>
                <p className="mt-2 text-xs text-[#7a6577]">
                  Total drive time: {drive.totalDurationText}
                </p>
                <p className="mt-1 text-xs text-[#7a6577]">
                  Includes a {drive.bufferText} post-arrival buffer before
                  departure.
                </p>
              </div>
              <div className="grid gap-3">
                {drive.legs.map((leg, index) => (
                  <div
                    key={`${leg.from}-${index}`}
                    className="rounded-2xl border border-[#dcc6b8] bg-white/92 px-4 py-3 text-xs text-[#6f6270]"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#7a6577]">
                      Leg {index + 1}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#4f3a46]">
                      {leg.durationText} · {leg.distanceText}
                    </p>
                    <p className="mt-1 text-xs text-[#7a6577]">
                      {leg.from} → {leg.to}
                    </p>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-[#dcc6b8] bg-[#fff8f2] p-3">
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
                      )}&mode=driving`}
                    />
                  ) : (
                    <div className="rounded-xl bg-white/92 px-4 py-6 text-sm text-[#7a6577]">
                      Map preview requires a Google Maps Embed API key.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#dcc6b8] bg-[#fff8f2] px-4 py-3 text-sm text-[#7a6577]">
              Drive ETA will appear once we have a flight arrival time.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
