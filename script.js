﻿// Storage key for localStorage
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
if (typeof HEROIC_DEFAULT_CONFIG === 'undefined') {
  window.HEROIC_DEFAULT_CONFIG = [];
  console.warn('HEROIC_DEFAULT_CONFIG not found. Ensure heroic_default_config.js is included before script.js');
}
if (typeof EPIC_DEFAULT_CONFIG === 'undefined') {
  window.EPIC_DEFAULT_CONFIG = [];
  console.warn('EPIC_DEFAULT_CONFIG not found. Ensure epic_default_config.js is included before script.js');
}

// User-saved custom config slots — only written to when the user explicitly saves a Custom config.
window.HEROIC_CUSTOM_CONFIG = [];
window.EPIC_CUSTOM_CONFIG   = [];

// Imported config slots — populated whenever a levelplan file is loaded that includes config data.
// Like the Default preset, these are not directly editable in the config panel.
window.HEROIC_IMPORTED_CONFIG = [];
window.EPIC_IMPORTED_CONFIG   = [];

// Tracks which preset is currently applied to build HEROIC_QUESTS / EPIC_QUESTS.
window.ACTIVE_QUESTS_PRESET = 'default';

// Resolve a preset name to its underlying heroic config array.
function _getHeroicConfigForPreset(preset) {
    if (preset === 'custom')   return HEROIC_CUSTOM_CONFIG;
    if (preset === 'imported') return HEROIC_IMPORTED_CONFIG;
    return HEROIC_DEFAULT_CONFIG;
}

// Resolve a preset name to its underlying epic config array.
function _getEpicConfigForPreset(preset) {
    if (preset === 'custom')   return EPIC_CUSTOM_CONFIG;
    if (preset === 'imported') return EPIC_IMPORTED_CONFIG;
    return EPIC_DEFAULT_CONFIG;
}

// Rebuild HEROIC_QUESTS from whichever config source is currently active.
function _rebuildHeroicQuests() {
    const src = _getHeroicConfigForPreset(ACTIVE_QUESTS_PRESET);
    const cfgMap = Object.fromEntries(src.map(c => [c.name, c]));
    window.HEROIC_QUESTS = window.HEROIC_QUESTS_BASE.map(
        base => Object.assign({}, base, cfgMap[base.name] || {})
    );
}

// Rebuild EPIC_QUESTS from whichever config source is currently active.
function _rebuildEpicQuests() {
    const src = _getEpicConfigForPreset(ACTIVE_QUESTS_PRESET);
    const cfgMap = Object.fromEntries(src.map(c => [c.name, c]));
    window.EPIC_QUESTS = window.EPIC_QUESTS_BASE.map(
        base => Object.assign({}, base, cfgMap[base.name] || {})
    );
}

function _computeQuestXP(mode) {

    const tomeBonus =  getLearningTomeBonus(mode);
    for (const q of (mode === 'heroic' ? window.HEROIC_QUESTS : window.EPIC_QUESTS)) {
        if (q.baseXP != null) {
            const xpmods = (q.xpmods != null && q.xpmods !== '') ? Number(q.xpmods) : 0;
            const optXP  = (q.optionalXP != null && q.optionalXP !== '') ? Number(q.optionalXP) : 0;
            q.xp = Math.round(q.baseXP * (1 + xpmods + optXP + getQuickQuestVariableBonus(mode, q.difficulty, false, tomeBonus)));
        }
        // else: saga / custom-xp entry — .xp stays as defined in the base data
    }
}

// Initial build (default: Default)
_rebuildHeroicQuests();
_rebuildEpicQuests();

// Cache for config textarea content per mode to preserve user edits when switching
const CONFIG_TEXTAREA_CACHE = {
  heroic: null,
  epic: null
};

// Current preset in the config dropdown: 'default' or 'custom'
let CONFIG_PRESET = 'default';
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
            const bonus  = (q.xpmods !== null && q.xpmods !== undefined && q.xpmods !== '')
                ? Math.round(Number(q.xpmods) * 100) : '';
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
        if (bonusRaw  !== '') { const v = parseFloat(bonusRaw);  if (isFinite(v)) entry.xpmods     = v / 100; }
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
        // from something else (e.g. 'default') to 'custom'. If the user
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
//   and `CONFIG_DIRTY` is true. This ensures `Default` keeps its default
//   appearance unless `custom` is both highlighted and selected.
function _updateConfigPresetVisual() {
    const sel = document.getElementById('config-preset');
    if (!sel) return;
    const customOpt = sel.querySelector('option[value="custom"]');
    const ukenOpt = sel.querySelector('option[value="default"]');
    const importedOpt = sel.querySelector('option[value="imported"]');
    if (customOpt) {
        if (CONFIG_DIRTY_HIGHLIGHT) {
            customOpt.style.backgroundColor = '#e6c200';
            customOpt.style.color = '#000';
        } else {
            customOpt.style.backgroundColor = '';
            customOpt.style.color = '';
        }
    }
    const _normalizeOpt = (opt) => {
        if (!opt) return;
        if (CONFIG_DIRTY_HIGHLIGHT) {
            // Force non-custom options to remain visually normal while Custom is highlighted
            opt.style.backgroundColor = '#fff';
            opt.style.color = '#000';
        } else {
            opt.style.backgroundColor = '';
            opt.style.color = '';
        }
    };
    _normalizeOpt(ukenOpt);
    _normalizeOpt(importedOpt);
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
        { name: 'Custom', xp: 0, qTime: 0, travelTime: 0, source: 'special', isCustom: true },
        { name: 'XP Pot', xp: 0, source: 'special', isXpPot: true }
    ];

    // loadSettings() must run before hydrating the level plan (and before setActiveMode())
    loadSettings();
    _computeQuestXP('heroic');
    _computeQuestXP('epic');

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            const heroicStored = Array.isArray(parsed?.heroic) ? parsed.heroic : [];
            const epicStored = Array.isArray(parsed?.epic) ? parsed.epic : [];
            data.levelplanByMode.heroic = hydrateLevelplan(heroicStored, HEROIC_QUESTS, 'heroic');
            data.levelplanByMode.epic = hydrateLevelplan(epicStored, EPIC_QUESTS, 'epic');
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

        // Re-render lists when XP multiplier changes, and persist.
    const multiplierInput = document.getElementById('xp-multiplier');
    if (multiplierInput) {
        multiplierInput.addEventListener('input', () => {
            saveSettings();
            renderLists();
        });
    }

    // Populate and wire up the Tome of Learning dropdown.
    // (loadSettings already restores the saved value; this is a safe fallback
    // for first-run when there are no saved settings yet.)
    populateLearningTomeSelect();
        const learningTomeSel = document.getElementById('learning-tome');
    if (learningTomeSel) {
        learningTomeSel.addEventListener('change', () => {
            _learningTomeByMode[getCurrentMode()] = learningTomeSel.value || '0';
            saveSettings();
            const mode = getCurrentMode();
            _computeQuestXP(mode);
            if (mode === 'epic') {
                // Invalidate xpMin table cache since quest XP values changed
                _xpMinTableCache.epic = null;
                computeXpMinTable();
                // Re-hydrate levelplan items so they pick up new XP values
                const epicSerial = serialiseLevelplan(data.levelplanByMode.epic);
                data.levelplanByMode.epic = hydrateLevelplan(epicSerial,   EPIC_QUESTS, 'epic');
            } else {
                // Invalidate xpMin table cache since quest XP values changed
                _xpMinTableCache.heroic = null;
                computeXpMinTable();
                // Re-hydrate levelplan items so they pick up new XP values
                const heroicSerial = serialiseLevelplan(data.levelplanByMode.heroic);
                data.levelplanByMode.heroic = hydrateLevelplan(heroicSerial, HEROIC_QUESTS, 'heroic');
            }
            data.levelplan = data.levelplanByMode[mode];
            rebuildQuestsFromLevelplan();
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
    // Default slayer bonus dropdown — re-render both lists and persist
    const defaultSlayerBonusSel = document.getElementById('default-slayer-bonus');
    if (defaultSlayerBonusSel) {
        defaultSlayerBonusSel.addEventListener('change', () => {
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
            // Repopulate the learning tome dropdown for the new mode and
            // restore the per-mode saved value from localStorage.
                        // modeSwitch.checked has already flipped, so getCurrentMode()
            // returns the new mode. Restore its value from the in-memory store.
            populateLearningTomeSelect(_learningTomeByMode[getCurrentMode()] || '0');
            saveSettings();
            _computeQuestXP(getCurrentMode());
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
    // Config preset dropdown (Default / Custom)
    const configPresetSelect = document.getElementById('config-preset');
    if (configPresetSelect) {
        configPresetSelect.addEventListener('change', () => {
            const newPreset = configPresetSelect.value;
            if (newPreset === 'default') {
                CONFIG_TEXTAREA_CACHE.heroic = _configToTextareaLines(HEROIC_DEFAULT_CONFIG);
                CONFIG_TEXTAREA_CACHE.epic   = _configToTextareaLines(EPIC_DEFAULT_CONFIG);
            } else if (newPreset === 'imported') {
                // If no imported config available, fall back to default as a starting point
                CONFIG_TEXTAREA_CACHE.heroic = _configToTextareaLines(
                    HEROIC_IMPORTED_CONFIG.length > 0 ? HEROIC_IMPORTED_CONFIG : HEROIC_DEFAULT_CONFIG
                );
                CONFIG_TEXTAREA_CACHE.epic   = _configToTextareaLines(
                    EPIC_IMPORTED_CONFIG.length > 0 ? EPIC_IMPORTED_CONFIG : EPIC_DEFAULT_CONFIG
                );
            } else {
                // If no custom config saved yet, fall back to default as a starting point
                CONFIG_TEXTAREA_CACHE.heroic = _configToTextareaLines(
                    HEROIC_CUSTOM_CONFIG.length > 0 ? HEROIC_CUSTOM_CONFIG : HEROIC_DEFAULT_CONFIG
                );
                CONFIG_TEXTAREA_CACHE.epic   = _configToTextareaLines(
                    EPIC_CUSTOM_CONFIG.length > 0 ? EPIC_CUSTOM_CONFIG : EPIC_DEFAULT_CONFIG
                );
            }
            CONFIG_PRESET = newPreset;
            _clearConfigDirty();
            renderConfigList();
        });
    }

    // Leveling Plan search box
    initLevelplanSearch();

    // If the page was opened with a leveling plan encoded in the URL hash,
    // decode + apply it (same path as Load), then strip the hash so a refresh
    // doesn't keep re-importing.
    if (window.location.hash && window.location.hash.length > 1) {
        const encoded = window.location.hash.slice(1);
        (async () => {
            try {
                const parsed = await _decodeHashToPayload(encoded);
                await _applyLoadedPayload(parsed);
                history.replaceState(null, '', window.location.pathname + window.location.search);
            } catch (err) {
                alert('Error loading shared link: ' + err.message);
            }
        })();
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
        { name: 'Custom', xp: 0, qTime: 0, travelTime: 0, source: 'special', isCustom: true },
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
function hydrateLevelplan(stored, questSource, mode) {
    const source = questSource || getActiveQuests();
    const initialByName = new Map(source.map(q => [q.name, q]));
    return stored.map(entry => {
        if (entry.takeLevel) {
            return {
                name: 'Take Level', xp: 0, level: '', source: 'special', isTakeLevel: true,
                qTime: entry.qTime || 0,
                travelTime: entry.travelTime || 0
            };
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
                name: entry.name || 'Custom',
                xp: entry.xp || 0,
                qTime: entry.qTime || 0,
                travelTime: 0,
                applyMultipliers: entry.applyMultipliers === true || entry.applyMultipliers === 'true' ? true : false,
                source: 'special',
                isCustom: true
            };
        }

        const base = initialByName.get(entry.name);
        if (!base) return null; // unknown quest — drop silently

        if (entry.elite) {
            const eliteXP = base.baseXP * ( 1 + base.optionalXP + base.xpmods + getQuestVariableBonus(mode, 'E', true));
            return { ...base, name: base.name + ' (repeat)', xp: eliteXP, travelTime: 0.0, isEliteCopy: true, difficulty: 'E', source: 'quests', patron: null, favor: null };
        }
        const id = source.indexOf(base);
        const result = { ...base, id, source: 'quests' };
        // Restore slayer bonus if present
        if (entry.slayerBonus) {
            result.slayerBonus = entry.slayerBonus;
        }
        return result;
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

// Per-mode learning tome bonus values — the single in-memory source of truth.
// Populated from localStorage once by loadSettings(); updated in-place from
// then on by saveSettings(), the mode-switch handler, and _applyLoadedPayload().
// localStorage is only ever written (never re-read mid-flight) for persistence.
let _learningTomeByMode = { heroic: '0', epic: '0' };

// The Tome of Learning options per mode.
const LEARNING_TOME_OPTIONS = {
    heroic: [
        { label: 'No Heroic Tome of Learning', bonus: 0 , repeatBonus: 0 },
        { label: 'Heroic Lesser Tome 25%',     bonus: 0.25, repeatBonus: 0.1 },
        { label: 'Heroic Greater Tome 50%',    bonus: 0.50, repeatBonus: 0.2 }
    ],
    epic: [
        { label: 'No Epic Tome of Learning', bonus: 0, repeatBonus: 0 },
        { label: 'Epic Lesser Tome 15%',     bonus: 0.15, repeatBonus: 0.05 },
        { label: 'Epic Greater Tome 25%',    bonus: 0.25, repeatBonus: 0.1 }
    ]
};

// Populate the learning-tome <select> for the current mode and optionally
// restore a previously saved value.
function populateLearningTomeSelect(restoreValue) {
    const sel = document.getElementById('learning-tome');
    if (!sel) return;
    const mode = getCurrentMode();
    const options = LEARNING_TOME_OPTIONS[mode];
    const prevValue = restoreValue !== undefined ? String(restoreValue) : sel.value;
    sel.innerHTML = '';
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = String(opt.bonus);
        el.textContent = opt.label;
        sel.appendChild(el);
    });
    if ([...sel.options].some(o => o.value === prevValue)) {
        sel.value = prevValue;
    } else {
        sel.value = '0';
    }
}

function getQuestVariableBonus(mode, difficulty, repeat) {
    const learning = repeat ? getLearningTomeRepeatBonus(mode) : getLearningTomeBonus(mode);

    return getQuickQuestVariableBonus(mode, difficulty, repeat, learning);
}

function getQuickQuestVariableBonus(mode, difficulty, repeat, learningTomeBonus) {
    let delve = 0;
    let firstTimeDif = 0;
    if (difficulty === 'R') {
        delve = 1.5;
        firstTimeDif = 0.45;
    } else if (difficulty === 'E') {
        delve = 1;
        firstTimeDif = 0.45;
    } else if (difficulty === 'H') {
        delve = 0.5;
        firstTimeDif = 0.2;
    } else {
        firstTimeDif = 0.2;
    }

    const firstTimeDay = repeat ? 0 : mode == 'epic' ? 0.4 : 0.25;

    return firstTimeDif + (repeat ? 0 : delve) + learningTomeBonus + firstTimeDay;
}



// Returns the raw bonus string value for the given mode.
// Always reads from the in-memory store, which is kept in sync with the
// dropdown by the change listener and saveSettings().
function _getLearningTomeBonusValue(mode) {
    return _learningTomeByMode[mode || getCurrentMode()] || '0';
}

// Returns the additive per-item XP bonus fraction from the currently selected
// Tome of Learning (e.g. 0.25 for a 25% tome).
// Pass `mode` when calling for a mode that may differ from the active UI mode.
function getLearningTomeBonus(mode) {
    const v = parseFloat(_getLearningTomeBonusValue(mode));
    return isFinite(v) ? v : 0;
}

// Returns the additive per-item XP bonus fraction from the currently selected
// Tome of Learning (e.g. 0.25 for a 25% tome).
// Pass `mode` when calling for a mode that may differ from the active UI mode.
function getLearningTomeRepeatBonus(mode) {
    const bonusVal = _getLearningTomeBonusValue(mode);
    const resolvedMode = mode || getCurrentMode();
    return LEARNING_TOME_OPTIONS[resolvedMode].find(opt => String(opt.bonus) === bonusVal)?.repeatBonus || 0;
}

// Returns the default slayer bonus string (e.g. 'No Count Boost') from the
// plan-settings dropdown. Used as the fallback for slayer items that have no
// explicit per-item bonus set, both in the quests list and the levelplan.
function getDefaultSlayerBonus() {
    const sel = document.getElementById('default-slayer-bonus');
    return (sel && sel.value) ? sel.value : 'No Count Boost';
}

// Save/load the xp-multiplier input to/from localStorage
function saveSettings() {
    const xpmultiplier = document.getElementById('xp-multiplier')?.value;
    const patronView = document.getElementById('patron-view')?.value || 'None';
    const mode = document.getElementById('mode-switch')?.checked ? 'epic' : 'heroic';
    const vipSagas = document.getElementById('vip-sagas-header')?.checked ? true : false;
    const twelveTokens = document.getElementById('twelve-tokens')?.checked ? true : false;
    const learningTome = document.getElementById('learning-tome')?.value || '0';
    const defaultSlayerBonus = document.getElementById('default-slayer-bonus')?.value || 'No Count Boost';
    // Update the in-memory store for the current mode, then persist everything
    // to localStorage. No re-read needed — _learningTomeByMode already holds
    // the other mode's value.
    _learningTomeByMode[mode] = learningTome;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ xpmultiplier, patronView, mode, vipSagas, twelveTokens, learningTomeByMode: _learningTomeByMode, defaultSlayerBonus }));
    // Persist custom config and active preset separately
    localStorage.setItem(CONFIG_KEY, JSON.stringify({
        activePreset: ACTIVE_QUESTS_PRESET,
        heroicCustomConfig: HEROIC_CUSTOM_CONFIG,
        epicCustomConfig: EPIC_CUSTOM_CONFIG,
        heroicImportedConfig: HEROIC_IMPORTED_CONFIG,
        epicImportedConfig: EPIC_IMPORTED_CONFIG
    }));
}

function loadSettings() {
    // Restore custom config and active preset first so quest lists build correctly
    const rawConfig = localStorage.getItem(CONFIG_KEY);
    if (rawConfig) {
        try {
            const { activePreset, heroicCustomConfig, epicCustomConfig, heroicImportedConfig, epicImportedConfig } = JSON.parse(rawConfig);
            if (Array.isArray(heroicCustomConfig)) window.HEROIC_CUSTOM_CONFIG = heroicCustomConfig;
            if (Array.isArray(epicCustomConfig))   window.EPIC_CUSTOM_CONFIG   = epicCustomConfig;
            if (Array.isArray(heroicImportedConfig)) window.HEROIC_IMPORTED_CONFIG = heroicImportedConfig;
            if (Array.isArray(epicImportedConfig))   window.EPIC_IMPORTED_CONFIG   = epicImportedConfig;
            if (activePreset === 'custom' || activePreset === 'default' || activePreset === 'imported') {
                window.ACTIVE_QUESTS_PRESET = activePreset;
            }
            _rebuildHeroicQuests();
            _rebuildEpicQuests();
        } catch (e) { /* ignore corrupt config */ }
    }

    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
        const { xpmultiplier, patronView, favorView, mode, vipSagas, twelveTokens, learningTomeByMode, defaultSlayerBonus } = JSON.parse(raw);
        const xpInput = document.getElementById('xp-multiplier');
        const pvSelect = document.getElementById('patron-view');
        const modeSwitch = document.getElementById('mode-switch');
        const vipCb = document.getElementById('vip-sagas-header');
        const tokensCb = document.getElementById('twelve-tokens');
        const tokensLabel = document.getElementById('twelve-tokens-label');
        if (vipCb && vipSagas !== undefined) vipCb.checked = vipSagas;
        if (xpInput && xpmultiplier !== undefined) xpInput.value = xpmultiplier;
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
        // Initialise the in-memory store from the persisted values, then
        // populate the dropdown for the active mode.
        if (learningTomeByMode) {
            _learningTomeByMode = {
                heroic: learningTomeByMode.heroic || '0',
                epic:   learningTomeByMode.epic   || '0'
            };
        }
        const activeMode = (mode === 'epic') ? 'epic' : 'heroic';
        populateLearningTomeSelect(_learningTomeByMode[activeMode]);
        // Restore default slayer bonus setting.
        const slayerBonusSel = document.getElementById('default-slayer-bonus');
        if (slayerBonusSel && defaultSlayerBonus) slayerBonusSel.value = defaultSlayerBonus;
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
        if (item.isTakeLevel) {
            const out = { takeLevel: true };
            if (item.qTime != null && item.qTime !== 0) out.qTime = item.qTime;
            if (item.travelTime != null && item.travelTime !== 0) out.travelTime = item.travelTime;
            return out;
        }
        if (item.isXpPotStart) return item.pct != null ? { xpPotStart: true, pct: item.pct } : { xpPotStart: true };
        if (item.isXpPotEnd) return item.pct != null ? { xpPotEnd: true, pct: item.pct } : { xpPotEnd: true };
        if (item.isXpPot) return { xpPot: true };
        if (item.isCustom) {
            return {
                custom: true,
                name: item.name,
                xp: item.xp,
                qTime: item.qTime,
                applyMultipliers: item.applyMultipliers ? true : false
            };
        }
        if (item.isEliteCopy) {
            const baseName = item.name.endsWith(' (repeat)')
                ? item.name.slice(0, -' (repeat)'.length)
                : item.name;
            return { name: baseName, elite: true };
        }
        const result = { name: item.name };
        // Store slayer bonus if present and not default
        if (item.slayerBonus && item.slayerBonus !== 'No Slayer Bonus') {
            result.slayerBonus = item.slayerBonus;
        }
        return result;
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

// Shows a styled HTML confirm modal matching the app's dark theme.
// Returns a Promise that resolves to true (confirmed) or false (cancelled).
function _showConfirmDialog(message) {
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
            'padding:28px 32px', 'max-width:380px', 'width:90%',
            'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'font-family:inherit',
            'display:flex', 'flex-direction:column', 'gap:14px'
        ].join(';');

        const msg = document.createElement('p');
        msg.textContent = message;
        msg.style.cssText = 'margin:0;font-size:0.95em;line-height:1.4;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

        const dismiss = value => { overlay.remove(); resolve(value); };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'No';
        cancelBtn.style.cssText = [
            'background:#444', 'color:#e0e0e0', 'border:none', 'border-radius:6px',
            'padding:8px 18px', 'cursor:pointer', 'font-size:0.95em', 'font-family:inherit'
        ].join(';');
        cancelBtn.addEventListener('click', () => dismiss(false));

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Yes';
        confirmBtn.style.cssText = [
            'background:#4a7a4a', 'color:#fff', 'border:none', 'border-radius:6px',
            'padding:8px 18px', 'cursor:pointer', 'font-size:0.95em', 'font-family:inherit'
        ].join(';');
        confirmBtn.addEventListener('click', () => dismiss(true));

        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(false); });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        box.appendChild(msg);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        setTimeout(() => confirmBtn.focus(), 0);
    });
}

// Shows a styled HTML modal to enter a filename.
// defaultName: suggested name without extension. extension: e.g. '.json' or '.csv'.
// Returns a Promise that resolves to the full filename string, or null if cancelled.
function _showFilenameDialog(defaultName, extension) {
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
            'padding:28px 32px', 'max-width:380px', 'width:90%',
            'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'font-family:inherit',
            'display:flex', 'flex-direction:column', 'gap:14px'
        ].join(';');

        const label = document.createElement('label');
        label.textContent = 'Save as:';
        label.style.cssText = 'font-size:0.95em;';

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = defaultName;
        inp.style.cssText = [
            'background:#1a1a1a', 'color:#e0e0e0', 'border:1px solid #555',
            'border-radius:5px', 'padding:6px 10px', 'font-size:1em',
            'font-family:inherit', 'width:100%', 'box-sizing:border-box'
        ].join(';');

        // Row to hold the input and extension hint on the same line
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';

        const extHint = document.createElement('span');
        extHint.textContent = extension;
        extHint.style.cssText = 'color:#888;font-size:0.95em;flex:0 0 auto;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

        const dismiss = value => { overlay.remove(); resolve(value); };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = [
            'background:#444', 'color:#e0e0e0', 'border:none', 'border-radius:6px',
            'padding:8px 18px', 'cursor:pointer', 'font-size:0.95em', 'font-family:inherit'
        ].join(';');
        cancelBtn.addEventListener('click', () => dismiss(null));

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = [
            'background:#4a7a4a', 'color:#fff', 'border:none', 'border-radius:6px',
            'padding:8px 18px', 'cursor:pointer', 'font-size:0.95em', 'font-family:inherit'
        ].join(';');
        saveBtn.addEventListener('click', () => {
            const trimmed = inp.value.trim();
            if (!trimmed) return;
            dismiss(trimmed.endsWith(extension) ? trimmed : trimmed + extension);
        });

        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveBtn.click();
            if (e.key === 'Escape') dismiss(null);
        });
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(null); });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        box.appendChild(label);
        inputRow.appendChild(inp);
        inputRow.appendChild(extHint);
        box.appendChild(inputRow);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
}

// Build the JSON-serialisable payload that represents the full saved state.
// Prompts the user (via _showConfirmDialog) about embedding a custom/imported
// config — pass `includeConfigPromptLabel` as either 'file' or 'link' to vary
// the wording slightly.
async function _buildSavePayload(target, includeConfig = null) {
    // Snapshot the in-memory store, then override the active mode with the
    // live dropdown value as a belt-and-suspenders measure.
    const learningTomeByMode = { ..._learningTomeByMode };
    const _tomeSel = document.getElementById('learning-tome');
    if (_tomeSel) learningTomeByMode[getCurrentMode()] = _tomeSel.value || '0';
    const output = {
        xpmultiplier: parseFloat(document.getElementById('xp-multiplier')?.value) || 1.15,
        vipSagas: document.getElementById('vip-sagas-header')?.checked ? true : false,
        learningTomeByMode,
        configPreset: ACTIVE_QUESTS_PRESET,
        heroic: serialiseLevelplan(data.levelplanByMode.heroic),
        epic: serialiseLevelplan(data.levelplanByMode.epic)
    };

    const where = target === 'link' ? 'link' : 'file';
    if (ACTIVE_QUESTS_PRESET === 'custom') {
        const doInclude = includeConfig !== null
            ? includeConfig
            : await _showConfirmDialog(`Store your custom config in this ${where}?`);
        if (doInclude) {
            output.heroicCustomConfig = HEROIC_CUSTOM_CONFIG;
            output.epicCustomConfig   = EPIC_CUSTOM_CONFIG;
        }
    } else if (ACTIVE_QUESTS_PRESET === 'imported') {
        const doInclude = includeConfig !== null
            ? includeConfig
            : await _showConfirmDialog(`Store the imported config in this ${where}?`);
        if (doInclude) {
            output.heroicCustomConfig = HEROIC_IMPORTED_CONFIG;
            output.epicCustomConfig   = EPIC_IMPORTED_CONFIG;
        }
    }

    return output;
}

// Save both minimal levelplans (heroic + epic) via the native OS Save dialog.
// Throws if the native dialog is unavailable or fails (caller should catch and show an error).
async function saveToFile(includeConfig = null) {
    const output = await _buildSavePayload('file', includeConfig);
    const json = JSON.stringify(output, null, 2);

    if (typeof window.showSaveFilePicker !== 'function') {
        throw new Error('Native save dialog not supported in this browser.');
    }

    const handle = await window.showSaveFilePicker({
        suggestedName: 'levelingplan.json',
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
}

// Download both minimal levelplans (heroic + epic) via an HTML filename dialog + browser download.
async function downloadFile(includeConfig = null) {
    const output = await _buildSavePayload('file', includeConfig);
    const json = JSON.stringify(output, null, 2);

    const filename = await _showFilenameDialog('levelingplan', '.json');
    if (!filename) return;

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Show the Share dialog: Save to File, full link, base64, JSON.
async function openShareDialog() {
    // Build initial payload without config (no confirm dialog)
    let linkPayload, encoded, json;
    try {
        linkPayload = await _buildSavePayload('link', false);
        encoded = await _encodePayloadToHash(linkPayload);
        json = JSON.stringify(linkPayload, null, 2);
    } catch (err) {
        alert('Error building share data: ' + (err && err.message ? err.message : err));
        return;
    }

    const fullLink = SHARE_LINK_BASE + '#' + encoded;
    const hasNonDefaultConfig = ACTIVE_QUESTS_PRESET === 'custom' || ACTIVE_QUESTS_PRESET === 'imported';

    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,0.55)', 'display:flex',
        'align-items:center', 'justify-content:center'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
        'background:#2c2c2c', 'color:#e0e0e0', 'border-radius:10px',
        'padding:28px 34px', 'max-width:760px', 'width:92%',
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'font-family:inherit',
        'display:flex', 'flex-direction:column', 'gap:18px',
        'max-height:92vh', 'overflow-y:auto'
    ].join(';');

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const title = document.createElement('h3');
    title.textContent = 'Share';
    title.style.cssText = 'margin:0;font-size:1.1em;';
    const closeX = document.createElement('button');
    closeX.textContent = '×';
    closeX.style.cssText = [
        'background:none', 'border:none', 'color:#e0e0e0',
        'font-size:1.4em', 'cursor:pointer', 'line-height:1', 'padding:0 4px'
    ].join(';');
    titleRow.appendChild(title);
    titleRow.appendChild(closeX);
    box.appendChild(titleRow);

    const btnStyle = [
        'padding:10px 14px', 'border-radius:6px',
        'border:1px solid rgba(255,255,255,0.15)',
        'background:#3a3a3a', 'color:#e0e0e0', 'cursor:pointer',
        'font-size:0.95em', 'transition:background 0.15s'
    ].join(';');
    const copyBtnStyle = [
        'padding:5px 12px', 'border-radius:5px',
        'border:1px solid rgba(255,255,255,0.15)',
        'background:#3a3a3a', 'color:#e0e0e0', 'cursor:pointer',
        'font-size:0.82em', 'white-space:nowrap', 'transition:background 0.15s'
    ].join(';');
    const taStyle = [
        'background:#1a1a1a', 'color:#e0e0e0',
        'border:1px solid #555', 'border-radius:5px',
        'padding:7px 10px', 'font-size:0.8em',
        'font-family:monospace', 'width:100%', 'box-sizing:border-box',
        'resize:vertical'
    ].join(';');

    const hover = (b, on, off) => {
        b.addEventListener('mouseenter', () => { b.style.background = on; });
        b.addEventListener('mouseleave', () => { b.style.background = off; });
    };

    const makeCopyBtn = (getText) => {
        const btn = document.createElement('button');
        btn.textContent = 'Copy';
        btn.style.cssText = copyBtnStyle;
        hover(btn, '#4a4a4a', '#3a3a3a');
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(getText());
                const prev = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = prev; }, 1200);
            } catch (e) {
                // fallback: select textarea content
                const ta = btn.closest('div').querySelector('textarea');
                if (ta) { ta.select(); document.execCommand('copy'); }
            }
        });
        return btn;
    };

    const makeSection = (labelText, value, rows) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        const lbl = document.createElement('label');
        lbl.textContent = labelText;
        lbl.style.cssText = 'font-size:0.88em;color:#bbb;';
        const taRow = document.createElement('div');
        taRow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
        const ta = document.createElement('textarea');
        ta.readOnly = true;
        ta.rows = rows;
        ta.value = value;
        ta.style.cssText = taStyle + ';flex:1;min-width:0;';
        const copyBtn = makeCopyBtn(() => ta.value);
        copyBtn.style.cssText = copyBtnStyle + ';align-self:stretch;';
        taRow.appendChild(ta);
        taRow.appendChild(copyBtn);
        wrap.appendChild(lbl);
        wrap.appendChild(taRow);
        return { wrap, ta };
    };

    const makeDivider = () => {
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none;border-top:1px solid #444;margin:0;';
        return hr;
    };

    const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    closeX.addEventListener('click', close);

    // Declare cfgChk early so the Save to File button can reference it
    let cfgChk = null;

    // Include config checkbox (only shown when a non-default config is active)
    if (hasNonDefaultConfig) {
        const cfgRow = document.createElement('label');
        cfgRow.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.92em;color:#e0e0e0;user-select:none;';
        cfgChk = document.createElement('input');
        cfgChk.type = 'checkbox';
        cfgChk.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:#6a9fd8;';
        cfgRow.appendChild(cfgChk);
        cfgRow.appendChild(document.createTextNode('Include config'));
        box.appendChild(cfgRow);
        box.appendChild(makeDivider());

        cfgChk.addEventListener('change', async () => {
            try {
                const newPayload = await _buildSavePayload('link', cfgChk.checked);
                const newEncoded = await _encodePayloadToHash(newPayload);
                linkTa.value = SHARE_LINK_BASE + '#' + newEncoded;
                encodedTa.value = newEncoded;
                jsonTa.value = JSON.stringify(newPayload, null, 2);
            } catch (err) {
                alert('Error updating share data: ' + (err && err.message ? err.message : err));
            }
        });
    }

        // Save to File + Download buttons row
    const fileBtnRow = document.createElement('div');
    fileBtnRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const fileBtnInnerRow = document.createElement('div');
    fileBtnInnerRow.style.cssText = 'display:flex;gap:10px;';

    const saveErrMsg = document.createElement('span');
    saveErrMsg.style.cssText = 'color:#f07070;font-size:0.85em;display:none;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save to File';
    saveBtn.style.cssText = btnStyle + ';flex:1;';
    hover(saveBtn, '#4a4a4a', '#3a3a3a');
    saveBtn.addEventListener('click', async () => {
        saveErrMsg.style.display = 'none';
        try {
            await saveToFile(hasNonDefaultConfig ? cfgChk.checked : null);
            close();
        } catch (err) {
            if (err.name === 'AbortError') return;
            saveErrMsg.textContent = 'Save failed. Use Download instead.';
            saveErrMsg.style.display = '';
        }
    });

    const dlBtn = document.createElement('button');
    dlBtn.textContent = 'Download';
    dlBtn.style.cssText = btnStyle + ';flex:1;';
    hover(dlBtn, '#4a4a4a', '#3a3a3a');
    dlBtn.addEventListener('click', async () => {
        close();
        try {
            await downloadFile(hasNonDefaultConfig ? cfgChk.checked : null);
        } catch (err) { alert('Download failed: ' + err.message); }
    });

    fileBtnInnerRow.appendChild(saveBtn);
    fileBtnInnerRow.appendChild(dlBtn);
    fileBtnRow.appendChild(fileBtnInnerRow);
    fileBtnRow.appendChild(saveErrMsg);
    box.appendChild(fileBtnRow);

    // Full link section
    box.appendChild(makeDivider());
    const { wrap: linkWrap, ta: linkTa } = makeSection('Full share link', fullLink, 3);
    box.appendChild(linkWrap);

    // Base64 section
    box.appendChild(makeDivider());
    const { wrap: encodedWrap, ta: encodedTa } = makeSection('Base64 payload', encoded, 3);
    box.appendChild(encodedWrap);

    // JSON section
    box.appendChild(makeDivider());
    const { wrap: jsonWrap, ta: jsonTa } = makeSection('JSON', json, 8);
    box.appendChild(jsonWrap);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
    });

    document.body.appendChild(overlay);
}

// Parse arbitrary text as one of: JSON leveling plan, raw base64url-gzip payload,
// or a full share link containing the base64url-gzip payload after '#'.
// Throws on invalid input.
async function _parseImportText(text) {
    const raw = (text || '').trim();
    if (!raw) throw new Error('Input is empty');

    // 1) JSON?
    if (raw.startsWith('{') || raw.startsWith('[')) {
        return JSON.parse(raw);
    }

    // 2) Full URL with hash payload?
    let candidate = raw;
    const hashIdx = raw.indexOf('#');
    if (hashIdx >= 0 && /^https?:\/\//i.test(raw)) {
        candidate = raw.slice(hashIdx + 1);
    }
    // Strip any whitespace/newlines that may have been introduced by copy-paste
    candidate = candidate.replace(/\s+/g, '');
    if (!candidate) throw new Error('No payload found after #');

    // 3) Treat as base64url-encoded gzip payload (same encoding generateLink uses)
    return await _decodeHashToPayload(candidate);
}

// Show the Import dialog with three options:
//   - Load from File
//   - Paste from Clipboard (auto-detect JSON / base64 / full link)
//   - Manual paste textarea + Parse button
function openImportDialog() {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,0.55)', 'display:flex',
        'align-items:center', 'justify-content:center'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
        'background:#2c2c2c', 'color:#e0e0e0', 'border-radius:10px',
        'padding:28px 34px', 'max-width:760px', 'width:92%',
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'font-family:inherit',
        'display:flex', 'flex-direction:column', 'gap:18px',
        'max-height:92vh', 'overflow-y:auto'
    ].join(';');

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const title = document.createElement('h3');
    title.textContent = 'Import';
    title.style.cssText = 'margin:0;font-size:1.1em;';
    const closeX = document.createElement('button');
    closeX.textContent = '×';
    closeX.style.cssText = [
        'background:none', 'border:none', 'color:#e0e0e0',
        'font-size:1.4em', 'cursor:pointer', 'line-height:1', 'padding:0 4px'
    ].join(';');
    titleRow.appendChild(title);
    titleRow.appendChild(closeX);
    box.appendChild(titleRow);

    const btnStyle = [
        'padding:10px 14px', 'border-radius:6px',
        'border:1px solid rgba(255,255,255,0.15)',
        'background:#3a3a3a', 'color:#e0e0e0', 'cursor:pointer',
        'font-size:0.95em', 'text-align:left', 'transition:background 0.15s'
    ].join(';');
    const actionBtnStyle = [
        'padding:5px 12px', 'border-radius:5px',
        'border:1px solid rgba(255,255,255,0.15)',
        'background:#3a3a3a', 'color:#e0e0e0', 'cursor:pointer',
        'font-size:0.82em', 'white-space:nowrap', 'transition:background 0.15s',
        'align-self:stretch'
    ].join(';');
    const hover = (b) => {
        b.addEventListener('mouseenter', () => { b.style.background = '#4a4a4a'; });
        b.addEventListener('mouseleave', () => { b.style.background = '#3a3a3a'; });
    };
    const makeDivider = () => {
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none;border-top:1px solid #444;margin:0;';
        return hr;
    };

    const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    closeX.addEventListener('click', close);

    const status = document.createElement('div');
    status.style.cssText = 'min-height:1.2em;font-size:0.85em;color:#bbb;';

    const setStatus = (msg, isError) => {
        status.textContent = msg || '';
        status.style.color = isError ? '#ff8080' : '#9bd29b';
    };

    const importFromText = async (text) => {
        try {
            const parsed = await _parseImportText(text);
            await _applyLoadedPayload(parsed);
            setStatus('Import successful.', false);
            setTimeout(close, 600);
        } catch (err) {
            setStatus('Import failed: ' + (err && err.message ? err.message : err), true);
        }
    };

    // --- Load from File ---
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load from File';
    loadBtn.style.cssText = btnStyle;
    hover(loadBtn);
    loadBtn.addEventListener('click', () => { close(); loadFromFile(); });
    box.appendChild(loadBtn);

    // --- Paste from Clipboard ---
    box.appendChild(makeDivider());
    const clipBtn = document.createElement('button');
    clipBtn.textContent = 'Paste from Clipboard';
    clipBtn.style.cssText = btnStyle;
    hover(clipBtn);
    clipBtn.addEventListener('click', async () => {
        setStatus('Reading clipboard…', false);
        try {
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                throw new Error('Clipboard API not available — use the text field below');
            }
            const text = await navigator.clipboard.readText();
            await importFromText(text);
        } catch (err) {
            setStatus('Clipboard read failed: ' + (err && err.message ? err.message : err), true);
        }
    });
    box.appendChild(clipBtn);

    // --- Manual paste textarea + Parse button ---
    box.appendChild(makeDivider());
    const taLabel = document.createElement('label');
    taLabel.textContent = 'Or paste manually:';
    taLabel.style.cssText = 'font-size:0.88em;color:#bbb;';
    box.appendChild(taLabel);

    const taRow = document.createElement('div');
    taRow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';
    const ta = document.createElement('textarea');
    ta.rows = 6;
    ta.placeholder = 'Paste JSON, base64 payload, or full share link…';
    ta.style.cssText = [
        'background:#1a1a1a', 'color:#e0e0e0',
        'border:1px solid #555', 'border-radius:5px',
        'padding:8px 10px', 'font-size:0.85em',
        'font-family:monospace', 'flex:1', 'min-width:0',
        'box-sizing:border-box', 'resize:vertical'
    ].join(';');
    const parseBtn = document.createElement('button');
    parseBtn.textContent = 'Parse';
    parseBtn.style.cssText = actionBtnStyle;
    hover(parseBtn);
    parseBtn.addEventListener('click', () => importFromText(ta.value));
    taRow.appendChild(ta);
    taRow.appendChild(parseBtn);
    box.appendChild(taRow);

    box.appendChild(status);

    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
    });

    document.body.appendChild(overlay);
}

// Apply an already-parsed save payload (from a file load or a shared link).
// Mirrors the original `loadFromFile` reader.onload body. Throws on invalid input.
async function _applyLoadedPayload(parsed) {
    if (!parsed || (!Array.isArray(parsed.heroic) && !Array.isArray(parsed.epic))) {
        throw new Error('Unrecognised file format');
    }

    const filePreset = parsed.configPreset; // 'default', 'custom', 'imported', or undefined (old file)
    const fileHasCustomConfig = Array.isArray(parsed.heroicCustomConfig) && parsed.heroicCustomConfig.length > 0;

    // Helper: persist config changes to localStorage
    const _persistConfig = () => localStorage.setItem(CONFIG_KEY, JSON.stringify({
        activePreset: ACTIVE_QUESTS_PRESET,
        heroicCustomConfig: HEROIC_CUSTOM_CONFIG,
        epicCustomConfig: EPIC_CUSTOM_CONFIG,
        heroicImportedConfig: HEROIC_IMPORTED_CONFIG,
        epicImportedConfig: EPIC_IMPORTED_CONFIG
    }));

        // Restore per-mode learning tome values from the file FIRST so that any
    // subsequent _computeQuestXP() calls read the correct per-mode bonus
    // for the inactive mode from the in-memory store.
    if (parsed.learningTomeByMode) {
        // Update the in-memory store for both modes. The saveSettings() call at
        // the end of this function will persist the new values to localStorage.
        _learningTomeByMode = {
            heroic: parsed.learningTomeByMode.heroic || '0',
            epic:   parsed.learningTomeByMode.epic   || '0'
        };
        populateLearningTomeSelect(_learningTomeByMode[getCurrentMode()]);
    }

    if (fileHasCustomConfig) {
        // Always populate IMPORTED_CONFIG slots from the file, regardless of user choice below
        window.HEROIC_IMPORTED_CONFIG = parsed.heroicCustomConfig;
        window.EPIC_IMPORTED_CONFIG   = Array.isArray(parsed.epicCustomConfig) ? parsed.epicCustomConfig : [];

        if (ACTIVE_QUESTS_PRESET === 'imported') {
            // Already using the imported config — silently overwrite it
            window.ACTIVE_QUESTS_PRESET = 'imported';
        } else {
            // Determine which active config the imported one would replace (for the prompt label)
            const currentLabel = ACTIVE_QUESTS_PRESET === 'custom' ? 'Custom' : 'Default';

            const choice = await _showChoiceDialog(
                'This leveling plan includes a config. Continue using your current config, or switch to the imported one?',
                [
                    { label: `Keep current (${currentLabel}) config`, value: 'keep' },
                    { label: 'Switch to Imported config', value: 'switch' }
                ]
            );
            if (choice === 'switch') {
                window.ACTIVE_QUESTS_PRESET = 'imported';
            }
        }
        _rebuildHeroicQuests();
        _rebuildEpicQuests();
        _computeQuestXP('heroic');
        _computeQuestXP('epic');
        _persistConfig();

    } else if (filePreset === 'default' && ACTIVE_QUESTS_PRESET !== 'default') {
        // File used Default (no embedded config) but user currently has a different preset active
        if (confirm('This plan was created with the Default config. Switch to Default?')) {
            window.ACTIVE_QUESTS_PRESET = 'default';
            _rebuildHeroicQuests();
            _rebuildEpicQuests();
            _computeQuestXP('heroic');
            _computeQuestXP('epic');
            _persistConfig();
        }
        // else: load using current config
    } else {
        // No config change — but quest XP must still be recomputed with the
        // tome values from the file (which were just written to localStorage).
        _computeQuestXP('heroic');
        _computeQuestXP('epic');
    }

    // All other cases (no filePreset, matching preset, etc.): load normally
    const xpInput = document.getElementById('xp-multiplier');
    if (xpInput && parsed.xpmultiplier !== undefined) xpInput.value = parsed.xpmultiplier;
    // Restore VIP skip for Sagas checkbox state from the file.
    if (parsed.vipSagas !== undefined) {
        const vipCb = document.getElementById('vip-sagas-header');
        if (vipCb) vipCb.checked = !!parsed.vipSagas;
    }
    saveSettings();

    data.levelplanByMode.heroic = hydrateLevelplan(
        Array.isArray(parsed.heroic) ? parsed.heroic : [],
        HEROIC_QUESTS, 'heroic'
    );
    data.levelplanByMode.epic = hydrateLevelplan(
        Array.isArray(parsed.epic) ? parsed.epic : [],
        EPIC_QUESTS, 'epic'
    );

    // Auto-switch mode when the import contains data for only one mode.
    const _importHasHeroic = Array.isArray(parsed.heroic) && parsed.heroic.length > 0;
    const _importHasEpic   = Array.isArray(parsed.epic)   && parsed.epic.length   > 0;
    if (_importHasHeroic !== _importHasEpic) {
        const modeSwitch = document.getElementById('mode-switch');
        if (modeSwitch) {
            modeSwitch.checked = _importHasEpic;
            const newMode = _importHasEpic ? 'epic' : 'heroic';
            // Mirror what applyModeClass() / loadSettings() do when the mode changes.
            const modeGroup = modeSwitch.closest('.mode-switch');
            if (modeGroup) {
                modeGroup.classList.toggle('is-epic', _importHasEpic);
                modeGroup.classList.toggle('is-heroic', !_importHasEpic);
            }
            const tokensLabel = document.getElementById('twelve-tokens-label');
            if (tokensLabel) tokensLabel.style.display = _importHasEpic ? '' : 'none';
            if (!_importHasEpic) {
                const tokensCb = document.getElementById('twelve-tokens');
                if (tokensCb) tokensCb.checked = false;
            }
            // Re-populate the dropdown for the new mode with its correct saved value.
            // _learningTomeByMode was already updated from parsed.learningTomeByMode above.
            populateLearningTomeSelect(_learningTomeByMode[newMode] || '0');
        }
    }
    // Persist the (possibly updated) mode so a page refresh restores it correctly.
    saveSettings();

    setActiveMode(getCurrentMode());
    saveToStorage();
    renderLists();
    ensureHighlightStyle();
    highlightInserted(data.levelplan.filter(i => i.name).map(i => i.name));
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
                await _applyLoadedPayload(parsed);
            } catch (err) {
                alert('Error loading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
    input.click();
}

// --- Shareable-link encoding (gzip + URL-safe base64) ---

// Base URL used when generating a shareable link.
const SHARE_LINK_BASE = 'https://rullgit.github.io/levelingplanner/';

function _bytesToBase64Url(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _base64UrlToBytes(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const binary = atob(s);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

// JSON-stringify + gzip + URL-safe base64. Requires modern browser (CompressionStream).
async function _encodePayloadToHash(obj) {
    const json = JSON.stringify(obj);
    const input = new TextEncoder().encode(json);
    const cs = new CompressionStream('gzip');
    const compressed = await new Response(
        new Blob([input]).stream().pipeThrough(cs)
    ).arrayBuffer();
    return _bytesToBase64Url(new Uint8Array(compressed));
}

// Reverse of _encodePayloadToHash. Throws on malformed input.
async function _decodeHashToPayload(hash) {
    const bytes = _base64UrlToBytes(hash);
    const ds = new DecompressionStream('gzip');
    const decompressed = await new Response(
        new Blob([bytes]).stream().pipeThrough(ds)
    ).arrayBuffer();
    const json = new TextDecoder().decode(decompressed);
    return JSON.parse(json);
}

// Generate a shareable URL containing the current plan and show it in a modal.
async function generateLink() {
    const output = await _buildSavePayload('link');
    let encoded;
    try {
        encoded = await _encodePayloadToHash(output);
    } catch (err) {
        alert('Error generating link: ' + err.message);
        return;
    }
    const url = SHARE_LINK_BASE + '#' + encoded;
    _showShareLinkDialog(url);
}

// Modal that displays a shareable URL with a Copy button.
function _showShareLinkDialog(url) {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,0.55)', 'display:flex',
        'align-items:center', 'justify-content:center'
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
        'background:#2c2c2c', 'color:#e0e0e0', 'border-radius:10px',
        'padding:28px 32px', 'max-width:560px', 'width:90%',
        'box-shadow:0 8px 32px rgba(0,0,0,0.6)', 'font-family:inherit',
        'display:flex', 'flex-direction:column', 'gap:14px'
    ].join(';');

    const label = document.createElement('label');
    label.textContent = 'Shareable link:';
    label.style.cssText = 'font-size:0.95em;';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.readOnly = true;
    inp.value = url;
    inp.style.cssText = [
        'background:#1a1a1a', 'color:#e0e0e0', 'border:1px solid #555',
        'border-radius:5px', 'padding:6px 10px', 'font-size:0.9em',
        'font-family:monospace', 'width:100%', 'box-sizing:border-box'
    ].join(';');

    const hint = document.createElement('span');
    hint.textContent = `Length: ${url.length} chars`;
    hint.style.cssText = 'color:#888;font-size:0.85em;margin-top:-6px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;align-items:center;';

    const status = document.createElement('span');
    status.style.cssText = 'color:#7fbf7f;font-size:0.85em;margin-right:auto;';

    const dismiss = () => overlay.remove();

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = [
        'background:#4a7a4a', 'color:#fff', 'border:none', 'border-radius:6px',
        'padding:8px 18px', 'cursor:pointer', 'font-size:0.95em', 'font-family:inherit'
    ].join(';');
    copyBtn.addEventListener('click', async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                inp.select();
                document.execCommand('copy');
            }
            status.textContent = 'Copied!';
            setTimeout(() => { status.textContent = ''; }, 2000);
        } catch (e) {
            status.style.color = '#d97070';
            status.textContent = 'Copy failed';
        }
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = [
        'background:#444', 'color:#e0e0e0', 'border:none', 'border-radius:6px',
        'padding:8px 18px', 'cursor:pointer', 'font-size:0.95em', 'font-family:inherit'
    ].join(';');
    closeBtn.addEventListener('click', dismiss);

    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });

    btnRow.appendChild(status);
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(closeBtn);
    box.appendChild(label);
    box.appendChild(inp);
    box.appendChild(hint);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
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
        // When rendering the special palette, show the next available level
        // for the Take Level template (so it reads e.g. "Take Level 4").
        if (listId === 'special' && item.isTakeLevel) {
            const existingTakeCount = (data.levelplan || []).filter(i => i && i.isTakeLevel).length;
            const baseLevel = getPlayerLevelForXP(0);
            row.displayName = `Take Level ${baseLevel + existingTakeCount + 1}`;
        }
        if (listId === 'levelplan') {
            const calculatedLevel = getPlayerLevelForXP(cumulativeXP);
            if (item.isTakeLevel) {
                levelupCount += 1;
                row.displayName = `Take level ${levelupCount}`;
                row.playerLevelWarning = levelupCount > calculatedLevel ? 2 : 0;
                row.cumulativeXP = cumulativeXP;
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
            // For custom items: calculate xpMin based on Custom and time
            // Respect the applyMultipliers flag for xpMin calculation
            const cumMultiplier = multiplier + activePotPct / 100;
            const effectiveQTime = getEffectiveQTime(item);
            const totalTime = (item.travelTime || 0) + effectiveQTime;
            const customXpForMin = item.applyMultipliers ? Math.round((item.xp || 0) * cumMultiplier) : (item.xp || 0);
            row.xpMin = totalTime > 0 ? Math.floor(customXpForMin / totalTime) : '';
            row.xpMinAdjusted = false;
            row.xpMinPlain = '';
            row.xpMinForColor = '';
            row.unmetRequirements = [];
            row.isSaga = false;
            row.sagaRefLevel = null;
        } else if (!item.isTakeLevel && item.id !== undefined) {
            // For levelplan items, only items *above* the current position count as
            // already-met prerequisites (requirements not yet reached are still unmet).
            // For quests-list items the full levelplanNameSet is used (plan as a whole).
            const prereqNameSet = listId === 'levelplan'
                ? new Set(items.slice(0, index).filter(i => i.name !== undefined).map(i => i.name))
                : levelplanNameSet;
            const related = collectItemsForXpMin(item, prereqNameSet, allItemsByName);
            const relatedReqs = related.slice(1).filter(Boolean);
            const relatedHasMissingTime = relatedReqs.some(it => (it.qTime === null || it.qTime === undefined) && (it.travelTime === null || it.travelTime === undefined));
            const effectiveQTime = listId === 'levelplan' ? getEffectiveQTime(item) : getQuestsEffectiveQTime(item);
            const plainTime = (item.travelTime || 0) + effectiveQTime;
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
                            const totalTime = group.reduce((s, it) => s + (it.travelTime || 0) + getEffectiveQTime(it), 0);
                            row.cumulativeXpMin = totalTime > 0 ? Math.floor(totalXP / totalTime) : '';
                            row.dependentNames = deps.map(it => it.name);
                        }
                    }
                }
            } else {
                // For quests list: keep original behavior even for sagas
                const totalXP = related.reduce((sum, it) => sum + (it.xp || 0) * multiplier, 0);
                const totalTime = related.reduce((sum, it) => sum + (it.travelTime || 0) + getQuestsEffectiveQTime(it), 0);
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
            const effectiveQTime = getEffectiveQTime(item);
            const plainTime = (item.travelTime || 0) + effectiveQTime;
            row.xpMin = plainTime > 0 ? Math.floor((item.xp || 0) * multiplier / plainTime) : '';
            row.xpMinAdjusted = false;
            row.xpMinPlain = '';
            row.unmetRequirements = [];
            row.xpMinForColor = plainTime > 0 ? Math.floor((item.xp || 0) / plainTime) : '';
        } else if (item.isCustom) {
            const qTime = getEffectiveQTime(item);
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
    // Collapse verbose slayer series in the quests list: hide intermediate
    // slayer entries except the first, the last, the 200 and the 1500.
    if (listId === 'quests') {
        const slayerRows = filteredRowData.filter(r => r.item && r.item.isSlayer);
        if (slayerRows.length > 0) {
            // Group by base name (strip trailing number)
            const groups = new Map();
            const trailingNumRe = /\s(\d+)$/;
            filteredRowData.forEach((r, idx) => {
                if (!r.item || !r.item.isSlayer) return;
                const m = r.item.name.match(trailingNumRe);
                const base = m ? r.item.name.slice(0, m.index) : r.item.name;
                if (!groups.has(base)) groups.set(base, []);
                groups.get(base).push({ row: r, idx });
            });
            // Determine which rows to keep
            const keepSet = new Set();
            for (const [base, arr] of groups.entries()) {
                if (arr.length === 0) continue;
                // sort by original index to determine first/last
                arr.sort((a, b) => a.idx - b.idx);
                // always keep last
                keepSet.add(arr[arr.length - 1].row);
                // also keep any whose trailing number is 200 or 1500
                for (const el of arr) {
                    const m = el.row.item.name.match(trailingNumRe);
                    if (m) {
                        const n = Number(m[1]);
                        if (n === 200 || n === 1500) keepSet.add(el.row);
                    }
                }
                // Keep the first only if any entry from this slayer series is
                // missing from the current quests list (e.g., moved to levelplan).
                // Build the full set of series names from allItemsByName (which
                // includes quests + levelplan) and check whether any of those
                // names are not present in the current filteredRowData.
                const presentQuestNames = new Set(filteredRowData.map(r => r.item && r.item.name).filter(Boolean));
                const fullSeriesNames = new Set();
                for (const name of allItemsByName.keys()) {
                    if (typeof name !== 'string') continue;
                    if (name.startsWith(base)) fullSeriesNames.add(name);
                }
                const anyMissing = [...fullSeriesNames].some(n => !presentQuestNames.has(n));
                if (anyMissing) keepSet.add(arr[0].row);
            }
            // Apply the keepSet: remove slayer rows not in keepSet
            filteredRowData = filteredRowData.filter(r => {
                if (!r.item || !r.item.isSlayer) return true;
                return keepSet.has(r);
            });
        }
    }
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

    // Total XP — mirrors the cumulative XP logic in renderList so that XP pot
    // bonuses (activePotPct) and the custom-item applyMultipliers flag are both
    // taken into account, exactly as the per-row cumulative column does.
    let totalXP = 0;
    let activePotPctFooter = 0;
    items.forEach(item => {
        if (item.isXpPotStart) activePotPctFooter = item.pct != null ? item.pct : 0;
        if (item.isXpPotEnd)   activePotPctFooter = 0;
        if (item.isTakeLevel || item.isXpPot || item.isXpPotStart || item.isXpPotEnd) return;
        const cumMultiplier = multiplier + activePotPctFooter / 100;
        totalXP += item.isCustom
            ? (item.applyMultipliers ? Math.round((item.xp || 0) * cumMultiplier) : (item.xp || 0))
            : Math.round((item.xp || 0) * cumMultiplier);
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

    // Quest count: include regular quests and elite copies; exclude saga, takeLevel, custom, and XP Pot markers
    const questCount = items.filter(i => !i.isSlayer && !i.isSaga && !i.isTakeLevel && !i.isCustom && !i.isXpPot && !i.isXpPotStart && !i.isXpPotEnd).length;

    // Total effective time: sum of qTime and travelTime.
    let totalTime = 0;
    items.forEach(item => {
        totalTime += (item.travelTime || 0) + getEffectiveQTime(item);
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
    const totalFavorEl      = document.getElementById('footer-total-favor');
    const itemFavorEl       = document.getElementById('footer-item-favor');

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
        if (itemFavorEl)  itemFavorEl.textContent  = safeToLocaleString(totalTokens);
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
        if (itemFavorEl)  itemFavorEl.textContent  = (patronView && patronView !== 'None') ? safeToLocaleString(totalFavor) : '';
    }
}

// Sort button handler for the levelplan footer: sorts the levelplan by quest `id`.
// Items without a numeric `id` are assigned to the nearest item that has an `id`,
// so they remain adjacent to quests with IDs. Sort is stable for items sharing the same key.
function lpFooterSort() {
    const arr = data.levelplan || [];
    if (!Array.isArray(arr) || arr.length <= 1) return;

    // If there are no items with numeric id, nothing to do.
    const hasAnyId = arr.some(it => Number.isFinite(it && it.id));
    if (!hasAnyId) return;

    // Build assignment: each item gets a numeric key = its id, or the nearest neighbor's id.
    const assigned = arr.map((it, idx) => {
        if (Number.isFinite(it && it.id)) return { idx, key: it.id, item: it, orig: idx };
        // find nearest item with id to the left
        let left = idx - 1;
        let leftDist = Infinity, leftId = null;
        while (left >= 0) {
            if (Number.isFinite(arr[left] && arr[left].id)) { leftDist = idx - left; leftId = arr[left].id; break; }
            left--;
        }
        // find nearest item with id to the right
        let right = idx + 1;
        let rightDist = Infinity, rightId = null;
        while (right < arr.length) {
            if (Number.isFinite(arr[right] && arr[right].id)) { rightDist = right - idx; rightId = arr[right].id; break; }
            right++;
        }
        let key;
        if (leftId === null && rightId === null) key = Infinity;
        else if (leftId !== null && rightId === null) key = leftId;
        else if (leftId === null && rightId !== null) key = rightId;
        else key = (leftDist <= rightDist) ? leftId : rightId;
        return { idx, key, item: it, orig: idx };
    });

    // Stable sort: primary by key (Infinity goes last), secondary by original index
    assigned.sort((a, b) => {
        if (a.key === b.key) return a.orig - b.orig;
        if (a.key === Infinity) return 1;
        if (b.key === Infinity) return -1;
        return a.key - b.key;
    });

    const newArr = assigned.map(a => a.item);
    const mode = getCurrentMode();
    data.levelplanByMode[mode] = newArr;
    data.levelplan = data.levelplanByMode[mode];
    saveToStorage();
    renderLists();
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

// Calculate the effective qTime after applying slayer bonus divisor.
// Returns: qTime / divisor, where divisor is based on the slayer bonus level.
function applySlayerBonus(qTime, slayerBonus) {
    if (!slayerBonus || slayerBonus === 'No Slayer Bonus' || !qTime) {
        return qTime || 0;
    }
    
    const divisors = {
        'No Count Boost': 1.0,
        'Minor 25% Boost': 1.25,
        'Lesser 50% Boost': 1.5,
        'Medium 100% Boost': 2.0,
        'Greater 150% Boost': 2.5,
        'Major 200% Boost': 3.0
    };
    
    const divisor = divisors[slayerBonus] || 1.0;
    return qTime / divisor;
}

// Get the effective qTime for a levelplan item, applying its explicit slayer
// bonus if set. Items without an explicit slayerBonus are treated as 'No Count
// Boost' so that changing the plan-settings default never retroactively alters
// entries already in the leveling plan.
function getEffectiveQTime(item) {
    const qTime = item.qTime || 0;
    if (item.isSlayer && item.slayerBonus) {
        return applySlayerBonus(qTime, item.slayerBonus);
    }
    return qTime;
}

// Variant of getEffectiveQTime for the quests list. Uses the plan-settings
// default slayer bonus as a fallback for items without an explicit slayerBonus,
// so the quests list xpmin reflects the currently selected default boost.
function getQuestsEffectiveQTime(item) {
    const qTime = item.qTime || 0;
    if (item.isSlayer) {
        const bonus = item.slayerBonus || getDefaultSlayerBonus();
        return applySlayerBonus(qTime, bonus);
    }
    return qTime;
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

// Format minutes as "XH YM" (e.g., "3H 37M")
function formatMinutesToHM(mins) {
    if (mins === undefined || mins === null || mins <= 0) return '';
    const hours = Math.floor(mins / 60);
    const minutes = Math.round(mins % 60);
    if (hours === 0) {
        return `${minutes}M`;
    } else if (minutes === 0) {
        return `${hours}H`;
    } else {
        return `${hours}H ${minutes}M`;
    }
}

// Calculate cumulative time for an XP pot (Start or End marker)
function calculateXpPotCumulativeTime(data, index) {
    const item = data.levelplan[index];
    if (!item || (!item.isXpPotStart && !item.isXpPotEnd)) return 0;

    let totalMinutes = 0;

    if (item.isXpPotStart) {
        // Find the next End marker or end of levelplan
        const endIndex = data.levelplan.slice(index + 1).findIndex(i => i.isXpPotEnd);
        const lastIdx = endIndex !== -1 ? index + 1 + endIndex : data.levelplan.length;
        
        // Sum time from Start (exclusive) to End (inclusive) or end of array
        for (let i = index + 1; i < lastIdx; i++) {
            const q = data.levelplan[i];
            if (q && !q.isXpPotStart && !q.isXpPotEnd) {
                totalMinutes += (q.travelTime || 0) + getEffectiveQTime(q);
            }
        }
    } else if (item.isXpPotEnd) {
        // Find the most recent Start marker
        const startIdx = [...data.levelplan].slice(0, index).reverse().findIndex(i => i.isXpPotStart);
        if (startIdx === -1) return 0;
        
        const actualStartIdx = index - 1 - startIdx;
        
        // Sum time from Start (exclusive) to End (inclusive)
        for (let i = actualStartIdx + 1; i <= index; i++) {
            const q = data.levelplan[i];
            if (q && !q.isXpPotStart && !q.isXpPotEnd) {
                totalMinutes += (q.travelTime || 0) + getEffectiveQTime(q);
            }
        }
    }

    return totalMinutes;
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
        xpminDiv.textContent += '+';
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
            // Custom entries have editable XP — don't show a hover tooltip for them.
        } else {
            // Skip Take Level entries here (they shouldn't show "0 xp").
            if (item && !item.isTakeLevel && item.xp != null && isFinite(item.xp)) xpVal = Math.round(item.xp * multiplier);
            else if (item && !item.isTakeLevel && item.baseXP != null && isFinite(item.baseXP)) xpVal = Math.round(item.baseXP * multiplier);
        }
        if (xpVal != null) {
            nameDiv.dataset.tip = safeToLocaleString(xpVal) + 'xp';
        }
        if (item && item.isTakeLevel && playerLevelWarning === 2) {
            const targetLevel = parseInt((displayName || '').replace(/Take level /i, ''), 10);
            const xpNeeded = getXpForLevel(targetLevel);
            if (xpNeeded != null && cumulativeXP !== '') {
                nameDiv.dataset.tip = safeToLocaleString(xpNeeded - cumulativeXP) + ' xp missing';
            }
        }
    })();

    if (listId === 'levelplan') {
        if (item.isCustom) {
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'item-content-wrapper item-content-wrapper--custom';

            const nameInput = document.createElement('input');
            nameInput.className = 'custom-field-input custom-name-input';
            nameInput.type = 'text';
            nameInput.value = (item.name && item.name !== 'Custom') ? item.name : '';
            nameInput.placeholder = 'Name';
            // No tooltip for custom-name input (XP is user-editable).
            nameInput.draggable = false;
            nameInput.addEventListener('mousedown', e => { e.stopPropagation(); div._suppressDrag = true; });
            nameInput.addEventListener('pointerdown', e => { e.stopPropagation(); div._suppressDrag = true; });
            nameInput.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
            });
            nameInput.addEventListener('blur', () => {
                // IMPORTANT: write to the captured `item` object, NOT to
                // data.levelplan[index]. After a drag-reorder the item at
                // `index` may now point to a different item.
                item.name = nameInput.value.trim() || 'Custom';
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
            qTimeInput.placeholder = '0:00';
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

            const potCumulativeTime = calculateXpPotCumulativeTime(data, index);
            const potTimeStr = formatMinutesToHM(potCumulativeTime);
            const potTimeDisplay = potTimeStr ? ` (${potTimeStr})` : '';

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
                    potNameDiv.textContent = 'End ' + pctLabel + ' Pot' + potTimeDisplay;
                }
            } else {
                potNameDiv.textContent = item.name + potTimeDisplay;
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

            // Add slayer bonus dropdown inline with quest name for slayer quests in levelplan
            if (listId === 'levelplan' && item.isSlayer) {
                const slayerBonusSelect = document.createElement('select');
                slayerBonusSelect.className = 'slayer-bonus-select';
                slayerBonusSelect.draggable = false;
                
                const options = [
                    'No Count Boost',
                    'Minor 25% Boost',
                    'Lesser 50% Boost',
                    'Medium 100% Boost',
                    'Greater 150% Boost',
                    'Major 200% Boost'
                ];
                
                options.forEach(opt => {
                    const optEl = document.createElement('option');
                    optEl.value = opt;
                    optEl.textContent = opt;
                    slayerBonusSelect.appendChild(optEl);
                });
                
                // Set current value
                slayerBonusSelect.value = item.slayerBonus || getDefaultSlayerBonus();
                
                let ctrlPressed = false;

                // Prevent drag when interacting with the dropdown and record whether CTRL is held for use on change    
                slayerBonusSelect.addEventListener('mousedown', e => { 
                    ctrlPressed = e.ctrlKey || e.metaKey;
                    e.stopPropagation(); div._suppressDrag = true; });
                slayerBonusSelect.addEventListener('pointerdown', e => { 
                    ctrlPressed = e.ctrlKey || e.metaKey;
                    e.stopPropagation(); div._suppressDrag = true; });
                slayerBonusSelect.addEventListener('dragstart', e => { e.stopPropagation(); e.preventDefault(); });
                
                // Save selection on change
                slayerBonusSelect.addEventListener('change', (e) => {
                    const newBonus = slayerBonusSelect.value;
                    item.slayerBonus = newBonus;

                    // If CTRL is not held, propagate the new slayer bonus to all
                    // related items in the levelplan: those that this item requires
                    // (transitively) AND those that require this item (transitively).
                    if (!ctrlPressed) {
                        // Build a name→item map for everything currently in the levelplan.
                        const lpByName = new Map();
                        data.levelplan.forEach(lp => { if (lp.name !== undefined) lpByName.set(lp.name, lp); });

                        // Collect all names reachable from `item` via its requirements (downward).
                        const reqNames = new Set();
                        const reqStack = [item];
                        while (reqStack.length) {
                            const cur = reqStack.pop();
                            if (!cur || !Array.isArray(cur.requirements)) continue;
                            for (const rName of cur.requirements) {
                                if (!reqNames.has(rName)) {
                                    reqNames.add(rName);
                                    const rItem = lpByName.get(rName);
                                    if (rItem) reqStack.push(rItem);
                                }
                            }
                        }

                        // Collect all names that (transitively) require `item` (upward).
                        const depNames = new Set();
                        data.levelplan.forEach(b => {
                            if (!b || b.name === undefined || b.name === item.name) return;
                            const visited = new Set();
                            const stack = [b];
                            while (stack.length) {
                                const cur = stack.pop();
                                if (!cur || !Array.isArray(cur.requirements)) continue;
                                for (const rName of cur.requirements) {
                                    if (visited.has(rName)) continue;
                                    visited.add(rName);
                                    if (rName === item.name) { depNames.add(b.name); break; }
                                    const rItem = lpByName.get(rName);
                                    if (rItem) stack.push(rItem);
                                }
                            }
                        });

                        // Apply the new bonus to every related slayer item in the levelplan.
                        data.levelplan.forEach(lp => {
                            if (!lp || !lp.isSlayer || lp.name === item.name) return;
                            if (reqNames.has(lp.name) || depNames.has(lp.name)) {
                                lp.slayerBonus = newBonus;
                            }
                        });
                    }

                    saveToStorage();
                    renderLists();
                });
                
                nameDiv.appendChild(slayerBonusSelect);
            }

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
                    const rawEliteXP = Math.round(item.baseXP * (1 + item.xpmods + item.optionalXP + getQuestVariableBonus(getCurrentMode(), 'E', true)));
                    const effectiveQTime = getEffectiveQTime(item);
                    const eliteXPMin = effectiveQTime > 0 ? Math.floor(rawEliteXP * multiplier / effectiveQTime) : '';
                    const eliteXPMinForColor = effectiveQTime > 0 ? Math.floor(rawEliteXP / effectiveQTime) : '';
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
            } else if (item.isTakeLevel) {
                const qTimeInput = document.createElement('input');
                qTimeInput.className = 'custom-field-input custom-qtime-input';
                qTimeInput.type = 'text';
                qTimeInput.value = (item.qTime !== undefined && item.qTime !== null && item.qTime !== '') ? formatMinutesToMSS(item.qTime) : '';
                qTimeInput.placeholder = '0:00';
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
                contentWrapper.appendChild(qTimeInput);
            } else {
                contentWrapper.appendChild(eliteMarkerDiv);
            }
            if (!item.isTakeLevel) contentWrapper.appendChild(xpminDiv);
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
            // Render special palette items (Take Level, Custom, XP Pot) using
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
                arrowTitle = item.isCustom ? 'Insert Custom at end of Level Plan' : 'Insert Take Level at end of Level Plan';
                arrowLabel = item.isCustom ? 'Insert Custom' : 'Insert Take Level';
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
            addBtn.dataset.tip = 'Add to Level Plan\nHold Shift while adding to add to the bottom' + (xpMin !== '' && xpMinAdjusted ? '\nHold Control while adding to add without prereqs.' : '');
            addBtn.onclick = (e) => {
                e.stopPropagation();
                quickAddQuest(index, e.ctrlKey, e.shiftKey);
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
function quickAddQuest(questIndex, singleOnly = false, addToBottom = false) {
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

    let insertIndex;
    if (addToBottom) {
        insertIndex = data.levelplan.length;
    } else {
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
        insertIndex = findAutoInsertIndex({ lvl: insertLvl, id: sourceItem.id });
    }
    // Bake the current default slayer bonus into newly-added slayer items so
    // their xpmin is frozen at that value; subsequent changes to the default
    // won't retroactively alter items already in the leveling plan.
    const _defaultBonus = getDefaultSlayerBonus();
    for (const it of toInsert) {
        if (it.isSlayer && !it.slayerBonus) it.slayerBonus = _defaultBonus;
    }
    data.levelplan.splice(insertIndex, 0, ...toInsert);

    saveToStorage();
    renderLists();
    ensureHighlightStyle();
    highlightInserted(toInsert.map(it => it.name));
}

// Insert an elite copy of an R quest right below it in the levelplan
function insertEliteCopy(index, sourceItem) {
    if (data.levelplan.some(i => i.isEliteCopy && i.name === sourceItem.name + ' (repeat)')) return;
    const eliteXP = Math.round(sourceItem.baseXP * (1 + sourceItem.xpmods + sourceItem.optionalXP + getQuestVariableBonus(getCurrentMode(), 'E', true)));
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
// Leveling Plan inline search box
function initLevelplanSearch() {
    const input = document.getElementById('lp-search-input');
    const dropdown = document.getElementById('lp-search-dropdown');
    if (!input || !dropdown) return;

    let activeIndex = -1;

    function getMatches(query) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return data.levelplan.filter(item => (item.name && item.name.toLowerCase().includes(q)) || (item.lvl && item.lvl.toString().includes(q)));
    }

    function renderDropdown(matches) {
        dropdown.innerHTML = '';
        activeIndex = -1;
        if (matches.length === 0) {
            dropdown.hidden = true;
            return;
        }
        matches.forEach((item, i) => {
            const li = document.createElement('li');
            li.textContent = item.name;
            li.dataset.name = item.name;
            li.addEventListener('mousedown', (e) => {
                e.preventDefault(); // keep focus on input
                jumpToLevelplanItem(item.name);
                input.value = '';
                dropdown.hidden = true;
            });
            dropdown.appendChild(li);
        });
        // Position the dropdown so it's not clipped by header overflow.
        positionDropdown();
        dropdown.hidden = false;
    }

    function positionDropdown() {
        try {
            const rect = input.getBoundingClientRect();
            // Use fixed positioning relative to the viewport so the dropdown
            // isn't clipped by ancestor overflow. JS updates left/top/width.
            dropdown.style.position = 'fixed';
            dropdown.style.left = Math.max(0, rect.left) + 'px';
            dropdown.style.top = Math.max(0, rect.bottom) + 'px';
            dropdown.style.minWidth = Math.max(rect.width, 160) + 'px';
            dropdown.style.zIndex = 9999;
        } catch (e) {
            // if positioning fails, fall back to the default layout
            dropdown.style.position = '';
            dropdown.style.left = '';
            dropdown.style.top = '';
            dropdown.style.minWidth = '';
        }
    }

    // Reposition on viewport changes and when any scroll occurs (capture phase)
    window.addEventListener('resize', () => { if (!dropdown.hidden) positionDropdown(); });
    document.addEventListener('scroll', () => { if (!dropdown.hidden) positionDropdown(); }, true);

    function setActive(index) {
        const items = dropdown.querySelectorAll('li');
        items.forEach((li, i) => li.classList.toggle('lp-search-active', i === index));
        activeIndex = index;
    }

    input.addEventListener('input', () => {
        const matches = getMatches(input.value);
        if (matches.length > 0) {
            renderDropdown(matches);
        } else {
            dropdown.hidden = true;
            activeIndex = -1;
        }
    });

    input.addEventListener('keydown', (e) => {
        if (dropdown.hidden) return;
        const items = dropdown.querySelectorAll('li');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(Math.min(activeIndex + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const active = activeIndex >= 0 ? items[activeIndex] : items[0];
            if (active) {
                jumpToLevelplanItem(active.dataset.name);
                input.value = '';
                dropdown.hidden = true;
            }
        } else if (e.key === 'Escape') {
            dropdown.hidden = true;
        }
    });

    input.addEventListener('blur', () => {
        // Slight delay so mousedown on a list item fires first
        setTimeout(() => { dropdown.hidden = true; }, 150);
    });
}

// Jump to a named item in the leveling plan and flash-highlight it
function jumpToLevelplanItem(name) {
    ensureHighlightStyle();
    highlightInserted([name], 'levelplan', 1200, true);
}

let draggedElement = null;
let draggedListId = null;
let draggedIndex = null;
let phantomElement = null;
let dragRafPending = false;
let dragRafList = null;
let dragRafClientY = 0;

// --- Custom auto-scroll for the levelplan list during drag ---
// Replaces the browser's native (often erratic) drag auto-scroll with a smooth
// implementation. Acceleration starts inside the list near top/bottom edges and
// continues growing over the header/footer, providing seamless scrolling.
let _dragScrollAnimId = null;
let _dragScrollClientY = 0;
let _dragScrollClientX = 0;
let _dragScrollLastTime = 0;
const DRAG_SCROLL_INNER_ZONE = 40; // px inside list edge where acceleration begins
const DRAG_SCROLL_MAX_SPEED = 3000; // px/s — reached at the outer edge of header/footer

// Track cursor position globally during drag (capture phase fires everywhere).
document.addEventListener('dragover', (e) => {
    _dragScrollClientY = e.clientY;
    _dragScrollClientX = e.clientX;
}, true);

function _dragScrollTick(timestamp) {
    _dragScrollAnimId = null;
    if (!draggedElement) return; // drag ended

    const list = document.getElementById('levelplan');
    if (!list) { _dragScrollAnimId = requestAnimationFrame(_dragScrollTick); return; }

    const dt = _dragScrollLastTime
        ? Math.min((timestamp - _dragScrollLastTime) / 1000, 0.05) // cap to 50 ms
        : 0;
    _dragScrollLastTime = timestamp;

    // Geometry of the list and its header/footer
    const listRect = list.getBoundingClientRect();
    const lpSection = list.closest('.list-section.levelplan');
    let headerTop = listRect.top;
    let footerBottom = listRect.bottom;
    if (lpSection) {
        const header = lpSection.querySelector('.list-header');
        const footer = lpSection.querySelector('.lp-aggregate-footer');
        if (header) headerTop = header.getBoundingClientRect().top;
        if (footer) footerBottom = footer.getBoundingClientRect().bottom;
    }

    // Only scroll when the cursor is horizontally within the levelplan section
    if (lpSection) {
        const secRect = lpSection.getBoundingClientRect();
        if (_dragScrollClientX < secRect.left || _dragScrollClientX > secRect.right) {
            _dragScrollAnimId = requestAnimationFrame(_dragScrollTick);
            return;
        }
    }

    const y = _dragScrollClientY;
    let speed = 0; // px/s — negative = scroll up

    // Top zone: acceleration starts at (listTop + INNER_ZONE), grows toward headerTop
    const topZoneStart = listRect.top + DRAG_SCROLL_INNER_ZONE;
    const topZoneEnd = headerTop;
    if (y < topZoneStart) {
        const zoneSize = topZoneStart - topZoneEnd;
        const dist = topZoneStart - y;
        // frac can exceed 1 when cursor is above the header — that's fine,
        // it just means max+ speed, which the user explicitly wants.
        const frac = zoneSize > 0 ? dist / zoneSize : 1;
        speed = -DRAG_SCROLL_MAX_SPEED * frac * frac;
    }

    // Bottom zone: acceleration starts at (listBottom - INNER_ZONE), grows toward footerBottom
    const bottomZoneStart = listRect.bottom - DRAG_SCROLL_INNER_ZONE;
    const bottomZoneEnd = footerBottom;
    if (y > bottomZoneStart) {
        const zoneSize = bottomZoneEnd - bottomZoneStart;
        const dist = y - bottomZoneStart;
        const frac = zoneSize > 0 ? dist / zoneSize : 1;
        speed = DRAG_SCROLL_MAX_SPEED * frac * frac;
    }

    if (speed !== 0 && dt > 0) {
        list.scrollTop += speed * dt;
    }

    _dragScrollAnimId = requestAnimationFrame(_dragScrollTick);
}

function _startDragAutoScroll() {
    _dragScrollLastTime = 0;
    if (!_dragScrollAnimId) {
        _dragScrollAnimId = requestAnimationFrame(_dragScrollTick);
    }
}

function _stopDragAutoScroll() {
    if (_dragScrollAnimId) {
        cancelAnimationFrame(_dragScrollAnimId);
        _dragScrollAnimId = null;
    }
    _dragScrollLastTime = 0;
}

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

    // Suppress the browser's native drag auto-scroll on the levelplan list
    // (it accelerates to extreme speeds near the edge and stops at the
    // header/footer). We replace it with our own smooth implementation.
    const lpList = document.getElementById('levelplan');
    if (lpList) {
        // Measure scrollbar width before hiding it, then compensate with padding
        // so the content width doesn't shift.
        const scrollbarW = lpList.offsetWidth - lpList.clientWidth;
        lpList.style.overflowY = 'hidden';
        if (scrollbarW > 0) lpList.style.paddingRight = scrollbarW + 'px';
    }
    _startDragAutoScroll();
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

    // Stop custom auto-scroll and restore native overflow on the levelplan list
    _stopDragAutoScroll();
    const lpList = document.getElementById('levelplan');
    if (lpList) {
        lpList.style.overflowY = '';
        lpList.style.paddingRight = '';
    }
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

    // Extend the levelplan drop zone to include the list-header (top edge) and
    // lp-aggregate-footer (bottom edge) so the user can drop at position 0 or
    // at the very end even when the mouse drifts slightly outside the list div.
    // Guard flag: only attach once per element instance (setupDragListeners is
    // called again on mode switch, but the header/footer elements are persistent).
    const lpSection = document.querySelector('.list-section.levelplan');
    const lpList    = document.getElementById('levelplan');
    if (lpSection && lpList) {
        const lpHeader = lpSection.querySelector('.list-header');
        const lpFooter = lpSection.querySelector('.lp-aggregate-footer');

        // dragover the column-header row -> keep phantom at the very top
        if (lpHeader && !lpHeader._lpDragListenersAttached) {
            lpHeader._lpDragListenersAttached = true;
            lpHeader.addEventListener('dragover', (e) => {
                if (!draggedListId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                lpList.classList.add('drag-over');
                // Ensure phantom exists and is pinned at position 0
                dragRafList = lpList;
                dragRafClientY = -Infinity; // forces binary-search to resolve to index 0
                if (!dragRafPending) {
                    dragRafPending = true;
                    requestAnimationFrame(updatePhantomPosition);
                }
            });
            lpHeader.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDrop.call(lpList, e);
            });
            lpHeader.addEventListener('dragleave', (e) => {
                // Only clean up if the cursor is leaving toward something outside
                // the entire levelplan section.
                const to = e.relatedTarget;
                if (to && (lpList.contains(to) || lpList === to || lpHeader.contains(to))) return;
                if (to && lpSection.contains(to)) return;
                lpList.classList.remove('drag-over');
                if (phantomElement && phantomElement.parentNode) {
                    phantomElement.parentNode.removeChild(phantomElement);
                }
                phantomElement = null;
            });
        }

        // dragover the aggregate footer row -> keep phantom at the very bottom
        if (lpFooter && !lpFooter._lpDragListenersAttached) {
            lpFooter._lpDragListenersAttached = true;
            lpFooter.addEventListener('dragover', (e) => {
                if (!draggedListId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                lpList.classList.add('drag-over');
                // Ensure phantom exists and is pinned at the bottom
                dragRafList = lpList;
                dragRafClientY = Infinity; // forces binary-search to resolve to last index
                if (!dragRafPending) {
                    dragRafPending = true;
                    requestAnimationFrame(updatePhantomPosition);
                }
            });
            lpFooter.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDrop.call(lpList, e);
            });
            lpFooter.addEventListener('dragleave', (e) => {
                const to = e.relatedTarget;
                if (to && (lpList.contains(to) || lpList === to || lpFooter.contains(to))) return;
                if (to && lpSection.contains(to)) return;
                lpList.classList.remove('drag-over');
                if (phantomElement && phantomElement.parentNode) {
                    phantomElement.parentNode.removeChild(phantomElement);
                }
                phantomElement = null;
            });
        }
    }
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
    // Restrict elite copy phantom: cannot appear above its source quest
    if (draggedListId === 'levelplan' && draggedIndex !== null) {
        const draggedItem = data.levelplan[draggedIndex];
        if (draggedItem && draggedItem.isEliteCopy) {
            const baseName = draggedItem.name.endsWith(' (repeat)') ? draggedItem.name.slice(0, -' (repeat)'.length) : draggedItem.name;
            const sourceQuestDomIdx = allItems.findIndex(el => el.dataset.name === baseName);
            if (sourceQuestDomIdx !== -1) {
                lo = Math.max(lo, sourceQuestDomIdx + 1);
            }
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
        // If the cursor is moving to the levelplan list-header or aggregate
        // footer (which are outside #levelplan but still act as drop targets),
        // keep the phantom and drag-over state alive.
        const to = e.relatedTarget;
        if (this.id === 'levelplan' && to) {
            const lpSection = this.closest('.list-section.levelplan');
            if (lpSection) {
                const lpHeader = lpSection.querySelector('.list-header');
                const lpFooter = lpSection.querySelector('.lp-aggregate-footer');
                if ((lpHeader && (lpHeader === to || lpHeader.contains(to))) ||
                    (lpFooter && (lpFooter === to || lpFooter.contains(to)))) {
                    // Cursor entered a friendly zone -- do not remove phantom
                    return;
                }
            }
        }
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
            // Remove the elite copy entirely when the source quest leaves levelplan
            const eliteIdx = data.levelplan.findIndex(i => i.isEliteCopy && i.name === sourceItem.name + ' (repeat)');
            if (eliteIdx !== -1) data.levelplan.splice(eliteIdx, 1);
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
        let actualDrop = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;

        // Elite copy: enforce minimum position (must stay after its source quest)
        if (targetListId === 'levelplan' && sourceItem.isEliteCopy) {
            const baseName = sourceItem.name.endsWith(' (repeat)') ? sourceItem.name.slice(0, -' (repeat)'.length) : sourceItem.name;
            const sourceQuestIdx = data[draggedListId].findIndex(i => i.name === baseName && !i.isEliteCopy);
            if (sourceQuestIdx !== -1) {
                actualDrop = Math.max(actualDrop, sourceQuestIdx + 1);
            }
        }

        data[draggedListId].splice(actualDrop, 0, sourceItem);

        // Regular quest: move its elite copy to directly below its new position
        if (targetListId === 'levelplan' && !sourceItem.isEliteCopy && !sourceItem.isTakeLevel &&
                !sourceItem.isCustom && !sourceItem.isXpPot && !sourceItem.isXpPotStart && !sourceItem.isXpPotEnd) {
            const eliteName = sourceItem.name + ' (repeat)';
            const eliteIdx = data.levelplan.findIndex(i => i.isEliteCopy && i.name === eliteName);
            if (eliteIdx !== -1) {
                const eliteCopy = data.levelplan.splice(eliteIdx, 1)[0];
                const sourceNewIdx = data.levelplan.indexOf(sourceItem);
                if (sourceNewIdx !== -1) {
                    data.levelplan.splice(sourceNewIdx + 1, 0, eliteCopy);
                }
            }
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
            let deps = related.slice(1).map(it => ({ ...it, source: 'quests' }));
            const vipSagasChecked = document.getElementById('vip-sagas-header')?.checked;
            if (sourceItem.isSaga && vipSagasChecked && deps.length === 1) {
                deps = [];
            }
            const toInsert = deps.concat({ ...related[0], source: 'quests' });

            // Remove each moved quest from `data.quests` (if present)
            for (const it of toInsert) {
                const idx = data.quests.findIndex(q => q.name === it.name);
                if (idx !== -1) data.quests.splice(idx, 1);
            }

            // Bake the current default slayer bonus into newly-added slayer items.
            if (targetListId === 'levelplan') {
                const _defaultBonus = getDefaultSlayerBonus();
                for (const it of toInsert) {
                    if (it.isSlayer && !it.slayerBonus) it.slayerBonus = _defaultBonus;
                }
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

            // Bake the current default slayer bonus into newly-added slayer items.
            if (targetListId === 'levelplan' && itemToInsert.isSlayer && !itemToInsert.slayerBonus) {
                itemToInsert.slayerBonus = getDefaultSlayerBonus();
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

    // Restore native overflow before re-render so layout is correct
    _stopDragAutoScroll();
    const _lpList = document.getElementById('levelplan');
    if (_lpList) {
        _lpList.style.overflowY = '';
        _lpList.style.paddingRight = '';
    }

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
        // Remove the elite copy entirely before returning the quest to the pool
        const eliteIdx = data.levelplan.findIndex(i => i.isEliteCopy && i.name === item.name + ' (repeat)');
        if (eliteIdx !== -1) data.levelplan.splice(eliteIdx, 1);
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
            { name: 'Custom', xp: 0, qTime: 0, travelTime: 0, source: 'special', isCustom: true }
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

// ---------- Planning visibility toggle ----------
function togglePlanningVisibility() {
    const container = document.querySelector('.lists-container');
    const btn = document.getElementById('hide-planning-btn');
    const isHidden = container.classList.toggle('planning-hidden');
    document.body.classList.toggle('planning-hidden', isHidden);
    btn.textContent = isHidden ? 'Show Planning' : 'Hide Planning';
    btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
}

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
        ? _getEpicConfigForPreset(CONFIG_PRESET)
        : _getHeroicConfigForPreset(CONFIG_PRESET);
    // If the selected preset's config is empty (never saved/imported), fall back to default so the textarea isn't blank
    const configSource = _rawConfigSource.length === 0
        ? (configMode === 'epic' ? EPIC_DEFAULT_CONFIG : HEROIC_DEFAULT_CONFIG)
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
    } else if (CONFIG_PRESET === 'imported') {
        // Imported preset: leave config slots untouched, just switch active preset
        window.ACTIVE_QUESTS_PRESET = 'imported';
    } else {
        // Default preset: leave HEROIC_CUSTOM_CONFIG / EPIC_CUSTOM_CONFIG untouched
        window.ACTIVE_QUESTS_PRESET = 'default';
    }

    _rebuildHeroicQuests();
    _rebuildEpicQuests();
    _computeQuestXP('heroic');
    _computeQuestXP('epic');

    // Re-hydrate both levelplans so items pick up the updated config fields
    const heroicSerial = serialiseLevelplan(data.levelplanByMode.heroic);
    const epicSerial   = serialiseLevelplan(data.levelplanByMode.epic);
    data.levelplanByMode.heroic = hydrateLevelplan(heroicSerial, HEROIC_QUESTS, 'heroic');
    data.levelplanByMode.epic   = hydrateLevelplan(epicSerial,   EPIC_QUESTS, 'epic');
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
        epicCustomConfig: EPIC_CUSTOM_CONFIG,
        heroicImportedConfig: HEROIC_IMPORTED_CONFIG,
        epicImportedConfig: EPIC_IMPORTED_CONFIG
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

// Exports the config currently shown in the Config panel as a CSV file.
// Tries the native OS Save dialog first; falls back to an HTML filename dialog + download.
async function _exportCustomConfigToFile() {
    const configMode = _getConfigMode();
    const _rawConfigSource = configMode === 'epic'
        ? _getEpicConfigForPreset(CONFIG_PRESET)
        : _getHeroicConfigForPreset(CONFIG_PRESET);
    const configSource = (_rawConfigSource && _rawConfigSource.length > 0)
        ? _rawConfigSource
        : (configMode === 'epic' ? EPIC_DEFAULT_CONFIG : HEROIC_DEFAULT_CONFIG);

    // Build CSV content with header
    let csvContent = 'Quest Name,Travel Time,Quest Time,Bonus XP,Optional XP\n';
    configSource
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(q => {
            const questName = `"${q.name}"`;
            const travel = q.travelTime != null ? q.travelTime : '';
            const qtime = q.qTime != null ? q.qTime : '';
            const bonus = (q.xpmods !== null && q.xpmods !== undefined && q.xpmods !== '')
                ? Math.round(Number(q.xpmods) * 100) : '';
            const opt = (q.optionalXP !== null && q.optionalXP !== undefined && q.optionalXP !== '')
                ? Math.round(Number(q.optionalXP) * 100) : '';
            csvContent += `${questName},${travel},${qtime},${bonus},${opt}\n`;
        });

    const defaultName = `${configMode}_config`;

    // --- Native OS Save dialog ---
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${defaultName}.csv`,
                types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(csvContent);
            await writable.close();
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('showSaveFilePicker failed, falling back to download:', err);
        }
    }

    // --- Fallback: HTML filename dialog + browser download ---
    const filename = await _showFilenameDialog(defaultName, '.csv');
    if (!filename) return;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
                        if (bonus !== '') { const v = parseFloat(bonus); if (isFinite(v)) entry.xpmods = v / 100; }
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
                    if (bonus !== '') { const v = parseFloat(bonus); if (isFinite(v)) entry.xpmods = v / 100; }
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
