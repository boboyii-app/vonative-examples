"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import type { Incident } from "@/lib/types";
import {
  CATEGORY_LABELS,
  DEFAULT_MAP_STYLE_URL,
  NIGERIA_BOUNDS,
  NIGERIA_CENTER,
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
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: styleUrl || defaultMapStyleUrl(),
      center: [NIGERIA_CENTER.longitude, NIGERIA_CENTER.latitude],
      zoom: 5.2,
      // Keep rendered map frames available to browser screenshots and embeds.
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapRef.current = map;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => map.resize());
    resizeObserver?.observe(container);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.once("load", () => {
      map.resize();
      // Keep the default view at a country-wide scale. A selected incident is
      // zoomed separately below, while the dashboard and map page stay focused
      // on Nigeria and show every mappable call location.
      map.fitBounds(NIGERIA_BOUNDS, {
        padding: 32,
        maxZoom: 5.8,
        duration: 0,
      });
      setMapError(false);
      setMapReady(true);
    });
    map.on("error", (event) => {
      // MapLibre also emits errors for individual source/tile requests. Those
      // should not hide an otherwise usable map; only a style-level error
      // before the map has loaded should activate the fallback message.
      const sourceEvent = event as unknown as { sourceId?: string; tile?: unknown };
      if (!map.isStyleLoaded() && !sourceEvent.sourceId && !sourceEvent.tile) {
        setMapError(true);
      }
    });

    return () => {
      resizeObserver?.disconnect();
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
          zoom: 14,
          duration: 500,
          essential: true,
        });
      }
    }
  }, [incidents, mapReady, onSelect, selectedIncidentId]);

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-container" aria-label="Incident map of Nigeria" />
      <div className="map-legend" aria-label="Incident severity legend">
        <strong>Call incidents</strong>
        <span><i className="legend-dot critical" />Critical</span>
        <span><i className="legend-dot high" />High</span>
        <span><i className="legend-dot medium" />Medium</span>
        <span><i className="legend-dot low" />Low</span>
      </div>
      {mapError ? (
        <div className="map-error map-error-overlay">
          <div>
            <strong>Map style unavailable</strong>
            <br />
            Confirm <code>NEXT_PUBLIC_MAP_STYLE_URL</code>; the incident feed remains available.
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
