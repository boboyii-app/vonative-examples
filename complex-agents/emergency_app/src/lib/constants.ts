import type {
  IncidentCategory,
  IncidentStatus,
  IncidentType,
  Severity,
} from "./types";

export const ABUJA_CENTER = {
  latitude: 9.0765,
  longitude: 7.3986,
};

// Override this through NEXT_PUBLIC_MAP_STYLE_URL in each environment.
export const DEFAULT_MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  security: "Security",
  medical: "Medical",
  disaster: "Disaster",
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  escalated: "Escalated",
  resolved: "Resolved",
};

export const TYPE_LABELS: Record<IncidentType, string> = {
  fire: "Fire",
  medical_emergency: "Medical emergency",
  road_accident: "Road accident",
  flood: "Flood",
  building_collapse: "Building collapse",
  violent_crime: "Violent crime",
  missing_person: "Missing person",
  public_disturbance: "Public disturbance",
  other: "Other",
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function formatConfidence(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatRelativeTime(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown time";

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}
