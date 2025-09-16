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

function toEmployeesAggregated(assignments) {
  const byId = new Map();
  for (const r of assignments) {
    const driverId = String(r['Driver ID'] || '').trim();
    if (!driverId) continue;
    const obj = byId.get(driverId) || {
      driverId,
      driverName: String(r['Driver Name'] || '').trim(),
      shiftTime: String(r['Shift Time'] || '').trim(),
      holidays: [],
      pickupPoints: [],
      pointCounts: {}
    };

    const hol = String(r['HolidayDate'] || '').trim();
    if (hol && !obj.holidays.includes(hol)) obj.holidays.push(hol);

    const pid = String(r['Pickup Point ID'] || '').trim();
    if (pid) {
      const store = String(r['Store Name'] || r['Pickup Point Name'] || '').trim();
      const address = String(r['StoreAddress'] || r['Text Address'] || '').trim();
      obj.pickupPoints.push({ id: pid, store, address });
      obj.pointCounts[pid] = (obj.pointCounts[pid] || 0) + 1;
    }
    byId.set(driverId, obj);
  }

  for (const d of byId.values()) {
    const seen = new Map();
    for (const p of d.pickupPoints) if (!seen.has(p.id)) seen.set(p.id, p);
    const ids = [...seen.keys()];
    ids.sort((a,b) => (d.pointCounts[b] - d.pointCounts[a]) || a.localeCompare(b, undefined, { numeric: true }));
    d.pickupPoints = ids.map(id => ({ id, ...seen.get(id) }));
  }
  return [...byId.values()];
}

async function main() {
  const [employeesSheet, pickupPointsSheet, assignmentsSheet] = await Promise.all([
    fetchCSV(EMPLOYEES_CSV_URL).catch(()=>[]),
    fetchCSV(PICKUP_POINTS_CSV_URL).catch(()=>[]),
    fetchCSV(ASSIGNMENTS_CSV_URL)
  ]);

  await fs.mkdir('data', { recursive: true });

  await fs.writeFile('data/employee_assignments.json', JSON.stringify(assignmentsSheet, null, 2));
  await fs.writeFile('data/pickup_points.json', JSON.stringify(pickupPointsSheet, null, 2));
  const employeesAgg = toEmployeesAggregated(assignmentsSheet);
  await fs.writeFile('data/employees.json', JSON.stringify(employeesAgg, null, 2));

  console.log('✅ Synced data/*.json updated');
}
main().catch(e => { console.error(e); process.exit(1); });
