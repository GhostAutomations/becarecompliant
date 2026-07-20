// Shared, pure constants for the weekly care plan (client + server safe).

export const CARE_PLAN_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const CARE_PLAN_SERVICES = [
  "Care",
  "Sit",
  "Overnight",
  "Sleep",
  "Shopping",
  "Cleaning",
] as const;

export const CARE_PLAN_UNITS = [
  "15m",
  "30m",
  "45m",
  "1hr",
  "2hr",
  "3hr",
  "4hr",
  "5hr",
  "6hr",
  "7hr",
  "8hr",
  "9hr",
  "10hr",
  "11hr",
  "12hr",
  "Fixed",
] as const;

export type CarePlanEntry = {
  id: string;
  day_of_week: number; // 0 = Monday
  service: string;
  unit: string;
  quantity: number;
  position: number;
};
