/**
 * Zero-dependency client-side EXIF Metadata & Forensic Verifier
 * NatureWatch - Provincial Government of Rizal (PG-ENRO)
 */

export interface ExifAnalysisResult {
  hasExif: boolean;
  capturedAt?: string | null;
  isRecent?: boolean | null; // Taken in last 48 hours
  ageHours?: number | null;
  hardwareGps?: { lat: number; lng: number } | null;
  distanceFromReportKm?: number | null;
  locationMismatch?: boolean; // Distance > 5km from pinned coordinates
  cameraMake?: string | null;
  cameraModel?: string | null;
  software?: string | null;
  isPossibleSyntheticOrEdited?: boolean;
  notes: string[];
}

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula in kilometers.
 */
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Extracts basic EXIF tags from a JPEG ArrayBuffer without external libraries.
 */
export async function extractExifFromBlob(
  file: File | Blob,
  pinnedCoords?: { lat: number; lng: number }
): Promise<ExifAnalysisResult> {
  const notes: string[] = [];

  try {
    // Only inspect the first 128KB of the file where headers reside
    const slice = file.slice(0, 131072);
    const buffer = await slice.arrayBuffer();
    const dataView = new DataView(buffer);

    // Verify JPEG SOI marker (0xFFD8)
    if (dataView.getUint16(0) !== 0xffd8) {
      return {
        hasExif: false,
        notes: ['File is not a standard JPEG or is missing standard SOI marker.'],
      };
    }

    let offset = 2;
    let app1Found = false;
    let app1Offset = 0;

    while (offset < dataView.byteLength - 2) {
      const marker = dataView.getUint16(offset);
      offset += 2;

      if (marker === 0xffe1) {
        // APP1 Marker found
        app1Found = true;
        app1Offset = offset + 2; // skip length bytes
        break;
      } else if ((marker & 0xff00) === 0xff00) {
        // Skip other markers
        const length = dataView.getUint16(offset);
        offset += length;
      } else {
        break;
      }
    }

    if (!app1Found) {
      return {
        hasExif: false,
        notes: ['No EXIF metadata block found in image.'],
      };
    }

    // Verify "Exif\0\0" header (0x457869660000)
    const exifHeader =
      String.fromCharCode(dataView.getUint8(app1Offset)) +
      String.fromCharCode(dataView.getUint8(app1Offset + 1)) +
      String.fromCharCode(dataView.getUint8(app1Offset + 2)) +
      String.fromCharCode(dataView.getUint8(app1Offset + 3));

    if (exifHeader !== 'Exif') {
      return {
        hasExif: false,
        notes: ['APP1 block is not standard Exif.'],
      };
    }

    const tiffStart = app1Offset + 6;
    const isLittleEndian = dataView.getUint16(tiffStart) === 0x4949; // "II" vs "MM"

    // Parse IFD0
    const ifd0Offset = dataView.getUint32(tiffStart + 4, isLittleEndian);
    const ifd0Start = tiffStart + ifd0Offset;

    let dateTimeStr: string | null = null;
    let makeStr: string | null = null;
    let modelStr: string | null = null;
    let softwareStr: string | null = null;
    let subIfdOffset = 0;
    let gpsIfdOffset = 0;

    const ifd0Entries = dataView.getUint16(ifd0Start, isLittleEndian);
    for (let i = 0; i < ifd0Entries && ifd0Start + 2 + i * 12 + 12 <= dataView.byteLength; i++) {
      const entryOffset = ifd0Start + 2 + i * 12;
      const tag = dataView.getUint16(entryOffset, isLittleEndian);

      if (tag === 0x010f) {
        // Make
        makeStr = readString(dataView, tiffStart, entryOffset, isLittleEndian);
      } else if (tag === 0x0110) {
        // Model
        modelStr = readString(dataView, tiffStart, entryOffset, isLittleEndian);
      } else if (tag === 0x0131) {
        // Software
        softwareStr = readString(dataView, tiffStart, entryOffset, isLittleEndian);
      } else if (tag === 0x0132) {
        // DateTime
        dateTimeStr = readString(dataView, tiffStart, entryOffset, isLittleEndian);
      } else if (tag === 0x8769) {
        // Exif SubIFD
        subIfdOffset = dataView.getUint32(entryOffset + 8, isLittleEndian);
      } else if (tag === 0x8825) {
        // GPS IFD
        gpsIfdOffset = dataView.getUint32(entryOffset + 8, isLittleEndian);
      }
    }

    // Parse Exif SubIFD for DateTimeOriginal if available
    if (subIfdOffset > 0 && tiffStart + subIfdOffset + 2 <= dataView.byteLength) {
      const subIfdStart = tiffStart + subIfdOffset;
      const subEntries = dataView.getUint16(subIfdStart, isLittleEndian);
      for (let i = 0; i < subEntries && subIfdStart + 2 + i * 12 + 12 <= dataView.byteLength; i++) {
        const entryOffset = subIfdStart + 2 + i * 12;
        const tag = dataView.getUint16(entryOffset, isLittleEndian);
        if (tag === 0x9003) {
          // DateTimeOriginal
          const origDate = readString(dataView, tiffStart, entryOffset, isLittleEndian);
          if (origDate) dateTimeStr = origDate;
          break;
        }
      }
    }

    // Parse GPS IFD if available
    let hardwareGps: { lat: number; lng: number } | null = null;
    if (gpsIfdOffset > 0 && tiffStart + gpsIfdOffset + 2 <= dataView.byteLength) {
      try {
        hardwareGps = parseGpsIfd(dataView, tiffStart, tiffStart + gpsIfdOffset, isLittleEndian);
      } catch {
        // Ignore corrupted GPS block
      }
    }

    // Evaluate Recency
    let isRecent: boolean | null = null;
    let ageHours: number | null = null;
    if (dateTimeStr) {
      // EXIF date format is usually "YYYY:MM:DD HH:MM:SS"
      const match = dateTimeStr.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const dateObj = new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6])
        );
        const ageMs = Date.now() - dateObj.getTime();
        ageHours = Math.round(ageMs / (3600 * 1000));
        isRecent = ageHours <= 48 && ageHours >= -2; // Within 48 hours (allowing minor clock skew)
        if (!isRecent) {
          notes.push(`Photo captured ${ageHours} hours ago (${match[1]}-${match[2]}-${match[3]}).`);
        }
      }
    }

    // Evaluate Location
    let distanceFromReportKm: number | null = null;
    let locationMismatch = false;
    if (hardwareGps && pinnedCoords) {
      distanceFromReportKm = calculateDistanceKm(
        hardwareGps.lat,
        hardwareGps.lng,
        pinnedCoords.lat,
        pinnedCoords.lng
      );
      if (distanceFromReportKm > 5) {
        locationMismatch = true;
        notes.push(
          `Photo GPS (${hardwareGps.lat.toFixed(4)}, ${hardwareGps.lng.toFixed(4)}) is ${distanceFromReportKm} km from pinned report coordinates.`
        );
      }
    }

    // Check for synthetic or editing software
    let isPossibleSyntheticOrEdited = false;
    if (softwareStr) {
      const sw = softwareStr.toLowerCase();
      if (
        sw.includes('photoshop') ||
        sw.includes('midjourney') ||
        sw.includes('dall-e') ||
        sw.includes('stable diffusion') ||
        sw.includes('canva') ||
        sw.includes('gimp')
      ) {
        isPossibleSyntheticOrEdited = true;
        notes.push(`Image edited with ${softwareStr}.`);
      }
    }

    return {
      hasExif: true,
      capturedAt: dateTimeStr,
      isRecent,
      ageHours,
      hardwareGps,
      distanceFromReportKm,
      locationMismatch,
      cameraMake: makeStr,
      cameraModel: modelStr,
      software: softwareStr,
      isPossibleSyntheticOrEdited,
      notes,
    };
  } catch (err) {
    return {
      hasExif: false,
      notes: ['Failed to read EXIF structure.'],
    };
  }
}

function readString(
  view: DataView,
  tiffStart: number,
  entryOffset: number,
  isLittleEndian: boolean
): string | null {
  try {
    const count = view.getUint32(entryOffset + 4, isLittleEndian);
    if (count <= 1 || count > 256) return null;

    const valueOffset =
      count <= 4 ? entryOffset + 8 : tiffStart + view.getUint32(entryOffset + 8, isLittleEndian);

    if (valueOffset + count > view.byteLength) return null;

    let str = '';
    for (let i = 0; i < count - 1; i++) {
      const charCode = view.getUint8(valueOffset + i);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str.trim() || null;
  } catch {
    return null;
  }
}

function parseGpsIfd(
  view: DataView,
  tiffStart: number,
  gpsStart: number,
  isLittleEndian: boolean
): { lat: number; lng: number } | null {
  const entries = view.getUint16(gpsStart, isLittleEndian);
  let latRef: string | null = null;
  let lonRef: string | null = null;
  let latVal: number | null = null;
  let lonVal: number | null = null;

  for (let i = 0; i < entries; i++) {
    const entryOffset = gpsStart + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, isLittleEndian);

    if (tag === 0x0001) {
      // GPSLatitudeRef ('N' or 'S')
      latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
    } else if (tag === 0x0003) {
      // GPSLongitudeRef ('E' or 'W')
      lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
    } else if (tag === 0x0002) {
      // GPSLatitude (3 rational numbers: degrees, minutes, seconds)
      latVal = readRationalCoord(view, tiffStart, entryOffset, isLittleEndian);
    } else if (tag === 0x0004) {
      // GPSLongitude (3 rational numbers)
      lonVal = readRationalCoord(view, tiffStart, entryOffset, isLittleEndian);
    }
  }

  if (latVal !== null && lonVal !== null) {
    if (latRef === 'S') latVal = -latVal;
    if (lonRef === 'W') lonVal = -lonVal;
    return { lat: Math.round(latVal * 10000) / 10000, lng: Math.round(lonVal * 10000) / 10000 };
  }
  return null;
}

function readRationalCoord(
  view: DataView,
  tiffStart: number,
  entryOffset: number,
  isLittleEndian: boolean
): number | null {
  try {
    const offset = tiffStart + view.getUint32(entryOffset + 8, isLittleEndian);
    if (offset + 24 > view.byteLength) return null;

    const dNum = view.getUint32(offset, isLittleEndian);
    const dDen = view.getUint32(offset + 4, isLittleEndian);
    const mNum = view.getUint32(offset + 8, isLittleEndian);
    const mDen = view.getUint32(offset + 12, isLittleEndian);
    const sNum = view.getUint32(offset + 16, isLittleEndian);
    const sDen = view.getUint32(offset + 20, isLittleEndian);

    const deg = dDen ? dNum / dDen : 0;
    const min = mDen ? mNum / mDen : 0;
    const sec = sDen ? sNum / sDen : 0;

    return deg + min / 60 + sec / 3600;
  } catch {
    return null;
  }
}
