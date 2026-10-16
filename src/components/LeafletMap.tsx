import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { IncidentReport } from '../types/report';
import { resolveReportCoordinates } from '../lib/barangayCoordinates';
import {
  fetchRizalMunicipalitiesGeoJSON,
  fetchRizalInvertedMaskGeoJSON,
  fetchProtectedZonesInvertedMaskGeoJSON,
  fetchRizalProtectedZonesGeoJSON,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  MunicipalityFeatureProperties,
  ProtectedZoneFeatureProperties,
  MgbQuarryFeatureProperties,
  fetchRizalMgbQuarriesGeoJSON,
  getChoroplethStyle,
} from '../lib/geojsonService';

// Rizal Province default center (encompassing Sierra Madre, central corridor & Laguna de Bay shore)
export const RIZAL_DEFAULT = { lat: 14.5800, lng: 121.2800 };

// Exact bounding box of Rizal Province [SW, NE] encompassing all 14 LGUs and Laguna de Bay islands
export const RIZAL_PROVINCE_BOUNDS: [[number, number], [number, number]] = [
  [14.27838, 121.09595], // SW (Jalajala in Laguna de Bay)
  [14.83480, 121.45105], // NE (Sierra Madre / Rodriguez / Tanay)
];

// Exact territorial bounds of the Philippines archipelago [SW, NE]
export const PHILIPPINES_BOUNDS: [[number, number], [number, number]] = [
  [4.5, 116.0],  // South-West (Tawi-Tawi / Celebes Sea border)
  [21.5, 127.0], // North-East (Batanes / Babuyan / Philippine Sea)
];

export type MapLayerMode = 'standard' | 'boundaries' | 'choropleth' | 'protected_zones';
export type BasemapMode = 'street' | 'satellite' | 'terrain';

export const BASEMAP_CONFIGS: Record<BasemapMode, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
  street: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom | PG-ENRO Rizal',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community | PG-ENRO Rizal',
    maxZoom: 19,
  },
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community | PG-ENRO Rizal',
    maxZoom: 18,
  },
};

interface LeafletMapProps {
  mode: 'picker' | 'dashboard';
  center?: { lat: number; lng: number };
  zoom?: number;
  accuracyMeters?: number | null;
  onLocationChange?: (lat: number, lng: number) => void;
  reports?: IncidentReport[];
  selectedReportId?: string | null;
  onSelectReport?: (report: IncidentReport) => void;
  onClusterClick?: (group: {
    reports: IncidentReport[];
    municipality?: string;
    barangay?: string;
    lat: number;
    lng: number;
  }) => void;
  className?: string;
  // GeoJSON enhancement props
  layerMode?: MapLayerMode;
  basemap?: BasemapMode;
  activeMunicipality?: string | null;
  onMunicipalityClick?: (municipalityName: string) => void;
  choroplethCounts?: Record<string, number>;
  maskNonRizal?: boolean;
  fitProvinceKey?: number | string;
  showProtectedZones?: boolean;
  onSelectProtectedZone?: (zoneId: string) => void;
  showMgbQuarries?: boolean;
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
  onClusterClick,
  className = 'h-72 w-full rounded-xl overflow-hidden shadow-inner',
  layerMode = 'standard',
  basemap = 'street',
  activeMunicipality = null,
  onMunicipalityClick,
  choroplethCounts = {},
  maskNonRizal,
  fitProvinceKey,
  showProtectedZones = true,
  onSelectProtectedZone,
  showMgbQuarries = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const pickerMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const dashboardMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const maskLayerRef = useRef<L.GeoJSON | null>(null);
  const protectedZonesLayerRef = useRef<L.GeoJSON | null>(null);
  const mgbQuarriesLayerRef = useRef<L.GeoJSON | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<GeoJSONFeatureCollection<MunicipalityFeatureProperties> | null>(null);
  const [maskData, setMaskData] = useState<GeoJSONFeature | null>(null);
  const [protectedMaskData, setProtectedMaskData] = useState<GeoJSONFeature | null>(null);
  const [protectedZonesData, setProtectedZonesData] = useState<GeoJSONFeatureCollection<ProtectedZoneFeatureProperties> | null>(null);
  const [mgbQuarriesData, setMgbQuarriesData] = useState<GeoJSONFeatureCollection<MgbQuarryFeatureProperties> | null>(null);

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

  // Load MGB Permitted Quarries GeoJSON once
  useEffect(() => {
    let isMounted = true;
    fetchRizalMgbQuarriesGeoJSON()
      .then((data) => {
        if (isMounted) setMgbQuarriesData(data);
      })
      .catch((err) => console.warn('[LeafletMap] MGB Quarries GeoJSON load error:', err));
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

  // Load Curated Protected Ecological Zones GeoJSON once
  useEffect(() => {
    let isMounted = true;
    fetchRizalProtectedZonesGeoJSON()
      .then((data) => {
        if (isMounted) setProtectedZonesData(data);
      })
      .catch((err) => console.warn('[LeafletMap] Protected zones GeoJSON load error:', err));
    return () => {
      isMounted = false;
    };
  }, []);

  // Load Inverted Protected Zones Mask GeoJSON once
  useEffect(() => {
    let isMounted = true;
    fetchProtectedZonesInvertedMaskGeoJSON()
      .then((data) => {
        if (isMounted) setProtectedMaskData(data);
      })
      .catch((err) => console.warn('[LeafletMap] Protected zones mask load error:', err));
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
      zoomSnap: 0.5,                 // Fractional zoom levels for smooth, non-jarring transitions
      zoomDelta: 0.5,                // +/- zoom buttons step in 0.5 increments
      wheelPxPerZoomLevel: 140,      // 2.3x lower wheel sensitivity (default: 60) for calm scrolling
      wheelDebounceTime: 60,         // Dampens high-frequency trackpad bursts (default: 40ms)
      minZoom: 5.5,                  // Restricts zoom-out strictly to the Philippines archipelago
      maxZoom: 18,
      maxBounds: PHILIPPINES_BOUNDS, // Strictly un-navigable to other countries
      maxBoundsViscosity: 1.0,       // 100% solid barrier: impossible to drag outside the Philippines
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Dedicated non-Rizal mask pane: above base tiles (zIndex: 200), below vectors (zIndex: 400)
    const maskPane = map.createPane('maskPane');
    maskPane.style.zIndex = '350';
    maskPane.style.pointerEvents = 'none';

    mapInstanceRef.current = map;

    // In dashboard mode, frame all of Rizal Province on initial mount if not focused on a report/LGU
    if (mode === 'dashboard' && !selectedReportId && (!activeMunicipality || activeMunicipality === 'all')) {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
          mapInstanceRef.current.fitBounds(RIZAL_PROVINCE_BOUNDS, {
            padding: [28, 28],
            animate: false,
          });
        }
      }, 40);
    }

    // Automatically recalculate Leaflet tiles on container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Dynamic Basemap Switcher (Street / Satellite / Terrain)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const config = BASEMAP_CONFIGS[basemap] || BASEMAP_CONFIGS.street;

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const layer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
      subdomains: config.subdomains || 'abc',
    }).addTo(mapInstanceRef.current);

    layer.bringToBack();
    tileLayerRef.current = layer;
  }, [basemap]);

  // Frame full Rizal Province when fitProvinceKey changes
  useEffect(() => {
    if (!mapInstanceRef.current || mode !== 'dashboard') return;
    if (selectedReportId || (activeMunicipality && activeMunicipality !== 'all')) return;

    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.fitBounds(RIZAL_PROVINCE_BOUNDS, {
          padding: [28, 28],
          animate: true,
        });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [fitProvinceKey, mode, selectedReportId, activeMunicipality]);

  // Inverted Mask Rendering & Toggling (Supports both Provincial Mask and Protected Zones Dimming Mask)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clean up prior mask layer
    if (maskLayerRef.current) {
      maskLayerRef.current.remove();
      maskLayerRef.current = null;
    }

    // In 'protected_zones' mode: dim all surrounding terrain except the protected zones
    if (layerMode === 'protected_zones') {
      if (!shouldMask || !protectedMaskData) return;

      const layer = L.geoJSON(protectedMaskData as any, {
        pane: 'maskPane',
        interactive: false,
        style: {
          className: 'protected-zones-dim-mask',
          fillColor: '#0b1613', // Deep moody forest night tint to spotlight sanctuaries
          fillOpacity: 0.65,    // Distinct spotlight effect that keeps base geography legible
          stroke: false,        // Let protectedZonesLayer draw the distinct boundary borders
        },
      }).addTo(map);

      maskLayerRef.current = layer;

      return () => {
        if (maskLayerRef.current) {
          maskLayerRef.current.remove();
          maskLayerRef.current = null;
        }
      };
    }

    // Standard / Boundaries / Choropleth modes: apply non-Rizal provincial mask when enabled
    if (!shouldMask || !maskData) return;

    const layer = L.geoJSON(maskData as any, {
      pane: 'maskPane',
      interactive: false,
      style: {
        className: 'non-rizal-jurisdiction-mask',
        fillColor: '#54473b', // Warm earthy brownish-stone indicating non-clickable reference land
        fillOpacity: 0.52,    // Balanced opacity to eliminate gray-washout
        color: '#15803d',     // Crisp emerald provincial boundary line
        weight: 2,
        opacity: 0.95,
      },
    }).addTo(map);

    maskLayerRef.current = layer;

    return () => {
      if (maskLayerRef.current) {
        maskLayerRef.current.remove();
        maskLayerRef.current = null;
      }
    };
  }, [layerMode, shouldMask, maskData, protectedMaskData]);

  // Protected Ecological Zones Vector Layer Rendering
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (protectedZonesLayerRef.current) {
      protectedZonesLayerRef.current.remove();
      protectedZonesLayerRef.current = null;
    }

    // Strictly mutually exclusive: only render when layerMode is 'protected_zones'
    if (layerMode !== 'protected_zones' || !protectedZonesData) return;

    const layer = L.geoJSON(protectedZonesData as any, {
      style: (feature: any) => {
        const props = feature?.properties;
        const cat = props?.category;
        let dashArray = '5, 5';
        let weight = 2;
        let fillOpacity = 0.16;

        if (cat === 'nipas') {
          dashArray = '6, 4';
          weight = 2.5;
          fillOpacity = 0.18;
        } else if (cat === 'llda_zomap') {
          dashArray = '4, 4';
          weight = 2;
          fillOpacity = 0.22;
        } else if (cat === 'kba_georeserve') {
          dashArray = '5, 3';
          weight = 2.2;
          fillOpacity = 0.18;
        } else {
          dashArray = '4, 4';
          weight = 1.8;
          fillOpacity = 0.16;
        }

        return {
          color: props?.strokeColor || '#059669',
          weight,
          fillColor: props?.fillColor || '#10b981',
          fillOpacity,
          dashArray,
        };
      },
      onEachFeature: (feature: any, featureLayer: L.Layer) => {
        const props = feature?.properties || {};
        const title = props.shortName || props.name || 'Protected Zone';
        const type = String(props.type || 'Sanctuary').toUpperCase().replace(/_/g, ' ');
        const mun = props.municipality || 'Rizal';
        const legal = props.legalBasis ? `<div style="font-size: 9px; color: #a1a1aa; margin-top: 2px;">⚖️ ${props.legalBasis}</div>` : '';

        let catBadge = '🛡️ DENR-NIPAS';
        if (props.category === 'llda_zomap') catBadge = '🌊 LLDA ZOMAP';
        else if (props.category === 'kba_georeserve') catBadge = '🌲 KEY BIODIVERSITY / GEORESERVE';
        else if (props.category === 'local_mountain') catBadge = '⛰️ LOCAL MOUNTAIN WATERSHED';

        const tooltipHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 190px; max-width: 260px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${props.strokeColor || '#059669'};">
                ${catBadge}
              </span>
              <span style="font-size: 8px; font-family: monospace; background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; color: #cbd5e1;">
                ${type}
              </span>
            </div>
            <div style="font-weight: 700; font-size: 11.5px; color: #f8fafc; line-height: 1.25;">
              ${title}
            </div>
            <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
              📍 ${mun}
            </div>
            ${legal}
          </div>
        `;

        featureLayer.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'auto',
          className: 'tactical-map-tooltip',
        });

        const pathLayer = featureLayer as L.Path;
        pathLayer.on('mouseover', () => {
          pathLayer.setStyle({
            weight: 3.5,
            fillOpacity: 0.32,
          });
        });

        pathLayer.on('mouseout', () => {
          pathLayer.setStyle({
            weight: props.category === 'nipas' ? 2.5 : 2,
            fillOpacity: props.category === 'llda_zomap' ? 0.22 : 0.16,
          });
        });

        pathLayer.on('click', () => {
          try {
            const bounds = (pathLayer as any).getBounds?.();
            if (bounds && map) {
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
            }
          } catch (e) {
            // Safe fallback
          }
          const zoneId = props.id || feature.id;
          if (zoneId && onSelectProtectedZone) {
            onSelectProtectedZone(String(zoneId));
          }
        });
      },
    }).addTo(map);

    protectedZonesLayerRef.current = layer;

    return () => {
      if (protectedZonesLayerRef.current) {
        protectedZonesLayerRef.current.remove();
        protectedZonesLayerRef.current = null;
      }
    };
  }, [layerMode, protectedZonesData]);

  // MGB Permitted Quarries Vector Layer Rendering
  useEffect(() => {
    if (!mapInstanceRef.current || !mgbQuarriesData) return;
    const map = mapInstanceRef.current;

    if (mgbQuarriesLayerRef.current) {
      mgbQuarriesLayerRef.current.remove();
      mgbQuarriesLayerRef.current = null;
    }

    if (!showMgbQuarries) return;

    const layer = L.geoJSON(mgbQuarriesData as any, {
      style: () => ({
        color: '#d97706',      // amber-600 border
        weight: 2,
        fillColor: '#f59e0b',  // amber-500 fill
        fillOpacity: 0.16,
        dashArray: '5, 4',
      }),
      onEachFeature: (feature: any, featureLayer: L.Layer) => {
        const props = feature?.properties || {};
        const name = props.tenementName || props.operator || 'Permitted Quarry';
        const permit = props.permitNumber || 'MGB Tenement';
        const operator = props.operator || 'Authorized Concessionaire';
        const commodity = props.commodity || 'Aggregates / Sand & Gravel';
        const municipality = props.municipality || 'Rizal';
        const area = props.areaHectares ? `${props.areaHectares} ha` : '';

        const tooltipHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 200px; max-width: 270px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #d97706;">
                ⛏️ MGB PERMITTED CADASTRE
              </span>
              <span style="font-size: 8px; font-family: monospace; background: rgba(217,119,6,0.18); border: 1px solid rgba(217,119,6,0.3); padding: 1px 4px; border-radius: 3px; color: #fde68a;">
                ACTIVE
              </span>
            </div>
            <div style="font-weight: 700; font-size: 11px; color: #f8fafc; line-height: 1.3;">
              ${name}
            </div>
            <div style="font-size: 10px; color: #cbd5e1; margin-top: 3px;">
              <strong>Operator:</strong> ${operator}
            </div>
            <div style="font-size: 9.5px; color: #94a3b8; margin-top: 2px;">
              📍 ${props.barangay ? `${props.barangay}, ` : ''}${municipality} ${area ? `• ${area}` : ''}
            </div>
            <div style="font-size: 9px; font-family: monospace; color: #f59e0b; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 3px;">
              Permit: ${permit} • ${commodity}
            </div>
          </div>
        `;

        featureLayer.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'auto',
          className: 'tactical-map-tooltip',
        });

        const pathLayer = featureLayer as L.Path;
        pathLayer.on('mouseover', () => {
          pathLayer.setStyle({
            weight: 3.5,
            fillOpacity: 0.32,
            color: '#b45309',
          });
        });
        pathLayer.on('mouseout', () => {
          pathLayer.setStyle({
            weight: 2,
            fillOpacity: 0.16,
            color: '#d97706',
          });
        });
        pathLayer.on('click', () => {
          try {
            const bounds = (pathLayer as any).getBounds?.();
            if (bounds && map) {
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
            }
          } catch (e) {}
        });
      },
    }).addTo(map);

    mgbQuarriesLayerRef.current = layer;

    return () => {
      if (mgbQuarriesLayerRef.current) {
        mgbQuarriesLayerRef.current.remove();
        mgbQuarriesLayerRef.current = null;
      }
    };
  }, [showMgbQuarries, mgbQuarriesData]);

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

    // If layerMode is not 'boundaries' or 'choropleth' and no activeMunicipality in picker, do not render full polygons
    if (layerMode !== 'boundaries' && layerMode !== 'choropleth' && (!activeMunicipality || activeMunicipality === 'all')) {
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
              color: '#022c22',
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

      const isSatellite = !isCluster && (group.reports[0].source === 'satellite_firms' || group.reports[0].id.startsWith('SAT-'));

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
          ${group.maxSeverity >= 4 || isSatellite
          ? `<div style="
                  position: absolute;
                  width: ${pulseSize}px;
                  height: ${pulseSize}px;
                  border-radius: 50%;
                  background: ${isSatellite ? '#ea580c' : color};
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
            box-shadow: ${isSatellite ? '0 0 0 2px #ea580c, 0 4px 10px rgba(234,88,12,0.45)' : isSelected ? '0 0 0 2px #0e2019, 0 6px 14px rgba(0,0,0,0.45)' : '0 3px 8px rgba(0,0,0,0.35)'};
          ">
            ${isCluster ? count : isSatellite ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>` : ''}
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
            ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#292524;"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>Closed</span>'
            : report.status === 'in_progress'
              ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#292524;"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span>In Prog</span>'
              : '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#292524;"><span style="width:6px;height:6px;border-radius:50%;background:#f43f5e;"></span>Pending</span>';

        const satBadge = isSatellite
          ? `<div style="background: rgba(234,88,12,0.12); border: 1px solid rgba(234,88,12,0.3); border-radius: 4px; padding: 3px 6px; margin-bottom: 5px; font-size: 10px; color: #ea580c; display: flex; align-items: center; justify-content: space-between;">
              <strong style="display:flex;align-items:center;gap:3px;">🛰️ NASA VIIRS HOTSPOT</strong>
              <span>${report.satelliteHotspot?.frp ? report.satelliteHotspot.frp.toFixed(1) + ' MW' : 'Active'}</span>
            </div>`
          : '';

        const aqiBadge = report.aiTriage?.airQuality
          ? `<div style="font-size: 9.5px; color: #059669; font-weight: 600; margin-bottom: 5px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 2px 6px; display: flex; justify-content: space-between;">
              <span>Air AQI: ${report.aiTriage.airQuality.europeanAqi} (${report.aiTriage.airQuality.aqiLabel})</span>
              <span>PM2.5: ${report.aiTriage.airQuality.pm2_5}</span>
            </div>`
          : '';

        marker.bindPopup(`
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4; max-width: 230px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
              <strong style="font-family: monospace; font-size: 13px; color: #1c1917;">${report.referenceCode}</strong>
              ${statusBadge}
            </div>
            ${satBadge}
            ${aqiBadge}
            <div style="margin-bottom: 5px; color: #78716c; font-size: 11px; display: flex; align-items: center;">
              <svg style="width: 12px; height: 12px; margin-right: 4px; flex-shrink: 0; color: #78716c;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${locationLabel}</span>
            </div>
            <div style="font-size: 11px; color: #292524; margin-bottom: 6px;">
              ${report.aiTriage?.summary || report.rawInput.description.slice(0, 80)}...
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f5f5f4; padding-top: 5px;">
              <span style="font-size: 10px; font-weight: 600; color: #44403c; background: #f5f5f4; border: 1px solid #e7e5e4; padding: 1px 6px; border-radius: 4px; font-family: monospace;">SEV ${group.maxSeverity}</span>
              <span style="font-size: 10px; color: #a8a29e; font-family: monospace;">${new Date(report.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `);
      } else {
        // Multi-incident cluster popup
        // Sort reports by severity descending (SEV 5 -> 1) then newest
        const sortedClusterReports = [...group.reports].sort((a, b) => {
          const sevA = a.final?.severity || a.aiTriage?.severity || 3;
          const sevB = b.final?.severity || b.aiTriage?.severity || 3;
          if (sevB !== sevA) return sevB - sevA;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        const reportItems = sortedClusterReports
          .slice(0, 5)
          .map((r) => {
            const rSev = r.final?.severity || r.aiTriage?.severity || 3;
            const rStatus = r.status || 'pending';
            const dotColor = rStatus === 'resolved' ? '#10b981' : rStatus === 'in_progress' ? '#f59e0b' : '#f43f5e';
            const isCurrent = r.id === selectedReportId;
            return `
              <div
                role="button"
                tabindex="0"
                data-report-id="${r.id}"
                class="nw-cluster-item"
                style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 3px; border-radius: 6px; border: 1px solid ${isCurrent ? '#1c1917' : '#e7e5e4'}; background: ${isCurrent ? '#f5f5f4' : '#ffffff'}; cursor: pointer; transition: all 0.15s ease;"
              >
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></span>
                  <span style="font-family: monospace; font-weight: 700; color: #1c1917; font-size: 11px;">${r.referenceCode}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 9px; font-weight: 600; color: #44403c; background: #f5f5f4; border: 1px solid #e7e5e4; padding: 1px 5px; border-radius: 4px; font-family: monospace;">SEV ${rSev}</span>
                  <span style="color: #a8a29e; font-size: 11px; font-weight: bold;">›</span>
                </div>
              </div>
            `;
          })
          .join('');

        const extraCount = group.reports.length > 5 ? `<div style="font-size: 10px; color: #78716c; text-align: center; margin-top: 3px;">+${group.reports.length - 5} more incidents in cluster</div>` : '';

        marker.bindPopup(`
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4; max-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="color: #1c1917; font-size: 12px;">${count} Incident Cluster</strong>
              <span style="font-size: 9px; font-weight: 600; color: #44403c; background: #f5f5f4; border: 1px solid #e7e5e4; padding: 1px 5px; border-radius: 4px; font-family: monospace;">MAX SEV ${group.maxSeverity}</span>
            </div>
            <div style="color: #78716c; font-size: 11px; margin-bottom: 6px; display: flex; align-items: center;">
              <svg style="width: 12px; height: 12px; margin-right: 4px; flex-shrink: 0; color: #78716c;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>${locationLabel}</span>
            </div>
            <div style="margin-bottom: 3px;">
              ${reportItems}
              ${extraCount}
            </div>
            <button
              type="button"
              class="nw-cluster-view-queue"
              style="width: 100%; border: none; margin-top: 5px; padding: 6px 8px; border-radius: 6px; background: #1c1917; color: #ffffff; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.15s ease;"
            >
              <span>View all ${count} in Queue</span>
              <span>→</span>
            </button>
          </div>
        `);
      }

      // Handle click events on popup cluster items
      marker.on('popupopen', (e) => {
        const popupNode = e.popup.getElement();
        if (!popupNode) return;
        const clickableItems = popupNode.querySelectorAll<HTMLElement>('.nw-cluster-item');
        clickableItems.forEach((item) => {
          item.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const reportId = item.getAttribute('data-report-id');
            const targetReport = group.reports.find((r) => r.id === reportId);
            if (targetReport && onSelectReport) {
              onSelectReport(targetReport);
            }
          };
          item.onmouseenter = () => {
            item.style.backgroundColor = '#f5f5f4';
            item.style.borderColor = '#a8a29e';
          };
          item.onmouseleave = () => {
            const reportId = item.getAttribute('data-report-id');
            const isCurrent = reportId === selectedReportId;
            item.style.backgroundColor = isCurrent ? '#f5f5f4' : '#ffffff';
            item.style.borderColor = isCurrent ? '#1c1917' : '#e7e5e4';
          };
        });

        const viewQueueBtn = popupNode.querySelector<HTMLElement>('.nw-cluster-view-queue');
        if (viewQueueBtn) {
          viewQueueBtn.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            marker.closePopup();
            if (onClusterClick) {
              onClusterClick(group);
            }
          };
          viewQueueBtn.onmouseenter = () => {
            viewQueueBtn.style.backgroundColor = '#000000';
          };
          viewQueueBtn.onmouseleave = () => {
            viewQueueBtn.style.backgroundColor = '#1c1917';
          };
        }
      });

      marker.on('click', () => {
        if (isCluster && onClusterClick) {
          onClusterClick(group);
        } else if (onSelectReport) {
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
  }, [mode, reports, selectedReportId, onSelectReport, onClusterClick]);

  return <div ref={mapContainerRef} className={`relative isolate z-0 ${className || ''}`} />;
};
