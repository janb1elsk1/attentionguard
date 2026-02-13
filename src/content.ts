/**
 * Content script for Attention Guard extension
 * Injects the floating timer panel and manages user interactions
 */

// Prevent double execution
if ((window as any).__TIMER_PANIC_LOADED__) {
  // Script already loaded, just re-enable if needed
  if ((window as any).__TIMER_PANIC_REINIT__) {
    (window as any).__TIMER_PANIC_REINIT__();
  }
} else {
  (window as any).__TIMER_PANIC_LOADED__ = true;

// ============================================================================
// STORAGE LAYER (inline from storage.ts)
// ============================================================================

interface TimerState {
  isRunning: boolean;
  startTime: number | null;
  pausedAt: number | null;
  duration: number;
  sessionMinutes: number;
  isBreak: boolean;
  currentBlock: number;
  /** When resuming from Panic: progress bar start % (0-100) so bar continues from there instead of 0 */
  progressStartPercent?: number;
}

interface PanelPosition {
  x: number;
  y: number;
}

interface PanicContent {
  title: string;
  items: string[];
  imageDataUrl?: string;
  audioDataUrl?: string;
  imageMaxWidth?: number;
}

interface UserSettings {
  sessionMinutes: number;
  breakMinutes: number;
  pomodoroBlocks: number;
  currentBlock: number;
  panelPosition: PanelPosition;
  panelMinimized: boolean;
  panicContent: PanicContent;
  panelEnabled: boolean;
  blockedUrls: string[];
}

const CONTENT_DEFAULT_USER_SETTINGS: UserSettings = {
  sessionMinutes: 25,
  breakMinutes: 5,
  pomodoroBlocks: 4,
  currentBlock: 1,
  panelPosition: { x: 20, y: 20 },
  panelMinimized: false,
  panicContent: {
    title: "Stay focused on your task",
    items: [
      "What is the ONE most important step right now?",
      "Why did you start this session?",
      "You've got this. Break it into smaller pieces.",
      "Check your environment: no distractions?",
      "Just 5 more minutes. Then reassess."
    ]
  },
  panelEnabled: true,
  blockedUrls: []
};

const CONTENT_DEFAULT_TIMER_STATE: TimerState = {
  isRunning: false,
  startTime: null,
  pausedAt: null,
  duration: 0,
  sessionMinutes: 25,
  isBreak: false,
  currentBlock: 1
};

/** Return false after extension reload (context invalidated). Use in storage/API callbacks to avoid "Extension context invalidated" errors. */
function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

async function content_getTimerState(): Promise<TimerState> {
  return new Promise((resolve) => {
    if (!window.chrome?.storage?.local?.get) {
      resolve(CONTENT_DEFAULT_TIMER_STATE);
      return;
    }

    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(CONTENT_DEFAULT_TIMER_STATE);
      }
    }, 1500);

    try {
      window.chrome.storage.local.get("timerState", (result: any) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        
        try {
          resolve(result?.timerState || CONTENT_DEFAULT_TIMER_STATE);
        } catch (e) {
          resolve(CONTENT_DEFAULT_TIMER_STATE);
        }
      });
    } catch (e) {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve(CONTENT_DEFAULT_TIMER_STATE);
      }
    }
  });
}

async function content_setTimerState(state: TimerState): Promise<void> {
  return new Promise((resolve) => {
    if (!window.chrome?.storage?.local?.set) {
      resolve();
      return;
    }

    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve();
      }
    }, 300);

    try {
      window.chrome.storage.local.set({ timerState: state }, () => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          resolve();
        }
      });
    } catch (e) {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve();
      }
    }
  });
}

async function content_getUserSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    if (!window.chrome?.storage?.local?.get) {
      resolve(CONTENT_DEFAULT_USER_SETTINGS);
      return;
    }

    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(CONTENT_DEFAULT_USER_SETTINGS);
      }
    }, 300);

    try {
      window.chrome.storage.local.get("userSettings", (result: any) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        
        try {
          resolve(result?.userSettings || CONTENT_DEFAULT_USER_SETTINGS);
        } catch (e) {
          resolve(CONTENT_DEFAULT_USER_SETTINGS);
        }
      });
    } catch (e) {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve(CONTENT_DEFAULT_USER_SETTINGS);
      }
    }
  });
}

async function content_setUserSettings(settings: Partial<UserSettings>): Promise<void> {
  return new Promise((resolve) => {
    if (!window.chrome?.storage?.local?.get) {
      resolve();
      return;
    }

    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve();
      }
    }, 300);

    try {
      window.chrome.storage.local.get("userSettings", (result: any) => {
        if (completed) return;
        
        try {
          const currentSettings = result?.userSettings || CONTENT_DEFAULT_USER_SETTINGS;
          const updated = { ...currentSettings, ...settings };
          
          window.chrome.storage.local.set({ userSettings: updated }, () => {
            if (!completed) {
              completed = true;
              clearTimeout(timer);
              resolve();
            }
          });
        } catch (e) {
          if (!completed) {
            completed = true;
            clearTimeout(timer);
            resolve();
          }
        }
      });
    } catch (e) {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve();
      }
    }
  });
}

function content_onStorageChange(
  callback: (changes: { [key: string]: any }) => void
): void {
  try {
    if (!window.chrome || !window.chrome.storage || !window.chrome.storage.onChanged) {
      return;
    }

    window.chrome.storage.onChanged.addListener((changes: any, areaName: any) => {
      try {
        if (!isExtensionContextValid()) return;
        if (areaName === "local") {
          callback(changes);
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        if (msg.includes("invalidated")) return;
        throw e;
      }
    });
  } catch (e) {
    // Silently handle error
  }
}

// Aliases
const getTimerState = content_getTimerState;
const setTimerState = content_setTimerState;
const getUserSettings = content_getUserSettings;
const setUserSettings = content_setUserSettings;
const onStorageChange = content_onStorageChange;

// ============================================================================
// CONTENT SCRIPT LAYER
// ============================================================================

// Panic = pause time only. Derived from panicModalOpen + !isRunning + duration > 0 (no isPaused field).
function isTimeStoppedByPanic(timerState: any, panicOpen: boolean): boolean {
  return !!(panicOpen && !timerState?.isRunning && (timerState?.duration ?? 0) > 0);
}

// Timer state
let currentTimerState: any = {
  isRunning: false,
  remaining: 0,
  sessionMinutes: 25,
  isBreak: false,
  currentBlock: 1
};

let currentSettings: any = {
  sessionMinutes: 25,
  breakMinutes: 5,
  panelPosition: { x: 20, y: 20 },
  panelMinimized: false,
  panicContent: { title: "Stay focused", items: [] }
};

let currentPanicContent: any = { title: "", items: [] as string[] };

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let updateInterval: any = null;
let progressSmoothInterval: any = null;
/** Synced across tabs: when true, panic modal is shown on every tab and URLs stay blocked */
let currentPanicModalOpen = false;

/**
 * Update only the progress bar width (lightweight, no storage) for smooth animation
 */
function updateProgressBarSmooth(): void {
  if (!currentTimerState.isRunning || !currentTimerState.startTime || !currentTimerState.duration) {
    return;
  }
  const progressFill = document.getElementById("timer-progress-fill") as HTMLElement;
  if (!progressFill) return;
  const elapsed = Date.now() - currentTimerState.startTime;
  const segmentPercent = Math.min((elapsed / currentTimerState.duration) * 100, 100);
  const start = currentTimerState.progressStartPercent ?? 0;
  const range = 100 - start;
  const progress = Math.min(100, start + (segmentPercent / 100) * range);
  progressFill.style.width = `${progress}%`;
}

/**
 * Reinject floating panel if it was removed
 */
async function ensurePanelExists() {
  try {
    // Check if panel is still enabled
    const settings = await getUserSettings();
    if (!settings.panelEnabled) {
      // Panel was disabled, remove it if exists
      const panel = document.getElementById("timer-panic-panel");
      if (panel) {
        panel.remove();
      }
      return;
    }

    if (!document.getElementById("timer-panic-panel")) {
      injectFloatingPanel();
      setupEventListeners();
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Show quick activation notice
 */
function showActivationNotice() {
  try {
    // Only show if panel was just injected (within 500ms)
    const notice = document.createElement("div");
    notice.id = "timer-panic-notice";
    notice.textContent = "⏱ Attention Guard Activated";
    notice.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(102, 126, 234, 0.9);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      z-index: 999998;
      animation: slideInRight 0.3s ease;
      pointer-events: none;
    `;
    
    document.body.appendChild(notice);
    
    // Add animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(200px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(200px); opacity: 0; }
      }
      #timer-panic-notice {
        animation: slideInRight 0.3s ease, slideOutRight 0.3s ease 2.7s forwards;
      }
    `;
    document.head.appendChild(style);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notice.remove();
    }, 3000);
  } catch (e) {
    // Silently fail
  }
}

/**
 * Initialize the content script
 */
async function init() {
  try {
    // Delay initialization to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Load initial state and settings
    currentTimerState = await getTimerState();
    currentSettings = await getUserSettings();
    currentPanicContent = currentSettings.panicContent;

    onStorageChange((changes) => {
      if (changes.userSettings) {
        handleGlobalSettingsChange(changes);
      }
      handleStorageChange(changes);
    });

    // Only inject if panel is enabled (not disabled by user)
    if (!currentSettings.panelEnabled) {
      return; // Panel is disabled, don't auto-inject
    }

    // Inject the floating panel
    injectFloatingPanel();

    // Apply minimize state immediately
    if (currentSettings.panelMinimized) {
      const fullPanel = document.getElementById("timer-panic-full-panel") as HTMLElement;
      const miniBar = document.getElementById("mini-bar") as HTMLElement;
      if (fullPanel && miniBar) {
        fullPanel.style.display = "none";
        miniBar.style.display = "flex";
        updateMiniBarTheme();
      }
    }

    // Start update loop
    startUpdateLoop();

    // Check URL blocking on init
    checkAndApplyUrlBlocking();

    // If panic modal is open on another tab, show it here too
    if (window.chrome?.storage?.local) {
      try {
        window.chrome.storage.local.get("panicModalOpen")
          .then((result: any) => {
            try {
              if (!isExtensionContextValid()) return;
              if (result && result.panicModalOpen === true) {
                currentPanicModalOpen = true;
                showPanicModalOnly();
                checkAndApplyUrlBlocking();
              }
            } catch (e) {
              const msg = (e as Error)?.message ?? String(e);
              if (msg.includes("invalidated")) return;
              throw e;
            }
          })
          .catch(() => {});
      } catch (e) {
        if (String((e as Error)?.message ?? e).includes("invalidated")) return;
      }
    }

    // Re-inject panel every 2 seconds if it's missing (handles page changes, etc.)
    setInterval(ensurePanelExists, 2000);

    // Check URL blocking on navigation changes
    let lastUrl = window.location.href;
    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(checkAndApplyUrlBlocking, 100); // Small delay to let page settle
      }
    }, 1000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !window.chrome?.storage?.local) return;
      if (!isExtensionContextValid()) return;
      try {
        window.chrome.storage.local.get(["timerState", "panicModalOpen"])
          .then((result: any) => {
            try {
              if (!isExtensionContextValid()) return;
              if (result?.timerState) currentTimerState = result.timerState;
              if (result?.panicModalOpen === true) {
                currentPanicModalOpen = true;
                showPanicModalOnly();
              } else {
                currentPanicModalOpen = false;
              }
              checkAndApplyUrlBlocking();
            } catch (e) {
              const msg = (e as Error)?.message ?? String(e);
              if (msg.includes("invalidated")) return;
              throw e;
            }
          })
          .catch(() => {});
      } catch (e) {
        if (String((e as Error)?.message ?? e).includes("invalidated")) return;
      }
    });
  } catch (e) {
    // Silently handle error but try again after delay
    setTimeout(() => {
      try {
        init();
      } catch (e2) {
        // Give up after retry
      }
    }, 1000);
  }
}

/**
 * Inject the floating panel into the page
 */
/**
 * Detect if background is light or dark
 */
function isBackgroundLight(): boolean {
  try {
    const bgColor = window.getComputedStyle(document.body).backgroundColor;
    // Parse RGB values
    const rgbMatch = bgColor.match(/\d+/g);
    if (!rgbMatch || rgbMatch.length < 3) return false;
    
    const [r, g, b] = [parseInt(rgbMatch[0]), parseInt(rgbMatch[1]), parseInt(rgbMatch[2])];
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  } catch (e) {
    return false;
  }
}

/**
 * Update mini bar theme based on background
 */
function updateMiniBarTheme() {
  try {
    const miniBar = document.getElementById("mini-bar");
    const miniTime = document.getElementById("mini-time");
    if (!miniBar || !miniTime) return;
    
    const isLight = isBackgroundLight();
    if (isLight) {
      miniBar.classList.add("timer-panic-mini-bar-light");
      miniBar.classList.remove("timer-panic-mini-bar-dark");
      miniTime.classList.add("timer-panic-mini-time-light");
      miniTime.classList.remove("timer-panic-mini-time-dark");
    } else {
      miniBar.classList.add("timer-panic-mini-bar-dark");
      miniBar.classList.remove("timer-panic-mini-bar-light");
      miniTime.classList.add("timer-panic-mini-time-dark");
      miniTime.classList.remove("timer-panic-mini-time-light");
    }
  } catch (e) {
    // Silently fail
  }
}

function injectFloatingPanel() {
  // Avoid multiple injections
  if (document.getElementById("timer-panic-panel")) {
    return;
  }

  // Create container
  const container = document.createElement("div");
  container.id = "timer-panic-panel";
  container.className = "timer-panic-panel";
  container.style.left = `${currentSettings.panelPosition.x}px`;
  container.style.top = `${currentSettings.panelPosition.y}px`;
  container.style.display = "block";

  container.innerHTML = `
    <!-- Mini Bar (for minimized state) - Draggable -->
    <div class="timer-panic-mini-bar" id="mini-bar" style="display: none; cursor: grab;">
      <div class="timer-panic-mini-time" id="mini-time">25:00</div>
      <div style="width: 1px; height: 18px; background: rgba(255, 255, 255, 0.1);"></div>
      <div class="timer-panic-mini-controls">
        <button class="timer-panic-mini-btn timer-panic-mini-btn-start" id="btn-mini-start" title="Start">▶</button>
        <button class="timer-panic-mini-btn timer-panic-mini-btn-panic" id="btn-mini-panic" title="Panic">!</button>
        <button class="timer-panic-mini-btn timer-panic-mini-btn-expand" id="btn-mini-expand" title="Expand">→</button>
      </div>
    </div>

    <!-- Full Panel Wrapper -->
    <div id="timer-panic-full-panel" style="display: flex; flex-direction: column; width: 100%;">
      <!-- Modern Header with Status -->
      <div class="timer-panic-header-modern" id="timer-panic-header">
        <div class="timer-panic-header-left">
          <div class="timer-panic-time-small" id="timer-time-small">Attention Guard</div>
          <div class="timer-panic-status-badge" id="timer-status-badge">READY</div>
        </div>
        <div class="timer-panic-header-right">
          <button class="timer-panic-btn-minimize" id="timer-panic-btn-minimize" title="Minimize">_</button>
        </div>
      </div>

      <!-- Large Timer Display -->
      <div class="timer-panic-display-modern">
        <div class="timer-panic-time-large" id="timer-display">25:00</div>
        <div class="timer-panic-block-modern" id="timer-block">Block 1/4</div>
      </div>

      <!-- Status Bar -->
      <div class="timer-panic-status-bar">
        <div class="timer-panic-progress-fill" id="timer-progress-fill"></div>
        <div class="timer-panic-progress-dots"></div>
      </div>

      <!-- Bottom Controls -->
      <div class="timer-panic-controls-bottom">
        <button class="timer-panic-btn timer-panic-btn-start timer-panic-btn-main timer-panic-btn-large" id="btn-start-pause" title="Start">▶</button>
        <div class="timer-panic-btn-small-group">
          <button class="timer-panic-btn timer-panic-btn-reset timer-panic-btn-small" id="btn-reset" title="Reset">↻</button>
          <button class="timer-panic-btn timer-panic-btn-settings timer-panic-btn-small" id="btn-settings" title="Settings">⚙</button>
        </div>
        <button class="timer-panic-btn timer-panic-btn-panic timer-panic-btn-main timer-panic-btn-large" id="btn-panic" title="Panic">!</button>
      </div>
    </div>

    <!-- Settings Modal -->
    <div class="timer-panic-modal" id="settings-modal" style="display: none;">
      <div class="timer-panic-modal-content">
        <div class="timer-panic-modal-header">
          <h2>Settings</h2>
          <button class="timer-panic-modal-close" id="btn-close-settings">×</button>
        </div>

        <div class="timer-panic-modal-body">
          <div class="timer-panic-settings-grid">
            <div class="timer-panic-setting timer-panic-setting-compact">
              <label>Session (min)</label>
              <input type="number" id="input-session-minutes" min="1" max="99" step="1" value="${currentSettings.sessionMinutes}">
            </div>

            <div class="timer-panic-setting timer-panic-setting-compact">
              <label>Break (min)</label>
              <input type="number" id="input-break-minutes" min="1" max="99" step="1" value="${currentSettings.breakMinutes}">
            </div>

            <div class="timer-panic-setting timer-panic-setting-compact">
              <label>Blocks</label>
              <input type="number" id="input-pomodoro-blocks" min="1" max="99" step="1" value="${currentSettings.pomodoroBlocks}">
            </div>
          </div>

          <div class="timer-panic-divider"></div>

          <div class="timer-panic-setting">
            <label>Panic Button Title:</label>
            <input type="text" id="input-panic-title" value="${currentPanicContent.title}">
          </div>

          <div class="timer-panic-setting">
            <label>Motivational Reminders (one per line):</label>
            <textarea id="input-panic-items" rows="6">${currentPanicContent.items.join("\n")}</textarea>
          </div>

          <div class="timer-panic-divider"></div>

          <div class="timer-panic-setting">
            <label>Panic Image (optional):</label>
            <div class="timer-panic-file-input-group">
              <input type="file" id="input-panic-image" accept="image/*" style="display: none;">
              <button type="button" class="timer-panic-btn timer-panic-btn-upload" id="btn-upload-image">Choose Image</button>
              <span id="image-filename" class="timer-panic-filename">${currentPanicContent.imageDataUrl ? "✓ Image uploaded" : "No image"}</span>
              ${currentPanicContent.imageDataUrl ? '<button type="button" class="timer-panic-btn timer-panic-btn-danger" id="btn-clear-image">Clear</button>' : ""}
            </div>
            <small style="color: var(--text-secondary); margin-top: 4px; display: block;">Max size: 1MB, recommended: square images</small>
          </div>

          <div class="timer-panic-setting">
            <label>Image Max Width (pixels):</label>
            <input type="number" id="input-image-max-width" min="50" max="400" value="${currentPanicContent.imageMaxWidth || 200}">
          </div>

          <div class="timer-panic-setting">
            <label>Panic Audio (optional, MP3):</label>
            <div class="timer-panic-file-input-group">
              <input type="file" id="input-panic-audio" accept="audio/mpeg,.mp3" style="display: none;">
              <button type="button" class="timer-panic-btn timer-panic-btn-upload" id="btn-upload-audio">Choose Audio</button>
              <span id="audio-filename" class="timer-panic-filename">${currentPanicContent.audioDataUrl ? "✓ Audio uploaded" : "No audio"}</span>
              ${currentPanicContent.audioDataUrl ? '<button type="button" class="timer-panic-btn timer-panic-btn-danger" id="btn-clear-audio">Clear</button>' : ""}
            </div>
            <small style="color: var(--text-secondary); margin-top: 4px; display: block;">Max size: 5MB, MP3 format recommended</small>
          </div>

          <div class="timer-panic-divider"></div>

          <div class="timer-panic-setting">
            <label>Blocked URLs (during work sessions):</label>
            <textarea id="input-blocked-urls" rows="4" placeholder="One per line or comma-separated. Example:&#10;facebook.com, youtube.com, twitter.com&#10;or one URL per line">${currentSettings.blockedUrls.join("\n")}</textarea>
            <small style="color: var(--text-secondary); margin-top: 4px; display: block;">URLs will be blocked during work sessions, but accessible during breaks. You can enter URLs one per line or separated by commas.</small>
          </div>

          <div class="timer-panic-modal-footer">
            <button class="timer-panic-btn timer-panic-btn-save" id="btn-save-settings">Save Settings</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Panic Modal -->
    <div class="timer-panic-modal" id="panic-modal" style="display: none;">
      <div class="timer-panic-modal-content timer-panic-panic-modal">
        <div class="timer-panic-modal-header">
          <h2 id="panic-title">${currentPanicContent.title}</h2>
          <button class="timer-panic-modal-close" id="btn-close-panic">×</button>
        </div>

        <div class="timer-panic-modal-body">
          ${currentPanicContent.imageDataUrl ? `<div class="timer-panic-panic-image-container" style="margin-bottom: 16px;">
            <img src="${currentPanicContent.imageDataUrl}" alt="Panic motivation" class="timer-panic-panic-image" style="max-width: ${currentPanicContent.imageMaxWidth || 200}px; max-height: 300px; border-radius: 8px;">
          </div>` : ""}
          <div id="panic-items" class="timer-panic-panic-items">
            ${currentPanicContent.items.map((item) => `<div class="timer-panic-panic-item">• ${item}</div>`).join("")}
          </div>
          ${currentPanicContent.audioDataUrl ? `<div class="timer-panic-panic-audio-container" style="margin-top: 16px;">
            <audio controls style="width: 100%; border-radius: 8px;">
              <source src="${currentPanicContent.audioDataUrl}" type="audio/mpeg">
              Your browser does not support audio.
            </audio>
          </div>` : ""}
        </div>

        <div class="timer-panic-modal-footer">
          <button class="timer-panic-btn timer-panic-btn-focus" id="btn-back-to-focus">Back to Focus</button>
          <button class="timer-panic-btn timer-panic-btn-quit" id="btn-quit-panic">I Quit</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  setupEventListeners();

  // Initialize mini bar visibility (handled in init() function)

  // Update mini bar theme based on background
  updateMiniBarTheme();

  // Re-check theme periodically (every 5s to reduce CPU)
  setInterval(updateMiniBarTheme, 5000);
}

/**
 * Setup event listeners
 */
/**
 * Clear image from panic content
 */
function handleClearImage() {
  try {
    currentPanicContent.imageDataUrl = undefined;
    
    const filenameEl = document.getElementById("image-filename");
    if (filenameEl) {
      filenameEl.textContent = "No image";
    }

    const btnClear = document.getElementById("btn-clear-image");
    if (btnClear) {
      btnClear.remove();
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Clear audio from panic content
 */
function handleClearAudio() {
  try {
    currentPanicContent.audioDataUrl = undefined;
    
    const filenameEl = document.getElementById("audio-filename");
    if (filenameEl) {
      filenameEl.textContent = "No audio";
    }

    const btnClear = document.getElementById("btn-clear-audio");
    if (btnClear) {
      btnClear.remove();
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Handle image file upload
 */
function handleImageUpload(e: Event) {
  try {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      // Reset input if no file selected
      if (input) input.value = "";
      return;
    }

    // Check file size (max 1MB)
    const maxSize = 1 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Image too large! Maximum size is 1MB.");
      if (input) input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          if (input) input.value = "";
          return;
        }

        currentPanicContent.imageDataUrl = dataUrl;

        const filenameEl = document.getElementById("image-filename");
        if (filenameEl) {
          filenameEl.textContent = "✓ Image uploaded";
        }

        let btnClear = document.getElementById("btn-clear-image");
        if (!btnClear && filenameEl?.parentElement) {
          const clearBtn = document.createElement("button");
          clearBtn.type = "button";
          clearBtn.className = "timer-panic-btn timer-panic-btn-danger";
          clearBtn.id = "btn-clear-image";
          clearBtn.textContent = "Clear";
          clearBtn.addEventListener("click", handleClearImage);
          filenameEl.parentElement.appendChild(clearBtn);
        }

        // Clear input in next tick so a possible "change" event doesn't run in same stack and overwrite UI
        setTimeout(() => {
          if (input) input.value = "";
        }, 0);
      } catch (e) {
        setTimeout(() => { if (input) input.value = ""; }, 0);
      }
    };

    reader.onerror = () => {
      setTimeout(() => { if (input) input.value = ""; }, 0);
    };

    reader.readAsDataURL(file);
  } catch (e) {
    const input = e.target as HTMLInputElement;
    if (input) input.value = "";
  }
}

/**
 * Handle audio file upload
 */
function handleAudioUpload(e: Event) {
  try {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      // Reset input if no file selected
      if (input) input.value = "";
      return;
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Audio file too large! Maximum size is 5MB.");
      if (input) input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          if (input) input.value = "";
          return;
        }

        currentPanicContent.audioDataUrl = dataUrl;

        const filenameEl = document.getElementById("audio-filename");
        if (filenameEl) {
          filenameEl.textContent = "✓ Audio uploaded";
        }

        let btnClear = document.getElementById("btn-clear-audio");
        if (!btnClear && filenameEl?.parentElement) {
          const clearBtn = document.createElement("button");
          clearBtn.type = "button";
          clearBtn.className = "timer-panic-btn timer-panic-btn-danger";
          clearBtn.id = "btn-clear-audio";
          clearBtn.textContent = "Clear";
          clearBtn.addEventListener("click", handleClearAudio);
          filenameEl.parentElement.appendChild(clearBtn);
        }

        // Clear input in next tick so a possible "change" event doesn't run in same stack and overwrite UI
        setTimeout(() => {
          if (input) input.value = "";
        }, 0);
      } catch (e) {
        setTimeout(() => { if (input) input.value = ""; }, 0);
      }
    };

    reader.onerror = () => {
      setTimeout(() => { if (input) input.value = ""; }, 0);
    };

    reader.readAsDataURL(file);
  } catch (e) {
    const input = e.target as HTMLInputElement;
    if (input) input.value = "";
  }
}

function setupEventListeners() {
  try {
    // Dragging - Full panel header
    const header = document.getElementById("timer-panic-header");
    if (header) {
      header.addEventListener("mousedown", startDrag);
    }

    // Dragging - Mini bar
    const miniBar = document.getElementById("mini-bar");
    if (miniBar) {
      miniBar.addEventListener("mousedown", startDrag);
    }

    // Minimize/Close/Settings/Panic buttons
    const btnMinimize = document.getElementById("timer-panic-btn-minimize");
    const btnSettings = document.getElementById("btn-settings");
    const btnPanic = document.getElementById("btn-panic");

    if (btnMinimize) btnMinimize.addEventListener("click", toggleMinimize);
    if (btnSettings) btnSettings.addEventListener("click", openSettingsModal);
    if (btnPanic) btnPanic.addEventListener("click", openPanicModal);

    // Timer controls
    const btnStartPause = document.getElementById("btn-start-pause");
    const btnReset = document.getElementById("btn-reset");

    if (btnStartPause) {
      btnStartPause.addEventListener("click", handleStartTimer);
    }
    if (btnReset) btnReset.addEventListener("click", handleResetTimer);

    // Settings modal
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const btnSaveSettings = document.getElementById("btn-save-settings");

    if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettingsModal);
    if (btnSaveSettings) btnSaveSettings.addEventListener("click", handleSaveSettings);
    
    // Integer input validation
    const inputSessionMinutes = document.getElementById("input-session-minutes") as HTMLInputElement;
    const inputBreakMinutes = document.getElementById("input-break-minutes") as HTMLInputElement;
    const inputPomodoroBlocks = document.getElementById("input-pomodoro-blocks") as HTMLInputElement;
    
    if (inputSessionMinutes) {
      inputSessionMinutes.addEventListener("input", () => validateIntegerInput(inputSessionMinutes));
      inputSessionMinutes.addEventListener("blur", () => validateIntegerInput(inputSessionMinutes));
    }
    if (inputBreakMinutes) {
      inputBreakMinutes.addEventListener("input", () => validateIntegerInput(inputBreakMinutes));
      inputBreakMinutes.addEventListener("blur", () => validateIntegerInput(inputBreakMinutes));
    }
    if (inputPomodoroBlocks) {
      inputPomodoroBlocks.addEventListener("input", () => validateIntegerInput(inputPomodoroBlocks));
      inputPomodoroBlocks.addEventListener("blur", () => validateIntegerInput(inputPomodoroBlocks));
    }

    // URL input validation
    const inputBlockedUrls = document.getElementById("input-blocked-urls") as HTMLTextAreaElement;
    if (inputBlockedUrls) {
      inputBlockedUrls.addEventListener("input", () => validateUrlInput(inputBlockedUrls));
      inputBlockedUrls.addEventListener("paste", (e) => {
        // Delay validation to allow paste to complete
        setTimeout(() => validateUrlInput(inputBlockedUrls), 10);
      });
    }

    // Panic modal
    const btnClosePanic = document.getElementById("btn-close-panic");
    const btnBackToFocus = document.getElementById("btn-back-to-focus");
    const btnQuitPanic = document.getElementById("btn-quit-panic");

    if (btnClosePanic) btnClosePanic.addEventListener("click", closePanicModal);
    if (btnBackToFocus) btnBackToFocus.addEventListener("click", closePanicModal);
    if (btnQuitPanic) btnQuitPanic.addEventListener("click", handleQuitPanic);

    // Minimized dot
    const minimizedDot = document.getElementById("minimized-dot");
    if (minimizedDot) minimizedDot.addEventListener("click", toggleMinimize);

    // Mini bar buttons
    const btnMiniStart = document.getElementById("btn-mini-start");
    const btnMiniPanic = document.getElementById("btn-mini-panic");
    const btnMiniExpand = document.getElementById("btn-mini-expand");

    if (btnMiniStart) btnMiniStart.addEventListener("click", handleStartTimer);
    if (btnMiniPanic) btnMiniPanic.addEventListener("click", openPanicModal);
    if (btnMiniExpand) btnMiniExpand.addEventListener("click", toggleMinimize);

    // File upload inputs
    const btnUploadImage = document.getElementById("btn-upload-image");
    const inputPanicImage = document.getElementById("input-panic-image") as HTMLInputElement;
    const btnUploadAudio = document.getElementById("btn-upload-audio");
    const inputPanicAudio = document.getElementById("input-panic-audio") as HTMLInputElement;
    const btnClearImage = document.getElementById("btn-clear-image");
    const btnClearAudio = document.getElementById("btn-clear-audio");

    if (btnUploadImage) {
      btnUploadImage.addEventListener("click", () => {
        if (inputPanicImage) {
          inputPanicImage.value = ""; // Reset before opening file dialog
          inputPanicImage.click();
        }
      });
    }
    if (inputPanicImage) {
      inputPanicImage.addEventListener("change", handleImageUpload);
    }

    if (btnUploadAudio) {
      btnUploadAudio.addEventListener("click", () => {
        if (inputPanicAudio) {
          inputPanicAudio.value = ""; // Reset before opening file dialog
          inputPanicAudio.click();
        }
      });
    }
    if (inputPanicAudio) {
      inputPanicAudio.addEventListener("change", handleAudioUpload);
    }

    if (btnClearImage) {
      btnClearImage.addEventListener("click", handleClearImage);
    }
    if (btnClearAudio) {
      btnClearAudio.addEventListener("click", handleClearAudio);
    }
  } catch (e) {
    // Silently handle error
  }
}

/**
 * Start dragging the panel
 */
function startDrag(e: MouseEvent) {
  const panel = document.getElementById("timer-panic-panel") as HTMLElement;
  if (!panel) return;

  isDragging = true;
  const rect = panel.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;

  document.addEventListener("mousemove", handleDrag);
  document.addEventListener("mouseup", stopDrag);
}

/**
 * Handle dragging
 */
function handleDrag(e: MouseEvent) {
  if (!isDragging) return;

  const panel = document.getElementById("timer-panic-panel") as HTMLElement;
  if (!panel) return;

  let x = e.clientX - dragOffsetX;
  let y = e.clientY - dragOffsetY;

  // Constrain to window bounds
  x = Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth));
  y = Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight));

  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
}

/**
 * Stop dragging and save position
 */
function stopDrag() {
  if (!isDragging) return;

  isDragging = false;
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDrag);

  const panel = document.getElementById("timer-panic-panel") as HTMLElement;
  if (panel) {
    const x = parseInt(panel.style.left, 10);
    const y = parseInt(panel.style.top, 10);

    setUserSettings({
      panelPosition: { x, y }
    });
  }
}

/**
 * Toggle minimize
 */
function toggleMinimize() {
  const miniBar = document.getElementById("mini-bar") as HTMLElement;
  const fullPanel = document.getElementById("timer-panic-full-panel") as HTMLElement;

  if (!miniBar || !fullPanel) return;

  // Check current state - if full panel is visible = expanded, if hidden = minimized
  const isCurrentlyExpanded = fullPanel.style.display !== "none";

  if (isCurrentlyExpanded) {
    // Minimize to mini bar
    fullPanel.style.display = "none";
    miniBar.style.display = "flex";
    setUserSettings({ panelMinimized: true });
  } else {
    // Expand
    fullPanel.style.display = "flex";
    miniBar.style.display = "none";
    setUserSettings({ panelMinimized: false });
  }
}

/**
 * Close panel
 */
function closePanel() {
  const panel = document.getElementById("timer-panic-panel");
  if (panel) {
    panel.remove();
    // Set global flag - all tabs will react via storage listener
    setUserSettings({ panelEnabled: false });
  }
}

/**
 * Sync settings modal file UI (image/audio labels and Clear buttons) from currentPanicContent.
 * Call when opening the modal so the displayed state always matches in-memory state.
 */
function syncModalFileState() {
  const imageFilename = document.getElementById("image-filename");
  const audioFilename = document.getElementById("audio-filename");
  if (imageFilename) {
    imageFilename.textContent = currentPanicContent.imageDataUrl ? "✓ Image uploaded" : "No image";
  }
  if (audioFilename) {
    audioFilename.textContent = currentPanicContent.audioDataUrl ? "✓ Audio uploaded" : "No audio";
  }
  // Ensure Clear buttons exist when we have media (they may be missing if panel was re-created)
  if (currentPanicContent.imageDataUrl) {
    let btnClearImage = document.getElementById("btn-clear-image");
    if (!btnClearImage && imageFilename?.parentElement) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "timer-panic-btn timer-panic-btn-danger";
      clearBtn.id = "btn-clear-image";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", handleClearImage);
      imageFilename.parentElement.appendChild(clearBtn);
    }
  } else {
    document.getElementById("btn-clear-image")?.remove();
  }
  if (currentPanicContent.audioDataUrl) {
    let btnClearAudio = document.getElementById("btn-clear-audio");
    if (!btnClearAudio && audioFilename?.parentElement) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "timer-panic-btn timer-panic-btn-danger";
      clearBtn.id = "btn-clear-audio";
      clearBtn.textContent = "Clear";
      clearBtn.addEventListener("click", handleClearAudio);
      audioFilename.parentElement.appendChild(clearBtn);
    }
  } else {
    document.getElementById("btn-clear-audio")?.remove();
  }
}

/**
 * Open settings modal
 */
function openSettingsModal() {
  const modal = document.getElementById("settings-modal") as HTMLElement;
  if (modal) {
    // Sync file state from currentPanicContent so UI shows correct labels (don't reset to "Choose" after selection)
    syncModalFileState();
    // Clear file input values only so user can pick a different file; do not touch labels
    const inputPanicImage = document.getElementById("input-panic-image") as HTMLInputElement;
    const inputPanicAudio = document.getElementById("input-panic-audio") as HTMLInputElement;
    if (inputPanicImage) inputPanicImage.value = "";
    if (inputPanicAudio) inputPanicAudio.value = "";

    modal.style.display = "flex";

    setTimeout(() => {
      const modalBody = modal.querySelector(".timer-panic-modal-body") as HTMLElement;
      const modalContent = modal.querySelector(".timer-panic-modal-content") as HTMLElement;
      if (modalBody) modalBody.scrollTop = 0;
      if (modalContent) modalContent.scrollTop = 0;
    }, 0);
  }
}

/**
 * Close settings modal
 */
function closeSettingsModal() {
  const modal = document.getElementById("settings-modal") as HTMLElement;
  if (modal) {
    modal.style.display = "none";
  }
}

/**
 * Save settings
 */
function validateIntegerInput(input: HTMLInputElement): void {
  if (!input) return;
  
  // Remove any non-integer characters
  input.value = input.value.replace(/[^0-9]/g, "");
  
  // Ensure minimum value of 1
  const value = parseInt(input.value, 10);
  if (isNaN(value) || value < 1) {
    input.value = "1";
  }
  
  // Ensure it respects max value
  const max = parseInt(input.max, 10);
  if (value > max) {
    input.value = max.toString();
  }
}

/**
 * Sanitize and validate URLs to prevent XSS, injection attacks, and malicious content.
 * Accepts one URL per line or comma-separated (e.g. "strona.pl, strona2.pl" or one per line).
 */
function sanitizeAndValidateUrls(urlsText: string): string[] {
  if (!urlsText || typeof urlsText !== 'string') {
    return [];
  }

  // Split by newlines and commas, then trim each part
  const raw = urlsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const validUrls: string[] = [];
  const seen = new Set<string>();

  for (let url of raw) {
    url = sanitizeUrl(url);
    if (!url) continue;
    if (!isValidUrl(url)) continue;
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (validUrls.length < 50) {
      validUrls.push(normalized);
    }
  }

  return validUrls;
}

/**
 * Sanitize individual URL - remove dangerous characters and potential injections
 */
function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Remove any HTML tags, script tags, and dangerous characters
  url = url
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
    .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
    .replace(/\s+/g, '') // Remove all whitespace
    .toLowerCase();

  // Limit length to prevent buffer overflow attacks
  if (url.length > 253) { // Max domain name length is 253 characters
    url = url.substring(0, 253);
  }

  return url;
}

/**
 * Validate if URL has acceptable format for domain blocking
 */
function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || url.length === 0) {
    return false;
  }

  // Check for minimum length
  if (url.length < 3) {
    return false;
  }

  // Check for maximum length (domain names can't be longer than 253 chars)
  if (url.length > 253) {
    return false;
  }

  // Allow only safe characters for domain names
  const domainRegex = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$/;
  
  // Remove common prefixes for validation
  let cleanUrl = url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, ''); // Remove path

  // Validate domain format
  if (!domainRegex.test(cleanUrl)) {
    return false;
  }

  // Check for valid TLD (at least one dot)
  if (!cleanUrl.includes('.')) {
    return false;
  }

  // Prevent localhost and private IPs
  const forbiddenPatterns = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '192.168.',
    '10.',
    '172.16.',
    '172.17.',
    '172.18.',
    '172.19.',
    '172.20.',
    '172.21.',
    '172.22.',
    '172.23.',
    '172.24.',
    '172.25.',
    '172.26.',
    '172.27.',
    '172.28.',
    '172.29.',
    '172.30.',
    '172.31.'
  ];

  for (const pattern of forbiddenPatterns) {
    if (cleanUrl.includes(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Normalize URL for consistent comparison
 */
function normalizeUrl(url: string): string {
  if (!url) return '';
  
  // Remove protocol and www prefix, convert to lowercase
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '') // Remove path, keep only domain
    .toLowerCase()
    .trim();
}

/**
 * Real-time validation for URL input field
 */
function validateUrlInput(textarea: HTMLTextAreaElement): void {
  if (!textarea) return;

  const originalValue = textarea.value;
  const lines = originalValue.split('\n');
  const sanitizedLines: string[] = [];

  for (let line of lines) {
    // Basic real-time sanitization (more permissive than final validation)
    line = line
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .replace(/[<>"&]/g, ''); // Remove dangerous characters (keep single quotes for domains like o'reilly.com)

    // Limit line length
    if (line.length > 253) {
      line = line.substring(0, 253);
    }

    sanitizedLines.push(line);
  }

  // Limit total number of lines to prevent abuse
  if (sanitizedLines.length > 50) {
    sanitizedLines.splice(50);
  }

  const sanitizedValue = sanitizedLines.join('\n');
  
  // Only update if value changed (prevents cursor jumping)
  if (sanitizedValue !== originalValue) {
    const cursorPosition = textarea.selectionStart;
    textarea.value = sanitizedValue;
    
    // Restore cursor position (approximately)
    const newCursorPosition = Math.min(cursorPosition, sanitizedValue.length);
    textarea.setSelectionRange(newCursorPosition, newCursorPosition);
  }

  // Visual feedback for validation (entries = split by newline or comma)
  const validUrls = sanitizeAndValidateUrls(textarea.value);
  const totalEntries = textarea.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length;

  if (validUrls.length !== totalEntries && totalEntries > 0) {
    textarea.style.borderColor = '#ff6b6b';
    textarea.title = `${validUrls.length}/${totalEntries} URLs are valid. Invalid URLs will be ignored.`;
  } else {
    textarea.style.borderColor = '';
    textarea.title = `${validUrls.length} valid URLs`;
  }
}

function handleSaveSettings() {
  try {
    if (!window.chrome?.storage?.local) {
      return;
    }

    // Validate and sanitize inputs
    const inputSessionMinutes = document.getElementById("input-session-minutes") as HTMLInputElement;
    const inputBreakMinutes = document.getElementById("input-break-minutes") as HTMLInputElement;
    const inputPomodoroBlocks = document.getElementById("input-pomodoro-blocks") as HTMLInputElement;
    
    validateIntegerInput(inputSessionMinutes);
    validateIntegerInput(inputBreakMinutes);
    validateIntegerInput(inputPomodoroBlocks);

    const sessionMinutes = inputSessionMinutes?.value;
    const breakMinutes = inputBreakMinutes?.value;
    const pomodoroBlocks = inputPomodoroBlocks?.value;
    const panicTitle = (document.getElementById("input-panic-title") as HTMLInputElement)?.value;
    const panicItemsText = (document.getElementById("input-panic-items") as HTMLTextAreaElement)?.value;
    const imageMaxWidth = (document.getElementById("input-image-max-width") as HTMLInputElement)?.value;
    const blockedUrlsText = (document.getElementById("input-blocked-urls") as HTMLTextAreaElement)?.value;

    const panicItems = (panicItemsText || "")
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const blockedUrls = sanitizeAndValidateUrls(blockedUrlsText || "");

    const updatedPanicContent: any = {
      title: panicTitle || "Stay focused",
      items: panicItems.length > 0 ? panicItems : ["Focus on your task"],
      imageMaxWidth: Math.max(50, parseInt(imageMaxWidth, 10) || 200)
    };

    // Preserve existing image and audio if not changed
    if (currentPanicContent.imageDataUrl) {
      updatedPanicContent.imageDataUrl = currentPanicContent.imageDataUrl;
    }
    if (currentPanicContent.audioDataUrl) {
      updatedPanicContent.audioDataUrl = currentPanicContent.audioDataUrl;
    }

    // Estimate storage size (Data URLs are ~33% larger than binary)
    const estimatedSize = JSON.stringify(updatedPanicContent).length;
    if (estimatedSize > 8 * 1024 * 1024) {
      alert("Media files are too large! Please use smaller images and audio files. (Combined size should be under 6MB)");
      return;
    }

    // Additional security check for blocked URLs
    if (blockedUrls.length > 50) {
      alert("Too many blocked URLs! Maximum 50 URLs allowed.");
      return;
    }

    // Validate all URLs one more time before saving
    const finalValidatedUrls = blockedUrls.filter(url => {
      const sanitized = sanitizeUrl(url);
      return isValidUrl(sanitized);
    });

    // Check total settings size to prevent storage abuse
    const settingsToSave = {
      sessionMinutes: Math.max(1, parseInt(sessionMinutes, 10) || 25),
      breakMinutes: Math.max(1, parseInt(breakMinutes, 10) || 5),
      pomodoroBlocks: Math.max(1, parseInt(pomodoroBlocks, 10) || 4),
      panicContent: updatedPanicContent,
      blockedUrls: finalValidatedUrls
    };

    const totalSize = JSON.stringify(settingsToSave).length;
    if (totalSize > 10 * 1024 * 1024) { // 10MB limit
      alert("Settings are too large! Please reduce the amount of data (images, audio, or URLs).");
      return;
    }

    setUserSettings(settingsToSave);

    closeSettingsModal();
  } catch (e) {
    // Silently fail
  }
}

/**
 * Open panic modal
 */
/** Zwykły odtwarzacz z natywnymi controls (bez autoplay). */
function createAudioPlayerHTML(dataUrl: string): string {
  return `<audio id="panic-audio-element" controls style="width: 100%; border-radius: 8px;"><source src="${dataUrl}" type="audio/mpeg"></audio>`;
}

/**
 * Show panic modal content only (no timer change). Used when syncing from another tab.
 */
function showPanicModalOnly(): void {
  try {
    const modal = document.getElementById("panic-modal") as HTMLElement;
    if (!modal) return;
    const panicTitle = document.getElementById("panic-title");
    if (panicTitle) panicTitle.textContent = currentPanicContent.title;
    const panicBody = modal.querySelector(".timer-panic-modal-body") as HTMLElement;
    if (panicBody) {
      let bodyHtml = "";
      if (currentPanicContent.imageDataUrl) {
        bodyHtml += `<div class="timer-panic-panic-image-container" style="margin-bottom: 16px;">
          <img src="${currentPanicContent.imageDataUrl}" alt="Panic motivation" class="timer-panic-panic-image" style="max-width: ${currentPanicContent.imageMaxWidth || 200}px; max-height: 300px; border-radius: 8px;">
        </div>`;
      }
      if (currentPanicContent.audioDataUrl) {
        bodyHtml += `<div class="timer-panic-panic-audio-container" style="margin-bottom: 16px;">
          ${createAudioPlayerHTML(currentPanicContent.audioDataUrl)}
        </div>`;
      }
      bodyHtml += `<div id="panic-items" class="timer-panic-panic-items">
        ${currentPanicContent.items.map((item: any) => `<div class="timer-panic-panic-item">• ${item}</div>`).join("")}
      </div>`;
      panicBody.innerHTML = bodyHtml;
    }
    modal.style.display = "flex";
  } catch (e) {
    // ignore
  }
}

/**
 * Hide panic modal only (no timer resume). Used when syncing from another tab
 * or when user closed modal on another tab. Zatrzymaj dźwięk na tej karcie,
 * żeby muzyka nie grała w tle po zamknięciu modala na innej karcie.
 */
function hidePanicModalOnly(): void {
  try {
    const modal = document.getElementById("panic-modal") as HTMLElement;
    if (modal) {
      modal.style.display = "none";
      const audioEl = document.getElementById("panic-audio-element") as HTMLAudioElement;
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }
    }
  } catch (e) {
    // ignore
  }
}

function openPanicModal() {
  try {
    // Stop only the countdown. Do not change blocking (stay blocked), do not change mode (stay working).
    if (currentTimerState.isRunning && currentTimerState.startTime) {
      const elapsed = Date.now() - currentTimerState.startTime;
      const remaining = Math.max(0, currentTimerState.duration - elapsed);
      const progressSoFar = currentTimerState.duration > 0
        ? Math.min(100, (elapsed / currentTimerState.duration) * 100)
        : 0;

      currentTimerState.isRunning = false;
      currentTimerState.duration = remaining;
      currentTimerState.startTime = null;
      currentTimerState.progressStartPercent = progressSoFar;

      if (window.chrome?.storage?.local) {
        window.chrome.storage.local.set({
          timerState: currentTimerState,
          panicModalOpen: true
        });
      }
      stopTimerLoop();

      // Update panel display and progress bar to show frozen time remaining (URL blocked overlay reads from storage/state)
      const remainingMs = currentTimerState.duration;
      const secs = Math.ceil(remainingMs / 1000);
      const mins = Math.floor(secs / 60);
      const timeStr = `${String(mins).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
      const displayEl = document.getElementById("timer-display");
      const miniTimeEl = document.getElementById("mini-time");
      const displayModernEl = document.querySelector(".timer-panic-time-large");
      if (displayEl) displayEl.textContent = timeStr;
      if (miniTimeEl) miniTimeEl.textContent = timeStr;
      if (displayModernEl) displayModernEl.textContent = timeStr;
      const progressFill = document.getElementById("timer-progress-fill");
      if (progressFill && currentTimerState.progressStartPercent != null) {
        progressFill.style.width = `${Math.min(100, currentTimerState.progressStartPercent)}%`;
      }
      if (progressSmoothInterval) {
        clearInterval(progressSmoothInterval);
        progressSmoothInterval = null;
      }
      applyBlockingDecision(isCurrentUrlBlocked(), currentTimerState, true);
    } else if (window.chrome?.storage?.local) {
      window.chrome.storage.local.set({ panicModalOpen: true });
    }

    currentPanicModalOpen = true;

    // Na stronach URL blocked: zatrzymaj/wycisz media w tle i utrzymaj blur (bez wpływu na odtwarzacz/obrazek w modalu)
    pauseBackgroundMediaExceptPanicModal();
    if (isCurrentUrlBlocked()) {
      reapplyBlockedPageBlur();
      setTimeout(() => {
        pauseBackgroundMediaExceptPanicModal();
        reapplyBlockedPageBlur();
      }, 100);
      setTimeout(() => pauseBackgroundMediaExceptPanicModal(), 400);
    }

    // Update panic modal content dynamically
    const modal = document.getElementById("panic-modal") as HTMLElement;
    if (modal) {
      const panicTitle = document.getElementById("panic-title");
      if (panicTitle) {
        panicTitle.textContent = currentPanicContent.title;
      }

      // Update body content with current media - hierarchy: image -> audio -> text
      const panicBody = modal.querySelector(".timer-panic-modal-body") as HTMLElement;
      if (panicBody) {
        let bodyHtml = "";
        
        // 1. Add image if exists (at the top)
        if (currentPanicContent.imageDataUrl) {
          bodyHtml += `<div class="timer-panic-panic-image-container" style="margin-bottom: 16px;">
            <img src="${currentPanicContent.imageDataUrl}" alt="Panic motivation" class="timer-panic-panic-image" style="max-width: ${currentPanicContent.imageMaxWidth || 200}px; max-height: 300px; border-radius: 8px;">
          </div>`;
        }

        // 2. Add audio if exists (below image)
        if (currentPanicContent.audioDataUrl) {
          bodyHtml += `<div class="timer-panic-panic-audio-container" style="margin-bottom: 16px;">
            ${createAudioPlayerHTML(currentPanicContent.audioDataUrl)}
          </div>`;
        }

        // 3. Add text items (always at the bottom)
        bodyHtml += `<div id="panic-items" class="timer-panic-panic-items">
          ${currentPanicContent.items.map((item) => `<div class="timer-panic-panic-item">• ${item}</div>`).join("")}
        </div>`;

        panicBody.innerHTML = bodyHtml;
      }

      modal.style.display = "flex";

      // Reset scroll to top after modal is displayed
      setTimeout(() => {
        const panicBody = modal.querySelector(".timer-panic-modal-body") as HTMLElement;
        const panicContent = modal.querySelector(".timer-panic-modal-content") as HTMLElement;
        if (panicBody) {
          panicBody.scrollTop = 0;
        }
        if (panicContent) {
          panicContent.scrollTop = 0;
        }
      }, 0);
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Close panic modal
 */
function closePanicModal() {
  try {
    const wasTimeStoppedByPanic = isTimeStoppedByPanic(currentTimerState, currentPanicModalOpen);
    currentPanicModalOpen = false;
    if (window.chrome?.storage?.local) {
      window.chrome.storage.local.set({ panicModalOpen: false });
    }

    const modal = document.getElementById("panic-modal") as HTMLElement;
    if (modal) {
      modal.style.display = "none";
      const audioEl = document.getElementById("panic-audio-element") as HTMLAudioElement;
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }
    }

    if (wasTimeStoppedByPanic) {
      handleStartTimer();
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Handle quit panic - stop timer and disable app (panel closes)
 */
async function handleQuitPanic() {
  try {
    currentTimerState.isRunning = false;
    currentTimerState.duration = 0;
    currentTimerState.startTime = null;
    currentPanicModalOpen = false;

    stopTimerLoop();

    // Write quit state to storage first so all tabs unblock at once (before closing modal)
    const updatedSettings = { ...currentSettings, panelEnabled: false };
    if (window.chrome?.storage?.local) {
      await window.chrome.storage.local.set({
        userSettings: updatedSettings,
        timerState: currentTimerState,
        panicModalOpen: false
      });
    }

    closePanicModal();

    // Remove panel so the app is fully closed
    const panel = document.getElementById("timer-panic-panel") as HTMLElement;
    if (panel) {
      panel.remove();
    }
  } catch (e) {
    // Silently fail
  }
}

/**
 * Handle start timer
 */
async function handleStartTimer() {
  try {
    if (!window.chrome?.storage?.local) {
      return;
    }

    // Don't start if already running
    if (currentTimerState.isRunning) {
      return;
    }

    let duration = currentTimerState.duration;
    let isBreak = currentTimerState.isBreak || false;
    let currentBlock = currentTimerState.currentBlock || 1;
    const progressStart = currentTimerState.progressStartPercent;

    if (!duration || duration === 0) {
      duration = currentSettings.sessionMinutes * 60 * 1000;
      isBreak = false;
      currentBlock = 1;
      currentTimerState.progressStartPercent = 0;
    } else {
      currentTimerState.progressStartPercent = progressStart ?? 0;
    }

    currentTimerState.isRunning = true;
    currentTimerState.startTime = Date.now();
    currentTimerState.duration = duration;
    currentTimerState.isBreak = isBreak;
    currentTimerState.currentBlock = currentBlock;

    await setTimerState(currentTimerState);

    // Update UI from in-memory state so progress bar keeps progressStartPercent (updateTimerDisplay can read stale state from storage and reset bar)
    const remainingMs = duration;
    const secs = Math.ceil(remainingMs / 1000);
    const mins = Math.floor(secs / 60);
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    const displayEl = document.getElementById("timer-display");
    const miniTimeEl = document.getElementById("mini-time");
    const displayModernEl = document.querySelector(".timer-panic-time-large");
    if (displayEl) displayEl.textContent = timeStr;
    if (miniTimeEl) miniTimeEl.textContent = timeStr;
    if (displayModernEl) displayModernEl.textContent = timeStr;
    const progressFill = document.getElementById("timer-progress-fill");
    const startPct = currentTimerState.progressStartPercent ?? 0;
    if (progressFill) {
      progressFill.style.width = `${Math.min(100, startPct)}%`;
    }
    if (!progressSmoothInterval) {
      progressSmoothInterval = setInterval(updateProgressBarSmooth, 100);
    }
    const statusBadge = document.getElementById("timer-status-badge");
    if (statusBadge) {
      statusBadge.textContent = currentTimerState.isBreak ? "BREAK" : "WORKING";
    }
    const blockEl = document.getElementById("timer-block");
    if (blockEl) {
      blockEl.textContent = `Block ${currentBlock}/${currentSettings.pomodoroBlocks ?? 4}`;
    }

    startTimerLoop();
  } catch (e) {
    // Silently fail - app continues to work locally
  }
}

/**
 * Handle reset timer
 */
async function handleResetTimer() {
  try {
    if (!window.chrome?.storage?.local) {
      return;
    }

    currentTimerState = {
      isRunning: false,
      startTime: null,
      duration: 0,
      sessionMinutes: currentSettings.sessionMinutes,
      isBreak: false,
      currentBlock: 1
    };

    await setTimerState(currentTimerState);
    updateTimerDisplay();
    stopTimerLoop();
  } catch (e) {
    // Silently fail
  }
}

/**
 * Start timer loop
 */
let timerLoopInterval: any = null;

function startTimerLoop() {
  stopTimerLoop();

  // Check once per second to avoid unnecessary CPU load
  timerLoopInterval = setInterval(async () => {
    if (!currentTimerState.isRunning || !currentTimerState.startTime) {
      stopTimerLoop();
      return;
    }

    const elapsed = Date.now() - currentTimerState.startTime;
    const remaining = Math.max(0, currentTimerState.duration - elapsed);

    if (remaining <= 0) {
      // Let updateTimerDisplay handle transition (break / next block / stop)
      await updateTimerDisplay();
      return;
    }

    updateTimerDisplay();
  }, 1000);
}

/**
 * Stop timer loop
 */
function stopTimerLoop() {
  if (timerLoopInterval) {
    clearInterval(timerLoopInterval);
    timerLoopInterval = null;
  }
  if (progressSmoothInterval) {
    clearInterval(progressSmoothInterval);
    progressSmoothInterval = null;
  }
}

/**
 * Check if current URL should be blocked (with additional security checks)
 */
function isCurrentUrlBlocked(): boolean {
  try {
    // Additional security: ensure we have valid settings and URL list
    if (!currentSettings || !Array.isArray(currentSettings.blockedUrls)) {
      return false;
    }

    const currentUrl = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    
    // Security check: ensure we're dealing with http/https URLs only
    if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
      return false;
    }

    // Security check: prevent blocking of extension pages or special URLs
    if (hostname.includes('chrome-extension://') || 
        hostname.includes('moz-extension://') ||
        hostname.includes('localhost') ||
        hostname.includes('127.0.0.1')) {
      return false;
    }

    return currentSettings.blockedUrls.some(blockedUrl => {
      // Additional validation of blocked URL before comparison
      if (!blockedUrl || typeof blockedUrl !== 'string' || blockedUrl.length === 0) {
        return false;
      }

      // Re-sanitize the stored URL as additional security measure
      const cleanBlockedUrl = sanitizeUrl(blockedUrl);
      if (!isValidUrl(cleanBlockedUrl)) {
        return false;
      }

      const normalizedBlockedUrl = normalizeUrl(cleanBlockedUrl);
      
      // Use exact domain matching for better security
      return hostname === normalizedBlockedUrl || 
             hostname.endsWith('.' + normalizedBlockedUrl);
    });
  } catch (e) {
    // Log error for debugging but don't block on error
    console.warn('Attention Guard: Error checking blocked URL:', e);
    return false;
  }
}

/**
 * Create and show URL blocking overlay (blur background, keep app visible)
 */
function showBlockingOverlay(): void {
  try {
    if (!isExtensionContextValid()) return;
    // Remove existing overlay if present
    const existingOverlay = document.getElementById('timer-panic-url-blocker');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Stop and mute all media (audio and video) - skip panic modal player
    try {
      const allMedia = document.querySelectorAll('audio, video');
      for (let i = 0; i < allMedia.length; i++) {
        const media = allMedia[i] as HTMLMediaElement;
        if (media?.id === 'panic-audio-element') continue;
        if (media) {
          if (!media.dataset.hasOwnProperty('originalVolume')) {
            media.dataset.originalVolume = media.volume.toString();
          }
          media.volume = 0;
          media.pause();
          media.autoplay = false;
        }
      }
    } catch (e) {
      // Silently fail - don't break blocking if media handling fails
    }

    // Blur the page content (everything except Attention Guard app)
    const timerPanel = document.getElementById('timer-panic-panel');
    const allElements = document.querySelectorAll('body > *:not(#timer-panic-panel):not(#timer-panic-url-blocker)');

    allElements.forEach(element => {
      if (element !== timerPanel) {
        (element as HTMLElement).style.filter = 'blur(5px)';
        (element as HTMLElement).style.pointerEvents = 'none';
        (element as HTMLElement).style.userSelect = 'none';
      }
    });

  // Create blocking info overlay (styling w styles.css – dopasowane do app)
  const overlay = document.createElement('div');
  overlay.id = 'timer-panic-url-blocker';

  const content = document.createElement('div');
  content.className = 'timer-panic-url-blocker-content';

  content.innerHTML = `
    <div class="timer-panic-url-blocker-icon">🚫</div>
    <h2 class="timer-panic-url-blocker-title">URL Blocked</h2>
    <p class="timer-panic-url-blocker-desc">This site is blocked during work sessions</p>
    <div id="timer-panic-blocker-status"></div>
    <p class="timer-panic-url-blocker-hint">Use the Attention Guard app to manage your session<br>Site will be accessible during breaks</p>
  `;

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // Update the status dynamically
  updateBlockingOverlayStatus();

  // Set up interval to refresh time display (once per second, same as timer)
  if (!(window as any).__TIMER_PANIC_BLOCKER_REFRESH__) {
    (window as any).__TIMER_PANIC_BLOCKER_REFRESH__ = setInterval(() => {
      if (document.getElementById('timer-panic-url-blocker')) {
        updateBlockingOverlayStatus();
      } else {
        // Overlay removed, stop refreshing
        clearInterval((window as any).__TIMER_PANIC_BLOCKER_REFRESH__);
        (window as any).__TIMER_PANIC_BLOCKER_REFRESH__ = null;
      }
    }, 1000);
  }

    // Ensure Attention Guard app stays on top and functional
    if (timerPanel) {
      timerPanel.style.zIndex = '999999999';
      timerPanel.style.position = 'fixed';
      timerPanel.style.pointerEvents = 'auto';
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (msg.includes('invalidated')) return;
    throw e;
  }
}

/**
 * Update the blocking overlay status (time remaining).
 * Gdy podane overrideRemainingMs i overrideIsWorkSession, używaj ich (ta sama wartość co w app).
 */
function updateBlockingOverlayStatus(overrideRemainingMs?: number, overrideIsWorkSession?: boolean): void {
  const statusDiv = document.getElementById('timer-panic-blocker-status');
  if (!statusDiv) return;

  let isWorkSession: boolean;
  let timeStr: string;

  if (overrideRemainingMs !== undefined && overrideIsWorkSession !== undefined) {
    isWorkSession = overrideIsWorkSession;
    const totalSeconds = Math.ceil(overrideRemainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    const timerState = currentTimerState;
    const timeStopped = isTimeStoppedByPanic(timerState, currentPanicModalOpen);
    isWorkSession = (timerState.isRunning && !timerState.isBreak) || (timeStopped && !timerState.isBreak);

    if (isWorkSession) {
      const remainingTime = timerState.isRunning && timerState.startTime
        ? Math.max(0, timerState.duration - (Date.now() - timerState.startTime))
        : timeStopped
          ? timerState.duration
          : 0;
      const totalSeconds = Math.ceil(remainingTime / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      timeStr = '';
    }
  }

  if (isWorkSession) {
    const label = "Work Session Active";
    statusDiv.innerHTML = `
      <div class="timer-panic-blocker-status-box timer-panic-blocker-status-box-active">
        <div class="timer-panic-blocker-status-label">${label}</div>
        <div class="timer-panic-blocker-status-time">Time remaining: ${timeStr}</div>
      </div>
    `;
  } else {
    statusDiv.innerHTML = `
      <div class="timer-panic-blocker-status-box timer-panic-blocker-status-box-inactive">
        <div class="timer-panic-blocker-status-inactive">Timer not active</div>
      </div>
    `;
  }
}

/**
 * Remove URL blocking overlay and restore page
 */
function hideBlockingOverlay(): void {
  try {
    if (!isExtensionContextValid()) return;
    // Stop refreshing overlay status
    if ((window as any).__TIMER_PANIC_BLOCKER_REFRESH__) {
      clearInterval((window as any).__TIMER_PANIC_BLOCKER_REFRESH__);
      (window as any).__TIMER_PANIC_BLOCKER_REFRESH__ = null;
    }

    const overlay = document.getElementById('timer-panic-url-blocker');
    if (overlay) {
      overlay.remove();
    }

    // Restore media (unmute and restore original volume) - simple one-time operation
    try {
      const allMedia = document.querySelectorAll('audio, video');
      for (let i = 0; i < allMedia.length; i++) {
        const media = allMedia[i] as HTMLMediaElement;
        if (media && media.dataset.hasOwnProperty('originalVolume')) {
          const originalVolume = parseFloat(media.dataset.originalVolume);
          if (!isNaN(originalVolume)) {
            media.volume = originalVolume;
          }
        }
      }
    } catch (e) {
      // Silently fail
    }

    // Restore page content (remove blur and re-enable interactions)
    const timerPanel = document.getElementById('timer-panic-panel');
    const allElements = document.querySelectorAll('body > *:not(#timer-panic-panel)');

    allElements.forEach(element => {
      if (element !== timerPanel) {
        (element as HTMLElement).style.filter = '';
        (element as HTMLElement).style.pointerEvents = '';
        (element as HTMLElement).style.userSelect = '';
      }
    });

    if (timerPanel) {
      timerPanel.style.zIndex = '999999';
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (msg.includes('invalidated')) return;
    throw e;
  }
}

/** Zatrzymaj i wycisz wszystkie media na stronie (w tle), z pominięciem odtwarzacza i treści w Panic modal. */
function pauseBackgroundMediaExceptPanicModal(): void {
  try {
    const panicModal = document.getElementById("panic-modal");
    const allMedia = document.querySelectorAll("audio, video");
    for (let i = 0; i < allMedia.length; i++) {
      const el = allMedia[i] as HTMLMediaElement;
      if (el.id === "panic-audio-element") continue;
      if (panicModal && panicModal.contains(el)) continue;
      if (!el.dataset.hasOwnProperty("originalVolume")) el.dataset.originalVolume = el.volume.toString();
      el.volume = 0;
      el.pause();
      el.autoplay = false;
    }
  } catch (e) {
    // ignore
  }
}

/** Ponownie nałóż blur i blokadę interakcji na treść strony (bez panelu i overlay). Zapobiega "odmrożeniu" po user gesture. */
function reapplyBlockedPageBlur(): void {
  try {
    if (!isExtensionContextValid()) return;
    const timerPanel = document.getElementById("timer-panic-panel");
    const overlay = document.getElementById("timer-panic-url-blocker");
    const allElements = document.querySelectorAll("body > *:not(#timer-panic-panel):not(#timer-panic-url-blocker)");
    allElements.forEach(element => {
      if (element !== timerPanel && element !== overlay) {
        (element as HTMLElement).style.filter = "blur(5px)";
        (element as HTMLElement).style.pointerEvents = "none";
        (element as HTMLElement).style.userSelect = "none";
      }
    });
  } catch (e) {
    // ignore
  }
}

// Simple media muting function - called periodically when blocking is active
function muteNewMedia(): void {
  try {
    const allMedia = document.querySelectorAll('audio, video');
    for (let i = 0; i < allMedia.length; i++) {
      const media = allMedia[i] as HTMLMediaElement;
      if (media?.id === 'panic-audio-element') continue; // nie wyciszaj odtwarzacza z Panic modala
      if (media && !media.dataset.hasOwnProperty('originalVolume')) {
        media.dataset.originalVolume = media.volume.toString();
        media.volume = 0;
        media.pause();
        media.autoplay = false;
      }
    }
  } catch (e) {
    // Silently fail
  }
}

// Media muting interval (only active when blocking)
let mediaMutingInterval: any = null;

/**
 * Check and apply URL blocking. Blocked URLs stay blocked until break or I Quit (never turn off when Panic pauses timer).
 */
function checkAndApplyUrlBlocking(): void {
  if (!currentSettings.panelEnabled) {
    hideBlockingOverlay();
    if (mediaMutingInterval) {
      clearInterval(mediaMutingInterval);
      mediaMutingInterval = null;
    }
    return;
  }

  const shouldBlock = isCurrentUrlBlocked();
  if (!window.chrome?.storage?.local) {
    applyBlockingDecision(shouldBlock, currentTimerState, currentPanicModalOpen);
    return;
  }

  try {
    window.chrome.storage.local.get(["timerState", "panicModalOpen"])
      .then((result: any) => {
        try {
          if (!isExtensionContextValid()) return;
          const timerState = result?.timerState || currentTimerState;
          const panicOpen = result?.panicModalOpen === true;
          if (result?.timerState) currentTimerState = result.timerState;
          if (result?.panicModalOpen !== undefined) currentPanicModalOpen = result.panicModalOpen === true;
          applyBlockingDecision(shouldBlock, timerState, panicOpen);
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          if (msg.includes("invalidated")) return;
          throw e;
        }
      })
      .catch(() => {});
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (msg.includes("invalidated")) return;
    throw e;
  }
}

/** Panic = pause time only. Blocking stays, mode stays working. Unblock only on break or I Quit. */
function applyBlockingDecision(shouldBlock: boolean, timerState: any, panicOpen: boolean): void {
  try {
    if (!isExtensionContextValid()) return;
    const isBreak = timerState?.isBreak === true;
    const timeStoppedByPanic = isTimeStoppedByPanic(timerState, panicOpen);
    const isQuit = !timerState?.isRunning && !timeStoppedByPanic;
    const keepBlocked = shouldBlock && !isBreak && !isQuit;

    if (keepBlocked) {
      if (!document.getElementById("timer-panic-url-blocker")) {
        showBlockingOverlay();
      }
      if (!mediaMutingInterval) {
        mediaMutingInterval = setInterval(muteNewMedia, 2000);
      }
    } else {
      hideBlockingOverlay();
      if (mediaMutingInterval) {
        clearInterval(mediaMutingInterval);
        mediaMutingInterval = null;
      }
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (msg.includes("invalidated")) return;
    throw e;
  }
}

/**
 * Update timer display
 */
async function updateTimerDisplay() {
  let state = await getTimerState();
  const timeStoppedInMemory = isTimeStoppedByPanic(currentTimerState, currentPanicModalOpen);
  const storageSaysReady = !state.isRunning && (state.duration === 0 || !currentPanicModalOpen);
  if (timeStoppedInMemory && storageSaysReady) {
    state = currentTimerState;
  } else if (!(storageSaysReady && timeStoppedInMemory)) {
    currentTimerState = state;
  }

  let remaining = state.duration;

  if (state.isRunning && state.startTime) {
    remaining = Math.max(0, state.duration - (Date.now() - state.startTime));
  }

  // Check if timer finished
  if (state.isRunning && remaining <= 0) {
    const settings = await getUserSettings();

    if (!state.isBreak) {
      // Pomodoro session finished - go to break
      const breakDuration = settings.breakMinutes * 60 * 1000;
      const newState = {
        isRunning: true,
        startTime: Date.now(),
        pausedAt: null,
        duration: breakDuration,
        sessionMinutes: settings.sessionMinutes,
        isBreak: true,
        currentBlock: state.currentBlock
      };
      setTimerState(newState);
      currentTimerState = newState;
      remaining = breakDuration;
      startTimerLoop();
    } else {
      // Break finished - check if more blocks left
      if (state.currentBlock < settings.pomodoroBlocks) {
        // Start next block
        const sessionDuration = settings.sessionMinutes * 60 * 1000;
        const newState = {
          isRunning: true,
          startTime: Date.now(),
          pausedAt: null,
          duration: sessionDuration,
          sessionMinutes: settings.sessionMinutes,
          isBreak: false,
          currentBlock: state.currentBlock + 1
        };
        setTimerState(newState);
        currentTimerState = newState;
        remaining = sessionDuration;
        startTimerLoop();
      } else {
        // All blocks done - stop
        const newState = {
          isRunning: false,
          startTime: null,
          pausedAt: null,
          duration: settings.sessionMinutes * 60 * 1000,
          sessionMinutes: settings.sessionMinutes,
          isBreak: false,
          currentBlock: 1
        };
        setTimerState(newState);
        currentTimerState = newState;
        remaining = settings.sessionMinutes * 60 * 1000;
      }
    }
  }

  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const timeStr = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const displayEl = document.getElementById("timer-display");
  const minimizedTimeEl = document.querySelector(".timer-panic-minimized-time");
  const miniTimeEl = document.getElementById("mini-time");
  const statusEl = document.getElementById("timer-status");
  const blockEl = document.getElementById("timer-block");
  const btnStartPause = document.getElementById("btn-start-pause");
  const btnMiniStart = document.getElementById("btn-mini-start");
  const btnReset = document.getElementById("btn-reset");

  if (displayEl) displayEl.textContent = timeStr;
  if (minimizedTimeEl) minimizedTimeEl.textContent = timeStr;
  if (miniTimeEl) miniTimeEl.textContent = timeStr;
  
  // Update modern display
  const displayModernEl = document.querySelector(".timer-panic-time-large");
  if (displayModernEl) displayModernEl.textContent = timeStr;

  if (document.getElementById("timer-panic-url-blocker")) {
    const timeStopped = isTimeStoppedByPanic(state, currentPanicModalOpen);
    const isWorkSession = (state.isRunning && !state.isBreak) || (timeStopped && !state.isBreak);
    updateBlockingOverlayStatus(remaining, isWorkSession);
  }

  const progressFill = document.getElementById("timer-progress-fill");
  if (progressFill && currentTimerState.duration > 0) {
    if (state.isRunning && state.startTime) {
      const elapsed = Date.now() - state.startTime;
      const segmentPercent = Math.min((elapsed / currentTimerState.duration) * 100, 100);
      const start = state.progressStartPercent ?? 0;
      const range = 100 - start;
      const progress = Math.min(100, start + (segmentPercent / 100) * range);
      progressFill.style.width = `${progress}%`;
    } else if (isTimeStoppedByPanic(state, currentPanicModalOpen)) {
      const pct = state.progressStartPercent ?? currentTimerState.progressStartPercent ?? 0;
      progressFill.style.width = `${Math.min(100, pct)}%`;
    } else if (!state.isRunning) {
      progressFill.style.width = "0%";
    }
  }
  // Keep smooth progress interval running only when timer is running
  if (state.isRunning) {
    if (!progressSmoothInterval) {
      progressSmoothInterval = setInterval(updateProgressBarSmooth, 100);
    }
  } else {
    if (progressSmoothInterval) {
      clearInterval(progressSmoothInterval);
      progressSmoothInterval = null;
    }
  }
  
  const timeStoppedByPanicForDisplay = isTimeStoppedByPanic(state, currentPanicModalOpen) && !state.isBreak;
  const statusBadge = document.getElementById("timer-status-badge");
  if (statusBadge) {
    if (state.isRunning) {
      statusBadge.textContent = state.isBreak ? "BREAK" : "WORKING";
      statusBadge.style.color = state.isBreak ? "#FF9800" : "#4CAF50";
      statusBadge.style.borderColor = state.isBreak ? "rgba(255, 152, 0, 0.3)" : "rgba(76, 175, 80, 0.3)";
      statusBadge.style.background = state.isBreak ? "rgba(255, 152, 0, 0.1)" : "rgba(76, 175, 80, 0.1)";
    } else if (timeStoppedByPanicForDisplay) {
      statusBadge.textContent = "WORKING";
      statusBadge.style.color = "#4CAF50";
      statusBadge.style.borderColor = "rgba(76, 175, 80, 0.3)";
      statusBadge.style.background = "rgba(76, 175, 80, 0.1)";
    } else {
      statusBadge.textContent = "READY";
      statusBadge.style.color = "#FF6B6B";
      statusBadge.style.borderColor = "rgba(255, 107, 107, 0.2)";
      statusBadge.style.background = "rgba(255, 107, 107, 0.1)";
    }
  }

  // Update block counter (use cached settings to avoid extra storage read)
  if (blockEl) {
    const blocks = currentSettings.pomodoroBlocks ?? 4;
    blockEl.textContent = `Block ${state.currentBlock}/${blocks}`;
  }

  if (statusEl) {
    let statusText = "Ready";
    let statusColor = "#999";
    if (state.isRunning) {
      statusText = state.isBreak ? "Break..." : "Working...";
      statusColor = state.isBreak ? "#2196F3" : "#4CAF50";
    } else if (timeStoppedByPanicForDisplay) {
      statusText = "Working...";
      statusColor = "#4CAF50";
    }
    statusEl.textContent = statusText;
    statusEl.style.color = statusColor;
  }

  // Update start button - disabled when timer is running
  const btnStartPauseEl = btnStartPause as HTMLButtonElement;
  if (btnStartPauseEl) {
    if (state.isRunning) {
      btnStartPauseEl.disabled = true;
      btnStartPauseEl.classList.add("timer-panic-btn-disabled");
      btnStartPauseEl.style.opacity = "0.5";
      btnStartPauseEl.style.cursor = "not-allowed";
    } else {
      btnStartPauseEl.disabled = false;
      btnStartPauseEl.classList.remove("timer-panic-btn-disabled");
      btnStartPauseEl.style.opacity = "1";
      btnStartPauseEl.style.cursor = "pointer";
    }
  }

  // Update mini start button - disabled when timer is running
  const btnMiniStartEl = btnMiniStart as HTMLButtonElement;
  if (btnMiniStartEl) {
    if (state.isRunning) {
      btnMiniStartEl.disabled = true;
      btnMiniStartEl.style.opacity = "0.5";
      btnMiniStartEl.style.cursor = "not-allowed";
    } else {
      btnMiniStartEl.disabled = false;
      btnMiniStartEl.style.opacity = "1";
      btnMiniStartEl.style.cursor = "pointer";
    }
  }

  // Update reset button - disabled when timer is running (work or break)
  const btnResetEl = btnReset as HTMLButtonElement;
  if (btnResetEl) {
    if (state.isRunning) {
      btnResetEl.disabled = true;
      btnResetEl.style.opacity = "0.5";
      btnResetEl.style.cursor = "not-allowed";
    } else {
      btnResetEl.disabled = false;
      btnResetEl.style.opacity = "1";
      btnResetEl.style.cursor = "pointer";
    }
  }

  // Check URL blocking after timer state update
  checkAndApplyUrlBlocking();
}

/**
 * Start update loop
 */
function startUpdateLoop() {
  if (updateInterval) clearInterval(updateInterval);

  // Update once per second to avoid unnecessary CPU and storage load
  updateInterval = setInterval(() => {
    updateTimerDisplay();
  }, 1000);
}

/**
 * Handle global settings change (like panelEnabled or panelPosition)
 */
function handleGlobalSettingsChange(changes: any) {
  if (changes.userSettings) {
    const newSettings = changes.userSettings.newValue;
    const oldSettings = changes.userSettings.oldValue;
    
    // If panel was disabled globally, remove it from this tab
    if (newSettings && !newSettings.panelEnabled) {
      const panel = document.getElementById("timer-panic-panel");
      if (panel) {
        panel.remove();
      }
      return; // Exit early to avoid unnecessary updates
    }
    
    // If panel was enabled globally, inject it
    if (newSettings && newSettings.panelEnabled && !document.getElementById("timer-panic-panel")) {
      injectFloatingPanel();
      setupEventListeners();
      currentSettings = newSettings;
      currentPanicContent = newSettings.panicContent;
      return; // Exit early after injection
    }
    
    // Only update if panel exists
    const panel = document.getElementById("timer-panic-panel") as HTMLElement;
    if (!panel || !newSettings) {
      return;
    }
    
    // Update position only if it actually changed (avoid unnecessary DOM updates)
    const positionChanged = !oldSettings || 
      oldSettings.panelPosition?.x !== newSettings.panelPosition?.x ||
      oldSettings.panelPosition?.y !== newSettings.panelPosition?.y;
    
    if (positionChanged) {
      panel.style.left = `${newSettings.panelPosition.x}px`;
      panel.style.top = `${newSettings.panelPosition.y}px`;
    }
    
    // Handle minimize state sync only if it changed (avoid unnecessary DOM updates)
    const minimizeStateChanged = !oldSettings || 
      oldSettings.panelMinimized !== newSettings.panelMinimized;
    
    if (minimizeStateChanged) {
      const fullPanel = document.getElementById("timer-panic-full-panel") as HTMLElement;
      const miniBar = document.getElementById("mini-bar") as HTMLElement;
      
      if (fullPanel && miniBar) {
        if (newSettings.panelMinimized) {
          // Minimize
          fullPanel.style.display = "none";
          miniBar.style.display = "flex";
        } else {
          // Expand
          fullPanel.style.display = "flex";
          miniBar.style.display = "none";
        }
      }
    }
    
    // Update settings only if something other than position/minimize changed
    const otherSettingsChanged = !oldSettings ||
      oldSettings.panicContent !== newSettings.panicContent ||
      oldSettings.sessionMinutes !== newSettings.sessionMinutes ||
      oldSettings.breakMinutes !== newSettings.breakMinutes ||
      oldSettings.pomodoroBlocks !== newSettings.pomodoroBlocks ||
      JSON.stringify(oldSettings.blockedUrls) !== JSON.stringify(newSettings.blockedUrls);
    
    if (otherSettingsChanged) {
      currentSettings = newSettings;
      currentPanicContent = newSettings.panicContent;
      
      // Check URL blocking only if URLs changed
      if (!oldSettings || JSON.stringify(oldSettings.blockedUrls) !== JSON.stringify(newSettings.blockedUrls)) {
        checkAndApplyUrlBlocking();
      }
    }
  }
}

/**
 * Handle storage changes
 */
function handleStorageChange(changes: any) {
  if (changes.userSettings) {
    const newSettings = changes.userSettings.newValue;
    const oldSettings = changes.userSettings.oldValue;

    currentSettings = newSettings;
    currentPanicContent = newSettings.panicContent;

    // Update panel position only when it actually changed (avoid refresh when only position changed)
    const positionChanged = !oldSettings ||
      oldSettings.panelPosition?.x !== newSettings.panelPosition?.x ||
      oldSettings.panelPosition?.y !== newSettings.panelPosition?.y;
    if (positionChanged && newSettings && document.getElementById("timer-panic-panel")) {
      const panel = document.getElementById("timer-panic-panel") as HTMLElement;
      panel.style.left = `${newSettings.panelPosition.x}px`;
      panel.style.top = `${newSettings.panelPosition.y}px`;
    }

    // Update panic modal content only when panicContent changed (not on position/minimize change)
    const panicContentChanged = !oldSettings ||
      oldSettings.panicContent !== newSettings.panicContent;
    if (panicContentChanged) {
      const panicTitle = document.getElementById("panic-title");
      const panicItems = document.getElementById("panic-items");
      if (panicTitle) {
        panicTitle.textContent = currentPanicContent.title;
      }
      if (panicItems) {
        panicItems.innerHTML = currentPanicContent.items
          .map((item: any) => `<div class="timer-panic-panic-item">• ${item}</div>`)
          .join("");
      }
    }
  }

  if (changes.timerState) {
    const newState = changes.timerState.newValue;
    if (newState) {
      currentTimerState = newState;
      const panicOpen = changes.panicModalOpen !== undefined ? changes.panicModalOpen.newValue === true : currentPanicModalOpen;
      applyBlockingDecision(isCurrentUrlBlocked(), newState, panicOpen);
    }
  }

  if (changes.panicModalOpen) {
    const open = changes.panicModalOpen.newValue === true;
    currentPanicModalOpen = open;
    if (open) {
      if (!document.getElementById("timer-panic-panel")) {
        injectFloatingPanel();
        setupEventListeners();
      }
      showPanicModalOnly();
    } else {
      hidePanicModalOnly();
    }
    applyBlockingDecision(isCurrentUrlBlocked(), currentTimerState, open);
  }
}

(window as any).__TIMER_PANIC_REINIT__ = async function() {
  try {
    const settings = await getUserSettings();
    if (!settings.panelEnabled) {
      await setUserSettings({ panelEnabled: true });
    }
    if (!document.getElementById("timer-panic-panel")) {
      injectFloatingPanel();
      setupEventListeners();
      startUpdateLoop();
    }
    // Sync panic/timer state from storage (e.g. when background re-injected us after sendMessage failed)
    if (window.chrome?.storage?.local) {
      try {
        window.chrome.storage.local.get(["timerState", "panicModalOpen"])
          .then((result: any) => {
            try {
              if (!isExtensionContextValid()) return;
              if (result?.timerState) currentTimerState = result.timerState;
              if (result?.panicModalOpen === true) {
                currentPanicModalOpen = true;
                if (!document.getElementById("timer-panic-panel")) {
                  injectFloatingPanel();
                  setupEventListeners();
                }
                showPanicModalOnly();
              } else {
                currentPanicModalOpen = false;
              }
              checkAndApplyUrlBlocking();
            } catch (e) {
              const msg = (e as Error)?.message ?? String(e);
              if (msg.includes("invalidated")) return;
              throw e;
            }
          })
          .catch(() => {});
      } catch (e) {
        if (String((e as Error)?.message ?? e).includes("invalidated")) return;
      }
    }
  } catch (e) {}
};

// Register immediately when script loads (before init completes) so background SYNC_PANIC_MODAL is never missed
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg: any) => {
    try {
      if (!isExtensionContextValid()) return;
      if (msg?.type !== "SYNC_PANIC_MODAL") return;
      const open = msg.open === true;
      currentPanicModalOpen = open;
      if (open) {
        if (!document.getElementById("timer-panic-panel")) {
          injectFloatingPanel();
          setupEventListeners();
        }
        showPanicModalOnly();
      } else {
        hidePanicModalOnly();
      }
      checkAndApplyUrlBlocking();
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (msg.includes("invalidated")) return;
      throw e;
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (e) {
      // Silently handle
    }
  });
} else {
  try {
    init();
  } catch (e) {
    // Silently handle
  }
}

} // End of double-execution prevention block
