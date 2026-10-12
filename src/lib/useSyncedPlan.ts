"use client";

import { useEffect, useState } from "react";
import { itinerary, planSync, type ItineraryDay } from "./trip";
import { validatePlan } from "./validate-plan.mjs";

type PlanSnapshot = typeof planSync & { days: ItineraryDay[] };

export function useSyncedPlan() {
  const [plan, setPlan] = useState<PlanSnapshot>({ ...planSync, days: itinerary });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.visibilityState === "hidden" || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/plan", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error("Plan unavailable");
        const next: PlanSnapshot = await response.json();
        validatePlan(next);
        if (controller.signal.aborted) return;
        setPlan(current => Date.parse(next.syncedAt) > Date.parse(current.syncedAt) ? next : current);
        setOffline(false);
      } catch {
        if (!controller.signal.aborted) setOffline(true);
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);

  return { ...plan, offline };
}
