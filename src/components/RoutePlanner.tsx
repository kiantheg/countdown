"use client";

import { useState } from "react";
import type { FlightLeg } from "../lib/trip";

const beccaAddress = "710 Bowdoin St, Stanford, CA 94305";
// Google's Share → Embed route for SFO to 710 Bowdoin St on the Stanford campus.
// This public embed does not depend on the optional Routes / Places API key.
const arrivalMapEmbed = "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d202550.95460321318!2d-122.44319513564608!3d37.511251457909!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x808f778c55555555%3A0xa4f25c571acded3f!2sSan%20Francisco%20International%20Airport%2C%20San%20Francisco%2C%20CA%2094128!3m2!1d37.619114499999995!2d-122.3816274!4m5!1s0x808fbadad9168a83%3A0x71952600e20f13b9!2s710%20Bowdoin%20St%2C%20Palo%20Alto%2C%20CA%2094306!3m2!1d37.4214444!2d-122.1618647!5e0!3m2!1sen!2sus!4v1791837149887!5m2!1sen!2sus";

export default function RoutePlanner({ flight }: { flight: FlightLeg }) {
  const [destination, setDestination] = useState(flight.id === "outbound" ? beccaAddress : "");
  const [stops, setStops] = useState<string[]>([]);
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
      <div className="route-fields">
        <label htmlFor="destination">Destination</label>
        <input id="destination" value={destination} onChange={event => setDestination(event.target.value)} placeholder="Enter an address or place" maxLength={250} />
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
      {!showArrivalMap && destination.trim() && <p className="route-preview-note">View your custom route and any stops in Google Maps.</p>}
    </div>
  </details>;
}
