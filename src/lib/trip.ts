export type FlightEndpoint = {
  iata: string;
  city: string;
  timeZone: string;
  terminal?: string;
  /** Scheduled airport-local time with an explicit UTC offset. */
  at: string;
};

export type FlightLeg = {
  id: "outbound" | "return";
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

export type TripPhase = "upcoming" | "together" | "homeward" | "complete";

export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export const trip = {
  title: "Kian visits Becca",
  startDate: "2026-10-28",
  endDate: "2026-11-03",
  timeZone: "America/Los_Angeles",
  planUrl:
    "https://docs.google.com/document/d/1A24kcHDnDTgx_MNiKILdOdaSXqjE1Fgh0CGSzO0oZ-Q/edit?usp=drivesdk",
  planUpdated: "2026-10-12",
} as const;

// Scheduled times verified against the JetBlue itinerary. UTC offsets change
// between the outbound and return journeys when daylight saving time ends.
export const flights: FlightLeg[] = [
  {
    id: "outbound",
    number: "B6515",
    airline: "JetBlue",
    departure: {
      iata: "JFK",
      city: "New York",
      timeZone: "America/New_York",
      terminal: "5",
      at: "2026-10-28T20:15:00-04:00",
    },
    arrival: {
      iata: "SFO",
      city: "San Francisco",
      timeZone: "America/Los_Angeles",
      terminal: "1",
      at: "2026-10-28T23:58:00-07:00",
    },
  },
  {
    id: "return",
    number: "B6616",
    airline: "JetBlue",
    departure: {
      iata: "SFO",
      city: "San Francisco",
      timeZone: "America/Los_Angeles",
      terminal: "1",
      at: "2026-11-03T22:56:00-08:00",
    },
    arrival: {
      iata: "JFK",
      city: "New York",
      timeZone: "America/New_York",
      at: "2026-11-04T07:24:00-05:00",
    },
  },
];

// The shared plan is tentative; question marks and undecided alternatives are
// additionally flagged so the interface can distinguish them at a glance.
export const itinerary: ItineraryDay[] = [
  {
    date: "2026-10-28",
    title: "Arrival in San Francisco",
    stay: "KKG",
    items: [
      {
        time: "8:15 PM ET → 11:58 PM PT",
        title: "New York → San Francisco",
        note: "JetBlue B6515 · JFK to SFO",
      },
    ],
  },
  {
    date: "2026-10-29",
    title: "Settling in & Senior Night",
    stay: "KKG",
    items: [
      {
        time: "After arrival",
        title: "In-N-Out",
        note: "The plan says midnight; timing is flexible after the 11:58 PM landing and airport transfer.",
        tentative: true,
      },
      { time: "10:30–11:50 AM", title: "Becca has class" },
      { title: "Double date?", tentative: true },
      { time: "10:00 PM", title: "Senior Night!" },
    ],
  },
  {
    date: "2026-10-30",
    title: "Pastries & Halloween plans",
    stay: "KKG",
    items: [
      { title: "Arisicault" },
      { time: "1:30–3:20 PM", title: "Go to class with Becca" },
      {
        title: "SNu Halloween party or SF bar crawl",
        note: "Both options are TBD in the shared plan.",
        tentative: true,
      },
    ],
  },
  {
    date: "2026-10-31",
    title: "Halloween",
    stay: "The Huntington Hotel",
    highlight: "halloween",
    items: [],
  },
  {
    date: "2026-11-01",
    title: "One-year anniversary",
    stay: "KKG",
    highlight: "anniversary",
    items: [
      {
        title: "Anniversary dinner",
        note: "Becca is planning dinner; time and location to be confirmed.",
        tentative: true,
      },
    ],
  },
  {
    date: "2026-11-02",
    title: "Monday on campus",
    stay: "KKG",
    items: [
      { time: "11:30 AM–12:50 PM", title: "Go to class with Becca" },
      { time: "2:15–3:45 PM", title: "Go to class with Becca" },
      { time: "4:30–6:00 PM", title: "Becca has a meeting" },
    ],
  },
  {
    date: "2026-11-03",
    title: "Return to New York",
    items: [
      {
        time: "10:56 PM PT → 7:24 AM ET (+1 day)",
        title: "San Francisco → New York",
        note: "JetBlue B6616 · Arrives Wednesday, November 4",
      },
    ],
  },
];

export function getTripPhase(nowMs: number): TripPhase {
  if (nowMs < Date.parse(flights[0].arrival.at)) return "upcoming";
  if (nowMs < Date.parse(flights[1].departure.at)) return "together";
  if (nowMs < Date.parse(flights[1].arrival.at)) return "homeward";
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

/** A deterministic calendar export containing only grounded dates and flights. */
export function buildTripCalendar(): string {
  const stamp = "DTSTAMP:20261012T000000Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kian and Becca//Visit Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:kian-becca-visit-20261028@countdown.local",
    stamp,
    "DTSTART;VALUE=DATE:20261028",
    "DTEND;VALUE=DATE:20261104",
    `SUMMARY:${escapeCalendarText("Kian visits Becca · October 28–November 3")}`,
    `DESCRIPTION:${escapeCalendarText("Activities are tentative; see the shared plan for updates. Return flight arrives in New York on November 4.\n" + trip.planUrl)}`,
    "END:VEVENT",
  ];

  for (const flight of flights) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:kian-becca-${flight.id}-20261028@countdown.local`,
      stamp,
      `DTSTART:${calendarUtc(flight.departure.at)}`,
      `DTEND:${calendarUtc(flight.arrival.at)}`,
      `SUMMARY:${escapeCalendarText(`${flight.airline} ${flight.number} · ${flight.departure.iata} → ${flight.arrival.iata}`)}`,
      `LOCATION:${escapeCalendarText(`${flight.departure.city} (${flight.departure.iata})${flight.departure.terminal ? ` · Terminal ${flight.departure.terminal}` : ""}`)}`,
      `DESCRIPTION:${escapeCalendarText(`Scheduled flight from ${flight.departure.city} to ${flight.arrival.city}. Check JetBlue for current flight status and terminal updates.`)}`,
      "END:VEVENT",
    );
  }

  lines.push(
    "BEGIN:VEVENT",
    "UID:kian-becca-anniversary-20261101@countdown.local",
    stamp,
    "DTSTART;VALUE=DATE:20261101",
    "DTEND;VALUE=DATE:20261102",
    `SUMMARY:${escapeCalendarText("Kian & Becca · One-year anniversary")}`,
    `DESCRIPTION:${escapeCalendarText("Becca is planning dinner. Time and place are still to come.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.map(foldCalendarLine).join("\r\n") + "\r\n";
}
