import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers";

let employees = [];
let pickupPoints = [];
let assignments = [];
let generator = null;
const content = document.getElementById("content");

async function loadData() {
  employees = await fetch("employees.json").then(r=>r.json());
  pickupPoints = await fetch("pickup_points.json").then(r=>r.json());
  assignments = await fetch("employee_assignments.json").then(r=>r.json());
  renderDashboard();
}

function renderDashboard() {
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
  content.innerHTML = `
    <h2 class="font-bold mb-2">ข้อมูลพนักงาน</h2>
    <ul class="list-with-actions">
      ${employees.map(e => {
        const id = e["Driver ID"];
        const name = e["Driver Name"];
        const shift = e["Shift Time"];
        return `
          <li class="list-item">
            <span class="item-text">${id}: ${name} (Shift ${shift})</span>
            <button class="copy-driver" data-value="${id}">คัดลอก</button>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function renderPoints() {
  content.innerHTML = `
    <h2 class="font-bold mb-2">Pickup Points</h2>
    <ul class="list-with-actions">
      ${pickupPoints.map(p => {
        const id = p["Pickup Point ID"];
        const name = p["Pickup Point Name"];
        const address = p["Text Address"];
        return `
          <li class="list-item">
            <span class="item-text">${id}: ${name} - ${address}</span>
            <button class="copy-point" data-value="${id}">คัดลอก</button>
          </li>
        `;
      }).join("")}
    </ul>
  `;
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

content.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-driver, .copy-point");
  if (!button || !content.contains(button)) {
    return;
  }

  const value = button.dataset.value;
  if (!value) {
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;

  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }

    await navigator.clipboard.writeText(value);
    button.textContent = "คัดลอกแล้ว!";
    button.classList.add("copied");
  } catch (error) {
    console.error("ไม่สามารถคัดลอกได้", error);
    button.textContent = "คัดลอกไม่สำเร็จ";
    button.classList.add("copy-error");
    alert("ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกด้วยตนเอง");
  }

  setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
    button.classList.remove("copied", "copy-error");
  }, 2000);
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
