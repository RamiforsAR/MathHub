"use strict";

/**
 * Elements
 */
const form = document.getElementById("sj-form");
/**
 * @type {HTMLInputElement}
 */
const address = document.getElementById("sj-address");
/**
 * @type {HTMLInputElement}
 */
const searchEngine = document.getElementById("sj-search-engine");
/**
 * @type {HTMLParagraphElement}
 */
const error = document.getElementById("sj-error");
/**
 * @type {HTMLPreElement}
 */
const errorCode = document.getElementById("sj-error-code");

const tabsBar = document.getElementById("tabs-bar");
const newTabBtn = document.getElementById("new-tab-btn");
const framesContainer = document.getElementById("frames-container");

/**
 * Scramjet + BareMux
 */
const { ScramjetController } = $scramjetLoadController();

const scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});

scramjet.init();

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

/**
 * Tab state
 * @typedef {{ id: string, title: string, frame: any, url: string }} Tab
 */
let tabs = [];
let activeTabId = null;

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Create a new tab and Scramjet frame
 */
async function createTab(initialUrl) {
  // Ensure SW + transport
  await ensureProxyReady();

  const id = genId();

  const frameObj = scramjet.createFrame();
  const frameEl = frameObj.frame;
  frameEl.classList.add("sj-frame");
  frameEl.dataset.tabId = id;
  framesContainer.appendChild(frameEl);

  const tab = {
    id,
    title: "New Tab",
    frame: frameObj,
    url: initialUrl || "",
  };
  tabs.push(tab);

  renderTabs();
  setActiveTab(id);

  if (initialUrl) {
    navigateTab(tab, initialUrl);
  }

  return tab;
}

/**
 * Remove a tab
 */
function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;

  const [tab] = tabs.splice(idx, 1);

  // Remove frame element
  if (tab.frame && tab.frame.frame && tab.frame.frame.parentNode) {
    tab.frame.frame.parentNode.removeChild(tab.frame.frame);
  }

  // If closing active tab, switch to neighbor
  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || null;
    activeTabId = next ? next.id : null;
  }

  renderTabs();
  renderFrames();
}

/**
 * Set active tab
 */
function setActiveTab(id) {
  activeTabId = id;
  const tab = tabs.find((t) => t.id === id);
  if (tab) {
    address.value = tab.url || "";
  }
  renderTabs();
  renderFrames();
}

/**
 * Navigate a tab to a URL via proxy
 */
function navigateTab(tab, input) {
  const url = search(input, searchEngine.value);
  tab.url = input;
  tab.title = prettifyTitleFromUrl(input);

  // Update tab UI
  renderTabs();

  // Navigate Scramjet frame
  tab.frame.go(url);
}

/**
 * Simple title from URL/search
 */
function prettifyTitleFromUrl(input) {
  try {
    const u = new URL(input.includes("://") ? input : "http://" + input);
    return u.hostname.replace(/^www\./, "");
  } catch {
    if (!input) return "New Tab";
    if (input.length > 24) return input.slice(0, 21) + "...";
    return input;
  }
}

/**
 * Ensure SW + BareMux transport
 */
async function ensureProxyReady() {
  try {
    await registerSW();
  } catch (err) {
    error.textContent = "Failed to register service worker.";
    errorCode.textContent = err.toString();
    throw err;
  }

  const wispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";

  if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
    await connection.setTransport("/libcurl/index.mjs", [
      { websocket: wispUrl },
    ]);
  }
}

/**
 * Render tabs bar
 */
function renderTabs() {
  // Remove all tab buttons except the new-tab button
  [...tabsBar.querySelectorAll(".tab-instance")].forEach((el) => el.remove());

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "tab tab-instance";
    if (tab.id === activeTabId) btn.classList.add("active");
    btn.dataset.tabId = tab.id;

    const titleSpan = document.createElement("span");
    titleSpan.className = "tab-title";
    titleSpan.textContent = tab.title || "New Tab";

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    btn.appendChild(titleSpan);
    btn.appendChild(closeBtn);

    btn.addEventListener("click", () => setActiveTab(tab.id));

    tabsBar.insertBefore(btn, newTabBtn);
  });
}

/**
 * Render frames visibility
 */
function renderFrames() {
  const frameEls = framesContainer.querySelectorAll(".sj-frame");
  frameEls.forEach((el) => {
    if (el.dataset.tabId === activeTabId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

/**
 * Form submit = navigate active tab
 */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = address.value.trim();
  if (!input) return;

  if (!activeTabId) {
    const tab = await createTab(input);
    return;
  }

  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;

  try {
    await ensureProxyReady();
    navigateTab(tab, input);
  } catch (err) {
    console.error(err);
  }
});

/**
 * New tab button
 */
newTabBtn.addEventListener("click", () => {
  createTab("");
});

/**
 * Initial tab
 */
createTab("");
