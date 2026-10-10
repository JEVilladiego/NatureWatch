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
  BINANGONAN_BARANGAYS,
  IncidentReport,
} from '../types/report';
import { compressIncidentImage, CompressionResult } from '../lib/imageCompression';
import { queueImageUpload } from '../lib/offlineQueue';
import { encodeGeohash, generateReferenceCode } from '../lib/geohash';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LeafletMap } from './LeafletMap';
import { Language, translations } from '../lib/i18n';

// Default Binangonan center
const BINANGONAN_COORDS = { lat: 14.4791, lng: 121.1895 };

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
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number }>(BINANGONAN_COORDS);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<'gps' | 'manual_pin'>('manual_pin');
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Auto-acquire GPS on mount
  useEffect(() => {
    acquireGpsLocation();
  }, []);

  const acquireGpsLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationError('Geolocation not supported on this device. Please drag the map pin.');
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
      },
      (error) => {
        console.warn('Geolocation error:', error.message);
        setIsLocating(false);
        setLocationError('GPS permission not granted. You can select a barangay and drag the pin.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsCompressing(true);

    try {
      const result = await compressIncidentImage(file);
      setCompressionInfo(result);
    } catch (err) {
      console.error('Image compression failed:', err);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() && !compressionInfo) return;

    setIsSubmitting(true);
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const referenceCode = generateReferenceCode();
    const geohash = encodeGeohash(coordinates.lat, coordinates.lng, 8);
    const imagePath = `reports/${reportId}/incident.jpg`;

    // Convert compressed blob to base64 for local storage / fast transmission
    let imageBase64: string | undefined;
    if (compressionInfo) {
      try {
        const reader = new FileReader();
        imageBase64 = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(compressionInfo.compressedFile);
        });
      } catch {}
    }

    const newReport: IncidentReport = {
      id: reportId,
      referenceCode,
      createdAt: new Date().toISOString(),
      status: 'pending',
      statusHistory: [
        {
          status: 'pending',
          changedBy: 'resident_submission',
          changedAt: new Date().toISOString(),
        },
      ],
      location: {
        lat: coordinates.lat,
        lng: coordinates.lng,
        accuracyMeters,
        geohash,
        source: locationSource,
        barangay: selectedBarangay || 'Binangonan',
      },
      rawInput: {
        imagePath,
        imageStatus: compressionInfo ? 'pending' : 'uploaded',
        description: description.trim(),
        imageUrl: compressionInfo?.previewUrl,
      },
      triageStatus: 'pending',
      aiTriage: null,
      final: null,
      duplicateClusterId: null,
    };

    try {
      // 1. Write doc to Firestore immediately (offline cached via persistentLocalCache)
      try {
        const reportRef = doc(db, 'reports', reportId);
        await setDoc(reportRef, {
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
          },
          rawInput: {
            imagePath,
            imageStatus: compressionInfo ? 'pending' : 'uploaded',
            description: description.trim().slice(0, 500),
          },
          triageStatus: 'pending',
          aiTriage: null,
          final: null,
          duplicateClusterId: null,
        });
      } catch (firestoreErr) {
        // Log Firestore error using required format
        console.warn('Firestore write warning:', firestoreErr);
      }

      // 2. Queue image in IndexedDB for resilient background upload
      if (compressionInfo) {
        await queueImageUpload(reportId, imagePath, compressionInfo.compressedFile);
      }

      // 3. Sync to server API in background (non-blocking for resident)
      try {
        fetch('/api/reports/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newReport,
            rawInput: {
              ...newReport.rawInput,
              imageBase64,
            },
          }),
        }).catch(() => {});

        // Trigger Gemini triage asynchronously on server
        fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            description: description.trim(),
            imageBase64,
          }),
        }).catch(() => {});
      } catch {}

      if (onReportCreated) {
        onReportCreated(newReport);
      }

      setSubmittedReport({
        referenceCode,
        offlineSaved: !isOnline,
      });
    } catch (err) {
      console.error('Submission error:', err);
      // Even on local error, preserve user's generated reference
      setSubmittedReport({
        referenceCode,
        offlineSaved: true,
      });
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
    setSubmittedReport(null);
    acquireGpsLocation();
  };

  // SUCCESS VIEW
  if (submittedReport) {
    return (
      <div className="max-w-xl mx-auto p-4 sm:p-6 my-4 bg-white rounded-2xl shadow-xl border border-emerald-100">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            {t.successTitle}
          </h2>

          <p className="text-sm text-gray-600 max-w-md mx-auto">
            {t.successSubtitle}
          </p>

          {submittedReport.offlineSaved && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2 text-left">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{t.offlineSaved}</span>
            </div>
          )}

          {/* Reference Code Card */}
          <div className="bg-emerald-50/80 border-2 border-dashed border-emerald-300 rounded-2xl p-5 my-6">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              {t.referenceCodeLabel}
            </span>
            <div className="text-3xl font-mono font-black text-emerald-950 mt-1 tracking-wider">
              {submittedReport.referenceCode}
            </div>

            <button
              onClick={handleCopyCode}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-xl shadow transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? t.copied : t.copyCode}</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => onViewStatus(submittedReport.referenceCode)}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition"
            >
              <FileText className="w-4 h-4" />
              <span>{t.trackStatusBtn}</span>
            </button>

            <button
              onClick={resetForm}
              className="py-3 px-4 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition"
            >
              {t.reportAnotherBtn}
            </button>
          </div>

          {/* Privacy footer */}
          <div className="pt-4 border-t border-gray-100 text-[11px] text-gray-400 flex items-center justify-center gap-1">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t.retentionNote}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 bg-white rounded-2xl shadow-xl border border-emerald-50">
      {/* Title & Anonymity Banner */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full mb-2">
          <Shield className="w-3.5 h-3.5" />
          <span>{t.anonymousNotice}</span>
        </div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {t.appTitle}
        </h1>
        <p className="text-xs text-gray-600 mt-0.5">{t.tagline}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Photo Capture */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-800">
            1. {t.photoCaptureTitle}
          </label>
          <p className="text-xs text-gray-500">{t.photoCaptureHint}</p>

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
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 rounded-xl transition cursor-pointer"
              >
                <Camera className="w-7 h-7 text-emerald-600 mb-1" />
                <span className="text-xs font-bold">{t.cameraBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 bg-gray-50/50 hover:bg-gray-50 text-gray-700 rounded-xl transition cursor-pointer"
              >
                <Upload className="w-7 h-7 text-gray-500 mb-1" />
                <span className="text-xs font-bold">{t.galleryBtn}</span>
              </button>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black/5">
              <img
                src={compressionInfo.previewUrl}
                alt="Incident capture"
                className="w-full h-52 object-cover"
              />
              <div className="absolute bottom-2 left-2 right-2 bg-black/75 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg flex items-center justify-between text-xs">
                <span>
                  {t.compressedTo}: {(compressionInfo.compressedSize / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setCompressionInfo(null);
                  }}
                  className="text-rose-300 hover:text-rose-100 font-bold underline"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {isCompressing && (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t.compressing}</span>
            </p>
          )}
        </div>

        {/* Step 2: Location & Draggable Map */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <span>2. {t.locationTitle}</span>
              {accuracyMeters !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300">
                  {t.gpsAccuracy}: ±{accuracyMeters}m
                </span>
              )}
            </label>
            <button
              type="button"
              onClick={acquireGpsLocation}
              disabled={isLocating}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
              <span>GPS</span>
            </button>
          </div>

          <p className="text-xs text-gray-500">{t.dragPinHint}</p>

          {/* Leaflet Picker Map */}
          <div className="relative">
            <LeafletMap
              mode="picker"
              center={coordinates}
              zoom={14}
              accuracyMeters={accuracyMeters}
              onLocationChange={(lat, lng) => {
                setCoordinates({ lat, lng });
                setLocationSource('manual_pin');
              }}
              className="h-56 w-full rounded-xl border border-gray-300 shadow-sm overflow-hidden"
            />
            {isLocating && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center text-xs font-bold text-emerald-800 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t.locating}</span>
              </div>
            )}
          </div>

          {/* Barangay manual fallback selector */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {t.manualBarangayLabel}
            </label>
            <select
              value={selectedBarangay}
              onChange={(e) => setSelectedBarangay(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">{t.selectBarangay}</option>
              {BINANGONAN_BARANGAYS.map((brgy) => (
                <option key={brgy} value={brgy}>
                  Brgy. {brgy}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 3: Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-gray-800">
              3. {t.descriptionTitle}
            </label>
            <span
              className={`text-xs ${
                description.length > 450 ? 'text-amber-600 font-bold' : 'text-gray-400'
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
            className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
          />

          <p className="text-[11px] text-gray-500 italic flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{t.untrustedInputNotice}</span>
          </p>
        </div>

        {/* Step 4: Optional Category Hint */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-700">
            {t.categoryHintLabel}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
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
                    className={`p-2 text-left rounded-lg text-xs font-semibold transition border ${
                      isSelected
                        ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
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
        <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-900 leading-relaxed">
          <span className="font-bold">RA 10173 Compliance: </span>
          {t.privacyNotice}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || isCompressing || !description.trim()}
          className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-extrabold text-sm sm:text-base rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
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
