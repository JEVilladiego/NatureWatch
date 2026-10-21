/**
 * Data consistency guard.
 *
 * Protected-zone data lives in three places that must agree:
 *   1. public/geojson/rizal-protected-zones.geojson  (source of truth, QA-signed-off)
 *   2. api/_lib/protectedAreas.ts                    (server triage)
 *   3. RIZAL_PROTECTED_ZONES_CATALOG in Dashboard.tsx (officer detail panel)
 *
 * Also validates that quarry/plant records have the fields officers rely on.
 * Exits non-zero on errors. Warnings do not fail the check.
 *
 * Usage: npm run check:data
 */
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const errors = [];
const warnings = [];

const geo = JSON.parse(read('public/geojson/rizal-protected-zones.geojson'));
const geoById = new Map(geo.features.map((f) => [f.properties.id, f.properties]));

/** Extracts the array literal following `marker` up to the closing `];` at column 0. */
function extractArray(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Marker not found: ${marker}`);
  const open = source.indexOf('[', start + marker.length - 1);
  const end = source.indexOf('\n];', open);
  return new Function(`return ${source.slice(open, end + 2)}`)();
}

const server = extractArray(
  read('api/_lib/protectedAreas.ts'),
  'export const RIZAL_PROTECTED_ZONES: ProtectedZoneRecord[] = ['
);
const catalog = extractArray(
  read('src/components/Dashboard.tsx'),
  'const RIZAL_PROTECTED_ZONES_CATALOG: CuratedProtectedZoneItem[] = ['
);

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function compare(label, items, fields) {
  const ids = new Set(items.map((i) => i.id));
  for (const id of geoById.keys()) if (!ids.has(id)) errors.push(`[${label}] missing zone "${id}"`);
  for (const item of items) {
    const g = geoById.get(item.id);
    if (!g) {
      errors.push(`[${label}] zone "${item.id}" not in GeoJSON`);
      continue;
    }
    for (const field of fields) {
      if (norm(item[field]) !== norm(g[field])) {
        errors.push(`[${label}] ${item.id}.${field}\n    geojson: ${norm(g[field])}\n    ${label}: ${norm(item[field])}`);
      }
    }
  }
}

compare('server', server, ['name', 'shortName', 'municipality', 'legalBasis', 'legalNote', 'severityBonus', 'type']);
// Dashboard `type` is a display label (checked separately below).
compare('dashboard', catalog, ['name', 'shortName', 'category', 'municipality', 'legalBasis']);

const ringsEqual = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
  a.every((pt, i) => Math.abs(pt[0] - b[i][0]) < 1e-9 && Math.abs(pt[1] - b[i][1]) < 1e-9);

// Allowed Dashboard display labels per GeoJSON `type`.
const TYPE_LABELS = {
  protected_landscape: ['Protected Landscape'],
  forest_reserve: ['Forest Reserve'],
  wildlife_sanctuary: ['Wildlife Sanctuary'],
  watershed: ['Watershed Reservation', 'Municipal Watershed'],
  aquatic_sanctuary: ['Aquatic Fish Sanctuary'],
  shoreland_buffer: ['Shoreland Buffer'],
  key_biodiversity_area: ['Key Biodiversity Area'],
  georeserve: ['Karst Georeserve'],
  cultural_reserve: ['Cultural-Ecological Reserve'],
  local_reserve: ['Local Mountain Reserve'],
};

for (const f of geo.features) {
  const g = f.properties;
  const ring = f.geometry.coordinates[0];
  const c = catalog.find((z) => z.id === g.id);
  const s = server.find((z) => z.id === g.id);
  if (f.geometry.type !== 'Polygon') errors.push(`[geojson] ${g.id} geometry is ${f.geometry.type}, expected Polygon`);
  if (c) {
    if (!ringsEqual(c.polygon, ring)) errors.push(`[dashboard] ${g.id}.polygon differs from GeoJSON`);
    if (Math.abs(c.lat - g.center[0]) > 1e-9 || Math.abs(c.lng - g.center[1]) > 1e-9) errors.push(`[dashboard] ${g.id} center differs`);
    if (c.zoom !== g.zoomLevel) errors.push(`[dashboard] ${g.id}.zoom ${c.zoom} != ${g.zoomLevel}`);
    if (JSON.stringify(c.barangays) !== JSON.stringify(g.barangays || [])) errors.push(`[dashboard] ${g.id}.barangays differ from GeoJSON`);
    if (!(TYPE_LABELS[g.type] || []).includes(c.type)) errors.push(`[dashboard] ${g.id}.type label "${c.type}" not valid for ${g.type}`);
  }
  if (s) {
    if (!ringsEqual(s.polygon, ring)) errors.push(`[server] ${g.id}.polygon differs from GeoJSON`);
    if (JSON.stringify(s.center) !== JSON.stringify(g.center)) errors.push(`[server] ${g.id} center differs`);
  }
}

// Quarry / processing plant completeness
const quarries = JSON.parse(read('public/geojson/rizal-mgb-quarries.geojson'));
for (const f of quarries.features) {
  const p = f.properties;
  if (!p.tenementName) errors.push(`[quarry] ${p.id} missing tenementName`);
  if (!p.barangay) warnings.push(`[quarry] ${p.id} missing barangay (needs verified MGB value)`);
  for (const req of ['id', 'name', 'permitNumber', 'permitType', 'operator', 'municipality', 'status']) {
    if (!p[req]) errors.push(`[quarry] ${p.id || '(no id)'} missing ${req}`);
  }
}

// 4. LGU and Barangay completeness check across report.ts and barangayCoordinates.ts
const reportSource = read('src/types/report.ts');
const coordsSource = read('src/lib/barangayCoordinates.ts');

function extractObjectAfterEquals(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Marker not found: ${marker}`);
  const equals = source.indexOf('=', start);
  const open = source.indexOf('{', equals);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return new Function(`return ${source.slice(open, end + 1)}`)();
}

const areasSource = extractObjectAfterEquals(reportSource, 'export const RIZAL_BARANGAY_AREAS');
const lgusOpen = reportSource.indexOf('export const RIZAL_LGUS');
const lgusStart = reportSource.indexOf('{', reportSource.indexOf('=', lgusOpen));
const lgusClose = reportSource.indexOf('} as const;', lgusStart);
const RIZAL_LGUS = new Function('areas', `
  const flattenAreas = (mun) => areas[mun].flatMap(a => a.barangays);
  return ${reportSource.slice(lgusStart, lgusClose + 1)}
`)(areasSource);

const RIZAL_BARANGAY_COORDINATES = extractObjectAfterEquals(coordsSource, 'export const RIZAL_BARANGAY_COORDINATES');

for (const [mun, brgys] of Object.entries(RIZAL_LGUS)) {
  const munData = RIZAL_BARANGAY_COORDINATES[mun];
  if (!munData) {
    errors.push(`[lgu] Municipality "${mun}" not in RIZAL_BARANGAY_COORDINATES`);
    continue;
  }
  for (const brgy of brgys) {
    const found = munData[brgy] || munData[`${brgy} (Pob.)`];
    if (!found) {
      errors.push(`[brgy] Barangay "${brgy}" in ${mun} missing coordinates in RIZAL_BARANGAY_COORDINATES`);
    }
  }
}

// 5. Weather Presets consistency
const weatherSource = read('src/lib/weatherService.ts');
const wpOpen = weatherSource.indexOf('export const RIZAL_LGU_PRESETS');
const wpClose = weatherSource.indexOf('];\n\n// WMO Weather interpretation table', wpOpen);
const RIZAL_LGU_PRESETS = new Function(`return ${weatherSource.slice(weatherSource.indexOf('[', wpOpen), wpClose + 1)}`)();

for (const preset of RIZAL_LGU_PRESETS) {
  if (preset.id !== 'rizal-center' && !RIZAL_LGUS[preset.name]) {
    errors.push(`[weather] Preset "${preset.id}" name "${preset.name}" does not match official RIZAL_LGUS name`);
  }
}

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
