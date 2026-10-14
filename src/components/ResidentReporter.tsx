import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Copy,
  Info,
  Clock,
  ArrowRight,
  RefreshCw,
  Shield,
  FileText,
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

        // Auto-detect nearest municipality & barangay in Rizal
        const nearest = findNearestBarangay(latitude, longitude);
        if (nearest) {
          setSelectedMunicipality(nearest.municipality);
          setSelectedBarangay(nearest.barangay);
        }
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
      <div className="max-w-2xl mx-auto p-6 sm:p-8 my-6 bg-white rounded-2xl border border-stone-200 shadow-sm">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-tagapo-100 text-tagapo-900 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10" />
          </div>

          <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-stone-900 tracking-tight uppercase">
            {t.successTitle}
          </h2>

          <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
            {t.successSubtitle}
          </p>

          {submittedReport.offlineSaved && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2 text-left">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{t.offlineSaved}</span>
            </div>
          )}

          {/* Reference Code Card */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 my-6 text-center">
            <span className="font-display text-xs font-bold uppercase tracking-wider text-tagapo-900">
              {t.referenceCodeLabel}
            </span>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-stone-950 mt-1.5 tracking-widest">
              {submittedReport.referenceCode}
            </div>

            <button
              onClick={handleCopyCode}
              className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 text-white font-display font-bold text-xs uppercase tracking-wide rounded-lg shadow-xs hover:shadow transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? t.copied : t.copyCode}</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => onViewStatus(submittedReport.referenceCode)}
              className="flex-1 py-3 px-4 bg-tagapo-900 hover:bg-tagapo-800 text-white font-display font-bold uppercase tracking-wider rounded-xl text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>{t.trackStatusBtn}</span>
            </button>

            <button
              onClick={resetForm}
              className="py-3 px-4 border border-stone-300 hover:bg-stone-50 text-stone-700 font-display font-bold uppercase tracking-wider rounded-xl text-sm transition cursor-pointer"
            >
              {t.reportAnotherBtn}
            </button>
          </div>

          {/* Privacy footer */}
          <div className="pt-4 border-t border-stone-100 text-[11px] text-stone-400 flex items-center justify-center gap-1">
            <Shield className="w-3.5 h-3.5 text-tagapo-800" />
            <span>{t.retentionNote}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6">
      {/* Title & Tactical Status Header */}
      <div className="pb-6 border-b border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-stone-950 tracking-tight uppercase leading-none">
              {t.appTitle}
            </h1>
            <p className="text-sm text-stone-600 mt-2 max-w-xl leading-relaxed">
              {t.tagline}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold rounded-md shrink-0">
            <Shield className="w-3.5 h-3.5 text-tagapo-800 shrink-0" />
            <span>{t.anonymousNotice}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="py-6 space-y-8">
        {/* Step 1: Photo Capture */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-stone-100 pb-2">
            <h2 className="font-display font-bold text-base sm:text-lg text-stone-900 tracking-wide uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-tagapo-900 text-white text-xs font-bold flex items-center justify-center font-mono">1</span>
              <span>{t.photoCaptureTitle}</span>
            </h2>
            <span className="text-xs text-stone-400 font-medium">{t.photoCaptureHint}</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="group flex items-center gap-4 p-4 sm:p-5 bg-white border border-stone-200 hover:border-tagapo-800/50 rounded-xl shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-xs transition-all duration-150 cursor-pointer text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-tagapo-50 group-hover:bg-tagapo-100 text-tagapo-900 flex items-center justify-center shrink-0 transition-colors">
                  <Camera className="w-6 h-6 text-tagapo-800" strokeWidth={2.2} />
                </div>
                <div>
                  <div className="font-display font-bold text-sm sm:text-base text-stone-900 tracking-wide uppercase">
                    {t.cameraBtn}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {lang === 'fil' ? 'Kumuha ng litrato gamit ang kamera' : 'Capture photo directly from camera'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group flex items-center gap-4 p-4 sm:p-5 bg-white border border-stone-200 hover:border-navy-800/50 rounded-xl shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-xs transition-all duration-150 cursor-pointer text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-navy-50 group-hover:bg-navy-100 text-navy-900 flex items-center justify-center shrink-0 transition-colors">
                  <Upload className="w-6 h-6 text-navy-800" strokeWidth={2.2} />
                </div>
                <div>
                  <div className="font-display font-bold text-sm sm:text-base text-stone-900 tracking-wide uppercase">
                    {t.galleryBtn}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {lang === 'fil' ? 'Mag-upload mula sa album / storage' : 'Upload photo from file gallery'}
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-stone-200 bg-stone-900 shadow-sm">
              <img
                src={compressionInfo.previewUrl}
                alt="Incident capture"
                className="w-full h-64 sm:h-72 object-cover"
              />
              <div className="absolute bottom-3 left-3 right-3 bg-stone-950/85 backdrop-blur-md text-white px-4 py-2.5 rounded-lg flex items-center justify-between text-xs border border-white/10">
                <span className="font-mono text-stone-300">
                  {t.compressedTo}: {(compressionInfo.compressedSize / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setCompressionInfo(null);
                  }}
                  className="text-stone-300 hover:text-white font-display font-bold uppercase tracking-wider text-xs underline cursor-pointer"
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
            <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              {imageError}
            </p>
          )}
        </div>

        {/* Step 2: Location (Dual-Mode: GPS On-Site vs Pick on Map) */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2">
            <h2 className="font-display font-bold text-base sm:text-lg text-stone-900 tracking-wide uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-tagapo-900 text-white text-xs font-bold flex items-center justify-center font-mono">2</span>
              <span>{t.locationTitle}</span>
            </h2>

            {/* Tactical Location Mode Segmented Tabs */}
            <div className="bg-stone-100 p-0.5 rounded-lg border border-stone-200 flex items-center gap-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => handleTabSwitch('gps')}
                className={`px-3 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                  locationTab === 'gps'
                    ? 'bg-tagapo-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <span>{t.locationTabGps}</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('manual')}
                className={`px-3 py-1 rounded-md text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                  locationTab === 'manual'
                    ? 'bg-tagapo-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <span>{t.locationTabManual}</span>
              </button>
            </div>
          </div>

          {/* Fallback Notice if GPS failed */}
          {locationError && (
            <div role="alert" className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center gap-2.5 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{locationError}</span>
            </div>
          )}

          {/* TAB 1: GPS (On-site reporting) */}
          {locationTab === 'gps' && (
            <div className="space-y-2.5">
              {/* GPS Verified Status Banner */}
              <div className="p-3 bg-tagapo-50/70 border border-tagapo-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-tagapo-900">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{locationSource === 'gps' ? t.gpsAcquiredBadge : t.locating}</span>
                  </div>
                  <div className="text-xs text-stone-600 font-medium">
                    {selectedBarangay && selectedMunicipality
                      ? `Brgy. ${selectedBarangay}, ${selectedMunicipality}`
                      : 'Rizal Province'}
                    {accuracyMeters !== null && ` • ±${accuracyMeters}m radius`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={acquireGpsLocation}
                  disabled={isLocating}
                  className="px-2.5 py-1 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 rounded-lg text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>GPS Sync</span>
                </button>
              </div>

              {/* Map Preview with accuracy circle */}
              <div className="relative isolate z-0 rounded-xl overflow-hidden border border-stone-300 shadow-sm">
                <LeafletMap
                  mode="picker"
                  center={coordinates}
                  zoom={15}
                  accuracyMeters={accuracyMeters}
                  onLocationChange={(lat, lng) => {
                    setCoordinates({ lat, lng });
                    setLocationSource('manual_pin');
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

          {/* TAB 2: Pick on Map / Choose Barangay (for reporting seen elsewhere) */}
          {locationTab === 'manual' && (
            <div className="space-y-2.5">
              {/* Municipality & Barangay selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-display text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">
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
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-stone-300 rounded-xl focus:ring-1 focus:ring-tagapo-800 focus:outline-none shadow-2xs"
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
                  <label className="block font-display text-xs font-bold uppercase tracking-wide text-stone-600 mb-1">
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
                    className="w-full text-xs font-medium px-3 py-2 bg-white border border-stone-300 rounded-xl focus:ring-1 focus:ring-tagapo-800 focus:outline-none disabled:bg-stone-100 disabled:text-stone-400 shadow-2xs"
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

              {/* Tap to Pin Instruction Bar */}
              <div className="flex items-center justify-between text-xs text-stone-500 pt-0.5">
                <span className="flex items-center gap-1 text-[11px] text-stone-600 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-tagapo-800 shrink-0" />
                  {t.tapToPinHint}
                </span>
                <span className="text-[11px] text-stone-500 font-mono bg-stone-100 px-2 py-0.5 rounded border border-stone-200 shrink-0">
                  {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </span>
              </div>

              {/* Interactive Click-to-Pin Map */}
              <div className="relative isolate z-0 rounded-xl overflow-hidden border border-stone-300 shadow-sm">
                <LeafletMap
                  mode="picker"
                  center={coordinates}
                  zoom={14}
                  accuracyMeters={null}
                  onLocationChange={(lat, lng) => {
                    setCoordinates({ lat, lng });
                    setLocationSource('manual_pin');
                    // Check if dragged to a different barangay
                    const nearest = findNearestBarangay(lat, lng);
                    if (nearest && nearest.distanceMeters < 3000) {
                      setSelectedMunicipality(nearest.municipality);
                      setSelectedBarangay(nearest.barangay);
                    }
                  }}
                  className="h-64 sm:h-72 w-full cursor-crosshair"
                />
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Description */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-stone-100 pb-2">
            <h2 className="font-display font-bold text-base sm:text-lg text-stone-900 tracking-wide uppercase flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-tagapo-900 text-white text-xs font-bold flex items-center justify-center font-mono">3</span>
              <span>{t.descriptionTitle}</span>
            </h2>
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
            className="w-full px-4 py-3 text-sm bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-tagapo-800 focus:border-tagapo-800 focus:outline-none transition shadow-2xs placeholder:text-stone-400"
          />

          <p className="text-[11px] text-stone-500 italic flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-tagapo-800 shrink-0" />
            <span>{t.untrustedInputNotice}</span>
          </p>
        </div>

        {/* Step 4: Optional Category Hint */}
        <div className="space-y-2">
          <label className="block font-display text-xs font-bold uppercase tracking-wide text-stone-600">
            {t.categoryHintLabel}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
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
                    className={`p-2.5 text-left rounded-lg text-xs font-semibold transition border cursor-pointer ${
                      isSelected
                        ? 'bg-tagapo-900 text-white border-tagapo-950 shadow-xs'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50 hover:border-stone-300'
                    }`}
                  >
                    <div className="truncate">
                      {lang === 'fil' ? cat.labelFil : cat.labelEn}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Privacy Act Compliance Notice */}
        <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-700 leading-relaxed flex items-start gap-3">
          <Shield className="w-4 h-4 text-tagapo-800 shrink-0 mt-0.5" />
          <div>
            <span className="font-display font-bold uppercase tracking-wider text-stone-900">RA 10173 Compliance: </span>
            {t.privacyNotice}
          </div>
        </div>

        {submitError && (
          <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {submitError}
          </p>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || isCompressing || !description.trim()}
          className="w-full py-4 px-6 bg-tagapo-900 hover:bg-tagapo-800 active:bg-tagapo-950 disabled:bg-stone-200 disabled:text-stone-400 text-white font-display font-bold tracking-wider uppercase text-base rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>{t.submitting}</span>
            </>
          ) : (
            <>
              <span>{t.submitBtn}</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
