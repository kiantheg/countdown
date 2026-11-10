"use client";

import { useState } from "react";
import type { FlightLeg } from "../lib/trip";

export default function RoutePlanner({ flight }: { flight: FlightLeg }) {
  const [destination, setDestination] = useState("");
  const [stops, setStops] = useState<string[]>([]);
  const airport = flight.arrival.iata === "SFO" ? "San Francisco International Airport" : `${flight.arrival.city} Airport (${flight.arrival.iata})`;
  const maps = new URLSearchParams({ api: "1", origin: `${airport}${flight.arrival.terminal ? ` Terminal ${flight.arrival.terminal}` : ""}`, destination: destination.trim(), travelmode: "driving" });
  if (stops.some(stop => stop.trim())) maps.set("waypoints", stops.filter(stop => stop.trim()).join("|"));

  return <details className="route-planner" id="arrival" open>
    <summary>Pickup at {flight.arrival.iata} <span>Airport transfer</span></summary>
    <div className="route-planner-content">
      <p>Pickup at {flight.arrival.iata}{flight.arrival.terminal ? ` Terminal ${flight.arrival.terminal}` : ""}. The Airbnb address is still to be confirmed. Enter it below when available to open directions.</p>
      <div className="route-fields">
        <label htmlFor="destination">Destination</label>
        <input id="destination" value={destination} onChange={event => setDestination(event.target.value)} placeholder="Airbnb address — to be confirmed" maxLength={250} />
        {stops.map((stop, i) => <div className="stop-row" key={i}>
          <label className="sr-only" htmlFor={`stop-${i}`}>Stop {i + 1}</label>
          <input id={`stop-${i}`} value={stop} placeholder={`Stop ${i + 1}`} maxLength={250} onChange={event => setStops(current => current.map((value, index) => index === i ? event.target.value : value))} />
          <button type="button" onClick={() => setStops(current => current.filter((_, index) => index !== i))} aria-label={`Remove stop ${i + 1}`}>×</button>
        </div>)}
        <div className="route-actions">
          <button type="button" className="text-button" disabled={stops.length >= 3} onClick={() => setStops(current => [...current, ""])}>+ Add a stop</button>
          {destination.trim() && <a className="button button-dark button-small" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?${maps}`}>Open in Google Maps ↗</a>}
        </div>
      </div>
      {destination.trim() && <p className="route-preview-note">View your route and any stops in Google Maps.</p>}
    </div>
  </details>;
}
