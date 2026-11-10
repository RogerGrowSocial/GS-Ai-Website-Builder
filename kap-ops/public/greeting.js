const DUTCH_TIME_ZONE = 'Europe/Amsterdam';

export function greetingForDate(value = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: DUTCH_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(value));
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

export function weekdayForDate(value = new Date()) {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: DUTCH_TIME_ZONE,
    weekday: 'long'
  }).format(value);
}

export function firstName(displayName) {
  return String(displayName || '').trim().split(/\s+/)[0] || 'daar';
}
