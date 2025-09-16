import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers";

let employees = [];
let pickupPoints = [];
let assignments = [];
let generator = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch] || ch);
}

function pickValue(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value.filter((v) => String(v ?? "").trim() !== "");
  }
  if (value === undefined || value === null) return [];
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
  }
  return [value];
}

async function fetchJSONWithFallback(paths) {
  const list = Array.isArray(paths) ? paths : [paths];
  for (const path of list) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) continue;
      return await res.json();
    } catch (err) {
      console.warn(`ไม่สามารถดึงข้อมูลจาก ${path}:`, err);
    }
  }
  throw new Error(`ไม่สามารถดึงข้อมูลจาก ${list.join(", ")}`);
}

async function loadData() {
  try {
    [employees, pickupPoints, assignments] = await Promise.all([
      fetchJSONWithFallback(["data/employees.json", "employees.json"]),
      fetchJSONWithFallback(["data/pickup_points.json", "pickup_points.json"]),
      fetchJSONWithFallback(["data/employee_assignments.json", "employee_assignments.json"]),
    ]);
    renderDashboard();
  } catch (err) {
    console.error(err);
    const content = document.getElementById("content");
    content.innerHTML = `<div class="bg-red-50 text-red-700 p-4 rounded">ไม่สามารถโหลดข้อมูลได้ โปรดลองใหม่อีกครั้ง</div>`;
  }
}

function renderDashboard() {
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="bg-white p-4 rounded shadow">
      <h2 class="font-bold mb-2">ภาพรวม</h2>
      <p>จำนวนพนักงาน: ${employees.length}</p>
      <p>Pickup Points: ${pickupPoints.length}</p>
      <p>Assignments: ${assignments.length}</p>
    </div>
  `;
}

function renderEmployees() {
  const content = document.getElementById("content");
  if (!employees.length) {
    content.innerHTML = `<div class="bg-white p-6 rounded shadow"><h2 class="font-bold mb-2">ข้อมูลพนักงาน</h2><p class="text-gray-600">ไม่มีข้อมูลพนักงานให้แสดง</p></div>`;
    return;
  }

  const cards = employees.map((employee) => {
    const driverId = pickValue(employee, ["driverId", "Driver ID"]);
    const driverName = pickValue(employee, ["driverName", "Driver Name"]);
    const shiftTime = pickValue(employee, ["shiftTime", "Shift Time"]);
    const holidays = ensureArray(
      employee.holidays ?? employee.Holiday ?? employee.holiday ?? employee.Holidays
    );
    const pickupPointsList = Array.isArray(employee.pickupPoints)
      ? employee.pickupPoints
      : [];

    const holidaysHtml = holidays.length
      ? `<div class="mt-2 text-sm text-gray-600"><span class="font-medium text-gray-700 mr-1">วันหยุด:</span>${holidays
          .map(
            (h) =>
              `<span class="inline-block bg-gray-100 border border-gray-200 px-2 py-0.5 rounded mr-1 mb-1">${escapeHtml(h)}</span>`
          )
          .join("")}</div>`
      : "";

    const pickupPointsHtml = pickupPointsList.length
      ? `<div class="mt-3"><div class="text-sm font-medium text-gray-700 mb-1">Pickup Points</div><ul class="space-y-1 text-sm text-gray-600">${pickupPointsList
          .map((point) => {
            const pointId = pickValue(point, ["id", "Pickup Point ID"]);
            const store = pickValue(point, ["store", "Store Name", "Pickup Point Name"]);
            const address = pickValue(point, ["address", "Text Address", "StoreAddress"]);
            const detailParts = [store, address].filter(Boolean).map(escapeHtml);
            const details = detailParts.join(" • ") || "ไม่มีรายละเอียด";
            const idLabel = pointId ? `<span class="font-semibold text-gray-700 mr-2">#${escapeHtml(pointId)}</span>` : "";
            return `<li class="flex items-start">${idLabel}<span>${details}</span></li>`;
          })
          .join("")}</ul></div>`
      : "";

    return `<div class="bg-white p-4 rounded shadow"><div class="flex justify-between items-start gap-4"><div><h3 class="text-lg font-semibold">${escapeHtml(driverName || "ไม่ทราบชื่อ")}</h3><p class="text-sm text-gray-500">รหัสพนักงาน: ${escapeHtml(driverId || "ไม่ระบุ")}</p></div><span class="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm">กะ ${escapeHtml(shiftTime || "ไม่ระบุ")}</span></div>${holidaysHtml}${pickupPointsHtml}</div>`;
  });

  content.innerHTML = `<h2 class="font-bold mb-4">ข้อมูลพนักงาน</h2><div class="space-y-4">${cards.join("")}</div>`;
}

function renderPoints() {
  const content = document.getElementById("content");
  content.innerHTML = `<h2 class="font-bold mb-2">Pickup Points</h2>` +
    `<ul>` +
    pickupPoints.map(p => `<li>${p["Pickup Point ID"]}: ${p["Pickup Point Name"]} - ${p["Text Address"]}</li>`).join("") +
    `</ul>`;
}

// Tabs
document.getElementById("tab-dashboard").addEventListener("click", ()=>{
  setActive("tab-dashboard"); renderDashboard();
});
document.getElementById("tab-employees").addEventListener("click", ()=>{
  setActive("tab-employees"); renderEmployees();
});
document.getElementById("tab-points").addEventListener("click", ()=>{
  setActive("tab-points"); renderPoints();
});

function setActive(id){
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// Chatbot
document.getElementById("chatbot-toggle").addEventListener("click", ()=>{
  document.getElementById("chatbot").classList.toggle("hidden");
});

document.getElementById("chat-send").addEventListener("click", async ()=>{
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  addMessage("คุณ", msg);
  input.value = "";
  const reply = await chatAI(msg);
  addMessage("AI", reply);
});

function addMessage(sender, text){
  const chat = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "mb-2";
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function chatAI(text){
  if (!generator){
    generator = await pipeline("text2text-generation", "Xenova/LaMini-Flan-T5-77M");
  }
  const out = await generator(text, { max_new_tokens: 50 });
  return out[0].generated_text;
}

loadData();
