export type Unit = "yards" | "feet" | "inches" | "meters" | "none";

export function formatValue(value: number | string | null | undefined, unit: Unit): string {
  if (value === null || value === undefined || unit === "none") return "";
  const v = Number(value);
  if (unit === "inches") {
    const feet = Math.floor(v / 12);
    const inches = Math.round((v - feet * 12) * 10) / 10;
    if (feet === 0) return `${inches}"`;
    return `${feet}' ${inches}"`;
  }
  const labels: Record<Unit, string> = { yards: "yds", feet: "ft", meters: "m", inches: "in", none: "" };
  return `${v} ${labels[unit]}`;
}

export const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Something was missing. Please try again.",
  contest_not_found: "This contest link isn't valid any more.",
  event_not_live: "This event isn't live right now.",
  contest_closed: "This contest is closed.",
  golfer_not_in_event: "We couldn't find you in this event.",
  wrong_division: "This contest is for a different division.",
  value_required: "Please enter your distance.",
  value_out_of_range: "That distance is outside the allowed range.",
  already_submitted: "You've already entered this contest.",
  not_allowed: "You don't have permission to do that.",
  invalid_transition: "That entry can't be changed that way.",
  note_required: "Please add a note.",
};
