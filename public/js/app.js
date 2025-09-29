// Configuración
const CONFIG = {
    serverUrl: 'http://192.168.2.102:8993',
    websocketUrl: 'ws://192.168.2.102:8993',
    // serverUrl: 'http://161.132.211.235:8993',
    // websocketUrl: 'ws://161.132.211.235:8993',
    reconnectAttempts: 5,
    reconnectDelay: 3000,
    notificationSound: true,
    systemNotifications: true,
    autoSort: true
};

// Estado de la aplicación
const AppState = {
    socket: null,
    selectedUser: null,
    isConnected: false,
    users: [],
    opportunities: [],
    notificationsCount: 0,
    reconnectAttempts: 0
};

// Elementos del DOM
const elements = {
    statusIndicator: document.getElementById('statusIndicator'),
    connectionStatus: document.getElementById('connectionStatus'),
    loadUsersBtn: document.getElementById('loadUsersBtn'),
    loadUsersSpinner: document.getElementById('loadUsersSpinner'),
    loadUsersText: document.getElementById('loadUsersText'),
    userSelection: document.getElementById('userSelection'),
    usersList: document.getElementById('usersList'),
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    opportunitiesContainer: document.getElementById('opportunitiesContainer'),
    opportunitiesCount: document.getElementById('opportunitiesCount'),
    activityLog: document.getElementById('activityLog'),
    notificationToast: document.getElementById('notificationToast'),
    toastBody: document.getElementById('toastBody'),
    statsContainer: document.getElementById('statsContainer'),
    totalOpportunities: document.getElementById('totalOpportunities'),
    activeOpportunities: document.getElementById('activeOpportunities'),
    totalAmount: document.getElementById('totalAmount'),
    notificationsCount: document.getElementById('notificationsCount')
};

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    console.log('Initializing app...');
    log('info', 'Inicializando aplicación...');
    updateConnectionStatus('disconnected');
    
    // Verificar que los elementos existen
    console.log('Connect button:', elements.connectBtn);
    console.log('Disconnect button:', elements.disconnectBtn);
    
    // Solicitar permisos para notificaciones del sistema
    requestNotificationPermission();
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    elements.loadUsersBtn.addEventListener('click', loadUsers);
    elements.connectBtn.addEventListener('click', connectToWebSocket);
    elements.disconnectBtn.addEventListener('click', disconnectFromWebSocket);
    
    // Controles de notificación
    const soundToggle = document.getElementById('soundToggle');
    const notificationToggle = document.getElementById('notificationToggle');
    
    if (soundToggle) {
        soundToggle.addEventListener('change', function() {
            CONFIG.notificationSound = this.checked;
            log('info', `Sonidos de notificación ${this.checked ? 'activados' : 'desactivados'}`);
        });
    }
    
    if (notificationToggle) {
        notificationToggle.addEventListener('change', function() {
            CONFIG.systemNotifications = this.checked;
            if (this.checked) {
                requestNotificationPermission();
            }
            log('info', `Notificaciones del sistema ${this.checked ? 'activadas' : 'desactivadas'}`);
        });
    }
    
    console.log('Event listeners set up successfully');
}

// Funciones de conexión WebSocket
function connectToWebSocket() {
    console.log('connectToWebSocket called');
    console.log('AppState.selectedUser:', AppState.selectedUser);
    
    if (!AppState.selectedUser) {
        showNotification('error', 'Por favor selecciona un usuario primero');
        return;
    }

    log('info', `Conectando al WebSocket para usuario: ${AppState.selectedUser.userName}`);
    updateConnectionStatus('connecting');

    try {
        console.log('Creating socket connection to:', `${CONFIG.serverUrl}/opportunity`);
        AppState.socket = io(`${CONFIG.serverUrl}/opportunity`, {
            transports: ['websocket', 'polling'],
            timeout: 10000
        });

        console.log('Socket created, setting up listeners');
        setupSocketListeners();
        
    } catch (error) {
        console.error('Error creating socket:', error);
        log('error', `Error al conectar: ${error.message}`);
        updateConnectionStatus('disconnected');
        showNotification('error', 'Error al conectar con el servidor');
    }
}

function setupSocketListeners() {
    const socket = AppState.socket;
    console.log('Setting up socket listeners for socket:', socket);

    socket.on('connect', () => {
        console.log('Socket connected successfully!');
        log('success', 'Conectado al WebSocket');
        updateConnectionStatus('connected');
        AppState.isConnected = true;
        AppState.reconnectAttempts = 0;
        
        // Unirse a la sala del usuario
        console.log('Joining user room for:', AppState.selectedUser.id);
        socket.emit('join-user-room', { assignedUserId: AppState.selectedUser.id });
        
        // Ocultar botón de conectar y mostrar desconectar
        elements.connectBtn.style.display = 'none';
        elements.disconnectBtn.style.display = 'block';
        
        // Ocultar botón de conectar del usuario específico
        if (AppState.selectedUser) {
            const userCard = document.querySelector(`[data-user-id="${AppState.selectedUser.id}"]`);
            if (userCard) {
                const connectBtn = userCard.querySelector('.connect-user-btn');
                if (connectBtn) {
                    connectBtn.classList.add('d-none');
                }
            }
        }
        
        // Cargar oportunidades del usuario
        loadUserOpportunities();
        
        showNotification('success', `Conectado como ${AppState.selectedUser.firstName} ${AppState.selectedUser.lastName}`);
    });

    socket.on('disconnect', () => {
        log('warning', 'Desconectado del WebSocket');
        updateConnectionStatus('disconnected');
        AppState.isConnected = false;
        
        // Mostrar botón de conectar y ocultar desconectar
        elements.connectBtn.style.display = 'block';
        elements.disconnectBtn.style.display = 'none';
        
        // Intentar reconectar
        if (AppState.reconnectAttempts < CONFIG.reconnectAttempts) {
            setTimeout(() => {
                AppState.reconnectAttempts++;
                log('info', `Intentando reconectar (${AppState.reconnectAttempts}/${CONFIG.reconnectAttempts})`);
                connectToWebSocket();
            }, CONFIG.reconnectDelay);
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        log('error', `Error de conexión: ${error.message}`);
        updateConnectionStatus('disconnected');
        showNotification('error', 'Error al conectar con el servidor');
    });

    socket.on('joined-user-room', (data) => {
        log('success', `Unido a la sala del usuario: ${data.assignedUserId}`);
    });

    socket.on('left-user-room', (data) => {
        log('info', `Salido de la sala del usuario: ${data.assignedUserId}`);
    });

    // Eventos de oportunidades
    socket.on('new-opportunity', (data) => {
        log('success', `Nueva oportunidad: ${data.opportunity.name}`);
        handleNewOpportunity(data);
    });

    socket.on('opportunity-updated', (data) => {
        log('warning', `Oportunidad actualizada: ${data.opportunity.name}`);
        handleUpdatedOpportunity(data);
    });

    socket.on('opportunity-deleted', (data) => {
        log('info', `Oportunidad eliminada: ${data.opportunityId}`);
        handleDeletedOpportunity(data);
    });

    socket.on('error', (error) => {
        log('error', `Error del servidor: ${error.message}`);
        showNotification('error', error.message);
    });
}

function disconnectFromWebSocket() {
    if (AppState.socket) {
        AppState.socket.disconnect();
        AppState.socket = null;
    }
    
    AppState.isConnected = false;
    updateConnectionStatus('disconnected');
    
    // Limpiar oportunidades
    clearOpportunities();
    
    // Mostrar botón de conectar y ocultar desconectar
    elements.connectBtn.style.display = 'block';
    elements.disconnectBtn.style.display = 'none';
    
    // Desfijar usuario pero mantenerlo seleccionado
    if (AppState.selectedUser) {
        const userCard = document.querySelector(`[data-user-id="${AppState.selectedUser.id}"]`);
        if (userCard) {
            const connectBtn = userCard.querySelector('.connect-user-btn');
            const pinBtn = userCard.querySelector('.pin-user-btn');
            
            if (connectBtn && pinBtn) {
                connectBtn.classList.add('d-none');
                pinBtn.classList.remove('d-none');
                pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i> Pin';
                pinBtn.classList.remove('btn-success');
                pinBtn.classList.add('btn-outline-primary');
            }
        }
    }
    
    log('info', 'Desconectado manualmente');
    showNotification('info', 'Desconectado del servidor');
}

// Funciones de usuarios
async function loadUsers() {
    try {
        setLoadingState(true);
        log('info', 'Cargando usuarios...');

        const response = await fetch(`${CONFIG.serverUrl}/user/active`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        AppState.users = await response.json();
        displayUsers();
        elements.userSelection.style.display = 'block';
        
        log('success', `Cargados ${AppState.users.length} usuarios`);
        
    } catch (error) {
        log('error', `Error al cargar usuarios: ${error.message}`);
        showNotification('error', 'Error al cargar usuarios');
    } finally {
        setLoadingState(false);
    }
}

function displayUsers() {
    elements.usersList.innerHTML = '';
    
    AppState.users.forEach(user => {
        const userCard = createUserCard(user);
        elements.usersList.appendChild(userCard);
    });
}

function createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card p-3';
    card.dataset.userId = user.id;
    
    const initials = getInitials(user.firstName, user.lastName);
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.userName || 'Sin nombre';
    
    card.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="user-avatar me-3">
                ${initials}
            </div>
            <div class="flex-grow-1">
                <h6 class="mb-1">${fullName}</h6>
                <small class="text-muted">${user.userName || 'Sin usuario'}</small>
                <br>
                <span class="badge bg-${user.isActive ? 'success' : 'secondary'}">
                    ${user.isActive ? 'Activo' : 'Inactivo'}
                </span>
                <span class="badge bg-info ms-1">${user.type || 'regular'}</span>
            </div>
            <div class="user-actions">
                <button class="btn btn-outline-primary btn-sm pin-user-btn" data-user-id="${user.id}">
                    <i class="fas fa-thumbtack"></i> Pin
                </button>
                <button class="btn btn-success btn-sm connect-user-btn d-none" data-user-id="${user.id}">
                    <i class="fas fa-plug"></i> Conectar
                </button>
            </div>
        </div>
    `;
    
    // Event listeners
    const pinBtn = card.querySelector('.pin-user-btn');
    const connectBtn = card.querySelector('.connect-user-btn');
    
    pinBtn.addEventListener('click', function() {
        pinUser(user);
    });
    
    connectBtn.addEventListener('click', function() {
        connectToWebSocket();
    });
    
    return card;
}

function pinUser(user) {
    console.log('pinUser called with:', user);
    
    // Desfijar todos los usuarios primero
    unpinAllUsers();
    
    // Fijar el usuario seleccionado
    AppState.selectedUser = user;
    
    // Actualizar UI
    const userCard = document.querySelector(`[data-user-id="${user.id}"]`);
    if (userCard) {
        userCard.classList.add('pinned');
        
        // Cambiar el botón Pin por el botón Conectar
        const pinBtn = userCard.querySelector('.pin-user-btn');
        const connectBtn = userCard.querySelector('.connect-user-btn');
        
        pinBtn.classList.add('d-none');
        connectBtn.classList.remove('d-none');
        
        // Cambiar el estilo del pin para mostrar que está fijado
        pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i> Fijado';
        pinBtn.classList.remove('btn-outline-primary');
        pinBtn.classList.add('btn-success');
    }
    
    // Habilitar el botón global de conectar
    elements.connectBtn.disabled = false;
    
    log('info', `Usuario fijado: ${user.firstName} ${user.lastName}`);
    showNotification('success', `Usuario fijado: ${user.firstName} ${user.lastName}`);
}

function unpinAllUsers() {
    document.querySelectorAll('.user-card').forEach(card => {
        card.classList.remove('pinned');
        
        const pinBtn = card.querySelector('.pin-user-btn');
        const connectBtn = card.querySelector('.connect-user-btn');
        
        // Restaurar botones a estado original
        pinBtn.classList.remove('d-none');
        connectBtn.classList.add('d-none');
        
        pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i> Pin';
        pinBtn.classList.remove('btn-success');
        pinBtn.classList.add('btn-outline-primary');
    });
}

function selectUser(user) {
    console.log('selectUser called with:', user);
    AppState.selectedUser = user;
    
    console.log('Connect button before enabling:', elements.connectBtn);
    elements.connectBtn.disabled = false;
    console.log('Connect button after enabling:', elements.connectBtn);
    
    // Actualizar UI de selección
    document.querySelectorAll('.user-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = document.querySelector(`[data-user-id="${user.id}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    log('info', `Usuario seleccionado: ${user.firstName} ${user.lastName}`);
    showNotification('success', `Usuario seleccionado: ${user.firstName} ${user.lastName}`);
}

function getInitials(firstName, lastName) {
    const first = firstName ? firstName.charAt(0).toUpperCase() : '';
    const last = lastName ? lastName.charAt(0).toUpperCase() : '';
    return first + last || '?';
}

// Funciones de oportunidades
async function loadUserOpportunities() {
    if (!AppState.selectedUser) return;
    
    try {
        log('info', 'Cargando oportunidades del usuario...');
        
        const response = await fetch(`${CONFIG.serverUrl}/opportunity/assigned/${AppState.selectedUser.id}`);
        
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        AppState.opportunities = await response.json();
        sortOpportunities();
        updateStats();
        
        log('success', `Cargadas ${AppState.opportunities.length} oportunidades`);
        
    } catch (error) {
        log('error', `Error al cargar oportunidades: ${error.message}`);
        showNotification('error', 'Error al cargar oportunidades');
    }
}

function displayOpportunities() {
    if (AppState.opportunities.length === 0) {
        elements.opportunitiesContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h4>No hay oportunidades</h4>
                <p>Este usuario no tiene oportunidades asignadas.</p>
            </div>
        `;
        return;
    }
    
    elements.opportunitiesContainer.innerHTML = '';
    
    AppState.opportunities.forEach(opportunity => {
        const opportunityCard = createOpportunityCard(opportunity);
        elements.opportunitiesContainer.appendChild(opportunityCard);
    });
    
    elements.opportunitiesCount.textContent = AppState.opportunities.length;
}

function createOpportunityCard(opportunity) {
    const card = document.createElement('div');
    card.className = 'card opportunity-card';
    card.dataset.opportunityId = opportunity.id;
    
    const priority = getPriority(opportunity);
    const stage = opportunity.stage || 'Sin etapa';
    const amount = opportunity.amount ? `$${opportunity.amount.toLocaleString()}` : 'Sin monto';
    const createdAt = opportunity.createdAt ? new Date(opportunity.createdAt).toLocaleDateString() : 'Sin fecha';
    
    card.innerHTML = `
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h5 class="card-title mb-1">${opportunity.name || 'Sin nombre'}</h5>
                    <small class="text-muted">ID: ${opportunity.id}</small>
                </div>
                <div class="text-end">
                    <span class="stage-badge badge bg-primary">${stage}</span>
                    <br>
                    <span class="priority-badge priority-${priority.toLowerCase()}">${priority}</span>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <p class="mb-2"><i class="fas fa-dollar-sign text-success"></i> <strong>Monto:</strong> ${amount}</p>
                    <p class="mb-2"><i class="fas fa-percentage text-info"></i> <strong>Probabilidad:</strong> ${opportunity.probability || 0}%</p>
                </div>
                <div class="col-md-6">
                    <p class="mb-2"><i class="fas fa-calendar text-warning"></i> <strong>Creado:</strong> ${createdAt}</p>
                    <p class="mb-2"><i class="fas fa-calendar-check text-danger"></i> <strong>Cierre:</strong> ${opportunity.closeDate || 'Sin fecha'}</p>
                </div>
            </div>
            
            ${opportunity.description ? `
                <div class="mt-3">
                    <p class="card-text"><strong>Descripción:</strong> ${opportunity.description}</p>
                </div>
            ` : ''}
        </div>
    `;
    
    return card;
}

function getPriority(opportunity) {
    const amount = opportunity.amount || 0;
    const stage = opportunity.stage || '';
    
    if (amount > 10000 || stage.includes('Cerrado') || stage.includes('Urgente')) {
        return 'HIGH';
    } else if (amount > 5000 || stage.includes('Prospecto') || stage.includes('Negociación')) {
        return 'MEDIUM';
    } else {
        return 'LOW';
    }
}

// Funciones de eventos WebSocket
function handleNewOpportunity(data) {
    const opportunity = data.opportunity;
    
    // Agregar a la lista si no existe
    const existingIndex = AppState.opportunities.findIndex(opp => opp.id === opportunity.id);
    if (existingIndex === -1) {
        AppState.opportunities.unshift(opportunity);
    } else {
        AppState.opportunities[existingIndex] = opportunity;
    }
    
    // Ordenar oportunidades
    sortOpportunities();
    updateStats();
    
    // Reproducir sonido de notificación
    playNotificationSound('new');
    
    // Mostrar notificación del sistema
    showSystemNotification(
        'Nueva Oportunidad',
        `${opportunity.name} - $${opportunity.amount || 0}`,
        'new'
    );
    
    // Mostrar notificación en la app
    showNotification('success', `Nueva oportunidad: ${opportunity.name}`);
    
    // Efecto visual
    const card = document.querySelector(`[data-opportunity-id="${opportunity.id}"]`);
    if (card) {
        card.classList.add('new');
        setTimeout(() => card.classList.remove('new'), 2000);
    }
}

function handleUpdatedOpportunity(data) {
    const opportunity = data.opportunity;
    
    // Actualizar en la lista
    const existingIndex = AppState.opportunities.findIndex(opp => opp.id === opportunity.id);
    if (existingIndex !== -1) {
        AppState.opportunities[existingIndex] = opportunity;
    } else {
        AppState.opportunities.unshift(opportunity);
    }
    
    // Ordenar oportunidades
    sortOpportunities();
    updateStats();
    
    // Reproducir sonido de notificación
    playNotificationSound('update');
    
    // Mostrar notificación del sistema
    showSystemNotification(
        'Oportunidad Actualizada',
        `${opportunity.name} - Etapa: ${opportunity.stage}`,
        'update'
    );
    
    // Mostrar notificación en la app
    showNotification('warning', `Oportunidad actualizada: ${opportunity.name}`);
    
    // Efecto visual
    const card = document.querySelector(`[data-opportunity-id="${opportunity.id}"]`);
    if (card) {
        card.classList.add('updated');
        setTimeout(() => card.classList.remove('updated'), 2000);
    }
}

function handleDeletedOpportunity(data) {
    const opportunityId = data.opportunityId;
    
    // Remover de la lista
    AppState.opportunities = AppState.opportunities.filter(opp => opp.id !== opportunityId);
    
    displayOpportunities();
    updateStats();
    
    // Reproducir sonido de notificación
    playNotificationSound('delete');
    
    // Mostrar notificación del sistema
    showSystemNotification(
        'Oportunidad Eliminada',
        `ID: ${opportunityId}`,
        'delete'
    );
    
    // Mostrar notificación en la app
    showNotification('info', `Oportunidad eliminada: ${opportunityId}`);
}

function clearOpportunities() {
    AppState.opportunities = [];
    displayOpportunities();
    updateStats();
}

// Funciones de UI
function updateConnectionStatus(status) {
    elements.statusIndicator.className = `status-indicator status-${status}`;
    
    const statusTexts = {
        connected: 'Conectado',
        connecting: 'Conectando...',
        disconnected: 'Desconectado'
    };
    
    elements.connectionStatus.textContent = statusTexts[status] || 'Desconectado';
}

function updateStats() {
    const total = AppState.opportunities.length;
    const active = AppState.opportunities.filter(opp => !opp.deleted).length;
    const totalAmount = AppState.opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    
    elements.totalOpportunities.textContent = total;
    elements.activeOpportunities.textContent = active;
    elements.totalAmount.textContent = `$${totalAmount.toLocaleString()}`;
    elements.notificationsCount.textContent = AppState.notificationsCount;
    
    elements.statsContainer.style.display = total > 0 ? 'flex' : 'none';
}

function setLoadingState(loading) {
    if (loading) {
        elements.loadUsersSpinner.classList.add('show');
        elements.loadUsersText.textContent = 'Cargando...';
        elements.loadUsersBtn.disabled = true;
    } else {
        elements.loadUsersSpinner.classList.remove('show');
        elements.loadUsersText.textContent = 'Cargar Usuarios';
        elements.loadUsersBtn.disabled = false;
    }
}

function showNotification(type, message) {
    const toast = new bootstrap.Toast(elements.notificationToast);
    
    // Actualizar contenido del toast
    const iconClass = {
        success: 'fas fa-check-circle text-success',
        error: 'fas fa-exclamation-circle text-danger',
        warning: 'fas fa-exclamation-triangle text-warning',
        info: 'fas fa-info-circle text-info'
    };
    
    elements.toastBody.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="${iconClass[type] || iconClass.info} me-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    toast.show();
    
    // Incrementar contador de notificaciones
    if (type === 'success' || type === 'warning') {
        AppState.notificationsCount++;
        updateStats();
    }
}

function log(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-message">${message}</span>
    `;
    
    elements.activityLog.appendChild(logEntry);
    elements.activityLog.scrollTop = elements.activityLog.scrollHeight;
    
    // Limitar número de entradas en el log
    const entries = elements.activityLog.children;
    if (entries.length > 100) {
        elements.activityLog.removeChild(entries[0]);
    }
}

// Funciones de utilidad
function formatDate(dateString) {
    if (!dateString) return 'Sin fecha';
    return new Date(dateString).toLocaleDateString('es-ES');
}

function formatCurrency(amount) {
    if (!amount) return 'Sin monto';
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Funciones de sonido y notificaciones
function requestNotificationPermission() {
    if ('Notification' in window && CONFIG.systemNotifications) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    log('success', 'Permisos de notificación concedidos');
                } else {
                    log('warning', 'Permisos de notificación denegados');
                }
            });
        }
    }
}

function playNotificationSound(type = 'new') {
    if (!CONFIG.notificationSound) return;
    
    try {
        // Crear audio context para generar sonidos
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        let frequency, duration, type_wave;
        
        switch(type) {
            case 'new':
                frequency = 800;
                duration = 0.3;
                type_wave = 'sine';
                break;
            case 'update':
                frequency = 600;
                duration = 0.2;
                type_wave = 'square';
                break;
            case 'delete':
                frequency = 400;
                duration = 0.5;
                type_wave = 'sawtooth';
                break;
            default:
                frequency = 500;
                duration = 0.2;
                type_wave = 'sine';
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = type_wave;
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
        
    } catch (error) {
        console.log('Error playing notification sound:', error);
    }
}

function showSystemNotification(title, message, type = 'info') {
    if (!CONFIG.systemNotifications || Notification.permission !== 'granted') {
        return;
    }
    
    const icon = type === 'new' ? '🔔' : type === 'update' ? '🔄' : type === 'delete' ? '🗑️' : 'ℹ️';
    
    const notification = new Notification(`${icon} ${title}`, {
        body: message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'crm-notification',
        requireInteraction: false,
        silent: false
    });
    
    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        notification.close();
    }, 5000);
    
    // Hacer clic en la notificación para enfocar la ventana
    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

function sortOpportunities() {
    if (!CONFIG.autoSort || !AppState.opportunities.length) return;
    
    AppState.opportunities.sort((a, b) => {
        // Priorizar por estado (nuevas primero)
        const stageOrder = {
            'Gestion Inicial': 1,
            'Seguimiento': 2,
            'Negociación': 3,
            'Cierre ganado': 4,
            'Cierre perdido': 5
        };
        
        const stageA = stageOrder[a.stage] || 999;
        const stageB = stageOrder[b.stage] || 999;
        
        if (stageA !== stageB) {
            return stageA - stageB;
        }
        
        // Luego por fecha de creación (más recientes primero)
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        
        return dateB - dateA;
    });
    
    displayOpportunities();
}
