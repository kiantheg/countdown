import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlan } from "../src/lib/validate-plan.mjs";

const DEFAULT_PATH = fileURLToPath(new URL("../src/data/itinerary.json", import.meta.url));
const MAX_FILE_BYTES = 256 * 1024;

try {
  if (process.argv.length > 3) throw new Error("Usage: node scripts/validate-itinerary.mjs [snapshot.json]");
  const path = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_PATH;
  if (statSync(path).size > MAX_FILE_BYTES) throw new Error("Itinerary snapshot exceeds 256 KiB.");
  const snapshot = JSON.parse(readFileSync(path, "utf8"));
  validatePlan(snapshot);
  console.log("Itinerary valid: all seven trip dates and snapshot metadata checked.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not validate itinerary snapshot.");
  process.exitCode = 1;
}
