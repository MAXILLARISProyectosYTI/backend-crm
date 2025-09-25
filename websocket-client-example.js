/**
 * Ejemplo de cliente WebSocket para conectarse a las notificaciones de oportunidades
 * 
 * Instalación:
 * npm install socket.io-client
 * 
 * Uso:
 * node websocket-client-example.js
 */

const { io } = require('socket.io-client');

// Configuración del servidor
const SERVER_URL = 'http://localhost:8990';
const ASSIGNED_USER_ID = 'USER001'; // Cambiar por el ID del usuario real

// Crear conexión WebSocket
const socket = io(`${SERVER_URL}/opportunity`, {
  transports: ['websocket', 'polling'],
});

console.log('🔌 Conectando al WebSocket...');

// Eventos de conexión
socket.on('connect', () => {
  console.log('✅ Conectado al WebSocket');
  console.log(`📡 ID del socket: ${socket.id}`);
  
  // Unirse a la sala del usuario
  socket.emit('join-user-room', { assignedUserId: ASSIGNED_USER_ID });
});

socket.on('disconnect', () => {
  console.log('❌ Desconectado del WebSocket');
});

socket.on('connect_error', (error) => {
  console.error('❌ Error de conexión:', error.message);
});

// Eventos específicos de oportunidades
socket.on('joined-user-room', (data) => {
  console.log(`🏠 Unido a la sala del usuario: ${data.assignedUserId}`);
});

socket.on('left-user-room', (data) => {
  console.log(`🚪 Salido de la sala del usuario: ${data.assignedUserId}`);
});

// Notificaciones de oportunidades
socket.on('new-opportunity', (data) => {
  console.log('\n🆕 NUEVA OPORTUNIDAD');
  console.log('==================');
  console.log(`👤 Usuario: ${data.assignedUserId}`);
  console.log(`📋 ID: ${data.opportunity.id}`);
  console.log(`📝 Nombre: ${data.opportunity.name || 'Sin nombre'}`);
  console.log(`💰 Monto: ${data.opportunity.amount || 0}`);
  console.log(`📊 Etapa: ${data.opportunity.stage || 'Sin etapa'}`);
  console.log(`⏰ Timestamp: ${data.timestamp}`);
  console.log(`🎯 Prioridad: ${data.metadata?.priority || 'N/A'}`);
  console.log('==================\n');
});

socket.on('opportunity-updated', (data) => {
  console.log('\n📝 OPORTUNIDAD ACTUALIZADA');
  console.log('==========================');
  console.log(`👤 Usuario: ${data.assignedUserId}`);
  console.log(`📋 ID: ${data.opportunity.id}`);
  console.log(`📝 Nombre: ${data.opportunity.name || 'Sin nombre'}`);
  console.log(`💰 Monto: ${data.opportunity.amount || 0}`);
  console.log(`📊 Etapa: ${data.opportunity.stage || 'Sin etapa'}`);
  console.log(`⏰ Timestamp: ${data.timestamp}`);
  console.log(`🎯 Prioridad: ${data.metadata?.priority || 'N/A'}`);
  if (data.metadata?.previousStage) {
    console.log(`🔄 Etapa anterior: ${data.metadata.previousStage}`);
  }
  console.log('==========================\n');
});

socket.on('opportunity-deleted', (data) => {
  console.log('\n🗑️  OPORTUNIDAD ELIMINADA');
  console.log('========================');
  console.log(`👤 Usuario: ${data.assignedUserId}`);
  console.log(`📋 ID: ${data.opportunityId}`);
  console.log(`⏰ Timestamp: ${data.timestamp}`);
  console.log('========================\n');
});

// Manejo de errores
socket.on('error', (error) => {
  console.error('❌ Error del servidor:', error.message);
});

// Función para salir del programa
function exit() {
  console.log('\n👋 Cerrando conexión...');
  socket.disconnect();
  process.exit(0);
}

// Manejar Ctrl+C
process.on('SIGINT', exit);

console.log('🚀 Cliente WebSocket iniciado');
console.log(`👤 Escuchando notificaciones para usuario: ${ASSIGNED_USER_ID}`);
console.log('💡 Presiona Ctrl+C para salir\n');

// Ejemplo de cómo enviar un evento personalizado (opcional)
setTimeout(() => {
  console.log('📊 Ejemplo: Verificando estadísticas...');
  // Aquí podrías hacer una petición HTTP a GET /opportunity/websocket/stats
}, 5000);
