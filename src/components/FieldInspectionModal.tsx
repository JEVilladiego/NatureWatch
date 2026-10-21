import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  Copy,
  Check,
  Shield,
  Wind,
  Droplets,
  ExternalLink,
} from 'lucide-react';
import { IncidentReport, ReportImageItem, CATEGORIES } from '../types/report';
import { Language } from '../lib/i18n';
import { resolveReportCoordinates } from '../lib/barangayCoordinates';

interface FieldInspectionModalProps {
  report: IncidentReport;
  evidenceImages?: ReportImageItem[];
  lang?: Language;
  onClose: () => void;
}

export const FieldInspectionModal: React.FC<FieldInspectionModalProps> = ({
  report,
  evidenceImages = [],
  lang = 'en',
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle print lifecycle cleanly
  useEffect(() => {
    const handleBeforePrint = () => {
      document.body.classList.add('is-printing-worksheet');
    };
    const handleAfterPrint = () => {
      document.body.classList.remove('is-printing-worksheet');
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('is-printing-worksheet');
    };
  }, []);

  const coords = resolveReportCoordinates(report);
  const lat = coords.lat;
  const lng = coords.lng;
  const barangay = report.location?.barangay || 'Unspecified Barangay';
  const municipality = report.location?.municipality || 'Rizal Province';
  const categoryKey = report.final?.category || report.aiTriage?.category || 'other';
  const categoryMeta = (CATEGORIES as any)[categoryKey] || { labelEn: categoryKey, labelFil: categoryKey };
  const severity = report.final?.severity || report.aiTriage?.severity || 3;

  const weather = report.aiTriage?.weather;
  const protectedZone = report.aiTriage?.protectedZone;
  const quarryContext = report.mgbQuarryContext || report.aiTriage?.mgbQuarryContext;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  const handlePrint = () => {
    document.body.classList.add('is-printing-worksheet');
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const generateViberSummary = () => {
    const lines = [
      `🚨 [PG-ENRO RIZAL] FIELD INSPECTION ORDER`,
      `Ref Code: ${report.referenceCode}`,
      `LGU: ${barangay}, ${municipality}`,
      `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      `Category: ${categoryMeta.labelEn} (Priority Level ${severity}/5)`,
      quarryContext ? `Quarry Area: ${quarryContext.tenementName || 'MGB Tenement'} (${quarryContext.permitType || 'Quarry Permit'})` : '',
      protectedZone ? `Protected Reserve: ${protectedZone.name}` : '',
      `Reported Incident: "${report.rawInput?.description || 'No description provided.'}"`,
      weather ? `Telemetry: ${weather.temperature}°C | Wind: ${weather.windSpeed} km/h (${weather.windDirectionCompass || 'N/A'})` : '',
      `Map Coordinates: ${googleMapsUrl}`,
      `Directive: Deploy field personnel for on-site ocular verification and report findings.`,
    ].filter(Boolean);

    return lines.join('\n');
  };

  const handleCopyViber = async () => {
    try {
      await navigator.clipboard.writeText(generateViberSummary());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = generateViberSummary();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (typeof document === 'undefined') return null;

  const modalContent = (
    <div
      id="field-inspection-modal-root"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6"
    >
      {/* Printable Sheet Container */}
      <div
        id="field-inspection-printable"
        className="bg-white text-stone-900 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-stone-300"
      >
        {/* ACTION TOOLBAR (Hidden during print) */}
        <div className="no-print bg-stone-900 text-stone-100 px-4 py-3 sm:px-6 flex items-center justify-between gap-3 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-xs sm:text-sm tracking-wide">
              Field Inspection Dispatch Slip
            </span>
            <span className="font-mono text-xs text-stone-400 bg-stone-800 px-2 py-0.5 rounded">
              {report.referenceCode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyViber}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-stone-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 border border-stone-700 cursor-pointer"
              title="Copy formatted dispatch text for Viber / SMS / Telegram"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Copy for Viber/SMS</span>
                  <span className="sm:hidden">Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Print official paper worksheet or save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Worksheet</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition cursor-pointer ml-1"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRINTABLE OFFICIAL DOCUMENT BODY */}
        <div className="print-scroll-reset p-6 sm:p-8 space-y-6 text-stone-900 overflow-y-auto max-h-[85vh]">
          {/* Official Provincial Header */}
          <div className="print-avoid-break border-b-2 border-stone-900 pb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/naturewatch_logo.png"
                alt="NatureWatch Logo"
                className="w-12 h-12 rounded-lg object-contain shrink-0"
              />
              <div>
                <p className="text-[10px] sm:text-xs font-bold tracking-widest uppercase text-stone-600 font-mono">
                  Republic of the Philippines • Province of Rizal
                </p>
                <h1 className="text-sm sm:text-base md:text-lg font-black uppercase tracking-tight text-stone-950 font-display">
                  Provincial Environment & Natural Resources Office (PG-ENRO)
                </h1>
                <p className="text-[11px] font-semibold text-stone-700">
                  ENVIRONMENTAL INCIDENT FIELD INVESTIGATION & INSPECTION ORDER
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="block text-[10px] font-mono text-stone-500 uppercase tracking-widest">
                Official Tracking No.
              </span>
              <span className="text-lg sm:text-xl font-mono font-black text-stone-950 tracking-wider">
                {report.referenceCode}
              </span>
              <span className="block text-[10px] font-mono text-stone-500">
                Issued: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Section 1: Incident Location & Target Overview */}
          <div className="print-avoid-break grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-stone-100 rounded-lg border border-stone-300 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                Target LGU Jurisdiction
              </span>
              <p className="font-bold text-stone-950 text-sm">
                Brgy. {barangay}
              </p>
              <p className="text-stone-700 font-semibold">
                {municipality}, Rizal
              </p>
            </div>

            <div className="p-3 bg-stone-100 rounded-lg border border-stone-300 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                Geographic Coordinates
              </span>
              <p className="font-mono font-bold text-stone-950 text-sm">
                {lat.toFixed(5)}° N, {lng.toFixed(5)}° E
              </p>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-700 font-semibold hover:underline inline-flex items-center gap-1 print:hidden"
              >
                <span>Open in Satellite Map</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="hidden print:inline text-[10px] font-mono text-stone-500">
                Source: {report.location?.source || 'GPS Sensor'}
              </span>
            </div>

            <div className="p-3 bg-stone-100 rounded-lg border border-stone-300 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                Classification & Urgency
              </span>
              <p className="font-bold text-stone-950 text-sm">
                {categoryMeta.labelEn}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-stone-900 text-white">
                  PRIORITY LEVEL {severity} / 5
                </span>
                <span className="text-stone-600 text-[11px] font-medium">
                  {severity >= 4 ? 'Immediate Dispatch' : 'Standard Routine'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Statutory Context & Jurisdiction Notice (if in Quarry or Protected Area) */}
          {(quarryContext || protectedZone) && (
            <div className="print-avoid-break p-3.5 bg-amber-50 rounded-lg border border-amber-300 space-y-1.5 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold uppercase text-[11px] tracking-wide text-amber-900">
                <Shield className="w-4 h-4 text-amber-800 shrink-0" />
                <span>Special Statutory Jurisdiction & Environmental Safeguards</span>
              </div>
              {quarryContext && (
                <p className="leading-relaxed">
                  <span className="font-semibold">MGB Mining Tenement Alert:</span> Located within/adjacent to{' '}
                  <span className="font-bold">{quarryContext.tenementName || 'MGB Tenement'}</span> (Type:{' '}
                  <span className="font-mono font-bold">{quarryContext.permitType || 'Quarry Permit'}</span>, Operator:{' '}
                  <span className="font-bold">{quarryContext.operator || 'Authorized Operator'}</span>). Field inspectors must verify whether extraction activities are strictly confined within authorized tenement boundary pillars.
                </p>
              )}
              {protectedZone && (
                <p className="leading-relaxed">
                  <span className="font-semibold">Protected Ecological Sanctuary:</span> Located inside{' '}
                  <span className="font-bold">{protectedZone.name}</span> (Authority:{' '}
                  <span className="font-semibold">{protectedZone.legalBasis || 'NIPAS / National Protected Area'}</span>). Elevated statutory penalties apply for timber felling, kaingin, or earth moving.
                </p>
              )}
            </div>
          )}

          {/* Section 3: Citizen Incident Report & Telemetry */}
          <div className="print-avoid-break border border-stone-300 rounded-lg p-3.5 space-y-2 bg-stone-50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
              Citizen Description & Ground Allegation
            </span>
            <p className="text-xs text-stone-950 font-serif italic leading-relaxed border-l-2 border-stone-400 pl-3 py-0.5">
              "{report.rawInput?.description || 'No descriptive narrative provided by reporter.'}"
            </p>

            {report.aiTriage?.summary && (
              <div className="pt-2 border-t border-stone-200 text-xs">
                <span className="font-bold text-stone-800">Triage Assessment: </span>
                <span className="text-stone-700">{report.aiTriage.summary}</span>
              </div>
            )}

            {weather && (
              <div className="pt-2 border-t border-stone-200 flex flex-wrap items-center gap-4 text-[11px] font-mono text-stone-600">
                <span className="flex items-center gap-1">
                  <span>Temp: {weather.temperature}°C</span>
                </span>
                <span className="flex items-center gap-1">
                  <Wind className="w-3 h-3 text-stone-500" />
                  <span>Wind: {weather.windSpeed} km/h {weather.windDirectionCompass ? `(${weather.windDirectionCompass})` : ''}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-stone-500" />
                  <span>Precip: {weather.precipitation} mm</span>
                </span>
                <span>Relative Humidity: {weather.humidity}%</span>
              </div>
            )}
          </div>

          {/* Section 4: Citizen Photographic Evidence Deck */}
          <div className="print-avoid-break space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
              Attached Photographic Evidence ({evidenceImages.length > 0 ? evidenceImages.length : 1} photo record)
            </span>

            {evidenceImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {evidenceImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="border border-stone-300 rounded-lg overflow-hidden bg-stone-100 flex flex-col"
                  >
                    <div className="h-32 sm:h-40 overflow-hidden bg-stone-200 flex items-center justify-center">
                      <img
                        src={img.data}
                        alt={`Evidence photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-1.5 bg-white border-t border-stone-200 text-[10px] font-mono flex items-center justify-between text-stone-600">
                      <span className="capitalize font-semibold">{img.role ? img.role.replace('_', ' ') : `Photo #${idx + 1}`}</span>
                      <span>Slot {idx + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 border border-stone-300 rounded-lg text-center text-xs text-stone-500 bg-stone-100 italic">
                No resident photograph attached in database for this record. Use coordinates for on-site landmark verification.
              </div>
            )}
          </div>

          {/* Section 5: Ground Inspection Verification Form (Fillable Checklist) */}
          <div className="print-avoid-break border-2 border-stone-900 rounded-xl p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between border-b border-stone-300 pb-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-stone-900">
                On-Site Field Verification Findings (To be completed on site by inspecting officer)
              </h2>
              <span className="text-[10px] font-mono text-stone-500 uppercase">
                Official PG-ENRO Form IF-01
              </span>
            </div>

            {/* Checklist items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-900">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="w-4 h-4 border-2 border-stone-800 rounded-xs inline-block shrink-0" />
                <span>1. Alleged violation verified existing on site</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <span className="w-4 h-4 border-2 border-stone-800 rounded-xs inline-block shrink-0" />
                <span>2. Activity ongoing at time of ocular inspection</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <span className="w-4 h-4 border-2 border-stone-800 rounded-xs inline-block shrink-0" />
                <span>3. Ceased / Area cleared prior to arrival</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <span className="w-4 h-4 border-2 border-stone-800 rounded-xs inline-block shrink-0" />
                <span>4. Unfounded / Negative / False incident</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                <span className="w-4 h-4 border-2 border-stone-800 rounded-xs inline-block shrink-0" />
                <span>5. Imminent hazard requiring immediate police / engineering intervention</span>
              </label>
            </div>

            {/* Field fill lines */}
            <div className="space-y-2.5 pt-2 text-xs">
              <div>
                <span className="font-semibold text-stone-800">Responsible Person / Entity Encountered on Site: </span>
                <span className="inline-block border-b border-stone-800 w-full sm:w-80 h-4" />
              </div>

              <div>
                <span className="font-semibold text-stone-800">Physical Observations & Specific Findings: </span>
                <div className="border-b border-stone-300 h-5 mt-1" />
                <div className="border-b border-stone-300 h-5" />
              </div>

              <div>
                <span className="font-semibold text-stone-800">Immediate Field Action Taken: </span>
                <span className="inline-block border-b border-stone-300 w-full sm:w-96 h-4" />
              </div>
            </div>

            {/* Signature & Sign-Off Block */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-300 text-xs">
              <div>
                <div className="border-b border-stone-900 h-8" />
                <span className="block font-bold text-stone-900 mt-1 uppercase text-[11px]">
                  Inspecting Officer Name & Office
                </span>
                <span className="text-[10px] text-stone-500 font-mono">
                  PG-ENRO / MENRO / Barangay Tanod
                </span>
              </div>

              <div>
                <div className="border-b border-stone-900 h-8" />
                <div className="flex items-center justify-between text-[11px] font-bold text-stone-900 mt-1">
                  <span className="uppercase">Signature over Printed Name</span>
                  <span className="font-mono text-[10px] text-stone-500">Date: ____________</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-[10px] text-stone-500 text-center font-mono pt-2 border-t border-stone-200">
            Generated via NatureWatch Rizal Provincial Environmental Incident Intelligence System • Secure Ref: {report.referenceCode}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
