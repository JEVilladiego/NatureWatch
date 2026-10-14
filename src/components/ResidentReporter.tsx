import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  MapPin,
  CheckCircle,
  Copy,
  Info,
  Clock,
  ArrowRight,
  RefreshCw,
  FileText,
  Navigation,
  Map,
  ShieldCheck,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  IncidentCategory,
  CATEGORIES,
  RIZAL_LGUS,
  RIZAL_BARANGAY_AREAS,
  RIZAL_MUNICIPALITIES,
  MUNICIPALITY_COORDINATES,
  IncidentReport,
} from '../types/report';
import { compressIncidentImage, fileToDataUrl, CompressionResult } from '../lib/imageCompression';
import { trackSubmission } from '../lib/offlineQueue';
import { encodeGeohash, generateReferenceCode } from '../lib/geohash';
import { db } from '../lib/firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { LeafletMap } from './LeafletMap';
import { getBarangayCoordinates, findNearestBarangay } from '../lib/barangayCoordinates';
import { isPointInRizal, findMunicipalityByPoint } from '../lib/geojsonService';
import { Language, translations } from '../lib/i18n';

// Default Rizal Province center
const RIZAL_COORDS = { lat: 14.5800, lng: 121.2800 };

interface ResidentReporterProps {
  lang: Language;
  onViewStatus: (referenceCode: string) => void;
  isOnline: boolean;
  onReportCreated?: (report: IncidentReport) => void;
}

export const ResidentReporter: React.FC<ResidentReporterProps> = ({
  lang,
  onViewStatus,
  isOnline,
  onReportCreated,
}) => {
  const t = translations[lang];

  // Form states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);

  // Location states
  const [locationTab, setLocationTab] = useState<'gps' | 'manual'>('gps');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number }>(RIZAL_COORDS);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'manual_pin'>('gps');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('');
  const [selectedBarangay, setSelectedBarangay] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isOutOfJurisdiction, setIsOutOfJurisdiction] = useState<boolean>(false);

  // Input states
  const [description, setDescription] = useState<string>('');
  const [categoryHint, setCategoryHint] = useState<IncidentCategory | ''>('');

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedReport, setSubmittedReport] = useState<{
    referenceCode: string;
    offlineSaved: boolean;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Auto-acquire GPS on mount
  useEffect(() => {
    acquireGpsLocation();
  }, []);

  // Checks spatial jurisdiction against Rizal boundary and auto-detects municipality via Ray-Casting PIP
  const checkJurisdictionAndMunicipality = async (lat: number, lng: number) => {
    try {
      const inRizal = await isPointInRizal(lat, lng);
      setIsOutOfJurisdiction(!inRizal);

      if (inRizal) {
        const detectedMun = await findMunicipalityByPoint(lat, lng);
        if (detectedMun) {
          const matchedMun =
            RIZAL_MUNICIPALITIES.find(
              (m) =>
                m === detectedMun ||
                m.toLowerCase().includes(detectedMun.toLowerCase()) ||
                detectedMun.toLowerCase().includes(m.toLowerCase())
            ) || detectedMun;

          setSelectedMunicipality(matchedMun);

          const nearest = findNearestBarangay(lat, lng);
          if (nearest && nearest.municipality === matchedMun) {
            setSelectedBarangay(nearest.barangay);
          }
        } else {
          const nearest = findNearestBarangay(lat, lng);
          if (nearest) {
            setSelectedMunicipality(nearest.municipality);
            setSelectedBarangay(nearest.barangay);
          }
        }
      }
    } catch (err) {
      console.warn('[ResidentReporter] Jurisdiction check error:', err);
    }
  };

  const acquireGpsLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationError(t.gpsFallbackNotice);
      setLocationTab('manual');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCoordinates({ lat: latitude, lng: longitude });
        setAccuracyMeters(Math.round(accuracy));
        setLocationSource('gps');
        setIsLocating(false);

        // High-precision Point-in-Polygon & geofence verification
        checkJurisdictionAndMunicipality(latitude, longitude);
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        setIsLocating(false);
        setLocationError(t.gpsFallbackNotice);
        // Automatic gentle fallback to manual picking
        setLocationTab('manual');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  };

  const handleTabSwitch = (tab: 'gps' | 'manual') => {
    setLocationTab(tab);
    if (tab === 'gps') {
      acquireGpsLocation();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSelectedFile(file);
    setIsCompressing(true);
    setImageError(null);

    try {
      const result = await compressIncidentImage(file);
      setCompressionInfo(result);
    } catch (err) {
      console.error('Image compression failed:', err);
      setSelectedFile(null);
      setImageError(
        lang === 'fil'
          ? 'Hindi maproseso ang larawan. Pumili ng ibang larawan.'
          : 'This photo could not be processed. Please choose a different photo.'
      );
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() && !compressionInfo) return;

    if (isOutOfJurisdiction) {
      setSubmitError(
        lang === 'fil'
          ? 'Hindi maipapadala ang ulat. Ang lokasyon ay nasa labas ng hurisdiksyon ng Lalawigan ng Rizal.'
          : 'Cannot submit report. The selected location is outside the jurisdiction of Rizal Province.'
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const referenceCode = generateReferenceCode();
    const geohash = encodeGeohash(coordinates.lat, coordinates.lng, 8);

    try {
      const imageDataUrl = compressionInfo
        ? await fileToDataUrl(compressionInfo.compressedFile)
        : null;

      // Report + photo are written in ONE atomic batch. Firestore's persistent local cache
      // queues the batch while offline and sends it when the device reconnects.
      const batch = writeBatch(db);
      batch.set(doc(db, 'reports', reportId), {
        referenceCode,
        createdAt: serverTimestamp(),
        status: 'pending',
        statusHistory: [
          {
            status: 'pending',
            changedBy: 'resident',
            changedAt: new Date().toISOString(),
          },
        ],
        location: {
          lat: coordinates.lat,
          lng: coordinates.lng,
          accuracyMeters,
          geohash,
          source: locationSource,
          municipality: selectedMunicipality || 'Rizal Province',
          barangay: selectedBarangay || '',
        },
        rawInput: {
          description: description.trim().slice(0, 500),
          hasImage: !!imageDataUrl,
        },
        triageStatus: 'pending',
      });
      if (imageDataUrl) {
        batch.set(doc(db, 'report_images', reportId), {
          data: imageDataUrl,
          mimeType: 'image/jpeg',
          createdAt: serverTimestamp(),
        });
      }

      // Not awaited when offline (the commit only resolves once the server confirms).
      // Once confirmed, AI triage is requested automatically.
      const commit = batch.commit();
      trackSubmission(reportId, commit);

      if (navigator.onLine) {
        // Surface rule/validation rejections instead of showing a false success
        await Promise.race([commit, new Promise<void>((resolve) => setTimeout(resolve, 8000))]);
      }

      setSubmittedReport({
        referenceCode,
        offlineSaved: !navigator.onLine,
      });
    } catch (err) {
      console.error('Submission error:', err);
      setSubmitError(
        lang === 'fil'
          ? 'Hindi naipadala ang ulat. Pakisubukang muli.'
          : 'Your report could not be submitted. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!submittedReport) return;
    navigator.clipboard.writeText(submittedReport.referenceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const resetForm = () => {
    setSelectedFile(null);
    setCompressionInfo(null);
    setDescription('');
    setCategoryHint('');
    setSelectedMunicipality('');
    setSelectedBarangay('');
    setSubmittedReport(null);
    acquireGpsLocation();
  };

  // SUCCESS VIEW
  if (submittedReport) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-tagapo-50 text-tagapo-900 border border-tagapo-200 flex items-center justify-center mx-auto">
          <CheckCircle className="w-7 h-7 text-tagapo-800" strokeWidth={2} />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-stone-950 tracking-tight uppercase">
            {t.successTitle}
          </h2>
          <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
            {t.successSubtitle}
          </p>
        </div>

        {submittedReport.offlineSaved && (
          <div className="flex items-center justify-center gap-2 text-xs text-amber-800 font-medium py-1">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{t.offlineSaved}</span>
          </div>
        )}

        {/* Reference Code Sheet */}
        <div className="py-6 border-y border-stone-200 max-w-md mx-auto">
          <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500 block mb-1">
            {t.referenceCodeLabel}
          </span>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl sm:text-4xl font-mono font-bold text-stone-950 tracking-wider">
              {submittedReport.referenceCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5 text-stone-600" />}
              <span>{copied ? t.copied : t.copyCode}</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto pt-2">
          <button
            type="button"
            onClick={() => onViewStatus(submittedReport.referenceCode)}
            className="flex-1 py-3 px-4 bg-tagapo-900 hover:bg-tagapo-800 text-white font-display font-bold uppercase tracking-wider rounded-lg text-xs flex items-center justify-center gap-2 shadow-2xs transition cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{t.trackStatusBtn}</span>
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="py-3 px-4 border border-stone-200 hover:bg-stone-50 text-stone-700 font-display font-bold uppercase tracking-wider rounded-lg text-xs transition cursor-pointer"
          >
            {t.reportAnotherBtn}
          </button>
        </div>

        {/* Footnote */}
        <div className="pt-6 text-[11px] text-stone-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-tagapo-800" />
          <span>{t.retentionNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6">
      {/* Editorial Header */}
      <div className="pb-6 border-b border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-stone-950 tracking-tight uppercase leading-none">
              {t.appTitle}
            </h1>
            <p className="text-sm text-stone-600 mt-1.5 max-w-xl leading-relaxed">
              {t.tagline}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium shrink-0">
            <ShieldCheck className="w-4 h-4 text-tagapo-800 shrink-0" />
            <span>{t.anonymousNotice}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="divide-y divide-stone-100">
        {/* Step 1: Photo Capture */}
        <div className="py-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-stone-400">01</span>
              <span className="text-stone-300 font-mono">/</span>
              <h2 className="font-display font-bold text-sm sm:text-base text-stone-950 uppercase tracking-wide">
                {t.photoCaptureTitle}
              </h2>
            </div>
            <span className="text-xs text-stone-400">{t.photoCaptureHint}</span>
          </div>

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!compressionInfo ? (
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 py-3 px-4 bg-tagapo-900 hover:bg-tagapo-800 text-white rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              >
                <Camera className="w-4 h-4" />
                <span>{t.cameraBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 px-4 bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              >
                <Upload className="w-4 h-4 text-stone-600" />
                <span>{t.galleryBtn}</span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden border border-stone-200 bg-stone-900">
              <img
                src={compressionInfo.previewUrl}
                alt="Incident capture"
                className="w-full h-56 sm:h-64 object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-stone-950/90 via-stone-950/60 to-transparent p-3 flex items-center justify-between text-xs text-white">
                <span className="font-mono text-stone-300">
                  {t.compressedTo}: {(compressionInfo.compressedSize / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setCompressionInfo(null);
                  }}
                  className="px-2.5 py-1 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded text-white font-display font-bold text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {isCompressing && (
            <p className="text-xs text-tagapo-800 flex items-center gap-1.5 animate-pulse font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t.compressing}</span>
            </p>
          )}

          {imageError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-700 py-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{imageError}</span>
            </div>
          )}
        </div>

        {/* Step 2: Location */}
        <div className="py-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-stone-400">02</span>
              <span className="text-stone-300 font-mono">/</span>
              <h2 className="font-display font-bold text-sm sm:text-base text-stone-950 uppercase tracking-wide">
                {t.locationTitle}
              </h2>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg self-start sm:self-auto">
              <button
                type="button"
                onClick={() => handleTabSwitch('gps')}
                className={`px-3 py-1 rounded text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                  locationTab === 'gps'
                    ? 'bg-white text-stone-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-tagapo-800" />
                <span>{t.locationTabGps}</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('manual')}
                className={`px-3 py-1 rounded text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                  locationTab === 'manual'
                    ? 'bg-white text-stone-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Map className="w-3.5 h-3.5 text-stone-600" />
                <span>{t.locationTabManual}</span>
              </button>
            </div>
          </div>

          {locationError && (
            <div className="border-l-2 border-amber-500 pl-3 py-1 text-xs text-amber-900">
              {locationError}
            </div>
          )}

          {/* TAB 1: GPS */}
          {locationTab === 'gps' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-semibold text-stone-900">
                    {selectedBarangay && selectedMunicipality
                      ? `Brgy. ${selectedBarangay}, ${selectedMunicipality}`
                      : 'Rizal Province'}
                  </span>
                  {accuracyMeters !== null && (
                    <span className="text-stone-400 font-mono text-[11px]">
                      (±{accuracyMeters}m)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={acquireGpsLocation}
                  disabled={isLocating}
                  className="text-stone-500 hover:text-stone-900 font-display font-bold uppercase tracking-wider text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>Sync GPS</span>
                </button>
              </div>

              {isOutOfJurisdiction && (
                <div className="text-xs text-amber-900 py-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-display font-bold uppercase tracking-wider text-amber-950">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{lang === 'fil' ? 'Labas ng Hurisdiksyon ng Rizal' : 'Outside Rizal Province Jurisdiction'}</span>
                  </div>
                  <p className="text-stone-600 pl-5 leading-normal">
                    {lang === 'fil'
                      ? 'Ang napiling lokasyon ay nasa labas ng hurisdiksyon ng Lalawigan ng Rizal (PG-ENRO). Pakisuyong ilagay ang pin sa loob ng Rizal.'
                      : 'The selected location is outside the jurisdiction of Rizal Province (PG-ENRO). Please place the pin inside Rizal.'}
                  </p>
                </div>
              )}

              <div className="relative isolate z-0 rounded-lg overflow-hidden border border-stone-200">
                <LeafletMap
                  mode="picker"
                  center={coordinates}
                  zoom={15}
                  accuracyMeters={accuracyMeters}
                  layerMode="boundaries"
                  activeMunicipality={selectedMunicipality}
                  onLocationChange={(lat, lng) => {
                    setCoordinates({ lat, lng });
                    setLocationSource('manual_pin');
                    checkJurisdictionAndMunicipality(lat, lng);
                  }}
                  className="h-56 sm:h-64 w-full"
                />
                {isLocating && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center text-xs font-display font-bold uppercase tracking-wider text-tagapo-950 gap-2 z-10">
                    <RefreshCw className="w-4 h-4 animate-spin text-tagapo-800" />
                    <span>{t.locating}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Manual */}
          {locationTab === 'manual' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">
                    {t.manualMunicipalityLabel}
                  </label>
                  <select
                    value={selectedMunicipality}
                    onChange={(e) => {
                      const mun = e.target.value;
                      setSelectedMunicipality(mun);
                      setSelectedBarangay('');
                      if (mun && MUNICIPALITY_COORDINATES[mun]) {
                        setCoordinates(MUNICIPALITY_COORDINATES[mun]);
                        setLocationSource('manual_pin');
                      }
                    }}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-1 focus:ring-tagapo-800 focus:outline-none"
                  >
                    <option value="">{t.selectMunicipality}</option>
                    {RIZAL_MUNICIPALITIES.map((mun) => (
                      <option key={mun} value={mun}>
                        {mun}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">
                    {t.manualBarangayLabel}
                  </label>
                  <select
                    value={selectedBarangay}
                    onChange={(e) => {
                      const brgy = e.target.value;
                      setSelectedBarangay(brgy);
                      if (selectedMunicipality && brgy) {
                        const brgyCoords = getBarangayCoordinates(selectedMunicipality, brgy);
                        if (brgyCoords) {
                          setCoordinates(brgyCoords);
                          setLocationSource('manual_pin');
                        }
                      } else if (selectedMunicipality && MUNICIPALITY_COORDINATES[selectedMunicipality]) {
                        setCoordinates(MUNICIPALITY_COORDINATES[selectedMunicipality]);
                        setLocationSource('manual_pin');
                      }
                    }}
                    disabled={!selectedMunicipality}
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-stone-200 rounded-lg focus:ring-1 focus:ring-tagapo-800 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
                  >
                    <option value="">
                      {selectedMunicipality ? t.selectBarangayActive : t.selectBarangay}
                    </option>
                    {selectedMunicipality && RIZAL_BARANGAY_AREAS[selectedMunicipality]
                      ? RIZAL_BARANGAY_AREAS[selectedMunicipality].map((area) => (
                          <optgroup key={area.label} label={area.label}>
                            {area.barangays.map((brgy) => (
                              <option key={brgy} value={brgy}>
                                Brgy. {brgy}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : selectedMunicipality &&
                        RIZAL_LGUS[selectedMunicipality]?.map((brgy) => (
                          <option key={brgy} value={brgy}>
                            Brgy. {brgy}
                          </option>
                        ))}
                  </select>
                </div>
              </div>

              {isOutOfJurisdiction && (
                <div className="text-xs text-amber-900 py-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-display font-bold uppercase tracking-wider text-amber-950">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{lang === 'fil' ? 'Labas ng Hurisdiksyon ng Rizal' : 'Outside Rizal Province Jurisdiction'}</span>
                  </div>
                  <p className="text-stone-600 pl-5 leading-normal">
                    {lang === 'fil'
                      ? 'Ang napiling lokasyon ay nasa labas ng hurisdiksyon ng Lalawigan ng Rizal (PG-ENRO). Pakisuyong ilagay ang pin sa loob ng Rizal.'
                      : 'The selected location is outside the jurisdiction of Rizal Province (PG-ENRO). Please place the pin inside Rizal.'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-stone-500">
                <span className="flex items-center gap-1 text-[11px] text-stone-600">
                  <MapPin className="w-3.5 h-3.5 text-tagapo-800 shrink-0" />
                  {t.tapToPinHint}
                </span>
                <span className="text-[11px] text-stone-400 font-mono">
                  {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </span>
              </div>

              <div className="relative isolate z-0 rounded-lg overflow-hidden border border-stone-200">
                <LeafletMap
                  mode="picker"
                  center={coordinates}
                  zoom={14}
                  accuracyMeters={null}
                  layerMode="boundaries"
                  activeMunicipality={selectedMunicipality}
                  onLocationChange={(lat, lng) => {
                    setCoordinates({ lat, lng });
                    setLocationSource('manual_pin');
                    checkJurisdictionAndMunicipality(lat, lng);
                  }}
                  className="h-64 sm:h-72 w-full cursor-crosshair"
                />
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Description */}
        <div className="py-6 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-stone-400">03</span>
              <span className="text-stone-300 font-mono">/</span>
              <h2 className="font-display font-bold text-sm sm:text-base text-stone-950 uppercase tracking-wide">
                {t.descriptionTitle}
              </h2>
            </div>
            <span
              className={`text-xs font-mono ${
                description.length > 450 ? 'text-amber-700 font-bold' : 'text-stone-400'
              }`}
            >
              {500 - description.length} {t.charsRemaining}
            </span>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            rows={3}
            required
            placeholder={t.descriptionPlaceholder}
            className="w-full px-3.5 py-2.5 text-sm bg-stone-50/50 hover:bg-stone-50 focus:bg-white border border-stone-200 rounded-lg focus:ring-1 focus:ring-tagapo-800 focus:border-tagapo-800 focus:outline-none transition placeholder:text-stone-400 text-stone-900"
          />

          <p className="text-[11px] text-stone-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <span>{t.untrustedInputNotice}</span>
          </p>
        </div>

        {/* Step 4: Optional Category Hint */}
        <div className="py-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-stone-400">04</span>
            <span className="text-stone-300 font-mono">/</span>
            <label className="font-display font-bold text-sm sm:text-base text-stone-950 uppercase tracking-wide">
              {t.categoryHintLabel}
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {(Object.keys(CATEGORIES) as IncidentCategory[])
              .filter((cat) => cat !== 'not_environmental')
              .map((catKey) => {
                const cat = CATEGORIES[catKey];
                const isSelected = categoryHint === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setCategoryHint(isSelected ? '' : catKey)}
                    className={`px-3 py-1.5 rounded-full text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-tagapo-950 text-white font-semibold shadow-2xs'
                        : 'bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium'
                    }`}
                  >
                    <span>{lang === 'fil' ? cat.labelFil : cat.labelEn}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Submit & Compliance */}
        <div className="pt-6 space-y-3">
          {submitError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-700 py-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isCompressing || !description.trim() || isOutOfJurisdiction}
            className="w-full py-3.5 px-6 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 disabled:bg-stone-200 disabled:text-stone-400 text-white font-display font-bold tracking-wider uppercase text-sm rounded-lg shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t.submitting}</span>
              </>
            ) : (
              <>
                <span>{t.submitBtn}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="text-[11px] text-stone-400 text-center leading-relaxed">
            <span className="font-semibold text-stone-600">RA 10173 Protected: </span>
            {t.privacyNotice}
          </div>
        </div>
      </form>
    </div>
  );
};
