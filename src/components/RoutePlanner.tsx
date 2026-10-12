"use client";

import { useEffect, useRef, useState } from "react";
import type { FlightLeg } from "../lib/trip";

type Route = { origin: string; destination: string; arrivalTime: string; totalDurationText: string; bufferText: string; legs: { from: string; to: string; durationText: string; distanceText: string }[] };

export default function RoutePlanner({ flight }: { flight: FlightLeg }) {
  const [destination, setDestination] = useState(flight.id === "outbound" ? "710 Bowdoin Ln" : "");
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
    if (destination.trim().length < 3) { setSuggestions([]); return; }
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
  const maps = new URLSearchParams({ api: "1", origin: flight.arrival.iata === "SFO" ? "San Francisco International Airport Terminal 1" : "John F. Kennedy International Airport", destination: destination.trim(), travelmode: "driving" });
  if (stops.some(stop => stop.trim())) maps.set("waypoints", stops.filter(stop => stop.trim()).join("|"));

  return <details className="route-planner" id="arrival" open><summary>{flight.id === "outbound" ? "SFO → Becca’s" : "After landing"} <span>Airport transfer</span></summary><div className="route-planner-content"><p>From {flight.arrival.iata}{flight.arrival.terminal ? ` Terminal ${flight.arrival.terminal}` : ""}. {flight.id === "outbound" ? "Head to 710 Bowdoin Ln after landing." : "Choose where you’re headed."}</p><form onSubmit={calculate}><label htmlFor="destination">Destination</label><input id="destination" list="destination-suggestions" value={destination} onChange={event => { setDestination(event.target.value); invalidateRoute(); }} required placeholder="Enter an address or place" maxLength={250} /><datalist id="destination-suggestions">{suggestions.map(value => <option key={value} value={value} />)}</datalist>{stops.map((stop, i) => <div className="stop-row" key={i}><label className="sr-only" htmlFor={`stop-${i}`}>Stop {i + 1}</label><input id={`stop-${i}`} value={stop} placeholder={`Stop ${i + 1}`} maxLength={250} onChange={event => { setStops(current => current.map((value, index) => index === i ? event.target.value : value)); invalidateRoute(); }} /><button type="button" onClick={() => { setStops(current => current.filter((_, index) => index !== i)); invalidateRoute(); }} aria-label={`Remove stop ${i + 1}`}>×</button></div>)}<div className="route-actions"><button type="button" className="text-button" disabled={stops.length >= 3} onClick={() => { setStops(current => [...current, ""]); invalidateRoute(); }}>+ Add a stop</button><button className="button button-dark button-small" disabled={loading || !destination.trim()}>{loading ? "Checking…" : "Estimate drive"}</button></div></form>{route && <div className="route-result" role="status"><strong>{route.totalDurationText} driving</strong><p>Arrival around {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: flight.arrival.timeZone }).format(new Date(route.arrivalTime))}, airport local time.</p><p>Includes {route.bufferText} to leave the airport. Allow extra time for bags and stops.</p></div>}{error && <p className="route-error" role="status">{error}</p>}{destination.trim() && <a className="maps-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?${maps}`}>Open route in Google Maps ↗</a>}</div></details>;
}
