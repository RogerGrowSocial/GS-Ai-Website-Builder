import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingForDate, weekdayForDate, firstName } from '../public/greeting.js';

test('Dutch greeting follows Amsterdam time (not server time)', () => {
  assert.equal(greetingForDate(new Date('2026-11-10T08:15:00Z')), 'Goedemorgen');
  assert.equal(greetingForDate(new Date('2026-11-10T12:15:00Z')), 'Goedemiddag');
  assert.equal(greetingForDate(new Date('2026-11-10T19:08:00Z')), 'Goedenavond');
  assert.equal(weekdayForDate(new Date('2026-11-10T19:08:00Z')), 'dinsdag');
});

test('Summer time and boundary conditions work too', () => {
  assert.equal(greetingForDate(new Date('2026-07-10T09:59:00Z')), 'Goedemorgen');
  assert.equal(greetingForDate(new Date('2026-07-10T10:00:00Z')), 'Goedemiddag');
  assert.equal(greetingForDate(new Date('2026-07-10T16:00:00Z')), 'Goedenavond');
  assert.equal(firstName('  Job   van KAP '), 'Job');
  assert.equal(firstName(''), 'daar');
});
