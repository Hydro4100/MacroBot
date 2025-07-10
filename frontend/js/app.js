document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // --- DOM & ELEMENT REFERENCES ---
    // =========================================================================
    const tabContainer = document.getElementById('tab-container');
    const tabList = document.getElementById('tab-list');
    const addTabBtn = document.getElementById('add-tab-btn');
    const nodeList = document.getElementById('node-list');
    const canvas = document.getElementById('canvas');
    const canvasContent = document.getElementById('canvas-content');
    const svgLayer = document.getElementById('svg-layer');
    const coordsDisplay = document.getElementById('coords-display');
    const errorModal = document.getElementById('error-modal');
    const errorMessage = document.getElementById('error-message');
    const errorModalClose = document.getElementById('error-modal-close');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmYesBtn = document.getElementById('confirm-yes');
    const confirmNoBtn = document.getElementById('confirm-no');
    const contextMenu = document.getElementById('context-menu');
    const canvasContextMenu = document.getElementById('canvas-context-menu');
    const addCommentBtn = document.getElementById('menu-add-comment');
    const colorPalette = document.getElementById('color-palette');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalClose = document.getElementById('settings-modal-close');
    const themeSwitcher = document.getElementById('theme-switcher');
    const disableErrorsCheckbox = document.getElementById('disable-errors-checkbox');
    const emergencyStopRecorder = document.getElementById('emergency-stop-recorder');
    const undoRecorder = document.getElementById('undo-recorder');
    const redoRecorder = document.getElementById('redo-recorder');
    const gridSnapCheckbox = document.getElementById('grid-snap-checkbox');
    const gridSnapSizeInput = document.getElementById('grid-snap-size-input');
    const wireStyleSwitcher = document.getElementById('wire-style-switcher');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const newBtn = document.getElementById('new-btn');
    const saveBtn = document.getElementById('save-btn');
    const importBtn = document.getElementById('import-btn');
    const validateBtn = document.getElementById('validate-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const infoModalClose = document.getElementById('info-modal-close');
    const welcomeModal = document.getElementById('welcome-modal');
    const welcomeModalClose = document.getElementById('welcome-modal-close');
    const welcomeVersionSpan = document.getElementById('welcome-version');
    const minimap = document.getElementById('minimap');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapViewport = document.getElementById('minimap-viewport');
    const minimapCtx = minimapCanvas.getContext('2d');
    const updateModal = document.getElementById('update-modal');
    const updateVersionSpan = document.getElementById('update-version');
    const updateDownloadBtn = document.getElementById('update-download-btn');
    const updateDismissBtn = document.getElementById('update-dismiss-btn');
    
    // =========================================================================
    // --- STATE MANAGEMENT ---
    // =========================================================================
    let tabs = [];
    let activeTabId = null;
    
    let activeNodeForMenu = null;
    let isDrawingWire = false;
    let tempWire = null;
    let startPin = null;
    let isPanning = false;
    const MIN_ZOOM = 0.2, MAX_ZOOM = 2.0;
    let isRecordingKey = false;
    let currentRecordingElement = null;
    let heldKeys = new Set();
    let recordingTimeout = null;
    let confirmCallback = null;
    let lastCanvasContextMenuPos = { x: 0, y: 0 };
    let minimapBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let isDraggingMinimap = false;

    // --- Settings State ---
    const defaultSettings = {
        general: { theme: 'dark', showErrors: true },
        canvas: { snapToGrid: false, gridSnapSize: 20, wireStyle: 'curved' },
        hotkeys: { emergencyStop: 'Not Set', undo: '<ctrl>+z', redo: '<ctrl>+y' }
    };
    let appSettings = JSON.parse(JSON.stringify(defaultSettings));

    // =========================================================================
    // --- NODE DEFINITIONS ---
    // =========================================================================
    const availableNodes = [
        // --- EXECUTION NODES ---
        {
            type: 'start',
            name: 'Start',
            description: 'The entry point for a macro. Triggered by a hotkey.',
            execOutputs: [{ name: 'exec' }],
            params: [
                { name: 'Hotkey', type: 'key_recorder', defaultValue: 'Not Set' },
                { name: 'Loop Continuously', type: 'checkbox', defaultValue: false }
            ]
        },
        {
            type: 'delay',
            name: 'Delay',
            description: 'Pauses the macro for a specified amount of time.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'Duration', type: 'number', defaultValue: 1, min: 0.01 }
            ],
            params: [
                { name: 'Unit', type: 'select', defaultValue: 'seconds', options: ['Milliseconds', 'Seconds', 'Minutes'] }
            ]
        },
        {
            type: 'key_press',
            name: 'Key Press',
            description: 'Simulates a keyboard key being pressed, held, or released.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'Key', type: 'key_recorder', defaultValue: 'Press to record' }
            ],
            params: [
                { name: 'Action', type: 'select', defaultValue: 'press', options: ['Press', 'Hold'] },
                { name: 'Duration', type: 'number', defaultValue: 0.5, min: 0.01, condition: 'Action', conditionValue: 'hold' },
                { name: 'Unit', type: 'select', defaultValue: 'seconds', options: ['Milliseconds', 'Seconds'], condition: 'Action', conditionValue: 'hold' }
            ]
        },
        {
            type: 'mouse_click',
            name: 'Mouse Click',
            description: 'Simulates a mouse button being clicked or held.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'Duration', type: 'number', defaultValue: 0.5, min: 0.01, condition: 'Action', conditionValue: 'hold' }
            ],
            params: [
                { name: 'Button', type: 'select', defaultValue: 'left', options: ['Left', 'Right', 'Middle'] },
                { name: 'Action', type: 'select', defaultValue: 'click', options: ['Click', 'Double Click', 'Hold'] },
                { name: 'Unit', type: 'select', defaultValue: 'seconds', options: ['Milliseconds', 'Seconds'], condition: 'Action', conditionValue: 'hold' }
            ]
        },
        {
            type: 'mouse_move',
            name: 'Mouse Move',
            description: 'Moves the mouse cursor to a specific X/Y coordinate on the screen.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'X', type: 'number', defaultValue: 0, min: -9999, max: 9999 },
                { name: 'Y', type: 'number', defaultValue: 0, min: -9999, max: 9999 },
                { name: 'Duration', type: 'number', defaultValue: 0.25, min: 0.01, max: 9999 }
            ],
            params: [
                { name: 'Unit', type: 'select', defaultValue: 'seconds', options: ['Milliseconds', 'Seconds'] }
            ]
        },
        {
            type: 'mouse_scroll',
            name: 'Mouse Scroll',
            description: 'Simulates the mouse wheel scrolling up or down.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'Amount', type: 'number', defaultValue: 100 }
            ],
            params: [
                { name: 'Direction', type: 'select', defaultValue: 'down', options: ['Up', 'Down'] }
            ]
        },
        {
            type: 'type_string',
            name: 'Type String',
            description: 'Types out a sequence of text characters.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'Text', type: 'string', defaultValue: 'Hello, world!' },
                { name: 'Delay', type: 'number', defaultValue: 50, min: 0.01, max: 9999 }
            ],
            params: [
                 { name: 'Unit', type: 'select', defaultValue: 'milliseconds', options: ['Milliseconds', 'Seconds'] }
            ]
        },
        {
            type: 'find_image',
            name: 'Find Image',
            description: 'Searches the screen for a specific image. Executes the "Found" or "Not Found" path.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [
                { name: 'Found', class: 'found' },
                { name: 'Not Found', class: 'not_found' }
            ],
            dataInputs: [
                { name: 'Image', type: 'image_selector' },
                { name: 'Confidence', type: 'number', defaultValue: 80, min: 1, max: 100 }
            ],
            dataOutputs: [
                { name: 'X', type: 'number' },
                { name: 'Y', type: 'number' }
            ]
        },
        {
            type: 'if_statement',
            name: 'If Statement',
            description: 'Branches the execution flow based on a true/false condition.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [
                { name: 'True', class: 'found' },
                { name: 'False', class: 'not_found' }
            ],
            dataInputs: [
                { name: 'Condition', type: 'boolean' }
            ]
        },
        {
            type: 'loop',
            name: 'For Loop',
            description: 'Repeats an execution path a specific number of times.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [
                { name: 'Loop Body', class: 'found' },
                { name: 'Completed', class: 'not_found' }
            ],
            dataInputs: [
                { name: 'Iterations', type: 'number', defaultValue: 5, min: 1 }
            ],
            dataOutputs: [
                { name: 'Index', type: 'number' }
            ]
        },
        {
            type: 'while_loop',
            name: 'While Loop',
            description: 'Repeats an execution path as long as a condition is true.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [
                { name: 'Loop Body', class: 'found' },
                { name: 'Completed', class: 'not_found' }
            ],
            dataInputs: [
                { name: 'Condition', type: 'boolean' }
            ]
        },
        {
            type: 'define_function',
            name: 'Define Function',
            description: 'Creates an entry point for a reusable function.',
            execOutputs: [{ name: 'exec' }],
            params: [
                { name: 'Function Name', type: 'string', defaultValue: 'myFunction' }
            ]
        },
        {
            type: 'call_function',
            name: 'Call Function',
            description: 'Executes a previously defined function.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            params: [
                { name: 'Function Name', type: 'select', defaultValue: '', options: [] }
            ]
        },
        {
            type: 'return_from_function',
            name: 'Return',
            description: 'Returns execution from the current function.',
            execInputs: [{ name: 'exec' }]
        },
        {
            type: 'try_catch',
            name: 'Try/Catch',
            description: 'Attempts to run a block of code. If an error occurs, it runs a different block.',
            tier: 'pro',
            execInputs: [{ name: 'exec' }],
            execOutputs: [
                { name: 'Try', class: 'found' },
                { name: 'Catch', class: 'not_found' },
                { name: 'Completed' }
            ]
        },

        // --- DATA & LOGIC NODES (no execution pins) ---
        {
            type: 'string_literal',
            name: 'String',
            description: 'Provides a text (string) value.',
            dataInputs: [ { name: 'value', type: 'string', defaultValue: 'some text', hasPin: false } ],
            dataOutputs: [ { name: 'out', type: 'string' } ]
        },
        {
            type: 'number_literal',
            name: 'Number',
            description: 'Provides a numerical value.',
            dataInputs: [ { name: 'value', type: 'number', defaultValue: 123, hasPin: false } ],
            dataOutputs: [ { name: 'out', type: 'number' } ]
        },
        {
            type: 'compare',
            name: 'Compare',
            description: 'Compares two values (A and B) and outputs a true/false result.',
            dataInputs: [
                { name: 'A', type: 'any' },
                { name: 'B', type: 'any' }
            ],
            params: [
                { name: 'Type', type: 'select', defaultValue: 'number', options: ['Number', 'String'] },
                { name: 'Operator', type: 'select', defaultValue: '==', options: ['==', '!=', '>', '<', '>=', '<='] }
            ],
            dataOutputs: [
                { name: 'Result', type: 'boolean' }
            ]
        },
        {
            type: 'math',
            name: 'Math',
            description: 'Performs a mathematical operation on two numbers (A and B).',
            dataInputs: [
                { name: 'A', type: 'number', defaultValue: 0 },
                { name: 'B', type: 'number', defaultValue: 0 }
            ],
            params: [
                { name: 'Operator', type: 'select', defaultValue: 'add', options: ['Add', 'Subtract', 'Multiply', 'Divide'] }
            ],
            dataOutputs: [
                { name: 'Result', type: 'number' }
            ]
        },
        {
            type: 'set_variable',
            name: 'Set Variable',
            description: 'Stores a value in a named variable.',
            execInputs: [{ name: 'exec' }],
            execOutputs: [{ name: 'exec' }],
            dataInputs: [
                { name: 'Name', type: 'string', defaultValue: 'myVar' },
                { name: 'Value', type: 'any' }
            ]
        },
        {
            type: 'get_variable',
            name: 'Get Variable',
            description: 'Retrieves a value from a named variable.',
            dataInputs: [
                { name: 'Name', type: 'select', defaultValue: '', options: [], hasPin: false }
            ],
            dataOutputs: [
                { name: 'Value', type: 'any' }
            ]
        },
        // --- COMMENT NODE ---
        {
            type: 'comment',
            name: 'Comment',
            description: 'A resizable text box for adding notes to the canvas.'
        }
    ];

    // =========================================================================
    // --- TAB MANAGEMENT ---
    // =========================================================================
    
    function createNewTabState(name) {
        return {
            id: `tab-${Date.now()}-${Math.random()}`,
            name: name || 'Untitled',
            history: [],
            historyIndex: -1,
            // Canvas state
            connections: [],
            panX: 0,
            panY: 0,
            scale: 1,
            nodeIdCounter: 0,
        };
    }

    function getActiveTab() {
        return tabs.find(t => t.id === activeTabId);
    }
    
    function addTab(state) {
        const newTabState = state || createNewTabState();
        tabs.push(newTabState);
        switchTab(newTabState.id);
        renderTabs();
    }
    
    function switchTab(tabId) {
        if (activeTabId === tabId) return;

        // Save current canvas state before switching
        const currentTab = getActiveTab();
        if (currentTab) {
            currentTab.canvasState = serializeCanvas();
        }

        // Set new active tab
        activeTabId = tabId;

        // Load new tab's state
        const newTab = getActiveTab();
        if (newTab && newTab.canvasState) {
            deserializeCanvas(newTab.canvasState);
        } else {
            // It's a fresh tab, clear the canvas
            clearCanvas();
        }
        
        // Save initial state for the new tab's history
        saveState();
        renderTabs();
        updateUndoRedoButtons();
    }

    function closeTab(tabId) {
        const tabIndex = tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        tabs.splice(tabIndex, 1);

        if (activeTabId === tabId) {
            if (tabs.length > 0) {
                // Switch to the previous tab, or the first one if the closed tab was the first
                const newActiveIndex = Math.max(0, tabIndex - 1);
                switchTab(tabs[newActiveIndex].id);
            } else {
                // If the last tab was closed, create a new one
                addTab();
            }
        }
        
        renderTabs();
    }

    function renameTab(tabId, newName) {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.name = newName;
            renderTabs();
        }
    }

    function renderTabs() {
        tabList.innerHTML = '';
        tabs.forEach(tab => {
            const tabEl = document.createElement('li');
            tabEl.className = 'tab';
            tabEl.dataset.tabId = tab.id;
            if (tab.id === activeTabId) {
                tabEl.classList.add('active');
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tab-name';
            nameSpan.textContent = tab.name;
            tabEl.appendChild(nameSpan);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close-btn';
            closeBtn.innerHTML = '&times;';
            tabEl.appendChild(closeBtn);
            
            tabList.appendChild(tabEl);
        });
    }

    tabContainer.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab');
        if (!tabEl) return;

        const tabId = tabEl.dataset.tabId;
        if (e.target.classList.contains('tab-close-btn')) {
            e.stopPropagation();
            closeTab(tabId);
        } else {
            switchTab(tabId);
        }
    });
    
    tabList.addEventListener('dblclick', (e) => {
        const nameSpan = e.target.closest('.tab-name');
        if (!nameSpan) return;
        
        const tabEl = nameSpan.closest('.tab');
        const tabId = tabEl.dataset.tabId;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tab-name-input';
        input.value = nameSpan.textContent;
        
        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        const finishEditing = () => {
            const newName = input.value.trim() || 'Untitled';
            renameTab(tabId, newName);
            // The renderTabs() call will replace the input with a span
        };

        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = nameSpan.textContent; // Revert
                input.blur();
            }
        });
    });

    addTabBtn.addEventListener('click', () => addTab());

    // =========================================================================
    // --- CANVAS & VIEWPORT ---
    // =========================================================================
    function updateCanvasTransform() { 
        const tab = getActiveTab();
        if (!tab) return;
        canvasContent.style.transform = `translate(${tab.panX}px, ${tab.panY}px) scale(${tab.scale})`; 
        updateMinimap(); 
    }
    function screenToCanvas(screenX, screenY) { 
        const tab = getActiveTab();
        if (!tab) return { x: 0, y: 0 };
        const canvasRect = canvas.getBoundingClientRect(); 
        return { 
            x: (screenX - canvasRect.left - tab.panX) / tab.scale, 
            y: (screenY - canvasRect.top - tab.panY) / tab.scale 
        }; 
    }

    function clearCanvas() {
        const tab = getActiveTab();
        if (!tab) return;
        
        canvasContent.querySelectorAll('.canvas-node').forEach(n => n.remove());
        svgLayer.innerHTML = '';
        tab.connections = [];
        tab.panX = 0;
        tab.panY = 0;
        tab.scale = 1;
        tab.nodeIdCounter = 0;
        updateCanvasTransform();
        gatherAndRegisterHotkeys();
    }


    // --- MODAL LOGIC ---
    function showError(message) {
        if (!appSettings.general.showErrors) return;
        errorMessage.textContent = message;
        errorModal.classList.remove('modal-hidden');
    }
    function hideError() { errorModal.classList.add('modal-hidden'); }
    errorModalClose.addEventListener('click', hideError);

    function showConfirm(message, callback) {
        confirmMessage.textContent = message;
        confirmCallback = callback;
        confirmModal.classList.remove('modal-hidden');
        confirmNoBtn.style.display = 'inline-block';
        confirmYesBtn.textContent = 'Yes';
    }
    function hideConfirm() {
        confirmModal.classList.add('modal-hidden');
        confirmCallback = null;
    }
    confirmYesBtn.addEventListener('click', () => { if (confirmCallback) { confirmCallback(); } hideConfirm(); });
    confirmNoBtn.addEventListener('click', hideConfirm);


    // --- NODE & ELEMENT CREATION ---
    function createNodeElement(nodeInfo, isTemplate = false) {
        const node = document.createElement('div');
        node.classList.add('node');
        if (isTemplate) node.classList.add('sidebar-node');
        else {
            node.classList.add('canvas-node');
            node.addEventListener('contextmenu', onNodeContextMenu);
        }
        node.setAttribute('draggable', isTemplate);
        node.dataset.nodeType = nodeInfo.type;

        if (nodeInfo.type === 'comment') {
            node.classList.add('comment-node');
            const textArea = document.createElement('textarea');
            textArea.placeholder = 'Type your comment...';
            textArea.addEventListener('mousedown', (e) => e.stopPropagation());
            textArea.addEventListener('change', saveState);
            node.appendChild(textArea);
        } else {
            const header = document.createElement('div');
            header.classList.add('node-header');
            header.textContent = nodeInfo.name;

            if (nodeInfo.tier === 'pro') {
                const proBadge = document.createElement('span');
                proBadge.classList.add('pro-badge');
                proBadge.textContent = 'PRO';
                header.appendChild(proBadge);
            }

            node.appendChild(header);

            if (!isTemplate) {
                const pinIcon = document.createElement('div');
                pinIcon.classList.add('pin-icon', 'hidden');
                pinIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`;
                node.appendChild(pinIcon);
            }

            const content = document.createElement('div');
            content.classList.add('node-content');
            node.appendChild(content);

            const pinsLeft = document.createElement('div');
            pinsLeft.classList.add('node-pins', 'left');
            content.appendChild(pinsLeft);

            const mainContent = document.createElement('div');
            mainContent.classList.add('node-main-content');
            content.appendChild(mainContent);

            const pinsRight = document.createElement('div');
            pinsRight.classList.add('node-pins', 'right');
            content.appendChild(pinsRight);

            // Create Pins
            (nodeInfo.execInputs || []).forEach(p => pinsLeft.appendChild(createPin(p, 'exec', 'input', nodeInfo)));
            (nodeInfo.execOutputs || []).forEach(p => pinsRight.appendChild(createPin(p, 'exec', 'output', nodeInfo)));
            (nodeInfo.dataInputs || []).forEach(p => {
                if (p.hasPin === false) { // For literal nodes
                    mainContent.appendChild(createPin(p, 'data', 'input', nodeInfo));
                } else {
                    pinsLeft.appendChild(createPin(p, 'data', 'input', nodeInfo));
                }
            });
            (nodeInfo.dataOutputs || []).forEach(p => pinsRight.appendChild(createPin(p, 'data', 'output', nodeInfo)));
            
            // Create Parameters
            (nodeInfo.params || []).forEach(p => mainContent.appendChild(createParamInput(p, nodeInfo, mainContent)));
            
            // After creation, trigger visibility check
            if (!isTemplate) {
                content.querySelectorAll('.conditional').forEach(el => updateConditionalVisibility(el, content));
            }
        }

        // Add resize handle for canvas nodes
        if (!isTemplate) {
            const resizeHandle = document.createElement('div');
            resizeHandle.classList.add('resize-handle');
            node.appendChild(resizeHandle);
        }

        return node;
    }
    
    function createPin(pinInfo, flow, direction, nodeInfo) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('pin-wrapper');
        wrapper.dataset.flow = flow;
        wrapper.dataset.direction = direction;
        wrapper.dataset.name = pinInfo.name;
        if(pinInfo.condition) {
            wrapper.classList.add('conditional');
            wrapper.dataset.conditionField = pinInfo.condition;
            wrapper.dataset.conditionValue = pinInfo.conditionValue;
        }

        if (flow === 'data') {
            wrapper.dataset.dataType = pinInfo.type;
        }

        const label = document.createElement('span');
        label.classList.add('pin-label');
        if(pinInfo.name && pinInfo.name !== 'value') label.textContent = pinInfo.name;

        if (pinInfo.hasPin !== false) {
            const pin = document.createElement('div');
            pin.classList.add('node-pin', `pin-${flow}`, `pin-${direction}`);
            if(pinInfo.class) pin.classList.add(`pin-${pinInfo.class}`);
            if (flow === 'data') pin.classList.add(`pin-data-${pinInfo.type}`);
            wrapper.appendChild(pin);
        } else {
            wrapper.classList.add('no-pin');
        }


        // Add default input fields for data inputs
        let inputField = null;
        if (flow === 'data' && direction === 'input') {
            inputField = createParamInput(pinInfo, nodeInfo, null);
            inputField.classList.add('pin-input-field');
        }

        if (direction === 'input') {
            wrapper.appendChild(label);
            if(inputField) wrapper.appendChild(inputField);
        } else {
            wrapper.appendChild(label);
        }

        return wrapper;
    }

    function createParamInput(paramInfo, nodeInfo, contentArea) {
        const wrapper = document.createElement('div');
        if (contentArea) {
            wrapper.classList.add('node-param');
            wrapper.dataset.paramName = paramInfo.name; // Add identifier for controller
        }

        if(paramInfo.condition) {
            wrapper.classList.add('conditional');
            wrapper.dataset.conditionField = paramInfo.condition;
            wrapper.dataset.conditionValue = paramInfo.conditionValue;
        }

        let inputElement;
        const inputType = paramInfo.type;
        const p_defaultValue = paramInfo.defaultValue;

        // Add specific class for styling based on type
        if (contentArea) {
            wrapper.classList.add(`param-type-${inputType}`);
        }


        switch (inputType) {
            case 'number':
                inputElement = document.createElement('input');
                inputElement.type = 'number';
                inputElement.value = p_defaultValue || 0;

                const isInteger = Number.isInteger(p_defaultValue) || paramInfo.step === 1 || (paramInfo.min && Number.isInteger(paramInfo.min));
                inputElement.step = isInteger ? 1 : 0.01;

                inputElement.addEventListener('change', (e) => {
                    let value = isInteger ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                    const min = paramInfo.min !== undefined ? paramInfo.min : -Infinity;
                    const max = paramInfo.max !== undefined ? paramInfo.max : Infinity;

                    if (isNaN(value)) {
                        value = p_defaultValue !== undefined ? p_defaultValue : 0;
                    }
                    
                    value = Math.max(min, Math.min(value, max));
                    e.target.value = isInteger ? value : value.toFixed(2);

                    const parentNode = e.target.closest('.canvas-node');
                    if (parentNode && parentNode.dataset.nodeType === 'number_literal') {
                        validateAndBreakConnection(parentNode);
                    }
                    saveState();
                });
                break;
            case 'string':
                inputElement = document.createElement('input');
                inputElement.type = 'text';
                inputElement.value = p_defaultValue || '';
                inputElement.addEventListener('change', saveState);
                if (nodeInfo.type === 'define_function' && paramInfo.name === 'Function Name') {
                    inputElement.addEventListener('change', updateFunctionCallNodes);
                }
                if (nodeInfo.type === 'set_variable' && paramInfo.name === 'Name') {
                    inputElement.addEventListener('change', updateVariableGetNodes);
                }
                break;
            case 'key_recorder':
                inputElement = document.createElement('div');
                inputElement.classList.add('key-recorder-input');
                inputElement.textContent = p_defaultValue;
                inputElement.dataset.defaultValue = p_defaultValue;
                inputElement.addEventListener('click', startKeyRecording);
                break;
            case 'image_selector':
                inputElement = document.createElement('div');
                inputElement.classList.add('image-preview');
                inputElement.textContent = 'Select Image';
                inputElement.addEventListener('click', async (e) => {
                    const previewEl = e.currentTarget;
                    const nodeEl = previewEl.closest('.canvas-node');
                    const filePath = await window.pywebview.api.open_image_dialog();
                    if (filePath) {
                        const dataUrl = await window.pywebview.api.read_image_as_base64(filePath);
                        if (dataUrl) {
                            previewEl.classList.remove('error');
                            const img = document.createElement('img');
                            img.src = dataUrl;
                            previewEl.innerHTML = '';
                            previewEl.appendChild(img);
                            if(nodeEl) nodeEl.dataset.imagePath = filePath;
                            saveState();
                        } else {
                            previewEl.textContent = 'Invalid Image';
                            previewEl.classList.add('error');
                        }
                    }
                });
                break;
            case 'select':
                inputElement = document.createElement('select');
                paramInfo.options.forEach(optionText => {
                    const option = document.createElement('option');
                    option.value = optionText.toLowerCase().replace(/ /g, '_');
                    option.textContent = optionText;
                    inputElement.appendChild(option);
                });
                inputElement.value = p_defaultValue;
                if (contentArea || paramInfo.hasPin === false) { 
                    inputElement.addEventListener('change', () => {
                        const nodeContent = inputElement.closest('.node-content');
                        if (paramInfo.name === 'Type' && nodeInfo.type === 'compare') {
                            handleCompareTypeChange(inputElement);
                        }
                        if (nodeContent) {
                            nodeContent.querySelectorAll('.conditional').forEach(el => updateConditionalVisibility(el, nodeContent));
                        }
                        saveState();
                    });
                }
                break;
            case 'checkbox':
                inputElement = document.createElement('input');
                inputElement.type = 'checkbox';
                inputElement.checked = p_defaultValue;
                inputElement.addEventListener('change', saveState);
                break;
        }
        
        if (inputElement) {
             inputElement.addEventListener('mousedown', e => e.stopPropagation());
             wrapper.appendChild(inputElement);
        }
        
        if (contentArea && paramInfo.name) {
             const label = document.createElement('label');
             label.textContent = paramInfo.name;
             if (inputType === 'checkbox') {
                 wrapper.appendChild(label);
             } else {
                 wrapper.prepend(label);
             }
        }
        
        return wrapper;
    }

    function handleCompareTypeChange(typeSelectElement) {
        const nodeElement = typeSelectElement.closest('.canvas-node');
        if (!nodeElement) return;

        const newDataType = typeSelectElement.value === 'string' ? 'string' : 'number'; // Default to number
        const nodeInfo = availableNodes.find(n => n.type === 'compare'); // Get the base node info

        // Update A and B pins
        const pinWrappers = [
            nodeElement.querySelector('.pin-wrapper[data-name="A"]'),
            nodeElement.querySelector('.pin-wrapper[data-name="B"]')
        ];

        pinWrappers.forEach(pinWrapper => {
            if (!pinWrapper) return;
            const pin = pinWrapper.querySelector('.node-pin');

            // Disconnect wires if any
            removeConnections(pin);

            // Update pin visuals and data type for 'any' to specific
            pin.classList.remove('pin-data-any');
            pin.classList.add(`pin-data-${newDataType}`);
            pinWrapper.dataset.dataType = newDataType;
        });

        // Update Operator dropdown
        const operatorParam = Array.from(nodeElement.querySelectorAll('.node-param')).find(p => p.querySelector('label')?.textContent === 'Operator');
        if (operatorParam) {
            const operatorSelect = operatorParam.querySelector('select');
            operatorSelect.innerHTML = '';
            const operators = (newDataType === 'number')
                ? ['==', '!=', '>', '<', '>=', '<=']
                : ['==', '!=', 'Contains', 'Starts With', 'Ends With'];

            operators.forEach(op => {
                const option = document.createElement('option');
                option.value = op.toLowerCase().replace(/ /g, '_');
                option.textContent = op;
                operatorSelect.appendChild(option);
            });
        }
    }


    function updateConditionalVisibility(element, nodeContent) {
        const fieldName = element.dataset.conditionField;
        if (!fieldName) {
             element.style.display = 'flex'; // Default to flex if not conditional
             return; 
        }
        
        const root = nodeContent || element.closest('.node-content');
        if (!root) return;
        
        const controllerWrapper = root.querySelector(`.pin-wrapper[data-name="${fieldName}"], .node-param[data-param-name="${fieldName}"]`);

        if(controllerWrapper){
            const controllerSelect = controllerWrapper.querySelector('select');
            if (controllerSelect) {
                const shouldBeVisible = controllerSelect.value === element.dataset.conditionValue;
                element.style.display = shouldBeVisible ? 'flex' : 'none';
            }
        } else {
            element.style.display = 'none';
        }
    }

    function populateSidebar() { 
        nodeList.innerHTML = ''; // Clear existing nodes
        availableNodes.forEach(nodeInfo => { 
            const nodeElement = createNodeElement(nodeInfo, true); 
            nodeList.appendChild(nodeElement); 
            nodeElement.addEventListener('dragstart', (e) => { 
                const dragData = { type: nodeInfo.type, offsetX: e.offsetX, offsetY: e.offsetY }; 
                e.dataTransfer.setData('application/json', JSON.stringify(dragData)); 
                e.dataTransfer.effectAllowed = 'copy'; 
            }); 
        }); 
    }

    // --- WIRING & CONNECTION LOGIC ---
    function startWire(e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        const pinElement = e.target;
        if (!pinElement.classList.contains('node-pin')) return;

        isDrawingWire = true;
        startPin = pinElement;
        tempWire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempWire.classList.add('wire', 'wire-temporary');

        const startWrapper = startPin.closest('.pin-wrapper');
        const flowType = startWrapper.dataset.flow;
        tempWire.classList.add(`wire-${flowType}`);

        if (flowType === 'data') {
            const dataType = startWrapper.dataset.dataType;
            tempWire.classList.add(`wire-data-${dataType}`);
        }

        svgLayer.appendChild(tempWire);
        const startPos = getPinPosition(startPin);
        const mousePos = screenToCanvas(e.clientX, e.clientY);
        updateWirePath(tempWire, startPos.x, startPos.y, mousePos.x, mousePos.y);

        document.addEventListener('mousemove', drawWire);
        document.addEventListener('mouseup', endWire);
    }
    function drawWire(e) { if (!isDrawingWire) return; const startPos = getPinPosition(startPin); const mousePos = screenToCanvas(e.clientX, e.clientY); updateWirePath(tempWire, startPos.x, startPos.y, mousePos.x, mousePos.y); }
    function endWire(e) { if (!isDrawingWire) return; const endPin = e.target; if (endPin.classList.contains('node-pin') && isValidConnection(startPin, endPin)) { createConnection(startPin, endPin); } isDrawingWire = false; startPin = null; if (tempWire) tempWire.remove(); tempWire = null; document.removeEventListener('mousemove', drawWire); document.removeEventListener('mouseup', endWire); }
    
    function formatDataType(type) {
        if (!type) return 'Unknown';
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function isValidConnection(startPin, endPin) {
        const startWrapper = startPin.closest('.pin-wrapper');
        const endWrapper = endPin.closest('.pin-wrapper');
        if (!startWrapper || !endWrapper || startWrapper.closest('.canvas-node') === endWrapper.closest('.canvas-node')) {
            return false;
        }
        const startFlow = startWrapper.dataset.flow;
        const endFlow = endWrapper.dataset.flow;
        const startDir = startWrapper.dataset.direction;
        const endDir = endWrapper.dataset.direction;
        const startDataType = startWrapper.dataset.dataType;
        const endDataType = endWrapper.dataset.dataType;

        if (startDir === endDir || startFlow !== endFlow) {
            return false;
        }

        // Allow 'any' type to connect to any other data type
        if (startDataType === 'any' || endDataType === 'any') {
            return true;
        }

        if (startFlow === 'data' && startDataType !== endDataType) {
            const outputType = startDir === 'output' ? startDataType : endDataType;
            const inputType = startDir === 'input' ? startDataType : endDataType;
            showError(`Connection failed! Cannot connect a '${formatDataType(outputType)}' output to a '${formatDataType(inputType)}' input.`);
            return false;
        }

        if (startDataType === 'number' && endDir === 'input') {
            const startNodeEl = startPin.closest('.canvas-node');
            if (startNodeEl.dataset.nodeType === 'number_literal') {
                if (!validateNumberLiteralConnection(startNodeEl, endWrapper)) {
                    return false;
                }
            }
        }
        return true;
    }

    function validateAndBreakConnection(numberLiteralNode) {
        const tab = getActiveTab();
        if (!tab) return;
        const connection = tab.connections.find(c => c.startNodeId === numberLiteralNode.id);
        if (!connection) return;

        const endNodeEl = document.getElementById(connection.endNodeId);
        if (!endNodeEl) return;
        
        const endWrapper = endNodeEl.querySelector(`.pin-wrapper[data-name="${connection.endPinName}"][data-direction="input"]`);
        if (!endWrapper) return;

        if (!validateNumberLiteralConnection(numberLiteralNode, endWrapper, true)) {
            const startPinElement = numberLiteralNode.querySelector('.pin-wrapper[data-direction="output"] .node-pin');
            if (startPinElement) {
                removeConnections(startPinElement);
            }
        }
    }

    function validateNumberLiteralConnection(startNodeEl, endWrapper, showBreakMessage = false) {
        const endNodeEl = endWrapper.closest('.canvas-node');
        const nodeInfo = availableNodes.find(n => n.type === endNodeEl.dataset.nodeType);
        const endPinName = endWrapper.dataset.name;
        const endPinInfo = nodeInfo.dataInputs.find(p => p.name === endPinName);

        if (endPinInfo && (endPinInfo.min !== undefined || endPinInfo.max !== undefined)) {
            const min = endPinInfo.min !== undefined ? endPinInfo.min : -Infinity;
            const max = endPinInfo.max !== undefined ? endPinInfo.max : Infinity;
            
            const valueInput = startNodeEl.querySelector('.pin-input-field input[type="number"]');
            const value = parseFloat(valueInput.value);

            if (value < min || value > max) {
                const message = showBreakMessage 
                    ? `Connection broken! Input for "${endPinName}" must be between ${min} and ${max}.`
                    : `Connection failed! The input for "${endPinName}" must be between ${min} and ${max}.`;
                showError(message);
                return false;
            }
        }
        return true;
    }

    function createConnection(startPin, endPin) { 
        const tab = getActiveTab();
        if (!tab) return;
        const startWrapper = startPin.closest('.pin-wrapper'); 
        const endWrapper = endPin.closest('.pin-wrapper'); 
        if (endWrapper.dataset.flow === 'data' && endWrapper.dataset.direction === 'input') { removeConnections(endPin); } 
        const startNode = startPin.closest('.canvas-node'); 
        const endNode = endPin.closest('.canvas-node'); 
        const conn = { 
            id: `conn-${Date.now()}`, 
            startNodeId: startNode.id, 
            startPinName: startWrapper.dataset.name, 
            endNodeId: endNode.id, 
            endPinName: endWrapper.dataset.name, 
            flow: startWrapper.dataset.flow, 
            wire: document.createElementNS('http://www.w3.org/2000/svg', 'path') 
        }; 
        conn.wire.classList.add('wire', `wire-${conn.flow}`); 
        if(conn.flow === 'data') { 
            const dataType = startWrapper.dataset.dataType; 
            conn.wire.classList.add(`wire-data-${dataType}`); 
        } 
        svgLayer.appendChild(conn.wire); 
        tab.connections.push(conn); 
        endWrapper.classList.add('connected'); 
        updateAllWires(); 
        saveState(); 
    }
    
    function removeConnections(pinElement) {
        const tab = getActiveTab();
        if (!tab) return;
        const pinWrapper = pinElement.closest('.pin-wrapper');
        const nodeId = pinElement.closest('.canvas-node').id;
        const pinDirection = pinWrapper.dataset.direction;
        const pinName = pinWrapper.dataset.name;
        
        tab.connections = tab.connections.filter(conn => {
            const isStart = (pinDirection === 'output' && conn.startNodeId === nodeId && conn.startPinName === pinName);
            const isEnd = (pinDirection === 'input' && conn.endNodeId === nodeId && conn.endPinName === pinName);
            if (isStart || isEnd) {
                if (conn.wire) conn.wire.remove();
                if(isEnd) {
                    const endNode = document.getElementById(conn.endNodeId);
                    if(endNode) {
                        const wrapper = endNode.querySelector(`.pin-wrapper[data-name="${conn.endPinName}"][data-direction="input"]`);
                        if(wrapper) wrapper.classList.remove('connected');
                    }
                }
                return false;
            }
            return true;
        });
        updateAllWires();
        saveState();
    }
    
    function updateWirePath(wire, startX, startY, endX, endY) {
        let path;
        if (appSettings.canvas.wireStyle === 'straight') {
            path = `M ${startX} ${startY} L ${endX} ${endY}`;
        } else { // 'curved'
            const dx = Math.abs(startX - endX) * 0.6;
            path = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
        }
        wire.setAttribute('d', path);
    }
    
    function updateAllWires() { 
        const tab = getActiveTab();
        if (!tab) return;
        tab.connections.forEach(conn => { 
            const startNode = document.getElementById(conn.startNodeId); 
            const endNode = document.getElementById(conn.endNodeId); 
            if (startNode && endNode) { 
                const startPin = startNode.querySelector(`.pin-wrapper[data-name="${conn.startPinName}"][data-direction="output"] .node-pin`); 
                const endPin = endNode.querySelector(`.pin-wrapper[data-name="${conn.endPinName}"][data-direction="input"] .node-pin`); 
                if (startPin && endPin) { 
                    const startPos = getPinPosition(startPin); 
                    const endPos = getPinPosition(endPin); 
                    updateWirePath(conn.wire, startPos.x, startPos.y, endPos.x, endPos.y); 
                } 
            } 
        }); 
        updateMinimap(); 
    }
    
    function getPinPosition(pinElement) { 
        const tab = getActiveTab();
        if (!tab) return {x:0, y:0};
        const pinRect = pinElement.getBoundingClientRect(); 
        const canvasRect = canvas.getBoundingClientRect(); 
        return { 
            x: (pinRect.left + pinRect.width / 2 - canvasRect.left - tab.panX) / tab.scale, 
            y: (pinRect.top + pinRect.height / 2 - canvasRect.top - tab.panY) / tab.scale 
        }; 
    }

    // --- KEY RECORDER LOGIC & HOTKEY REGISTRATION ---
    function startKeyRecording(e) {
        e.stopPropagation();
        if (isRecordingKey) stopKeyRecording(true);
        isRecordingKey = true;
        currentRecordingElement = e.currentTarget;
        heldKeys.clear();
        currentRecordingElement.classList.add('recording');
        currentRecordingElement.textContent = 'Recording...';
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        setTimeout(() => document.addEventListener('click', stopRecordingOnClickOutside, { once: true }), 0);
    }

    function stopKeyRecording(interrupted = false) {
        if (!isRecordingKey) return;
        isRecordingKey = false;
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        
        const isEmergencyStop = currentRecordingElement.id === 'emergency-stop-recorder';
        const isUndo = currentRecordingElement.id === 'undo-recorder';
        const isRedo = currentRecordingElement.id === 'redo-recorder';
        const formatted = (heldKeys.size > 0 && !interrupted) ? formatKeys(heldKeys) : null;

        if (formatted) {
            currentRecordingElement.textContent = formatted.display;
            currentRecordingElement.dataset.pynputValue = formatted.pynput;
            if (isEmergencyStop) appSettings.hotkeys.emergencyStop = formatted.pynput;
            if (isUndo) appSettings.hotkeys.undo = formatted.pynput;
            if (isRedo) appSettings.hotkeys.redo = formatted.pynput;
        } else {
            currentRecordingElement.textContent = currentRecordingElement.dataset.defaultValue;
            currentRecordingElement.dataset.pynputValue = '';
            if (isEmergencyStop) appSettings.hotkeys.emergencyStop = 'Not Set';
            if (isUndo) appSettings.hotkeys.undo = defaultSettings.hotkeys.undo;
            if (isRedo) appSettings.hotkeys.redo = defaultSettings.hotkeys.redo;
        }
        
        currentRecordingElement.classList.remove('recording');
        currentRecordingElement = null;
        heldKeys.clear();
        clearTimeout(recordingTimeout);
        gatherAndRegisterHotkeys();
    }

    function handleKeyDown(e) { e.preventDefault(); e.stopPropagation(); const key = mapKey(e); heldKeys.add(key); const formatted = formatKeys(heldKeys); if(formatted) currentRecordingElement.textContent = formatted.display; clearTimeout(recordingTimeout); recordingTimeout = setTimeout(() => stopKeyRecording(false), 800); }
    function handleKeyUp(e) { e.preventDefault(); e.stopPropagation(); }
    function stopRecordingOnClickOutside(e) { if (isRecordingKey && e.target !== currentRecordingElement) { stopKeyRecording(true); } }
    
    function mapKey(event) {
        let key = event.key;
        if (key === 'Control') return 'ctrl';
        if (key === 'Shift') return 'shift';
        if (key === 'Alt') return 'alt';
        if (key === ' ') return 'space';
        if (key === 'Escape') return 'esc';
        if (key === 'PageUp') return 'page_up';
        if (key === 'PageDown') return 'page_down';
        if (key.startsWith('Arrow')) return key.slice(5).toLowerCase();
        // For F1-F12, Delete, Insert, Home, End, Tab, Enter, they are already lowercase or single word
        return key.toLowerCase();
    }

    function formatKeys(keys) {
        if (keys.size === 0) return null;
        
        const modifiers = new Set(['ctrl', 'shift', 'alt']);
        const specialKeys = new Set([
            'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
            'enter', 'space', 'tab', 'esc', 'delete', 'insert', 'home', 'end', 'page_up', 'page_down',
            'up', 'down', 'left', 'right'
        ]);
    
        const order = ['ctrl', 'shift', 'alt'];
        
        const sorted = Array.from(keys).sort((a, b) => {
            const aIsMod = modifiers.has(a);
            const bIsMod = modifiers.has(b);
            if (aIsMod && !bIsMod) return -1;
            if (!aIsMod && bIsMod) return 1;
            if (aIsMod && bIsMod) return order.indexOf(a) - order.indexOf(b);
            return a.localeCompare(b);
        });
    
        const displayString = sorted.map(key => {
            if (key === ' ') return 'Space';
            if (key.startsWith('page')) return key === 'page_up' ? 'Page Up' : 'Page Down';
            return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        }).join(' + ');
    
        const pynputString = sorted.map(key => {
            // Wrap modifiers and special keys in angle brackets
            if (modifiers.has(key) || specialKeys.has(key)) {
                return `<${key}>`;
            }
            // For single character keys, just return the key
            return key;
        }).join('+');
    
        return { display: displayString, pynput: pynputString };
    }

    // --- CANVAS INTERACTIONS ---
    
    function onNodeContextMenu(e) {
        if (e.target.classList.contains('node-pin')) return;
        e.preventDefault();
        e.stopPropagation();
        activeNodeForMenu = e.currentTarget;
        
        const pinMenuItem = document.getElementById('menu-pin');
        if (activeNodeForMenu.classList.contains('pinned')) {
            pinMenuItem.textContent = 'Unpin';
        } else {
            pinMenuItem.textContent = 'Pin';
        }

        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.classList.remove('hidden');
    }

    function hideContextMenu() {
        contextMenu.classList.add('hidden');
        activeNodeForMenu = null;
    }

    document.getElementById('menu-delete').addEventListener('click', () => {
        if (!activeNodeForMenu) return;
        const nodeType = activeNodeForMenu.dataset.nodeType;
        activeNodeForMenu.querySelectorAll('.node-pin').forEach(pin => removeConnections(pin));
        activeNodeForMenu.remove();
        hideContextMenu();
        if (nodeType === 'define_function') {
            updateFunctionCallNodes();
        }
        if (nodeType === 'set_variable') {
            updateVariableGetNodes();
        }
        gatherAndRegisterHotkeys();
        saveState();
    });

    document.getElementById('menu-duplicate').addEventListener('click', () => {
        if (!activeNodeForMenu) return;
        const tab = getActiveTab();
        if (!tab) return;

        const nodeType = activeNodeForMenu.dataset.nodeType;
        const nodeInfo = availableNodes.find(n => n.type === nodeType);

        if (nodeInfo.type === 'start' || nodeInfo.type === 'define_function') {
            showError(`A '${nodeInfo.name}' node cannot be duplicated.`);
            hideContextMenu();
            return;
        }

        if (nodeInfo) {
            const newNode = createNodeElement(nodeInfo, false);
            newNode.id = `node-${tab.nodeIdCounter++}`;
            
            newNode.style.left = `${activeNodeForMenu.offsetLeft + 40}px`;
            newNode.style.top = `${activeNodeForMenu.offsetTop + 40}px`;

            const originalInputs = activeNodeForMenu.querySelectorAll('input, select, .key-recorder-input');
            const newInputs = newNode.querySelectorAll('input, select, .key-recorder-input');

            originalInputs.forEach((originalInput, index) => {
                const newInput = newInputs[index];
                if (newInput) {
                    if (originalInput.type === 'checkbox') {
                        newInput.checked = originalInput.checked;
                    } else if (originalInput.classList.contains('key-recorder-input')) {
                        newInput.textContent = originalInput.textContent;
                        newInput.dataset.pynputValue = originalInput.dataset.pynputValue;
                    } else {
                        newInput.value = originalInput.value;
                    }
                }
            });
            
            const newContent = newNode.querySelector('.node-content');
            if (newContent) {
                 newContent.querySelectorAll('.conditional').forEach(el => updateConditionalVisibility(el, newContent));
            }

            if (nodeType === 'find_image') {
                const originalPreview = activeNodeForMenu.querySelector('.image-preview');
                const newPreview = newNode.querySelector('.image-preview');
                if (originalPreview && newPreview) {
                    newPreview.innerHTML = originalPreview.innerHTML;
                    newNode.dataset.imagePath = activeNodeForMenu.dataset.imagePath;
                }
            }


            canvasContent.appendChild(newNode);
            newNode.querySelectorAll('.node-pin').forEach(pin => {
                pin.addEventListener('mousedown', startWire);
                pin.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeConnections(pin);
                });
            });
            makeDraggable(newNode);
            makeResizable(newNode);
            gatherAndRegisterHotkeys();
            saveState();
        }
        hideContextMenu();
    });

    document.getElementById('menu-pin').addEventListener('click', () => {
        if (!activeNodeForMenu) return;
        activeNodeForMenu.classList.toggle('pinned');
        
        const pinIcon = activeNodeForMenu.querySelector('.pin-icon');
        if (pinIcon) {
            pinIcon.classList.toggle('hidden');
        }

        hideContextMenu();
    });

    document.addEventListener('click', hideContextMenu);


    setInterval(async () => {
        try {
            const pos = await window.pywebview.api.get_mouse_position();
            if (pos) {
                coordsDisplay.textContent = `X: ${pos.x}, Y: ${pos.y}`;
            }
        } catch (e) {
            // console.error("Could not get mouse position:", e);
        }
    }, 100);
    
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        const tab = getActiveTab();
        if (!tab) return;
        
        const dragDataString = e.dataTransfer.getData('application/json'); 
        if (!dragDataString) return; 
        const dragData = JSON.parse(dragDataString); 
        const nodeInfo = availableNodes.find(n => n.type === dragData.type); 
        if (nodeInfo) {
            if (nodeInfo.type === 'start' && document.querySelector('.canvas-node[data-node-type="start"]')) {
                showError("A 'Start' node already exists on the canvas. Only one is allowed.");
                return;
            }

            const newNode = createNodeElement(nodeInfo, false); 
            newNode.id = `node-${tab.nodeIdCounter++}`; 
            const dropPos = screenToCanvas(e.clientX, e.clientY); 
            
            let dropX = dropPos.x - (dragData.offsetX / tab.scale);
            let dropY = dropPos.y - (dragData.offsetY / tab.scale);

            if (appSettings.canvas.snapToGrid) {
                dropX = Math.round(dropX / appSettings.canvas.gridSnapSize) * appSettings.canvas.gridSnapSize;
                dropY = Math.round(dropY / appSettings.canvas.gridSnapSize) * appSettings.canvas.gridSnapSize;
            }

            newNode.style.left = `${dropX}px`;
            newNode.style.top = `${dropY}px`;
            
            canvasContent.appendChild(newNode); 
            newNode.querySelectorAll('.node-pin').forEach(pin => { 
                pin.addEventListener('mousedown', startWire); 
                pin.addEventListener('contextmenu', e => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    removeConnections(pin); 
                }); 
            }); 
            makeDraggable(newNode); 
            makeResizable(newNode); 
            if (nodeInfo.type === 'define_function') {
                updateFunctionCallNodes();
            }
            if (nodeInfo.type === 'set_variable') {
                updateVariableGetNodes();
            }
            gatherAndRegisterHotkeys();
            saveState();
        } 
    });
    
    function makeDraggable(element) { 
        let startX, startY; 
        function onMouseDown(e) { 
            const tab = getActiveTab();
            if (!tab) return;
            const isComment = element.classList.contains('comment-node');
            const isHeader = e.target.classList.contains('node-header');

            if (e.button !== 0 || element.classList.contains('pinned')) return;
            if (!isComment && !isHeader) return;
            if (isComment && e.target.tagName === 'TEXTAREA') return;

            e.preventDefault(); 
            startX = e.clientX; 
            startY = e.clientY; 
            element.style.zIndex = 100; 
            document.addEventListener('mousemove', onMouseMove); 
            document.addEventListener('mouseup', onMouseUp); 
        } 
        function onMouseMove(e) { 
            const tab = getActiveTab();
            if (!tab) return;
            const dx = (e.clientX - startX) / tab.scale; 
            const dy = (e.clientY - startY) / tab.scale; 
            startX = e.clientX; 
            startY = e.clientY; 
            element.style.left = `${element.offsetLeft + dx}px`; 
            element.style.top = `${element.offsetTop + dy}px`; 
            updateAllWires(); 
        } 
        function onMouseUp(e) { 
            const tab = getActiveTab();
            if (!tab) return;
            element.style.zIndex = 100; 
            document.removeEventListener('mousemove', onMouseMove); 
            document.removeEventListener('mouseup', onMouseUp);
            if (appSettings.canvas.snapToGrid) {
                const newLeft = Math.round(element.offsetLeft / appSettings.canvas.gridSnapSize) * appSettings.canvas.gridSnapSize;
                const newTop = Math.round(element.offsetTop / appSettings.canvas.gridSnapSize) * appSettings.canvas.gridSnapSize;
                element.style.left = `${newLeft}px`;
                element.style.top = `${newTop}px`;
                updateAllWires();
            }
            saveState();
        } 
        element.addEventListener('mousedown', onMouseDown); 
    }
    
    function makeResizable(element) {
        const handle = element.querySelector('.resize-handle');
        let startX, startY, startWidth, startHeight, minWidth, minHeight;

        function onMouseDown(e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
            minWidth = parseInt(getComputedStyle(element).minWidth, 10) || 150;
            minHeight = parseInt(getComputedStyle(element).minHeight, 10) || 80;


            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            canvas.classList.add('resizing');
        }

        function onMouseMove(e) {
            const tab = getActiveTab();
            if (!tab) return;
            const newWidth = startWidth + (e.clientX - startX) / tab.scale;
            const newHeight = startHeight + (e.clientY - startY) / tab.scale;
            element.style.width = `${Math.max(newWidth, minWidth)}px`;
            element.style.height = `${Math.max(newHeight, minHeight)}px`;
            updateAllWires();
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            canvas.classList.remove('resizing');
            saveState();
        }

        handle.addEventListener('mousedown', onMouseDown);
    }

    canvas.addEventListener('mousedown', (e) => { 
        const tab = getActiveTab();
        if (!tab) return;
        if (e.button === 1) { 
            e.preventDefault(); 
            isPanning = true; 
            canvas.classList.add('panning'); 
        } 
    });
    canvas.addEventListener('mousemove', (e) => { 
        const tab = getActiveTab();
        if (!tab) return;
        if (isPanning) { 
            tab.panX += e.movementX; 
            tab.panY += e.movementY; 
            updateCanvasTransform(); 
        } 
    });
    window.addEventListener('mouseup', (e) => { 
        if (e.button === 1) { 
            isPanning = false; 
            canvas.classList.remove('panning'); 
        } 
    });
    canvas.addEventListener('wheel', (e) => { 
        e.preventDefault(); 
        const tab = getActiveTab();
        if (!tab) return;
        const zoomIntensity = 0.1; 
        const wheel = e.deltaY < 0 ? 1 : -1; 
        const oldScale = tab.scale; 
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, tab.scale * Math.exp(wheel * zoomIntensity))); 
        const scaleRatio = newScale / oldScale; 
        const canvasRect = canvas.getBoundingClientRect(); 
        const mouseX = e.clientX - canvasRect.left; 
        const mouseY = e.clientY - canvasRect.top; 
        tab.panX = mouseX - (mouseX - tab.panX) * scaleRatio; 
        tab.panY = mouseY - (mouseY - tab.panY) * scaleRatio; 
        tab.scale = newScale; 
        updateCanvasTransform(); 
    });

    // --- MINIMAP LOGIC ---
    function updateMinimap() {
        const tab = getActiveTab();
        if (!tab) return;
        const nodes = document.querySelectorAll('.canvas-node');
        if (nodes.length === 0) {
            minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
            minimapViewport.style.display = 'none';
            return;
        }

        // 1. Calculate bounding box of all nodes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(node => {
            minX = Math.min(minX, node.offsetLeft);
            minY = Math.min(minY, node.offsetTop);
            maxX = Math.max(maxX, node.offsetLeft + node.offsetWidth);
            maxY = Math.max(maxY, node.offsetTop + node.offsetHeight);
        });

        const padding = 200; // Add some padding around the nodes
        minimapBounds = {
            minX: minX - padding,
            minY: minY - padding,
            maxX: maxX + padding,
            maxY: maxY + padding
        };
        const worldWidth = minimapBounds.maxX - minimapBounds.minX;
        const worldHeight = minimapBounds.maxY - minimapBounds.minY;

        // 2. Calculate scale to fit world in minimap
        const scaleX = minimapCanvas.width / worldWidth;
        const scaleY = minimapCanvas.height / worldHeight;
        const minimapScale = Math.min(scaleX, scaleY);

        // 3. Draw nodes on minimap
        minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        minimapCtx.fillStyle = 'rgba(122, 162, 247, 0.6)'; // Node color on minimap
        nodes.forEach(node => {
            const x = (node.offsetLeft - minimapBounds.minX) * minimapScale;
            const y = (node.offsetTop - minimapBounds.minY) * minimapScale;
            const w = node.offsetWidth * minimapScale;
            const h = node.offsetHeight * minimapScale;
            minimapCtx.fillRect(x, y, w, h);
        });

        // 4. Update the viewport rectangle
        const canvasRect = canvas.getBoundingClientRect();
        const viewLeft = (-tab.panX / tab.scale - minimapBounds.minX) * minimapScale;
        const viewTop = (-tab.panY / tab.scale - minimapBounds.minY) * minimapScale;
        const viewWidth = (canvasRect.width / tab.scale) * minimapScale;
        const viewHeight = (canvasRect.height / tab.scale) * minimapScale;
        
        minimapViewport.style.display = 'block';
        minimapViewport.style.left = `${viewLeft}px`;
        minimapViewport.style.top = `${viewTop}px`;
        minimapViewport.style.width = `${viewWidth}px`;
        minimapViewport.style.height = `${viewHeight}px`;
    }

    function onMinimapNavigate(e) {
        const tab = getActiveTab();
        if (!tab) return;
        const minimapRect = minimap.getBoundingClientRect();
        const worldWidth = minimapBounds.maxX - minimapBounds.minX;
        const worldHeight = minimapBounds.maxY - minimapBounds.minY;
        const scaleX = minimapCanvas.width / worldWidth;
        const scaleY = minimapCanvas.height / worldHeight;
        const minimapScale = Math.min(scaleX, scaleY);

        // Center the view on the clicked point
        const clickX = e.clientX - minimapRect.left;
        const clickY = e.clientY - minimapRect.top;

        const targetWorldX = (clickX / minimapScale) + minimapBounds.minX;
        const targetWorldY = (clickY / minimapScale) + minimapBounds.minY;

        const canvasRect = canvas.getBoundingClientRect();
        tab.panX = -targetWorldX * tab.scale + (canvasRect.width / 2);
        tab.panY = -targetWorldY * tab.scale + (canvasRect.height / 2);

        updateCanvasTransform();
    }

    minimap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDraggingMinimap = true;
        onMinimapNavigate(e);
        document.addEventListener('mousemove', onMinimapMouseMove);
        document.addEventListener('mouseup', onMinimapMouseUp);
    });

    function onMinimapMouseMove(e) {
        if (isDraggingMinimap) {
            onMinimapNavigate(e);
        }
    }

    function onMinimapMouseUp() {
        isDraggingMinimap = false;
        document.removeEventListener('mousemove', onMinimapMouseMove);
        document.removeEventListener('mouseup', onMinimapMouseUp);
    }


    // --- SETTINGS & INFO MODAL LOGIC ---
    function openSettings() {
        document.body.classList.toggle('light-theme', appSettings.general.theme === 'light');
        themeSwitcher.textContent = appSettings.general.theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme';
        disableErrorsCheckbox.checked = !appSettings.general.showErrors;
        gridSnapCheckbox.checked = appSettings.canvas.snapToGrid;
        gridSnapSizeInput.value = appSettings.canvas.gridSnapSize;
        wireStyleSwitcher.value = appSettings.canvas.wireStyle;
        emergencyStopRecorder.textContent = appSettings.hotkeys.emergencyStop;
        undoRecorder.textContent = formatKeys(new Set(appSettings.hotkeys.undo.replace(/<|>/g, '').split('+'))).display;
        redoRecorder.textContent = formatKeys(new Set(appSettings.hotkeys.redo.replace(/<|>/g, '').split('+'))).display;
        settingsModal.classList.remove('modal-hidden');
    }
    function closeSettings() { settingsModal.classList.add('modal-hidden'); }
    function openInfo() { infoModal.classList.remove('modal-hidden'); }
    function closeInfo() { infoModal.classList.add('modal-hidden'); }

    settingsBtn.addEventListener('click', openSettings);
    settingsModalClose.addEventListener('click', closeSettings);
    infoBtn.addEventListener('click', openInfo);
    infoModalClose.addEventListener('click', closeInfo);

    themeSwitcher.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        appSettings.general.theme = isLight ? 'light' : 'dark';
        themeSwitcher.textContent = isLight ? 'Switch to Dark Theme' : 'Switch to Light Theme';
    });

    disableErrorsCheckbox.addEventListener('change', (e) => { appSettings.general.showErrors = !e.target.checked; });
    emergencyStopRecorder.addEventListener('click', startKeyRecording);
    undoRecorder.addEventListener('click', startKeyRecording);
    redoRecorder.addEventListener('click', startKeyRecording);
    gridSnapCheckbox.addEventListener('change', (e) => { appSettings.canvas.snapToGrid = e.target.checked; });
    gridSnapSizeInput.addEventListener('change', (e) => {
        let size = parseInt(e.target.value, 10);
        if (isNaN(size)) size = 20;
        size = Math.max(5, Math.min(size, 100));
        e.target.value = size;
        appSettings.canvas.gridSnapSize = size;
    });
    wireStyleSwitcher.addEventListener('change', (e) => { appSettings.canvas.wireStyle = e.target.value; updateAllWires(); });

    resetSettingsBtn.addEventListener('click', () => {
        showConfirm("Are you sure you want to reset all settings to their defaults?", () => {
            appSettings = JSON.parse(JSON.stringify(defaultSettings));
            populateSidebar();
            openSettings();
            updateAllWires();
            gatherAndRegisterHotkeys();
        });
    });

    // --- INFO MODAL TABS & FAQ ---
    const infoTabs = document.querySelectorAll('.info-tab-btn');
    const infoPanels = document.querySelectorAll('.info-content-panel');
    infoTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            infoTabs.forEach(t => t.classList.remove('active'));
            infoPanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`info-content-${tab.dataset.tab}`).classList.add('active');
        });
    });

    const faqItems = document.querySelectorAll('.faq-question');
    faqItems.forEach(item => {
        item.addEventListener('click', () => {
            const answer = item.nextElementSibling;
            item.classList.toggle('active');
            if (answer.style.maxHeight) {
                answer.style.maxHeight = null;
            } else {
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    function populateInfoNodes() {
        const listElement = document.getElementById('info-node-list');
        listElement.innerHTML = '';
        availableNodes.forEach(node => {
            const item = document.createElement('div');
            item.className = 'info-node-item';
            item.innerHTML = `<strong>${node.name}:</strong><p>${node.description || 'No description available.'}</p>`;
            listElement.appendChild(item);
        });
    }

    // --- FILE & VALIDATION BUTTONS ---
    newBtn.addEventListener('click', () => {
        showConfirm("Are you sure you want to clear the current project? All unsaved work will be lost.", () => {
            clearCanvas();
            saveState(); // Save the cleared state
        });
    });

    saveBtn.addEventListener('click', async () => {
        const tab = getActiveTab();
        if (!tab) return;
    
        const savePath = await window.pywebview.api.open_save_dialog();
        if (!savePath) return;
    
        const canvasData = serializeCanvas();
        const result = await window.pywebview.api.save_file(savePath, canvasData);
        
        if (result.success) {
            if (result.filename) {
                const tabName = result.filename.replace(/\.(macro|json)$/i, '');
                renameTab(tab.id, tabName);
            }
        } else {
            showError(`Failed to save file: ${result.error}`);
        }
    });

    importBtn.addEventListener('click', async () => {
        const loadPath = await window.pywebview.api.open_load_dialog();
        if (!loadPath) return;
        const result = await window.pywebview.api.load_file(loadPath);
        if (result.success) {
            try {
                // Create a new tab for the imported file
                const filename = result.filename;
                const tabName = filename ? filename.replace(/\.(macro|json)$/i, '') : 'Untitled';
                
                const newTabState = createNewTabState(tabName);
                addTab(newTabState); // This creates the tab and switches to it
    
                // deserializeCanvas loads into the *active* tab, which is now the new one.
                deserializeCanvas(result.data);
                saveState(); // Save the imported state as the new initial state
    
            } catch (err) {
                console.error("Error deserializing canvas:", err);
                showError("Failed to load macro. The file may be corrupted or in an invalid format.");
            }
        } else {
            showError(`Failed to load file: ${result.error}`);
        }
    });

    validateBtn.addEventListener('click', () => {
        const tab = getActiveTab();
        if (!tab) return;
        const warnings = new Set();
        const allNodes = new Map();
        const executionNodes = new Set();
        const visitedNodes = new Set();
    
        document.querySelectorAll('.canvas-node.warning').forEach(n => n.classList.remove('warning'));
    
        document.querySelectorAll('.canvas-node').forEach(nodeEl => {
            allNodes.set(nodeEl.id, nodeEl);
            const nodeInfo = availableNodes.find(n => n.type === nodeEl.dataset.nodeType);
            if (nodeInfo.execInputs || nodeInfo.execOutputs) {
                executionNodes.add(nodeEl.id);
            }
    
            if (nodeInfo.type !== 'start') {
                (nodeInfo.execInputs || []).forEach(inputPin => {
                    const isConnected = tab.connections.some(c => c.endNodeId === nodeEl.id && c.endPinName === inputPin.name);
                    if (!isConnected) {
                        warnings.add(`Node "${nodeInfo.name}" has an unconnected execution input.`);
                        nodeEl.classList.add('warning');
                    }
                });
            }
        });
    
        const startNodes = Array.from(allNodes.values()).filter(n => n.dataset.nodeType === 'start');
        if (startNodes.length === 0 && executionNodes.size > 0) {
            warnings.add("No 'Start' node found. The macro has no entry point.");
            executionNodes.forEach(nodeId => allNodes.get(nodeId)?.classList.add('warning'));
        } else {
            startNodes.forEach(startNode => {
                const queue = [startNode.id];
                if (!visitedNodes.has(startNode.id)) {
                    visitedNodes.add(startNode.id);
                }
                while (queue.length > 0) {
                    const currentId = queue.shift();
                    const outgoingConns = tab.connections.filter(c => c.startNodeId === currentId && c.flow === 'exec');
                    outgoingConns.forEach(conn => {
                        if (!visitedNodes.has(conn.endNodeId)) {
                            visitedNodes.add(conn.endNodeId);
                            queue.push(conn.endNodeId);
                        }
                    });
                }
            });
    
            executionNodes.forEach(nodeId => {
                const nodeEl = allNodes.get(nodeId);
                const nodeInfo = availableNodes.find(n => n.type === nodeEl.dataset.nodeType);
    
                if (nodeInfo.execInputs && nodeInfo.execInputs.length > 0 && !visitedNodes.has(nodeId)) {
                    warnings.add(`Node "${nodeInfo.name}" is part of an unreachable execution chain.`);
                    nodeEl.classList.add('warning');
                }
            });
        }
    
        if (warnings.size > 0) {
            const warningMessage = "Validation finished with warnings:\n\n- " + Array.from(warnings).join('\n- ');
            showError(warningMessage);
        } else {
            showConfirm("Validation successful! No issues found.", () => {});
            document.getElementById('confirm-message').textContent = "Validation successful! No issues found.";
            document.getElementById('confirm-no').style.display = 'none';
            document.getElementById('confirm-yes').textContent = 'OK';
        }
    });

    // --- MACRO EXECUTION & HOTKEYS ---
    window.highlightNode = (nodeId) => {
        const currentlyExecuting = document.querySelector('.canvas-node.executing');
        if (currentlyExecuting) {
            currentlyExecuting.classList.remove('executing');
        }

        const nodeToHighlight = document.getElementById(nodeId);
        if (nodeToHighlight) {
            nodeToHighlight.classList.add('executing');
        }
    };

    window.clearNodeHighlights = () => {
        document.querySelectorAll('.canvas-node.executing').forEach(node => {
            node.classList.remove('executing');
        });
    };

    function gatherAndRegisterHotkeys() {
        const hotkeys = {};
        // Gather hotkeys from Start nodes on the CURRENT canvas
        document.querySelectorAll('.canvas-node[data-node-type="start"]').forEach(nodeEl => {
            const hotkeyInput = nodeEl.querySelector('.key-recorder-input');
            const pynputHotkey = hotkeyInput.dataset.pynputValue;
            if (pynputHotkey) {
                hotkeys[pynputHotkey] = nodeEl.id;
            }
        });

        // Add the emergency stop hotkey
        const emergencyHotkey = appSettings.hotkeys.emergencyStop;
        if (emergencyHotkey && emergencyHotkey !== 'Not Set') {
            hotkeys[emergencyHotkey] = 'emergency_stop';
        }

        // Add undo/redo hotkeys
        if (appSettings.hotkeys.undo) hotkeys[appSettings.hotkeys.undo] = 'undo';
        if (appSettings.hotkeys.redo) hotkeys[appSettings.hotkeys.redo] = 'redo';
        
        window.pywebview.api.register_hotkeys(hotkeys);
    }

    function serializeMacro(startNodeId) {
        const tab = getActiveTab();
        if (!tab) return null;
        const allNodes = [];
        document.querySelectorAll('.canvas-node').forEach(nodeEl => {
            allNodes.push(serializeNode(nodeEl));
        });
        return {
            start_node_id: startNodeId,
            nodes: allNodes,
            connections: tab.connections.map(c => ({...c, wire: null}))
        };
    }
    
    window.triggerMacroByHotkey = (hotkeyAction) => {
        if (hotkeyAction === 'undo') {
            undo();
            return;
        }
        if (hotkeyAction === 'redo') {
            redo();
            return;
        }

        console.log(`Hotkey triggered in JS: ${hotkeyAction}`);
        const startNodeId = hotkeyAction;
        const startNode = document.getElementById(startNodeId);
        if (startNode) {
            const macroData = serializeMacro(startNodeId);
            if (macroData) window.pywebview.api.run_macro(macroData);
        } else {
            console.error(`Start node with ID ${startNodeId} not found for hotkey.`);
        }
    }


    // --- SERIALIZATION & DESERIALIZATION ---
    function serializeCanvas() {
        const tab = getActiveTab();
        if (!tab) return {};

        const nodes = [];
        document.querySelectorAll('.canvas-node').forEach(nodeEl => {
            nodes.push(serializeNode(nodeEl));
        });
        return {
            nodes: nodes,
            connections: tab.connections.map(c => ({...c, wire: null})),
            panX: tab.panX,
            panY: tab.panY,
            scale: tab.scale,
            nodeIdCounter: tab.nodeIdCounter
        };
    }
    
    function serializeNode(nodeEl) {
        const nodeData = {
            id: nodeEl.id,
            type: nodeEl.dataset.nodeType,
            left: nodeEl.style.left,
            top: nodeEl.style.top,
            width: nodeEl.style.width,
            height: nodeEl.style.height,
            color: nodeEl.dataset.color || 'default',
            values: {}
        };

        if (nodeEl.dataset.nodeType === 'comment') {
            const textArea = nodeEl.querySelector('textarea');
            nodeData.text = textArea.value;
        } else {
            nodeEl.querySelectorAll('input, select, .key-recorder-input').forEach(input => {
                const paramWrapper = input.closest('.node-param, .pin-wrapper');
                if (paramWrapper) {
                    // Skip saving default values for data pins that are connected
                    if (paramWrapper.classList.contains('pin-wrapper') && paramWrapper.classList.contains('connected')) {
                        return;
                    }

                    const paramName = paramWrapper.dataset.name || paramWrapper.dataset.paramName;
                    if (paramName !== undefined && paramName !== null) {
                        if (input.classList.contains('key-recorder-input')) {
                            nodeData.values[paramName] = {
                                display: input.textContent,
                                pynput: input.dataset.pynputValue || ''
                            };
                        } else if (input.type === 'checkbox') {
                            nodeData.values[paramName] = input.checked;
                        } else {
                            nodeData.values[paramName] = input.value;
                        }
                    }
                }
            });
        }
        
        if (nodeEl.dataset.imagePath) {
            nodeData.imagePath = nodeEl.dataset.imagePath;
        }

        return nodeData;
    }

    function deserializeCanvas(data) {
        const tab = getActiveTab();
        if (!tab) return;

        clearCanvas();

        tab.panX = data.panX || 0;
        tab.panY = data.panY || 0;
        tab.scale = data.scale || 1;
        tab.nodeIdCounter = data.nodeIdCounter || 0;
        updateCanvasTransform();

        if (data.nodes) {
            data.nodes.forEach(nodeData => {
                const nodeInfo = availableNodes.find(n => n.type === nodeData.type);
                if (nodeInfo) {
                    const newNode = createNodeElement(nodeInfo, false);
                    newNode.id = nodeData.id;
                    newNode.style.left = nodeData.left;
                    newNode.style.top = nodeData.top;
                    newNode.style.width = nodeData.width;
                    newNode.style.height = nodeData.height;
                    if (nodeData.color && nodeData.color !== 'default') {
                        newNode.style.backgroundColor = `var(--node-color-${nodeData.color})`;
                        newNode.dataset.color = nodeData.color;
                    }


                    if (nodeData.type === 'comment') {
                        const textArea = newNode.querySelector('textarea');
                        if (textArea) {
                            textArea.value = nodeData.text || '';
                        }
                    } else {
                        newNode.querySelectorAll('input, select, .key-recorder-input').forEach(input => {
                            const paramWrapper = input.closest('.pin-wrapper, .node-param');
                             if (paramWrapper) {
                                const paramName = paramWrapper.dataset.name || paramWrapper.dataset.paramName;
                                if ((paramName !== undefined && paramName !== null) && nodeData.values.hasOwnProperty(paramName)) {
                                    const value = nodeData.values[paramName];
                                    
                                    if (input.classList.contains('key-recorder-input')) {
                                        if (typeof value === 'object' && value !== null) {
                                            input.textContent = value.display;
                                            input.dataset.pynputValue = value.pynput;
                                        } else {
                                            input.textContent = value; // Backward compatibility
                                        }
                                    } else if (input.type === 'checkbox') {
                                        input.checked = value;
                                    } else {
                                        input.value = value;
                                    }
                                }
                            }
                        });
                    }

                    if (nodeData.imagePath) {
                        const previewEl = newNode.querySelector('.image-preview');
                        window.pywebview.api.read_image_as_base64(nodeData.imagePath).then(dataUrl => {
                            if (dataUrl && previewEl) {
                                previewEl.classList.remove('error');
                                const img = document.createElement('img');
                                img.src = dataUrl;
                                previewEl.innerHTML = '';
                                previewEl.appendChild(img);
                                newNode.dataset.imagePath = nodeData.imagePath;
                            } else if (previewEl) {
                                previewEl.classList.add('error');
                                previewEl.textContent = 'Image not found';
                            }
                        });
                    }

                    canvasContent.appendChild(newNode);
                    newNode.querySelectorAll('.node-pin').forEach(pin => {
                        pin.addEventListener('mousedown', startWire);
                        pin.addEventListener('contextmenu', e => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeConnections(pin);
                        });
                    });
                    makeDraggable(newNode);
                    makeResizable(newNode);
                }
            });
        }

        if (data.connections) {
            data.connections.forEach(connData => {
                const startNode = document.getElementById(connData.startNodeId);
                const endNode = document.getElementById(connData.endNodeId);
                if (startNode && endNode) {
                    const startPin = startNode.querySelector(`.pin-wrapper[data-name="${connData.startPinName}"][data-direction="output"] .node-pin`);
                    const endPin = endNode.querySelector(`.pin-wrapper[data-name="${connData.endPinName}"][data-direction="input"] .node-pin`);
                    if (startPin && endPin) {
                        createConnection(startPin, endPin);
                    }
                }
            });
        }
        
        document.querySelectorAll('.canvas-node').forEach(nodeEl => {
            const nodeContent = nodeEl.querySelector('.node-content');
            if (nodeContent) {
                nodeContent.querySelectorAll('.conditional').forEach(el => updateConditionalVisibility(el, nodeContent));
            }
        });
        updateFunctionCallNodes();
        updateVariableGetNodes();
        gatherAndRegisterHotkeys();
        updateAllWires();
    }
    
    // --- HISTORY (UNDO/REDO) ---
    function saveState() {
        const tab = getActiveTab();
        if (!tab) return;
        
        if (tab.historyIndex < tab.history.length - 1) {
            tab.history = tab.history.slice(0, tab.historyIndex + 1);
        }

        tab.history.push(serializeCanvas());
        tab.historyIndex = tab.history.length - 1;
        updateUndoRedoButtons();
        updateMinimap();
    }

    function undo() {
        const tab = getActiveTab();
        if (tab && tab.historyIndex > 0) {
            tab.historyIndex--;
            deserializeCanvas(tab.history[tab.historyIndex]);
            updateUndoRedoButtons();
        }
    }

    function redo() {
        const tab = getActiveTab();
        if (tab && tab.historyIndex < tab.history.length - 1) {
            tab.historyIndex++;
            deserializeCanvas(tab.history[tab.historyIndex]);
            updateUndoRedoButtons();
        }
    }

    function updateUndoRedoButtons() {
        const tab = getActiveTab();
        if (tab) {
            undoBtn.disabled = tab.historyIndex <= 0;
            redoBtn.disabled = tab.historyIndex >= tab.history.length - 1;
        } else {
            undoBtn.disabled = true;
            redoBtn.disabled = true;
        }
    }

    // --- FUNCTION & VARIABLE NODE MANAGEMENT ---
    function updateFunctionCallNodes() {
        const definedFunctions = new Set();
        document.querySelectorAll('.canvas-node[data-node-type="define_function"]').forEach(nodeEl => {
            const input = nodeEl.querySelector('input[type="text"]');
            if (input && input.value) {
                definedFunctions.add(input.value);
            }
        });

        document.querySelectorAll('.canvas-node[data-node-type="call_function"]').forEach(nodeEl => {
            const select = nodeEl.querySelector('select');
            const currentValue = select.value;
            select.innerHTML = ''; // Clear existing options

            if (definedFunctions.size === 0) {
                const option = document.createElement('option');
                option.textContent = 'No functions defined';
                option.value = '';
                select.appendChild(option);
            } else {
                definedFunctions.forEach(funcName => {
                    const option = document.createElement('option');
                    option.value = funcName;
                    option.textContent = funcName;
                    select.appendChild(option);
                });
            }

            // Restore previous selection if it still exists
            if (definedFunctions.has(currentValue)) {
                select.value = currentValue;
            }
        });
    }

    function updateVariableGetNodes() {
        const definedVariables = new Set();
        document.querySelectorAll('.canvas-node[data-node-type="set_variable"]').forEach(nodeEl => {
            const input = nodeEl.querySelector('.pin-wrapper[data-name="Name"] input');
            if (input && input.value) {
                definedVariables.add(input.value);
            }
        });

        document.querySelectorAll('.canvas-node[data-node-type="get_variable"]').forEach(nodeEl => {
            const select = nodeEl.querySelector('select');
            const currentValue = select.value;
            select.innerHTML = ''; // Clear existing options

            if (definedVariables.size === 0) {
                const option = document.createElement('option');
                option.textContent = 'No variables set';
                option.value = '';
                select.appendChild(option);
            } else {
                definedVariables.forEach(varName => {
                    const option = document.createElement('option');
                    option.value = varName;
                    option.textContent = varName;
                    select.appendChild(option);
                });
            }

            // Restore previous selection if it still exists
            if (definedVariables.has(currentValue)) {
                select.value = currentValue;
            }
        });
    }


    // --- INITIALIZE ---
    async function initializeApp() {
        populateSidebar();
        populateInfoNodes();
        
        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);

        canvas.addEventListener('contextmenu', (e) => {
            if (e.target === canvas || e.target === canvasContent || e.target === svgLayer) {
                e.preventDefault();
                hideContextMenu();
                lastCanvasContextMenuPos = { x: e.clientX, y: e.clientY };
                canvasContextMenu.style.left = `${e.clientX}px`;
                canvasContextMenu.style.top = `${e.clientY}px`;
                canvasContextMenu.classList.remove('hidden');
            }
        });

        addCommentBtn.addEventListener('click', () => {
            const tab = getActiveTab();
            if (!tab) return;
            const commentInfo = availableNodes.find(n => n.type === 'comment');
            if (commentInfo) {
                const newComment = createNodeElement(commentInfo, false);
                newComment.id = `node-${tab.nodeIdCounter++}`;
                const dropPos = screenToCanvas(lastCanvasContextMenuPos.x, lastCanvasContextMenuPos.y);
                newComment.style.left = `${dropPos.x}px`;
                newComment.style.top = `${dropPos.y}px`;
                newComment.style.width = '200px';
                newComment.style.height = '100px';

                canvasContent.appendChild(newComment);
                makeDraggable(newComment);
                makeResizable(newComment);
                saveState();
            }
            canvasContextMenu.classList.add('hidden');
        });

        colorPalette.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-swatch') && activeNodeForMenu) {
                const color = e.target.dataset.color;
                if (color === 'default') {
                    activeNodeForMenu.style.backgroundColor = '';
                    activeNodeForMenu.dataset.color = 'default';
                } else {
                    activeNodeForMenu.style.backgroundColor = `var(--node-color-${color})`;
                    activeNodeForMenu.dataset.color = color;
                }
                saveState();
                hideContextMenu();
            }
        });

        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
            if (!canvasContextMenu.contains(e.target)) {
                canvasContextMenu.classList.add('hidden');
            }
        });

        const appVersion = await window.pywebview.api.get_app_version();
        const userSettings = await window.pywebview.api.get_user_settings();

        if (userSettings.last_seen_version !== appVersion) {
            welcomeVersionSpan.textContent = appVersion;
            welcomeModal.classList.remove('modal-hidden');
            
            welcomeModalClose.addEventListener('click', () => {
                welcomeModal.classList.add('modal-hidden');
                userSettings.last_seen_version = appVersion;
                window.pywebview.api.save_user_settings(userSettings);
            }, { once: true });
        }
        
        // Check for updates on startup
        const updateInfo = await window.pywebview.api.check_for_updates();
        if (updateInfo && updateInfo.update_available) {
            updateVersionSpan.textContent = updateInfo.latest_version;
            updateDownloadBtn.onclick = () => {
                window.pywebview.api.open_url(updateInfo.download_url);
            };
            updateModal.classList.remove('modal-hidden');
        }

        updateDismissBtn.addEventListener('click', () => {
            updateModal.classList.add('modal-hidden');
        });
        
        // Start with one default tab
        addTab();
    }

    window.addEventListener('pywebviewready', initializeApp);
});
