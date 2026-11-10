import itinerarySnapshot from "../data/itinerary.json";

export type FlightEndpoint = {
  iata: string;
  city: string;
  timeZone: string;
  terminal?: string;
  /** Scheduled airport-local time with an explicit UTC offset. */
  at: string;
};

export type FlightLeg = {
  id: "outbound";
  number: string;
  airline: string;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
};

export type ItineraryItem = {
  time?: string;
  title: string;
  note?: string;
  tentative?: boolean;
};

export type ItineraryDay = {
  date: string;
  title: string;
  stay?: string;
  items: ItineraryItem[];
  highlight?: "halloween" | "anniversary";
};

export type TripPhase = "upcoming" | "together" | "complete";

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export const trip = {
  title: "Kian visits Becca",
  startDate: "2026-11-18",
  endDate: "2026-11-22",
  timeZone: "America/Los_Angeles",
  /** The visit includes November 22; this boundary is not a road departure time. */
  endAt: "2026-11-23T00:00:00-08:00",
  syncEndsAt: "2026-11-24T08:00:00Z",
  planUrl:
    "https://docs.google.com/document/d/1QuB-3gcjSuSW8YGQPvlaKeoCN9thNYuRc_PbX7O2I1I/edit?usp=drivesdk",
} as const;

// Scheduled times verified against the United eTicket receipt dated October 5, 2026.
// This visit has one confirmed flight; the November 22 departure is by road.
export const flights: FlightLeg[] = [
  {
    id: "outbound",
    number: "UA1227",
    airline: "United Airlines",
    departure: {
      iata: "EWR",
      city: "Newark",
      timeZone: "America/New_York",
      at: "2026-11-18T13:15:00-05:00",
    },
    arrival: {
      iata: "SFO",
      city: "San Francisco",
      timeZone: "America/Los_Angeles",
      at: "2026-11-18T16:33:00-08:00",
    },
  },
];

// The snapshot is validated before every build; its source document stays private.
export const itinerary: ItineraryDay[] = itinerarySnapshot.days as ItineraryDay[];
export const planSync = {
  sourceModifiedAt: itinerarySnapshot.sourceModifiedAt,
  syncedAt: itinerarySnapshot.syncedAt,
} as const;

export function getTripPhase(nowMs: number): TripPhase {
  if (nowMs < Date.parse(flights[0].arrival.at)) return "upcoming";
  if (nowMs < Date.parse(trip.endAt)) return "together";
  return "complete";
}

/** Split a duration into whole units, with hours/minutes/seconds as remainders. */
export function formatCountdown(ms: number): Countdown {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1_000)) : 0;
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function calendarUtc(at: string): string {
  return new Date(at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Fold at 75 UTF-8 octets without splitting a Unicode code point (RFC 5545). */
function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  let output = "";
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) {
      output += "\r\n ";
      octets = 1;
    }
    output += character;
    octets += size;
  }
  return output;
}

/** Export confirmed flights and grounded all-day plans, without inventing activity times. */
export function buildTripCalendar(days: ItineraryDay[] = itinerary, syncedAt = planSync.syncedAt): string {
  const stamp = `DTSTAMP:${calendarUtc(syncedAt)}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kian and Becca//Visit Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:kian-becca-visit-20261118@countdown.local",
    stamp,
    "DTSTART;VALUE=DATE:20261118",
    "DTEND;VALUE=DATE:20261123",
    `SUMMARY:${escapeCalendarText("Kian visits Becca · November 18–22")}`,
    `DESCRIPTION:${escapeCalendarText("Visit November 18–22. Activities and onward travel follow the shared plan; see it for current details and timing.\n" + trip.planUrl)}`,
    "END:VEVENT",
  ];

  for (const flight of flights) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:kian-becca-${flight.id}-20261118@countdown.local`,
      stamp,
      `DTSTART:${calendarUtc(flight.departure.at)}`,
      `DTEND:${calendarUtc(flight.arrival.at)}`,
      `SUMMARY:${escapeCalendarText(`${flight.airline} ${flight.number} · ${flight.departure.iata} → ${flight.arrival.iata}`)}`,
      `LOCATION:${escapeCalendarText(`${flight.departure.city} (${flight.departure.iata})${flight.departure.terminal ? ` · Terminal ${flight.departure.terminal}` : ""}`)}`,
      `DESCRIPTION:${escapeCalendarText(`Scheduled flight from ${flight.departure.city} to ${flight.arrival.city}. Check ${flight.airline} for current flight status and terminal updates.`)}`,
      "END:VEVENT",
    );
  }

  const finalDay = days.find((day) => day.date === trip.endDate);
  if (finalDay?.items.length) {
    const finalDayDescription = finalDay.items
      .map((item) => [item.time, item.title, item.note, item.tentative ? "Tentative" : null].filter(Boolean).join(" · "))
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      "UID:kian-becca-final-day-20261122@countdown.local",
      stamp,
      "DTSTART;VALUE=DATE:20261122",
      "DTEND;VALUE=DATE:20261123",
      `SUMMARY:${escapeCalendarText(finalDay.title)}`,
      `DESCRIPTION:${escapeCalendarText(`${finalDayDescription}\nAll-day date marker; see the shared plan for timing.\n${trip.planUrl}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}
