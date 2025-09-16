import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers";

let employees = [];
let pickupPoints = [];
let assignments = [];
let generator = null;

async function loadData() {
  employees = await fetch("employees.json").then(r=>r.json());
  pickupPoints = await fetch("pickup_points.json").then(r=>r.json());
  assignments = await fetch("employee_assignments.json").then(r=>r.json());
  renderDashboard();
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
    content.innerHTML = `<h2 class="font-bold mb-2">ข้อมูลพนักงาน</h2><p>ไม่พบข้อมูลพนักงาน</p>`;
    return;
  }

  const cards = employees.map(e => {
    const driverId = e.driverId ?? e["Driver ID"] ?? "-";
    const driverName = e.driverName ?? e["Driver Name"] ?? "ไม่ทราบชื่อ";
    const shiftTime = e.shiftTime ?? e["Shift Time"] ?? "-";

    const holidays = Array.isArray(e.holidays)
      ? e.holidays
      : Array.isArray(e.Holiday)
        ? e.Holiday
        : [];
    const pickupPoints = Array.isArray(e.pickupPoints)
      ? e.pickupPoints
      : [];

    const holidaysHtml = holidays.length
      ? holidays.join(", ")
      : "ไม่มีข้อมูล";

    const pickupHtml = pickupPoints.length
      ? `<ul class="list-disc list-inside space-y-1">${pickupPoints
          .map(p => `<li><span class="font-semibold">${p.store || p.name || p.id}</span>${p.address ? ` — ${p.address}` : ""}</li>`)
          .join("")}</ul>`
      : `<p class="text-sm text-gray-500">ยังไม่มีจุดรับสินค้า</p>`;

    return `
      <article class="border rounded-lg p-4 shadow-sm bg-white">
        <header class="mb-2">
          <h3 class="text-lg font-semibold">${driverName}</h3>
          <p class="text-sm text-gray-500">รหัสพนักงาน: ${driverId}</p>
        </header>
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between">
            <dt class="font-medium">รอบเวลา</dt>
            <dd>${shiftTime || "-"}</dd>
          </div>
          <div>
            <dt class="font-medium">วันหยุด</dt>
            <dd>${holidaysHtml}</dd>
          </div>
          <div>
            <dt class="font-medium mb-1">จุดรับสินค้า</dt>
            <dd>${pickupHtml}</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");

  content.innerHTML = `
    <h2 class="font-bold mb-4">ข้อมูลพนักงาน</h2>
    <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      ${cards}
    </section>
  `;
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
