import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Maximize2, Minimize2, Plus, Minus } from 'lucide-react';
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
import {
  RIZAL_LGU_PRESETS,
  FullAtmosphericData,
  getWeatherInterpretation,
} from '../lib/weatherService';
import { fetchLatestRadarFrame, RadarFrameInfo, TRANSPARENT_FALLBACK_TILE } from '../lib/radarService';
import {
  getFirms375mBounds,
  formatFirmsPhtTime,
  crossCheckFirmsWithReports,
} from '../lib/firmsGeometry';

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

export type MapLayerMode = 'standard' | 'boundaries' | 'choropleth' | 'protected_zones' | 'quarries';
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
  selectedProtectedZoneId?: string | null;
  onSelectProtectedZone?: (zoneId: string) => void;
  onMapBackgroundClick?: () => void;
  showMgbQuarries?: boolean;
  selectedQuarryId?: string | null;
  onSelectQuarry?: (quarryId: string) => void;
  quarryFilter?: {
    type: 'all' | 'mpsa' | 'mpp' | 'cancelled';
    municipality: string;
    search: string;
  };
  showRainRadar?: boolean;
  showWeatherMarkers?: boolean;
  weatherTelemetry?: Record<string, FullAtmosphericData>;
  onWeatherMarkerClick?: (presetId: string) => void;
  showFirmsMarkers?: boolean;
  // Mobile / Touch enhancements
  enableCooperativeGestures?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  twoFingerNoticeText?: string;
  recenterButtonLabel?: string;
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
  showProtectedZones: _showProtectedZones = true,
  selectedProtectedZoneId = null,
  onSelectProtectedZone,
  onMapBackgroundClick,
  showMgbQuarries = false,
  selectedQuarryId = null,
  onSelectQuarry,
  quarryFilter,
  showRainRadar = false,
  showWeatherMarkers = false,
  weatherTelemetry = {},
  onWeatherMarkerClick,
  showFirmsMarkers = true,
  enableCooperativeGestures = true,
  isFullscreen = false,
  onToggleFullscreen,
  twoFingerNoticeText,
  recenterButtonLabel,
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
  const mgbQuarriesLayerRef = useRef<L.LayerGroup | null>(null);
  const rainRadarLayerRef = useRef<L.TileLayer | null>(null);
  const weatherMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const firmsLayersRef = useRef<L.Layer[]>([]);
  const [currentZoom, setCurrentZoom] = useState<number>(zoom);
  const [spiderfiedClusterKey, setSpiderfiedClusterKey] = useState<string | null>(null);
  const [radarInfo, setRadarInfo] = useState<RadarFrameInfo | null>(null);
  const [geoJsonData, setGeoJsonData] = useState<GeoJSONFeatureCollection<MunicipalityFeatureProperties> | null>(null);
  const [maskData, setMaskData] = useState<GeoJSONFeature | null>(null);
  const [protectedMaskData, setProtectedMaskData] = useState<GeoJSONFeature | null>(null);
  const [protectedZonesData, setProtectedZonesData] = useState<GeoJSONFeatureCollection<ProtectedZoneFeatureProperties> | null>(null);
  const [mgbQuarriesData, setMgbQuarriesData] = useState<GeoJSONFeatureCollection<MgbQuarryFeatureProperties> | null>(null);
  const [showTwoFingerToast, setShowTwoFingerToast] = useState(false);
  const twoFingerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);

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

    // Use standard Leaflet zoom control only in dashboard mode; picker mode uses modern thumb-friendly floating controls
    if (mode === 'dashboard') {
      L.control.zoom({ position: 'topright' }).addTo(map);
    }

    // Dedicated non-Rizal mask pane: above base tiles (zIndex: 200), below vectors (zIndex: 400)
    const maskPane = map.createPane('maskPane');
    maskPane.style.zIndex = '350';
    maskPane.style.pointerEvents = 'none';

    // Dedicated radar pane: above basemap tiles (zIndex: 200), below mask (zIndex: 350)
    const radarPane = map.createPane('radarPane');
    radarPane.style.zIndex = '250';
    radarPane.style.pointerEvents = 'none';

    // Dedicated weather marker pane: zIndex 580 (sits below active high-severity report pins)
    const weatherMarkerPane = map.createPane('weatherMarkerPane');
    weatherMarkerPane.style.zIndex = '580';

    // Dedicated NASA FIRMS 375m grid square pane: above vectors/quarries (zIndex 400), below pins (zIndex 600)
    const firmsGridPane = map.createPane('firmsGridPane');
    firmsGridPane.style.zIndex = '420';
    firmsGridPane.style.pointerEvents = 'auto';

    mapInstanceRef.current = map;
    setCurrentZoom(map.getZoom());

    const handleZoomEnd = () => {
      if (mapInstanceRef.current) {
        setCurrentZoom(mapInstanceRef.current.getZoom());
      }
    };
    map.on('zoomend', handleZoomEnd);

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
      map.off('zoomend', handleZoomEnd);
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

    // In 'quarries' mode: eliminate all boundaries, strokes, and mask lines
    if (layerMode === 'quarries') {
      return;
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
      filter: (feature: any) => {
        // Requirement 2: when a specific reserve is selected, the map must only highlight that reserve
        if (!selectedProtectedZoneId) return true;
        const fid = feature?.properties?.id || feature?.id;
        return fid === selectedProtectedZoneId;
      },
      style: (feature: any) => {
        const props = feature?.properties;
        const cat = props?.category;
        const isSelected = Boolean(selectedProtectedZoneId && (props?.id === selectedProtectedZoneId || feature?.id === selectedProtectedZoneId));

        if (isSelected) {
          // Radiant highlight for the selected reserve
          return {
            color: props?.strokeColor || '#059669',
            weight: 3.5,
            fillColor: props?.fillColor || '#10b981',
            fillOpacity: 0.38,
            dashArray: undefined,
          };
        }

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
        const name = props.name || props.shortName || 'Protected Zone';
        const location = props.municipality || 'Rizal Province';

        let catBadge = 'DENR-NIPAS';
        let catColor = '#34d399';
        if (props.category === 'llda_zomap') {
          catBadge = 'LLDA ZOMAP';
          catColor = '#38bdf8';
        } else if (props.category === 'kba_georeserve') {
          catBadge = 'KBA / GEORESERVE';
          catColor = '#2dd4bf';
        } else if (props.category === 'local_mountain') {
          catBadge = 'LOCAL WATERSHED';
          catColor = '#fbbf24';
        }

        const tooltipHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; pointer-events: none; width: 240px; max-width: 270px; white-space: normal; word-break: break-word; overflow-wrap: break-word;">
            <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 3px;">
              <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${catColor}; background: rgba(255, 255, 255, 0.08); padding: 1.5px 5.5px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.1); white-space: nowrap;">
                ${catBadge}
              </span>
            </div>
            <div style="font-weight: 700; font-size: 11.5px; color: #f8fafc; line-height: 1.35; white-space: normal; word-break: break-word; overflow-wrap: break-word;">
              ${name}
            </div>
            <div style="font-size: 9.5px; color: #94a3b8; margin-top: 3.5px; display: flex; align-items: flex-start; gap: 4px; line-height: 1.35; white-space: normal; word-break: break-word; overflow-wrap: break-word;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span>${location}</span>
            </div>
          </div>
        `;

        featureLayer.bindTooltip(tooltipHtml, {
          sticky: true,
          direction: 'auto',
          className: 'clean-weather-tooltip',
          offset: [0, -10],
        });

        const isSelected = Boolean(selectedProtectedZoneId && (props?.id === selectedProtectedZoneId || feature?.id === selectedProtectedZoneId));
        if (isSelected) {
          setTimeout(() => {
            try {
              (featureLayer as any).openTooltip?.();
            } catch (e) {}
          }, 80);
        }

        const pathLayer = featureLayer as L.Path;
        pathLayer.on('mouseover', () => {
          pathLayer.setStyle({
            weight: 3.5,
            fillOpacity: 0.38,
          });
        });

        pathLayer.on('mouseout', () => {
          if (isSelected) {
            pathLayer.setStyle({
              weight: 3.5,
              fillOpacity: 0.38,
            });
          } else {
            pathLayer.setStyle({
              weight: props.category === 'nipas' ? 2.5 : 2,
              fillOpacity: props.category === 'llda_zomap' ? 0.22 : 0.16,
            });
          }
        });

        pathLayer.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
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
  }, [layerMode, protectedZonesData, selectedProtectedZoneId]);

  // Dashboard Map Background Click Listener to deselect active features
  useEffect(() => {
    if (!mapInstanceRef.current || mode !== 'dashboard') return;
    const map = mapInstanceRef.current;
    const handleBgClick = () => {
      if (onMapBackgroundClick) {
        onMapBackgroundClick();
      }
      setSpiderfiedClusterKey(null);
    };
    map.on('click', handleBgClick);
    return () => {
      map.off('click', handleBgClick);
    };
  }, [mode, onMapBackgroundClick]);

  // Helper function to build clean, lightweight hover label for MGB concessions
  const buildQuarryHoverLabel = (props: any, isMpp: boolean, isCancelled: boolean) => {
    const name = props.shortName || props.tenementName || props.name || props.operator;
    const typeLabel = isMpp ? 'MPP Plant' : isCancelled ? 'Cancelled MPSA' : 'MPSA Concession';
    const tagColor = isMpp ? '#818cf8' : isCancelled ? '#ef4444' : '#f59e0b';
    return `
      <div style="font-family: system-ui, -apple-system, sans-serif; pointer-events: none; width: 220px; max-width: 260px; white-space: normal; word-break: break-word; overflow-wrap: break-word;">
        <div style="font-size: 11px; font-weight: 700; color: #f8fafc; letter-spacing: -0.01em; line-height: 1.35; white-space: normal; word-break: break-word; overflow-wrap: break-word;">
          ${name}
        </div>
        <div style="font-size: 9.5px; color: #94a3b8; margin-top: 2.5px; display: flex; align-items: flex-start; gap: 4px; line-height: 1.35; white-space: normal; word-break: break-word; overflow-wrap: break-word;">
          <span style="color: ${tagColor}; font-weight: 700; font-family: ui-monospace, monospace; white-space: nowrap;">${typeLabel}</span>
          <span style="opacity: 0.5;">•</span>
          <span>${props.municipality || 'Rizal'}</span>
        </div>
        <div style="font-size: 8.5px; color: #64748b; font-style: italic; margin-top: 2.5px;">
          Click to inspect concession dossier &rarr;
        </div>
      </div>
    `;
  };

  // MGB Permitted Quarries Vector Layer Rendering (Semantic LOD & Hub Clustering)
  useEffect(() => {
    if (!mapInstanceRef.current || !mgbQuarriesData) return;
    const map = mapInstanceRef.current;

    if (mgbQuarriesLayerRef.current) {
      mgbQuarriesLayerRef.current.remove();
      mgbQuarriesLayerRef.current = null;
    }

    if (!showMgbQuarries && layerMode !== 'quarries') return;

    const layerGroup = L.layerGroup().addTo(map);
    mgbQuarriesLayerRef.current = layerGroup;

    // 1. Filter cadastre features according to active quarry drawer filters
    const allFeatures = mgbQuarriesData.features || [];
    const filteredFeatures = allFeatures.filter((f) => {
      const props = f.properties;
      if (!props) return true;

      // Category filter (All / MPSA / MPP / Cancelled)
      if (quarryFilter?.type === 'mpsa' && props.permitType !== 'MPSA') return false;
      if (quarryFilter?.type === 'mpp' && props.permitType !== 'MPP') return false;
      if (quarryFilter?.type === 'cancelled' && props.status !== 'Cancelled') return false;

      // Municipality filter
      if (quarryFilter?.municipality && quarryFilter.municipality !== 'all') {
        const qm = quarryFilter.municipality.toLowerCase();
        const munStr = (props.municipality || '').toLowerCase();
        const nameStr = (props.name || '').toLowerCase();
        const brgyStr = (props.barangay || '').toLowerCase();
        const matches = munStr.includes(qm) || nameStr.includes(qm) || brgyStr.includes(qm);
        if (!matches) return false;
      }

      // Search term filter
      if (quarryFilter?.search && quarryFilter.search.trim()) {
        const q = quarryFilter.search.toLowerCase().trim();
        const nameStr = (props.name || '').toLowerCase();
        const shortStr = (props.shortName || '').toLowerCase();
        const tenStr = (props.tenementName || '').toLowerCase();
        const opStr = (props.operator || '').toLowerCase();
        const holderStr = (props.holder || '').toLowerCase();
        const permitStr = (props.permitNumber || '').toLowerCase();
        const munStr = (props.municipality || '').toLowerCase();
        const brgyStr = (props.barangay || '').toLowerCase();
        const commStr = (props.commodity || '').toLowerCase();

        const match =
          nameStr.includes(q) ||
          shortStr.includes(q) ||
          tenStr.includes(q) ||
          opStr.includes(q) ||
          holderStr.includes(q) ||
          permitStr.includes(q) ||
          munStr.includes(q) ||
          brgyStr.includes(q) ||
          commStr.includes(q);
        if (!match) return false;
      }

      return true;
    });

    const polygonFeatures = filteredFeatures.filter((f) => f.geometry.type !== 'Point');
    const pointFeatures = filteredFeatures.filter((f) => f.geometry.type === 'Point');

    // 2. Render Polygon Concessions (MPSAs)
    if (polygonFeatures.length > 0) {
      const polyCollection = {
        type: 'FeatureCollection',
        features: polygonFeatures,
      };

      const polyLayer = L.geoJSON(polyCollection as any, {
        style: (feature: any) => {
          const props = feature?.properties || {};
          const isCancelled = props.status === 'Cancelled';
          const isExploration = props.status === 'Exploration';
          const isSelected = Boolean(selectedQuarryId && (props.id === selectedQuarryId || feature.id === selectedQuarryId || props.permitNumber === selectedQuarryId));

          if (isSelected) {
            return {
              color: '#ffffff',
              weight: 3.5,
              fillColor: isCancelled ? '#ef4444' : isExploration ? '#38bdf8' : '#f59e0b',
              fillOpacity: 0.45,
              dashArray: undefined,
            };
          }

          if (isCancelled) {
            return {
              color: '#dc2626',      // red-600
              weight: 2.5,
              fillColor: '#ef4444',  // red-500
              fillOpacity: 0.22,
              dashArray: '6, 6',
            };
          }
          if (isExploration) {
            return {
              color: '#0284c7',      // sky-600
              weight: 2,
              fillColor: '#38bdf8',  // sky-400
              fillOpacity: 0.20,
              dashArray: '3, 3',
            };
          }
          return {
            color: '#d97706',      // amber-600 border
            weight: layerMode === 'quarries' ? 2.5 : 2,
            fillColor: '#f59e0b',  // amber-500 fill
            fillOpacity: layerMode === 'quarries' ? 0.25 : 0.16,
            dashArray: undefined,
          };
        },
        onEachFeature: (feature: any, featureLayer: L.Layer) => {
          const props = feature?.properties || {};
          const isCancelled = props.status === 'Cancelled';
          const isSelected = Boolean(selectedQuarryId && (props.id === selectedQuarryId || feature.id === selectedQuarryId || props.permitNumber === selectedQuarryId));

          featureLayer.bindTooltip(
            buildQuarryHoverLabel(props, false, isCancelled),
            {
              sticky: true,
              direction: 'auto',
              className: 'clean-weather-tooltip',
              offset: [0, -10],
            }
          );

          const pathLayer = featureLayer as L.Path;
          pathLayer.on('mouseover', () => {
            pathLayer.setStyle({
              weight: 3.5,
              fillOpacity: isCancelled ? 0.35 : 0.40,
              color: isCancelled ? '#991b1b' : isSelected ? '#ffffff' : '#b45309',
            });
          });
          pathLayer.on('mouseout', () => {
            if (isSelected) {
              pathLayer.setStyle({
                color: '#ffffff',
                weight: 3.5,
                fillOpacity: 0.45,
              });
            } else {
              pathLayer.setStyle({
                weight: isCancelled ? 2.5 : 2,
                fillOpacity: isCancelled ? 0.22 : 0.16,
                color: isCancelled ? '#dc2626' : '#d97706',
              });
            }
          });
          pathLayer.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            try {
              const bounds = (pathLayer as any).getBounds?.();
              if (bounds && map) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
              }
            } catch (err) {}
            const qId = props.id || feature.id || props.permitNumber;
            if (qId && onSelectQuarry) {
              onSelectQuarry(String(qId));
            }
          });
        },
      });

      polyLayer.addTo(layerGroup);
    }

    // 3. Cluster Point Features (MPPs) for Semantic LOD & Spiderfy
    interface MppCluster {
      id: string;
      hubName: string;
      center: [number, number]; // [lat, lng]
      features: GeoJSONFeature<MgbQuarryFeatureProperties>[];
      bounds: L.LatLngBounds;
    }

    const clusters: MppCluster[] = [];
    const CLUSTER_THRESHOLD_DEG = 0.045; // ~5 km grouping for regional hubs

    pointFeatures.forEach((feat) => {
      const coords = (feat.geometry as any).coordinates; // [lng, lat]
      const lat = coords[1];
      const lng = coords[0];
      const rawMun = feat.properties?.municipality || 'Rizal';
      const cleanMun = rawMun.replace(/\s*\(.*\)/, '').trim();

      let targetCluster = clusters.find((c) => {
        const dLat = Math.abs(c.center[0] - lat);
        const dLng = Math.abs(c.center[1] - lng);
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        return dist < CLUSTER_THRESHOLD_DEG;
      });

      if (targetCluster) {
        targetCluster.features.push(feat);
        targetCluster.bounds.extend([lat, lng]);
        const totalLat = targetCluster.features.reduce((acc, f) => acc + (f.geometry as any).coordinates[1], 0);
        const totalLng = targetCluster.features.reduce((acc, f) => acc + (f.geometry as any).coordinates[0], 0);
        targetCluster.center = [totalLat / targetCluster.features.length, totalLng / targetCluster.features.length];
      } else {
        clusters.push({
          id: `cluster-${cleanMun.toLowerCase().replace(/\s+/g, '-')}`,
          hubName: cleanMun,
          center: [lat, lng],
          features: [feat],
          bounds: L.latLngBounds([[lat, lng], [lat, lng]]),
        });
      }
    });

    // 4. Render Clustered Hubs or Individual Plant Markers Based on Zoom & Spiderfy State
    clusters.forEach((cluster) => {
      const isMulti = cluster.features.length > 1;
      const isSpiderfied = spiderfiedClusterKey === cluster.id;

      // CASE A: Provincial / District Level (currentZoom < 14) and dense cluster
      if (isMulti && currentZoom < 14 && !isSpiderfied) {
        const hubBadgeHtml = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); pointer-events: auto;">
            <div class="nw-mpp-cluster-badge" title="Click to zoom in on ${cluster.hubName} Hub">
              <div style="width: 20px; height: 20px; border-radius: 50%; background: #4f46e5; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 10px; font-weight: 800; font-family: ui-monospace, monospace; box-shadow: inset 0 1px 2px rgba(255,255,255,0.3); flex-shrink: 0;">
                ${cluster.features.length}
              </div>
              <div style="display: flex; flex-direction: column; text-align: left; line-height: 1.15;">
                <span style="font-size: 10.5px; font-weight: 700; color: #ffffff; font-family: system-ui, -apple-system, sans-serif; letter-spacing: -0.01em;">
                  ${cluster.features.length} Plants • ${cluster.hubName} Hub
                </span>
                <span style="font-size: 8px; font-weight: 600; color: #c7d2fe; font-family: ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.04em;">
                  Click to Expand • MGB Cadastre
                </span>
              </div>
            </div>
          </div>
        `;

        const clusterMarker = L.marker(cluster.center, {
          icon: L.divIcon({
            className: 'nw-mpp-hub-marker',
            html: hubBadgeHtml,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          pane: 'weatherMarkerPane',
          zIndexOffset: 1300,
        });

        // Hub Tooltip: List of all permitted facilities in cluster
        const clusterTooltipHtml = `
          <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 240px; max-width: 300px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
              <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #818cf8;">
                MGB Region IV-A Clustered Hub
              </span>
              <span style="font-size: 8px; font-family: monospace; background: rgba(79,70,229,0.4); border: 1px solid rgba(129,140,248,0.5); padding: 1px 5px; border-radius: 3px; color: #e0e7ff; font-weight: 800;">
                ${cluster.features.length} Facilities
              </span>
            </div>
            <div style="font-weight: 700; font-size: 12px; color: #ffffff; margin-bottom: 4px;">
              ${cluster.hubName} Mineral Processing Hub
            </div>
            <div style="font-size: 9.5px; color: #cbd5e1; margin-bottom: 6px;">
              Aggregates crushing, screening, and industrial batching facilities permitted under MGB Region IV-A.
            </div>
            <div style="max-height: 140px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 3px;">
              ${cluster.features
                .map((f) => {
                  const p = f.properties;
                  return `
                    <div style="font-size: 9px; color: #e2e8f0; display: flex; justify-content: space-between; gap: 4px; background: rgba(255,255,255,0.05); padding: 2.5px 6px; border-radius: 4px;">
                      <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">${p.shortName || p.operator}</span>
                      <span style="font-family: monospace; color: #a5b4fc; font-size: 8px;">${p.permitNumber.split(' ')[0]}</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
            <div style="font-size: 8.5px; color: #94a3b8; margin-top: 6px; font-style: italic; text-align: center;">
              Click marker to zoom in and inspect individual plants
            </div>
          </div>
        `;

        clusterMarker.bindTooltip(clusterTooltipHtml, {
          sticky: true,
          direction: 'auto',
          className: 'tactical-map-tooltip',
        });

        // Click handler: Smart Zoom to cluster bounds
        clusterMarker.on('click', () => {
          map.fitBounds(cluster.bounds, {
            padding: [55, 55],
            maxZoom: 15,
            animate: true,
          });
        });

        clusterMarker.addTo(layerGroup);
        return;
      }

      // CASE B: High Zoom (currentZoom >= 14) Spiderfy mode
      if (isMulti && isSpiderfied) {
        // Render spiderfy center hub anchor
        const anchorHtml = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); pointer-events: auto;">
            <div class="nw-mpp-glyph" style="background: rgba(49, 46, 129, 0.98); border-color: #c7d2fe; cursor: pointer;" title="Click to collapse radial view">
              <span style="font-size: 10px; font-weight: 800; color: #ffffff; font-family: monospace;">✕</span>
            </div>
          </div>
        `;
        const anchorMarker = L.marker(cluster.center, {
          icon: L.divIcon({ className: 'spiderfy-anchor', html: anchorHtml, iconSize: [0, 0], iconAnchor: [0, 0] }),
          pane: 'weatherMarkerPane',
          zIndexOffset: 1500,
        });
        anchorMarker.on('click', () => setSpiderfiedClusterKey(null));
        anchorMarker.addTo(layerGroup);

        // Fan out features in a radial circle
        const count = cluster.features.length;
        const radiusPx = Math.max(65, count * 9);
        const centerPoint = map.latLngToLayerPoint(cluster.center);

        cluster.features.forEach((feat, i) => {
          const props = feat.properties;
          const angle = (2 * Math.PI * i) / count - Math.PI / 2;
          const targetPoint = L.point(
            centerPoint.x + radiusPx * Math.cos(angle),
            centerPoint.y + radiusPx * Math.sin(angle)
          );
          const targetLatLng = map.layerPointToLatLng(targetPoint);

          // Connector line
          L.polyline([cluster.center, targetLatLng], {
            color: '#818cf8',
            weight: 1.5,
            dashArray: '3, 4',
            opacity: 0.85,
          }).addTo(layerGroup);

          const pinHtml = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); pointer-events: auto;">
              <div class="nw-mpp-pill">
                <span style="color: #a5b4fc; display: flex; align-items: center; flex-shrink: 0;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                    <path d="M17 18h1"></path>
                    <path d="M12 18h1"></path>
                    <path d="M7 18h1"></path>
                  </svg>
                </span>
                <span style="font-size: 10px; font-weight: 700; color: #ffffff; font-family: system-ui, -apple-system, sans-serif;">${props.shortName || props.operator}</span>
                <span style="font-size: 8.5px; font-weight: 800; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: rgba(99, 102, 241, 0.4); color: #e0e7ff; border: 1px solid rgba(165, 180, 252, 0.4);">
                  MPP
                </span>
              </div>
            </div>
          `;

          const pinMarker = L.marker(targetLatLng, {
            icon: L.divIcon({ className: 'custom-mpp-pin', html: pinHtml, iconSize: [0, 0], iconAnchor: [0, 0] }),
            pane: 'weatherMarkerPane',
            zIndexOffset: 1400,
          });

          pinMarker.bindTooltip(buildQuarryHoverLabel(props, true, false), {
            sticky: true,
            direction: 'auto',
            className: 'clean-weather-tooltip',
            offset: [0, -10],
          });

          pinMarker.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            const origCoords = (feat.geometry as any).coordinates;
            map.flyTo([origCoords[1], origCoords[0]], 16, { animate: true });
            const qId = props.id || feat.id || props.permitNumber;
            if (qId && onSelectQuarry) {
              onSelectQuarry(String(qId));
            }
          });

          pinMarker.addTo(layerGroup);
        });
        return;
      }

      // CASE C: Individual Plant Markers (isolated or zoom >= 14 non-spiderfied)
      cluster.features.forEach((feat) => {
        const props = feat.properties;
        const coords = (feat.geometry as any).coordinates;
        const latlng: [number, number] = [coords[1], coords[0]];
        const isSelected = Boolean(selectedQuarryId && (props.id === selectedQuarryId || feat.id === selectedQuarryId || props.permitNumber === selectedQuarryId));

        // Semantic LOD: Compact 26px glyph at low/medium zoom, full pill at site zoom (zoom >= 15)
        const showFullPill = currentZoom >= 15;

        const glyphHtml = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); pointer-events: auto;">
            <div class="nw-mpp-glyph" style="${isSelected ? 'border: 2px solid #ffffff !important; box-shadow: 0 0 16px rgba(99, 102, 241, 0.95) !important; transform: scale(1.2);' : ''}" title="${props.shortName || props.operator}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                <path d="M17 18h1"></path>
                <path d="M12 18h1"></path>
                <path d="M7 18h1"></path>
              </svg>
            </div>
          </div>
        `;

        const pillHtml = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); pointer-events: auto;">
            <div class="nw-mpp-pill" style="${isSelected ? 'border: 2px solid #ffffff !important; box-shadow: 0 0 16px rgba(99, 102, 241, 0.95), 0 4px 12px rgba(0,0,0,0.5) !important; transform: scale(1.12);' : ''}" title="${props.name || props.operator}">
              <span style="color: #a5b4fc; display: flex; align-items: center; flex-shrink: 0;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                  <path d="M17 18h1"></path>
                  <path d="M12 18h1"></path>
                  <path d="M7 18h1"></path>
                </svg>
              </span>
              <span style="font-size: 10px; font-weight: 700; color: #ffffff; font-family: system-ui, -apple-system, sans-serif;">${props.shortName || props.operator}</span>
              <span style="font-size: 8.5px; font-weight: 800; font-family: ui-monospace, monospace; padding: 1px 4px; border-radius: 4px; background: rgba(99, 102, 241, 0.4); color: #e0e7ff; border: 1px solid rgba(165, 180, 252, 0.4);">
                MPP
              </span>
            </div>
          </div>
        `;

        const marker = L.marker(latlng, {
          icon: L.divIcon({
            className: 'custom-mpp-pin',
            html: showFullPill ? pillHtml : glyphHtml,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          pane: 'weatherMarkerPane',
          zIndexOffset: 1200,
        });

        marker.bindTooltip(buildQuarryHoverLabel(props, true, false), {
          sticky: true,
          direction: 'auto',
          className: 'clean-weather-tooltip',
          offset: [0, -10],
        });

        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (isMulti && currentZoom >= 14 && !isSpiderfied) {
            setSpiderfiedClusterKey(cluster.id);
          } else {
            map.flyTo(latlng, 16, { animate: true });
          }
          const qId = props.id || feat.id || props.permitNumber;
          if (qId && onSelectQuarry) {
            onSelectQuarry(String(qId));
          }
        });

        marker.addTo(layerGroup);
      });
    });

    return () => {
      if (mgbQuarriesLayerRef.current) {
        mgbQuarriesLayerRef.current.remove();
        mgbQuarriesLayerRef.current = null;
      }
    };
  }, [showMgbQuarries, layerMode, mgbQuarriesData, quarryFilter, currentZoom, spiderfiedClusterKey, selectedQuarryId, onSelectQuarry]);

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
      // If a touch interaction was a scroll or swipe rather than a deliberate tap, suppress pin drop
      if (touchMovedRef.current) {
        touchMovedRef.current = false;
        return;
      }
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

    // In 'quarries' mode: eliminate all municipal boundaries and lines
    if (layerMode === 'quarries') {
      return;
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

    // Clear old markers & FIRMS grid layers
    dashboardMarkersRef.current.forEach((m) => m.remove());
    dashboardMarkersRef.current.clear();
    firmsLayersRef.current.forEach((l) => l.remove());
    firmsLayersRef.current = [];

    // Separate satellite hotspots from community citizen reports
    const satReports: IncidentReport[] = [];
    const communityReports: IncidentReport[] = [];

    reports.forEach((report) => {
      if (
        report.source === 'satellite_firms' ||
        report.id.startsWith('SAT-') ||
        !!report.satelliteHotspot
      ) {
        satReports.push(report);
      } else {
        communityReports.push(report);
      }
    });

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

    communityReports.forEach((report) => {
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

        // Check if any satellite hotspot corroborates this citizen report within 500m
        const matchingSat = satReports.find((sat) => {
          const chk = crossCheckFirmsWithReports(sat, [report], 500);
          return chk.matched;
        });

        const satBadge = matchingSat
          ? `<div style="background: rgba(225, 29, 72, 0.12); border: 1px solid rgba(225, 29, 72, 0.35); border-radius: 4px; padding: 4px 6px; margin-bottom: 5px; font-size: 10px; color: #be123c; display: flex; align-items: center; justify-content: space-between;">
              <strong style="display:flex;align-items:center;gap:3px;">🛰️ VIIRS 375m CORROBORATED</strong>
              <span>${matchingSat.satelliteHotspot?.frp ? matchingSat.satelliteHotspot.frp.toFixed(1) + ' MW' : 'Active'}</span>
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

    // =========================================================
    // 2. RENDER NASA FIRMS VIIRS 375m GRID SQUARES (FOOTPRINT)
    // =========================================================
    if (showFirmsMarkers) {
      satReports.forEach((satReport) => {
      const coords = resolveReportCoordinates(satReport);
      const isSelected = satReport.id === selectedReportId;
      const bounds = getFirms375mBounds(coords.lat, coords.lng);
      const sat = satReport.satelliteHotspot;
      const frp = sat?.frp !== undefined ? sat.frp.toFixed(1) : 'N/A';
      const tempK = sat?.brightnessTemperature !== undefined
        ? sat.brightnessTemperature.toFixed(1)
        : sat?.brightnessTemp
        ? sat.brightnessTemp.toFixed(1)
        : '330.0';
      const tempC = sat?.brightnessTemperature !== undefined
        ? (sat.brightnessTemperature - 273.15).toFixed(1)
        : sat?.brightnessTemp
        ? (sat.brightnessTemp - 273.15).toFixed(1)
        : '56.9';
      const confidence = (sat?.confidence || 'nominal').toUpperCase();
      const passPht = formatFirmsPhtTime(sat?.acqDate, sat?.acqTime);

      // Automated Cross-Check Verdict (< 500m against community reports)
      const crossCheck = crossCheckFirmsWithReports(satReport, communityReports, 500);

      // 375m x 375m Semi-transparent Red/Magenta Grid Square Polygon
      const rect = L.rectangle(bounds, {
        pane: 'firmsGridPane',
        color: isSelected ? '#be123c' : '#f43f5e',
        weight: isSelected ? 2.5 : 1.5,
        dashArray: '5, 4',
        fillColor: '#f43f5e',
        fillOpacity: isSelected ? 0.38 : 0.22,
        className: `firms-375m-grid-cell ${isSelected ? 'selected' : ''}`,
      }).addTo(map);
      firmsLayersRef.current.push(rect);

      // Central Tactical Reticle with glowing thermal ember core
      const reticleHtml = `
        <div class="firms-reticle-wrapper ${isSelected ? 'selected' : ''}">
          <div class="firms-reticle-ping"></div>
          <div class="firms-reticle-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5">
              <circle cx="12" cy="12" r="3" fill="#f43f5e"/>
              <line x1="12" y1="2" x2="12" y2="7"/>
              <line x1="12" y1="17" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="7" y2="12"/>
              <line x1="17" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
          <div class="firms-reticle-badge">VIIRS 375m • ${frp} MW</div>
        </div>
      `;

      const reticleIcon = L.divIcon({
        className: 'firms-center-reticle',
        html: reticleHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const reticleMarker = L.marker([coords.lat, coords.lng], {
        icon: reticleIcon,
        pane: 'markerPane',
        zIndexOffset: isSelected ? 2200 : 1200,
      }).addTo(map);
      firmsLayersRef.current.push(reticleMarker);
      dashboardMarkersRef.current.set(satReport.id, reticleMarker);

      // Detailed orbital popup
      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; line-height: 1.4; min-width: 240px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; border-bottom: 1px solid #fee2e2; padding-bottom: 4px;">
            <strong style="font-family: monospace; font-size: 13px; color: #9f1239;">${satReport.referenceCode}</strong>
            <span style="font-size: 10px; font-weight: 700; color: #e11d48; background: #ffe4e6; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3;">VIIRS 375m</span>
          </div>

          ${
            crossCheck.matched
              ? `<div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px;">
                   <div style="font-size: 10px; font-weight: 800; color: #065f46; display: flex; align-items: center; gap: 4px;">
                     <span>✓ MATCHED: Report #${crossCheck.matchedReport?.referenceCode}</span>
                   </div>
                   <div style="font-size: 9.5px; color: #047857; margin-top: 2px;">
                     Corroborated within ${crossCheck.distanceMeters}m • Auto-Escalated to Severity 5
                   </div>
                 </div>`
              : `<div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px;">
                   <div style="font-size: 10px; font-weight: 800; color: #92400e; display: flex; align-items: center; gap: 4px;">
                     <span>⚠️ UNREPORTED ANOMALY</span>
                   </div>
                   <div style="font-size: 9.5px; color: #b45309; margin-top: 2px;">
                     Zero citizen reports within ${(crossCheck.distanceMeters / 1000).toFixed(1)} km of canopy
                   </div>
                 </div>`
          }

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 6px; margin-bottom: 6px; text-align: center;">
            <div>
              <span style="font-size: 9px; color: #9f1239; font-weight: 600; display: block;">RADIANT TEMP</span>
              <span style="font-family: monospace; font-size: 11px; font-weight: 800; color: #881337;">${tempK} K (${tempC}°C)</span>
            </div>
            <div>
              <span style="font-size: 9px; color: #9f1239; font-weight: 600; display: block;">RADIATIVE POWER</span>
              <span style="font-family: monospace; font-size: 11px; font-weight: 800; color: #e11d48;">${frp} MW</span>
            </div>
          </div>

          <div style="font-size: 10px; color: #78716c; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span>Confidence: <strong>${confidence}</strong></span>
            <span>Pass: <strong>${sat?.dayNight === 'D' ? 'Day' : 'Night'}</strong></span>
          </div>
          <div style="font-size: 9.5px; color: #78716c; font-family: monospace; margin-bottom: 6px;">
            ${passPht}
          </div>

          <div style="font-size: 9px; color: #94a3b8; font-style: italic; border-top: 1px solid #f1f5f9; padding-top: 4px; text-align: center;">
            375m × 375m Ground Resolution Footprint
          </div>
        </div>
      `;

      rect.bindPopup(popupHtml, { className: 'firms-custom-popup' });
      reticleMarker.bindPopup(popupHtml, { className: 'firms-custom-popup' });

      rect.on('click', () => {
        if (onSelectReport) onSelectReport(satReport);
      });
      reticleMarker.on('click', () => {
        if (onSelectReport) onSelectReport(satReport);
      });
    });
    }

    return () => {
      dashboardMarkersRef.current.forEach((m) => m.remove());
      dashboardMarkersRef.current.clear();
      firmsLayersRef.current.forEach((l) => l.remove());
      firmsLayersRef.current = [];
    };
  }, [mode, reports, selectedReportId, onSelectReport, onClusterClick, showFirmsMarkers]);

  // 1. Live Doppler Precipitation Radar Layer (RainViewer Open-Source API)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (!showRainRadar) {
      if (rainRadarLayerRef.current) {
        map.removeLayer(rainRadarLayerRef.current);
        rainRadarLayerRef.current = null;
      }
      return;
    }

    let isMounted = true;

    const applyRadarLayer = (info: RadarFrameInfo) => {
      if (!isMounted || !mapInstanceRef.current) return;
      if (rainRadarLayerRef.current) {
        mapInstanceRef.current.removeLayer(rainRadarLayerRef.current);
      }
      const radarLayer = L.tileLayer(info.tileUrl, {
        pane: 'radarPane',
        opacity: 0.65,
        maxNativeZoom: 12,
        maxZoom: 18,
        errorTileUrl: TRANSPARENT_FALLBACK_TILE,
        attribution: 'Rain Radar &copy; RainViewer',
      });
      radarLayer.addTo(mapInstanceRef.current);
      rainRadarLayerRef.current = radarLayer;
    };

    if (radarInfo) {
      applyRadarLayer(radarInfo);
    } else {
      fetchLatestRadarFrame().then((info) => {
        if (isMounted && info) {
          setRadarInfo(info);
          applyRadarLayer(info);
        }
      });
    }

    return () => {
      isMounted = false;
      if (rainRadarLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(rainRadarLayerRef.current);
        rainRadarLayerRef.current = null;
      }
    };
  }, [showRainRadar, radarInfo]);

  // 2. Municipal Weather & AQI Pin Badges with Wind Direction Vectors (Open-Meteo)
  useEffect(() => {
    if (mode !== 'dashboard' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear previous weather markers
    weatherMarkersRef.current.forEach((marker) => marker.remove());
    weatherMarkersRef.current.clear();

    if (!showWeatherMarkers) return;

    const getWeatherConditionVisual = (type: string) => {
      const neutralShadow = '0 2px 5px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06)';
      if (type === 'sun') {
        return {
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
          color: '#d97706',
          bg: '#fffbeb',
          border: 'rgba(245, 158, 11, 0.55)',
          shadow: neutralShadow,
        };
      }
      if (type === 'cloud-sun') {
        return {
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>`,
          color: '#0284c7',
          bg: '#f0f9ff',
          border: 'rgba(56, 189, 248, 0.55)',
          shadow: neutralShadow,
        };
      }
      if (type === 'cloud-rain') {
        return {
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`,
          color: '#2563eb',
          bg: '#eff6ff',
          border: 'rgba(96, 165, 250, 0.55)',
          shadow: neutralShadow,
        };
      }
      if (type === 'cloud-lightning') {
        return {
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/></svg>`,
          color: '#7c3aed',
          bg: '#f5f3ff',
          border: 'rgba(167, 139, 250, 0.55)',
          shadow: neutralShadow,
        };
      }
      if (type === 'cloud-fog') {
        return {
          icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/></svg>`,
          color: '#0d9488',
          bg: '#f0fdfa',
          border: 'rgba(45, 212, 191, 0.55)',
          shadow: neutralShadow,
        };
      }
      return {
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`,
        color: '#64748b',
        bg: '#f8fafc',
        border: 'rgba(148, 163, 184, 0.55)',
        shadow: neutralShadow,
      };
    };

    RIZAL_LGU_PRESETS.filter((p) => p.id !== 'rizal-center').forEach((preset) => {
      const telemetry = weatherTelemetry[preset.id];
      const hasData = !!telemetry;

      const temp = hasData ? Math.round(telemetry.weather.temperature) : '--';
      const interp = hasData
        ? getWeatherInterpretation(telemetry.weather.weatherCode)
        : { label: 'Syncing...', iconType: 'cloud' as const };
      
      const visual = getWeatherConditionVisual(interp.iconType);

      const iconHtml = `
        <div class="weather-icon-bubble" data-condition="${interp.iconType}" style="
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${visual.bg};
          border: 1.5px solid ${visual.border};
          color: ${visual.color};
          box-shadow: ${visual.shadow};
          cursor: pointer;
        ">
          ${visual.icon}
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'weather-icon-marker',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([preset.lat, preset.lng], {
        icon: markerIcon,
        pane: 'weatherMarkerPane',
        zIndexOffset: 1500,
      }).addTo(map);

      const tooltipHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; text-align: center; pointer-events: none; min-width: 105px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #f8fafc; letter-spacing: -0.01em;">${preset.name}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 1.5px; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <span style="color: #38bdf8; font-weight: 700; font-family: ui-monospace, monospace;">${temp}°C</span>
            <span style="opacity: 0.6;">•</span>
            <span style="color: #e2e8f0; font-weight: 500;">${interp.label}</span>
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipHtml, {
        direction: 'top',
        offset: [0, -18],
        className: 'clean-weather-tooltip',
        opacity: 1,
      });

      marker.on('click', () => {
        if (onWeatherMarkerClick) {
          onWeatherMarkerClick(preset.id);
        }
      });

      weatherMarkersRef.current.set(preset.id, marker);
    });

    return () => {
      weatherMarkersRef.current.forEach((marker) => marker.remove());
      weatherMarkersRef.current.clear();
    };
  }, [mode, showWeatherMarkers, weatherTelemetry, onWeatherMarkerClick]);

  // Cooperative Touch Gesture Handling (Avoids trapping vertical page scroll on touchscreens)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mode !== 'picker' || isFullscreen || !enableCooperativeGestures) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchMovedRef.current = false;
        touchStartPosRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        // Disable map dragging so single-finger swipes scroll the webpage naturally
        if (mapInstanceRef.current) {
          mapInstanceRef.current.dragging.disable();
        }
      } else if (e.touches.length >= 2) {
        // Two or more fingers: enable map dragging for pan and pinch-zoom
        touchMovedRef.current = true;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.dragging.enable();
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && touchStartPosRef.current) {
        const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
        const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
        // If finger moved noticeably, user is scrolling the page
        if (dx > 8 || dy > 8) {
          touchMovedRef.current = true;
          // Show brief two-finger guidance toast
          setShowTwoFingerToast(true);
          if (twoFingerTimerRef.current) clearTimeout(twoFingerTimerRef.current);
          twoFingerTimerRef.current = setTimeout(() => {
            setShowTwoFingerToast(false);
          }, 1600);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        // Re-enable dragging for desktop mouse pointers
        if (mapInstanceRef.current) {
          mapInstanceRef.current.dragging.enable();
        }
        touchStartPosRef.current = null;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      if (twoFingerTimerRef.current) clearTimeout(twoFingerTimerRef.current);
    };
  }, [mode, isFullscreen, enableCooperativeGestures]);

  // Recalculate tile sizes when entering or exiting fullscreen
  useEffect(() => {
    if (mapInstanceRef.current) {
      const timer1 = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 50);
      const timer2 = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 250);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isFullscreen]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([center.lat, center.lng], 15, { animate: true });
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  return (
    <div className={`relative isolate z-0 overflow-hidden ${className || ''}`}>
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Mode Picker Controls (Zoom In/Out, Re-center, Fullscreen) */}
      {mode === 'picker' && (
        <div className="absolute bottom-3 right-3 z-[400] flex flex-col gap-1.5 pointer-events-auto">
          {/* Re-center on pin */}
          <button
            type="button"
            onClick={handleRecenter}
            className="w-9 h-9 bg-white/95 hover:bg-white dark:bg-stone-900/95 dark:hover:bg-stone-900 text-stone-700 dark:text-stone-200 rounded-lg shadow-md border border-stone-200 dark:border-stone-700 flex items-center justify-center transition active:scale-95 cursor-pointer backdrop-blur-xs"
            title={recenterButtonLabel || 'Center on Pin'}
            aria-label={recenterButtonLabel || 'Center on Pin'}
          >
            <Crosshair className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          </button>

          {/* Fullscreen toggle button if provided */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="w-9 h-9 bg-white/95 hover:bg-white dark:bg-stone-900/95 dark:hover:bg-stone-900 text-stone-700 dark:text-stone-200 rounded-lg shadow-md border border-stone-200 dark:border-stone-700 flex items-center justify-center transition active:scale-95 cursor-pointer backdrop-blur-xs"
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand Map'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Expand Map'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-stone-600 dark:text-stone-300" />
              ) : (
                <Maximize2 className="w-4 h-4 text-stone-600 dark:text-stone-300" />
              )}
            </button>
          )}

          {/* Zoom controls */}
          <div className="flex flex-col bg-white/95 dark:bg-stone-900/95 rounded-lg shadow-md border border-stone-200 dark:border-stone-700 overflow-hidden backdrop-blur-xs">
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-9 h-9 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition active:scale-95 cursor-pointer border-b border-stone-200 dark:border-stone-800"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-9 h-9 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Two-finger pan notice overlay for mobile touch */}
      {showTwoFingerToast && (
        <div className="absolute inset-0 z-[500] pointer-events-none flex items-center justify-center p-4 bg-stone-950/30 backdrop-blur-[1.5px] transition-all animate-fade-in">
          <div className="px-3.5 py-2 rounded-lg bg-stone-900/95 dark:bg-stone-950/95 text-white text-xs font-semibold shadow-xl border border-stone-700/80 flex items-center gap-2">
            <span className="text-base leading-none">✌️</span>
            <span>{twoFingerNoticeText || 'Gamitin ang 2 daliri upang igalaw ang mapa'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
