import type {
  Incident,
  IncidentFact,
  OperatorAction,
  RelatedReport,
  TimelineEntry,
  TranscriptSegment,
} from "@/lib/types";
import type { SentinelEnv } from "./env";

interface IncidentRow {
  id: string;
  title: string;
  type: string;
  category: string;
  severity: string;
  status: string;
  address: string;
  latitude: number;
  longitude: number;
  geocoded_latitude: number | null;
  geocoded_longitude: number | null;
  reported_address: string | null;
  geocoding_status: string;
  geocoding_confidence: number | null;
  geocoding_provider: string | null;
  geocoding_feature_id: string | null;
  summary: string;
  confidence: number;
  source: string;
  simulated: number;
  unverified: number;
  escalation_ready: number;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  call_id: string | null;
  recording_reference: string | null;
  recording_available: number;
  analysis_status: string;
  analysis_error: string | null;
  facts_json: string;
  transcript_json: string;
  timeline_json: string;
  related_reports_json: string;
}

let memoryIncidents: Incident[] = [];
let memoryActions: OperatorAction[] = [];
const memoryProcessedEvents = new Set<string>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasDatabase(env: SentinelEnv): env is SentinelEnv & { DB: D1Database } {
  return Boolean(env.DB && typeof env.DB.prepare === "function");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToIncident(row: IncidentRow): Incident {
  return {
    id: row.id,
    title: row.title,
    type: row.type as Incident["type"],
    category: row.category as Incident["category"],
    severity: row.severity as Incident["severity"],
    status: row.status as Incident["status"],
    location: {
      address: row.address,
      latitude: row.geocoded_latitude ?? undefined,
      longitude: row.geocoded_longitude ?? undefined,
      reportedAddress: row.reported_address || undefined,
      geocodingStatus: row.geocoding_status as Incident["location"]["geocodingStatus"],
      geocodingConfidence: row.geocoding_confidence ?? undefined,
      geocodingProvider: row.geocoding_provider || undefined,
      geocodingFeatureId: row.geocoding_feature_id || undefined,
    },
    summary: row.summary,
    confidence: Number(row.confidence),
    source: row.source as Incident["source"],
    simulated: Boolean(row.simulated),
    unverified: Boolean(row.unverified),
    escalationReady: Boolean(row.escalation_ready),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assignedTo: row.assigned_to || undefined,
    callId: row.call_id || undefined,
    recordingReference: row.recording_reference || undefined,
    recordingAvailable: Boolean(row.recording_available),
    analysisStatus: row.analysis_status as Incident["analysisStatus"],
    analysisError: row.analysis_error || undefined,
    facts: parseJson<IncidentFact[]>(row.facts_json, []),
    transcript: parseJson<TranscriptSegment[]>(row.transcript_json, []),
    timeline: parseJson<TimelineEntry[]>(row.timeline_json, []),
    relatedReports: parseJson<RelatedReport[]>(row.related_reports_json, []),
  };
}

function incidentValues(incident: Incident): (string | number | null)[] {
  return [
    incident.id,
    incident.title,
    incident.type,
    incident.category,
    incident.severity,
    incident.status,
    incident.location.address,
    incident.location.latitude ?? 0,
    incident.location.longitude ?? 0,
    incident.location.latitude ?? null,
    incident.location.longitude ?? null,
    incident.location.reportedAddress || null,
    incident.location.geocodingStatus,
    incident.location.geocodingConfidence ?? null,
    incident.location.geocodingProvider || null,
    incident.location.geocodingFeatureId || null,
    incident.summary,
    incident.confidence,
    incident.source,
    incident.simulated ? 1 : 0,
    incident.unverified ? 1 : 0,
    incident.escalationReady ? 1 : 0,
    incident.createdAt,
    incident.updatedAt,
    incident.assignedTo || null,
    incident.callId || null,
    incident.recordingReference || null,
    incident.recordingAvailable ? 1 : 0,
    incident.analysisStatus,
    incident.analysisError || null,
    JSON.stringify(incident.facts),
    JSON.stringify(incident.transcript),
    JSON.stringify(incident.timeline),
    JSON.stringify(incident.relatedReports),
  ];
}

async function persistIncidentToD1(db: D1Database, incident: Incident): Promise<void> {
  const upsert = db
    .prepare(
      `INSERT INTO incidents (
        id, title, type, category, severity, status, address, latitude, longitude,
        geocoded_latitude, geocoded_longitude, reported_address, geocoding_status,
        geocoding_confidence, geocoding_provider, geocoding_feature_id,
        summary, confidence, source, simulated, unverified, escalation_ready,
        created_at, updated_at, assigned_to, call_id, recording_reference,
        recording_available, analysis_status, analysis_error,
        facts_json, transcript_json, timeline_json, related_reports_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        type = excluded.type,
        category = excluded.category,
        severity = excluded.severity,
        status = excluded.status,
        address = excluded.address,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        geocoded_latitude = excluded.geocoded_latitude,
        geocoded_longitude = excluded.geocoded_longitude,
        reported_address = excluded.reported_address,
        geocoding_status = excluded.geocoding_status,
        geocoding_confidence = excluded.geocoding_confidence,
        geocoding_provider = excluded.geocoding_provider,
        geocoding_feature_id = excluded.geocoding_feature_id,
        summary = excluded.summary,
        confidence = excluded.confidence,
        source = excluded.source,
        simulated = excluded.simulated,
        unverified = excluded.unverified,
        escalation_ready = excluded.escalation_ready,
        updated_at = excluded.updated_at,
        assigned_to = excluded.assigned_to,
        call_id = excluded.call_id,
        recording_reference = excluded.recording_reference,
        recording_available = excluded.recording_available,
        analysis_status = excluded.analysis_status,
        analysis_error = excluded.analysis_error,
        facts_json = excluded.facts_json,
        transcript_json = excluded.transcript_json,
        timeline_json = excluded.timeline_json,
        related_reports_json = excluded.related_reports_json`,
    )
    .bind(...incidentValues(incident));

  const statements: D1PreparedStatement[] = [
    upsert,
    db.prepare("DELETE FROM incident_facts WHERE incident_id = ?").bind(incident.id),
    db.prepare("DELETE FROM transcript_segments WHERE incident_id = ?").bind(incident.id),
    db.prepare("DELETE FROM timeline_entries WHERE incident_id = ?").bind(incident.id),
    db.prepare("DELETE FROM related_report_links WHERE incident_id = ?").bind(incident.id),
    ...incident.facts.map((item) =>
      db
        .prepare(
          `INSERT INTO incident_facts
            (id, incident_id, label, value, source, confidence, verified)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id,
          incident.id,
          item.label,
          item.value,
          item.source,
          item.confidence,
          item.verified ? 1 : 0,
        ),
    ),
    ...incident.transcript.map((item) =>
      db
        .prepare(
          `INSERT INTO transcript_segments
            (id, incident_id, speaker, text, at, source, confidence, revised, revision_of, source_event_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id,
          incident.id,
          item.speaker,
          item.text,
          item.at,
          item.source,
          item.confidence ?? null,
          item.revised ? 1 : 0,
          item.revisionOf || null,
          item.sourceEventId || null,
        ),
    ),
    ...incident.timeline.map((item) =>
      db
        .prepare(
          `INSERT INTO timeline_entries
            (id, incident_id, type, label, detail, at, actor, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id,
          incident.id,
          item.type,
          item.label,
          item.detail || null,
          item.at,
          item.actor,
          item.source,
        ),
    ),
    ...incident.relatedReports.flatMap((item) => [
      db
        .prepare(
          `INSERT OR IGNORE INTO reports
            (id, title, source, received_at, payload_json)
            VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          item.reportId,
          item.title,
          item.source,
          incident.updatedAt,
          JSON.stringify({ simulated: incident.simulated }),
        ),
      db
        .prepare(
          `INSERT INTO related_report_links
            (id, incident_id, report_id, title, confidence, status, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id,
          incident.id,
          item.reportId,
          item.title,
          item.confidence,
          item.status,
          item.source,
        ),
    ]),
  ];
  await db.batch(statements);
}

export async function listIncidents(
  env: SentinelEnv,
  filters: { severity?: string; category?: string; status?: string; search?: string } = {},
): Promise<Incident[]> {
  if (hasDatabase(env)) {
    try {
      const result = await env.DB.prepare(
        "SELECT * FROM incidents ORDER BY updated_at DESC",
      ).all<IncidentRow>();
      return result.results
        .map((row: IncidentRow) => rowToIncident(row))
        .filter((incident: Incident) => matchesFilters(incident, filters));
    } catch {
      // The local fallback supports signed local webhook testing without fixtures.
    }
  }

  return memoryIncidents.filter((incident) => matchesFilters(incident, filters)).map(clone);
}

function matchesFilters(
  incident: Incident,
  filters: { severity?: string; category?: string; status?: string; search?: string },
): boolean {
  if (filters.severity && incident.severity !== filters.severity) return false;
  if (filters.category && incident.category !== filters.category) return false;
  if (filters.status && incident.status !== filters.status) return false;
  if (filters.search) {
    const search = filters.search.toLowerCase();
    const haystack = [
      incident.title,
      incident.summary,
      incident.location.address,
      incident.type,
      incident.category,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

export async function getIncident(
  env: SentinelEnv,
  incidentId: string,
): Promise<Incident | null> {
  if (hasDatabase(env)) {
    try {
      const row = await env.DB
        .prepare("SELECT * FROM incidents WHERE id = ?")
        .bind(incidentId)
        .first<IncidentRow>();
      return row ? rowToIncident(row) : null;
    } catch {
      // Fall through to the in-memory development store.
    }
  }
  const incident = memoryIncidents.find((item) => item.id === incidentId);
  return incident ? clone(incident) : null;
}

export async function findIncidentByCallId(
  env: SentinelEnv,
  callId: string,
): Promise<Incident | null> {
  if (hasDatabase(env)) {
    try {
      const row = await env.DB
        .prepare("SELECT * FROM incidents WHERE call_id = ? LIMIT 1")
        .bind(callId)
        .first<IncidentRow>();
      return row ? rowToIncident(row) : null;
    } catch {
      // Fall through to memory.
    }
  }
  const incident = memoryIncidents.find((item) => item.callId === callId);
  return incident ? clone(incident) : null;
}

export async function saveIncident(env: SentinelEnv, incident: Incident): Promise<Incident> {
  const saved = clone(incident);
  const index = memoryIncidents.findIndex((item) => item.id === saved.id);
  if (index === -1) memoryIncidents.push(saved);
  else memoryIncidents[index] = saved;

  if (hasDatabase(env)) {
    try {
      await persistIncidentToD1(env.DB, saved);
    } catch {
      // A missing/unmigrated local D1 should not make the demo UI unusable.
    }
  }
  return clone(saved);
}

export async function recordOperatorAction(
  env: SentinelEnv,
  action: OperatorAction,
): Promise<void> {
  memoryActions.push(clone(action));
  if (hasDatabase(env)) {
    try {
      const statements = [
        env.DB
          .prepare(
            `INSERT INTO operator_actions
              (id, incident_id, action, actor, note, related_report_id, at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            action.id,
            action.incidentId,
            action.action,
            action.actor,
            action.note || null,
            action.relatedReportId || null,
            action.at,
          ),
      ];
      if (action.action === "assign" && action.assignee) {
        statements.push(
          env.DB
            .prepare(
              `INSERT INTO assignments
                (id, incident_id, assignee, assigned_by, assigned_at)
                VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(
              `${action.id}-assignment`,
              action.incidentId,
              action.assignee,
              action.actor,
              action.at,
            ),
        );
      }
      await env.DB.batch(statements);
    } catch {
      // Keep the local action in memory if the optional D1 binding is absent.
    }
  }
}

export async function claimEvent(env: SentinelEnv, eventId: string, eventJson: string): Promise<boolean> {
  if (memoryProcessedEvents.has(eventId)) return false;

  if (hasDatabase(env)) {
    try {
      const result = await env.DB
        .prepare(
          `INSERT OR IGNORE INTO processed_events (event_id, received_at, event_json)
           VALUES (?, ?, ?)`,
        )
        .bind(eventId, new Date().toISOString(), eventJson)
        .run();
      if (Number(result.meta.changes) === 0) {
        memoryProcessedEvents.add(eventId);
        return false;
      }
    } catch {
      // The in-memory set still provides idempotency during local development.
    }
  }

  memoryProcessedEvents.add(eventId);
  return true;
}

export function resetMemoryStore(): void {
  memoryIncidents = [];
  memoryActions = [];
  memoryProcessedEvents.clear();
}

export function getMemoryActions(): OperatorAction[] {
  return clone(memoryActions);
}
