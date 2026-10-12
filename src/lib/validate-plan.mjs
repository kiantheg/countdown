const EXPECTED_DATES = [
  "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31",
  "2026-11-01", "2026-11-02", "2026-11-03",
];

function fail(path, message) {
  throw new Error(`Invalid itinerary: ${path} ${message}`);
}

function object(value, path, required, optional = []) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object.");
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(path, `contains an unsupported field: ${key}.`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "is required.");
  }
}

function boundedString(value, path, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    fail(path, `must be a nonblank string of at most ${maxLength} characters.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    fail(path, "must not contain control characters.");
  }
}

function timestamp(value, path) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    fail(path, "must be an ISO timestamp with a timezone.");
  }
  const day = value.slice(0, 10);
  const calendarDate = new Date(`${day}T00:00:00Z`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day) {
    fail(path, "must contain a real calendar date and time.");
  }
  return parsed;
}

/** Validate the entire replacement snapshot before allowing it into a build. */
export function validatePlan(value) {
  object(value, "snapshot", ["sourceModifiedAt", "syncedAt", "days"]);
  const sourceModifiedAt = timestamp(value.sourceModifiedAt, "sourceModifiedAt");
  const syncedAt = timestamp(value.syncedAt, "syncedAt");
  if (sourceModifiedAt > syncedAt) fail("syncedAt", "cannot precede sourceModifiedAt.");
  if (!Array.isArray(value.days) || value.days.length !== EXPECTED_DATES.length) {
    fail("days", "must contain all seven trip dates, October 28 through November 3, 2026.");
  }

  for (const [index, day] of value.days.entries()) {
    const path = `days[${index}]`;
    object(day, path, ["date", "title", "items"], ["stay", "highlight"]);
    if (day.date !== EXPECTED_DATES[index]) {
      fail(`${path}.date`, `must be ${EXPECTED_DATES[index]} (unique dates in trip order).`);
    }
    boundedString(day.title, `${path}.title`, 160);
    if (Object.hasOwn(day, "stay")) boundedString(day.stay, `${path}.stay`, 200);
    if (Object.hasOwn(day, "highlight") && day.highlight !== "halloween" && day.highlight !== "anniversary") {
      fail(`${path}.highlight`, "must be halloween or anniversary.");
    }
    if (!Array.isArray(day.items) || day.items.length > 20) {
      fail(`${path}.items`, "must be an array of at most 20 activities.");
    }
    for (const [itemIndex, item] of day.items.entries()) {
      const itemPath = `${path}.items[${itemIndex}]`;
      object(item, itemPath, ["title"], ["time", "note", "tentative"]);
      boundedString(item.title, `${itemPath}.title`, 200);
      if (Object.hasOwn(item, "time")) boundedString(item.time, `${itemPath}.time`, 100);
      if (Object.hasOwn(item, "note")) boundedString(item.note, `${itemPath}.note`, 1000);
      if (Object.hasOwn(item, "tentative") && typeof item.tentative !== "boolean") {
        fail(`${itemPath}.tentative`, "must be a boolean.");
      }
    }
  }
}

