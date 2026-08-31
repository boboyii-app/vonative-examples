import type { Incident, IncidentFilters, Severity } from "./types";

export function filterIncidents(
  incidents: Incident[],
  filters: IncidentFilters,
): Incident[] {
  const search = filters.search?.trim().toLowerCase();

  return incidents
    .filter((incident) => !filters.severity || incident.severity === filters.severity)
    .filter((incident) => !filters.category || incident.category === filters.category)
    .filter((incident) => !filters.status || incident.status === filters.status)
    .filter((incident) => {
      if (!search) return true;
      return [
        incident.title,
        incident.summary,
        incident.location.address,
        incident.type,
        incident.category,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((left, right) => {
      const severityRank: Record<Severity, number> = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      };
      const severityDifference =
        severityRank[right.severity] - severityRank[left.severity];
      if (severityDifference !== 0) return severityDifference;
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
}

export function calculateMetrics(incidents: Incident[]) {
  return {
    total: incidents.length,
    active: incidents.filter((incident) => incident.status !== "resolved").length,
    critical: incidents.filter((incident) => incident.severity === "critical").length,
    unassigned: incidents.filter(
      (incident) => !incident.assignedTo && incident.status !== "resolved",
    ).length,
  };
}
