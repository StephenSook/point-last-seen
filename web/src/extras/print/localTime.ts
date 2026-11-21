// One way to print a moment on paper: the laptop's own date and 24-hour time, with the zone's short name ("EST"),
// so a team holding the assignment sheet and its radio card reads the same local time on both.

export type LocalDateTime = { date: string; time: string };

export function localDateTime(ms: number, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, timeZoneName: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(ms);
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${v.month}/${v.day}/${v.year}`, time: `${v.hour}:${v.minute} ${v.timeZoneName}` };
}
