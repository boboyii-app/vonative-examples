export const CATEGORIES = ["security", "medical", "disaster"] as const;
export type IncidentCategory = (typeof CATEGORIES)[number];

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "new",
  "acknowledged",
  "assigned",
  "escalated",
  "resolved",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_TYPES = [
  "fire",
  "medical_emergency",
  "road_accident",
  "flood",
  "building_collapse",
  "violent_crime",
  "missing_person",
  "public_disturbance",
  "other",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export type DataSource = "caller" | "ai" | "operator" | "vonative" | "scenario";
export type AnalysisStatus = "completed" | "pending_review" | "failed";
export type GeocodingStatus = "matched" | "ambiguous" | "unresolved" | "not_requested" | "verified";

export interface IncidentLocation {
  address: string;
  latitude?: number;
  longitude?: number;
  reportedAddress?: string;
  geocodingStatus: GeocodingStatus;
  geocodingConfidence?: number;
  geocodingProvider?: string;
  geocodingFeatureId?: string;
}

export interface IncidentFact {
  id: string;
  label: string;
  value: string;
  source: DataSource;
  confidence: number;
  verified: boolean;
}

export type TranscriptSpeaker = "caller" | "agent" | "operator";

export interface TranscriptSegment {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  at: string;
  source: DataSource;
  confidence?: number;
  revised?: boolean;
  revisionOf?: string;
  sourceEventId?: string;
}

export type TimelineEntryType =
  | "received"
  | "transcript"
  | "classification"
  | "extraction"
  | "escalation"
  | "operator"
  | "recording"
  | "system";

export interface TimelineEntry {
  id: string;
  type: TimelineEntryType;
  label: string;
  detail?: string;
  at: string;
  actor: string;
  source: DataSource;
}

export interface RelatedReport {
  id: string;
  reportId: string;
  title: string;
  confidence: number;
  status: "proposed" | "reviewed" | "not_duplicate" | "linked";
  source: DataSource;
}

export interface Incident {
  id: string;
  title: string;
  type: IncidentType;
  category: IncidentCategory;
  severity: Severity;
  status: IncidentStatus;
  location: IncidentLocation;
  summary: string;
  confidence: number;
  source: DataSource;
  simulated: boolean;
  unverified: boolean;
  escalationReady: boolean;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  callId?: string;
  recordingReference?: string;
  recordingAvailable?: boolean;
  analysisStatus: AnalysisStatus;
  analysisError?: string;
  facts: IncidentFact[];
  transcript: TranscriptSegment[];
  timeline: TimelineEntry[];
  relatedReports: RelatedReport[];
}

export type OperatorActionType =
  | "acknowledge"
  | "assign"
  | "escalate"
  | "resolve"
  | "review_duplicate"
  | "verify_location";

export interface OperatorAction {
  id: string;
  incidentId: string;
  action: OperatorActionType;
  actor: string;
  note?: string;
  relatedReportId?: string;
  assignee?: string;
  at: string;
}

export type NormalizedEventKind =
  | "call.started"
  | "call.ended"
  | "transcript.segment"
  | "analysis.completed"
  | "recording.reference"
  | "triage.escalation_ready";

export interface NormalizedEvent {
  eventId: string;
  kind: NormalizedEventKind;
  receivedAt: string;
  occurredAt: string;
  source: "vonative" | "scenario";
  sessionId?: string;
  callId?: string;
  incidentId?: string;
  data: Record<string, unknown>;
}

export interface IncidentFilters {
  severity?: Severity;
  category?: IncidentCategory;
  status?: IncidentStatus;
  search?: string;
}

export interface IncidentUpdateMessage {
  type: "incident.updated" | "incident.created" | "incident.action";
  incident: Incident;
  action?: OperatorAction;
  emittedAt: string;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  category: IncidentCategory;
  severity: Severity;
  stepCount: number;
}

export interface ScenarioRun {
  runId: string;
  scenarioId: string;
  nextStep: number;
  complete: boolean;
}

export interface Operator {
  id: string;
  name: string;
}
