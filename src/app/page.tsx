"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { buildTripCalendar, flights, formatCountdown, getTripPhase, itinerary, trip, type FlightLeg } from "../lib/trip";
import RoutePlanner from "../components/RoutePlanner";
import { useSyncedPlan } from "../lib/useSyncedPlan";

type LiveFlight = {
  status: string;
  arrivalTime: string | null;
  gate: string | null;
  terminal: string | null;
  baggage: string | null;
};

function Icon({ name, size = 20 }: { name: "plane" | "arrow" | "calendar" | "check" | "external" | "refresh"; size?: number }) {
  const paths = {
    plane: <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    external: <><path d="M15 3h6v6m0-6-9 9" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function localTime(at: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(at));
}
function shortDate(at: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(at));
}
function duration(flight: FlightLeg) {
  const minutes = (Date.parse(flight.arrival.at) - Date.parse(flight.departure.at)) / 60000;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function FlightCard({ flight, now }: { flight: FlightLeg; now: number | null }) {
  const [live, setLive] = useState<LiveFlight | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [updated, setUpdated] = useState<string | null>(null);
  const date = flight.departure.at.slice(0, 10);
  const canTrack = now !== null && now >= Date.parse(flight.departure.at) - 48 * 3600000 && now < Date.parse(flight.arrival.at) + 12 * 3600000;

  useEffect(() => {
    if (!canTrack) return;
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      try {
        const response = await fetch(`/api/flight?number=${flight.number}&date=${date}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.flight) throw new Error("unavailable");
        setLive(data.flight);
        setUpdated(new Date().toISOString());
        setMessage("");
      } catch {
        if (!controller.signal.aborted) { setLive(null); setUpdated(null); setMessage("Live status is unavailable. Your booked schedule is shown above."); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 5 * 60000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [canTrack, flight.number, date]);

  async function refreshManually() {
    setLoading(true);
    try {
      const response = await fetch(`/api/flight?number=${flight.number}&date=${date}`, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || !data.flight) throw new Error("unavailable");
      setLive(data.flight);
      setUpdated(new Date().toISOString());
      setMessage("");
    } catch {
      setLive(null); setUpdated(null); setMessage("Live status is unavailable. Your booked schedule is shown above.");
    } finally { setLoading(false); }
  }

  return <>
    <div className="ticket-heading"><span className="airline">jetBlue<span> {flight.number}</span></span><span className="status-pill"><span />{live?.status ?? "Booked"}</span></div>
    <div className="ticket-route">
      <div><p className="airport">{flight.departure.iata}</p><p>{flight.departure.city}</p></div>
      <div className="flight-line"><span /><Icon name="plane" /><span /></div>
      <div><p className="airport">{flight.arrival.iata}</p><p>{flight.arrival.city}</p></div>
    </div>
    <div className="ticket-times">
      {[flight.departure, flight.arrival].map((endpoint, index) => <div key={index}>
        <strong>{localTime(endpoint.at, endpoint.timeZone)}</strong>
        <span>{shortDate(endpoint.at, endpoint.timeZone)} · {endpoint.iata === "JFK" ? "Eastern" : "Pacific"}</span>
        <span>{endpoint.terminal ? `Terminal ${endpoint.terminal}` : "Terminal to be assigned"}</span>
      </div>)}
    </div>
    <div className="ticket-bottom"><span>Nonstop <span className="dot-separator">·</span> {duration(flight)}</span><span>{flight.id === "return" ? "Arrives Nov 4" : "Arrives Oct 28"}</span></div>
    <div className="ticket-status">
      <div className="flight-status-heading"><p>{updated ? `Checked ${localTime(updated, trip.timeZone)} PT` : "Schedule from your JetBlue booking"}</p><button className="icon-button" onClick={refreshManually} disabled={loading} aria-label={`Refresh ${flight.number} flight status`}><Icon name="refresh" size={16} /></button></div>
      {live && <p className="live-details">{live.arrivalTime && !Number.isNaN(Date.parse(live.arrivalTime)) ? `Arrival estimate: ${shortDate(live.arrivalTime, flight.arrival.timeZone)}, ${localTime(live.arrivalTime, flight.arrival.timeZone)} ${flight.arrival.iata === "JFK" ? "ET" : "PT"} · ` : ""}{live.terminal ? `Terminal ${live.terminal} · ` : ""}{live.gate ? `Gate ${live.gate}` : "Gate pending"}{live.baggage ? ` · Bag belt ${live.baggage}` : ""}</p>}
      <p className="status-message" role="status">{loading ? "Checking flight status…" : message || (canTrack ? "Checks for updates every 5 minutes." : "Live tracking switches on closer to departure.")}</p>
    </div>
  </>;
}

export default function Home() {
  const plan = useSyncedPlan();
  const [now, setNow] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedFlight, setSelectedFlight] = useState(0);
  const [calendarMessage, setCalendarMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const current = Date.now();
      setNow(current);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: trip.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(current);
      const index = itinerary.findIndex(day => day.date === today);
      if (index >= 0) setSelectedDay(index);
      if (current > Date.parse(flights[0].arrival.at)) setSelectedFlight(1);
    });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, []);

  function downloadCalendar() {
    const url = URL.createObjectURL(new Blob([buildTripCalendar(plan.days, plan.syncedAt)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "kian-and-becca-october-2026.ics";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCalendarMessage("Calendar downloaded — open it to add your flights and anniversary.");
  }

  const phase = now === null ? "upcoming" : getTripPhase(now);
  const target = phase === "upcoming" ? flights[0].arrival.at : phase === "together" ? flights[1].departure.at : flights[1].arrival.at;
  const countdown = now === null ? null : formatCountdown(Date.parse(target) - now);
  const day = plan.days[selectedDay];
  const anniversary = plan.days.find(day => day.date === "2026-11-01");
  const anniversarySummary = anniversary?.items.map(item => [item.time, item.title, item.note, item.tentative ? "Tentative" : null].filter(Boolean).join(" · ")).join(" / ") || "No activities scheduled yet.";
  const syncedLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: trip.timeZone }).format(new Date(plan.syncedAt));
  const phaseTitle = phase === "upcoming" ? "Until San Francisco" : phase === "together" ? "Time left in California" : phase === "homeward" ? "Until New York" : "Trip complete";

  return <div className="site-shell">
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header wrap">
      <a href="#" className="wordmark" aria-label="Kian and Becca home"><Image src="/kb-mark.svg" width={52} height={52} alt="" priority /></a>
      <nav aria-label="Main navigation"><a href="#itinerary">The plan</a><a href="#flights">Flights</a><a href="#arrival">Airport transfer</a></nav>
      <span className="header-date">OCT 28 — NOV 3, 2026</span>
    </header>
    <main id="main" className="wrap">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow">SAN FRANCISCO & THE BAY AREA</div>
          <h1 id="hero-title">A week in<br /><em>the Bay.</em></h1>
          <p className="hero-description">Kian visits Becca. Flight details, the tentative itinerary, and the route from SFO—all in one place.</p>
          <div className="hero-dates"><Icon name="calendar" size={18} /><span>October 28 – November 3</span><span className="dot-separator">·</span><span>2026</span></div>
          <div className="hero-actions"><a className="button button-dark" href="#itinerary">View itinerary <Icon name="arrow" size={18} /></a><button className="button button-light" onClick={downloadCalendar}><Icon name="calendar" size={17} /> Add to calendar</button></div>
          <p className="calendar-feedback" role="status">{calendarMessage}</p>
        </div>
        <div className="postcard" aria-label="Illustration of the Golden Gate Bridge in San Francisco">
          <div className="postcard-top"><span>DESTINATION</span><span>37.77° N · 122.42° W</span></div>
          <p className="postcard-title">San Francisco</p>
          <svg viewBox="0 0 500 260" className="bridge-art" role="img" aria-label="Golden Gate Bridge over the bay">
            <defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#e4e9d6" /><stop offset="1" stopColor="#f1eedc" /></linearGradient></defs>
            <path d="M0 0h500v260H0z" fill="url(#sky)" /><circle cx="389" cy="58" r="31" fill="#ebbc79" />
            <path d="M0 162q67-61 122-4t114 7q38-33 108 0t156-28v123H0" fill="#b1beb0" /><path d="M0 207q128-44 261-9t239-14v76H0" fill="#89a5a2" />
            <g fill="none" stroke="#b36048"><path d="M-12 172 510 144" strokeWidth="9" /><path d="M125 83v152m19-156v158M354 49v177m18-181v177" strokeWidth="7" /><path d="m123 97 22-2m-22 32 22-1m-21 46 20-1m211-109 18-1m-18 33 18-1m-18 46 18-1" strokeWidth="6" /><path d="M-10 163Q57 150 134 82q102 150 230-34 74 115 146 96" strokeWidth="2.5" />
            {[25, 50, 75, 100, 173, 199, 225, 251, 278, 304, 330, 399, 424, 451, 478].map((x, i) => <path key={x} d={`M${x} ${[157,143,125,101,123,140,145,139,125,103,73,91,116,132,142][i]}V${172-x*.055}`} strokeWidth="1.3" />)}</g>
            <path d="M0 244q110-17 212-1m68-8q110 20 220-3M23 224h39m350-17h43" stroke="#d8e2d6" strokeWidth="2" fill="none" /><path d="m286 56 6-3 6 3m-27 12 5-3 5 3" stroke="#526e67" strokeWidth="2" fill="none" />
          </svg>
          <div className="postcard-bottom"><span>California · October 2026</span><span className="postcard-stamp">WEST COAST<br /><Icon name="plane" size={20} /></span></div>
        </div>
      </section>

      <section className="countdown-band" aria-label="Trip countdown">
        <div className="countdown-label"><p className="eyebrow">{phase === "complete" ? "OCTOBER 2026" : "THE COUNTDOWN"}</p><h2>{phaseTitle}<span>.</span></h2><p>{phase === "upcoming" ? "To your scheduled SFO arrival · Oct 28, 11:58 PM PT" : phase === "together" ? "Until your return flight · Nov 3, 10:56 PM PT" : phase === "homeward" ? "Scheduled arrival · Nov 4, 7:24 AM ET" : "October 28 – November 3, 2026"}</p></div>
        {phase !== "complete" ? <div className="countdown-numbers" aria-label={countdown ? `${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds` : "Loading countdown"}>
          {(["days", "hours", "minutes", "seconds"] as const).map(unit => <div key={unit}><strong>{countdown ? String(countdown[unit]).padStart(2, "0") : "—"}</strong><span>{unit}</span></div>)}
        </div> : <div className="memory-heart"><Icon name="check" size={52} /></div>}
      </section>

      <div className="main-grid">
        <section id="itinerary" className="itinerary-section" aria-labelledby="plan-title">
          <div className="section-heading"><div><p className="eyebrow">OCTOBER 28 – NOVEMBER 3</p><h2 id="plan-title">The itinerary<span>.</span></h2></div><span className="badge">Tentative plans</span></div>
          <p className="section-description">A day-by-day look at the plan. Details may change.</p>
          <div className="day-selector" role="group" aria-label="Choose an itinerary day">
            {plan.days.map((item, index) => <button key={item.date} onClick={() => setSelectedDay(index)} aria-pressed={selectedDay === index} className={`day-button ${selectedDay === index ? "selected" : ""} ${item.highlight ? "special-day" : ""}`} aria-label={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`))}>
              <span>{new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`))}</span><strong>{Number(item.date.slice(-2))}</strong><span className="day-marker">{item.highlight === "anniversary" ? "•" : item.highlight === "halloween" ? "✳" : "·"}</span>
            </button>)}
          </div>
          <div className={`day-detail ${day.highlight === "anniversary" ? "anniversary-day" : ""}`} aria-live="polite">
            <div className="day-detail-heading"><div><p className="eyebrow">{shortDate(`${day.date}T12:00:00Z`, "UTC")} · DAY {selectedDay + 1}</p><h3>{day.title}</h3></div>{day.highlight && <span className="day-doodle" aria-hidden="true">{day.highlight === "anniversary" ? "01" : "✳"}</span>}</div>
            {day.items.length === 0 && <p className="open-day-note">No activities scheduled yet.</p>}<ol className="timeline">{day.items.map((item, i) => <li key={i}><span className="timeline-dot" /><div className="activity-time">{item.time ?? "Anytime"}</div><div><h4>{item.title}{item.tentative && <span className="tentative-dot">To decide</span>}</h4>{item.note && <p>{item.note}</p>}</div></li>)}</ol>
            {day.stay && <div className="stay-note"><span>STAYING</span><strong>{day.stay}</strong></div>}
          </div>
          <div className="plan-footnote"><span title="The Google Doc is checked hourly while Codex is running on the sync computer. Published changes appear here automatically.">{now !== null && now >= Date.parse("2026-11-05T08:00:00Z") ? "Final saved plan" : "Auto-sync hourly"} · Synced {syncedLabel} PT<br />Activity times are Pacific.</span><a href={trip.planUrl} target="_blank" rel="noreferrer">View Google Doc <Icon name="external" size={13} /></a></div>
          {plan.offline && <p className="plan-sync-status" role="status">Updates are temporarily unavailable. Showing the last synced plan.</p>}
        </section>

        <aside className="travel-column" id="flights" aria-labelledby="flights-title">
          <div className="section-heading"><div><p className="eyebrow">ROUND-TRIP · JETBLUE</p><h2 id="flights-title">Flight details<span>.</span></h2></div><Icon name="plane" size={25} /></div>
          <div className="flight-tabs" role="group" aria-label="Select flight"><button aria-pressed={selectedFlight === 0} className={selectedFlight === 0 ? "active" : ""} onClick={() => setSelectedFlight(0)}>To California <span>OCT 28</span></button><button aria-pressed={selectedFlight === 1} className={selectedFlight === 1 ? "active" : ""} onClick={() => setSelectedFlight(1)}>Back to New York <span>NOV 3</span></button></div>
          <div className="flight-ticket"><FlightCard key={flights[selectedFlight].id} flight={flights[selectedFlight]} now={now} /></div>
          <p className="flight-footnote">Flight times are local to each airport. The trip crosses the November 1 time change.</p>
        </aside>
      </div>
      <RoutePlanner key={flights[selectedFlight].id} flight={flights[selectedFlight]} />

      <section className="anniversary-banner" aria-labelledby="anniversary-title"><div className="anniversary-icon"><Icon name="calendar" size={30} /></div><div><p className="eyebrow">SUNDAY, NOVEMBER 1</p><h2 id="anniversary-title">One-year anniversary</h2><p>{anniversarySummary}</p></div><span className="anniversary-one" aria-hidden="true">01<span>NOVEMBER</span></span></section>


    </main>
    <footer className="site-footer wrap"><a href="#" className="wordmark" aria-label="Kian and Becca home"><Image src="/kb-mark.svg" width={40} height={40} alt="" /></a><p>October 28 – November 3, 2026</p><a href={trip.planUrl} target="_blank" rel="noreferrer">View original trip plan <Icon name="external" size={13} /></a></footer>
  </div>;
}
