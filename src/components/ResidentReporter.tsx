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
  Trash2,
  Lock,
} from 'lucide-react';
import {
  IncidentCategory,
  CATEGORIES,
  RIZAL_LGUS,
  RIZAL_BARANGAY_AREAS,
  RIZAL_MUNICIPALITIES,
  MUNICIPALITY_COORDINATES,
  IncidentReport,
  EvidenceSlotRole,
  ReportImageItem,
  ExifSummary,
} from '../types/report';
import { compressIncidentImage, fileToDataUrl } from '../lib/imageCompression';
import { extractExifFromBlob } from '../lib/exifVerifier';
import {
  checkSubmissionRateLimit,
  recordSubmission,
  formatCooldownTime,
  RateLimitCheckResult,
} from '../lib/rateLimiter';
import { trackSubmission } from '../lib/offlineQueue';
import { encodeGeohash, generateReferenceCode } from '../lib/geohash';
import { db } from '../lib/firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { LeafletMap, BasemapMode } from './LeafletMap';
import { getBarangayCoordinates, findNearestBarangay } from '../lib/barangayCoordinates';
import { isPointInRizal, findMunicipalityByPoint, findProtectedZoneByCoordinates, type ProtectedZoneFeatureProperties } from '../lib/geojsonService';
import { Language, translations } from '../lib/i18n';
import { useTheme } from '../lib/theme';

// Default Rizal Province center
const RIZAL_COORDS = { lat: 14.5800, lng: 121.2800 };

interface EvidenceSlotItem {
  file: File;
  previewUrl: string;
  compressedBlob: Blob;
  compressedSize: number;
  captureMethod: 'live_camera' | 'gallery';
  exif: ExifSummary | null;
}

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
  const { theme } = useTheme();

  // 3-Slot Structured Evidence State
  const [slots, setSlots] = useState<Record<EvidenceSlotRole, EvidenceSlotItem | null>>({
    primary: null,
    wide_scene: null,
    landmark: null,
  });
  const [compressingSlot, setCompressingSlot] = useState<EvidenceSlotRole | null>(null);
  const [activeSlotTarget, setActiveSlotTarget] = useState<EvidenceSlotRole | null>(null);
  const [slotErrors, setSlotErrors] = useState<Partial<Record<EvidenceSlotRole, string>>>({});

  // Rate Limiting & Anti-Bot States
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitCheckResult>(() => checkSubmissionRateLimit());
  const [honeypot, setHoneypot] = useState<string>('');
  const mountTimeRef = useRef<number>(Date.now());

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
  const [detectedProtectedZone, setDetectedProtectedZone] = useState<ProtectedZoneFeatureProperties | null>(null);

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>(() => (theme === 'dark' ? 'dark' : 'street'));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Automatically sync map basemap with dark/light mode so no separate clicks are needed
  useEffect(() => {
    if (theme === 'dark') {
      setBasemapMode('dark');
    } else {
      setBasemapMode('street');
    }
  }, [theme]);

  // Auto-acquire GPS on mount
  useEffect(() => {
    acquireGpsLocation();
  }, []);

  // Live rate-limit tick
  useEffect(() => {
    const interval = setInterval(() => {
      setRateLimitInfo(checkSubmissionRateLimit());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Checks spatial jurisdiction against Rizal boundary and auto-detects municipality via Ray-Casting PIP
  const checkJurisdictionAndMunicipality = async (lat: number, lng: number) => {
    try {
      const inRizal = await isPointInRizal(lat, lng);
      setIsOutOfJurisdiction(!inRizal);

      if (inRizal) {
        findProtectedZoneByCoordinates(lat, lng)
          .then((zone) => setDetectedProtectedZone(zone))
          .catch(() => setDetectedProtectedZone(null));

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

  const handleTriggerCapture = (role: EvidenceSlotRole, method: 'live_camera' | 'gallery') => {
    setActiveSlotTarget(role);
    if (method === 'live_camera') {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, method: 'live_camera' | 'gallery') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSlotTarget) return;

    const targetRole = activeSlotTarget;
    setCompressingSlot(targetRole);
    setSlotErrors((prev) => ({ ...prev, [targetRole]: undefined }));

    try {
      const [exifData, compressionResult] = await Promise.all([
        extractExifFromBlob(file, coordinates),
        compressIncidentImage(file),
      ]);

      const exifSummary: ExifSummary = {
        hasExif: exifData.hasExif,
        capturedAt: exifData.capturedAt || null,
        isRecent: exifData.isRecent ?? null,
        ageHours: exifData.ageHours ?? null,
        distanceFromReportKm: exifData.distanceFromReportKm ?? null,
        locationMismatch: exifData.locationMismatch ?? false,
        cameraModel: [exifData.cameraMake, exifData.cameraModel].filter(Boolean).join(' ') || null,
        isPossibleSyntheticOrEdited: exifData.isPossibleSyntheticOrEdited ?? false,
        notes: exifData.notes,
      };

      setSlots((prev) => ({
        ...prev,
        [targetRole]: {
          file,
          previewUrl: compressionResult.previewUrl,
          compressedBlob: compressionResult.compressedFile,
          compressedSize: compressionResult.compressedSize,
          captureMethod: method,
          exif: exifSummary,
        },
      }));
    } catch (err) {
      console.error('[ResidentReporter] Image processing failed:', err);
      setSlotErrors((prev) => ({
        ...prev,
        [targetRole]:
          lang === 'fil'
            ? 'Hindi maproseso ang larawan. Pakisubukang muli.'
            : 'Could not process photo. Please try again.',
      }));
    } finally {
      setCompressingSlot(null);
    }
  };

  const handleRemoveSlot = (role: EvidenceSlotRole) => {
    setSlots((prev) => ({ ...prev, [role]: null }));
    setSlotErrors((prev) => ({ ...prev, [role]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Rate Limit Enforcement
    const rateCheck = checkSubmissionRateLimit();
    if (!rateCheck.allowed) {
      const waitStr = formatCooldownTime(rateCheck.remainingSeconds);
      setSubmitError(
        rateCheck.reason === 'burst'
          ? (lang === 'fil'
              ? `Naka-cooldown upang maiwasan ang spam. Maghintay nang ${waitStr} bago magsumite muli.`
              : `Submission cooldown active to prevent spam. Please wait ${waitStr} before submitting another report.`)
          : (lang === 'fil'
              ? `Naabot na ang limitasyon ng ${rateCheck.maxPerDay} ulat bawat araw para sa device na ito.`
              : `Daily limit of ${rateCheck.maxPerDay} reports reached for this device.`)
      );
      return;
    }

    // 2. Anti-Bot Honeypot: silently drop automated bots
    if (honeypot.trim() !== '') {
      console.warn('[Security] Bot honeypot triggered. Silently dropping payload.');
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        resetForm();
      }, 1000);
      return;
    }

    // 3. Human Velocity Check (< 2500ms since mount)
    if (Date.now() - mountTimeRef.current < 2500) {
      setSubmitError(
        lang === 'fil'
          ? 'Masyadong mabilis ang pagsusumite. Pakisuri muli ang iyong ulat bago ipadala.'
          : 'Submission too rapid. Please review your report before sending.'
      );
      return;
    }

    const filledSlots = (['primary', 'wide_scene', 'landmark'] as EvidenceSlotRole[])
      .map((role) => ({ role, item: slots[role] }))
      .filter((s): s is { role: EvidenceSlotRole; item: EvidenceSlotItem } => s.item !== null);

    if (!description.trim() && filledSlots.length === 0) return;

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
      const imageItems: ReportImageItem[] = [];
      for (const { role, item } of filledSlots) {
        const dataUrl = await fileToDataUrl(item.compressedBlob);
        imageItems.push({
          data: dataUrl,
          mimeType: 'image/jpeg',
          role,
          isLiveCamera: item.captureMethod === 'live_camera',
        });
      }

      const primaryImage = imageItems.find((img) => img.role === 'primary') || imageItems[0] || null;
      const hasLive = imageItems.some((img) => img.isLiveCamera);
      const hasGallery = imageItems.some((img) => !img.isLiveCamera);
      const overallCaptureMethod: 'live_camera' | 'gallery' | 'mixed' | undefined =
        imageItems.length === 0
          ? undefined
          : hasLive && hasGallery
          ? 'mixed'
          : hasLive
          ? 'live_camera'
          : 'gallery';

      const primaryExif = slots.primary?.exif || slots.wide_scene?.exif || slots.landmark?.exif || null;

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
          hasImage: imageItems.length > 0,
          imageCount: imageItems.length,
          ...(overallCaptureMethod ? { captureMethod: overallCaptureMethod } : {}),
          ...(primaryExif ? { exif: primaryExif } : {}),
        },
        triageStatus: 'pending',
      });

      if (primaryImage) {
        batch.set(doc(db, 'report_images', reportId), {
          data: primaryImage.data, // Backward compatibility with single-image readers
          images: imageItems,      // Multi-slot evidence deck
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

      // Record successful submission for client-side rate limiting
      recordSubmission();
      setRateLimitInfo(checkSubmissionRateLimit());

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
    setSlots({ primary: null, wide_scene: null, landmark: null });
    setSlotErrors({});
    setDescription('');
    setCategoryHint('');
    setSelectedMunicipality('');
    setSelectedBarangay('');
    setSubmittedReport(null);
    mountTimeRef.current = Date.now();
    acquireGpsLocation();
  };

  // SUCCESS VIEW
  if (submittedReport) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 flex items-center justify-center mx-auto">
          <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-bold text-2xl sm:text-3xl text-stone-900 dark:text-white tracking-tight">
            {t.successTitle}
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
            {t.successSubtitle}
          </p>
        </div>

        {submittedReport.offlineSaved && (
          <div className="flex items-center justify-center gap-2 text-xs text-amber-800 dark:text-amber-400 font-medium py-1">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{t.offlineSaved}</span>
          </div>
        )}

        {/* Reference Code Sheet */}
        <div className="py-6 border-y border-stone-200 dark:border-stone-800 max-w-md mx-auto">
          <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400 block mb-1">
            {t.referenceCodeLabel}
          </span>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl sm:text-4xl font-mono font-bold text-stone-950 dark:text-white tracking-wider">
              {submittedReport.referenceCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold rounded-md transition cursor-pointer flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />}
              <span>{copied ? t.copied : t.copyCode}</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto pt-2">
          <button
            type="button"
            onClick={() => onViewStatus(submittedReport.referenceCode)}
            className="flex-1 py-3 px-4 bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 shadow-2xs transition cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{t.trackStatusBtn}</span>
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="py-3 px-4 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-900 text-stone-700 dark:text-stone-300 font-semibold rounded-lg text-xs transition cursor-pointer"
          >
            {t.reportAnotherBtn}
          </button>
        </div>

        {/* Footnote */}
        <div className="pt-6 text-[11px] text-stone-400 dark:text-stone-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
          <span>{t.retentionNote}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6">
      {/* Editorial Header */}
      <div className="pb-6 border-b border-stone-200 dark:border-stone-800">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h1 className="font-bold text-2xl sm:text-3xl text-stone-900 dark:text-white tracking-tight leading-tight">
              {t.appTitle}
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1.5 max-w-xl leading-relaxed">
              {t.tagline}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 font-medium shrink-0">
            <ShieldCheck className="w-4 h-4 text-stone-400 dark:text-stone-500 shrink-0" />
            <span>{t.anonymousNotice}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="divide-y divide-stone-100 dark:divide-stone-850">
        {/* Step 1: Structured Evidence Capture */}
        <div className="py-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-stone-400 dark:text-stone-500">01</span>
              <span className="text-stone-300 dark:text-stone-700 font-mono">/</span>
              <h2 className="font-semibold text-sm sm:text-base text-stone-900 dark:text-white">
                {t.evidenceTitle}
              </h2>
            </div>
            <span className="text-xs text-stone-400 dark:text-stone-500">{t.photoCaptureHint}</span>
          </div>

          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            {t.evidenceSubtitle}
          </p>

          {/* Cooldown Alert Banner if currently rate-limited */}
          {!rateLimitInfo.allowed && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-amber-900 dark:text-amber-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <span className="font-medium">
                  {rateLimitInfo.reason === 'burst'
                    ? `${t.cooldownNotice} (${formatCooldownTime(rateLimitInfo.remainingSeconds)})`
                    : `${t.cooldownNotice} (Daily quota: 5/5 reached)`}
                </span>
              </div>
              <span className="font-mono font-bold text-amber-800 dark:text-amber-300 shrink-0">
                {formatCooldownTime(rateLimitInfo.remainingSeconds)}
              </span>
            </div>
          )}

          {/* Hidden camera & file picker inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileChange(e, 'live_camera')}
            className="hidden"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e, 'gallery')}
            className="hidden"
          />

          {/* 3 Structured Evidence Slots */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {(
              [
                {
                  role: 'primary' as EvidenceSlotRole,
                  title: t.slotPrimaryTitle,
                  desc: t.slotPrimaryDesc,
                  badge: 'Required',
                  badgeClass: 'bg-stone-900 text-white dark:bg-emerald-700 dark:text-white',
                },
                {
                  role: 'wide_scene' as EvidenceSlotRole,
                  title: t.slotWideTitle,
                  desc: t.slotWideDesc,
                  badge: 'Recommended',
                  badgeClass: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
                },
                {
                  role: 'landmark' as EvidenceSlotRole,
                  title: t.slotLandmarkTitle,
                  desc: t.slotLandmarkDesc,
                  badge: 'Optional',
                  badgeClass: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
                },
              ] as const
            ).map((slotDef) => {
              const slotData = slots[slotDef.role];
              const isCompressingThis = compressingSlot === slotDef.role;
              const errorThis = slotErrors[slotDef.role];

              return (
                <div
                  key={slotDef.role}
                  className={`rounded-lg border transition p-3 flex flex-col justify-between ${
                    slotData
                      ? 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xs'
                      : 'border-dashed border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40 hover:bg-stone-50 dark:hover:bg-stone-900/70'
                  }`}
                >
                  {/* Slot Header */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 leading-tight">
                        {slotDef.title}
                      </span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium shrink-0 ${slotDef.badgeClass}`}>
                        {slotDef.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
                      {slotDef.desc}
                    </p>
                  </div>

                  {/* Slot Content: Empty State vs Loaded Preview */}
                  <div className="mt-3">
                    {isCompressingThis ? (
                      <div className="h-32 flex flex-col items-center justify-center gap-2 text-stone-500 dark:text-stone-400 text-xs rounded-md bg-stone-100 dark:bg-stone-800 animate-pulse">
                        <RefreshCw className="w-4 h-4 animate-spin text-stone-700 dark:text-stone-300" />
                        <span>{t.compressing}</span>
                      </div>
                    ) : slotData ? (
                      <div className="space-y-2">
                        <div className="relative rounded-md overflow-hidden bg-stone-900 aspect-4/3 group">
                          <img
                            src={slotData.previewUrl}
                            alt={slotDef.title}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveSlot(slotDef.role)}
                            title="Remove photo"
                            className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/90 text-white rounded-md transition cursor-pointer backdrop-blur-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <div className="absolute bottom-1.5 left-1.5">
                            {slotData.captureMethod === 'live_camera' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100/95 dark:text-emerald-300 dark:bg-emerald-950/90 backdrop-blur-xs px-1.5 py-0.5 rounded shadow-2xs">
                                <Camera className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                                {t.liveCameraBadge}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-700 bg-white/95 dark:text-stone-300 dark:bg-stone-850/90 backdrop-blur-xs px-1.5 py-0.5 rounded shadow-2xs">
                                <Upload className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                                {t.galleryBadge}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* EXIF / File telemetry pill */}
                        <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                          <span>{(slotData.compressedSize / 1024).toFixed(0)} KB</span>
                          {slotData.exif?.cameraModel && (
                            <span className="truncate max-w-[110px]" title={slotData.exif.cameraModel}>
                              {slotData.exif.cameraModel}
                            </span>
                          )}
                          {slotData.exif?.distanceFromReportKm !== null && slotData.exif?.distanceFromReportKm !== undefined && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              GPS: {slotData.exif.distanceFromReportKm}km
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => handleTriggerCapture(slotDef.role, 'live_camera')}
                          className="w-full py-2 px-2.5 bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{t.cameraBtn}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerCapture(slotDef.role, 'gallery')}
                          className="w-full py-1.5 px-2 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Upload className="w-3 h-3 text-stone-500 dark:text-stone-400" />
                          <span>{t.galleryBtn}</span>
                        </button>
                      </div>
                    )}

                    {errorThis && (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-700 dark:text-rose-400">
                        <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span>{errorThis}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Location */}
        <div className="py-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-stone-400 dark:text-stone-500">02</span>
              <span className="text-stone-300 dark:text-stone-700 font-mono">/</span>
              <h2 className="font-semibold text-sm sm:text-base text-stone-900 dark:text-white">
                {t.locationTitle}
              </h2>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-900 p-1 rounded-lg self-start sm:self-auto border border-transparent dark:border-stone-800">
              <button
                type="button"
                onClick={() => handleTabSwitch('gps')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  locationTab === 'gps'
                    ? 'bg-white dark:bg-stone-800 text-stone-950 dark:text-white shadow-2xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                <span>{t.locationTabGps}</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('manual')}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  locationTab === 'manual'
                    ? 'bg-white dark:bg-stone-800 text-stone-950 dark:text-white shadow-2xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                <Map className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                <span>{t.locationTabManual}</span>
              </button>
            </div>
          </div>

          {locationError && (
            <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>{locationError}</span>
            </div>
          )}

          {/* TAB 1: GPS */}
          {locationTab === 'gps' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {selectedBarangay && selectedMunicipality
                      ? `Brgy. ${selectedBarangay}, ${selectedMunicipality}`
                      : 'Rizal Province'}
                  </span>
                  {accuracyMeters !== null && (
                    <span className="text-stone-400 dark:text-stone-500 font-mono text-[11px]">
                      (±{accuracyMeters}m)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={acquireGpsLocation}
                  disabled={isLocating}
                  className="text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>Sync GPS</span>
                </button>
              </div>

              {isOutOfJurisdiction && (
                <div className="text-xs text-amber-900 dark:text-amber-300 py-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-950 dark:text-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{lang === 'fil' ? 'Labas ng Hurisdiksyon ng Rizal' : 'Outside Rizal Province Jurisdiction'}</span>
                  </div>
                  <p className="text-stone-600 dark:text-stone-400 pl-5 leading-normal">
                    {lang === 'fil'
                      ? 'Ang napiling lokasyon ay nasa labas ng hurisdiksyon ng Lalawigan ng Rizal (PG-ENRO). Pakisuyong ilagay ang pin sa loob ng Rizal.'
                      : 'The selected location is outside the jurisdiction of Rizal Province (PG-ENRO). Please place the pin inside Rizal.'}
                  </p>
                </div>
              )}

              {detectedProtectedZone && !isOutOfJurisdiction && (
                <div className="p-2.5 bg-stone-50 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 text-xs flex items-start gap-2 shadow-2xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 min-w-0">
                    <span className="font-semibold text-stone-900 dark:text-stone-100 block leading-tight">
                      {t.protectedZoneNoticeResident}: {detectedProtectedZone.shortName}
                    </span>
                    <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                      {detectedProtectedZone.legalNote}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">Map View</span>
                <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-900 p-0.5 rounded-md text-[11px] font-semibold border border-transparent dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => setBasemapMode(theme === 'dark' ? 'dark' : 'street')}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      basemapMode === 'street' || basemapMode === 'dark'
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                    }`}
                  >
                    {theme === 'dark' ? 'Dark' : 'Street'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBasemapMode('satellite')}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      basemapMode === 'satellite'
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                    }`}
                  >
                    Satellite
                  </button>
                </div>
              </div>

              <div className="relative isolate z-0 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800">
                <LeafletMap
                  mode="picker"
                  center={coordinates}
                  zoom={15}
                  accuracyMeters={accuracyMeters}
                  layerMode="boundaries"
                  basemap={basemapMode}
                  activeMunicipality={selectedMunicipality}
                  onLocationChange={(lat, lng) => {
                    setCoordinates({ lat, lng });
                    setLocationSource('manual_pin');
                    checkJurisdictionAndMunicipality(lat, lng);
                  }}
                  className="h-56 sm:h-64 w-full"
                />
                {isLocating && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-stone-950/80 backdrop-blur-xs flex items-center justify-center text-xs font-semibold text-stone-900 dark:text-white gap-2 z-10">
                    <RefreshCw className="w-4 h-4 animate-spin text-stone-700 dark:text-emerald-400" />
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
                  <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
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
                    className="w-full text-xs font-medium px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-stone-900 dark:text-white focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 focus:outline-none"
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
                  <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
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
                    className="w-full text-xs font-medium px-3 py-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-stone-900 dark:text-white focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 focus:outline-none disabled:bg-stone-50 dark:disabled:bg-stone-950 disabled:text-stone-400 dark:disabled:text-stone-600"
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
                <div className="text-xs text-amber-900 dark:text-amber-300 py-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-950 dark:text-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{lang === 'fil' ? 'Labas ng Hurisdiksyon ng Rizal' : 'Outside Rizal Province Jurisdiction'}</span>
                  </div>
                  <p className="text-stone-600 dark:text-stone-400 pl-5 leading-normal">
                    {lang === 'fil'
                      ? 'Ang napiling lokasyon ay nasa labas ng hurisdiksyon ng Lalawigan ng Rizal (PG-ENRO). Pakisuyong ilagay ang pin sa loob ng Rizal.'
                      : 'The selected location is outside the jurisdiction of Rizal Province (PG-ENRO). Please place the pin inside Rizal.'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                <span className="flex items-center gap-1 text-[11px] text-stone-600 dark:text-stone-400">
                  <MapPin className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                  {t.tapToPinHint}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 bg-stone-100 dark:bg-stone-900 p-0.5 rounded-md text-[11px] font-semibold border border-transparent dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setBasemapMode(theme === 'dark' ? 'dark' : 'street')}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        basemapMode === 'street' || basemapMode === 'dark'
                          ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-2xs'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                      }`}
                    >
                      {theme === 'dark' ? 'Dark' : 'Street'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBasemapMode('satellite')}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        basemapMode === 'satellite'
                          ? 'bg-stone-900 dark:bg-emerald-600 text-white shadow-2xs'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                      }`}
                    >
                      Satellite
                    </button>
                  </div>
                  <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono">
                    {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                  </span>
                </div>
              </div>

              <div className="relative isolate z-0 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800">
                <LeafletMap
                  mode="picker"
                  center={coordinates}
                  zoom={14}
                  accuracyMeters={null}
                  layerMode="boundaries"
                  basemap={basemapMode}
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
              <span className="font-mono text-xs font-semibold text-stone-400 dark:text-stone-500">03</span>
              <span className="text-stone-300 dark:text-stone-700 font-mono">/</span>
              <h2 className="font-semibold text-sm sm:text-base text-stone-900 dark:text-white">
                {t.descriptionTitle}
              </h2>
            </div>
            <span
              className={`text-xs font-mono ${
                description.length > 450 ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-stone-400 dark:text-stone-500'
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
            className="w-full px-3.5 py-2.5 text-sm bg-stone-50/50 dark:bg-stone-900/60 hover:bg-stone-50 dark:hover:bg-stone-900 focus:bg-white dark:focus:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg focus:ring-1 focus:ring-stone-900 dark:focus:ring-emerald-500 focus:outline-none transition placeholder:text-stone-400 dark:placeholder:text-stone-500 text-stone-900 dark:text-white"
          />

          <p className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 shrink-0" />
            <span>{t.untrustedInputNotice}</span>
          </p>
        </div>

        {/* Step 4: Optional Category Hint */}
        <div className="py-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-stone-400 dark:text-stone-500">04</span>
            <span className="text-stone-300 dark:text-stone-700 font-mono">/</span>
            <label className="font-semibold text-sm sm:text-base text-stone-900 dark:text-white">
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
                        ? 'bg-stone-900 dark:bg-emerald-600 text-white font-semibold shadow-2xs'
                        : 'bg-stone-100 dark:bg-stone-900 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium border border-transparent dark:border-stone-800'
                    }`}
                  >
                    <span>{lang === 'fil' ? cat.labelFil : cat.labelEn}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Anti-Bot Honeypot (invisible to humans, triggers automated bots) */}
        <div className="hidden" aria-hidden="true" style={{ display: 'none' }}>
          <label htmlFor="hp_resident_notes">Leave this field blank</label>
          <input
            id="hp_resident_notes"
            type="text"
            name="hp_resident_notes"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {/* Submit & Compliance */}
        <div className="pt-6 space-y-3">
          {submitError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400 py-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !!compressingSlot ||
              !description.trim() ||
              isOutOfJurisdiction ||
              !rateLimitInfo.allowed
            }
            className="w-full py-3.5 px-6 bg-stone-900 hover:bg-black active:bg-stone-950 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white text-white font-semibold text-sm rounded-lg shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-200 disabled:text-stone-500 dark:disabled:bg-stone-800 dark:disabled:text-stone-500 disabled:cursor-not-allowed"
          >
            {!rateLimitInfo.allowed ? (
              <>
                <Lock className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                <span>
                  {t.cooldownNotice} ({formatCooldownTime(rateLimitInfo.remainingSeconds)})
                </span>
              </>
            ) : isSubmitting ? (
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

          <div className="text-[11px] text-stone-400 dark:text-stone-500 text-center leading-relaxed">
            <span className="font-semibold text-stone-600 dark:text-stone-300">RA 10173 Protected: </span>
            {t.privacyNotice}
          </div>
        </div>
      </form>
    </div>
  );
};
