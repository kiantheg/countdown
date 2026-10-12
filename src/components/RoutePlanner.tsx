"use client";

import { useEffect, useRef, useState } from "react";
import type { FlightLeg } from "../lib/trip";

type Route = { origin: string; destination: string; arrivalTime: string; totalDurationText: string; bufferText: string; legs: { from: string; to: string; durationText: string; distanceText: string }[] };

const beccaAddress = "710 Bowdoin St, Stanford, CA 94305";
// Google's Share → Embed route for SFO to 710 Bowdoin St on the Stanford campus.
// This public embed does not depend on the optional Routes / Places API key.
const arrivalMapEmbed = "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d202550.95460321318!2d-122.44319513564608!3d37.511251457909!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x808f778c55555555%3A0xa4f25c571acded3f!2sSan%20Francisco%20International%20Airport%2C%20San%20Francisco%2C%20CA%2094128!3m2!1d37.619114499999995!2d-122.3816274!4m5!1s0x808fbadad9168a83%3A0x71952600e20f13b9!2s710%20Bowdoin%20St%2C%20Palo%20Alto%2C%20CA%2094306!3m2!1d37.4214444!2d-122.1618647!5e0!3m2!1sen!2sus!4v1791837149887!5m2!1sen!2sus";

export default function RoutePlanner({ flight }: { flight: FlightLeg }) {
  const [destination, setDestination] = useState(flight.id === "outbound" ? beccaAddress : "");
  const [stops, setStops] = useState<string[]>([]);
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const activeRequest = useRef<AbortController | null>(null);
  function invalidateRoute() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setRoute(null); setError(""); setLoading(false);
  }
  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (destination.trim().length < 3 || destination.trim() === beccaAddress) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?query=${encodeURIComponent(destination)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        setSuggestions((data.predictions ?? []).map((place: { description: string }) => place.description));
      } catch { /* A plain address still works if suggestions are unavailable. */ }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [destination]);

  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true); setError(""); setRoute(null);
    const params = new URLSearchParams({ arrivalTime: flight.arrival.at, arrivalIata: flight.arrival.iata, arrivalAirport: `${flight.arrival.city} International Airport`, destination: destination.trim() });
    if (flight.arrival.terminal) params.set("arrivalTerminal", flight.arrival.terminal);
    stops.map(stop => stop.trim()).filter(Boolean).forEach(stop => params.append("stop", stop));
    try {
      const response = await fetch(`/api/drive?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const data = await response.json();
      if (!response.ok || !data.route) throw new Error("unavailable");
      if (activeRequest.current === controller) setRoute(data.route);
    } catch { if (activeRequest.current === controller) setError("A drive estimate isn’t available right now. You can open the route in Google Maps."); }
    finally { if (activeRequest.current === controller) setLoading(false); }
  }
  const airport = flight.arrival.iata === "SFO" ? "San Francisco International Airport" : "John F. Kennedy International Airport";
  const maps = new URLSearchParams({ api: "1", origin: `${airport}${flight.arrival.terminal ? ` Terminal ${flight.arrival.terminal}` : ""}`, destination: destination.trim(), travelmode: "driving" });
  if (stops.some(stop => stop.trim())) maps.set("waypoints", stops.filter(stop => stop.trim()).join("|"));
  const showArrivalMap = flight.id === "outbound" && destination.trim() === beccaAddress && !stops.some(stop => stop.trim());

  return <details className="route-planner" id="arrival" open>
    <summary>{flight.id === "outbound" ? "SFO → Becca’s" : "After landing"} <span>Airport transfer</span></summary>
    <div className={`route-planner-content${showArrivalMap ? " has-map" : ""}`}>
      <p>From {flight.arrival.iata}{flight.arrival.terminal ? ` Terminal ${flight.arrival.terminal}` : ""}. {flight.id === "outbound" ? "Head to 710 Bowdoin St on the Stanford campus after landing." : "Choose where you’re headed."}</p>
      {showArrivalMap && <figure className="route-map">
        <iframe title="Google Maps route from SFO to 710 Bowdoin Street" src={arrivalMapEmbed} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        <figcaption>Direct route to Becca’s. Map travel times reflect current conditions, not your arrival night.</figcaption>
      </figure>}
      <form onSubmit={calculate}>
        <label htmlFor="destination">Destination</label>
        <input id="destination" list="destination-suggestions" value={destination} onChange={event => { setDestination(event.target.value); invalidateRoute(); }} required placeholder="Enter an address or place" maxLength={250} />
        <datalist id="destination-suggestions">{suggestions.map(value => <option key={value} value={value} />)}</datalist>
        {stops.map((stop, i) => <div className="stop-row" key={i}>
          <label className="sr-only" htmlFor={`stop-${i}`}>Stop {i + 1}</label>
          <input id={`stop-${i}`} value={stop} placeholder={`Stop ${i + 1}`} maxLength={250} onChange={event => { setStops(current => current.map((value, index) => index === i ? event.target.value : value)); invalidateRoute(); }} />
          <button type="button" onClick={() => { setStops(current => current.filter((_, index) => index !== i)); invalidateRoute(); }} aria-label={`Remove stop ${i + 1}`}>×</button>
        </div>)}
        <div className="route-actions">
          <button type="button" className="text-button" disabled={stops.length >= 3} onClick={() => { setStops(current => [...current, ""]); invalidateRoute(); }}>+ Add a stop</button>
          <button className="button button-dark button-small" disabled={loading || !destination.trim()}>{loading ? "Checking…" : "Estimate drive"}</button>
        </div>
      </form>
      {route && <div className="route-result" role="status"><strong>{route.totalDurationText} driving</strong><p>Arrival around {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: flight.arrival.timeZone }).format(new Date(route.arrivalTime))}, airport local time.</p><p>Includes {route.bufferText} to leave the airport. Allow extra time for bags and stops.</p></div>}
      {error && <p className="route-error" role="status">{error}</p>}
      {!showArrivalMap && destination.trim() && <p className="route-preview-note">View your custom route and any stops in Google Maps.</p>}
      {destination.trim() && <a className="maps-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?${maps}`}>Open route in Google Maps ↗</a>}
    </div>
  </details>;
}
