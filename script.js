import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, writeBatch, getDocs, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

(() => {
    "use strict";

    const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxR7u5SZ7d8BQoVs3tH_lX61Ro89P5yP4v2Qfkf4cmD8nBoLz1pZ1MNnxlChckvrRfzkA/exec";
    const G_GEMINI_KEY = typeof window !== "undefined" && window.G_GEMINI_KEY ? window.G_GEMINI_KEY : "";

    const rawFirebaseConfig = typeof __firebase_config !== "undefined"
        ? __firebase_config
        : (typeof window !== "undefined" ? window.__firebase_config : undefined);

    let firebaseConfig = {};
    if (rawFirebaseConfig) {
        if (typeof rawFirebaseConfig === "string") {
            try {
                firebaseConfig = JSON.parse(rawFirebaseConfig);
            } catch (error) {
                console.warn("ไม่สามารถแปลง firebase config ได้", error);
            }
        } else if (typeof rawFirebaseConfig === "object") {
            firebaseConfig = rawFirebaseConfig;
        }
    }

    const rawAppId = typeof __app_id !== "undefined"
        ? __app_id
        : (typeof window !== "undefined" ? window.__app_id : undefined);
    const appId = rawAppId || "default-app-id";

    const DAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const elements = {
        container: document.getElementById("employeeCardsContainer"),
        searchInput: document.getElementById("searchInput"),
        loadingDashboard: document.getElementById("loading-dashboard"),
        noResultsDashboard: document.getElementById("noResults-dashboard"),
        refreshBtn: document.getElementById("refreshBtn"),
        groupBtn: document.getElementById("groupBtn"),
        groupIdsInput: document.getElementById("groupIds"),
        aiSuggestBtn: document.getElementById("aiSuggestBtn"),
        resetAllBtn: document.getElementById("resetAllBtn"),
        toastContainer: document.getElementById("toast-container"),
        tabDashboard: document.getElementById("tab-dashboard"),
        tabEmployeeList: document.getElementById("tab-employee-list"),
        tabPickupPoints: document.getElementById("tab-pickup-points"),
        tabContentDashboard: document.getElementById("tab-content-dashboard"),
        tabContentEmployeeList: document.getElementById("tab-content-employee-list"),
        tabContentPickupPoints: document.getElementById("tab-content-pickup-points"),
        employeeTableBody: document.getElementById("employeeTableBody"),
        noResultsList: document.getElementById("noResults-list"),
        pickupPointsTableBody: document.getElementById("pickupPointsTableBody"),
        noResultsPoints: document.getElementById("noResults-points"),
        confirmationModal: document.getElementById("confirmationModal"),
        confirmationModalBox: document.getElementById("confirmationModalBox"),
        confirmResetBtn: document.getElementById("confirmReset"),
        cancelResetBtn: document.getElementById("cancelReset"),
        aiSuggestionModal: document.getElementById("aiSuggestionModal"),
        aiSuggestionModalBox: document.getElementById("aiSuggestionModalBox"),
        aiSuggestionContent: document.getElementById("aiSuggestionContent"),
        closeAiSuggestionModalBtn: document.getElementById("closeAiSuggestionModal"),
        aiLoading: document.getElementById("aiLoading"),
        aiResult: document.getElementById("aiResult"),
        routePlanModal: document.getElementById("routePlanModal"),
        routePlanModalBox: document.getElementById("routePlanModalBox"),
        closeRoutePlanModalBtn: document.getElementById("closeRoutePlanModal"),
        routePlanLoading: document.getElementById("routePlanLoading"),
        routePlanResult: document.getElementById("routePlanResult"),
        overallProgressSection: document.getElementById("overall-progress-section"),
        overallProgressBar: document.getElementById("overall-progress-bar"),
        overallProgressText: document.getElementById("overall-progress-text"),
    };

    let db = null;
    let auth = null;
    let allDrivers = [];
    let allPickupPoints = [];
    let copiedStatuses = {};
    let mergedDriver = null;
    let activeTab = "dashboard";
    let unsubscribeCopiedListener = null;

    function lock(btn) {
        if (!btn) {
            return () => {};
        }
        btn.disabled = true;
        btn.classList.add("opacity-60");
        return () => {
            btn.disabled = false;
            btn.classList.remove("opacity-60");
        };
    }

    function getTodayDateString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getTodayDayAbbreviation() {
        const today = new Date();
        return DAY_ABBREVIATIONS[today.getDay()];
    }

    function normaliseDayLabel(value) {
        if (!value) {
            return null;
        }
        const raw = String(value).trim();
        if (!raw) {
            return null;
        }
        const formatted = raw.substring(0, 3);
        const label = `${formatted.charAt(0).toUpperCase()}${formatted.substring(1).toLowerCase()}`;
        return DAY_ABBREVIATIONS.includes(label) ? label : null;
    }

    function showToast(message, type = "info") {
        if (!elements.toastContainer) {
            return;
        }
        const toast = document.createElement("div");
        const icon = type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : "fa-info-circle";
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="fas ${icon} mr-3"></i> ${message}`;
        elements.toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("show"));
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function highlightText(text, query) {
        if (!query || !text) {
            return text;
        }
        const safeText = String(text);
        const safeQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const regex = new RegExp(`(${safeQuery})`, "gi");
        return safeText.replace(regex, '<span class="highlight">$1</span>');
    }

    function openModal(modal, box) {
        if (!modal || !box) {
            return;
        }
        modal.classList.remove("hidden");
        requestAnimationFrame(() => {
            box.classList.remove("scale-95", "opacity-0");
        });
    }

    function closeModal(modal, box) {
        if (!modal || !box) {
            return;
        }
        box.classList.add("scale-95", "opacity-0");
        setTimeout(() => {
            modal.classList.add("hidden");
        }, 200);
    }

    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            console.warn("Clipboard API failed", error);
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        let ok = false;
        try {
            ok = document.execCommand("copy");
        } catch (error) {
            ok = false;
        }
        document.body.removeChild(textarea);
        return ok;
    }

    function planRouteHeuristic(points) {
        const enriched = points.map((point, index) => {
            const addressTokens = (point.address || "")
                .split(/[,\s]+/)
                .filter(Boolean)
                .slice(-3)
                .join(" ")
                .toLowerCase();
            const storeToken = (point.store || "").toLowerCase();
            const idToken = String(point.id || "");
            return {
                id: idToken,
                store: point.store || "",
                address: point.address || "",
                _sortKey: `${addressTokens}|${storeToken}|${idToken}`,
                _originalIndex: index,
            };
        });

        enriched.sort((a, b) => {
            const diff = a._sortKey.localeCompare(b._sortKey, undefined, { numeric: true });
            return diff !== 0 ? diff : a._originalIndex - b._originalIndex;
        });

        return enriched.map((item, idx) => ({
            id: item.id,
            store: item.store,
            address: item.address,
            order: idx + 1,
        }));
    }

    function switchTab(newTab) {
        activeTab = newTab;
        const tabs = {
            dashboard: { btn: elements.tabDashboard, content: elements.tabContentDashboard },
            "employee-list": { btn: elements.tabEmployeeList, content: elements.tabContentEmployeeList },
            "pickup-points": { btn: elements.tabPickupPoints, content: elements.tabContentPickupPoints },
        };
        Object.entries(tabs).forEach(([key, value]) => {
            if (!value.btn || !value.content) {
                return;
            }
            if (key === newTab) {
                value.content.classList.remove("hidden");
                value.btn.classList.add("active");
            } else {
                value.content.classList.add("hidden");
                value.btn.classList.remove("active");
            }
        });
        renderContent();
    }

    function groupDrivers() {
        const idsToGroup = elements.groupIdsInput.value
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        if (idsToGroup.length < 2) {
            showToast("กรุณาใส่ Driver ID อย่างน้อย 2 คน", "error");
            return;
        }
        const driversToGroup = allDrivers.filter((driver) => idsToGroup.includes(driver.driverId));
        if (driversToGroup.length !== idsToGroup.length) {
            showToast("พบ ID บางส่วนไม่ถูกต้อง", "error");
            return;
        }

        const mergedCounts = {};
        const driverSpecificPoints = [];
        const allPointsMap = new Map();

        const firstDriverPoints = new Set(driversToGroup[0].pickupPoints.map((point) => point.id));
        const commonPointIds = new Set(firstDriverPoints);

        for (let i = 1; i < driversToGroup.length; i += 1) {
            const currentDriverPoints = new Set(driversToGroup[i].pickupPoints.map((point) => point.id));
            for (const pointId of Array.from(commonPointIds)) {
                if (!currentDriverPoints.has(pointId)) {
                    commonPointIds.delete(pointId);
                }
            }
        }

        driversToGroup.forEach((driver) => {
            const specificPoints = [];
            driver.pickupPoints.forEach((point) => {
                if (!allPointsMap.has(point.id)) {
                    allPointsMap.set(point.id, { store: point.store, address: point.address });
                }
                if (commonPointIds.has(point.id)) {
                    mergedCounts[point.id] = (mergedCounts[point.id] || 0) + (driver.pointCounts[point.id] || 0);
                } else {
                    specificPoints.push(point);
                }
            });
            driverSpecificPoints.push({
                driverName: driver.driverName,
                driverId: driver.driverId,
                points: specificPoints,
            });
        });

        const sortedCommonPoints = Array.from(commonPointIds).sort((a, b) => {
            const diff = (mergedCounts[b] || 0) - (mergedCounts[a] || 0);
            if (diff !== 0) {
                return diff;
            }
            return a.localeCompare(b, undefined, { numeric: true });
        });

        mergedDriver = {
            isMerged: true,
            driverId: `merged-${idsToGroup.join("-")}`,
            driverName: "ข้อมูลร่วมของกลุ่ม",
            originalDriverIds: idsToGroup,
            commonPoints: sortedCommonPoints.map((id) => ({ id, ...allPointsMap.get(id) })),
            pointCounts: mergedCounts,
            driverSpecificPoints,
        };

        renderContent();
    }

    async function robustFetch(url, options = {}, { timeoutMs = 30000, retries = 1, backoffMs = 900, cacheBust = true } = {}) {
        const requestUrl = cacheBust ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url;
        let attempt = 0;
        let lastError = null;
        while (attempt <= retries) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(requestUrl, { ...options, signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    const error = new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
                    error.name = "HttpError";
                    error.status = response.status;
                    throw error;
                }
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                lastError = error;
                if (attempt === retries) {
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
                attempt += 1;
            }
        }
        const error = new Error(lastError?.message || "robustFetch failed");
        error.isAbort = lastError?.name === "AbortError";
        error.cause = lastError;
        throw error;
    }

    function requireGeminiKeyOrToast() {
        const hasKey = Boolean(G_GEMINI_KEY);
        if (!hasKey) {
            showToast("⚠️ ยังไม่ตั้งค่า Gemini API Key", "info");
        }
        return hasKey;
    }

    function suggestGroupsLocally(drivers, minOverlap = 3) {
        const results = [];
        const byId = new Map(drivers.map((driver) => [driver.driverId, driver]));
        const ids = drivers.filter((driver) => driver.pickupPoints?.length).map((driver) => driver.driverId);

        for (let i = 0; i < ids.length; i += 1) {
            for (let j = i + 1; j < ids.length; j += 1) {
                const driverA = byId.get(ids[i]);
                const driverB = byId.get(ids[j]);
                if (!driverA || !driverB) {
                    continue;
                }
                const setA = new Set(driverA.pickupPoints.map((point) => point.id));
                let overlap = 0;
                driverB.pickupPoints.forEach((point) => {
                    if (setA.has(point.id)) {
                        overlap += 1;
                    }
                });
                if (overlap >= minOverlap) {
                    results.push({
                        reason: `แนะนำกลุ่มเพราะมีจุดซ้ำกัน ${overlap} จุด`,
                        driverIds: [driverA.driverId, driverB.driverId],
                    });
                }
            }
        }

        results.sort((a, b) => {
            const aCount = parseInt(a.reason.match(/\d+/)?.[0] || "0", 10);
            const bCount = parseInt(b.reason.match(/\d+/)?.[0] || "0", 10);
            return bCount - aCount;
        });

        return results.slice(0, 10);
    }

    async function getAIGroupSuggestions() {
        const unlock = lock(elements.aiSuggestBtn);

        openModal(elements.aiSuggestionModal, elements.aiSuggestionModalBox);
        elements.aiResult.innerHTML = "";
        elements.aiResult.classList.add("hidden");
        elements.aiLoading.classList.remove("hidden");

        if (allDrivers.length === 0) {
            showToast("ไม่มีข้อมูลพนักงานให้วิเคราะห์", "error");
            elements.aiLoading.classList.add("hidden");
            elements.aiResult.classList.remove("hidden");
            elements.aiResult.innerHTML = '<p class="text-gray-600">ไม่มีข้อมูล</p>';
            unlock();
            return;
        }

        const driverDataForPrompt = allDrivers
            .filter((driver) => driver.pickupPoints.length > 0)
            .map((driver) => `ID ${driver.driverId}: ${driver.pickupPoints.map((point) => point.id).join(", ")}`)
            .join("; ");

        const prompt = `From the provided driver data, identify groups of 2 or more drivers with significant pickup point overlaps. Emphasize finding pairs with high overlap. Respond JSON following schema (reason in Thai). Data: ${driverDataForPrompt}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            reason: { type: "STRING" },
                            driverIds: { type: "ARRAY", items: { type: "STRING" } },
                        },
                        required: ["reason", "driverIds"],
                    },
                },
            },
        };

        try {
            if (!requireGeminiKeyOrToast()) {
                throw { name: "NoKey", message: "No Gemini Key" };
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${G_GEMINI_KEY}`;
            const response = await robustFetch(
                apiUrl,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
                { timeoutMs: 30000, retries: 1 },
            );

            const raw = await response.text();
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (error) {
                throw new Error(`AI ตอบกลับไม่ใช่ JSON: ${raw.slice(0, 200)}`);
            }

            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                throw new Error("ไม่ได้รับข้อมูลจาก AI");
            }

            let suggestions;
            try {
                suggestions = JSON.parse(text);
            } catch (error) {
                throw new Error(`รูปแบบคำตอบ AI ไม่ตรง schema: ${text.slice(0, 200)}`);
            }

            renderAISuggestions(suggestions);
        } catch (error) {
            console.error("[AI Suggestion failed]", error);
            const fallback = suggestGroupsLocally(allDrivers, 3);
            if (fallback.length > 0) {
                showToast(error.isAbort ? "⏳ AI ช้า ใช้ผลลัพธ์สำรองในเครื่องแทน" : "⚠️ ใช้ผลลัพธ์สำรองในเครื่อง", "info");
                elements.aiResult.innerHTML = `
                    <div class="p-3 mb-3 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200">
                      เซิร์ฟเวอร์ AI กำลังหนาแน่น → ใช้ผลวิเคราะห์สำรองในเครื่อง
                    </div>`;
                renderAISuggestions(fallback);
            } else {
                const message = error?.isAbort
                    ? "การเชื่อมต่อช้าเกินกำหนด (Timeout)"
                    : error?.name === "NoKey"
                        ? "ยังไม่ตั้งค่า API Key"
                        : error?.message || "ไม่ทราบสาเหตุ";
                elements.aiResult.innerHTML = `<p class="text-red-500">เกิดข้อผิดพลาดในการวิเคราะห์: ${message}</p>`;
                showToast(`❌ การวิเคราะห์ล้มเหลว: ${message}`, error?.isAbort ? "info" : "error");
            }
        } finally {
            elements.aiLoading.classList.add("hidden");
            elements.aiResult.classList.remove("hidden");
            unlock();
        }
    }

    function renderAISuggestions(suggestions) {
        elements.aiResult.innerHTML = "";
        if (!suggestions || suggestions.length === 0) {
            elements.aiResult.innerHTML = "<p>ไม่พบกลุ่มที่เหมาะสมที่จะแนะนำ</p>";
            return;
        }

        suggestions.forEach((group) => {
            const driversInGroup = allDrivers.filter((driver) => group.driverIds.includes(driver.driverId));
            if (driversInGroup.length < 2) {
                return;
            }

            const firstDriverPoints = new Set(driversInGroup[0].pickupPoints.map((point) => point.id));
            const commonPointIds = new Set(firstDriverPoints);

            for (let i = 1; i < driversInGroup.length; i += 1) {
                const currentDriverPoints = new Set(driversInGroup[i].pickupPoints.map((point) => point.id));
                for (const pointId of Array.from(commonPointIds)) {
                    if (!currentDriverPoints.has(pointId)) {
                        commonPointIds.delete(pointId);
                    }
                }
            }

            const commonPointsArray = Array.from(commonPointIds);

            const groupElement = document.createElement("div");
            groupElement.className = "p-4 border rounded-xl mb-4 bg-gray-50 shadow-sm";
            groupElement.innerHTML = `
                <p class="font-semibold text-gray-800">${group.reason}</p>
                <p class="text-sm text-gray-600 mt-2"><strong><i class="fas fa-check-double mr-2"></i>เหมือนกัน ${commonPointsArray.length} จุด:</strong> ${commonPointsArray.slice(0, 5).join(', ')}${commonPointsArray.length > 5 ? '...' : ''}</p>
                <p class="text-sm text-gray-500 my-2">
                    <i class="fas fa-users mr-2"></i><strong>IDs:</strong> ${group.driverIds.join(', ')}
                </p>
                <button class="use-ai-group-btn mt-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all text-sm font-semibold flex items-center space-x-2 transform hover:-translate-y-0.5 shadow-md" data-ids="${group.driverIds.join(',')}">
                    <i class="fas fa-check-circle"></i>
                    <span>ใช้กลุ่มนี้</span>
                </button>
            `;
            elements.aiResult.appendChild(groupElement);
        });
    }
    async function getRoutePlan(driver) {
        openModal(elements.routePlanModal, elements.routePlanModalBox);
        elements.routePlanResult.classList.add("hidden");
        elements.routePlanLoading.classList.remove("hidden");

        const points = (driver.isMerged ? driver.commonPoints : driver.pickupPoints).map((point) => ({
            id: point.id,
            store: point.store,
            address: point.address,
        }));

        const apiKey = G_GEMINI_KEY;
        const prompt = `คุณคือผู้เชี่ยวชาญด้านโลจิสติกส์ กรุณาสร้างแผนเส้นทางการเดินทางที่มีประสิทธิภาพสำหรับพนักงานชื่อ "${driver.driverName}" โดยเรียงลำดับจุดรับส่งตามความเหมาะสมที่สุดในการเดินทาง พร้อมสรุปสั้นๆ\n\nรายการจุดรับส่ง:\n${points.map((p) => `- ID: ${p.id}, ร้าน: ${p.store}, ที่อยู่: ${p.address}`).join('\n')}\n\nรูปแบบสรุป:\n1) ลำดับเส้นทาง (รายการ 1..n)\n2) เหตุผล/หลักการสั้น ๆ`;

        try {
            if (!requireGeminiKeyOrToast()) {
                throw { name: "NoKey", message: "No Gemini Key" };
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
            const response = await robustFetch(
                apiUrl,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                },
                { timeoutMs: 30000, retries: 1 },
            );

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            elements.routePlanResult.textContent = text || "ไม่ได้รับคำตอบจาก AI";
        } catch (error) {
            const message = error?.isAbort
                ? "⏳ AI ช้าเกินกำหนด (Timeout)"
                : error?.name === "NoKey"
                    ? "ยังไม่ตั้งค่า API Key"
                    : error?.message || "ไม่ทราบสาเหตุ";

            if (error.isAbort) {
                const plan = planRouteHeuristic(points);
                const pretty = [
                    "แผนเส้นทางแบบสำรอง (ไม่ใช้ GPS):",
                    ...plan.map((p) => `${p.order}. [${p.id}] ${p.store} — ${p.address}`),
                    "",
                    "หลักการ:",
                    "- จัดกลุ่มตามเขต/แขวง/อำเภอ/จังหวัดจากที่อยู่",
                    "- ภายในกลุ่ม เรียงตามรหัสจุดและชื่อร้าน",
                    "- *แนะนำ* ปรับละเอียดด้วยแผนที่จริง/สภาพจราจร",
                ].join("\n");
                elements.routePlanResult.textContent = pretty;
                showToast("⚠️ ใช้แผนสำรอง: จัดลำดับโดยที่อยู่", "info");
            } else {
                elements.routePlanResult.textContent = `เกิดข้อผิดพลาดในการสร้างแผน: ${message}`;
                showToast(`❌ สร้างแผนล้มเหลว: ${message}`, error?.isAbort ? "info" : "error");
            }
        } finally {
            elements.routePlanLoading.classList.add("hidden");
            elements.routePlanResult.classList.remove("hidden");
        }
    }

    async function initFirebase() {
        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
            console.info("Firebase configuration not provided; running in local-only mode");
            return false;
        }
        try {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else if (typeof window !== "undefined" && window.__initial_auth_token) {
                await signInWithCustomToken(auth, window.__initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
            return true;
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            const message = error.code === "auth/network-request-failed"
                ? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Firebase ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"
                : error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล";
            showToast(`❌ เชื่อมต่อฐานข้อมูลล้มเหลว: ${message}`, "error");
            db = null;
            auth = null;
            return false;
        }
    }

    function listenForCopiedStatusChanges() {
        if (!db) {
            return;
        }
        if (unsubscribeCopiedListener) {
            unsubscribeCopiedListener();
        }
        const todayDate = getTodayDateString();
        const collectionPath = `/artifacts/${appId}/public/data/copiedStatuses/${todayDate}/drivers`;
        unsubscribeCopiedListener = onSnapshot(
            query(collection(db, collectionPath)),
            (snapshot) => {
                const newStatuses = {};
                snapshot.forEach((docSnap) => {
                    newStatuses[docSnap.id] = docSnap.data().copiedPoints || [];
                });
                copiedStatuses = newStatuses;
                renderContent();
            },
            (error) => {
                console.error("Error listening to Firestore:", error);
                showToast("❌ เกิดข้อผิดพลาดในการซิงค์ข้อมูล", "error");
            },
        );
    }

    function updateLocalCopiedStatus(driverId, pickupPointId, isCopied) {
        const current = new Set(copiedStatuses[driverId] || []);
        if (isCopied) {
            current.add(pickupPointId);
        } else {
            current.delete(pickupPointId);
        }
        copiedStatuses = { ...copiedStatuses, [driverId]: Array.from(current) };
        renderContent();
    }

    async function updateCopiedStatus(driverId, pickupPointId, isCopied) {
        if (!db) {
            updateLocalCopiedStatus(driverId, pickupPointId, isCopied);
            return;
        }
        const todayDate = getTodayDateString();
        const docRef = doc(db, `/artifacts/${appId}/public/data/copiedStatuses/${todayDate}/drivers/${driverId}`);
        try {
            const currentDoc = await getDoc(docRef);
            const currentPoints = currentDoc.exists() ? currentDoc.data().copiedPoints : [];
            let updatedPoints;
            if (isCopied) {
                updatedPoints = [...new Set([...currentPoints, pickupPointId])];
            } else {
                updatedPoints = currentPoints.filter((pointId) => pointId !== pickupPointId);
            }
            await setDoc(docRef, { copiedPoints: updatedPoints });
        } catch (error) {
            console.error("Error updating Firestore:", error);
            showToast("❌ บันทึกสถานะล้มเหลว", "error");
            renderContent();
        }
    }

    async function resetDriverStatus(driverId) {
        if (!db) {
            copiedStatuses = { ...copiedStatuses, [driverId]: [] };
            renderContent();
            showToast(`✅ รีเซ็ตสถานะของ ${driverId} แล้ว`, "success");
            return;
        }
        const todayDate = getTodayDateString();
        const docRef = doc(db, `/artifacts/${appId}/public/data/copiedStatuses/${todayDate}/drivers/${driverId}`);
        try {
            await setDoc(docRef, { copiedPoints: [] });
            showToast(`✅ รีเซ็ตสถานะของ ${driverId} แล้ว`, "success");
        } catch (error) {
            console.error("Error resetting driver status:", error);
            showToast("❌ รีเซ็ตสถานะล้มเหลว", "error");
        }
    }

    async function resetAllStatuses() {
        if (!db) {
            copiedStatuses = {};
            renderContent();
            showToast("✅ รีเซ็ตสถานะทั้งหมดของวันนี้แล้ว", "success");
            return;
        }
        const todayDate = getTodayDateString();
        const collectionPath = `/artifacts/${appId}/public/data/copiedStatuses/${todayDate}/drivers`;
        try {
            const snapshot = await getDocs(query(collection(db, collectionPath)));
            const batch = writeBatch(db);
            snapshot.forEach((docSnap) => {
                batch.set(docSnap.ref, { copiedPoints: [] }, { merge: true });
            });
            await batch.commit();
            showToast("✅ รีเซ็ตสถานะทั้งหมดของวันนี้แล้ว", "success");
        } catch (error) {
            console.error("Error resetting all statuses:", error);
            showToast("❌ รีเซ็ตสถานะทั้งหมดล้มเหลว", "error");
        }
    }

    async function fetchAppsScriptData() {
        const response = await robustFetch(APPS_SCRIPT_URL, { redirect: "follow" }, { timeoutMs: 45000, retries: 2, backoffMs: 1000 });
        const contentType = response.headers.get("content-type") || "";
        const raw = await response.text();
        let parsed;
        try {
            parsed = contentType.includes("application/json") ? JSON.parse(raw) : JSON.parse(raw);
        } catch (error) {
            throw new Error(`รูปแบบข้อมูลไม่ใช่ JSON หรือ JSON ไม่สมบูรณ์: ${raw.slice(0, 200)}`);
        }
        if (parsed.status !== "success") {
            throw new Error(parsed.message || "Apps Script ตอบกลับผิดพลาด");
        }
        const { driverData: driverAssignments, locationData } = parsed.data || {};
        if (!Array.isArray(driverAssignments) || !Array.isArray(locationData)) {
            throw new Error("โครงสร้างข้อมูลไม่ครบ (driverData/locationData)");
        }
        return { driverAssignments, locationData, employeeMeta: [] };
    }

    async function fetchLocalFallbackData() {
        try {
            const [employeesResponse, pickupPointsResponse, assignmentsResponse] = await Promise.all([
                fetch("employees.json", { cache: "no-cache" }),
                fetch("pickup_points.json", { cache: "no-cache" }),
                fetch("employee_assignments.json", { cache: "no-cache" }),
            ]);
            if (!employeesResponse.ok || !pickupPointsResponse.ok || !assignmentsResponse.ok) {
                throw new Error("ไม่สามารถโหลดไฟล์ JSON ภายในได้ครบถ้วน");
            }
            const [employees, pickupPoints, assignments] = await Promise.all([
                employeesResponse.json(),
                pickupPointsResponse.json(),
                assignmentsResponse.json(),
            ]);
            return {
                driverAssignments: Array.isArray(assignments) ? assignments : [],
                locationData: Array.isArray(pickupPoints) ? pickupPoints : [],
                employeeMeta: Array.isArray(employees) ? employees : [],
            };
        } catch (error) {
            console.error("โหลดข้อมูลสำรองภายในล้มเหลว", error);
            return null;
        }
    }

    function ingestData({ driverAssignments = [], locationData = [], employeeMeta = [] }) {
        const metaMap = new Map();
        employeeMeta.forEach((row) => {
            const id = String(row?.["Driver ID"] ?? row?.driverId ?? "").trim();
            if (!id) {
                return;
            }
            metaMap.set(id, row);
        });

        allPickupPoints = (Array.isArray(locationData) ? locationData : []).map((point) => {
            const id = String(point?.["Pickup Point ID"] ?? point?.pickupPointId ?? point?.id ?? "").trim();
            const name = String(point?.["Pickup Point Name"] ?? point?.pickupPointName ?? point?.store ?? point?.["Store Name"] ?? "").trim();
            const address = String(point?.["Text Address"] ?? point?.address ?? point?.["StoreAddress"] ?? point?.location ?? "").trim();
            return {
                ...point,
                "Pickup Point ID": id,
                "Pickup Point Name": name,
                "Text Address": address,
            };
        });

        const driverDataMap = new Map();

        driverAssignments.forEach((row) => {
            const driverId = String(row?.["Driver ID"] ?? row?.driverId ?? "").trim();
            if (!driverId) {
                return;
            }
            if (!driverDataMap.has(driverId)) {
                const meta = metaMap.get(driverId);
                driverDataMap.set(driverId, {
                    driverId,
                    driverName: String(row?.["Driver Name"] ?? meta?.["Driver Name"] ?? meta?.driverName ?? "").trim(),
                    shiftTime: String(row?.["Shift Time"] ?? meta?.["Shift Time"] ?? meta?.shiftTime ?? "").trim(),
                    pickupPoints: [],
                    holidays: [],
                    pointCounts: {},
                });
            }
            const driver = driverDataMap.get(driverId);
            if (driver) {
                if (!driver.driverName) {
                    const meta = metaMap.get(driverId);
                    if (meta) {
                        driver.driverName = String(meta?.["Driver Name"] ?? meta?.driverName ?? "").trim();
                    }
                }
                if (!driver.shiftTime) {
                    const meta = metaMap.get(driverId);
                    if (meta) {
                        driver.shiftTime = String(meta?.["Shift Time"] ?? meta?.shiftTime ?? "").trim();
                    }
                }
                const pickupPointId = String(row?.["Pickup Point ID"] ?? row?.pickupPointId ?? "").trim();
                if (pickupPointId) {
                    const store = String(row?.["Store Name"] ?? row?.["Pickup Point Name"] ?? row?.store ?? row?.locationName ?? "N/A").trim();
                    const address = String(row?.["StoreAddress"] ?? row?.["Text Address"] ?? row?.address ?? row?.location ?? "N/A").trim();
                    driver.pickupPoints.push({ id: pickupPointId, store, address });
                }
                const holidayDay = normaliseDayLabel(row?.HolidayDate ?? row?.holiday ?? row?.Holiday);
                if (holidayDay && !driver.holidays.includes(holidayDay)) {
                    driver.holidays.push(holidayDay);
                }
            }
        });

        metaMap.forEach((meta, driverId) => {
            if (!driverDataMap.has(driverId)) {
                driverDataMap.set(driverId, {
                    driverId,
                    driverName: String(meta?.["Driver Name"] ?? meta?.driverName ?? "").trim(),
                    shiftTime: String(meta?.["Shift Time"] ?? meta?.shiftTime ?? "").trim(),
                    pickupPoints: [],
                    holidays: [],
                    pointCounts: {},
                });
            }
            const driver = driverDataMap.get(driverId);
            if (!driver) {
                return;
            }
            if (!driver.driverName) {
                driver.driverName = String(meta?.["Driver Name"] ?? meta?.driverName ?? "").trim();
            }
            if (!driver.shiftTime) {
                driver.shiftTime = String(meta?.["Shift Time"] ?? meta?.shiftTime ?? "").trim();
            }
            const metaHolidays = meta?.holidays ?? meta?.Holiday ?? meta?.Holidays ?? meta?.["Holiday"] ?? [];
            const arr = Array.isArray(metaHolidays) ? metaHolidays : [metaHolidays];
            arr.map(normaliseDayLabel).filter(Boolean).forEach((day) => {
                if (!driver.holidays.includes(day)) {
                    driver.holidays.push(day);
                }
            });
        });

        allDrivers = Array.from(driverDataMap.values());

        allDrivers.forEach((driver) => {
            const counts = {};
            driver.pickupPoints.forEach((point) => {
                counts[point.id] = (counts[point.id] || 0) + 1;
            });
            const uniquePoints = new Map();
            driver.pickupPoints.forEach((point) => {
                if (!uniquePoints.has(point.id)) {
                    uniquePoints.set(point.id, { store: point.store, address: point.address });
                }
            });
            const sortedIds = Array.from(uniquePoints.keys()).sort((a, b) => {
                const diff = (counts[b] || 0) - (counts[a] || 0);
                if (diff !== 0) {
                    return diff;
                }
                return a.localeCompare(b, undefined, { numeric: true });
            });
            driver.pickupPoints = sortedIds.map((id) => ({ id, ...uniquePoints.get(id) }));
            driver.pointCounts = counts;
            driver.holidays.sort((a, b) => DAY_ABBREVIATIONS.indexOf(a) - DAY_ABBREVIATIONS.indexOf(b));
        });

        allDrivers.sort((a, b) => a.driverId.localeCompare(b.driverId, undefined, { numeric: true }));
    }
    async function fetchData() {
        const unlock = lock(elements.refreshBtn);
        mergedDriver = null;
        elements.loadingDashboard.classList.remove("hidden");
        elements.container.innerHTML = "";
        elements.employeeTableBody.innerHTML = "";
        elements.pickupPointsTableBody.innerHTML = "";

        let dataLoaded = false;
        try {
            const remoteData = await fetchAppsScriptData();
            ingestData(remoteData);
            dataLoaded = true;
        } catch (error) {
            console.error("[fetchData remote failed]", error);
            const fallback = await fetchLocalFallbackData();
            if (fallback) {
                ingestData(fallback);
                showToast("⚠️ ใช้ข้อมูลสำรองจากไฟล์ภายใน", "info");
                dataLoaded = true;
            } else {
                const message = error?.isAbort ? "⏳ การเชื่อมต่อนานเกินกำหนด (Timeout)" : error?.message || "ไม่ทราบสาเหตุ";
                const errorHTML = `<div class="col-span-full text-center bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg" role="alert"><strong class="font-bold">เกิดข้อผิดพลาด!</strong> <span class="block sm:inline">${message}</span></div>`;
                elements.container.innerHTML = errorHTML;
                elements.employeeTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500">${message}</td></tr>`;
                elements.pickupPointsTableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">${message}</td></tr>`;
                showToast(`❌ โหลดข้อมูลล้มเหลว: ${message}`, error?.isAbort ? "info" : "error");
            }
        } finally {
            elements.loadingDashboard.classList.add("hidden");
            unlock();
        }

        if (dataLoaded) {
            renderContent();
        }
    }

    function renderContent() {
        renderCards();
        renderEmployeeTable();
        renderPickupPointsTable();
        updateOverallProgress();
    }

    function renderPickupPointsTable() {
        const query = elements.searchInput.value.toLowerCase().trim();
        elements.pickupPointsTableBody.innerHTML = "";
        const filtered = allPickupPoints.filter((point) => {
            if (!query) {
                return true;
            }
            return (
                (point["Pickup Point ID"] && String(point["Pickup Point ID"]).toLowerCase().includes(query))
                || (point["Pickup Point Name"] && String(point["Pickup Point Name"]).toLowerCase().includes(query))
                || (point["Text Address"] && String(point["Text Address"]).toLowerCase().includes(query))
            );
        });
        if (filtered.length === 0 && allPickupPoints.length > 0) {
            elements.noResultsPoints.classList.remove("hidden");
        } else {
            elements.noResultsPoints.classList.add("hidden");
        }
        filtered.forEach((point) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-50";
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${highlightText(String(point["Pickup Point ID"] || ""), query)}</td>
                <td class="px-6 py-4 whitespace-normal text-sm text-gray-500">${highlightText(String(point["Pickup Point Name"] || ""), query)}</td>
                <td class="px-6 py-4 whitespace-normal text-sm text-gray-500">${highlightText(String(point["Text Address"] || ""), query)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm">
                    <button class="copy-point-btn text-gray-400 hover:text-blue-500" data-pid="${String(point["Pickup Point ID"] || "")}">
                        <i class="far fa-copy"></i>
                    </button>
                </td>
            `;
            elements.pickupPointsTableBody.appendChild(tr);
        });
    }

    function renderEmployeeTable() {
        const query = elements.searchInput.value.toLowerCase().trim();
        elements.employeeTableBody.innerHTML = "";
        const filteredDrivers = allDrivers.filter((driver) => {
            if (!query) {
                return true;
            }
            return (
                (driver.driverName && driver.driverName.toLowerCase().includes(query))
                || (driver.driverId && driver.driverId.toLowerCase().includes(query))
                || (driver.shiftTime && driver.shiftTime.toLowerCase().includes(query))
                || (driver.holidays && driver.holidays.join(", ").toLowerCase().includes(query))
            );
        });
        if (filteredDrivers.length === 0 && allDrivers.length > 0) {
            elements.noResultsList.classList.remove("hidden");
        } else {
            elements.noResultsList.classList.add("hidden");
        }
        filteredDrivers.forEach((driver) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-50";
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${highlightText(driver.driverId, query)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${highlightText(driver.driverName, query)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${highlightText(driver.shiftTime, query)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${highlightText(driver.holidays.join(', '), query)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${driver.pickupPoints.length}</td>
            `;
            elements.employeeTableBody.appendChild(tr);
        });
    }

    function renderCards() {
        const query = elements.searchInput.value.toLowerCase().trim();
        elements.container.innerHTML = "";
        let driversToRender = allDrivers;
        if (mergedDriver) {
            driversToRender = [mergedDriver];
        }
        const filteredDrivers = driversToRender.filter((driver) => {
            if (!query) {
                return true;
            }
            if (driver.isMerged) {
                return true;
            }
            return (
                (driver.driverName && driver.driverName.toLowerCase().includes(query))
                || (driver.driverId && driver.driverId.toLowerCase().includes(query))
                || (driver.shiftTime && driver.shiftTime.toLowerCase().includes(query))
                || (driver.pickupPoints && driver.pickupPoints.some((point) => point.id.toLowerCase().includes(query)
                    || (point.store && point.store.toLowerCase().includes(query))))
            );
        });

        const todayDay = getTodayDayAbbreviation();
        if (filteredDrivers.length === 0 && allDrivers.length > 0) {
            elements.noResultsDashboard.textContent = "ไม่พบข้อมูลที่ตรงกับผลการค้นหา";
            elements.noResultsDashboard.classList.remove("hidden");
        } else {
            elements.noResultsDashboard.classList.add("hidden");
        }

        filteredDrivers.forEach((driver) => {
            if (driver.isMerged) {
                const card = createDriverCard(driver, query, false);
                elements.container.appendChild(card);
                return;
            }
            const isOnHoliday = driver.holidays.includes(todayDay);
            const card = createDriverCard(driver, query, isOnHoliday);
            elements.container.appendChild(card);
        });
    }

    function createDriverCard(driver, query, isOnHoliday) {
        const card = document.createElement("div");
        const isMerged = driver.isMerged;

        const gradientClass = isOnHoliday
            ? "card-gradient-holiday"
            : isMerged
                ? "card-gradient-merged"
                : driver.shiftTime === "11:00"
                    ? "card-gradient-red"
                    : driver.shiftTime === "14:00"
                        ? "card-gradient-green"
                        : "card-gradient-gray";
        const borderColor = isOnHoliday
            ? "border-gray-400"
            : isMerged
                ? "border-indigo-300"
                : driver.shiftTime === "11:00"
                    ? "border-red-200"
                    : driver.shiftTime === "14:00"
                        ? "border-green-200"
                        : "border-gray-200";

        card.className = `card-item relative ${gradientClass} border ${borderColor} rounded-2xl shadow-lg p-5 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1`;

        let counterHTML = "";
        let progressBarHTML = "";

        if (isMerged) {
            const totalCommonPoints = driver.commonPoints.length;
            const allCopiedInGroup = [...new Set(driver.originalDriverIds.flatMap((id) => copiedStatuses[id] || []))];
            const copiedCommonPointsCount = driver.commonPoints.filter((point) => allCopiedInGroup.includes(point.id)).length;
            counterHTML = `<div class="mt-2"><span class="inline-block bg-indigo-200 rounded-full px-3 py-1 text-sm font-semibold text-indigo-800">คัดลอกแล้ว (ส่วนกลาง): ${copiedCommonPointsCount} / ${totalCommonPoints}</span></div>`;

            const percentage = totalCommonPoints > 0 ? (copiedCommonPointsCount / totalCommonPoints) * 100 : 0;
            progressBarHTML = `
                <div class="w-full bg-slate-200/70 rounded-full h-5 mt-3 shadow-inner">
                    <div class="bg-gradient-to-r from-teal-400 to-emerald-500 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center" style="width: ${percentage}%">
                        ${Math.round(percentage)}%
                    </div>
                </div>`;
        } else {
            const totalPoints = driver.pickupPoints.length;
            const copiedCount = (copiedStatuses[driver.driverId] || []).length;
            counterHTML = `<div class="mt-2"><span class="inline-block bg-white/70 rounded-full px-3 py-1 text-sm font-semibold text-gray-700">คัดลอกแล้ว: ${copiedCount} / ${totalPoints}</span></div>`;

            const percentage = totalPoints > 0 ? (copiedCount / totalPoints) * 100 : 0;
            progressBarHTML = `
                <div class="w-full bg-slate-200/70 rounded-full h-5 mt-3 shadow-inner">
                    <div class="bg-gradient-to-r from-teal-400 to-emerald-500 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center" style="width: ${percentage}%">
                         ${Math.round(percentage)}%
                    </div>
                </div>`;
        }

        let holidayHTML = "";
        if (!isMerged && driver.holidays && driver.holidays.length > 0) {
            holidayHTML = `<p class="text-sm text-blue-600 font-semibold mt-1"><i class="fas fa-calendar-day mr-2"></i>วันหยุด: ${driver.holidays.join(', ')}</p>`;
        }

        const holidayOverlayHTML = isOnHoliday ? `
            <div class="absolute inset-0 bg-gray-700 bg-opacity-60 rounded-2xl flex flex-col items-center justify-center text-white p-4 z-10 text-center">
                <i class="fas fa-umbrella-beach text-4xl mb-2"></i>
                <p class="font-bold text-lg">วันนี้เป็นวันหยุด</p>
            </div>
        ` : "";

        const headerHTML = isMerged ? `
            <div>
                <h3 class="font-bold text-lg text-indigo-800">${highlightText(driver.driverName, query)}</h3>
                <p class="text-sm text-gray-500">รวม ID: ${driver.originalDriverIds.join(', ')}</p>
                ${counterHTML}
                ${progressBarHTML}
            </div>
            <button id="clearGroupBtn" class="text-gray-400 hover:text-red-500 transition-colors" title="ยกเลิกการรวมกลุ่ม"><i class="fas fa-times-circle fa-lg"></i></button>
        ` : `
            <div>
                <h3 class="font-bold text-lg text-gray-800">${highlightText(driver.driverName, query)}</h3>
                ${holidayHTML}
                <p class="text-sm text-gray-500 mt-1">ID: ${highlightText(driver.driverId, query)}</p>
                <p class="text-sm text-gray-500">เวลา: <span class="font-semibold text-gray-700">${highlightText(driver.shiftTime, query)}</span></p>
                ${counterHTML}
                ${progressBarHTML}
            </div>
            <button class="reset-driver-btn text-gray-400 hover:text-red-500 transition-colors" title="รีเซ็ตสถานะของคนนี้" data-driver-id="${driver.driverId}"><i class="fas fa-undo-alt"></i></button>
        `;

        const driverCopiedPoints = isMerged
            ? [...new Set(driver.originalDriverIds.flatMap((id) => copiedStatuses[id] || []))]
            : copiedStatuses[driver.driverId] || [];

        const commonPointsHTML = (driver.commonPoints || driver.pickupPoints).map((point) => {
            const isCopied = driverCopiedPoints.includes(point.id);
            const count = driver.pointCounts[point.id];
            const countDisplay = `<span class="inline-block text-center w-10 font-semibold text-sm ${count > 1 ? 'text-rose-500' : 'text-gray-400'}">(${count}x)</span>`;

            return `
                <li class="flex justify-between items-center py-2.5 border-b border-black/5 last:border-b-0">
                    <div class="flex items-center flex-1 min-w-0">
                        ${countDisplay}
                        <div class="flex-1 min-w-0">
                            <span class="font-mono text-gray-700 font-medium block truncate">${highlightText(point.id, query)}</span>
                            <span class="text-xs text-gray-500 block truncate">${highlightText(point.store, query)}</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 pl-2">
                        <button class="copy-btn ${isCopied ? 'hidden' : ''}" data-driver-id="${driver.driverId}" data-pid="${point.id}" title="คัดลอก"><i class="far fa-copy text-gray-400 hover:text-blue-500 transition-colors"></i></button>
                        <div class="copied-feedback ${!isCopied ? 'hidden' : ''} flex items-center space-x-3">
                            <span class="text-green-500 font-semibold text-lg" title="คัดลอกแล้ว">✅</span>
                            <button class="undo-btn text-gray-400 hover:text-red-500 transition-colors" data-driver-id="${driver.driverId}" data-pid="${point.id}" title="ยกเลิก"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                </li>
            `;
        }).join("");

        const specificPointsHTML = isMerged ? driver.driverSpecificPoints.map((specificDriver) => {
            if (specificDriver.points.length === 0) {
                return "";
            }
            const pointsList = specificDriver.points.map((point) => {
                const originalDriver = allDrivers.find((d) => d.driverId === specificDriver.driverId);
                const count = originalDriver ? originalDriver.pointCounts[point.id] : 0;
                const countDisplay = `<span class="inline-block text-center w-10 font-semibold text-sm text-gray-400">(${count}x)</span>`;
                const isCopied = (copiedStatuses[specificDriver.driverId] || []).includes(point.id);

                return `
                 <li class="flex justify-between items-center py-1.5 border-b border-indigo-200/50 last:border-b-0">
                     <div class="flex items-center flex-1 min-w-0">
                         ${countDisplay}
                         <div class="flex-1 min-w-0">
                             <span class="font-mono text-xs text-gray-600 block truncate">${point.id}</span>
                             <span class="text-xs text-gray-500 block truncate">${point.store}</span>
                         </div>
                     </div>
                      <div class="flex items-center space-x-2 pl-2">
                         <button class="copy-btn ${isCopied ? 'hidden' : ''}" data-driver-id="${specificDriver.driverId}" data-pid="${point.id}" title="คัดลอก"><i class="far fa-copy text-gray-400 hover:text-blue-500 transition-colors"></i></button>
                         <div class="copied-feedback ${!isCopied ? 'hidden' : ''} flex items-center space-x-3">
                             <span class="text-green-500 font-semibold text-lg" title="คัดลอกแล้ว">✅</span>
                             <button class="undo-btn text-gray-400 hover:text-red-500 transition-colors" data-driver-id="${specificDriver.driverId}" data-pid="${point.id}" title="ยกเลิก"><i class="fas fa-times"></i></button>
                         </div>
                     </div>
                 </li>`;

            }).join("");
            return `<div class="mt-3 pt-3 border-t border-indigo-200/50"><h4 class="font-semibold text-sm text-indigo-700">${specificDriver.driverName}</h4><ul class="mt-1">${pointsList}</ul></div>`;
        }).join("") : "";

        card.innerHTML = `
            ${holidayOverlayHTML}
            <div class="flex justify-between items-start mb-4">${headerHTML}</div>
            <div class="mt-auto pt-4 border-t border-black/5">
                 <button class="plan-route-btn w-full text-center px-3 py-2 bg-gradient-to-r from-cyan-500 to-sky-500 text-white rounded-lg shadow-md hover:shadow-lg hover:from-cyan-600 hover:to-sky-600 transition-all duration-300 transform hover:-translate-y-0.5 text-sm font-semibold" data-driver-id="${driver.driverId}">
                     ✨ วางแผนเส้นทาง
                 </button>
            </div>
            ${isMerged ? '<h4 class="font-bold text-base text-indigo-800 mb-2">ข้อมูลที่เหมือนกัน</h4>' : ''}
            <ul class="bg-white/60 rounded-lg p-2 flex-grow shadow-inner">${commonPointsHTML}</ul>
            ${isMerged && specificPointsHTML ? `<h4 class="font-bold text-base text-indigo-800 mt-4 mb-2">ข้อมูลที่ไม่เหมือนกัน</h4><div class="bg-white/60 rounded-lg p-2 shadow-inner">${specificPointsHTML}</div>` : ''}
        `;
        return card;
    }

    function updateOverallProgress() {
        const todayDay = getTodayDayAbbreviation();
        const workingDrivers = allDrivers.filter((driver) => !driver.holidays.includes(todayDay));

        let totalPoints = 0;
        let totalCopied = 0;

        workingDrivers.forEach((driver) => {
            totalPoints += driver.pickupPoints.length;
            totalCopied += (copiedStatuses[driver.driverId] || []).length;
        });

        const percentage = totalPoints > 0 ? (totalCopied / totalPoints) * 100 : 0;

        elements.overallProgressBar.style.width = `${percentage}%`;
        elements.overallProgressBar.textContent = `${Math.round(percentage)}%`;
        elements.overallProgressText.textContent = `(${totalCopied}/${totalPoints})`;
    }

    async function main() {
        try {
            const aiEnabled = !!G_GEMINI_KEY;
            elements.aiSuggestBtn.disabled = !aiEnabled;
            elements.aiSuggestBtn.classList.toggle("opacity-50", !aiEnabled);
            elements.aiSuggestBtn.title = aiEnabled ? "วิเคราะห์และแนะนำกลุ่มโดย AI" : "ต้องตั้งค่า Gemini API Key ก่อน";

            const firebaseReady = await initFirebase();
            if (firebaseReady) {
                listenForCopiedStatusChanges();
            }
            await fetchData();
        } catch (error) {
            console.error("Application failed to start:", error);
            elements.loadingDashboard.classList.add("hidden");
            const errorHTML = `<div class="col-span-full text-center bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg" role="alert"><strong class="font-bold">เกิดข้อผิดพลาดในการเริ่มต้น!</strong> <span class="block sm:inline">${error.message}</span></div>`;
            elements.container.innerHTML = errorHTML;
            elements.employeeTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500">แอปพลิเคชันไม่สามารถเริ่มต้นได้: ${error.message}</td></tr>`;
            elements.pickupPointsTableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">แอปพลิเคชันไม่สามารถเริ่มต้นได้: ${error.message}</td></tr>`;
        }
    }

    main();

    elements.searchInput.addEventListener("input", renderContent);
    elements.tabDashboard.addEventListener("click", () => switchTab("dashboard"));
    elements.tabEmployeeList.addEventListener("click", () => switchTab("employee-list"));
    elements.tabPickupPoints.addEventListener("click", () => switchTab("pickup-points"));
    elements.refreshBtn.addEventListener("click", () => {
        mergedDriver = null;
        fetchData();
    });
    elements.groupBtn.addEventListener("click", groupDrivers);
    elements.aiSuggestBtn.addEventListener("click", getAIGroupSuggestions);

    elements.resetAllBtn.addEventListener("click", () => {
        openModal(elements.confirmationModal, elements.confirmationModalBox);
    });
    elements.confirmResetBtn.addEventListener("click", async () => {
        await resetAllStatuses();
        closeModal(elements.confirmationModal, elements.confirmationModalBox);
    });
    elements.cancelResetBtn.addEventListener("click", () => {
        closeModal(elements.confirmationModal, elements.confirmationModalBox);
    });

    elements.container.addEventListener("click", (event) => {
        const copyBtn = event.target.closest(".copy-btn");
        const undoBtn = event.target.closest(".undo-btn");
        const resetDriverBtn = event.target.closest(".reset-driver-btn");
        const clearGroupBtn = event.target.closest("#clearGroupBtn");
        const planRouteBtn = event.target.closest(".plan-route-btn");

        if (copyBtn) {
            const { pid, driverId } = copyBtn.dataset;
            copyToClipboard(pid).then((ok) => {
                if (ok) {
                    showToast("✅ คัดลอกสำเร็จ!", "success");
                    const driverIdsToUpdate = driverId.startsWith("merged-") ? mergedDriver.originalDriverIds : [driverId];
                    driverIdsToUpdate.forEach((id) => updateCopiedStatus(id, pid, true));
                } else {
                    showToast("❌ คัดลอกไม่สำเร็จ", "error");
                }
            });
        }
        if (undoBtn) {
            const { pid, driverId } = undoBtn.dataset;
            const driverIdsToUpdate = driverId.startsWith("merged-") ? mergedDriver.originalDriverIds : [driverId];
            driverIdsToUpdate.forEach((id) => updateCopiedStatus(id, pid, false));
        }
        if (resetDriverBtn) {
            resetDriverStatus(resetDriverBtn.dataset.driverId);
        }
        if (clearGroupBtn) {
            mergedDriver = null;
            elements.groupIdsInput.value = "";
            renderCards();
        }
        if (planRouteBtn) {
            const driverId = planRouteBtn.dataset.driverId;
            const driver = driverId.startsWith("merged-") ? mergedDriver : allDrivers.find((d) => d.driverId === driverId);
            if (driver) {
                getRoutePlan(driver);
            }
        }
    });
    elements.pickupPointsTableBody.addEventListener("click", (event) => {
        const copyBtn = event.target.closest(".copy-point-btn");
        if (copyBtn) {
            const pid = copyBtn.dataset.pid;
            copyToClipboard(pid).then((ok) => {
                if (ok) {
                    showToast(`✅ คัดลอก ${pid} แล้ว!`, "success");
                } else {
                    showToast("❌ คัดลอกไม่สำเร็จ", "error");
                }
            });
        }
    });
    elements.aiSuggestionContent.addEventListener("click", (event) => {
        const useGroupBtn = event.target.closest(".use-ai-group-btn");
        if (useGroupBtn) {
            const ids = useGroupBtn.dataset.ids;
            elements.groupIdsInput.value = ids;
            groupDrivers();
            closeModal(elements.aiSuggestionModal, elements.aiSuggestionModalBox);
        }
    });
    elements.closeAiSuggestionModalBtn.addEventListener("click", () => closeModal(elements.aiSuggestionModal, elements.aiSuggestionModalBox));
    elements.closeRoutePlanModalBtn.addEventListener("click", () => closeModal(elements.routePlanModal, elements.routePlanModalBox));

    window.addEventListener("error", (event) => {
        console.error("[GLOBAL ERROR]", event.message, event.filename, `${event.lineno}:${event.colno}`);
    });
    window.addEventListener("unhandledrejection", (event) => {
        console.error("[UNHANDLED REJECTION]", event.reason);
    });
})();
