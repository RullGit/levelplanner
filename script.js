// Storage key for localStorage
const STORAGE_KEY = 'levelingplan';
const SETTINGS_KEY = 'settings';
const CONFIG_KEY = 'config';

// HEROIC_QUESTS_BASE / EPIC_QUESTS_BASE are provided from external files (heroic.js / epic.js)
// and should be included before script.js in index.html.
if (typeof HEROIC_QUESTS_BASE === 'undefined') {
  window.HEROIC_QUESTS_BASE = [];
  console.error('HEROIC_QUESTS_BASE not found. Ensure heroic.js is included before script.js');
}
if (typeof EPIC_QUESTS_BASE === 'undefined') {
  window.EPIC_QUESTS_BASE = [];
  console.error('EPIC_QUESTS_BASE not found. Ensure epic.js is included before script.js');
}
if (typeof HEROIC_UKENBURGER_CONFIG === 'undefined') {
  window.HEROIC_UKENBURGER_CONFIG = [];
  console.warn('HEROIC_UKENBURGER_CONFIG not found. Ensure heroic_ukenburger_config.js is included before script.js');
}
if (typeof EPIC_UKENBURGER_CONFIG === 'undefined') {
  window.EPIC_UKENBURGER_CONFIG = [];
  console.warn('EPIC_UKENBURGER_CONFIG not found. Ensure epic_ukenburger_config.js is included before script.js');
}

// User-saved custom config slots — only written to when the user explicitly saves a Custom config.
window.HEROIC_CUSTOM_CONFIG = [];
window.EPIC_CUSTOM_CONFIG   = [];

// Tracks which preset is currently applied to build HEROIC_QUESTS / EPIC_QUESTS.
window.ACTIVE_QUESTS_PRESET = 'ukenburger';

// Rebuild HEROIC_QUESTS from whichever config source is currently active.
function _rebuildHeroicQuests() {
    const src = ACTIVE_QUESTS_PRESET === 'custom' ? HEROIC_CUSTOM_CONFIG : HEROIC_UKENBURGER_CONFIG;
    const cfgMap = Object.fromEntries(src.map(c => [c.name, c]));
    window.HEROIC_QUESTS = window.HEROIC_QUESTS_BASE.map(
        base => Object.assign({}, base, cfgMap[base.name] || {})
    );
}

// Rebuild EPIC_QUESTS from whichever config source is currently active.
function _rebuildEpicQuests() {
    const src = ACTIVE_QUESTS_PRESET === 'custom' ? EPIC_CUSTOM_CONFIG : EPIC_UKENBURGER_CONFIG;
    const cfgMap = Object.fromEntries(src.map(c => [c.name, c]));
    window.EPIC_QUESTS = window.EPIC_QUESTS_BASE.map(
        base => Object.assign({}, base, cfgMap[base.name] || {})
    );
}

// Initial build (default: Ukenburger)
_rebuildHeroicQuests();
_rebuildEpicQuests();

// Cache for config textarea content per mode to preserve user edits when switching
const CONFIG_TEXTAREA_CACHE = {
  heroic: null,
  epic: null
};

// Current preset in the config dropdown: 'ukenburger' or 'custom'
let CONFIG_PRESET = 'ukenburger';
// Whether the textarea content has been modified since the last preset load/save
let CONFIG_DIRTY = false;
// Whether the dirty state was caused by an automatic preset jump (used to highlight the UI)
let CONFIG_DIRTY_HIGHLIGHT = false;

// Converts a config array to the tab-separated textarea string format.
function _configToTextareaLines(configArr) {
    return configArr
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(q => {
            const travel = q.travelTime != null ? q.travelTime : '';
            const qtime  = q.qTime != null ? q.qTime : '';
            const bonus  = (q.xpMult !== null && q.xpMult !== undefined && q.xpMult !== '')
                ? Math.round(Number(q.xpMult) * 100) : '';
            const opt    = (q.optionalXP !== null && q.optionalXP !== undefined && q.optionalXP !== '')
                ? Math.round(Number(q.optionalXP) * 100) : '';
            return `${q.name}\t${travel}\t${qtime}\t${bonus}\t${opt}`;
        })
        .join('\n');
}

// Parses the tab-separated textarea text into a config array.
function _parseConfigLines(text) {
    const lines = text.split('\n');
    const result = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const name = parts[0] ? parts[0].trim() : '';
        if (!name) continue;
        const entry = { name };
        const travelRaw = parts[1] != null ? parts[1].trim() : '';
        const qtimeRaw  = parts[2] != null ? parts[2].trim() : '';
        const bonusRaw  = parts[3] != null ? parts[3].trim() : '';
        const optRaw    = parts[4] != null ? parts[4].trim() : '';
        if (travelRaw !== '') { const v = parseFloat(travelRaw); if (isFinite(v)) entry.travelTime = v; }
        if (qtimeRaw  !== '') { const v = parseFloat(qtimeRaw);  if (isFinite(v)) entry.qTime      = v; }
        if (bonusRaw  !== '') { const v = parseFloat(bonusRaw);  if (isFinite(v)) entry.xpMult     = v / 100; }
        if (optRaw    !== '') { const v = parseFloat(optRaw);    if (isFinite(v)) entry.optionalXP = v / 100; }
        result.push(entry);
    }
    return result;
}

// Marks the config as dirty (user has unsaved edits) and switches dropdown to Custom+yellow.
function _markConfigDirty() {
    CONFIG_DIRTY = true;
    CONFIG_PRESET = 'custom';
    const sel = document.getElementById('config-preset');
    if (sel) {
        const prev = sel.value;
        sel.value = 'custom';
        // Only show the yellow highlight when the preset was auto-switched
        // from something else (e.g. 'ukenburger') to 'custom'. If the user
        // was already editing a custom preset, don't highlight.
        // Use existing highlight logic but preserve an already-set highlight.
        CONFIG_DIRTY_HIGHLIGHT = CONFIG_DIRTY_HIGHLIGHT || (prev !== 'custom');
        _updateConfigPresetVisual();
    }
    const applyBtn = document.getElementById('config-apply-btn');
    if (applyBtn) {
        applyBtn.disabled = false;
    }
}

// Clears the dirty state and resets dropdown styling.
function _clearConfigDirty() {
    CONFIG_DIRTY = false;
    const sel = document.getElementById('config-preset');
    if (sel) {
        CONFIG_DIRTY_HIGHLIGHT = false;
        _updateConfigPresetVisual();
    }
    const applyBtn = document.getElementById('config-apply-btn');
    if (applyBtn) {
        applyBtn.disabled = true;
    }
}

// Update the visual styling for the config preset select and its custom option.
// - The `option[value="custom"]` is highlighted when `CONFIG_DIRTY` is true.
// - The select itself displays the highlight only when `custom` is selected
//   and `CONFIG_DIRTY` is true. This ensures `Ukenburger` keeps its default
//   appearance unless `custom` is both highlighted and selected.
function _updateConfigPresetVisual() {
    const sel = document.getElementById('config-preset');
    if (!sel) return;
    const customOpt = sel.querySelector('option[value="custom"]');
    const ukenOpt = sel.querySelector('option[value="ukenburger"]');
    if (customOpt) {
        if (CONFIG_DIRTY_HIGHLIGHT) {
            customOpt.style.backgroundColor = '#e6c200';
            customOpt.style.color = '#000';
        } else {
            customOpt.style.backgroundColor = '';
            customOpt.style.color = '';
        }
    }
    if (ukenOpt) {
        if (CONFIG_DIRTY_HIGHLIGHT) {
            // Force Ukenburger to remain visually normal while Custom is highlighted
            ukenOpt.style.backgroundColor = '#fff';
            ukenOpt.style.color = '#000';
        } else {
            ukenOpt.style.backgroundColor = '';
            ukenOpt.style.color = '';
        }
    }
    if (sel.value === 'custom' && CONFIG_DIRTY_HIGHLIGHT) {
        sel.style.backgroundColor = '#e6c200';
        sel.style.color = '#000';
    } else {
        sel.style.backgroundColor = '';
        sel.style.color = '';
    }
}

// Centralize logic for enabling/disabling the Apply button.
function _updateApplyButtonState() {
    const applyBtn = document.getElementById('config-apply-btn');
    if (!applyBtn) return;
    // Apply should be enabled when there are unsaved edits, or when the
    // selected preset differs from the currently active preset.
    applyBtn.disabled = !(CONFIG_DIRTY || CONFIG_PRESET !== ACTIVE_QUESTS_PRESET);
}

// Ensure the select updates its visuals when the user changes it,
// and enable the Apply button when the preset selection represents
// a change that can be applied (dirty textarea or preset differs).
(function attachConfigPresetListener() {
    function onChangeHandler(e) {
        const sel = e.target || document.getElementById('config-preset');
        if (!sel) return;
        const newPreset = sel.value;
        // If switching away from custom with unsaved changes, ask for confirmation
        if (CONFIG_DIRTY && CONFIG_PRESET === 'custom' && newPreset !== 'custom') {
            if (!confirm('Discard pending changes to Custom config?')) {
                // Reset the dropdown to the previous preset
                sel.value = CONFIG_PRESET;
                return;
            }
        }
        // Update in-memory preset to reflect the selection
        CONFIG_PRESET = newPreset;
        _updateConfigPresetVisual();
        _updateApplyButtonState();
    }

    function attachTo(sel) {
        // Listen to several events to cover browser differences
        sel.addEventListener('change', onChangeHandler);
        sel.addEventListener('input', onChangeHandler);
        sel.addEventListener('click', onChangeHandler);
    }

    const sel = document.getElementById('config-preset');
    if (sel) {
        attachTo(sel);
        _updateConfigPresetVisual();
        _updateApplyButtonState();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const s = document.getElementById('config-preset');
            if (s) {
                attachTo(s);
                _updateConfigPresetVisual();
                _updateApplyButtonState();
            }
        });
    }
})();

// Update visual states for the quest name column in the config overlay.
// Rules:
// - If the quest name does not appear anywhere in the textarea -> add `.missing` (red)
// - If the quest name appears somewhere but not on the same line index -> add `.mismatch` (orange)
// - If any quest name has errors, make the header red as well
function _updateConfigQuestNameHighlights(namesCol, textarea, headerEl) {
    if (!namesCol || !textarea) return;
    const nameEls = Array.from(namesCol.querySelectorAll('.config-quest-name'));
    const lines = textarea.value.split('\n');
    const normalize = s => (s || '').toString().trim().toLowerCase();
    // Extract the quest name portion (first tab-separated column) for each line
    const lineNames = lines.map(l => normalize((l || '').split('\t')[0] || ''));
    const nameToIndexes = new Map();
    lineNames.forEach((n, idx) => {
        if (!n) return;
        const arr = nameToIndexes.get(n) || [];
        arr.push(idx);
        nameToIndexes.set(n, arr);
    });

    nameEls.forEach((el, idx) => {
        const questName = normalize(el.textContent || '');
        el.classList.remove('missing', 'mismatch');
        const found = nameToIndexes.get(questName) || [];
        if (found.length === 0) {
            el.classList.add('missing');
        } else if (!found.includes(idx)) {
            el.classList.add('mismatch');
        }
    });

    // Check if any quest names have errors and update header accordingly
    const hasErrors = nameEls.some(el => el.classList.contains('missing') || el.classList.contains('mismatch'));
    if (headerEl) {
        headerEl.classList.toggle('has-errors', hasErrors);
    }
}

// Returns the active mode ('heroic' or 'epic') based on the toggle.
function getCurrentMode() {
    return document.getElementById('mode-switch')?.checked ? 'epic' : 'heroic';
}

// Returns the quest source for the active mode.
function getActiveQuests() {
    return getCurrentMode() === 'epic' ? EPIC_QUESTS : HEROIC_QUESTS;
}

const HEROIC_XP_THRESHOLDS = [
    { lvl: 1, xp: 0 },
    { lvl: 2, xp: 8000 },
    { lvl: 3, xp: 32000 },
    { lvl: 4, xp: 80000 },
    { lvl: 5, xp: 144000 },
    { lvl: 6, xp: 224000 },
    { lvl: 7, xp: 320000 },
    { lvl: 8, xp: 450000 },
    { lvl: 9, xp: 610000 },
    { lvl: 10, xp: 800000 },
    { lvl: 11, xp: 1020000 },
    { lvl: 12, xp: 1260000 },
    { lvl: 13, xp: 1520000 },
    { lvl: 14, xp: 1800000 },
    { lvl: 15, xp: 2100000 },
    { lvl: 16, xp: 2420000 },
    { lvl: 17, xp: 2750000 },
    { lvl: 18, xp: 3090000 },
    { lvl: 19, xp: 3440000 },
    { lvl: 20, xp: 3800000 }
];

const EPIC_XP_THRESHOLDS = [
    { lvl: 20, xp: 0 },
    { lvl: 21, xp: 600000 },
    { lvl: 22, xp: 1250000 },
    { lvl: 23, xp: 1950000 },
    { lvl: 24, xp: 2700000 },
    { lvl: 25, xp: 3500000 },
    { lvl: 26, xp: 4350000 },
    { lvl: 27, xp: 5250000 },
    { lvl: 28, xp: 6200000 },
    { lvl: 29, xp: 7200000 },
    { lvl: 30, xp: 8250000 }
];


function getActiveXpThresholds() {
    return getCurrentMode() === 'epic' ? EPIC_XP_THRESHOLDS : HEROIC_XP_THRESHOLDS;
}

function isTwelveTokensActive() {
    return getCurrentMode() === 'epic' && document.getElementById('twelve-tokens')?.checked === true;
}

// Look up the cumulative XP needed to reach a given character level in the
// currently-active mode. Returns undefined if the level is not in the table.
function getXpForLevel(lvl) {
    const table = getActiveXpThresholds();
    const entry = table.find(e => e.lvl === lvl);
    return entry ? entry.xp : undefined;
}

function getPlayerLevelForXP(xp) {
    const table = getActiveXpThresholds();
    for (let i = table.length - 1; i >= 0; i--) {
        if (xp >= table[i].xp) {
            return table[i].lvl;
        }
    }
    return table[0]?.lvl ?? 1;
}

// Data structure. The level plan is kept per-mode; `data.levelplan` always
// references the array for the currently-active mode (see setActiveMode()).
let data = {
    levelplanByMode: { heroic: [], epic: [] },
    levelplan: [],
    quests: [],
    special: []
};

// Switch the active mode: re-point data.levelplan at the per-mode array,
// rebuild the quests pool from the active quest source, recompute the
// xpMin table, and re-render. Does NOT save settings (caller handles that).
function setActiveMode(mode) {
    if (mode !== 'heroic' && mode !== 'epic') mode = 'heroic';
    data.levelplan = data.levelplanByMode[mode];
    rebuildQuestsFromLevelplan();
    computeXpMinTable();
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Initialize the app with data from JSON
function initializeApp() {
    // Always set up special palette (not persisted).
    data.special = [
        { name: 'Take Level', xp: 0, level: '', source: 'special', isTakeLevel: true },
        { name: 'Custom XP', xp: 0, qTime: 0, travelTime: 0, source: 'special', isCustom: true },
        { name: 'XP Pot', xp: 0, source: 'special', isXpPot: true }
    ];

    // loadSettings() must run before hydrating the level plan (and before setActiveMode())
    loadSettings();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            const heroicStored = Array.isArray(parsed?.heroic) ? parsed.heroic : [];
            const epicStored = Array.isArray(parsed?.epic) ? parsed.epic : [];
            data.levelplanByMode.heroic = hydrateLevelplan(heroicStored, HEROIC_QUESTS);
            data.levelplanByMode.epic = hydrateLevelplan(epicStored, EPIC_QUESTS);
        } catch (e) {
            console.error('Error loading data from storage:', e);
            data.levelplanByMode.heroic = [];
            data.levelplanByMode.epic = [];
        }
    }

    setActiveMode(getCurrentMode());
    checkRequirements();
    renderLists();
    setupDragListeners();
    // Measure permanent scrollbar width and expose as CSS variable so the
    
    // levelplan list-header right margin can match the scrollbar gutter.
    const lpList = document.getElementById('levelplan');
    if (lpList) {
        const sw = lpList.offsetWidth - lpList.clientWidth;
        document.documentElement.style.setProperty('--lp-scrollbar-width', sw + 'px');
    }

    // levelplan list-header right margin can match the scrollbar gutter.
    const questsList = document.getElementById('quests');
    if (questsList) {
        const sw = questsList.offsetWidth - questsList.clientWidth;
        document.documentElement.style.setProperty('--quests-scrollbar-width', sw + 'px');
    }

    // Re-render lists when XP multiplier or Speed Factor changes, and persist
    const multiplierInput = document.getElementById('xp-multiplier');
    if (multiplierInput) {
        multiplierInput.addEventListener('input', () => {
            saveSettings();
            renderLists();
        });
    }

    // Compact spinner buttons for numeric controls.
    document.querySelectorAll('.compact-spinner, .vertical-spinner').forEach(holder => {
        holder.querySelectorAll('.spin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dir = parseInt(btn.dataset.dir, 10) || 0;
                const input = holder.querySelector('.spin-input-compact');
                if (!input) return;
                const step = parseFloat(input.step) || 1;
                // If the quests level filter is empty and we're in epic mode,
                // jump to 20 on the first button press instead of starting at 0/1.
                if ((input.value === '' || input.value == null || String(input.value).trim() === '')
                    && input.id === 'quests-level-filter') {
                    if (getCurrentMode() === 'epic') {
                        input.value = dir === 1 ? 20 : 36;
                    } else {
                        input.value = dir === 1 ? 1 : 20;
                    }
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }
                const cur = parseFloat(input.value) || 0;
                const next = cur + dir * step;
                input.value = Number.isInteger(step) ? Math.round(next) : next.toFixed((step + '').includes('.') ? (step + '').split('.')[1].length : 0);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    });


    // Patron view select: populate from HEROIC_QUESTS patron fields and persist selection
    const patronSelect = document.getElementById('patron-view');
    if (patronSelect) {
        populatePatronViewSelect();
        patronSelect.addEventListener('change', () => {
            // Uncheck patron filter when switching back to "All Favors"
            if (patronSelect.value === 'None') {
                const cb = document.getElementById('quests-patron-filter');
                if (cb) cb.checked = false;
            } else {
                // Switching to a specific patron — uncheck Twelve Tokens
                const tokensCb = document.getElementById('twelve-tokens');
                if (tokensCb) tokensCb.checked = false;
            }
            saveSettings();
            renderLists();
        });
    }
    const twelveTokensCb = document.getElementById('twelve-tokens');
    if (twelveTokensCb) {
        twelveTokensCb.addEventListener('change', () => {
            if (twelveTokensCb.checked) {
                // Reset Patron View to "None" when Twelve Tokens is enabled
                const patronSel = document.getElementById('patron-view');
                if (patronSel) {
                    patronSel.value = 'None';
                }
            } else {
                // Manual uncheck: turn off the favor/patron filter checkbox
                const patronCb = document.getElementById('quests-patron-filter');
                if (patronCb) patronCb.checked = false;
            }
            saveSettings();
            renderLists();
        });
    }
    const xpminFilterInput = document.getElementById('quests-xpmin-filter');
    if (xpminFilterInput) {
        xpminFilterInput.addEventListener('input', () => {
            renderList('quests');
        });
    }
    const patronFilterCb = document.getElementById('quests-patron-filter');
    if (patronFilterCb) {
        patronFilterCb.addEventListener('change', () => { renderList('quests'); });
    }
    // VIP for Sagas checkbox — re-render both lists and persist
    const vipSagasCb = document.getElementById('vip-sagas-header');
    if (vipSagasCb) {
        vipSagasCb.addEventListener('change', () => {
            saveSettings();
            renderLists();
        });
    }
    // Heroic / Epic mode switch (UI state only, persisted)
    const modeSwitch = document.getElementById('mode-switch');
    if (modeSwitch) {
        const modeGroup = modeSwitch.closest('.mode-switch');
        const applyModeClass = () => {
            if (!modeGroup) return;
            modeGroup.classList.toggle('is-epic', modeSwitch.checked);
            modeGroup.classList.toggle('is-heroic', !modeSwitch.checked);
            const tokensLabel = document.getElementById('twelve-tokens-label');
            const tokensCb = document.getElementById('twelve-tokens');
            const patronCb = document.getElementById('quests-patron-filter');
            const patronSel = document.getElementById('patron-view');
            const patronSelected = patronSel && patronSel.value && patronSel.value !== 'None';
            const tokensWasChecked = tokensCb ? tokensCb.checked : false;
            if (tokensLabel) tokensLabel.style.display = modeSwitch.checked ? '' : 'none';
            if (!modeSwitch.checked) {
                // switching to heroic: hide tokens and clear the tokens checkbox
                if (tokensCb) tokensCb.checked = false;
                // Only clear the favor/patron filter if Twelve Tokens was active
                // (so the filter checkbox was being used for tokens) and no
                // patron is selected — otherwise leave the patron filter alone.
                if (tokensWasChecked && patronCb && !patronSelected) {
                    patronCb.checked = false;
                }
            }
        };
        applyModeClass();
        modeSwitch.addEventListener('change', () => {
            applyModeClass();
            saveSettings();
            setActiveMode(getCurrentMode());
            // Clear quest filters when switching modes
            const levelInput = document.getElementById('quests-level-filter');
            if (levelInput) levelInput.value = '';
            const nameInput = document.getElementById('quests-name-filter');
            if (nameInput) nameInput.value = '';
            const xpminInput = document.getElementById('quests-xpmin-filter');
            if (xpminInput) xpminInput.value = '';
            renderLists();
            setupDragListeners();
        });
    }
    const xpminClearBtn = document.getElementById('quests-xpmin-clear');
    if (xpminClearBtn) {
        xpminClearBtn.addEventListener('click', () => {
            const input = document.getElementById('quests-xpmin-filter');
            if (input) { input.value = ''; renderList('quests'); }
        });
    }
    const levelFilterInput = document.getElementById('quests-level-filter');
    if (levelFilterInput) {
        levelFilterInput.addEventListener('input', () => { renderList('quests'); });
    }
    const levelClearBtn = document.getElementById('quests-level-clear');
    if (levelClearBtn) {
        levelClearBtn.addEventListener('click', () => {
            const input = document.getElementById('quests-level-filter');
            if (input) { input.value = ''; renderList('quests'); }
        });
    }
    const nameFilterInput = document.getElementById('quests-name-filter');
    if (nameFilterInput) {
        nameFilterInput.addEventListener('input', () => { renderList('quests'); });
    }
    const nameClearBtn = document.getElementById('quests-name-clear');
    if (nameClearBtn) {
        nameClearBtn.addEventListener('click', () => {
            const input = document.getElementById('quests-name-filter');
            if (input) { input.value = ''; renderList('quests'); }
        });
    }
    // Config mode switch (Heroic / Epic slider)
    const configModeSwitch = document.getElementById('config-mode-switch');
    if (configModeSwitch) {
        configModeSwitch.addEventListener('change', () => {
            // 'change' fires after the checkbox toggles; previous mode is the opposite of current
            const newMode = _getConfigMode();
            const previousMode = newMode === 'epic' ? 'heroic' : 'epic';
            const currentTextarea = document.querySelector('.config-quest-textarea');
            if (currentTextarea) {
                CONFIG_TEXTAREA_CACHE[previousMode] = currentTextarea.value;
            }
            _syncConfigModeSwitch();
            renderConfigList();
        });
    }
    // Config preset dropdown (Ukenburger / Custom)
    const configPresetSelect = document.getElementById('config-preset');
    if (configPresetSelect) {
        configPresetSelect.addEventListener('change', () => {
            const newPreset = configPresetSelect.value;
            if (newPreset === 'ukenburger') {
                CONFIG_TEXTAREA_CACHE.heroic = _configToTextareaLines(HEROIC_UKENBURGER_CONFIG);
                CONFIG_TEXTAREA_CACHE.epic   = _configToTextareaLines(EPIC_UKENBURGER_CONFIG);
            } else {
                // If no custom config saved yet, fall back to ukenburger as a starting point
                CONFIG_TEXTAREA_CACHE.heroic = _configToTextareaLines(
                    HEROIC_CUSTOM_CONFIG.length > 0 ? HEROIC_CUSTOM_CONFIG : HEROIC_UKENBURGER_CONFIG
                );
                CONFIG_TEXTAREA_CACHE.epic   = _configToTextareaLines(
                    EPIC_CUSTOM_CONFIG.length > 0 ? EPIC_CUSTOM_CONFIG : EPIC_UKENBURGER_CONFIG
                );
            }
            CONFIG_PRESET = newPreset;
            _clearConfigDirty();
            renderConfigList();
        });
    }
}

// Per-level xpMin thresholds computed by accumulating XP (best-first) up to 75%
// and 200% of the XP span for the pool range. Populated by computeXpMinTable().
window.XPMIN_THRESHOLDS_BY_LEVEL = {};

// Cache for the computed XP/min table, keyed by mode. Set to null to force recompute.
const _xpMinTableCache = { heroic: null, epic: null };

// Pool ranges and XP span for each quest level. Both the candidate quest pool
// and the xpNeeded (xp[poolMax] - xp[poolMin]) use the same range.
const HEROIC_POOL_RANGES = {
     1: { poolMin:  1, poolMax:  3 },
     2: { poolMin:  1, poolMax:  4 },
     3: { poolMin:  1, poolMax:  5 },
     4: { poolMin:  2, poolMax:  6 },
     5: { poolMin:  3, poolMax:  7 },
     6: { poolMin:  4, poolMax:  8 },
     7: { poolMin:  5, poolMax:  9 },
     8: { poolMin:  6, poolMax: 10 },
     9: { poolMin:  7, poolMax: 11 },
    10: { poolMin:  8, poolMax: 12 },
    11: { poolMin:  9, poolMax: 13 },
    12: { poolMin: 10, poolMax: 14 },
    13: { poolMin: 11, poolMax: 15 },
    14: { poolMin: 12, poolMax: 16 },
    15: { poolMin: 13, poolMax: 17 },
    16: { poolMin: 14, poolMax: 18 },
    17: { poolMin: 15, poolMax: 19 },
    18: { poolMin: 16, poolMax: 20 },
    19: { poolMin: 16, poolMax: 20 },
    20: { poolMin: 16, poolMax: 20 },
};

// Pool ranges and XP span for each quest level. Both the candidate quest pool
// and the xpNeeded (xp[poolMax] - xp[poolMin]) use the same range.
const EPIC_POOL_RANGES = {
     20: { poolMin: 20, poolMax:  29 },
     21: { poolMin: 20, poolMax:  29 },
     22: { poolMin: 20, poolMax:  29 },
     23: { poolMin: 20, poolMax:  29 },
     24: { poolMin: 20, poolMax:  29 },
     25: { poolMin: 21, poolMax:  29 },
     26: { poolMin: 22, poolMax:  36 },
     27: { poolMin: 23, poolMax:  36 },
     28: { poolMin: 24, poolMax: 36 },
     29: { poolMin: 25, poolMax: 36 },
     30: { poolMin: 25, poolMax: 36 },
     31: { poolMin: 25, poolMax: 36 },
     32: { poolMin: 25, poolMax: 36 },
     33: { poolMin: 25, poolMax: 36 },
     34: { poolMin: 25, poolMax: 36 },
     35: { poolMin: 25, poolMax: 36 },
     36: { poolMin: 25, poolMax: 36 }
};

// Compute a table of aggregate xpMin per level at two XP-accumulation thresholds.
// Pool range and xpNeeded both come from HEROIC_POOL_RANGES.
// Quests are ranked by individual xpMin (best first) and XP is accumulated until
// reaching 150% (xpminThresholdGood) and 300% (xpminThresholdDecent) of xpNeeded.
// The aggregate xpMin at each crossing = sum(xp) / sum(effectiveTime).
function computeXpMinTable() {
    const mode = getCurrentMode();
    if (_xpMinTableCache[mode] !== null) {
        window.XPMIN_THRESHOLDS_BY_LEVEL = _xpMinTableCache[mode];
        return;
    }

    const activeQuests = getActiveQuests();
    const poolRanges = mode === 'epic' ? EPIC_POOL_RANGES : HEROIC_POOL_RANGES;
    const levels = [...new Set(activeQuests.map(q => q.lvl))].filter(l => l != null && l > 0).sort((a, b) => a - b);

    window.XPMIN_THRESHOLDS_BY_LEVEL = {};
    const rows = [];

    for (const level of levels) {
        const range = poolRanges[level];
        if (!range) continue;
        const { poolMin, poolMax } = range;

        // XP span: xp at poolMax level minus xp at poolMin level, looked up
        // in the active mode's XP threshold table. Clamp pool bounds to the
        // table's range so pool ranges that extend past the available levels
        // (e.g. epic ranges go to lvl 36 but EPIC_XP_THRESHOLDS stops at 30)
        // still produce a usable XP span.
        const xpTable = getActiveXpThresholds();
        const tableMin = xpTable[0].lvl;
        const tableMax = xpTable[xpTable.length - 1].lvl;
        const clampedMin = Math.max(poolMin, tableMin);
        const clampedMax = Math.min(poolMax, tableMax);
        const xpLowVal  = getXpForLevel(clampedMin);
        const xpHighVal = getXpForLevel(clampedMax);
        if (xpLowVal === undefined || xpHighVal === undefined) continue;
        const xpNeeded = xpHighVal - xpLowVal;
        if (xpNeeded <= 0) continue;

        // Candidate pool: valid quests within the pool range
        const candidates = activeQuests.filter(q => {
            if (q.lvl === undefined || q.lvl === null) return false;
            if (q.lvl < poolMin || q.lvl > poolMax) return false;
            if (!q.xp || q.xp <= 0) return false;
            const effectiveTime = (q.qTime || 0) + (q.travelTime || 0);
            return effectiveTime > 0;
        }).map(q => {
            const effectiveTime = (q.qTime || 0) + (q.travelTime || 0);
            return { name: q.name, xp: q.xp, effectiveTime, xpMin: q.xp / effectiveTime };
        });

        if (candidates.length === 0) continue;

        // Sort by individual xpMin descending (best quests first)
        candidates.sort((a, b) => b.xpMin - a.xpMin);

        // Walk from best to worst, recording the aggregate xpMin when cumulative
        // XP first crosses 150% and 300% of xpNeeded.
        const xpThresholds = mode === 'epic' ? [0.75 * xpNeeded, 1.5 * xpNeeded] : [1.5 * xpNeeded, 3.0 * xpNeeded];
        const results = {};
        let cumXP = 0, cumTime = 0, ti = 0;
        for (const q of candidates) {
            cumXP += q.xp;
            cumTime += q.effectiveTime;
            while (ti < xpThresholds.length && cumXP >= xpThresholds[ti]) {
                results[ti] = cumTime > 0 ? Math.round(cumXP / cumTime) : 0;
                ti++;
            }
            if (ti >= xpThresholds.length) break;
        }
        // Fill any thresholds not reached (pool covers less XP than needed)
        while (ti < xpThresholds.length) {
            results[ti] = cumTime > 0 ? Math.round(cumXP / cumTime) : 0;
            ti++;
        }

        rows.push({
            level,
            poolMin,
            poolMax,
            xpNeeded,
            questsInPool: candidates.length,
            xpminThresholdGood: results[0],
            xpminThresholdDecent: results[1]
        });
        window.XPMIN_THRESHOLDS_BY_LEVEL[level] = {
            xpminThresholdGood: results[0],
            xpminThresholdDecent: results[1]
        };
    }

    _xpMinTableCache[mode] = window.XPMIN_THRESHOLDS_BY_LEVEL;

    console.log('=== XP/min table by level ===');
    console.table(rows);
}

// Reset the level plan for the currently active mode (the other mode is left intact).
function loadInitialData() {
    const mode = getCurrentMode();
    data.levelplanByMode[mode] = [];
    data.levelplan = data.levelplanByMode[mode];
    rebuildQuestsFromLevelplan();
    data.special = [
        { name: 'Take Level', xp: 0, level: '', source: 'special', isTakeLevel: true },
        { name: 'Custom XP', xp: 0, qTime: 0, travelTime: 0, source: 'special', isCustom: true },
        { name: 'XP Pot', xp: 0, source: 'special', isXpPot: true }
    ];
    saveToStorage();
}

// Rebuild data.quests from the active quest source, excluding any quest currently in the levelplan.
// Elite copies do NOT remove the original from quests (they are independent copies).
function rebuildQuestsFromLevelplan() {
    const lpNames = new Set(
        data.levelplan
            .filter(i => !i.isTakeLevel && !i.isCustom && !i.isXpPot && !i.isXpPotStart && !i.isXpPotEnd && !i.isEliteCopy && i.name !== undefined)
            .map(i => i.name)
    );
    data.quests = getActiveQuests()
        .map((q, i) => ({ ...q, id: i, source: 'quests' }))
        .filter(q => !lpNames.has(q.name));
}

// Hydrate a stored (minimal) levelplan array into full item objects, using the
// supplied quest source as the source of truth for all derivable fields.
function hydrateLevelplan(stored, questSource) {
    const source = questSource || getActiveQuests();
    const initialByName = new Map(source.map(q => [q.name, q]));
    return stored.map(entry => {
        if (entry.takeLevel) {
            return { name: 'Take Level', xp: 0, level: '', source: 'special', isTakeLevel: true };
        }
        if (entry.xpPotStart) {
            return { name: 'Start XP Pot', source: 'special', isXpPotStart: true, ...(entry.pct != null ? { pct: entry.pct } : {}) };
        }
        if (entry.xpPotEnd) {
            return { name: 'End XP Pot', source: 'special', isXpPotEnd: true, ...(entry.pct != null ? { pct: entry.pct } : {}) };
        }
        if (entry.xpPot) {
            return { name: 'XP Pot', xp: 0, source: 'special', isXpPot: true };
        }
        if (entry.custom) {
            return {
                name: entry.name || 'Custom XP',
                xp: entry.xp || 0,
                qTime: entry.qTime || 0,
                travelTime: 0,
                source: 'special',
                isCustom: true
            };
        }

        const base = initialByName.get(entry.name);
        if (!base) return null; // unknown quest — drop silently

        if (entry.elite) {
            const eliteXP = Math.round(base.baseXP * (1 + base.xpMult + base.optionalXP - 1.7));
            return { ...base, name: base.name + ' (repeat)', xp: eliteXP, travelTime: 0.0, isEliteCopy: true, difficulty: 'E', source: 'quests', patron: null, favor: null };
        }
        const id = source.indexOf(base);
        return { ...base, id, source: 'quests' };
    }).filter(Boolean);
}

// Check that every requirement name resolves to a known quest name within the
// same mode. Cross-mode requirements (an epic quest depending on a heroic
// quest or vice-versa) are considered broken and will be reported.
function checkRequirements() {
    const heroicNames = new Set(HEROIC_QUESTS_BASE.map(q => q.name));
    const epicNames = new Set(EPIC_QUESTS_BASE.map(q => q.name));
    const broken = []; // { quest, reqName, mode, foundIn }

    // Validate heroic quests reference only heroic requirements
    for (const quest of HEROIC_QUESTS_BASE) {
        if (!Array.isArray(quest.requirements)) continue;
        for (const reqName of quest.requirements) {
            if (!heroicNames.has(reqName)) {
                const foundIn = epicNames.has(reqName) ? 'epic' : null;
                broken.push({ quest: quest.name, reqName, mode: 'heroic', foundIn });
            }
        }
    }

    // Validate epic quests reference only epic requirements
    for (const quest of EPIC_QUESTS_BASE) {
        if (!Array.isArray(quest.requirements)) continue;
        for (const reqName of quest.requirements) {
            if (!epicNames.has(reqName)) {
                const foundIn = heroicNames.has(reqName) ? 'heroic' : null;
                broken.push({ quest: quest.name, reqName, mode: 'epic', foundIn });
            }
        }
    }

    if (broken.length === 0) return;

    // Build a visible banner
    const banner = document.createElement('div');
    banner.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
        'background:#b00020', 'color:#fff', 'font-family:monospace',
        'font-size:13px', 'padding:12px 16px', 'box-shadow:0 4px 12px rgba(0,0,0,.5)',
        'white-space:pre-wrap', 'max-height:40vh', 'overflow-y:auto'
    ].join(';');

    const lines = [
        `⚠ BROKEN PREREQS DETECTED (${broken.length}) — fix quest files`,
        ''
    ];
    for (const b of broken) {
        let note = `  "${b.quest}"\n    → unknown prereq: "${b.reqName}"`;
        if (b.mode === 'epic') {
            note += b.foundIn === 'heroic'
                ? ' (found in heroic.js; epic quests must only require epic quests)'
                : ' (not found in epic.js)';
        } else {
            note += b.foundIn === 'epic'
                ? ' (found in epic.js; heroic quests must only require heroic quests)'
                : ' (not found in heroic.js)';
        }
        lines.push(note);
    }

    banner.textContent = lines.join('\n');

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Dismiss';
    closeBtn.style.cssText = 'float:right;background:#fff;color:#b00020;border:none;padding:4px 10px;cursor:pointer;font-weight:bold;margin-left:16px;';
    closeBtn.onclick = () => banner.remove();
    banner.prepend(closeBtn);

    document.body.prepend(banner);
    console.error('Broken prereqs:', broken);
}

// Save/load the xp-multiplier input to/from localStorage
function saveSettings() {
    const xpMult = document.getElementById('xp-multiplier')?.value;
    const patronView = document.getElementById('patron-view')?.value || 'None';
    const mode = document.getElementById('mode-switch')?.checked ? 'epic' : 'heroic';
    const vipSagas = document.getElementById('vip-sagas-header')?.checked ? true : false;
    const twelveTokens = document.getElementById('twelve-tokens')?.checked ? true : false;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ xpMultiplier: xpMult, patronView, mode, vipSagas, twelveTokens }));
    // Persist custom config and active preset separately
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
        activePreset: ACTIVE_QUESTS_PRESET,
        heroicCustomConfig: HEROIC_CUSTOM_CONFIG,
        epicCustomConfig: EPIC_CUSTOM_CONFIG
    }));
}

function loadSettings() {
    // Restore custom config and active preset first so quest lists build correctly
    const rawConfig = localStorage.getItem(CONFIG_KEY);
    if (rawConfig) {
        try {
            const { activePreset, heroicCustomConfig, epicCustomConfig } = JSON.parse(rawConfig);
            if (Array.isArray(heroicCustomConfig)) window.HEROIC_CUSTOM_CONFIG = heroicCustomConfig;
            if (Array.isArray(epicCustomConfig))   window.EPIC_CUSTOM_CONFIG   = epicCustomConfig;
            if (activePreset === 'custom' || activePreset === 'ukenburger') {
                window.ACTIVE_QUESTS_PRESET = activePreset;
            }
            _rebuildHeroicQuests();
            _rebuildEpicQuests();
        } catch (e) { /* ignore corrupt config */ }
    }

    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
        const { xpMultiplier, patronView, favorView, mode, vipSagas, twelveTokens } = JSON.parse(raw);
        const xpInput = document.getElementById('xp-multiplier');
        const pvSelect = document.getElementById('patron-view');
        const modeSwitch = document.getElementById('mode-switch');
        const vipCb = document.getElementById('vip-sagas-header');
        const tokensCb = document.getElementById('twelve-tokens');
        const tokensLabel = document.getElementById('twelve-tokens-label');
        if (vipCb && vipSagas !== undefined) vipCb.checked = vipSagas;
        if (xpInput && xpMultiplier !== undefined) xpInput.value = xpMultiplier;
        const pv = patronView !== undefined ? patronView : favorView;
        if (pvSelect && pv !== undefined) pvSelect.value = pv;
        if (modeSwitch && mode !== undefined) {
            modeSwitch.checked = (mode === 'epic');
            const grp = modeSwitch.closest('.mode-switch');
            if (grp) {
                grp.classList.toggle('is-epic', modeSwitch.checked);
                grp.classList.toggle('is-heroic', !modeSwitch.checked);
            }
            if (tokensLabel) tokensLabel.style.display = modeSwitch.checked ? '' : 'none';
        }
        if (tokensCb && twelveTokens !== undefined) tokensCb.checked = twelveTokens;
    } catch (e) { /* ignore corrupt settings */ }
}

// Populate the patron-view <select> from the unique patron values across both modes.
function populatePatronViewSelect() {
    const select = document.getElementById('patron-view');
    if (!select) return;
    // Collect unique string patron values from both heroic and epic quests, excluding null/undefined
    const patrons = Array.from(new Set(
        [...HEROIC_QUESTS_BASE, ...EPIC_QUESTS_BASE]
            .map(q => q.patron)
            .filter(f => f !== null && f !== undefined && f !== '' && f !== 'None')
    ));
    // Sort numerically when possible
    patrons.sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b));
    });
    // Remove existing options except the default 'None' and 'All' options
    for (let i = select.options.length - 1; i >= 0; i--) {
        const v = select.options[i].value;
        if (v === 'None' || v === 'All') continue;
        select.remove(i);
    }
    // Ensure 'All' option exists (insert after 'None')
    if (![...select.options].some(o => o.value === 'All')) {
        const allOpt = document.createElement('option');
        allOpt.value = 'All';
        allOpt.textContent = 'All';
        if (select.options.length > 1) select.add(allOpt, select.options[1]);
        else select.appendChild(allOpt);
    }
    for (const f of patrons) {
        const opt = document.createElement('option');
        opt.value = String(f);
        opt.textContent = String(f);
        select.appendChild(opt);
    }
    if (!select.value) select.value = 'None';
}

// Return the total favor accumulated in the HEROIC level plan for a given patron.
// Used when in epic mode to seed cumulative favor and display the heroic base.
function getHeroicFavorForPatron(patron) {
    if (!patron || patron === 'None') return 0;
    const heroicPlan = (data && data.levelplanByMode && Array.isArray(data.levelplanByMode.heroic)) ? data.levelplanByMode.heroic : [];
    // Special-case 'All' to return the total heroic favor across all patrons
    if (patron === 'All') {
        return heroicPlan.reduce((sum, it) => {
            if (!it || it.isTakeLevel || it.isXpPot || it.isXpPotStart || it.isXpPotEnd) return sum;
            if (it.favor != null && it.favor !== '') {
                const fv = Number(it.favor);
                return sum + (isFinite(fv) ? fv : 0);
            }
            return sum;
        }, 0);
    }
    return heroicPlan.reduce((sum, it) => {
        if (!it || it.isTakeLevel || it.isXpPot || it.isXpPotStart || it.isXpPotEnd) return sum;
        if (it.patron === patron && it.favor != null && it.favor !== '') {
            const fv = Number(it.favor);
            return sum + (isFinite(fv) ? fv : 0);
        }
        return sum;
    }, 0);
}

// NOTE: name normalization removed — matching is exact or via heroicEquivalent.

// Returns true if the heroic levelplan contains a quest matching the given item.
// Matches only by exact name or by the epic item's `heroicEquivalent` property.
// Accepts an optional precomputed `heroicNames` Set to avoid rebuilding it per-item.
function hasHeroicDuplicateForItem(item, heroicNames) {
    if (!item) return false;
    if (!heroicNames) {
        const heroicPlan = (data && data.levelplanByMode && Array.isArray(data.levelplanByMode.heroic)) ? data.levelplanByMode.heroic : [];
        if (!heroicPlan || heroicPlan.length === 0) return false;
        heroicNames = new Set(
            heroicPlan
                .filter(h => h && !h.isTakeLevel && !h.isCustom && !h.isXpPot && !h.isXpPotStart && !h.isXpPotEnd && h.name !== undefined)
                .map(h => h.name)
                .filter(Boolean)
        );
    }

    if (heroicNames.has(item.name)) return true;
    if (item.heroicEquivalent && heroicNames.has(item.heroicEquivalent)) return true;
    return false;
}

// Serialise a single levelplan array to its minimal storage form.
function serialiseLevelplan(levelplan) {
    return levelplan.map(item => {
        if (item.isTakeLevel) return { takeLevel: true };
        if (item.isXpPotStart) return item.pct != null ? { xpPotStart: true, pct: item.pct } : { xpPotStart: true };
        if (item.isXpPotEnd) return item.pct != null ? { xpPotEnd: true, pct: item.pct } : { xpPotEnd: true };
        if (item.isXpPot) return { xpPot: true };
        if (item.isCustom) {
            return {
                custom: true,
                name: item.name,
                xp: item.xp,
                qTime: item.qTime
            };
        }
        if (item.isEliteCopy) {
            const baseName = item.name.endsWith(' (repeat)')
                ? item.name.slice(0, -' (repeat)'.length)
                : item.name;
            return { name: baseName, elite: true };
        }
        return { name: item.name };
    });
}

// Save data to localStorage. Both heroic and epic level plans are persisted
// under the same key, in their minimal form (see serialiseLevelplan()).
function saveToStorage() {
    const payload = {
        heroic: serialiseLevelplan(data.levelplanByMode.heroic),
        epic: serialiseLevelplan(data.levelplanByMode.epic)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

// Save both minimal levelplans (heroic + epic) to a downloadable JSON file.
function saveToFile() {
    const output = {
        xpMultiplier: parseFloat(document.getElementById('xp-multiplier')?.value) || 1.15,
        configPreset: ACTIVE_QUESTS_PRESET,
        heroic: serialiseLevelplan(data.levelplanByMode.heroic),
        epic: serialiseLevelplan(data.levelplanByMode.epic)
    };

    if (ACTIVE_QUESTS_PRESET === 'custom') {
        if (confirm('Store your custom config in this file?')) {
            output.heroicCustomConfig = HEROIC_CUSTOM_CONFIG;
            output.epicCustomConfig   = EPIC_CUSTOM_CONFIG;
        }
    }

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'levelplan.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Load a saved JSON file and replace both level plans (heroic + epic).
function loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed || (!Array.isArray(parsed.heroic) && !Array.isArray(parsed.epic))) {
                    throw new Error('Unrecognised file format');
                }

                const filePreset = parsed.configPreset; // 'ukenburger', 'custom', or undefined (old file)
                const fileHasCustomConfig = Array.isArray(parsed.heroicCustomConfig) && parsed.heroicCustomConfig.length > 0;
                const userHasCustomConfig = HEROIC_CUSTOM_CONFIG.length > 0 || EPIC_CUSTOM_CONFIG.length > 0;

                // Helper: persist config changes to localStorage
                const _persistConfig = () => localStorage.setItem(CONFIG_KEY, JSON.stringify({
                    activePreset: ACTIVE_QUESTS_PRESET,
                    heroicCustomConfig: HEROIC_CUSTOM_CONFIG,
                    epicCustomConfig: EPIC_CUSTOM_CONFIG
                }));

                if (filePreset === 'ukenburger' && ACTIVE_QUESTS_PRESET === 'custom') {
                    // File used Ukenburger but user currently has Custom active
                    if (confirm('This plan was created with the Ukenburger config. Switch to Ukenburger?')) {
                        window.ACTIVE_QUESTS_PRESET = 'ukenburger';
                        _rebuildHeroicQuests();
                        _rebuildEpicQuests();
                        _persistConfig();
                    }
                    // else: load using current custom config

                } else if (filePreset === 'custom' && fileHasCustomConfig) {
                    const fileConfigStr = JSON.stringify({ h: parsed.heroicCustomConfig, e: parsed.epicCustomConfig || [] });
                    const userConfigStr = JSON.stringify({ h: HEROIC_CUSTOM_CONFIG, e: EPIC_CUSTOM_CONFIG });

                    if (!userHasCustomConfig) {
                        // User has no custom config yet — silently adopt the file's config
                        window.HEROIC_CUSTOM_CONFIG = parsed.heroicCustomConfig;
                        window.EPIC_CUSTOM_CONFIG   = Array.isArray(parsed.epicCustomConfig) ? parsed.epicCustomConfig : [];
                        window.ACTIVE_QUESTS_PRESET = 'custom';
                        _rebuildHeroicQuests();
                        _rebuildEpicQuests();
                        _persistConfig();

                    } else if (fileConfigStr !== userConfigStr) {
                        // User already has a different custom config — ask
                        const choice = await _showChoiceDialog(
                            'A custom config was used to create this leveling plan.',
                            [
                                { label: 'Overwrite my custom config', value: 'overwrite' },
                                { label: 'Export my custom config before loading', value: 'export' },
                                { label: 'Use my current config', value: 'keep' }
                            ]
                        );
                        if (choice === 'export') {
                            _exportCustomConfigToFile();
                        }
                        if (choice === 'overwrite' || choice === 'export') {
                            window.HEROIC_CUSTOM_CONFIG = parsed.heroicCustomConfig;
                            window.EPIC_CUSTOM_CONFIG   = Array.isArray(parsed.epicCustomConfig) ? parsed.epicCustomConfig : [];
                            window.ACTIVE_QUESTS_PRESET = 'custom';
                            _rebuildHeroicQuests();
                            _rebuildEpicQuests();
                            _persistConfig();
                        }
                        // 'keep': load with current config unchanged
                    }
                    // else configs are identical — load normally
                }
                // All other cases (no filePreset, ukenburger+ukenburger, custom without included config): load normally

                const xpInput = document.getElementById('xp-multiplier');
                if (xpInput && parsed.xpMultiplier !== undefined) xpInput.value = parsed.xpMultiplier;
                saveSettings();

                data.levelplanByMode.heroic = hydrateLevelplan(
                    Array.isArray(parsed.heroic) ? parsed.heroic : [],
                    HEROIC_QUESTS
                );
                data.levelplanByMode.epic = hydrateLevelplan(
                    Array.isArray(parsed.epic) ? parsed.epic : [],
                    EPIC_QUESTS
                );
                setActiveMode(getCurrentMode());
                saveToStorage();
                renderLists();
                ensureHighlightStyle();
                highlightInserted(data.levelplan.filter(i => i.name).map(i => i.name));
            } catch (err) {
                alert('Error loading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

// Build a map of all items by name across quests and levelplan
function buildAllItemsByName() {
    const map = new Map();
    [...data.quests, ...data.levelplan].forEach(item => {
        if (item.name !== undefined) map.set(item.name, item);
    });
    return map;
}

// Collect item + all requirements not already in levelplan (recursive)
function collectItemsForXpMin(item, levelplanNameSet, allItemsByName) {
    const collected = [];
    const visited = new Set();
    function collect(it) {
        if (!it || it.name === undefined || visited.has(it.name)) return;
        visited.add(it.name);
        collected.push(it);
        if (Array.isArray(it.requirements)) {
            for (const reqName of it.requirements) {
                if (!levelplanNameSet.has(reqName)) {
                    collect(allItemsByName.get(reqName));
                }
            }
        }
    }
    collect(item);
    return collected;
}

// Render all lists
function renderLists() {
    renderList('levelplan');
    renderList('quests');
    renderList('special');
}
function renderList(listId) {
    const multiplier = parseFloat(document.getElementById('xp-multiplier')?.value) || 1.15;
    const patronView = document.getElementById('patron-view')?.value || 'None';
    const favorActive = patronView && patronView !== 'None';
    const tokensActive = isTwelveTokensActive();
    const listsContainer = document.querySelector('.lists-container');
    if (listsContainer) listsContainer.classList.toggle('favor-active', !!(favorActive || tokensActive));

    // When in epic mode and a patron is selected, include the total HEROIC
    // favor for that patron as a base. Show that heroic base in the header
    // so the user sees the starting favor (e.g. "Favor\n66").
    let heroBaseFavor = 0;
    if (getCurrentMode() === 'epic' && favorActive) {
        heroBaseFavor = getHeroicFavorForPatron(patronView);
    }
    const headerFavorContainer = document.querySelector('.list-section.levelplan .list-header .col-cumfavor');
    if (headerFavorContainer) {
        if (tokensActive) {
            headerFavorContainer.innerHTML = '<span class="col-header-label">Tokens</span>';
        } else if (getCurrentMode() === 'epic' && favorActive) {
            headerFavorContainer.innerHTML = '<span class="col-header-label">Favor</span><span class="col-header-label col-header-value">' + safeToLocaleString(heroBaseFavor) + '</span>';
        } else {
            headerFavorContainer.innerHTML = '<span class="col-header-label">Favor</span>';
        }
    }
    const lpColFavorLabel = document.querySelector('.list-section.levelplan .lp-col-favor .col-header-label');
    if (lpColFavorLabel) lpColFavorLabel.textContent = tokensActive ? 'Tokens' : 'Favor';
    const questsColFavorLabel = document.querySelector('.list-section.quests .col-favor .col-header-label');
    if (questsColFavorLabel) questsColFavorLabel.textContent = tokensActive ? 'Tokens' : 'Favor';
    // filter checkbox always visible; its meaning adapts (tokens vs patron)
    const listElement = document.getElementById(listId);
    const items = data[listId] || [];
    const hasLevelupItems = items.some(item => item.isTakeLevel);

    listElement.innerHTML = '';

    if (items.length === 0) {
        listElement.innerHTML = '<div class="empty-message">No quests yet. Add a quest with ← or drag one from the available quests.</div>';
        if (listId === 'levelplan') renderLevelplanFooter();
        return;
    }

    const levelplanNameSet = new Set(data.levelplan.filter(i => i.name !== undefined).map(i => i.name));
    const allItemsByName = buildAllItemsByName();
    // Compute heroic names once per render to avoid rebuilding per-item.
    let heroicNamesSet = null;
    if (getCurrentMode() === 'epic') {
        const heroicPlan = (data && data.levelplanByMode && Array.isArray(data.levelplanByMode.heroic)) ? data.levelplanByMode.heroic : [];
        if (heroicPlan && heroicPlan.length > 0) {
            heroicNamesSet = new Set(
                heroicPlan
                    .filter(h => h && !h.isTakeLevel && !h.isCustom && !h.isXpPot && !h.isXpPotStart && !h.isXpPotEnd && h.name !== undefined)
                    .map(h => h.name)
                    .filter(Boolean)
            );
        }
    }

    // For levelplan: build a reverse-dependency map. For each item A in the
    // levelplan, dependents.get(A.name) is the array of items B (also in the
    // levelplan) that transitively require A. Built once per render.
    const dependents = new Map();
    if (listId === 'levelplan') {
        data.levelplan.forEach(b => {
            if (!b || b.name === undefined || b.isTakeLevel || b.isCustom || b.isXpPot || b.isXpPotStart || b.isXpPotEnd) return;
            const visited = new Set();
            const stack = [b];
            while (stack.length) {
                const cur = stack.pop();
                if (!cur || !Array.isArray(cur.requirements)) continue;
                for (const reqName of cur.requirements) {
                    if (visited.has(reqName)) continue;
                    visited.add(reqName);
                    const reqItem = allItemsByName.get(reqName);
                    if (reqItem) stack.push(reqItem);
                }
            }
            visited.forEach(reqName => {
                if (!levelplanNameSet.has(reqName)) return;
                if (!dependents.has(reqName)) dependents.set(reqName, []);
                dependents.get(reqName).push(b);
            });
        });
    }

    let cumulativeXP = 0;
    let cumulativeFavor = (listId === 'levelplan' && getCurrentMode() === 'epic' && favorActive && !tokensActive) ? heroBaseFavor : 0;
    // Start player at the current base level (depends on mode), so the first "Take Level" increments correctly
    let levelupCount = getPlayerLevelForXP(0);
    // Percentage bonus from the currently active XP pot (0 when no pot is active).
    // Applied additively to the multiplier for cumulative XP only.
    let activePotPct = 0;
    const rowData = items.map((item, index) => {
        const row = { item, dataIndex: index, cumulativeXP: '', cumulativeFavor: '', playerLevel: '', displayName: item.name };
        if (listId === 'levelplan') {
            const calculatedLevel = getPlayerLevelForXP(cumulativeXP);
            if (item.isTakeLevel) {
                levelupCount += 1;
                row.displayName = `Take level ${levelupCount}`;
                row.playerLevelWarning = levelupCount > calculatedLevel ? 2 : 0;
            } else if (item.isXpPot || item.isXpPotStart || item.isXpPotEnd) {
                // XP Pot markers: no XP, treated as no-op placeholders.
                // Update the active pot percentage so subsequent quests use it.
                if (item.isXpPotStart) activePotPct = item.pct != null ? item.pct : 0;
                if (item.isXpPotEnd) activePotPct = 0;
                row.cumulativeXP = cumulativeXP;
            } else {
                // For cumulative XP the pot bonus is added to the multiplier (additive).
                // Displayed XP (xpMin, tooltip, color) keeps using `multiplier` unchanged.
                const cumMultiplier = multiplier + activePotPct / 100;
                const xpValue = item.isCustom ? 
                    (item.applyMultipliers ? Math.round((item.xp || 0) * cumMultiplier) : (item.xp || 0)) 
                    : Math.round(item.xp * cumMultiplier);
                cumulativeXP += xpValue;
                row.cumulativeXP = cumulativeXP;
                // Determine whether this quest's favor/tokens should be counted.
                let favorIgnored = false;
                if (tokensActive) {
                    if (item.tokens != null) cumulativeFavor += (typeof item.tokens === 'number' ? item.tokens : 0);
                    row.cumulativeFavor = cumulativeFavor;
                } else if (favorActive && (patronView === 'All' || item.patron === patronView) && typeof item.favor === 'number') {
                    if (getCurrentMode() === 'epic') {
                        if (hasHeroicDuplicateForItem(item, heroicNamesSet)) {
                            favorIgnored = true;
                        } else {
                            cumulativeFavor += item.favor;
                        }
                    } else {
                        cumulativeFavor += item.favor;
                    }
                    row.cumulativeFavor = cumulativeFavor;
                } else if (favorActive) {
                    row.cumulativeFavor = cumulativeFavor;
                }
                row.favorIgnored = favorIgnored;
                if (hasLevelupItems) {
                    row.playerLevel = levelupCount;
                    row.playerLevelWarning = levelupCount < calculatedLevel - 1 ? 2 : levelupCount < calculatedLevel ? 1 : 0;
                } else {
                    row.playerLevel = calculatedLevel;
                }
            }
        }
        if (item.isCustom && listId === 'levelplan') {
            // For custom items: calculate xpMin based on custom XP and time
            // Respect the applyMultipliers flag for xpMin calculation
            const cumMultiplier = multiplier + activePotPct / 100;
            const totalTime = (item.travelTime || 0) + (item.qTime || 0);
            const customXpForMin = item.applyMultipliers ? Math.round((item.xp || 0) * cumMultiplier) : (item.xp || 0);
            row.xpMin = totalTime > 0 ? Math.floor(customXpForMin / totalTime) : '';
            row.xpMinAdjusted = false;
            row.xpMinPlain = '';
            row.xpMinForColor = '';
            row.unmetRequirements = [];
            row.isSaga = false;
            row.sagaRefLevel = null;
        } else if (!item.isTakeLevel && item.id !== undefined) {
            const related = collectItemsForXpMin(item, levelplanNameSet, allItemsByName);
            const relatedReqs = related.slice(1).filter(Boolean);
            const relatedHasMissingTime = relatedReqs.some(it => (it.qTime === null || it.qTime === undefined) && (it.travelTime === null || it.travelTime === undefined));
            const plainTime = (item.travelTime || 0) + (item.qTime || 0);
            const plainXpMin = plainTime > 0 ? Math.floor((item.xp || 0) * multiplier / plainTime) : '';
            row.unmetRequirements = related.slice(1).map(it => it.name);
            // Detect sagas using explicit flag set in data.
            row.isSaga = item.isSaga;
            // For sagas (no difficulty and typically no own level), compute
            // a reference level from the highest-level required quest so
            // we can look up an appropriate color band in the quests list.
            if (item.isSaga) {
                const reqLevels = related.slice(1).map(it => it.lvl).filter(l => l !== undefined && l !== null);
                row.sagaRefLevel = reqLevels.length > 0 ? Math.max(...reqLevels) : null;
            } else {
                row.sagaRefLevel = null;
            }
            if (listId === 'levelplan') {
                // For levelplan: sagas should not show xpMin; regular items keep original logic
                if (item.isSaga) {
                    row.xpMin = '';
                    row.xpMinAdjusted = false;
                    row.xpMinPlain = '';
                    row.xpMinForColor = '';
                } else {
                    const deps = (item.name !== undefined) ? dependents.get(item.name) : null;
                    if (relatedHasMissingTime) {
                        row.xpMin = null;
                        row.xpMinAdjusted = false;
                        row.xpMinPlain = null;
                        row.xpMinForColor = null;
                        if (deps && deps.length > 0) {
                            row.cumulativeXpMin = null;
                            row.dependentNames = deps.map(it => it.name);
                        }
                    } else {
                        row.xpMin = plainXpMin;
                        row.xpMinAdjusted = false;
                        row.xpMinPlain = '';
                        row.xpMinForColor = plainTime > 0 ? Math.floor((item.xp || 0) / plainTime) : '';
                        // Cumulative xpmin for this quest plus all levelplan quests that
                        // (transitively) require it. Cumulative xpmin = total xp / total time.
                        if (deps && deps.length > 0) {
                            const group = [item, ...deps];
                            const totalXP = group.reduce((s, it) => s + (it.xp || 0) * multiplier, 0);
                            const totalTime = group.reduce((s, it) => s + (it.travelTime || 0) + (it.qTime || 0), 0);
                            row.cumulativeXpMin = totalTime > 0 ? Math.floor(totalXP / totalTime) : '';
                            row.dependentNames = deps.map(it => it.name);
                        }
                    }
                }
            } else {
                // For quests list: keep original behavior even for sagas
                const totalXP = related.reduce((sum, it) => sum + (it.xp || 0) * multiplier, 0);
                const totalTime = related.reduce((sum, it) => sum + (it.travelTime || 0) + (it.qTime || 0), 0);
                if (relatedHasMissingTime) {
                    row.xpMin = null;
                    row.xpMinAdjusted = false;
                    row.xpMinPlain = null;
                    row.xpMinForColor = null;
                } else {
                    row.xpMin = totalTime > 0 ? Math.floor(totalXP / totalTime) : '';
                    row.xpMinAdjusted = related.length > 1;
                    row.xpMinPlain = plainXpMin;
                    // Same variant as xpMin, but without the xp-multiplier (for color only)
                    const baseTotalXP = related.reduce((sum, it) => sum + (it.xp || 0), 0);
                    row.xpMinForColor = totalTime > 0 ? Math.floor(baseTotalXP / totalTime) : '';
                }
            }
        } else if (item.isEliteCopy) {
            const plainTime = (item.travelTime || 0) + (item.qTime || 0);
            row.xpMin = plainTime > 0 ? Math.floor((item.xp || 0) * multiplier / plainTime) : '';
            row.xpMinAdjusted = false;
            row.xpMinPlain = '';
            row.unmetRequirements = [];
            row.xpMinForColor = plainTime > 0 ? Math.floor((item.xp || 0) / plainTime) : '';
        } else if (item.isCustom) {
            const qTime = item.qTime || 0;
            row.xpMin = qTime > 0 ? Math.floor((item.xp || 0) / qTime) : '';
            row.xpMinAdjusted = false;
            row.xpMinPlain = '';
            row.unmetRequirements = [];
            row.xpMinForColor = row.xpMin;
        } else {
            row.xpMin = '';
            row.xpMinAdjusted = false;
            row.xpMinPlain = '';
            row.unmetRequirements = [];
            row.xpMinForColor = '';
        }
        return row;
    });

    let filteredRowData = rowData;
    if (listId === 'quests') {
        const xpminRaw = document.getElementById('quests-xpmin-filter')?.value;
        const xpminMin = xpminRaw !== '' && xpminRaw !== undefined ? parseInt(xpminRaw, 10) : NaN;
        if (!isNaN(xpminMin) && xpminMin > 0) {
            filteredRowData = filteredRowData.filter(row => {
                const ownXpMin = (row.xpMinPlain !== '' && row.xpMinPlain != null) ? row.xpMinPlain : row.xpMin;
                return ownXpMin !== '' && ownXpMin != null && Number(ownXpMin) >= xpminMin;
            });
        }
        const levelRaw = document.getElementById('quests-level-filter')?.value;
        const levelFilter = levelRaw !== '' && levelRaw !== undefined ? parseInt(levelRaw, 10) : NaN;
        if (!isNaN(levelFilter) && levelFilter > 0) {
            filteredRowData = filteredRowData.filter(row => row.item.lvl === levelFilter);
        }
        const nameFilter = document.getElementById('quests-name-filter')?.value.trim().toLowerCase();
        if (nameFilter) {
            filteredRowData = filteredRowData.filter(row =>
                row.item.name != null && row.item.name.toLowerCase().includes(nameFilter)
            );
        }
        const patronFilterChecked = document.getElementById('quests-patron-filter')?.checked;
        if (patronFilterChecked && tokensActive) {
            filteredRowData = filteredRowData.filter(row => row.item.tokens != null && row.item.tokens > 0);
        } else if (patronFilterChecked && favorActive) {
            if (patronView === 'All') {
                filteredRowData = filteredRowData.filter(row => row.item.patron !== undefined && row.item.patron !== null && row.item.patron !== '' && row.item.patron !== 'None');
            } else {
                filteredRowData = filteredRowData.filter(row => row.item.patron === patronView);
            }
        }
    }

    filteredRowData.forEach((row, index) => {
        let favorValue;
        if (tokensActive) {
            favorValue = (row.item.tokens != null && row.item.tokens !== '') ? row.item.tokens : '';
        } else {
            favorValue = (favorActive && row.item && (patronView === 'All' || row.item.patron === patronView) && row.item.favor != null && row.item.favor !== '')
                ? row.item.favor
                : '';
        }
        // Also mark favors ignored in the quests view when applicable (epic mode).
        // Reuse the same heroic-duplicate check used for levelplan rows.
        let favorIgnoredLocal = false;
        if (!tokensActive && row.item && row.item.favor != null && row.item.favor !== '') {
            if (getCurrentMode() === 'epic' && hasHeroicDuplicateForItem(row.item, heroicNamesSet)) {
                // If a patron filter is active, only mark items matching that patron
                // (or the special 'All' view). Otherwise mark duplicates in the full
                // quests list as well.
                if (!favorActive || patronView === 'All' || row.item.patron === patronView) {
                    favorIgnoredLocal = true;
                }
            }
        }
        const itemElement = createItemElement(row.item, listId, row.dataIndex, row.cumulativeXP, row.playerLevel, row.displayName, row.playerLevelWarning, row.xpMin, row.xpMinAdjusted, row.xpMinPlain, row.unmetRequirements, row.cumulativeXpMin, row.dependentNames, row.sagaRefLevel, row.xpMinForColor, favorValue, row.cumulativeFavor, (favorIgnoredLocal || row.favorIgnored));
        listElement.appendChild(itemElement);
    });

    if (listId === 'levelplan') renderLevelplanFooter();
}

// Compute and display aggregate totals in the levelplan footer row.
function renderLevelplanFooter() {
    const multiplier = parseFloat(document.getElementById('xp-multiplier')?.value) || 1.15;
    const items = data.levelplan || [];
    const hasLevelupItems = items.some(i => i.isTakeLevel);

    // Total XP (all non-TakeLevel items with multiplier applied)
    let totalXP = 0;
    items.forEach(item => {
        if (!item.isTakeLevel) {
            totalXP += item.isCustom ? (item.xp || 0) : Math.round((item.xp || 0) * multiplier);
        }
    });

    // Highest player level: if the plan contains explicit "Take Level"
    // entries, show the highest player level taken (as items do). Otherwise
    // fall back to the XP-derived level from total XP.
    let maxPlayerLevel = '';
    if (items.length > 0) {
        const levelFromXP = getPlayerLevelForXP(totalXP);
        if (hasLevelupItems) {
            const takeLevelCount = items.filter(i => i.isTakeLevel).length;
            const levelFromTakeLevels = getPlayerLevelForXP(0) + takeLevelCount;
            // When Take Level items exist, display the level reached by
            // those takes (not the max of XP and take-levels) so the footer
            // mirrors per-item player-level behavior.
            maxPlayerLevel = levelFromTakeLevels;
        } else {
            maxPlayerLevel = levelFromXP;
        }
    }

    // Quest count: include regular quests and elite copies; exclude saga, takeLevel, custom
    const questCount = items.filter(i => !i.isSaga && !i.isTakeLevel && !i.isCustom).length;

    // Total effective time: sum of qTime and travelTime.
    let totalTime = 0;
    items.forEach(item => {
        totalTime += (item.travelTime || 0) + (item.qTime || 0);
    });

    // XP/min using total effective time (total XP divided by effective minutes)
    const totalXpMin = totalTime > 0 ? Math.floor(totalXP / totalTime) : '';

    // Format time compactly
    let timeStr = '';
    if (totalTime > 0) {
        const h = Math.floor(totalTime / 60);
        const m = totalTime % 60;
        if (h > 0) {
            const mRound = Math.round(m);
            timeStr = mRound > 0 ? `${h}h ${mRound}m` : `${h}h`;
        } else {
            timeStr = `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
        }
    }

    const playerLevelEl = document.getElementById('footer-player-level');
    const questCountEl  = document.getElementById('footer-quest-count');
    const totalTimeEl   = document.getElementById('footer-total-time');
    const xpminEl       = document.getElementById('footer-xpmin');
    const totalXpEl     = document.getElementById('footer-total-xp');
    const totalFavorEl  = document.getElementById('footer-total-favor');

    if (playerLevelEl) playerLevelEl.textContent = maxPlayerLevel !== '' ? maxPlayerLevel : '';
    if (questCountEl)  questCountEl.textContent  = items.length > 0 ? `${questCount} quests` : '';
    if (totalTimeEl)   totalTimeEl.textContent   = timeStr;
    if (xpminEl)       xpminEl.textContent       = totalXpMin !== '' ? safeToLocaleString(totalXpMin) : '';
    if (totalXpEl)     totalXpEl.textContent     = totalXP > 0 ? safeToLocaleString(totalXP) : '';
    
    // If a patron is selected (not the default 'None' option), show the
    // total favor for that patron in the footer's last field. When in epic
    // mode also include the total HEROIC favor for that patron as a base.
    const patronView = document.getElementById('patron-view')?.value || 'None';
    const tokensActiveFooter = isTwelveTokensActive();
    let totalFavor = 0;
    // Precompute heroic names for this footer pass as well.
    let heroicNamesSetFooter = null;
    if (getCurrentMode() === 'epic') {
        const heroicPlan = (data && data.levelplanByMode && Array.isArray(data.levelplanByMode.heroic)) ? data.levelplanByMode.heroic : [];
        if (heroicPlan && heroicPlan.length > 0) {
            heroicNamesSetFooter = new Set(
                heroicPlan
                    .filter(h => h && !h.isTakeLevel && !h.isCustom && !h.isXpPot && !h.isXpPotStart && !h.isXpPotEnd && h.name !== undefined)
                    .map(h => h.name)
                    .filter(Boolean)
            );
        }
    }
    if (tokensActiveFooter) {
        let totalTokens = 0;
        items.forEach(item => {
            if (!item || item.isTakeLevel) return;
            if (item.tokens != null && typeof item.tokens === 'number') totalTokens += item.tokens;
        });
        if (totalFavorEl) totalFavorEl.textContent = safeToLocaleString(totalTokens);
    } else {
        if (patronView && patronView !== 'None') {
            items.forEach(item => {
                if (!item || item.isTakeLevel) return;
                const patronMatches = (patronView === 'All')
                    ? (item.patron !== undefined && item.patron !== null && item.patron !== '' && item.patron !== 'None')
                    : (item.patron === patronView);
                if (!patronMatches) return;
                if (item.favor != null && item.favor !== '') {
                    // When viewing epic mode, do NOT count favor from epic quests
                    // whose name already exists in the heroic levelplan (avoid double-counting).
                    if (getCurrentMode() === 'epic') {
                        if (hasHeroicDuplicateForItem(item, heroicNamesSetFooter)) return; // skip this item's favor
                    }
                    const fv = Number(item.favor);
                    if (isFinite(fv)) totalFavor += fv;
                }
            });
        }
        // Add heroic-mode base favor when viewing epic mode
        if (getCurrentMode() === 'epic' && patronView && patronView !== 'None') {
            const heroicBase = getHeroicFavorForPatron(patronView);
            if (isFinite(heroicBase) && heroicBase !== 0) totalFavor += heroicBase;
        }
        if (totalFavorEl) totalFavorEl.textContent = (patronView && patronView !== 'None') ? safeToLocaleString(totalFavor) : '';
    }
}

// Linear interpolation between two RGB triples; returns a CSS rgb() string.
function lerpColor(c1, c2, t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r},${g},${b})`;
}

// Map an xpMin value (and the quest's level) to an Excel-style heat color.
// xpminThresholdDecent < xpminThresholdGood numerically (300% accumulation uses more/worse quests).
// Anchors: red(0) -> yellow(xpminThresholdDecent) -> green(xpminThresholdGood) -> dark-green(above).
function getXpMinColor(xpMin, level) {
    if (xpMin === '' || xpMin == null || !isFinite(xpMin)) return null;
    const t = window.XPMIN_THRESHOLDS_BY_LEVEL && window.XPMIN_THRESHOLDS_BY_LEVEL[level];
    if (!t) return null;
    const { xpminThresholdGood, xpminThresholdDecent } = t;
    if (!isFinite(xpminThresholdGood) || !isFinite(xpminThresholdDecent)) return null;

    const red       = [250, 200, 200];
    const yellow    = [252, 240, 180];
    const green     = [200, 235, 195];
    const darkGreen = [160, 215, 170];

    if (xpMin <= 0) {
        return `rgb(${red[0]},${red[1]},${red[2]})`;
    } else if (xpMin < xpminThresholdDecent) {
        // red → yellow: 0 to xpminThresholdDecent
        return lerpColor(red, yellow, xpMin / Math.max(1, xpminThresholdDecent));
    } else if (xpMin < xpminThresholdGood) {
        // yellow → green: xpminThresholdDecent to xpminThresholdGood
        return lerpColor(yellow, green, (xpMin - xpminThresholdDecent) / Math.max(1, xpminThresholdGood - xpminThresholdDecent));
    } else {
        // green → dark-green: above xpminThresholdGood
        const span = Math.max(1, xpminThresholdGood - xpminThresholdDecent);
        return lerpColor(green, darkGreen, (xpMin - xpminThresholdGood) / span);
    }
}

// Small helpers for parsing/formatting minutes <-> m:ss
function parseTimeToMinutes(input) {
    if (input === undefined || input === null) return 0;
    const s = String(input).trim();
    if (s === '') return 0;
    // Support minutes:seconds (e.g. "1:30")
    if (s.indexOf(':') >= 0) {
        const parts = s.split(':');
        const minStr = parts[0] || '0';
        const secStr = parts[1] || '0';
        const minutes = parseFloat(minStr) || 0;
        const seconds = parseFloat(secStr) || 0;
        const extraMins = Math.floor(seconds / 60);
        const remSeconds = seconds % 60;
        return Math.max(0, minutes + extraMins + remSeconds / 60);
    }
    // Otherwise treat as decimal minutes (e.g. "1.5" == 1.5 minutes)
    const n = parseFloat(s);
    return (isFinite(n) && n >= 0) ? n : 0;
}

function formatMinutesToMSS(mins) {
    if (mins === undefined || mins === null) return '';
    let m = Math.floor(mins);
    let s = Math.round((mins - m) * 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}:${String(s).padStart(2, '0')}`;
}

// Safe numeric formatting helper: attempts locale formatting but falls back.
// Returns an empty string for null/undefined/empty inputs; for non-finite
// numbers it returns the original stringified input.
function safeToLocaleString(value) {
    try {
        if (value === '' || value === null || value === undefined) return '';
        const n = Number(value);
        if (!isFinite(n)) return String(value);
        return n.toLocaleString();
    } catch (e) {
        try { return String(Number(value)); } catch (e2) { return String(value); }
    }
}

// Create an item element
function createItemElement(item, listId, index, cumulativeXP, playerLevel, displayName, playerLevelWarning, xpMin, xpMinAdjusted, xpMinPlain, unmetRequirements, cumulativeXpMin, dependentNames, sagaRefLevel, xpMinForColor, favorValue, cumulativeFavor, favorIgnored) {
    const div = document.createElement('div');
    div.className = 'item';
    div.draggable = true;
    // Prevent starting a row drag when the user begins interaction inside
    // an input field (so click+drag selects text instead of dragging the item).
    // Also disable draggable while any input is focused to suppress the
    // browser's drag-highlight tint on the row.
    if (!window._lp_inputDragSuppressionInstalled) {
        window._lp_inputDragSuppressionInstalled = true;
        window.addEventListener('mouseup', () => {
            document.querySelectorAll('.item').forEach(d => d._suppressDrag = false);
        });
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT') {
                const row = e.target.closest('.item');
                if (row) row.draggable = false;
            }
        });
        document.addEventListener('focusout', (e) => {
            if (e.target.tagName === 'INPUT') {
                const row = e.target.closest('.item');
                if (row) row.draggable = true;
            }
        });
    }
    div.addEventListener('dragstart', (e) => {
        if (div._suppressDrag) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
    div.dataset.listId = listId;
    div.dataset.index = index;
    div.dataset.name = item.name !== undefined ? String(item.name) : '';

    // Heat-color based on xpMin vs. the quest level's percentile thresholds.
    // For the levelplan, the color is applied to the inner content wrapper
    // (set further down) so the row's player/cumulative columns remain neutral.
    let xpMinColor = null;
    let isRedBand = false;
    let colorLevel = null;
    if (xpMin !== '' && xpMin != null && !item.isCustom && !item.isTakeLevel) {
        // Use the row's playerLevel for levelplan entries so the color
        // reflects the player's current level at that point in the plan.
        // For other lists (quests) keep the original behaviour (quest's lvl
        // or sagaRefLevel).
        if (listId === 'levelplan') {
            // Use player level minus two to compare against the quest pool
            // table. Clamp into the available threshold range so epic
            // (which starts at lvl 21) and heroic (starts at lvl 1) both
            // resolve to a defined band.
            if (playerLevel !== '' && playerLevel != null) {
                const pl = Number(playerLevel);
                const keys = Object.keys(window.XPMIN_THRESHOLDS_BY_LEVEL || {})
                    .map(k => Number(k))
                    .filter(n => Number.isFinite(n));
                const minKey = keys.length ? Math.min(...keys) : 1;
                const maxKey = keys.length ? Math.max(...keys) : pl;
                colorLevel = Math.max(minKey, Math.min(maxKey, pl - 2));
            } else {
                colorLevel = (item.lvl != null) ? item.lvl : sagaRefLevel;
            }
        } else {
            colorLevel = (item.lvl != null) ? item.lvl : sagaRefLevel;
        }
        if (colorLevel != null) {
            const thresholds = window.XPMIN_THRESHOLDS_BY_LEVEL && window.XPMIN_THRESHOLDS_BY_LEVEL[colorLevel];
            // Use the unmultiplied xpMin (same variant as xpMin) for color so the
            // xp-multiplier setting does not shift the heat color.
            const colorValue = (xpMinForColor !== undefined && xpMinForColor !== '' && xpMinForColor != null)
                ? Number(xpMinForColor)
                : Number(xpMin);
            xpMinColor = getXpMinColor(colorValue, colorLevel);
            if (thresholds && isFinite(thresholds.xpminThresholdGood)) {
                isRedBand = colorValue <= thresholds.xpminThresholdDecent;
            }
            if (xpMinColor && listId !== 'levelplan') {
                div.style.setProperty('background-color', xpMinColor, 'important');
                div.style.setProperty('color', '#000', 'important');
            }
        }
    }

    const cumDiv = document.createElement('div');
    cumDiv.className = 'item-cumulative';
    cumDiv.textContent = cumulativeXP !== '' ? safeToLocaleString(cumulativeXP) : '';
    if (listId === 'levelplan' && !item.isTakeLevel && cumulativeXP !== '' && playerLevel !== '') {
        const pl = Number(playerLevel);
        const xpForCurrent = getXpForLevel(pl);
        const xpForPlus1 = getXpForLevel(pl + 1);
        const xpForPlus2 = getXpForLevel(pl + 2);
        let curXP = NaN;
        try { curXP = Number(cumulativeXP); } catch (e) { curXP = NaN; }
        if (!isNaN(curXP)) {
            // Red if not enough XP for the CURRENT level (user request),
            // or red for a large overage (two levels ahead). Blue if at/above
            // next-level. Green (no color) if enough for current but not next.
            if (xpForCurrent !== undefined && curXP < xpForCurrent) {
                // Not enough XP for the current displayed level -> red
                cumDiv.style.color = '#e74c3c';
            } else if (xpForPlus2 !== undefined && curXP >= xpForPlus2) {
                // Far over (two-levels ahead) -> red alert
                cumDiv.style.color = '#e74c3c';
            } else if (xpForPlus1 !== undefined && curXP >= xpForPlus1) {
                // Reached next level -> blue
                cumDiv.style.color = '#0f6df1';
            } else {
                // Normal (green) — clear inline color to let stylesheet show default
                cumDiv.style.color = '';
            }

            // Tooltip text:
            // - If short of current level: show xp needed to reach current level.
            // - If at/above next or way over: show xp over what was needed for the current level.
            // - Otherwise (enough for current but not next): show xp needed for next level.
            if (xpForCurrent !== undefined && curXP < xpForCurrent) {
                const need = xpForCurrent - curXP;
                cumDiv.dataset.tip = `${safeToLocaleString(need)}xp needed for level ${pl}`;
            } else if (xpForCurrent !== undefined && (xpForPlus2 !== undefined && curXP >= xpForPlus2)) {
                const over = curXP - xpForPlus2;
                cumDiv.dataset.tip = `${safeToLocaleString(over)}xp over max for level ${pl}`;
            } else if (xpForCurrent !== undefined && (xpForPlus2 === undefined && curXP >= xpForPlus1)) {
                const over = curXP - xpForPlus1;
                cumDiv.dataset.tip = `${safeToLocaleString(over)}xp over needed for cap`;
            } else if (xpForCurrent !== undefined && (xpForPlus1 !== undefined && curXP >= xpForPlus1)) {
                const over = curXP - xpForPlus1;
                const under = xpForPlus2 - curXP;
                cumDiv.dataset.tip = `${safeToLocaleString(over)}xp over needed for level ${pl} (${safeToLocaleString(under)}xp under max))`;
            } else if (xpForPlus1 !== undefined) {
                const need = xpForPlus1 - curXP;
                cumDiv.dataset.tip = `${safeToLocaleString(need)}xp to reach level ${pl + 1}`;
            } else {
                delete cumDiv.dataset.tip;
            }
        } else {
            delete cumDiv.dataset.tip;
        }
    }

    const cumFavorDiv = document.createElement('div');
    cumFavorDiv.className = 'item-cumfavor';
    cumFavorDiv.textContent = (cumulativeFavor !== undefined && cumulativeFavor !== '' && cumulativeFavor !== null) ? safeToLocaleString(cumulativeFavor) : '';

    const playerDiv = document.createElement('div');
    playerDiv.className = 'item-player';
    playerDiv.textContent = playerLevel !== '' ? playerLevel : '';
    if (listId === 'levelplan' && !item.isTakeLevel) {
        if (playerLevelWarning === 2) {
            playerDiv.classList.add('warning'); 
        } else if (playerLevelWarning === 1) {
            playerDiv.classList.add('caution'); 
        }
    }

    const spacerDiv = document.createElement('div');
    spacerDiv.className = 'item-spacer';

    xpMin = xpMin !== undefined ? xpMin : '';
    const xpminDiv = document.createElement('div');
    xpminDiv.className = 'item-xpmin';
    if (xpMin !== '' && xpMinAdjusted) {
        xpminDiv.style.fontStyle = 'italic';
        xpminDiv.className = 'item-xpmin xpmin-asterisk';
        if (!item.isSaga) {
            xpminDiv.dataset.plain = safeToLocaleString(xpMinPlain) + ' XP/Min (reddoor).\nHold control while adding to add without it\'s prereqs.';
            // Tooltip bg = color of the plain (reddoor) value shown in the hover
            if (colorLevel != null && xpMinPlain !== '' && xpMinPlain != null) {
                const plainColor = getXpMinColor(Number(xpMinPlain), colorLevel);
                if (plainColor) xpminDiv.dataset.tipBg = plainColor;
            }
        } else {
            xpminDiv.dataset.plain = 'Hold control while adding to add without it\'s prereqs.';
        }
        const xpminText = document.createTextNode(safeToLocaleString(xpMin));
        const asterisk = document.createElement('sup');
        asterisk.textContent = '*';
        asterisk.style.display = 'none';
        xpminDiv.appendChild(xpminText);
        xpminDiv.appendChild(asterisk);
    } else {
        xpminDiv.textContent = safeToLocaleString(xpMin);
    }
    if (listId === 'levelplan' && dependentNames && dependentNames.length > 0) {
        xpminDiv.classList.add('xpmin-dependents');
        const tooltip = 'Prereq for:\n' + dependentNames.join('\n') + `\nCombined XP/Min: ${cumulativeXpMin !== '' ? safeToLocaleString(cumulativeXpMin) : '-'}`;
        xpminDiv.dataset.dependents = tooltip;
        // Tooltip bg = color of the combined xpmin shown in the hover
        if (colorLevel != null && cumulativeXpMin !== '' && cumulativeXpMin != null) {
            const combinedColor = getXpMinColor(Number(cumulativeXpMin), colorLevel);
            if (combinedColor) xpminDiv.dataset.tipBg = combinedColor;
        }
        const plus = document.createElement('sup');
        plus.textContent = '+';
        xpminDiv.appendChild(plus);
    }

    const levelDiv = document.createElement('div');
    levelDiv.className = 'item-lvl';
    levelDiv.textContent = item.lvl !== undefined ? item.lvl : '';

    const favorDiv = document.createElement('div');
    favorDiv.className = 'item-favor';
    favorDiv.textContent = (favorValue !== undefined && favorValue !== null && favorValue !== '') ? favorValue : '';
    if (favorIgnored) {
        favorDiv.classList.add('favor-ignored');
        favorDiv.dataset.tip = 'Ignored: already present in heroic levelplan — does not give favor';
    }
    if (listId === 'levelplan' && item.lvl !== undefined && playerLevel !== '') {
        const diff = item.lvl - playerLevel;
        const mode = getCurrentMode();
        // Alert: lockout. heroic uses 5+ higher (diff > 4). Epic none.
        if (diff > 3 && mode !== 'epic') {
            levelDiv.classList.add('qlvl-lockout');
        }
        // Warn: reduced XP. heroic uses 3+ lower (diff < -2). Epic requires 5+ lower (diff < -4).
        if (diff < (mode === 'epic' ? -4 : -2)) {
            xpminDiv.classList.add('xpmin-low');
        }
        // Alert: lockout. heroic uses 5+ lower (diff < -4). Epic requires 7+ lower (diff < -6).
        if (diff < (mode === 'epic' ? -6 : -4) && item.difficulty === 'R') {
            levelDiv.classList.add('qlvl-lockout');
        }
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'item-questname';
    if (unmetRequirements && unmetRequirements.length > 0) {
        const vipSagasChecked = document.getElementById('vip-sagas-header')?.checked;
        const isVipSagaTolerated = item.isSaga && vipSagasChecked && unmetRequirements.length === 1;
        nameDiv.classList.add('unmet-requirements');
        if (isVipSagaTolerated) nameDiv.classList.add('unmet-requirements--vip-ok');
        const nameText = document.createTextNode(displayName || item.name);
        const nameAsterisk = document.createElement('span');
        nameAsterisk.textContent = ' ⚠';
        nameAsterisk.className = 'unmet-icon';
        nameAsterisk.dataset.unmet = unmetRequirements.join('\n') + '\nCumulative XP/Min: ' + safeToLocaleString(xpMin);
        nameDiv.appendChild(nameText);
        nameDiv.appendChild(nameAsterisk);
    } else {
        nameDiv.textContent = displayName || item.name;
    }
    if (listId === 'levelplan' && item.isTakeLevel) {
        if (playerLevelWarning === 2) {
            nameDiv.classList.add('warning'); 
        } else if (playerLevelWarning === 1) {
            nameDiv.classList.add('caution'); 
        }
    }

    // Tooltip: show XP on hover for the name field (levelplan, quests, special)
    (function() {
        const multiplier = parseFloat(document.getElementById('xp-multiplier')?.value) || 1.15;
        let xpVal = null;
        if (item && item.isCustom) {
            if (item.xp != null && isFinite(item.xp)) xpVal = item.xp;
            else if (item.baseXP != null && isFinite(item.baseXP)) xpVal = item.baseXP;
        } else {
            if (item && item.xp != null && isFinite(item.xp)) xpVal = Math.round(item.xp * multiplier);
            else if (item && item.baseXP != null && isFinite(item.baseXP)) xpVal = Math.round(item.baseXP * multiplier);
            else if (item && item.isTakeLevel) xpVal = 0;
        }
        if (xpVal != null) {
            nameDiv.dataset.tip = safeToLocaleString(xpVal) + 'xp';
        }
    })();

    if (listId === 'levelplan') {
        if (item.isCustom) {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'item-content-wrapper item-content-wrapper--custom';

            const nameInput = document.createElement('input');
            nameInput.className = 'custom-field-input custom-name-input';
            nameInput.type = 'text';
            nameInput.value = (item.name && item.name !== 'Custom XP') ? item.name : '';
            nameInput.placeholder = 'Name';
            // Tooltip: show XP on hover for custom-name input
            (function() {
                let customXp = null;
                if (item && item.xp != null && isFinite(item.xp)) customXp = item.xp;
                else if (item && item.baseXP != null && isFinite(item.baseXP)) customXp = item.baseXP;
                else if (item && item.isTakeLevel) customXp = 0;
                if (customXp != null) {
                    nameInput.dataset.tip = safeToLocaleString(customXp) + 'xp';
                }
            })();
            nameInput.draggable = false;
            nameInput.addEventListener('mousedown', e => { e.stopPropagation(); div._suppressDrag = true; });
            nameInput.addEventListener('pointerdown', e => { e.stopPropagation(); div._suppressDrag = true; });
            nameInput.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
            nameInput.addEventListener('blur', () => {
                // IMPORTANT: write to the captured `item` object, NOT to
                // data.levelplan[index]. After a drag-reorder the item at
                // `index` may now point to a different item.
                item.name = nameInput.value.trim() || 'Custom XP';
                saveToStorage();
                renderLists();
            });

            // Checkbox to toggle whether multipliers apply to cumulative XP and xpMin
            const applyMultCheckbox = document.createElement('input');
            applyMultCheckbox.className = 'custom-apply-mult-checkbox';
            applyMultCheckbox.type = 'checkbox';
            applyMultCheckbox.checked = item.applyMultipliers ?? false;
            applyMultCheckbox.dataset.tip = 'Include Multipliers';
            applyMultCheckbox.draggable = false;
            applyMultCheckbox.addEventListener('mousedown', e => { e.stopPropagation(); div._suppressDrag = true; });
            applyMultCheckbox.addEventListener('pointerdown', e => { e.stopPropagation(); div._suppressDrag = true; });
            applyMultCheckbox.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
            applyMultCheckbox.addEventListener('change', () => {
                item.applyMultipliers = applyMultCheckbox.checked;
                saveToStorage();
                renderLists();
            });

            const xpInput = document.createElement('input');
            xpInput.className = 'custom-field-input custom-xp-input';
            xpInput.type = 'text';
            xpInput.value = item.xp ? safeToLocaleString(item.xp) + 'xp' : '';
            xpInput.placeholder = 'XP';
            xpInput.draggable = false;
            xpInput.addEventListener('mousedown', e => { e.stopPropagation(); div._suppressDrag = true; });
            xpInput.addEventListener('pointerdown', e => { e.stopPropagation(); div._suppressDrag = true; });
            xpInput.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
            xpInput.addEventListener('focus', () => {
                const num = parseInt(xpInput.value.replace(/[^0-9]/g, ''), 10);
                xpInput.value = isNaN(num) ? '' : String(num);
            });
            xpInput.addEventListener('blur', () => {
                const num = parseInt(xpInput.value.replace(/[^0-9]/g, ''), 10);
                item.xp = isNaN(num) ? 0 : num;
                xpInput.value = item.xp ? safeToLocaleString(item.xp) + 'xp' : '';
                saveToStorage();
                renderLists();
            });
            xpInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    const num = parseInt(xpInput.value.replace(/[^0-9]/g, ''), 10);
                    item.xp = isNaN(num) ? 0 : num;
                    xpInput.value = item.xp ? safeToLocaleString(item.xp) + 'xp' : '';
                    saveToStorage();
                    renderLists();
                    xpInput.blur();
                }
            });

            const qTimeInput = document.createElement('input');
            qTimeInput.className = 'custom-field-input custom-qtime-input';
            qTimeInput.type = 'text';
            qTimeInput.value = (item.qTime !== undefined && item.qTime !== null && item.qTime !== '') ? formatMinutesToMSS(item.qTime) : '';
            qTimeInput.placeholder = 'Time (m:ss)';
            qTimeInput.draggable = false;
            qTimeInput.addEventListener('mousedown', e => { e.stopPropagation(); div._suppressDrag = true; });
            qTimeInput.addEventListener('pointerdown', e => { e.stopPropagation(); div._suppressDrag = true; });
            qTimeInput.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
            qTimeInput.addEventListener('blur', () => {
                const parsed = parseTimeToMinutes(qTimeInput.value);
                item.qTime = parsed || 0;
                qTimeInput.value = formatMinutesToMSS(item.qTime);
                saveToStorage();
                renderLists();
            });
            qTimeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    const parsed = parseTimeToMinutes(qTimeInput.value);
                    item.qTime = parsed || 0;
                    qTimeInput.value = formatMinutesToMSS(item.qTime);
                    saveToStorage();
                    renderLists();
                    qTimeInput.blur();
                }
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'item-delete';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteItem(listId, index);
            };

            contentWrapper.appendChild(levelDiv);
            contentWrapper.appendChild(nameInput);
            contentWrapper.appendChild(applyMultCheckbox);
            contentWrapper.appendChild(xpInput);
            contentWrapper.appendChild(qTimeInput);
            contentWrapper.appendChild(xpminDiv);
            contentWrapper.appendChild(favorDiv);
            contentWrapper.appendChild(deleteBtn);

            div.appendChild(playerDiv);
            div.appendChild(spacerDiv);
            div.appendChild(contentWrapper);
            div.appendChild(cumDiv);
            div.appendChild(cumFavorDiv);
        } else if (item.isXpPotStart || item.isXpPotEnd) {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'item-content-wrapper item-content-wrapper--custom item-content-wrapper--xp-pot';

            const potNameDiv = document.createElement('div');
            potNameDiv.className = 'item-questname';

            if (item.isXpPotEnd) {
                // Find the most recent preceding Start XP Pot and read its pct
                const precedingStart = [...data.levelplan].slice(0, index).reverse().find(i => i.isXpPotStart);
                const pctLabel = (precedingStart?.pct != null) ? precedingStart.pct + '%' : '…%';
                // Determine whether a pot is currently active before this End
                const lastPotBefore = [...data.levelplan].slice(0, index).reverse().find(i => i.isXpPotStart || i.isXpPotEnd);
                const isRedundant = !(lastPotBefore && lastPotBefore.isXpPotStart === true);
                if (isRedundant) {
                    potNameDiv.textContent = 'End XP Pot (redundant)';
                    potNameDiv.dataset.tip = `${pctLabel} pot already ended`;
                    potNameDiv.classList.add('warning');
                } else {
                    potNameDiv.textContent = 'End ' + pctLabel + ' Pot';
                }
            } else {
                potNameDiv.textContent = item.name;
                if (item.isXpPotStart) {
                    // If the most recent preceding pot marker is a Start (i.e. an
                    // active pot exists), this Start will replace that active pot.
                    const lastPotBeforeForStart = [...data.levelplan].slice(0, index).reverse().find(i => i.isXpPotStart || i.isXpPotEnd);
                    if (lastPotBeforeForStart && lastPotBeforeForStart.isXpPotStart === true) {
                        const replacedPctLabel = (lastPotBeforeForStart?.pct != null) ? lastPotBeforeForStart.pct + '%' : '…%';
                        potNameDiv.classList.add('warning');
                        potNameDiv.dataset.tip = `Replaces ${replacedPctLabel} Pot`;
                    }
                }
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'item-delete';
            deleteBtn.style.gridColumn = '-2 / -1';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteItem(listId, index);
            };

            if (item.isXpPotStart) {
                const pctInput = document.createElement('input');
                pctInput.className = 'custom-field-input custom-xp-input';
                pctInput.type = 'text';
                pctInput.value = item.pct != null ? item.pct + '%' : '';
                pctInput.placeholder = '%';
                pctInput.draggable = false;
                pctInput.addEventListener('mousedown', e => { e.stopPropagation(); div._suppressDrag = true; });
                pctInput.addEventListener('pointerdown', e => { e.stopPropagation(); div._suppressDrag = true; });
                pctInput.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
                pctInput.addEventListener('focus', () => {
                    const num = parseFloat(pctInput.value);
                    pctInput.value = isNaN(num) ? '' : String(num);
                });
                pctInput.addEventListener('blur', () => {
                    const num = parseFloat(pctInput.value);
                    item.pct = isNaN(num) ? null : num;
                    pctInput.value = item.pct != null ? item.pct + '%' : '';
                    saveToStorage();
                    renderLists();
                });
                pctInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.keyCode === 13) {
                        e.preventDefault();
                        const num = parseFloat(pctInput.value);
                        item.pct = isNaN(num) ? null : num;
                        pctInput.value = item.pct != null ? item.pct + '%' : '';
                        saveToStorage();
                        renderLists();
                        pctInput.blur();
                    }
                });
                contentWrapper.appendChild(levelDiv);
                contentWrapper.appendChild(potNameDiv);
                contentWrapper.appendChild(pctInput);
                contentWrapper.appendChild(deleteBtn);
            } else {
                contentWrapper.appendChild(levelDiv);
                contentWrapper.appendChild(potNameDiv);
                contentWrapper.appendChild(deleteBtn);
            }

            div.appendChild(playerDiv);
            div.appendChild(spacerDiv);
            div.appendChild(contentWrapper);
            div.appendChild(cumDiv);
            div.appendChild(cumFavorDiv);
        } else {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'item-content-wrapper';
            if (item.isTakeLevel) contentWrapper.classList.add('is-take-level');
            if (listId === 'levelplan' && item.isSaga) {
                contentWrapper.classList.add('item-content-wrapper--saga');
            } else if (xpMinColor) {
                contentWrapper.style.setProperty('background-color', xpMinColor, 'important');
                contentWrapper.style.setProperty('color', '#000', 'important');
            }
            contentWrapper.appendChild(levelDiv);
            contentWrapper.appendChild(nameDiv);

            const eliteMarkerDiv = document.createElement('div');
            eliteMarkerDiv.className = 'difficulty-marker';
            const eliteAlreadyExists = item.difficulty === 'R' && !item.isEliteCopy &&
                data.levelplan.some(i => i.isEliteCopy && i.name === item.name + ' (repeat)');
            // If this is a saga — but only show baseXP in levelplan
            if (listId === 'levelplan' && item.isSaga) {
                // difficulty area stays empty; XP shown in dedicated column
            } else if (item.difficulty) {
                eliteMarkerDiv.textContent = item.difficulty;
                if (item.difficulty === 'R' && !item.isEliteCopy && !eliteAlreadyExists) {
                    const multiplier = parseFloat(document.getElementById('xp-multiplier')?.value);
                    const rawEliteXP = Math.round(item.baseXP * (1 + item.xpMult + item.optionalXP - 1.7));
                    const eliteXPMin = item.qTime > 0 ? Math.floor(rawEliteXP * multiplier / item.qTime) : '';
                    const eliteXPMinForColor = item.qTime > 0 ? Math.floor(rawEliteXP / item.qTime) : '';
                    const eliteXPMinColor = (eliteXPMinForColor !== '' && colorLevel != null) ? getXpMinColor(eliteXPMinForColor, colorLevel) : null;
                    if (eliteXPMinColor) {
                        eliteMarkerDiv.style.setProperty('--elite-tooltip-bg', eliteXPMinColor);
                        eliteMarkerDiv.style.setProperty('--elite-tooltip-color', '#000');
                    }
                    eliteMarkerDiv.classList.add('difficulty-marker--clickable');
                    eliteMarkerDiv.dataset.elitexp = eliteXPMin !== '' ? `Elite XP/Min: ${safeToLocaleString(eliteXPMin)}\nClick ↓ to insert a repeat on Elite copy` : 'Elite XP/Min: N/A';
                    eliteMarkerDiv.addEventListener('mouseenter', () => { eliteMarkerDiv.textContent = '↓'; });
                    eliteMarkerDiv.addEventListener('mouseleave', () => { eliteMarkerDiv.textContent = item.difficulty; });
                    eliteMarkerDiv.onclick = (e) => {
                        e.stopPropagation();
                        insertEliteCopy(index, item);};
                } else {
                    eliteMarkerDiv.classList.add('difficulty-marker--static'); 
                }
            }
            if (listId === 'levelplan' && item.isSaga) {
                const sagaXpDiv = document.createElement('div');
                sagaXpDiv.className = 'saga-xp-display';
                const xpVal = item.baseXP != null ? item.baseXP : (item.xp != null ? item.xp : 0);
                sagaXpDiv.textContent = safeToLocaleString(xpVal) + 'xp';
                contentWrapper.appendChild(sagaXpDiv);
                const sagaTimeSpacer = document.createElement('div');
                sagaTimeSpacer.className = 'saga-time-spacer';
                contentWrapper.appendChild(sagaTimeSpacer);
            } else {
                contentWrapper.appendChild(eliteMarkerDiv);
            }
            contentWrapper.appendChild(xpminDiv);
            contentWrapper.appendChild(favorDiv);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'item-delete';
            deleteBtn.textContent = (item.isEliteCopy || item.isTakeLevel) ? '×' : '→';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteItem(listId, index);
            };
            contentWrapper.appendChild(deleteBtn);

            div.appendChild(playerDiv);
            div.appendChild(spacerDiv);
            div.appendChild(contentWrapper);
            div.appendChild(cumDiv);
            div.appendChild(cumFavorDiv);
        }
    } else if (listId === 'special') {
        if (item.isTakeLevel || item.isCustom || item.isXpPot) {
            // Render special palette items (Take Level, Custom XP, XP Pot) using
            // the same item-content-wrapper appearance as levelplan cards.
            div.classList.add('item--take-level-template');
            if (item.isCustom) div.classList.add('is-custom');
            if (item.isXpPot) div.classList.add('is-xp-pot');
            const lvlDiv = document.createElement('div');
            lvlDiv.className = 'item-lvl';
            const arrowBtn = document.createElement('button');
            arrowBtn.className = 'item-delete';
            arrowBtn.textContent = '←';
            let arrowTitle, arrowLabel;
            if (item.isXpPot) {
                const lastPot = [...data.levelplan].reverse().find(i => i.isXpPotStart || i.isXpPotEnd);
                const hasUnended = lastPot?.isXpPotStart === true;
                const xpPotLabel = hasUnended ? 'End XP Pot' : 'Start XP Pot';
                nameDiv.textContent = xpPotLabel;
                arrowTitle = xpPotLabel + ' at end of Level Plan';
                arrowLabel = xpPotLabel;
                arrowBtn.dataset.tip = arrowTitle;
                arrowBtn.setAttribute('aria-label', arrowLabel);
                arrowBtn.draggable = false;
                arrowBtn.onclick = (e) => {
                    e.stopPropagation();
                    const itemToInsert = hasUnended
                        ? { name: 'End XP Pot', source: 'special', isXpPotEnd: true }
                        : { name: 'Start XP Pot', source: 'special', isXpPotStart: true };
                    data.levelplan.push(itemToInsert);
                    saveToStorage();
                    renderLists();
                    ensureHighlightStyle();
                    const list = document.getElementById('levelplan');
                    if (list) {
                        const nameKey = itemToInsert.name;
                        const matches = Array.from(list.querySelectorAll('.item')).filter(ch => ch.dataset.name === nameKey);
                        const last = matches.length ? matches[matches.length - 1] : null;
                        if (last) {
                            last.classList.add('just-inserted');
                            try { last.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (err) { /* ignore */ }
                            setTimeout(() => last.classList.remove('just-inserted'), 1000);
                        }
                    }
                };
            } else {
                arrowTitle = item.isCustom ? 'Insert Custom XP at end of Level Plan' : 'Insert Take Level at end of Level Plan';
                arrowLabel = item.isCustom ? 'Insert Custom XP' : 'Insert Take Level';
                arrowBtn.dataset.tip = arrowTitle;
                arrowBtn.setAttribute('aria-label', arrowLabel);
                arrowBtn.draggable = false;
                arrowBtn.onclick = (e) => {
                    e.stopPropagation();
                    const itemToInsert = { ...item, source: 'special' };
                    if (itemToInsert.id !== undefined) delete itemToInsert.id;
                    data.levelplan.push(itemToInsert);
                    saveToStorage();
                    renderLists();
                    ensureHighlightStyle();
                    const list = document.getElementById('levelplan');
                    if (list) {
                        const nameKey = displayName || item.name;
                        const matches = Array.from(list.querySelectorAll('.item')).filter(ch => ch.dataset.name === nameKey);
                        const last = matches.length ? matches[matches.length - 1] : null;
                        if (last) {
                            last.classList.add('just-inserted');
                            try { last.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (err) { /* ignore */ }
                            setTimeout(() => last.classList.remove('just-inserted'), 1000);
                        }
                    }
                };
            }
            lvlDiv.appendChild(arrowBtn);
            div.appendChild(lvlDiv);
            div.appendChild(nameDiv);
        } else {
            div.appendChild(nameDiv);
        }
    } else {
        if (listId === 'quests') {
            const addBtn = document.createElement('button');
            addBtn.className = 'item-quickadd';
            addBtn.textContent = '←';
            addBtn.dataset.tip = 'Add to Level Plan';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                quickAddQuest(index, e.ctrlKey);
            };
            div.appendChild(addBtn);
        }
        div.appendChild(levelDiv);
        div.appendChild(nameDiv);
        div.appendChild(xpminDiv);
        div.appendChild(favorDiv);
    }

    if (listId === 'levelplan') {
        // delete button is already inside contentWrapper above
    }

    // Drag event listeners
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

// Find the correct insert index in levelplan for a quest of a given lvl.
// Target: just above the (itemLvl + 3)th levelup entry.
// Fallback: just after the last quest with lvl <= itemLvl, or end of list.
function findAutoInsertIndex(item) {
    const itemLvl = item.lvl;
    const itemId = item.id;
    // Primary: insert just before Take Level (itemLvl + 3), only when a level is defined.
    if (itemLvl !== undefined) {
        // Determine insertion target depending on mode.
        const targetLevelupNum = getCurrentMode() === 'epic' ? (itemLvl + 4) : (itemLvl + 2);
        let levelupCount = getCurrentMode() === 'epic' ? 20 : 1;
        for (let i = 0; i < data.levelplan.length; i++) {
            if (data.levelplan[i].isTakeLevel) {
                if (levelupCount === targetLevelupNum) {
                    return i; // insert just before this levelup entry
                }
                levelupCount++;
            }
        }
    }
    // Fallback: after the last Take Level divider, insert before the first quest
    // whose id comes after this item's id (preserves INITIAL_DATA ordering).
    let lastTakeLevelIdx = -1;
    for (let i = 0; i < data.levelplan.length; i++) {
        if (data.levelplan[i].isTakeLevel) lastTakeLevelIdx = i;
    }
    const searchFrom = lastTakeLevelIdx + 1;
    if (itemId !== undefined) {
        for (let i = searchFrom; i < data.levelplan.length; i++) {
            const entry = data.levelplan[i];
            if (!entry.isTakeLevel && entry.id !== undefined && entry.id > itemId) {
                return i;
            }
        }
    }
    return data.levelplan.length;
}

// Quick-add a quest (and its unmet deps) to levelplan at the auto-calculated position.
// If singleOnly is true, only the quest itself is moved (no dependencies).
function quickAddQuest(questIndex, singleOnly = false) {
    const sourceItem = data.quests[questIndex];
    if (!sourceItem) return;

    // Build name->item map early so we can compute saga insertion level
    const allItemsByName = buildAllItemsByName();

    let toInsert;
    let related;
    if (singleOnly) {
        toInsert = [{ ...sourceItem, source: 'quests' }];
    } else {
        const levelplanNameSet = new Set(data.levelplan.filter(i => i.name !== undefined).map(i => i.name));
        related = collectItemsForXpMin(sourceItem, levelplanNameSet, allItemsByName);
        let deps = related.slice(1);
        // If VIP for Sagas is active and this is a saga with exactly 1 unmet requirement,
        // do not move that requirement — it is tolerated by VIP.
        const vipSagasChecked = document.getElementById('vip-sagas-header')?.checked;
        if (sourceItem.isSaga && vipSagasChecked && deps.length === 1) {
            deps = [];
        }
        toInsert = deps.map(it => ({ ...it, source: 'quests' })).concat({ ...related[0], source: 'quests' });
    }

    // Remove each from data.quests
    for (const it of toInsert) {
        const idx = data.quests.findIndex(q => q.name === it.name);
        if (idx !== -1) data.quests.splice(idx, 1);
    }

    // Determine insertion level. For sagas, insert where a quest of the
    // highest required level would be placed (use collected unmet deps first,
    // otherwise direct requirement levels).
    let insertLvl = sourceItem.lvl;
    if (sourceItem.isSaga) {
        const candidates = [];
        if (related && related.length > 1) {
            candidates.push(...related.slice(1).map(it => it.lvl).filter(l => l != null));
        } else if (Array.isArray(sourceItem.requirements)) {
            candidates.push(...sourceItem.requirements.map(n => {
                const it = allItemsByName.get(n);
                return it && it.lvl != null ? it.lvl : null;
            }).filter(l => l != null));
        }
        if (candidates.length > 0) insertLvl = Math.max(...candidates);
    }

    const insertIndex = findAutoInsertIndex({ lvl: insertLvl, id: sourceItem.id });
    data.levelplan.splice(insertIndex, 0, ...toInsert);

    saveToStorage();
    renderLists();
    ensureHighlightStyle();
    highlightInserted(toInsert.map(it => it.name));
}

// Insert an elite copy of an R quest right below it in the levelplan
function insertEliteCopy(index, sourceItem) {
    if (data.levelplan.some(i => i.isEliteCopy && i.name === sourceItem.name + ' (repeat)')) return;
    const eliteXP = Math.round(sourceItem.baseXP * (1 + sourceItem.xpMult + sourceItem.optionalXP - 1.7));
    const eliteCopy = { ...sourceItem, name: sourceItem.name + ' (repeat)', xp: eliteXP, travelTime: 0.0, isEliteCopy: true, difficulty: 'E', patron: null, favor: null };
    delete eliteCopy.id;
    data.levelplan.splice(index + 1, 0, eliteCopy);
    saveToStorage();
    renderLists();
}

// Ensure highlight CSS exists (inject once)
function ensureHighlightStyle() {
    if (document.getElementById('lp-just-inserted-style')) return;
    const style = document.createElement('style');
    style.id = 'lp-just-inserted-style';
    style.textContent = `
    .item.just-inserted { background: rgba(255,235,160,0.95); transition: background 900ms ease; }
    `;
    document.head.appendChild(style);
}

// Highlight items in a list matching names for a short duration
function highlightInserted(names, listId = 'levelplan', duration = 1000, doScroll = true) {
    if (!names || names.length === 0) return;
    const list = document.getElementById(listId);
    if (!list) return;
    const children = Array.from(list.querySelectorAll('.item'));
    const matched = children.filter(ch => names.includes(ch.dataset.name));
    if (matched.length === 0) return;
    matched.forEach(ch => ch.classList.add('just-inserted'));
    // Scroll the first newly-inserted item into view so the scrollbar
    // jumps to where the item(s) were inserted.
    if (doScroll) {
        try {
            matched[0].scrollIntoView({ behavior: 'auto', block: 'center' });
        } catch (e) {
            // ignore if scroll fails for any reason
        }
    }
    setTimeout(() => {
        matched.forEach(ch => ch.classList.remove('just-inserted'));
    }, duration);
}

// Drag state
let draggedElement = null;
let draggedListId = null;
let draggedIndex = null;
let phantomElement = null;
let dragRafPending = false;
let dragRafList = null;
let dragRafClientY = 0;

// Handle drag start
function handleDragStart(e) {
    draggedElement = this;
    draggedListId = this.dataset.listId;
    draggedIndex = parseInt(this.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    // Drag state is tracked via the module variables above; no payload needed.
    // Some browsers require setData to be called for the drag to start.
    e.dataTransfer.setData('text/plain', '');
    this.classList.add('dragging');
}

// Handle drag end
function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.list').forEach(list => {
        list.classList.remove('drag-over');
    });
    if (phantomElement && phantomElement.parentNode) {
        phantomElement.parentNode.removeChild(phantomElement);
    }
    phantomElement = null;
    dragRafPending = false;
    dragRafList = null;
    draggedElement = null;
    draggedListId = null;
    draggedIndex = null;
}

// Setup drag listeners for lists
function setupDragListeners() {
    const lists = document.querySelectorAll('.list');

    lists.forEach(list => {
        // Allow drops into levelplan and quests
        if (list.id === 'levelplan' || list.id === 'quests') {
            list.addEventListener('dragover', handleDragOver);
            list.addEventListener('drop', handleDrop);
            list.addEventListener('dragleave', handleDragLeave);
        }
    });
}

// Handle drag over
function handleDragOver(e) {
    const targetListId = this.dataset.listId;

    // Reject drags originating from outside the app (e.g. Notepad)
    if (!draggedListId) return;

    // Only accept levelplan→quests or any→levelplan; reject everything else
    if (targetListId === 'quests' && draggedListId !== 'levelplan') return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');

    // For quests drop target, position is auto-determined — no phantom needed
    if (targetListId === 'quests') return;

    // Throttle phantom updates to one per animation frame
    dragRafList = this;
    dragRafClientY = e.clientY;
    if (!dragRafPending) {
        dragRafPending = true;
        requestAnimationFrame(updatePhantomPosition);
    }
}

function updatePhantomPosition() {
    dragRafPending = false;
    const list = dragRafList;
    if (!list) return;

    // Create phantom if it doesn't exist
    if (!phantomElement) {
        phantomElement = document.createElement('div');
        phantomElement.className = 'phantom-item';
    }

    // Binary search for insertion point (items are in top-to-bottom DOM order)
    const allItems = Array.from(list.querySelectorAll('.item:not(.dragging)'));
    let lo = 0, hi = allItems.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const rect = allItems[mid].getBoundingClientRect();
        if (dragRafClientY < rect.top + rect.height / 2) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    const insertBefore = lo < allItems.length ? allItems[lo] : null;

    // Only touch the DOM if the position changed
    const currentNext = phantomElement.nextSibling;
    const desiredNext = insertBefore || null;
    if (phantomElement.parentNode !== list || currentNext !== desiredNext) {
        if (insertBefore) {
            list.insertBefore(phantomElement, insertBefore);
        } else {
            list.appendChild(phantomElement);
        }
    }
}

// Handle drag leave
function handleDragLeave(e) {
    if (e.target === this) {
        this.classList.remove('drag-over');
        if (phantomElement && phantomElement.parentNode) {
            phantomElement.parentNode.removeChild(phantomElement);
        }
        phantomElement = null;
    }
}

// Handle drop
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    // Reject drags originating from outside the app (e.g. Notepad)
    if (!draggedListId || draggedIndex === null) {
        this.classList.remove('drag-over');
        return;
    }

    const targetListId = this.dataset.listId;
    const sourceItem = data[draggedListId][draggedIndex];
    
    // Calculate drop index based on phantom position
    let dropIndex = data[targetListId].length;
    
    if (phantomElement && phantomElement.parentNode === this) {
        const allChildren = Array.from(this.children);
        dropIndex = allChildren.indexOf(phantomElement);
    }

    const insertedNames = [];

    // If dragging a levelplan quest back to quests -> reinsert at original position
    if (targetListId === 'quests' && draggedListId === 'levelplan') {
        if (!sourceItem.isTakeLevel && !sourceItem.isEliteCopy && !sourceItem.isCustom) {
            data.levelplan.splice(draggedIndex, 1);
            insertQuestInOriginalPosition({ ...sourceItem, source: 'quests' });
            ensureHighlightStyle();
            insertedNames.push(sourceItem.name);
        } else if (sourceItem.isEliteCopy || sourceItem.isTakeLevel || sourceItem.isCustom) {
            data.levelplan.splice(draggedIndex, 1);
        }
        this.classList.remove('drag-over');
        saveToStorage();
        renderLists();
        highlightInserted(insertedNames, 'quests', 400);
        return;
    }

    // If dropping within same list -> reorder
    if (targetListId === draggedListId) {
        data[draggedListId].splice(draggedIndex, 1);

        if (draggedIndex < dropIndex) {
            data[draggedListId].splice(dropIndex - 1, 0, sourceItem);
        } else {
            data[draggedListId].splice(dropIndex, 0, sourceItem);
        }
    } else {
        // If dragging from special -> copy single item. Special-case XP Pot
        // so dragging the palette's XP Pot yields a Start/End XP Pot like
        // the arrow button does, instead of a plain 'XP Pot' entry.
        if (draggedListId === 'special') {
            let itemToInsert;
            if (sourceItem && sourceItem.isXpPot) {
                const lastPot = [...data.levelplan].reverse().find(i => i.isXpPotStart || i.isXpPotEnd);
                const hasUnended = lastPot?.isXpPotStart === true;
                itemToInsert = hasUnended
                    ? { name: 'End XP Pot', source: 'special', isXpPotEnd: true }
                    : { name: 'Start XP Pot', source: 'special', isXpPotStart: true };
            } else {
                itemToInsert = { ...sourceItem, source: 'special' };
            }
            data[targetListId].splice(dropIndex, 0, itemToInsert);
            insertedNames.push(itemToInsert.name);
        }

        // If dragging from quests and Ctrl is NOT held, collect and insert unmet dependencies
        else if (draggedListId === 'quests' && !e.ctrlKey) {
            const levelplanNameSet = new Set(data.levelplan.filter(i => i.name !== undefined).map(i => i.name));
            const allItemsByName = buildAllItemsByName();
            const related = collectItemsForXpMin(sourceItem, levelplanNameSet, allItemsByName);

            // `collectItemsForXpMin` returns [item, req1, req2...]. We want
            // dependencies in original order followed by the item (1,2,3,4).
            const deps = related.slice(1).map(it => ({ ...it, source: 'quests' }));
            const toInsert = deps.concat({ ...related[0], source: 'quests' });

            // Remove each moved quest from `data.quests` (if present)
            for (const it of toInsert) {
                const idx = data.quests.findIndex(q => q.name === it.name);
                if (idx !== -1) data.quests.splice(idx, 1);
            }

            data[targetListId].splice(dropIndex, 0, ...toInsert);
            insertedNames.push(...toInsert.map(it => it.name));
        }

        // Default: move/copy a single item (Ctrl held or dragging from other lists)
        else {
            const itemToInsert = { ...sourceItem, source: draggedListId };

            if (draggedListId !== 'special') {
                // If moving from another source (e.g., quests with Ctrl), remove the original single item
                data[draggedListId].splice(draggedIndex, 1);
            }

            data[targetListId].splice(dropIndex, 0, itemToInsert);
            insertedNames.push(itemToInsert.name);
        }
    }

    this.classList.remove('drag-over');
    if (phantomElement && phantomElement.parentNode) {
        phantomElement.parentNode.removeChild(phantomElement);
    }
    phantomElement = null;
    saveToStorage();
    renderLists();
    ensureHighlightStyle();
    // Dropped via manual drag — do not auto-scroll the levelplan.
    highlightInserted(insertedNames, targetListId, undefined, false);
}

// Delete (move back to original source list) an item
function deleteItem(listId, index) {
    const item = data[listId].splice(index, 1)[0];
    if (listId === 'levelplan' && !item.isTakeLevel && !item.isEliteCopy && !item.isCustom) {
        insertQuestInOriginalPosition(item);
    }
    saveToStorage();
    renderLists();
    if (listId === 'levelplan' && !item.isTakeLevel && !item.isEliteCopy) {
        ensureHighlightStyle();
        highlightInserted([item.name], 'quests', 400);
    }
}

function insertQuestInOriginalPosition(item) {
    const itemId = item.id !== undefined ? item.id : Number.MAX_SAFE_INTEGER;
    const insertIndex = data.quests.findIndex(q => (q.id !== undefined ? q.id : Number.MAX_SAFE_INTEGER) > itemId);
    if (insertIndex === -1) {
        data.quests.push(item);
    } else {
        data.quests.splice(insertIndex, 0, item);
    }
}

// Reset all data
function clearCurrentLevelplan() {
    loadInitialData();
    renderLists();
}

function resetData() {
    if (confirm('Clear both Heroic and Epic level plans? All items will return to the quest list.')) {
        const mode = getCurrentMode();
        data.levelplanByMode.heroic = [];
        data.levelplanByMode.epic = [];
        data.levelplan = data.levelplanByMode[mode];
        rebuildQuestsFromLevelplan();
        data.special = [
            { name: 'Take Level', xp: 0, level: '', source: 'special', isTakeLevel: true },
            { name: 'Custom XP', xp: 0, qTime: 0, travelTime: 0, source: 'special', isCustom: true }
        ];
        saveToStorage();
        renderLists();
    }
}

// Floating tooltip: renders pseudo-element tooltips using position:fixed so they
// are never clipped by overflow:scroll list containers (e.g. when near the top).
(function () {
    const tip = document.createElement('div');
    tip.id = 'floating-tooltip';
    document.body.appendChild(tip);

    const SEL = '.xpmin-asterisk, .xpmin-dependents, .difficulty-marker, [data-unmet], [data-tip]';

    function tooltipText(el) {
        if (el.dataset.dependents) return el.dataset.dependents;
        if (el.dataset.unmet) return el.dataset.unmet;
        if (el.dataset.elitexp) return el.dataset.elitexp;
        if (el.dataset.plain) return el.dataset.plain;
        if (el.dataset.tip) return el.dataset.tip;
        return null;
    }

    function positionTip(cx, cy) {
        const tipH = tip.offsetHeight;
        const tipW = tip.offsetWidth;
        let top = cy - tipH - 20;
        let left = cx - tipW / 2;

        // Flip below the cursor if it would be cut off at the top of the viewport.
        if (top < 4) top = cy + 18;
        // Clamp horizontally to viewport.
        if (left < 4) left = 4;
        if (left + tipW > window.innerWidth - 4) left = window.innerWidth - tipW - 4;

        tip.style.top = top + 'px';
        tip.style.left = left + 'px';
    }

    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest(SEL);
        if (!el) { tip.style.display = 'none'; return; }
        const text = tooltipText(el);
        if (!text) { tip.style.display = 'none'; return; }

        tip.textContent = text;

        // Apply per-element color overrides (elite marker uses CSS vars; xpmin cells use data-tip-bg).
        const bg = el.style.getPropertyValue('--elite-tooltip-bg') || el.dataset.tipBg || '';
        const color = el.style.getPropertyValue('--elite-tooltip-color') || (el.dataset.tipBg ? '#000' : '');
        tip.style.background = bg;
        tip.style.color = color;
        tip.style.border = bg ? '2px solid #333' : '';

        // Position off-screen first to measure dimensions without a visible flash.
        tip.style.top = '-9999px';
        tip.style.left = '-9999px';
        tip.style.display = 'block';

        positionTip(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
        if (tip.style.display === 'none') return;
        const el = e.target.closest(SEL);
        if (!el) { tip.style.display = 'none'; return; }
        positionTip(e.clientX, e.clientY);
    });

    document.addEventListener('mouseout', (e) => {
        const el = e.target.closest(SEL);
        if (!el) return;
        if (!el.contains(e.relatedTarget)) {
            tip.style.display = 'none';
        }
    });
}());

// ---------- Config overlay ----------
function openConfig() {
    const currentMode = getCurrentMode();
    document.getElementById('config-mode-switch').checked = (currentMode === 'epic');
    _syncConfigModeSwitch();
    // Open showing the currently active preset, clean state
    CONFIG_PRESET = ACTIVE_QUESTS_PRESET;
    CONFIG_DIRTY = false;
    CONFIG_TEXTAREA_CACHE.heroic = null;
    CONFIG_TEXTAREA_CACHE.epic = null;
    const sel = document.getElementById('config-preset');
    if (sel) { sel.value = ACTIVE_QUESTS_PRESET; sel.style.backgroundColor = ''; sel.style.color = ''; }
    renderConfigList();
    _clearConfigDirty();
    document.getElementById('config-overlay').hidden = false;
    // position export/import buttons next to the centered mode switch
    setTimeout(updateConfigButtonsPosition, 0);
}

function closeConfig() {
    // Reset to the last applied preset, discarding any unsaved edits
    CONFIG_PRESET = ACTIVE_QUESTS_PRESET;
    CONFIG_DIRTY = false;
    CONFIG_TEXTAREA_CACHE.heroic = null;
    CONFIG_TEXTAREA_CACHE.epic = null;
    const sel = document.getElementById('config-preset');
    if (sel) { sel.value = ACTIVE_QUESTS_PRESET; sel.style.backgroundColor = ''; sel.style.color = ''; }
    _clearConfigDirty();
    document.getElementById('config-overlay').hidden = true;
}

function _getConfigMode() {
    return document.getElementById('config-mode-switch')?.checked ? 'epic' : 'heroic';
}

function _syncConfigModeSwitch() {
    const configMode = _getConfigMode();
    const modeSwitch = document.querySelector('#config-overlay .mode-switch');
    if (modeSwitch) {
        modeSwitch.classList.toggle('is-heroic', configMode === 'heroic');
        modeSwitch.classList.toggle('is-epic', configMode === 'epic');
    }
    const label = configMode === 'epic' ? 'Epic' : 'Heroic';
    const exportBtn = document.getElementById('config-export-btn');
    const importBtn = document.getElementById('config-import-btn');
    if (exportBtn) exportBtn.textContent = 'Export ' + label;
    if (importBtn) importBtn.textContent = 'Import ' + label;
    // update position after label change (text width may have changed)
    setTimeout(updateConfigButtonsPosition, 0);
}

// Compute offsets for the centered mode-switch and expose CSS vars
function updateConfigButtonsPosition() {
    const header = document.querySelector('.config-panel-header');
    const center = document.querySelector('.config-header-center');
    const exportBtn = document.getElementById('config-export-btn');
    const importBtn = document.getElementById('config-import-btn');
    if (!header || !center || !exportBtn || !importBtn) return;
    const centerRect = center.getBoundingClientRect();
    const centerHalf = centerRect.width / 2;
    const exportWidth = exportBtn.getBoundingClientRect().width;
    const gap = 32; // px gap between switch and buttons; kept in sync with CSS fallback
    header.style.setProperty('--cfg-center-half', `${centerHalf}px`);
    header.style.setProperty('--cfg-export-width', `${exportWidth}px`);
    header.style.setProperty('--cfg-gap', `${gap}px`);
}

window.addEventListener('resize', () => {
    if (document.getElementById('config-overlay')?.hidden === false) updateConfigButtonsPosition();
});

function renderConfigList() {
    const configMode   = _getConfigMode();
    const baseSource   = configMode === 'epic' ? EPIC_QUESTS_BASE   : HEROIC_QUESTS_BASE;
    const _rawConfigSource = configMode === 'epic'
        ? (CONFIG_PRESET === 'custom' ? EPIC_CUSTOM_CONFIG   : EPIC_UKENBURGER_CONFIG)
        : (CONFIG_PRESET === 'custom' ? HEROIC_CUSTOM_CONFIG : HEROIC_UKENBURGER_CONFIG);
    // If the custom config is empty (never saved), fall back to ukenburger so the textarea isn't blank
    const configSource = _rawConfigSource.length === 0
        ? (configMode === 'epic' ? EPIC_UKENBURGER_CONFIG : HEROIC_UKENBURGER_CONFIG)
        : _rawConfigSource;

    // Names column: from _BASE, excluding sagas, sorted by name
    const baseQuests = baseSource
        .filter(q => !(q && (q.isSaga === true || q.isSaga === 'true')))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

    // Textarea: from _CONFIG (sagas already absent), sorted by name to match
    const configQuests = configSource
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

    const body = document.getElementById('config-body');

    // Header row
    const header = document.createElement('div');
    header.className = 'config-quest-header';

    function _makeHeaderSpinner(id) {
        const spinner = document.createElement('div');
        spinner.className = 'compact-spinner';
        spinner.dataset.target = id;

        const btnDec = document.createElement('button');
        btnDec.type = 'button';
        btnDec.className = 'spin-btn';
        btnDec.dataset.dir = '-1';
        btnDec.setAttribute('aria-label', 'Decrease');
        btnDec.textContent = '\u2212';

        const inp = document.createElement('input');
        inp.type = 'number';
        inp.id = id;
        inp.name = id;
        inp.className = 'spin-input-compact';

        // Configure defaults and step based on spinner purpose
        // travel / quest-time: start at 1, step 0.05
        // bonus / optional XP: start at 0, step 5
        const lname = (id || '').toLowerCase();
        if (lname.includes('travel') || lname.includes('quest-time')) {
            inp.step = '0.05';
            inp.value = '1';
        } else if (lname.includes('bonus') || lname.includes('optional')) {
            inp.step = '5';
            inp.value = '0';
        } else {
            inp.step = '1';
            inp.value = '0';
        }

        // Mark config dirty when a header spinner input is changed
        inp.addEventListener('input', () => { try { _markConfigDirty(); } catch (e) { /* noop */ } });

        const btnInc = document.createElement('button');
        btnInc.type = 'button';
        btnInc.className = 'spin-btn';
        btnInc.dataset.dir = '1';
        btnInc.setAttribute('aria-label', 'Increase');
        btnInc.textContent = '\uff0b';

        // local adjust function mirrors existing spinner logic and applies
        // multiplicative scaling for travel/quest time, additive for bonus/optional.
        function _adjust(dir) {
            const step = parseFloat(inp.step) || 1;
            const oldSpinnerVal = parseFloat(inp.value) || 0;
            const newSpinnerVal = oldSpinnerVal + dir * step;
            const stepStr = String(step);
            const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;

            // Update spinner input value (trim trailing zeros)
            if (decimals === 0) {
                inp.value = String(Math.round(newSpinnerVal));
            } else {
                inp.value = Number(newSpinnerVal).toFixed(decimals).replace(/\.?0+$/, '');
            }
            inp.dispatchEvent(new Event('input', { bubbles: true }));

            // Apply change to textarea column (bulk adjust all rows in that column)
            try {
                const colMap = {
                    'config-hdr-travel-time': 1,
                    'config-hdr-quest-time': 2,
                    'config-hdr-bonus-xp': 3,
                    'config-hdr-optional-xp': 4
                };
                const colIndex = colMap[id];
                if (typeof colIndex === 'number') {
                    const ta = document.querySelector('.config-quest-textarea');
                    if (ta) {
                        const lines = ta.value.split('\n');
                        let out;
                        if (colIndex === 1 || colIndex === 2) {
                            // multiplicative scaling
                            const multiplier = (oldSpinnerVal === 0) ? 1 : (newSpinnerVal / oldSpinnerVal);
                            out = lines.map(line => {
                                if (!line) return line;
                                const parts = line.split('\t');
                                if (parts.length <= colIndex) return line;
                                const raw = parts[colIndex] != null ? parts[colIndex].trim() : '';
                                if (raw === '') return line; // don't populate empty cells
                                const oldVal = parseFloat(raw);
                                if (!isFinite(oldVal)) return line;
                                const changed = oldVal * multiplier;
                                if (decimals === 0) {
                                    parts[colIndex] = String(Math.round(changed));
                                } else {
                                    parts[colIndex] = Number(changed).toFixed(decimals).replace(/\.?0+$/, '');
                                }
                                return parts.join('\t');
                            });
                        } else {
                            // additive behavior for bonus/optional XP
                            const delta = dir * step;
                            out = lines.map(line => {
                                if (!line) return line;
                                const parts = line.split('\t');
                                if (parts.length <= colIndex) return line;
                                const raw = parts[colIndex] != null ? parts[colIndex].trim() : '';
                                if (raw === '') return line;
                                const oldVal = parseFloat(raw);
                                if (!isFinite(oldVal)) return line;
                                let changed = oldVal + delta;
                                if (changed < 0) changed = 0;
                                if (decimals === 0) {
                                    parts[colIndex] = String(Math.round(changed));
                                } else {
                                    parts[colIndex] = Number(changed).toFixed(decimals).replace(/\.?0+$/, '');
                                }
                                return parts.join('\t');
                            });
                        }
                        ta.value = out.join('\n');
                        // trigger textarea input handlers (autosize, dirty flag, highlights)
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            } catch (e) {
                console.error('Error applying header spinner to textarea:', e);
            }
        }

        btnDec.addEventListener('click', () => _adjust(-1));
        btnInc.addEventListener('click', () => _adjust(1));

        spinner.appendChild(btnDec);
        spinner.appendChild(inp);
        spinner.appendChild(btnInc);
        return spinner;
    }

    const nameHeader = document.createElement('div');
    nameHeader.className = 'config-quest-header-name';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'config-header-label-text';
    nameLabel.textContent = 'Questname';
    nameHeader.appendChild(nameLabel);
    header.appendChild(nameHeader);

    const colsHeader = document.createElement('div');
    colsHeader.className = 'config-quest-header-cols';
    const _colHeaderSpinners = {
        'Quest Name':  'config-hdr-travel-time',
        'Travel Time': 'config-hdr-quest-time',
        'Quest Time':  'config-hdr-bonus-xp',
        '% Bonus':     'config-hdr-optional-xp'
    };
    for (const label of ['Quest Name', 'Travel Time', 'Quest Time', '% Bonus', '% Optional']) {
        const col = document.createElement('div');
        col.className = 'config-quest-header-col';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'config-header-label-text';
        labelSpan.textContent = label;
        col.appendChild(labelSpan);
        if (_colHeaderSpinners[label]) {
            col.appendChild(_makeHeaderSpinner(_colHeaderSpinners[label]));
        }
        colsHeader.appendChild(col);
    }
    header.appendChild(colsHeader);

    // Quest list
    const wrapper = document.createElement('div');
    wrapper.className = 'config-quest-list';

    const namesCol = document.createElement('div');
    namesCol.className = 'config-quest-names';
    for (const q of baseQuests) {
        const nameEl = document.createElement('div');
        nameEl.className = 'config-quest-name';
        nameEl.textContent = q.name;
        nameEl.title = q.name;
        namesCol.appendChild(nameEl);
    }

    const textarea = document.createElement('textarea');
    textarea.className = 'config-quest-textarea';
    // Match textarea height to the quest name rows: each .config-quest-name is 15px tall
    const lineHeightPx = 15;
    const minHeight = configQuests.length * lineHeightPx;
    textarea.style.minHeight = minHeight + 'px';
    textarea.style.height = minHeight + 'px';
    textarea.spellcheck = false;

    // Pre-fill textarea from config source
    textarea.value = _configToTextareaLines(configQuests);

    // Autosize textarea so it never shows its own vertical scrollbar.
    function autosize() {
        textarea.style.height = 'auto';
        const newHeight = Math.max(textarea.scrollHeight, minHeight);
        textarea.style.height = newHeight + 'px';
    }
    // initial size based on content
    autosize();
    textarea.addEventListener('input', autosize);
    textarea.addEventListener('input', () => { _markConfigDirty(); });
    // Update quest-name highlights on input
    textarea.addEventListener('input', () => { _updateConfigQuestNameHighlights(namesCol, textarea, nameHeader); });

    textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.setRangeText('\t', start, end, 'end');
            textarea.selectionStart = textarea.selectionEnd = start + 1;
        }
    });

    wrapper.appendChild(namesCol);
    wrapper.appendChild(textarea);

    // If there's cached textarea content for this mode, restore it
    const cachedContent = CONFIG_TEXTAREA_CACHE[configMode];
    if (cachedContent !== null) {
        textarea.value = cachedContent;
        autosize();
        _updateConfigQuestNameHighlights(namesCol, textarea, nameHeader);
    }

    const footer = document.createElement('div');
    footer.className = 'config-quest-footer';

    // Initial highlights for the freshly rendered list
    _updateConfigQuestNameHighlights(namesCol, textarea, nameHeader);

    body.replaceChildren(header, wrapper, footer);
}

function discardConfig() {
    // Reset to clean custom state, reload from current QUESTS_CONFIG
    CONFIG_PRESET = 'custom';
    CONFIG_DIRTY = false;
    CONFIG_TEXTAREA_CACHE.heroic = null;
    CONFIG_TEXTAREA_CACHE.epic = null;
    const sel = document.getElementById('config-preset');
    if (sel) { sel.value = 'custom'; sel.style.backgroundColor = ''; sel.style.color = ''; }
    renderConfigList();
    _clearConfigDirty();
}

function saveConfig(textarea) {
    // Persist the currently visible textarea into its cache slot
    const currentMode = _getConfigMode();
    CONFIG_TEXTAREA_CACHE[currentMode] = textarea.value;

    // Confirm before overwriting an *existing* custom config
    const hasExistingCustom = HEROIC_CUSTOM_CONFIG.length > 0 || EPIC_CUSTOM_CONFIG.length > 0;
    if (CONFIG_DIRTY && hasExistingCustom) {
        if (!confirm('Are you sure you want to overwrite Custom config?')) return;
    }

    if (CONFIG_PRESET === 'custom') {
        // Parse textarea caches and store into the custom config variables
        if (CONFIG_TEXTAREA_CACHE.heroic !== null) {
            window.HEROIC_CUSTOM_CONFIG = _parseConfigLines(CONFIG_TEXTAREA_CACHE.heroic);
        }
        if (CONFIG_TEXTAREA_CACHE.epic !== null) {
            window.EPIC_CUSTOM_CONFIG = _parseConfigLines(CONFIG_TEXTAREA_CACHE.epic);
        }
        window.ACTIVE_QUESTS_PRESET = 'custom';
    } else {
        // Ukenburger preset: leave HEROIC_CUSTOM_CONFIG / EPIC_CUSTOM_CONFIG untouched
        window.ACTIVE_QUESTS_PRESET = 'ukenburger';
    }

    _rebuildHeroicQuests();
    _rebuildEpicQuests();

    // Re-hydrate both levelplans so items pick up the updated config fields
    const heroicSerial = serialiseLevelplan(data.levelplanByMode.heroic);
    const epicSerial   = serialiseLevelplan(data.levelplanByMode.epic);
    data.levelplanByMode.heroic = hydrateLevelplan(heroicSerial, HEROIC_QUESTS);
    data.levelplanByMode.epic   = hydrateLevelplan(epicSerial,   EPIC_QUESTS);
    data.levelplan = data.levelplanByMode[getCurrentMode()];

    rebuildQuestsFromLevelplan();
    _xpMinTableCache.heroic = null;
    _xpMinTableCache.epic = null;
    computeXpMinTable();
    checkRequirements();
    populatePatronViewSelect();
    renderLists();
    _clearConfigDirty();
    // Persist the updated config and preset to localStorage
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
        activePreset: ACTIVE_QUESTS_PRESET,
        heroicCustomConfig: HEROIC_CUSTOM_CONFIG,
        epicCustomConfig: EPIC_CUSTOM_CONFIG
    }));
    closeConfig();
}

function applyConfig() {
    const textarea = document.querySelector('.config-quest-textarea');
    if (!textarea) {
        console.error('Config textarea not found');
        return;
    }
    saveConfig(textarea);
}

// Shows a small modal dialog with custom buttons. Returns a Promise that resolves
// to the `value` of whichever button the user clicks.
function _showChoiceDialog(message, choices) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:99999',
            'background:rgba(0,0,0,0.55)', 'display:flex',
            'align-items:center', 'justify-content:center'
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
            'background:#2c2c2c', 'color:#e0e0e0', 'border-radius:10px',
            'padding:28px 32px', 'max-width:420px', 'width:90%',
            'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'font-family:inherit',
            'display:flex', 'flex-direction:column', 'gap:16px'
        ].join(';');

        const msg = document.createElement('p');
        msg.textContent = message;
        msg.style.cssText = 'margin:0;font-size:1em;line-height:1.5;';
        box.appendChild(msg);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
        for (const { label, value } of choices) {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = [
                'padding:8px 14px', 'border-radius:6px', 'border:1px solid rgba(255,255,255,0.15)',
                'background:#3a3a3a', 'color:#e0e0e0', 'cursor:pointer',
                'font-size:0.9em', 'text-align:left', 'transition:background 0.15s'
            ].join(';');
            btn.addEventListener('mouseenter', () => { btn.style.background = '#4a4a4a'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#3a3a3a'; });
            btn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(value);
            });
            btnRow.appendChild(btn);
        }
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

// Exports the current HEROIC_CUSTOM_CONFIG + EPIC_CUSTOM_CONFIG as a JSON file.
function _exportCustomConfigToFile() {
    // Export the config currently shown in the Config panel (respect mode + preset)
    const configMode = _getConfigMode();
    const _rawConfigSource = configMode === 'epic'
        ? (CONFIG_PRESET === 'custom' ? EPIC_CUSTOM_CONFIG   : EPIC_UKENBURGER_CONFIG)
        : (CONFIG_PRESET === 'custom' ? HEROIC_CUSTOM_CONFIG : HEROIC_UKENBURGER_CONFIG);
    const configSource = (_rawConfigSource && _rawConfigSource.length > 0)
        ? _rawConfigSource
        : (configMode === 'epic' ? EPIC_UKENBURGER_CONFIG : HEROIC_UKENBURGER_CONFIG);

    // Build CSV content with header
    let csvContent = 'Quest Name,Travel Time,Quest Time,Bonus XP,Optional XP\n';

    // Sort by quest name
    configSource
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(q => {
            const questName = `"${q.name}"`;
            const travel = q.travelTime != null ? q.travelTime : '';
            const qtime = q.qTime != null ? q.qTime : '';
            const bonus = (q.xpMult !== null && q.xpMult !== undefined && q.xpMult !== '') 
                ? Math.round(Number(q.xpMult) * 100) : '';
            const opt = (q.optionalXP !== null && q.optionalXP !== undefined && q.optionalXP !== '') 
                ? Math.round(Number(q.optionalXP) * 100) : '';
            csvContent += `${questName},${travel},${qtime},${bonus},${opt}\n`;
        });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom_config.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportConfig() {
    _exportCustomConfigToFile();
}

function importConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const fileContent = event.target?.result || '';

                if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.tsv')) {
                    alert('Please select a .csv or .tsv file');
                    return;
                }

                const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
                if (lines.length === 0) {
                    alert('Invalid file: empty or no data');
                    return;
                }

                // Detect optional header row: if the first non-empty line contains common header keywords,
                // treat it as a header and start parsing from the next line. Otherwise, accept missing header.
                let startIndex = 0;
                const firstLine = lines[0].trim();
                const headerRegex = /(quest|travel|bonus|optional|xp|qtime)/i;
                if (headerRegex.test(firstLine)) startIndex = 1;

                const importedData = [];
                const failedLines = [];
                // Start from detected index (0 if no header, 1 if header present)
                for (let i = startIndex; i < lines.length; i++) {
                    const line = lines[i];
                    if (!line.trim()) continue;

                    // If the line looks tab-separated, parse as TSV; otherwise fall back to CSV parsing
                    if (line.indexOf('\t') >= 0) {
                        const parts = line.split('\t').map(p => p.trim());
                        if (parts.length < 5) {
                            failedLines.push({ lineNumber: i + 1, text: line });
                            continue;
                        }
                        let name = parts[0];
                        if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
                        const entry = { name: name };
                        const travel = parts[1];
                        const qtime = parts[2];
                        const bonus = parts[3];
                        const opt = parts[4];
                        if (travel !== '') { const v = parseFloat(travel); if (isFinite(v)) entry.travelTime = v; }
                        if (qtime !== '') { const v = parseFloat(qtime); if (isFinite(v)) entry.qTime = v; }
                        if (bonus !== '') { const v = parseFloat(bonus); if (isFinite(v)) entry.xpMult = v / 100; }
                        if (opt !== '') { const v = parseFloat(opt); if (isFinite(v)) entry.optionalXP = v / 100; }
                        importedData.push(entry);
                        continue;
                    }

                    // Accept either quoted or unquoted quest name CSV lines
                    const csvQuoted = /^"([^"]*)"\s*,\s*([^,]*)\s*,\s*([^,]*)\s*,\s*([^,]*)\s*,\s*([^,]*)\s*$/;
                    const csvUnquoted = /^([^,]+)\s*,\s*([^,]*)\s*,\s*([^,]*)\s*,\s*([^,]*)\s*,\s*([^,]*)\s*$/;
                    let match = line.match(csvQuoted);
                    if (!match) match = line.match(csvUnquoted);
                    if (!match) {
                        failedLines.push({ lineNumber: i + 1, text: line });
                        continue;
                    }
                    const entry = { name: (match[1] || '').trim() };
                    const travel = match[2]?.trim();
                    const qtime = match[3]?.trim();
                    const bonus = match[4]?.trim();
                    const opt = match[5]?.trim();
                    if (travel !== '') { const v = parseFloat(travel); if (isFinite(v)) entry.travelTime = v; }
                    if (qtime !== '') { const v = parseFloat(qtime); if (isFinite(v)) entry.qTime = v; }
                    if (bonus !== '') { const v = parseFloat(bonus); if (isFinite(v)) entry.xpMult = v / 100; }
                    if (opt !== '') { const v = parseFloat(opt); if (isFinite(v)) entry.optionalXP = v / 100; }
                    importedData.push(entry);
                }

                // If we couldn't parse any valid entries, don't overwrite the user's custom config
                if (importedData.length === 0) {
                    alert('Import failed: no valid quest entries parsed. No changes were made.');
                    return;
                }

                // Do NOT write to the in-memory custom config here — that must only happen
                // when the user explicitly clicks Apply. Instead, put the imported text into
                // the textarea cache so renderConfigList() displays it, and let the normal
                // dirty/apply flow handle committing it.
                const configMode = _getConfigMode();
                CONFIG_TEXTAREA_CACHE[configMode] = _configToTextareaLines(importedData);
                _markConfigDirty();
                renderConfigList();
                if (failedLines.length > 0) {
                    alert('Config imported with warnings: ' + importedData.length + ' entries imported, ' + failedLines.length + ' lines skipped.');
                } else {
                    alert('Config imported successfully!');
                }
            } catch (err) {
                alert('Error importing config: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

// Close config when clicking the backdrop
document.getElementById('config-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeConfig();
});
