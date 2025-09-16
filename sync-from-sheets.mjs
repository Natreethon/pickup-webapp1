import fs from 'fs/promises';
import fetch from 'node-fetch';
import Papa from 'papaparse';

const EMPLOYEES_CSV_URL   = process.env.EMPLOYEES_CSV_URL;
const PICKUP_POINTS_CSV_URL = process.env.PICKUP_POINTS_CSV_URL;
const ASSIGNMENTS_CSV_URL = process.env.ASSIGNMENTS_CSV_URL;

async function fetchCSV(url) {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' }});
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

async function maybeFetchCSV(url, label) {
  if (!url) return [];
  try {
    return await fetchCSV(url);
  } catch (error) {
    console.warn(`⚠️  Failed to fetch ${label ?? url}: ${error.message}`);
    return [];
  }
}

function toEmployeesAggregated(assignments, employeesSheet = []) {
  const baseMap = new Map();
  for (const row of employeesSheet) {
    const driverId = String(row['Driver ID'] ?? row.driverId ?? '').trim();
    if (!driverId) continue;

    const driverName = String(row['Driver Name'] ?? row.driverName ?? '').trim();
    const shiftTime = String(row['Shift Time'] ?? row.shiftTime ?? row.shift ?? '').trim();
    const contactNumber = String(row['Contact Number'] ?? row.contactNumber ?? row.contact ?? '').trim();
    const employmentType = String(row['Employment Type'] ?? row.employmentType ?? row.role ?? '').trim();

    let holidays = row['Holiday'] ?? row.Holiday ?? row.holidays ?? row.holiday ?? row['Holidays'];
    if (Array.isArray(holidays)) {
      holidays = holidays.map((h) => String(h).trim()).filter(Boolean);
    } else if (typeof holidays === 'string') {
      holidays = holidays
        .split(/[,|]/)
        .map((h) => h.trim())
        .filter(Boolean);
    } else if (holidays) {
      holidays = [String(holidays).trim()].filter(Boolean);
    } else {
      holidays = [];
    }

    baseMap.set(driverId, {
      driverId,
      driverName,
      shiftTime,
      contactNumber,
      employmentType,
      holidays,
    });
  }

  const byId = new Map();

  const getOrCreate = (driverId) => {
    if (byId.has(driverId)) return byId.get(driverId);

    const base = baseMap.get(driverId);
    const obj = {
      driverId,
      driverName: base?.driverName ?? '',
      shiftTime: base?.shiftTime ?? '',
      holidays: base?.holidays ? [...base.holidays] : [],
      pickupPoints: [],
      pointCounts: {},
    };

    if (base?.contactNumber) obj.contactNumber = base.contactNumber;
    if (base?.employmentType) obj.employmentType = base.employmentType;

    byId.set(driverId, obj);
    return obj;
  };

  for (const r of assignments) {
    const driverId = String(r['Driver ID'] || '').trim();
    if (!driverId) continue;

    const obj = getOrCreate(driverId);

    const nameFromAssignment = String(r['Driver Name'] || '').trim();
    if (nameFromAssignment && !obj.driverName) obj.driverName = nameFromAssignment;

    const shiftFromAssignment = String(r['Shift Time'] || '').trim();
    if (shiftFromAssignment && !obj.shiftTime) obj.shiftTime = shiftFromAssignment;

    const hol = String(r['HolidayDate'] || r['Holiday'] || '').trim();
    if (hol) obj.holidays.push(hol);

    const pid = String(r['Pickup Point ID'] || '').trim();
    if (pid) {
      const store = String(r['Store Name'] || r['Pickup Point Name'] || '').trim();
      const address = String(r['StoreAddress'] || r['Text Address'] || '').trim();
      obj.pickupPoints.push({ id: pid, store, address });
      obj.pointCounts[pid] = (obj.pointCounts[pid] || 0) + 1;
    }
  }

  for (const driverId of baseMap.keys()) {
    getOrCreate(driverId);
  }

  const result = [];
  for (const d of byId.values()) {
    const seen = new Map();
    for (const p of d.pickupPoints) {
      if (!seen.has(p.id)) seen.set(p.id, p);
    }
    const ids = [...seen.keys()];
    ids.sort((a, b) => (d.pointCounts[b] - d.pointCounts[a]) || a.localeCompare(b, undefined, { numeric: true }));
    d.pickupPoints = ids.map((id) => ({ id, ...seen.get(id) }));

    d.holidays = [...new Set(d.holidays)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!d.contactNumber) delete d.contactNumber;
    if (!d.employmentType) delete d.employmentType;
    delete d.pointCounts;

    result.push(d);
  }

  result.sort((a, b) => {
    const nameA = a.driverName || a.driverId;
    const nameB = b.driverName || b.driverId;
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  return result;
}

async function main() {
  if (!ASSIGNMENTS_CSV_URL) {
    throw new Error('ASSIGNMENTS_CSV_URL environment variable is required');
  }

  const [employeesSheet, pickupPointsSheet, assignmentsSheet] = await Promise.all([
    maybeFetchCSV(EMPLOYEES_CSV_URL, 'employees sheet'),
    maybeFetchCSV(PICKUP_POINTS_CSV_URL, 'pickup points sheet'),
    fetchCSV(ASSIGNMENTS_CSV_URL),
  ]);

  const employeesAgg = toEmployeesAggregated(assignmentsSheet, employeesSheet);

  await Promise.all([
    fs.writeFile('employee_assignments.json', JSON.stringify(assignmentsSheet, null, 2)),
    fs.writeFile('pickup_points.json', JSON.stringify(pickupPointsSheet, null, 2)),
    fs.writeFile('employees.json', JSON.stringify(employeesAgg, null, 2)),
  ]);

  console.log('✅ Synced JSON files in project root');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
