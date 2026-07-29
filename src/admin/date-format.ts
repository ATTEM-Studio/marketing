const missing = "입력하지 않음";
const KOREA_TIME_ZONE = "Asia/Seoul";
const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/u;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function component(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string | null {
  return parts.find((part) => part.type === type)?.value ?? null;
}

function formattedDate(parts: Intl.DateTimeFormatPart[]): string {
  return `${component(parts, "year")}년 ${component(parts, "month")}월 ${component(parts, "day")}일`;
}

function parsedTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatKoreanDate(value: unknown): string {
  if (typeof value === "string") {
    const match = calendarDate.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      ) {
        return `${year}년 ${month}월 ${day}일`;
      }
      return missing;
    }
  }

  const parsed = parsedTimestamp(value);
  return parsed ? formattedDate(dateFormatter.formatToParts(parsed)) : missing;
}

export function formatKoreanDateTime(value: unknown): string {
  const parsed = parsedTimestamp(value);
  if (!parsed) return missing;
  const parts = dateTimeFormatter.formatToParts(parsed);
  return `${formattedDate(parts)} ${component(parts, "hour")}:${component(parts, "minute")}`;
}
