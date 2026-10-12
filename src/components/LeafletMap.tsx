import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { IncidentReport } from '../types/report';

// Rizal Province default center (encompassing Sierra Madre, central corridor & Laguna de Bay shore)
const RIZAL_DEFAULT = { lat: 14.5800, lng: 121.2800 };

interface LeafletMapProps {
  mode: 'picker' | 'dashboard';
  center?: { lat: number; lng: number };
  zoom?: number;
  accuracyMeters?: number | null;
  onLocationChange?: (lat: number, lng: number) => void;
  reports?: IncidentReport[];
  selectedReportId?: string | null;
  onSelectReport?: (report: IncidentReport) => void;
  className?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  mode,
  center = RIZAL_DEFAULT,
  zoom = 11,
  accuracyMeters = null,
  onLocationChange,
  reports = [],
  selectedReportId = null,
  onSelectReport,
  className = 'h-72 w-full rounded-xl overflow-hidden shadow-inner',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const dashboardMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Rizal PG-ENRO',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Center & Zoom
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([center.lat, center.lng], zoom, {
      animate: true,
    });
  }, [center.lat, center.lng, zoom]);

  // Picker Mode: Draggable pin and accuracy circle
  useEffect(() => {
    if (mode !== 'picker' || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Draggable Pin Icon
    const pinIcon = L.divIcon({
      className: 'custom-picker-pin',
      html: `
        <div style="
          position: relative;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 24px;
            height: 24px;
            background: #047857;
            border: 3px solid white;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          "></div>
          <div style="
            position: absolute;
            width: 8px;
            height: 8px;
            background: #facc15;
            border-radius: 50%;
            top: 10px;
          "></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    if (!pickerMarkerRef.current) {
      const marker = L.marker([center.lat, center.lng], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (onLocationChange) {
          onLocationChange(pos.lat, pos.lng);
        }
      });

      pickerMarkerRef.current = marker;
    } else {
      pickerMarkerRef.current.setLatLng([center.lat, center.lng]);
    }

    // Accuracy Circle
    if (accuracyMeters && accuracyMeters > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle([center.lat, center.lng], {
          radius: Math.min(accuracyMeters, 500),
          color: '#10b981',
          fillColor: '#34d399',
          fillOpacity: 0.15,
          weight: 1.5,
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng([center.lat, center.lng]);
        accuracyCircleRef.current.setRadius(Math.min(accuracyMeters, 500));
      }
    } else if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }
  }, [mode, center.lat, center.lng, accuracyMeters, onLocationChange]);

  // Dashboard Mode: Severity colored pins & duplicate cluster counts
  useEffect(() => {
    if (mode !== 'dashboard' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear old markers
    dashboardMarkersRef.current.forEach((m) => m.remove());
    dashboardMarkersRef.current.clear();

    // Group duplicate clusters
    const clusterCounts = new Map<string, number>();
    reports.forEach((r) => {
      if (r.duplicateClusterId) {
        clusterCounts.set(r.duplicateClusterId, (clusterCounts.get(r.duplicateClusterId) || 0) + 1);
      }
    });

    reports.forEach((report) => {
      const activeSeverity = report.final?.severity || report.aiTriage?.severity || 3;
      const isSelected = report.id === selectedReportId;
      const clusterCount = report.duplicateClusterId ? clusterCounts.get(report.duplicateClusterId) || 1 : 1;

      // Color mapping
      let color = '#3b82f6'; // 2: Blue
      if (activeSeverity === 1) color = '#10b981'; // 1: Green
      if (activeSeverity === 3) color = '#eab308'; // 3: Yellow
      if (activeSeverity === 4) color = '#f97316'; // 4: Orange
      if (activeSeverity === 5) color = '#ef4444'; // 5: Red

      const iconHtml = `
        <div style="
          position: relative;
          cursor: pointer;
          transform: ${isSelected ? 'scale(1.25)' : 'scale(1)'};
          transition: transform 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${
            activeSeverity >= 4
              ? `<div style="
                  position: absolute;
                  width: 36px;
                  height: 36px;
                  border-radius: 50%;
                  background: ${color};
                  opacity: 0.35;
                  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
                "></div>`
              : ''
          }
          <div style="
            width: ${isSelected ? '32px' : '26px'};
            height: ${isSelected ? '32px' : '26px'};
            background: ${color};
            border: 2.5px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: ${isSelected ? '13px' : '11px'};
            font-weight: 800;
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          ">
            ${activeSeverity}
          </div>
          ${
            clusterCount > 1
              ? `<span style="
                  position: absolute;
                  top: -6px;
                  right: -6px;
                  background: #1e293b;
                  color: #38bdf8;
                  font-size: 10px;
                  font-weight: bold;
                  padding: 1px 4px;
                  border-radius: 8px;
                  border: 1px solid #64748b;
                ">+${clusterCount}</span>`
              : ''
          }
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-severity-marker',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([report.location.lat, report.location.lng], {
        icon: markerIcon,
      }).addTo(map);

      // Popup
      const statusBadge =
        report.status === 'resolved'
          ? '<span style="color:#059669; font-weight:bold;">RESOLVED</span>'
          : report.status === 'in_progress'
          ? '<span style="color:#d97706; font-weight:bold;">IN PROGRESS</span>'
          : '<span style="color:#dc2626; font-weight:bold;">PENDING</span>';

      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; max-width: 200px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong>${report.referenceCode}</strong>
            ${statusBadge}
          </div>
          <div style="margin-bottom: 4px; color: #475569;">
            ${[report.location.barangay, report.location.municipality || 'Rizal'].filter(Boolean).join(', ')}
          </div>
          <div style="font-size: 11px; color: #1e293b; margin-bottom: 6px;">
            ${report.aiTriage?.summary || report.rawInput.description.slice(0, 70)}...
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight:bold; color:${color}">Severity ${activeSeverity}/5</span>
            <span style="font-size: 10px; color: #64748b;">Click to inspect</span>
          </div>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectReport) {
          onSelectReport(report);
        }
      });

      dashboardMarkersRef.current.set(report.id, marker);
    });
  }, [mode, reports, selectedReportId, onSelectReport]);

  return <div ref={mapContainerRef} className={`relative isolate z-0 ${className || ''}`} />;
};
