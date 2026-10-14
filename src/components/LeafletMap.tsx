import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { IncidentReport } from '../types/report';
import { resolveReportCoordinates } from '../lib/barangayCoordinates';
import {
  fetchRizalMunicipalitiesGeoJSON,
  fetchRizalInvertedMaskGeoJSON,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  MunicipalityFeatureProperties,
  getChoroplethStyle,
} from '../lib/geojsonService';

// Rizal Province default center (encompassing Sierra Madre, central corridor & Laguna de Bay shore)
const RIZAL_DEFAULT = { lat: 14.5800, lng: 121.2800 };

export type MapLayerMode = 'standard' | 'boundaries' | 'choropleth';

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
  // GeoJSON enhancement props
  layerMode?: MapLayerMode;
  activeMunicipality?: string | null;
  onMunicipalityClick?: (municipalityName: string) => void;
  choroplethCounts?: Record<string, number>;
  maskNonRizal?: boolean;
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
  layerMode = 'standard',
  activeMunicipality = null,
  onMunicipalityClick,
  choroplethCounts = {},
  maskNonRizal,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const dashboardMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const maskLayerRef = useRef<L.GeoJSON | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<GeoJSONFeatureCollection<MunicipalityFeatureProperties> | null>(null);
  const [maskData, setMaskData] = useState<GeoJSONFeature | null>(null);

  const shouldMask = maskNonRizal !== undefined ? maskNonRizal : mode === 'dashboard';

  // Load GeoJSON municipality data once
  useEffect(() => {
    let isMounted = true;
    fetchRizalMunicipalitiesGeoJSON()
      .then((data) => {
        if (isMounted) setGeoJsonData(data);
      })
      .catch((err) => console.warn('[LeafletMap] GeoJSON load error:', err));
    return () => {
      isMounted = false;
    };
  }, []);

  // Load Inverted Non-Rizal Mask GeoJSON once
  useEffect(() => {
    let isMounted = true;
    fetchRizalInvertedMaskGeoJSON()
      .then((data) => {
        if (isMounted) setMaskData(data);
      })
      .catch((err) => console.warn('[LeafletMap] Inverted mask load error:', err));
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">Humanitarian OpenStreetMap Team</a> hosted by <a href="https://openstreetmap.fr/" target="_blank" rel="noopener noreferrer">OpenStreetMap France</a> | PG-ENRO Rizal',
      maxZoom: 19,
    }).addTo(map);

    // Dedicated non-Rizal mask pane: above base tiles (zIndex: 200), below vectors (zIndex: 400)
    const maskPane = map.createPane('maskPane');
    maskPane.style.zIndex = '350';
    maskPane.style.pointerEvents = 'none';

    mapInstanceRef.current = map;

    // Automatically recalculate Leaflet tiles on container size changes
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Non-Rizal Inverted Mask Rendering & Toggling
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clean up prior mask layer
    if (maskLayerRef.current) {
      maskLayerRef.current.remove();
      maskLayerRef.current = null;
    }

    if (!shouldMask || !maskData) return;

    const layer = L.geoJSON(maskData as any, {
      pane: 'maskPane',
      interactive: false,
      style: {
        fillColor: '#070a0eff',
        fillOpacity: 0.6,
        color: '#047857',
        weight: 2,
        opacity: 1,
      },
    }).addTo(map);

    maskLayerRef.current = layer;

    return () => {
      if (maskLayerRef.current) {
        maskLayerRef.current.remove();
        maskLayerRef.current = null;
      }
    };
  }, [shouldMask, maskData]);

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

    // Tactical Field Pin Icon
    const pinIcon = L.divIcon({
      className: 'custom-picker-pin',
      html: `
        <div style="
          position: relative;
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 26px;
            height: 26px;
            background: #1c382c;
            border: 2.5px solid #ffffff;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 12px rgba(14, 32, 25, 0.45);
          "></div>
          <div style="
            position: absolute;
            width: 8px;
            height: 8px;
            background: #facc15;
            border: 1.5px solid #0e2019;
            border-radius: 50%;
            top: 10px;
          "></div>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
    });

    if (!pickerMarkerRef.current) {
      const marker = L.marker([center.lat, center.lng], {
        draggable: true,
        icon: pinIcon,
        pane: 'markerPane',
        zIndexOffset: 1000,
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

    // Map click-to-pin listener
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (pickerMarkerRef.current) {
        pickerMarkerRef.current.setLatLng([lat, lng]);
      }
      if (onLocationChange) {
        onLocationChange(lat, lng);
      }
    };
    map.on('click', handleMapClick);

    // Accuracy Circle with subtle tactical dashed boundary
    if (accuracyMeters && accuracyMeters > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle([center.lat, center.lng], {
          radius: Math.min(accuracyMeters, 500),
          color: '#1c382c',
          fillColor: '#2a5342',
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: '3, 4',
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng([center.lat, center.lng]);
        accuracyCircleRef.current.setRadius(Math.min(accuracyMeters, 500));
      }
    } else if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }

    return () => {
      map.off('click', handleMapClick);
    };
  }, [mode, center.lat, center.lng, accuracyMeters, onLocationChange]);

  // GeoJSON Layer Rendering (Boundaries & Choropleth)
  useEffect(() => {
    if (!mapInstanceRef.current || !geoJsonData) return;
    const map = mapInstanceRef.current;

    // Clean up prior geojson layer
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
      geoJsonLayerRef.current = null;
    }

    // If layerMode is 'standard' and no activeMunicipality in picker, do not render full polygons
    if (layerMode === 'standard' && (!activeMunicipality || activeMunicipality === 'all')) {
      return;
    }

    function isMunMatch(a?: string | null, b?: string | null): boolean {
      if (!a || !b) return false;
      if (a === b) return true;
      const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
    }

    function getMunCount(name: string, counts: Record<string, number>): number {
      if (counts[name] !== undefined) return counts[name];
      for (const [key, val] of Object.entries(counts)) {
        if (isMunMatch(name, key)) return val;
      }
      return 0;
    }

    // Compute max incident count for choropleth normalizing
    const counts = Object.values(choroplethCounts);
    const maxCount = counts.length > 0 ? Math.max(...counts, 1) : 1;

    let targetBoundsLayer: L.Layer | null = null;

    const layer = L.geoJSON(geoJsonData as any, {
      style: (feature: any) => {
        const name = feature?.properties?.name;
        const isActive = isMunMatch(activeMunicipality, name);

        if (layerMode === 'choropleth') {
          const munCount = getMunCount(name, choroplethCounts);
          const choropleth = getChoroplethStyle(munCount, maxCount, isActive);
          if (isActive) {
            return {
              ...choropleth,
              weight: 3,
              color: '#0e2019',
              fillOpacity: Math.min(choropleth.fillOpacity + 0.25, 0.9),
            };
          }
          return choropleth;
        }

        // Boundaries mode or active single municipality outline
        if (isActive) {
          return {
            color: '#1c382c',
            weight: 3,
            fillColor: '#2a5342',
            fillOpacity: 0.18,
            dashArray: undefined,
          };
        }

        return {
          color: '#2a5342',
          weight: 1.5,
          fillColor: '#2a5342',
          fillOpacity: 0.04,
          dashArray: '4, 4',
        };
      },
      onEachFeature: (feature: any, featureLayer: L.Layer) => {
        const name = feature?.properties?.name || 'LGU';
        const munCount = getMunCount(name, choroplethCounts);

        if (isMunMatch(activeMunicipality, name)) {
          targetBoundsLayer = featureLayer;
        }

        // Tooltip
        const tooltipHtml =
          layerMode === 'choropleth'
            ? `<div style="font-family: system-ui, sans-serif;">
                <div style="font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #f8fafc;">${name}</div>
                <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">${munCount} active report${munCount === 1 ? '' : 's'}</div>
              </div>`
            : `<div style="font-family: system-ui, sans-serif; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">${name}</div>`;

        featureLayer.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'auto',
          className: 'tactical-map-tooltip',
        });

        // Hover & Click listeners
        const pathLayer = featureLayer as L.Path;
        pathLayer.on('mouseover', () => {
          if (layerMode === 'choropleth') {
            const munStyle = getChoroplethStyle(munCount, maxCount, true);
            pathLayer.setStyle(munStyle);
          } else {
            pathLayer.setStyle({
              weight: 2.5,
              color: '#1c382c',
              fillOpacity: 0.15,
            });
          }
        });

        pathLayer.on('mouseout', () => {
          layer.resetStyle(pathLayer);
        });

        pathLayer.on('click', (e: L.LeafletMouseEvent) => {
          if (mode === 'picker' && onLocationChange) {
            onLocationChange(e.latlng.lat, e.latlng.lng);
          }
          if (onMunicipalityClick) {
            onMunicipalityClick(name);
          }
        });
      },
    }).addTo(map);

    geoJsonLayerRef.current = layer;

    // Zoom/fit camera if active municipality was targeted
    if (targetBoundsLayer && typeof (targetBoundsLayer as any).getBounds === 'function') {
      try {
        const bounds = (targetBoundsLayer as any).getBounds();
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14, animate: true });
      } catch (err) {
        console.warn('[LeafletMap] fitBounds error:', err);
      }
    }

    return () => {
      if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.remove();
        geoJsonLayerRef.current = null;
      }
    };
  }, [geoJsonData, layerMode, activeMunicipality, choroplethCounts, onMunicipalityClick]);

  // Dashboard Mode: Severity colored dots & "how many" count clusters
  useEffect(() => {
    if (mode !== 'dashboard' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear old markers
    dashboardMarkersRef.current.forEach((m) => m.remove());
    dashboardMarkersRef.current.clear();

    // Group reports by resolved coordinates / barangay
    interface MarkerGroup {
      key: string;
      lat: number;
      lng: number;
      reports: IncidentReport[];
      maxSeverity: number;
      hasSelected: boolean;
      municipality?: string;
      barangay?: string;
    }

    const groups = new Map<string, MarkerGroup>();

    reports.forEach((report) => {
      const coords = resolveReportCoordinates(report);
      // Group by coordinate proximity (~11m precision)
      const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
      const activeSeverity = report.final?.severity || report.aiTriage?.severity || 3;
      const isSelected = report.id === selectedReportId;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          lat: coords.lat,
          lng: coords.lng,
          reports: [report],
          maxSeverity: activeSeverity,
          hasSelected: isSelected,
          municipality: report.location.municipality,
          barangay: report.location.barangay,
        });
      } else {
        const group = groups.get(key)!;
        group.reports.push(report);
        if (activeSeverity > group.maxSeverity) {
          group.maxSeverity = activeSeverity;
        }
        if (isSelected) {
          group.hasSelected = true;
        }
        if (!group.barangay && report.location.barangay) {
          group.barangay = report.location.barangay;
        }
      }
    });

    // Render markers for each group
    groups.forEach((group) => {
      const isSelected = group.hasSelected;
      const count = group.reports.length;
      const isCluster = count > 1;

      // Color based on maximum severity
      let color = '#244460'; // 2: Laguna Lake Navy
      if (group.maxSeverity === 1) color = '#2a5342'; // 1: Tagapo Forest Green
      if (group.maxSeverity === 3) color = '#d97706'; // 3: Amber
      if (group.maxSeverity === 4) color = '#ea580c'; // 4: Tactical Orange
      if (group.maxSeverity === 5) color = '#dc2626'; // 5: Critical Crimson

      // Size calculation
      const baseSize = isCluster ? (count >= 10 ? 34 : 28) : 22;
      const dotSize = isSelected ? baseSize + 6 : baseSize;
      const pulseSize = dotSize + 14;

      const iconHtml = `
        <div style="
          position: relative;
          cursor: pointer;
          transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${group.maxSeverity >= 4
          ? `<div style="
                  position: absolute;
                  width: ${pulseSize}px;
                  height: ${pulseSize}px;
                  border-radius: 50%;
                  background: ${color};
                  opacity: 0.38;
                  animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
                "></div>`
          : ''
        }
          <div style="
            width: ${dotSize}px;
            height: ${dotSize}px;
            background: ${color};
            border: ${isSelected ? '3px solid #ffffff' : '2px solid #ffffff'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: ${isSelected ? '12px' : '11px'};
            font-weight: 800;
            box-shadow: ${isSelected ? '0 0 0 2px #0e2019, 0 6px 14px rgba(0,0,0,0.45)' : '0 3px 8px rgba(0,0,0,0.35)'};
          ">
            ${isCluster ? count : ''}
          </div>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-severity-marker',
        html: iconHtml,
        iconSize: [dotSize, dotSize],
        iconAnchor: [dotSize / 2, dotSize / 2],
      });

      const marker = L.marker([group.lat, group.lng], {
        icon: markerIcon,
        pane: 'markerPane',
        zIndexOffset: isSelected ? 2000 : 1000,
      }).addTo(map);

      // Popup Content
      const locationLabel = [group.barangay, group.municipality || 'Rizal'].filter(Boolean).join(', ');

      if (!isCluster) {
        const report = group.reports[0];
        const statusBadge =
          report.status === 'resolved'
            ? '<span style="color:#059669; font-weight:bold; font-size:10px;">RESOLVED</span>'
            : report.status === 'in_progress'
              ? '<span style="color:#d97706; font-weight:bold; font-size:10px;">IN PROGRESS</span>'
              : '<span style="color:#dc2626; font-weight:bold; font-size:10px;">PENDING</span>';

        marker.bindPopup(`
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4; max-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;">
              <strong style="font-family: monospace; font-size: 13px;">${report.referenceCode}</strong>
              ${statusBadge}
            </div>
            <div style="margin-bottom: 5px; color: #64748b; font-size: 11px;">
              📍 ${locationLabel}
            </div>
            <div style="font-size: 11px; color: #1e293b; margin-bottom: 6px;">
              ${report.aiTriage?.summary || report.rawInput.description.slice(0, 80)}...
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px;">
              <span style="font-weight:bold; color:${color}; font-size:11px;">Severity ${group.maxSeverity}/5</span>
              <span style="font-size: 10px; color: #64748b;">Click to inspect</span>
            </div>
          </div>
        `);
      } else {
        // Multi-incident cluster popup
        const reportItems = group.reports
          .slice(0, 5)
          .map((r) => {
            const rSev = r.final?.severity || r.aiTriage?.severity || 3;
            let rColor = '#244460';
            if (rSev === 1) rColor = '#2a5342';
            if (rSev === 3) rColor = '#d97706';
            if (rSev === 4) rColor = '#ea580c';
            if (rSev === 5) rColor = '#dc2626';

            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
                <span style="font-family: monospace; font-weight: 700;">${r.referenceCode}</span>
                <span style="color: ${rColor}; font-weight: 800; font-size: 10px;">Sev ${rSev}</span>
              </div>
            `;
          })
          .join('');

        const extraCount = group.reports.length > 5 ? `<div style="font-size: 10px; color: #64748b; text-align: center; margin-top: 2px;">+${group.reports.length - 5} more incidents</div>` : '';

        marker.bindPopup(`
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4; max-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <strong style="color: #0f172a; font-size: 13px;">${count} Incidents</strong>
              <span style="font-weight: 800; color: ${color}; font-size: 11px;">Max Sev ${group.maxSeverity}</span>
            </div>
            <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
              📍 ${locationLabel}
            </div>
            <div style="margin-bottom: 4px;">
              ${reportItems}
              ${extraCount}
            </div>
            <div style="font-size: 10px; color: #64748b; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 3px;">
              Click dot to open dossier
            </div>
          </div>
        `);
      }

      marker.on('click', () => {
        if (onSelectReport) {
          const targetReport =
            group.reports.find((r) => r.id === selectedReportId) ||
            group.reports.reduce((prev, curr) => {
              const prevSev = prev.final?.severity || prev.aiTriage?.severity || 3;
              const currSev = curr.final?.severity || curr.aiTriage?.severity || 3;
              return currSev > prevSev ? curr : prev;
            }, group.reports[0]);

          onSelectReport(targetReport);
        }
      });

      // Map references for tracking
      group.reports.forEach((r) => {
        dashboardMarkersRef.current.set(r.id, marker);
      });
    });
  }, [mode, reports, selectedReportId, onSelectReport]);

  return <div ref={mapContainerRef} className={`relative isolate z-0 ${className || ''}`} />;
};
