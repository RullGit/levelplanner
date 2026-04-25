// Storage key for localStorage
const STORAGE_KEY = 'dragDropListsData';

// Initial data from data.json
const INITIAL_DATA = [
    { "id": 1, "name": "Information is Key", "level": 2, "xp": 1573 },
    { "id": 2, "name": "Durk's Got a Secret", "level": 2, "xp": 2751 },
    { "id": 3, "name": "The Black Loch", "level": 7, "xp": 1652 },
    { "id": 4, "name": "The Kobold's New Ringleader", "level": 2, "xp": 2882 },
    { "id": 5, "name": "Storm the Beaches", "level": 7, "xp": 2987 },
    { "id": 6, "name": "Stealthy Repossession", "level": 2, "xp": 2435 },
    { "id": 7, "name": "The Sunken Sewer", "level": 3, "xp": 2229 },
    { "id": 8, "name": "The Grotto", "level": 1, "xp": 172 },
    { "id": 9, "name": "Hall of the Mark", "level": 1, "xp": 0 },
    { "id": 10, "name": "Heyton's Rest", "level": 1, "xp": 645 },
    { "id": 11, "name": "The Cannith Crystal", "level": 1, "xp": 404 },
    { "id": 12, "name": "The Storehouse's Secret", "level": 1, "xp": 979 },
    { "id": 13, "name": "The Collaborator", "level": 1, "xp": 1265 },
    { "id": 14, "name": "Stopping the Shuaquin", "level": 1, "xp": 690 },
    { "id": 15, "name": "Necromancer's Doom", "level": 1, "xp": 498 },
    { "id": 16, "name": "Redemption", "level": 1, "xp": 702 },
    { "id": 17, "name": "Sacrifices", "level": 1, "xp": 662 },
    { "id": 18, "name": "Violent Delights", "level": 1, "xp": 626 },
    { "id": 19, "name": "The Hobgoblin Horde", "level": 1, "xp": 676 },
    { "id": 20, "name": "Watch Your Step", "level": 1, "xp": 804 },
    { "id": 21, "name": "Obstructing the Orcs", "level": 1, "xp": 922 },
    { "id": 22, "name": "The Bugbear Bandits", "level": 1, "xp": 861 },
    { "id": 23, "name": "Treasure Hunt", "level": 1, "xp": 760 },
    { "id": 24, "name": "Caged Beast", "level": 1, "xp": 924 },
    { "id": 25, "name": "The Kobold's Den: Clan Gnashtooth", "level": 3, "xp": 1193 },
    { "id": 26, "name": "The Kobold's Den: Rescuing Arlos", "level": 3, "xp": 2934 },
    { "id": 27, "name": "Misery's Peak", "level": 2, "xp": 626 },
    { "id": 28, "name": "Bringing the Light", "level": 2, "xp": 756 },
    { "id": 29, "name": "Garrison's Missing Pack", "level": 2, "xp": 988 },
    { "id": 30, "name": "Recovering the Lost Tome", "level": 2, "xp": 997 },
    { "id": 31, "name": "Walk the Butcher's Path", "level": 2, "xp": 1105 },
    { "id": 32, "name": "Haverdasher", "level": 2, "xp": 1354 },
    { "id": 33, "name": "The Smuggler's Warehouse", "level": 2, "xp": 534 },
    { "id": 34, "name": "Protect Baudry's Interests", "level": 2, "xp": 378 },
    { "id": 35, "name": "Stop Hazadill's Shipment", "level": 2, "xp": 565 },
    { "id": 36, "name": "Retrieve the Stolen Goods", "level": 2, "xp": 1332 }
];

const LEVEL_XP_THRESHOLDS = [
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

function getPlayerLevelForXP(xp) {
    for (let i = LEVEL_XP_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_XP_THRESHOLDS[i].xp) {
            return LEVEL_XP_THRESHOLDS[i].lvl;
        }
    }
    return 1;
}

// Data structure
let data = {
    levelplan: [],
    quests: [],
    levelups: []
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Initialize the app with data from JSON
function initializeApp() {
    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (stored) {
        // If data exists in localStorage, use it
        try {
            data = JSON.parse(stored);
            data.levelplan = data.levelplan || [];
            data.quests = data.quests || [];
            data.levelups = data.levelups || Array.from({ length: 20 }, (_, i) => ({
                name: `Take level ${i + 1}`,
                xp: 0,
                level: '',
                source: 'levelups'
            }));
        } catch (e) {
            console.error('Error loading data from storage:', e);
            loadInitialData();
        }
    } else {
        // Otherwise, load from INITIAL_DATA for the first time
        loadInitialData();
    }
    
    renderLists();
    setupDragListeners();
}

// Load initial data (all Quests in quests, Level Plan starts empty in levelplan)
function loadInitialData() {
    data.quests = JSON.parse(JSON.stringify(INITIAL_DATA)).map(item => ({
        ...item,
        source: 'quests'
    }));
    data.levelplan = [];
    data.levelups = [{
        name: 'Take Level',
        xp: 0,
        level: '',
        source: 'levelups'
    }];
    saveToStorage();
}

// Save data to localStorage
function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Render all lists
function renderLists() {
    renderList('levelplan');
    renderList('quests');
    renderList('levelups');
}
function renderList(listId) {
    const listElement = document.getElementById(listId);
    const items = data[listId] || [];

    listElement.innerHTML = '';

    if (items.length === 0) {
        listElement.innerHTML = '<div class="empty-message">No items yet</div>';
        return;
    }

    let cumulativeXP = 0;
    let levelupCount = 0;
    const rowData = items.map(item => {
        const row = { item, cumulativeXP: '', playerLevel: '', displayName: item.name };
        if (listId === 'levelplan') {
            const xpValue = Number(item.xp) || 0;
            cumulativeXP += xpValue;
            row.cumulativeXP = cumulativeXP;
            row.playerLevel = getPlayerLevelForXP(cumulativeXP);

            if (item.source === 'levelups') {
                levelupCount += 1;
                row.displayName = `Take level ${levelupCount}`;
            }
        }
        return row;
    });

    rowData.forEach((row, index) => {
        const itemElement = createItemElement(row.item, listId, index, row.cumulativeXP, row.playerLevel, row.displayName);
        listElement.appendChild(itemElement);
    });
}

// Create an item element
function createItemElement(item, listId, index, cumulativeXP, playerLevel, displayName) {
    const div = document.createElement('div');
    div.className = 'item';
    div.draggable = true;
    div.dataset.listId = listId;
    div.dataset.index = index;

    const cumDiv = document.createElement('div');
    cumDiv.className = 'item-cumulative';
    cumDiv.textContent = cumulativeXP !== '' ? cumulativeXP.toLocaleString() : '';

    const playerDiv = document.createElement('div');
    playerDiv.className = 'item-player';
    playerDiv.textContent = playerLevel !== '' ? playerLevel : '';

    const spacerDiv = document.createElement('div');
    spacerDiv.className = 'item-spacer';

    const xpDiv = document.createElement('div');
    xpDiv.className = 'item-xp';
    xpDiv.textContent = item.xp !== undefined ? item.xp : '';

    const levelDiv = document.createElement('div');
    levelDiv.className = 'item-level';
    levelDiv.textContent = item.level !== undefined ? item.level : '';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'item-name';
    nameDiv.textContent = displayName || item.name;

    if (listId === 'levelplan') {
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'item-content-wrapper';
        contentWrapper.appendChild(xpDiv);
        contentWrapper.appendChild(levelDiv);
        contentWrapper.appendChild(nameDiv);

        div.appendChild(cumDiv);
        div.appendChild(playerDiv);
        div.appendChild(spacerDiv);
        div.appendChild(contentWrapper);
    } else if (listId === 'levelups') {
        div.appendChild(nameDiv);
    } else {
        div.appendChild(xpDiv);
        div.appendChild(levelDiv);
        div.appendChild(nameDiv);
    }

    if (listId === 'levelplan') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'item-delete';
        deleteBtn.textContent = '✕';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteItem(listId, index);
        };
        div.appendChild(deleteBtn);
    }

    // Drag event listeners
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

// Drag state
let draggedElement = null;
let draggedListId = null;
let draggedIndex = null;
let phantomElement = null;

// Handle drag start
function handleDragStart(e) {
    draggedElement = this;
    draggedListId = this.dataset.listId;
    draggedIndex = parseInt(this.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
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
}

// Setup drag listeners for lists
function setupDragListeners() {
    const lists = document.querySelectorAll('.list');

    lists.forEach(list => {
        // Only allow drops into levelplan (Level Plan)
        if (list.id === 'levelplan') {
            list.addEventListener('dragover', handleDragOver);
            list.addEventListener('drop', handleDrop);
            list.addEventListener('dragleave', handleDragLeave);
        }
    });
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
    
    // Create phantom if it doesn't exist
    if (!phantomElement) {
        phantomElement = document.createElement('div');
        phantomElement.className = 'phantom-item';
    }

    // Find correct insertion point
    const listId = this.dataset.listId;
    const allItems = this.querySelectorAll('.item:not(.dragging)');
    let dropIndex = allItems.length;
    let insertBefore = null;

    // Find the first item where cursor is above its midpoint
    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        const rect = item.getBoundingClientRect();
        const itemMidpoint = rect.top + rect.height / 2;

        if (e.clientY < itemMidpoint) {
            dropIndex = i;
            insertBefore = item;
            break;
        }
    }

    // Insert phantom at the correct position
    if (insertBefore) {
        this.insertBefore(phantomElement, insertBefore);
    } else {
        this.appendChild(phantomElement);
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

    const targetListId = this.dataset.listId;
    const sourceItem = data[draggedListId][draggedIndex];
    
    // Calculate drop index based on phantom position
    let dropIndex = data[targetListId].length;
    
    if (phantomElement && phantomElement.parentNode === this) {
        const allChildren = Array.from(this.children);
        dropIndex = allChildren.indexOf(phantomElement);
    }

    if (targetListId === draggedListId) {
        // Reorder within the same list
        data[draggedListId].splice(draggedIndex, 1);
        
        // Adjust dropIndex if moving within same list
        if (draggedIndex < dropIndex) {
            data[draggedListId].splice(dropIndex - 1, 0, sourceItem);
        } else {
            data[draggedListId].splice(dropIndex, 0, sourceItem);
        }
    } else {
        // Copy from levelups or move from other source lists
        const itemToInsert = draggedListId === 'levelups'
            ? { ...sourceItem, source: 'levelups' }
            : { ...sourceItem, source: draggedListId };

        if (draggedListId !== 'levelups') {
            data[draggedListId].splice(draggedIndex, 1);
        }

        data[targetListId].splice(dropIndex, 0, itemToInsert);
    }

    this.classList.remove('drag-over');
    if (phantomElement && phantomElement.parentNode) {
        phantomElement.parentNode.removeChild(phantomElement);
    }
    phantomElement = null;
    saveToStorage();
    renderLists();
    setupDragListeners();
}

// Delete (move back to original source list) an item
function deleteItem(listId, index) {
    const item = data[listId].splice(index, 1)[0];
    if (listId === 'levelplan' && item.source !== 'levelups') {
        insertQuestInOriginalPosition(item);
    }
    saveToStorage();
    renderLists();
    setupDragListeners();
}

function insertQuestInOriginalPosition(item) {
    const insertIndex = data.quests.findIndex(q => (q.id || Number.MAX_SAFE_INTEGER) > (item.id || Number.MAX_SAFE_INTEGER));
    if (insertIndex === -1) {
        data.quests.push(item);
    } else {
        data.quests.splice(insertIndex, 0, item);
    }
}

// Reset all data
function resetData() {
    if (confirm('Are you sure you want to reset? All moved items will return to the right list.')) {
        loadInitialData();
        renderLists();
        setupDragListeners();
    }
}
