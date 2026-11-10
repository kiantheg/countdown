import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../src/lib/trip.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const tripModule = {};
vm.runInNewContext(compiled, {
  exports: tripModule,
  require: createRequire(sourceUrl),
  TextEncoder,
});
const { flights, trip, getTripPhase, buildTripCalendar } = tripModule;
const syncTime = "2026-11-09T16:30:00.000Z";

function events(calendar) {
  const unfolded = calendar.replace(/\r\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)].map((match) => match[1]);
}

test("the visit has only the confirmed United flight, without guessed terminals", () => {
  assert.equal(flights.length, 1);
  const [flight] = flights;
  assert.equal(flight.number, "UA1227");
  assert.equal(flight.airline, "United Airlines");
  assert.equal(flight.departure.iata, "EWR");
  assert.equal(flight.departure.at, "2026-11-18T13:15:00-05:00");
  assert.equal(flight.arrival.iata, "SFO");
  assert.equal(flight.arrival.at, "2026-11-18T16:33:00-08:00");
  assert.equal(Date.parse(flight.arrival.at) - Date.parse(flight.departure.at), (6 * 60 + 18) * 60_000);
  assert.equal(flight.departure.terminal, undefined);
  assert.equal(flight.arrival.terminal, undefined);
});

test("trip phases include all of November 22 without inventing a return-flight phase", () => {
  const arrival = Date.parse(flights[0].arrival.at);
  const end = Date.parse(trip.endAt);
  assert.equal(getTripPhase(arrival - 1), "upcoming");
  assert.equal(getTripPhase(arrival), "together");
  assert.equal(getTripPhase(Date.parse("2026-11-22T18:00:00-08:00")), "together");
  assert.equal(getTripPhase(end - 1), "together");
  assert.equal(getTripPhase(end), "complete");
  assert.equal(trip.endAt, "2026-11-23T00:00:00-08:00");
  assert.equal(trip.syncEndsAt, "2026-11-24T08:00:00Z");
});

test("calendar marks the visit with an exclusive November 23 end date", () => {
  const [visit] = events(buildTripCalendar([], syncTime));
  assert.match(visit, /DTSTART;VALUE=DATE:20261118\r\n/);
  assert.match(visit, /DTEND;VALUE=DATE:20261123\r\n/);
  assert.match(visit, /SUMMARY:Kian visits Becca · November 18–22\r\n/);
  assert.ok(visit.includes(trip.planUrl));
});

test("calendar converts the confirmed flight to its correct UTC instants", () => {
  const flight = events(buildTripCalendar([], syncTime)).find((event) => event.includes("UA1227"));
  assert.ok(flight);
  assert.match(flight, /DTSTART:20261118T181500Z\r\n/);
  assert.match(flight, /DTEND:20261119T003300Z\r\n/);
  assert.match(flight, /Check United Airlines/);
  assert.doesNotMatch(flight, /Terminal|JetBlue/);
});

test("road travel stays an all-day date marker, and unrelated activities are not exported", () => {
  const calendar = buildTripCalendar([
    { date: "2026-11-19", title: "Thursday", items: [{ title: "An activity with no confirmed time" }] },
    { date: "2026-11-22", title: "Drive to Los Angeles", items: [{ title: "Drive from Palo Alto to Los Angeles" }] },
  ], syncTime);
  const allEvents = events(calendar);
  assert.equal(allEvents.length, 3);
  const road = allEvents.find((event) => event.includes("UID:kian-becca-final-day-"));
  assert.ok(road);
  assert.match(road, /DTSTART;VALUE=DATE:20261122\r\n/);
  assert.match(road, /DTEND;VALUE=DATE:20261123\r\n/);
  assert.doesNotMatch(road, /(?:DTSTART|DTEND):/);
  assert.match(road, /Drive from Palo Alto to Los Angeles/);
  assert.match(road, /All-day date marker/);
  assert.doesNotMatch(calendar, /An activity with no confirmed time|anniversary|B6616|JFK/);
});

test("synced final-day changes replace the calendar title and activity details", () => {
  const calendar = buildTripCalendar([
    {
      date: "2026-11-22",
      title: "Another day in Palo Alto",
      items: [{ time: "Noon", title: "Lunch together", note: "Venue to be confirmed", tentative: true }],
    },
  ], syncTime);
  const finalDay = events(calendar).find((event) => event.includes("UID:kian-becca-final-day-"));
  assert.ok(finalDay);
  assert.match(finalDay, /SUMMARY:Another day in Palo Alto\r\n/);
  assert.match(finalDay, /Noon · Lunch together · Venue to be confirmed · Tentative/);
  assert.match(finalDay, /DTSTART;VALUE=DATE:20261122\r\n/);
  assert.doesNotMatch(finalDay, /(?:DTSTART|DTEND):/);
  assert.doesNotMatch(calendar, /Los Angeles|Road trip|Drive from/);
});

test("clearing final-day activities removes its event without inventing replacement plans", () => {
  assert.equal(events(buildTripCalendar([{ date: "2026-11-22", title: "Open day", items: [] }], syncTime)).length, 2);
  assert.equal(events(buildTripCalendar([], syncTime)).length, 2);
});

test("calendar uses the provided sync timestamp and keeps RFC 5545 line endings and folding", () => {
  const calendar = buildTripCalendar([], syncTime);
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
  assert.equal(calendar.replaceAll("\r\n", "").includes("\n"), false);
  for (const event of events(calendar)) assert.match(event, /DTSTAMP:20261109T163000Z\r\n/);
  for (const line of calendar.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
});
