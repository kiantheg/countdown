import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validatePlan as validateItinerary } from '../src/lib/validate-plan.mjs';

const dates = [
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
];

function validItinerary() {
  return {
    sourceModifiedAt: '2026-10-12T12:00:00.000Z',
    syncedAt: '2026-10-12T12:01:00.000Z',
    days: dates.map((date) => ({
      date,
      title: 'A day together',
      stay: 'A place to stay',
      items: [{ title: 'Explore', time: 'Afternoon', note: 'Take our time', tentative: false }],
    })),
  };
}

function rejectsChange(change, message) {
  const value = validItinerary();
  change(value);
  assert.throws(() => validateItinerary(value), Error, message);
}

test('accepts the stored itinerary snapshot', () => {
  const value = JSON.parse(readFileSync(new URL('../src/data/itinerary.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateItinerary(value));
});

test('accepts a complete itinerary and every supported highlight', () => {
  const value = validItinerary();
  value.days[3].highlight = 'halloween';
  value.days[4].highlight = 'anniversary';
  value.days[0].items[0].tentative = true;
  assert.doesNotThrow(() => validateItinerary(value));
});

test('accepts omitted optional fields and a day with no items', () => {
  const value = validItinerary();
  value.days = dates.map((date) => ({ date, title: 'Open day', items: [] }));
  value.days[0].items.push({ title: 'Explore' });
  assert.doesNotThrow(() => validateItinerary(value));
});

test('accepts inclusive text and item count limits', () => {
  const value = validItinerary();
  value.days[0].title = 'x'.repeat(160);
  value.days[0].stay = 'x'.repeat(200);
  value.days[0].items = Array.from({ length: 20 }, () => ({
    title: 'x'.repeat(200),
    time: 'x'.repeat(100),
    note: 'x'.repeat(1000),
    tentative: false,
  }));
  assert.doesNotThrow(() => validateItinerary(value));
});

test('accepts equal timestamps and compares timezone offsets as instants', () => {
  const value = validItinerary();
  value.sourceModifiedAt = '2026-10-12T12:00:00+02:00';
  value.syncedAt = '2026-10-12T10:00:00Z';
  assert.doesNotThrow(() => validateItinerary(value));

  value.syncedAt = '2026-10-12T10:00:00.001Z';
  assert.doesNotThrow(() => validateItinerary(value));
});

test('rejects malformed document values', () => {
  for (const value of [undefined, null, false, 1, 'itinerary', [], {}]) {
    assert.throws(() => validateItinerary(value), Error, `document: ${String(value)}`);
  }
});

test('rejects missing required fields at each level', () => {
  for (const key of ['sourceModifiedAt', 'syncedAt', 'days']) {
    rejectsChange((value) => { delete value[key]; }, `missing document.${key}`);
  }
  for (const key of ['date', 'title', 'items']) {
    rejectsChange((value) => { delete value.days[0][key]; }, `missing day.${key}`);
  }
  rejectsChange((value) => { delete value.days[0].items[0].title; }, 'missing item.title');
});

test('rejects unknown fields at each level', () => {
  rejectsChange((value) => { value.extra = 'unexpected'; }, 'unknown document field');
  rejectsChange((value) => { value.days[0].extra = 'unexpected'; }, 'unknown day field');
  rejectsChange((value) => { value.days[0].items[0].extra = 'unexpected'; }, 'unknown item field');
});

test('requires exactly the seven ordered trip dates', () => {
  rejectsChange((value) => { value.days.pop(); }, 'missing day');
  rejectsChange((value) => { value.days.push({ date: '2026-11-04', title: 'Extra', items: [] }); }, 'extra day');
  rejectsChange((value) => { value.days[1].date = value.days[0].date; }, 'duplicate date');
  rejectsChange((value) => { [value.days[0], value.days[1]] = [value.days[1], value.days[0]]; }, 'reordered dates');
  rejectsChange((value) => { value.days[0].date = '2026-10-27'; }, 'out of range date');
  rejectsChange((value) => { value.days[0].date = '2026-10-28T00:00:00Z'; }, 'timestamp used as date');
  rejectsChange((value) => { value.days[0].date = 20261028; }, 'non-string date');
});

test('rejects non-array collections and non-object entries', () => {
  for (const wrong of [null, false, 1, 'text', {}]) {
    rejectsChange((value) => { value.days = wrong; }, `days: ${String(wrong)}`);
    rejectsChange((value) => { value.days[0].items = wrong; }, `items: ${String(wrong)}`);
  }
  for (const wrong of [null, false, 1, 'text', []]) {
    rejectsChange((value) => { value.days[0] = wrong; }, `day entry: ${String(wrong)}`);
    rejectsChange((value) => { value.days[0].items[0] = wrong; }, `item entry: ${String(wrong)}`);
  }
});

test('rejects empty, blank, non-string, and oversized text fields', () => {
  const fields = [
    { name: 'day.title', limit: 160, select: (value) => value.days[0], key: 'title' },
    { name: 'day.stay', limit: 200, select: (value) => value.days[0], key: 'stay' },
    { name: 'item.title', limit: 200, select: (value) => value.days[0].items[0], key: 'title' },
    { name: 'item.time', limit: 100, select: (value) => value.days[0].items[0], key: 'time' },
    { name: 'item.note', limit: 1000, select: (value) => value.days[0].items[0], key: 'note' },
  ];
  for (const { name, limit, select, key } of fields) {
    for (const wrong of ['', ' \t\n ', null, false, 1, [], {}, 'x'.repeat(limit + 1)]) {
      rejectsChange((value) => { select(value)[key] = wrong; }, `invalid ${name}`);
    }
  }
});

test('rejects more than twenty items', () => {
  rejectsChange((value) => {
    value.days[0].items = Array.from({ length: 21 }, () => ({ title: 'Explore' }));
  }, 'too many items');
});

test('rejects unsupported highlights and non-boolean tentative flags', () => {
  for (const wrong of ['birthday', '', null, false, 1, [], {}]) {
    rejectsChange((value) => { value.days[0].highlight = wrong; }, 'invalid highlight');
  }
  for (const wrong of ['true', 'false', '', null, 0, 1, [], {}]) {
    rejectsChange((value) => { value.days[0].items[0].tentative = wrong; }, 'invalid tentative');
  }
});

test('requires valid RFC3339 timestamps with a timezone and a real calendar day', () => {
  const invalidTimestamps = [
    null,
    false,
    1791806400000,
    [],
    {},
    '',
    'not a date',
    '2026-10-12',
    '2026-10-12T12:00:00',
    '2026-10-12 12:00:00Z',
    '2026-10-12T12:00Z',
    '2026-10-12T12:00:00+0200',
    '2026-02-29T12:00:00Z',
    '2026-04-31T12:00:00Z',
    '2026-00-12T12:00:00Z',
    '2026-13-12T12:00:00Z',
    '2026-10-00T12:00:00Z',
    '2026-10-12T25:00:00Z',
    '2026-10-12T12:60:00Z',
    '2026-10-12T12:00:00+24:00',
  ];
  for (const key of ['sourceModifiedAt', 'syncedAt']) {
    for (const wrong of invalidTimestamps) {
      rejectsChange((value) => { value[key] = wrong; }, `invalid ${key}: ${String(wrong)}`);
    }
  }
});

test('rejects a source modification after the sync instant', () => {
  rejectsChange((value) => {
    value.sourceModifiedAt = '2026-10-12T12:01:00.001Z';
  }, 'source one millisecond after sync');
  rejectsChange((value) => {
    value.sourceModifiedAt = '2026-10-12T10:00:00-02:00';
    value.syncedAt = '2026-10-12T11:00:00Z';
  }, 'source after sync across timezone offsets');
});
