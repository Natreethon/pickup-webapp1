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
  content.innerHTML = `<h2 class="font-bold mb-2">ข้อมูลพนักงาน</h2>` +
    `<ul>` +
    employees.map(e => {
      const id = e["Driver ID"] ?? e.driverId ?? "-";
      const name = e["Driver Name"] ?? e.driverName ?? "-";
      const shift = e["Shift Time"] ?? e.shiftTime ?? "-";
      const holidaysRaw = e["Holiday"] ?? e["HolidayDate"] ?? e.holidays;
      let holidays = "";
      if (Array.isArray(holidaysRaw) && holidaysRaw.length) {
        holidays = ` | วันหยุด: ${holidaysRaw.join(", ")}`;
      } else if (typeof holidaysRaw === "string" && holidaysRaw.trim()) {
        holidays = ` | วันหยุด: ${holidaysRaw}`;
      }
      let pickupPoints = "";
      if (Array.isArray(e.pickupPoints) && e.pickupPoints.length) {
        const points = e.pickupPoints.map(p => {
          const idText = p.id ?? p["Pickup Point ID"] ?? "";
          const nameText = p.store ?? p["Pickup Point Name"] ?? "";
          return nameText ? `${idText} (${nameText})` : idText;
        }).filter(Boolean).join(", ");
        if (points) pickupPoints = ` | จุดรับ: ${points}`;
      }
      return `<li>${id}: ${name} (Shift ${shift})${holidays}${pickupPoints}</li>`;
    }).join("") +
    `</ul>`;
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
