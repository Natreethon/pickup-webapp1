import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers";

let employees = [];
let pickupPoints = [];
let assignments = [];
let generator = null;
let copyFeedbackTimer = null;

const contentContainer = document.getElementById("content");

const htmlEscapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
}

async function loadJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`โหลดข้อมูลจาก ${url} ไม่สำเร็จ: ${res.status}`);
  }
  return res.json();
}

async function loadData() {
  try {
    const [employeeData, pickupPointData, assignmentData] = await Promise.all([
      loadJson("employees.json"),
      loadJson("pickup_points.json"),
      loadJson("employee_assignments.json"),
    ]);

    employees = Array.isArray(employeeData) ? employeeData : [];
    pickupPoints = Array.isArray(pickupPointData) ? pickupPointData : [];
    assignments = Array.isArray(assignmentData) ? assignmentData : [];

    renderDashboard();
  } catch (error) {
    console.error(error);
    contentContainer.innerHTML = `
      <div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
        ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง
      </div>
    `;
  }
}

function normaliseEmployee(raw) {
  const driverId = raw?.driverId ?? raw?.["Driver ID"] ?? "";
  const driverName = raw?.driverName ?? raw?.["Driver Name"] ?? "";
  const shiftTime = raw?.shiftTime ?? raw?.shift ?? raw?.["Shift Time"] ?? "";
  const contactNumber = raw?.contactNumber ?? raw?.contact ?? raw?.["Contact Number"] ?? "";
  const employmentType = raw?.employmentType ?? raw?.role ?? raw?.["Employment Type"] ?? "";

  let holidays = raw?.holidays ?? raw?.holiday ?? raw?.Holiday ?? [];
  if (!Array.isArray(holidays)) {
    holidays = holidays ? [holidays] : [];
  }

  const pickupSource = Array.isArray(raw?.pickupPoints)
    ? raw.pickupPoints
    : Array.isArray(raw?.["Pickup Points"])
      ? raw["Pickup Points"]
      : [];

  const pickupList = pickupSource
    .map((point) => {
      if (!point) return null;
      if (typeof point === "string") {
        const id = point.trim();
        if (!id) return null;
        return { id, name: "", address: "" };
      }

      const id = point.id ?? point.pickupPointId ?? point["Pickup Point ID"] ?? "";
      const name = point.store ?? point["Store Name"] ?? point["Pickup Point Name"] ?? point.name ?? "";
      const address = point.address ?? point["Text Address"] ?? point["StoreAddress"] ?? point.location ?? "";
      if (!id && !name && !address) return null;
      return { id: String(id), name: String(name || ""), address: String(address || "") };
    })
    .filter(Boolean);

  return {
    id: String(driverId || ""),
    name: String(driverName || ""),
    shift: String(shiftTime || ""),
    contact: String(contactNumber || ""),
    employmentType: String(employmentType || ""),
    holidays: holidays.map((h) => String(h)).filter(Boolean),
    pickupPoints: pickupList,
  };
}

function normalisePickupPoint(raw) {
  const id = raw?.["Pickup Point ID"] ?? raw?.pickupPointId ?? raw?.id ?? "";
  const name = raw?.["Pickup Point Name"] ?? raw?.name ?? raw?.store ?? raw?.["Store Name"] ?? "";
  const address = raw?.["Text Address"] ?? raw?.address ?? raw?.["StoreAddress"] ?? raw?.location ?? "";
  const contact = raw?.["Contact Number"] ?? raw?.contact ?? raw?.phone ?? "";
  const schedule = raw?.Schedule ?? raw?.schedule ?? "";

  return {
    id: String(id || ""),
    name: String(name || ""),
    address: String(address || ""),
    contact: String(contact || ""),
    schedule: String(schedule || ""),
  };
}

function renderDashboard() {
  contentContainer.innerHTML = `
    <div class="bg-white p-4 rounded shadow">
      <h2 class="font-bold mb-2">ภาพรวม</h2>
      <p>จำนวนพนักงาน: ${employees.length}</p>
      <p>Pickup Points: ${pickupPoints.length}</p>
      <p>Assignments: ${assignments.length}</p>
    </div>
  `;
}

function renderEmployees() {
  const items = employees
    .map((employee) => {
      const data = normaliseEmployee(employee);
      if (!data.id && !data.name) {
        return null;
      }

      const details = [];

      if (data.contact) {
        details.push(`<div class="text-xs text-gray-500 mt-2">โทร: ${escapeHtml(data.contact)}</div>`);
      }

      if (data.employmentType) {
        details.push(`<div class="text-xs text-gray-500 mt-2">ประเภท: ${escapeHtml(data.employmentType)}</div>`);
      }

      if (data.holidays.length) {
        details.push(`<div class="text-xs text-gray-500 mt-2">วันหยุด: ${escapeHtml(data.holidays.join(", "))}</div>`);
      }

      if (data.pickupPoints.length) {
        details.push(`<div class="text-xs text-gray-500 mt-2">จุดรับ: ${data.pickupPoints
          .map((point) => {
            const detailsText = [point.name, point.address].filter(Boolean).join(" • ");
            return `<span class="inline-flex items-center mr-2">${escapeHtml(point.id)}${detailsText ? ` — ${escapeHtml(detailsText)}` : ""}</span>`;
          })
          .join("")}</div>`);
      }

      const copyButton = data.id
        ? `<button type="button" class="copy-button" data-copy="${escapeHtml(data.id)}" data-copy-label="รหัสพนักงาน ${escapeHtml(data.id)}">คัดลอกเลข</button>`
        : "";

      return `
        <li class="flex items-start justify-between gap-3 bg-white rounded-lg shadow px-4 py-3">
          <div>
            <div class="font-semibold text-gray-900">${escapeHtml(data.name || "ไม่ทราบชื่อ")}</div>
            <div class="text-sm text-gray-600 mt-1">
              ${data.id ? `<span class="inline-flex items-center mr-3"><span class="font-medium">ID:</span>&nbsp;${escapeHtml(data.id)}</span>` : ""}
              ${data.shift ? `<span class="inline-flex items-center">Shift: ${escapeHtml(data.shift)}</span>` : ""}
            </div>
            ${details.join("")}
          </div>
          ${copyButton}
        </li>
      `;
    })
    .filter(Boolean)
    .join("");

  contentContainer.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-bold text-lg">ข้อมูลพนักงาน</h2>
      <span class="text-sm text-gray-500">${employees.length} รายการ</span>
    </div>
    <ul class="space-y-3">
      ${items || '<li class="text-sm text-gray-500">ไม่มีข้อมูลพนักงาน</li>'}
    </ul>
  `;
}

function renderPoints() {
  const items = pickupPoints
    .map((point) => {
      const data = normalisePickupPoint(point);
      if (!data.id && !data.name && !data.address) {
        return null;
      }

      const meta = [
        data.address ? `<div class="text-sm text-gray-600">${escapeHtml(data.address)}</div>` : "",
        data.contact ? `<div class="text-xs text-gray-500 mt-1">โทร: ${escapeHtml(data.contact)}</div>` : "",
        data.schedule ? `<div class="text-xs text-gray-500 mt-1">เวลาเปิด: ${escapeHtml(data.schedule)}</div>` : "",
      ]
        .filter(Boolean)
        .join("");

      const copyButton = data.id
        ? `<button type="button" class="copy-button" data-copy="${escapeHtml(data.id)}" data-copy-label="Pickup Point ${escapeHtml(data.id)}">คัดลอกเลข</button>`
        : "";

      return `
        <li class="flex items-start justify-between gap-3 bg-white rounded-lg shadow px-4 py-3">
          <div>
            <div class="font-semibold text-gray-900">${escapeHtml(data.name || "ไม่ทราบชื่อจุดรับ")}</div>
            <div class="text-sm text-gray-600 mt-1">${data.id ? `ID: ${escapeHtml(data.id)}` : ""}</div>
            ${meta}
          </div>
          ${copyButton}
        </li>
      `;
    })
    .filter(Boolean)
    .join("");

  contentContainer.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-bold text-lg">Pickup Points</h2>
      <span class="text-sm text-gray-500">${pickupPoints.length} รายการ</span>
    </div>
    <ul class="space-y-3">
      ${items || '<li class="text-sm text-gray-500">ไม่มีข้อมูลจุดรับ</li>'}
    </ul>
  `;
}

// Tabs
document.getElementById("tab-dashboard").addEventListener("click", () => {
  setActive("tab-dashboard");
  renderDashboard();
});
document.getElementById("tab-employees").addEventListener("click", () => {
  setActive("tab-employees");
  renderEmployees();
});
document.getElementById("tab-points").addEventListener("click", () => {
  setActive("tab-points");
  renderPoints();
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

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }

  document.body.removeChild(textarea);
  if (selectedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(selectedRange);
  }
  return ok;
}

function showCopyFeedback(message, isError = false) {
  let feedback = document.getElementById("copy-feedback");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.id = "copy-feedback";
    feedback.className = "copy-feedback";
    document.body.appendChild(feedback);
  }

  feedback.textContent = message;
  feedback.classList.toggle("error", Boolean(isError));
  feedback.classList.add("visible");

  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
  }
  copyFeedbackTimer = setTimeout(() => {
    feedback.classList.remove("visible");
  }, 2000);
}

contentContainer.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-copy]");
  if (!button) return;

  const value = button.getAttribute("data-copy");
  const label = button.getAttribute("data-copy-label") || value;
  if (!value) {
    showCopyFeedback("ไม่มีข้อมูลสำหรับคัดลอก", true);
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      showCopyFeedback(`คัดลอก${label ? ` ${label}` : ""}แล้ว`);
      return;
    }
  } catch (error) {
    console.warn("Clipboard API failed, falling back", error);
  }

  const ok = fallbackCopy(value);
  showCopyFeedback(ok ? `คัดลอก${label ? ` ${label}` : ""}แล้ว` : "ไม่สามารถคัดลอกได้", !ok);
});

loadData();
