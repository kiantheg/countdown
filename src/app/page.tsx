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
  waypoint: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  bufferSec: number;
  bufferStops: number;
  bufferText: string;
  totalDurationSec: number;
  totalDurationText: string;
  legs: DriveLeg[];
};

type DriveResponse = {
  route: DriveInfo;
  error?: string;
};

const DEFAULT_FLIGHT_NUMBER = "DL668";
const DRIVE_TIMEZONE = "America/Los_Angeles";

const getNextFeb12 = () => {
  const today = new Date();
  const year = today.getFullYear();
  const candidate = new Date(`${year}-02-12T00:00:00`);
  const nextYear = year + 1;
  return (today > candidate ? nextYear : year).toString() + "-02-12";
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
  const [dateQuery, setDateQuery] = useState(getNextFeb12());
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
    fetchFlight(DEFAULT_FLIGHT_NUMBER, getNextFeb12());
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
    ? "bg-emerald-400/20 text-emerald-200"
    : "bg-amber-400/20 text-amber-200";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    await fetchFlight(trimmed, dateQuery);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#0b0d14] via-[#111a24] to-[#151018] text-[#f2f4f8]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-96 w-96 -translate-x-1/3 -translate-y-1/3 rounded-full bg-[#3fb4ff]/25 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/3 rounded-full bg-[#ff7d55]/20 blur-[160px]"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-14 sm:px-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-20">
        <section className="flex flex-col gap-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#c7d2e5] shadow-sm shadow-black/30">
            Kian visits Stanford
          </div>
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-semibold uppercase tracking-tight text-[#f6f7fb] sm:text-5xl lg:text-6xl">
              Countdown to Stanford.
            </h1>
            <p className="max-w-lg text-base text-[#c0c7d6] sm:text-lg">
              Tracking Delta {DEFAULT_FLIGHT_NUMBER} from JFK to SFO on February
              12 at 7:00 AM ET. Live arrival estimates update as the flight
              status changes.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/40 backdrop-blur"
          >
            <label className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9aa6ba]">
              Flight details
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_0.7fr_auto]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={DEFAULT_FLIGHT_NUMBER}
                className="h-12 rounded-full border border-white/15 bg-[#0f141f] px-5 text-base font-medium text-white outline-none transition focus:border-[#3fb4ff] focus:ring-2 focus:ring-[#3fb4ff]/30"
              />
              <input
                type="date"
                value={dateQuery}
                onChange={(event) => setDateQuery(event.target.value)}
                className="h-12 rounded-full border border-white/15 bg-[#0f141f] px-5 text-base font-medium text-white outline-none transition focus:border-[#3fb4ff] focus:ring-2 focus:ring-[#3fb4ff]/30"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-12 rounded-full bg-[#3fb4ff] px-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#04101c] transition hover:bg-[#64c5ff] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Tracking" : "Update"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#a0a9bb]">
              <span className="rounded-full bg-white/10 px-3 py-1">
                Default: DL0668 on Feb 12
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Powered by AeroDataBox
              </span>
            </div>
            {error ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </form>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-[#b5bccb] shadow-sm shadow-black/40">
            <p className="font-medium text-[#e4e7f0]">
              Kian's trip is set for JFK to SFO, departing at 7:00 AM ET.
            </p>
            <p className="mt-3">
              We will show the best live estimate available until touchdown.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-[32px] border border-white/10 bg-white/5 p-7 shadow-xl shadow-black/50 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9aa6ba]">
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
                {flight.status || "unknown"}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-3 rounded-3xl bg-[#0b0f17] px-5 py-6 text-white">
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
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#8e99ad]">
                    {label}
                  </span>
                </div>
              ))
            ) : (
              <div className="col-span-4 text-center text-sm text-[#8e99ad]">
                Enter a flight number to start the countdown.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#0f141f] px-4 py-3 text-sm text-[#c0c7d6]">
              {flight && arrivalDate ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-[0.2em] text-[#9aa6ba]">
                    Estimated arrival
                  </span>
                  <span className="text-lg font-semibold text-white">
                    {formatTime(arrivalDate, flight.arrivalTimezone)}
                  </span>
                  <span className="text-xs text-[#9aa6ba]">
                    {flight.arrivalAirport
                      ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                      : "Arrival airport pending"}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-[#9aa6ba]">
                  Live arrival time will appear here once we find the flight.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-[#a0a9bb]">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Departure
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.departureAirport
                    ? `${flight.departureAirport} (${flight.departureIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Arrival airport
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.arrivalAirport
                    ? `${flight.arrivalAirport} (${flight.arrivalIata ?? ""})`
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Arrival terminal
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.terminal || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Arrival gate
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {flight?.gate || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Scheduled departure
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {scheduledDepartureDate
                    ? formatTime(
                        scheduledDepartureDate,
                        flight?.departureTimezone
                      )
                    : "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Scheduled arrival
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {scheduledArrivalDate
                    ? formatTime(
                        scheduledArrivalDate,
                        flight?.arrivalTimezone
                      )
                    : "-"}
                </p>
              </div>
            </div>

            <div className="text-xs text-[#9aa6ba]">
              {flight?.updatedAt
                ? `Last update: ${new Date(flight.updatedAt).toLocaleString()}`
                : ""}
              {isLanded ? " Flight has arrived." : ""}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-[32px] border border-white/10 bg-white/5 p-7 shadow-xl shadow-black/50 backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9aa6ba]">
                Drive ETA
              </p>
              <h3 className="font-display text-2xl font-semibold text-white">
                SFO → Hayward → Stanford
              </h3>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c7d2e5]">
              Arrival + 15 min
            </span>
          </div>

          {driveLoading ? (
            <div className="rounded-2xl border border-white/10 bg-[#0f141f] px-4 py-3 text-sm text-[#9aa6ba]">
              Calculating drive ETA...
            </div>
          ) : driveError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {driveError}
            </div>
          ) : drive ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-white/10 bg-[#0f141f] px-4 py-4 text-sm text-[#c0c7d6]">
                <p className="text-xs uppercase tracking-[0.2em] text-[#9aa6ba]">
                  Estimated arrival at Stanford
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatTime(new Date(drive.arrivalTime), DRIVE_TIMEZONE)}
                </p>
                <p className="mt-2 text-xs text-[#9aa6ba]">
                  Total drive time: {drive.totalDurationText}
                </p>
                <p className="mt-1 text-xs text-[#9aa6ba]">
                  Includes {drive.bufferText} buffer for the Hayward stop.
                </p>
              </div>
              <div className="grid gap-3">
                {drive.legs.map((leg, index) => (
                  <div
                    key={`${leg.from}-${index}`}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-[#a0a9bb]"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#9aa6ba]">
                      Leg {index + 1}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {leg.durationText} · {leg.distanceText}
                    </p>
                    <p className="mt-1 text-xs text-[#9aa6ba]">
                      {leg.from} → {leg.to}
                    </p>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-white/10 bg-[#0f141f] p-3">
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
                      )}&waypoints=${encodeURIComponent(
                        drive.waypoint
                      )}&mode=driving`}
                    />
                  ) : (
                    <div className="rounded-xl bg-white/5 px-4 py-6 text-sm text-[#9aa6ba]">
                      Map preview requires a Google Maps Embed API key.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0f141f] px-4 py-3 text-sm text-[#9aa6ba]">
              Drive ETA will appear once we have a flight arrival time.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
