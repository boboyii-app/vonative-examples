"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import type { Incident } from "@/lib/types";
import {
  ABUJA_CENTER,
  CATEGORY_LABELS,
  DEFAULT_MAP_STYLE_URL,
  SEVERITY_LABELS,
  TYPE_LABELS,
} from "@/lib/constants";

interface IncidentMapProps {
  incidents: Incident[];
  selectedIncidentId: string | null;
  onSelect: (incidentId: string) => void;
  styleUrl?: string;
}

function hasMapLocation(incident: Incident): incident is Incident & { location: Incident["location"] & { latitude: number; longitude: number } } {
  return (incident.location.geocodingStatus === "matched" || incident.location.geocodingStatus === "verified") &&
    typeof incident.location.latitude === "number" && Number.isFinite(incident.location.latitude) &&
    typeof incident.location.longitude === "number" && Number.isFinite(incident.location.longitude);
}

function defaultMapStyleUrl(): string {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;
}

export function IncidentMap({ incidents, selectedIncidentId, onSelect, styleUrl }: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl || defaultMapStyleUrl(),
      center: [ABUJA_CENTER.longitude, ABUJA_CENTER.latitude],
      zoom: 10.2,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.once("load", () => setMapReady(true));
    map.on("error", () => setMapError(true));

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());

    markersRef.current = incidents.filter(hasMapLocation).map((incident) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `map-marker ${incident.severity}${incident.id === selectedIncidentId ? " selected" : ""}`;
      element.setAttribute("aria-label", `Select ${incident.title}`);
      element.innerHTML = `<span class="map-marker-pulse"></span><span class="map-marker-core"></span>`;
      element.addEventListener("click", () => onSelect(incident.id));

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<strong>${escapeHtml(incident.title)}</strong><br /><span>${escapeHtml(incident.location.address)}</span><br /><small>${SEVERITY_LABELS[incident.severity]} · ${CATEGORY_LABELS[incident.category]} · ${TYPE_LABELS[incident.type]}</small>`,
      );
      return new maplibregl.Marker({ element })
        .setLngLat([incident.location.longitude!, incident.location.latitude!])
        .setPopup(popup)
        .addTo(map);
    });

    if (selectedIncidentId) {
      const selected = incidents.find((incident) => incident.id === selectedIncidentId && hasMapLocation(incident));
      if (selected) {
        map.flyTo({
          center: [selected.location.longitude!, selected.location.latitude!],
          duration: 500,
          essential: true,
        });
      }
    }
  }, [incidents, mapReady, onSelect, selectedIncidentId]);

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-container" aria-label="Incident map of Abuja" />
      {mapError ? (
        <div className="map-error map-error-overlay">
          <div>
            <strong>Map tiles unavailable</strong>
            <br />
            Confirm <code>NEXT_PUBLIC_MAP_STYLE_URL</code> or use the incident feed.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] || character;
  });
}
