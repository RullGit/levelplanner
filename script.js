// Storage key for localStorage
const STORAGE_KEY = 'dragDropListsData';

// Initial data from data.json
const INITIAL_DATA = [
    { "name": "Information is Key", "level": 2, "xp": 1573 },
    { "name": "Durk's Got a Secret", "level": 2, "xp": 2751 },
    { "name": "The Black Loch", "level": 7, "xp": 1652 },
    { "name": "The Kobold's New Ringleader", "level": 2, "xp": 2882 },
    { "name": "Storm the Beaches", "level": 7, "xp": 2987 },
    { "name": "Stealthy Repossession", "level": 2, "xp": 2435 },
    { "name": "The Sunken Sewer", "level": 3, "xp": 2229 },
    { "name": "The Grotto", "level": 1, "xp": 172 },
    { "name": "Hall of the Mark", "level": 1, "xp": 0 },
    { "name": "Heyton's Rest", "level": 1, "xp": 645 },
    { "name": "The Cannith Crystal", "level": 1, "xp": 404 },
    { "name": "The Storehouse's Secret", "level": 1, "xp": 979 },
    { "name": "The Collaborator", "level": 1, "xp": 1265 },
    { "name": "Stopping the Shuaquin", "level": 1, "xp": 690 },
    { "name": "Necromancer's Doom", "level": 1, "xp": 498 },
    { "name": "Redemption", "level": 1, "xp": 702 },
    { "name": "Sacrifices", "level": 1, "xp": 662 },
    { "name": "Violent Delights", "level": 1, "xp": 626 },
    { "name": "The Hobgoblin Horde", "level": 1, "xp": 676 },
    { "name": "Watch Your Step", "level": 1, "xp": 804 },
    { "name": "Obstructing the Orcs", "level": 1, "xp": 922 },
    { "name": "The Bugbear Bandits", "level": 1, "xp": 861 },
    { "name": "Treasure Hunt", "level": 1, "xp": 760 },
    { "name": "Caged Beast", "level": 1, "xp": 924 },
    { "name": "The Kobold's Den: Clan Gnashtooth", "level": 3, "xp": 1193 },
    { "name": "The Kobold's Den: Rescuing Arlos", "level": 3, "xp": 2934 },
    { "name": "Misery's Peak", "level": 2, "xp": 626 },
    { "name": "Bringing the Light", "level": 2, "xp": 756 },
    { "name": "Garrison's Missing Pack", "level": 2, "xp": 988 },
    { "name": "Recovering the Lost Tome", "level": 2, "xp": 997 },
    { "name": "Walk the Butcher's Path", "level": 2, "xp": 1105 },
    { "name": "Haverdasher", "level": 2, "xp": 1354 },
    { "name": "The Smuggler's Warehouse", "level": 2, "xp": 534 },
    { "name": "Protect Baudry's Interests", "level": 2, "xp": 378 },
    { "name": "Stop Hazadill's Shipment", "level": 2, "xp": 565 },
    { "name": "Retrieve the Stolen Goods", "level": 2, "xp": 1332 }
];

// Data structure
let data = {
    levelplan: [],
    quests: []
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
    data.quests = JSON.parse(JSON.stringify(INITIAL_DATA));
    data.levelplan = [];
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
    const rowData = items.map(item => {
        const row = { item, cumulativeXP: '', playerLevel: '' };
        if (listId === 'levelplan') {
            cumulativeXP += item.xp;
            row.cumulativeXP = cumulativeXP;
            row.playerLevel = Math.floor(Math.sqrt(cumulativeXP / 100)) + 1;
        }
        return row;
    });

    rowData.forEach((row, index) => {
        const itemElement = createItemElement(row.item, listId, index, row.cumulativeXP, row.playerLevel);
        listElement.appendChild(itemElement);
    });
}

// Create an item element
function createItemElement(item, listId, index, cumulativeXP, playerLevel) {
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
    xpDiv.textContent = item.xp;

    const levelDiv = document.createElement('div');
    levelDiv.className = 'item-level';
    levelDiv.textContent = item.level;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'item-name';
    nameDiv.textContent = item.name;

    div.appendChild(cumDiv);
    div.appendChild(playerDiv);
    div.appendChild(spacerDiv);
    div.appendChild(xpDiv);
    div.appendChild(levelDiv);
    div.appendChild(nameDiv);

    // Only add delete button for levelplan (Level Plan) items
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
        // Move to a different list
        data[draggedListId].splice(draggedIndex, 1);
        data[targetListId].splice(dropIndex, 0, sourceItem);
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

// Delete (move back to quests) an item
function deleteItem(listId, index) {
    const item = data[listId].splice(index, 1)[0];
    // Move back to quests
    data['quests'].push(item);
    saveToStorage();
    renderLists();
    setupDragListeners();
}

// Reset all data
function resetData() {
    if (confirm('Are you sure you want to reset? All moved items will return to the right list.')) {
        loadInitialData();
        renderLists();
        setupDragListeners();
    }
}
