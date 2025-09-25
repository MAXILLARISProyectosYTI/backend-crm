# CRM Maxillaris - Dashboard Web

## 📋 Descripción

Dashboard web interactivo para el sistema CRM Maxillaris que permite:
- Conectarse al WebSocket para notificaciones en tiempo real
- Seleccionar usuarios del sistema
- Visualizar oportunidades asignadas a cada usuario
- Recibir notificaciones instantáneas de cambios en las oportunidades

## 🚀 Características

### ✨ Funcionalidades Principales
- **Conexión WebSocket**: Notificaciones en tiempo real
- **Selección de Usuarios**: Lista de usuarios activos del sistema
- **Dashboard de Oportunidades**: Visualización completa de oportunidades
- **Estadísticas en Tiempo Real**: Contadores y métricas actualizadas
- **Log de Actividad**: Registro de todas las acciones y eventos
- **Notificaciones Toast**: Alertas visuales para eventos importantes

### 🎨 Diseño
- **Responsive Design**: Compatible con dispositivos móviles y desktop
- **Bootstrap 5**: Framework CSS moderno y elegante
- **Font Awesome**: Iconografía profesional
- **Animaciones CSS**: Efectos visuales suaves y atractivos
- **Tema Personalizado**: Colores y estilos específicos para CRM

### 🔧 Tecnologías
- **HTML5**: Estructura semántica
- **CSS3**: Estilos avanzados con variables CSS
- **JavaScript ES6+**: Lógica de aplicación moderna
- **Socket.IO**: Comunicación WebSocket
- **Bootstrap 5**: Framework de UI
- **Font Awesome 6**: Iconografía

## 📁 Estructura de Archivos

```
public/
├── index.html          # Página principal
├── css/
│   └── custom.css      # Estilos personalizados
├── js/
│   └── app.js          # Lógica de la aplicación
└── README.md           # Este archivo
```

## 🛠️ Instalación y Uso

### 1. Requisitos Previos
- Servidor backend NestJS ejecutándose en puerto 8990
- Base de datos PostgreSQL con datos de usuarios y oportunidades
- Navegador web moderno (Chrome, Firefox, Safari, Edge)

### 2. Configuración
1. Asegúrate de que el servidor backend esté ejecutándose:
   ```bash
   npm run start:dev
   ```

2. Abre el archivo `public/index.html` en tu navegador web

3. O sirve los archivos estáticos usando un servidor HTTP:
   ```bash
   # Usando Python
   cd public
   python -m http.server 8080
   
   # Usando Node.js (http-server)
   npx http-server public -p 8080
   ```

### 3. Uso de la Aplicación

#### Paso 1: Cargar Usuarios
1. Haz clic en el botón **"Cargar Usuarios"**
2. La aplicación obtendrá la lista de usuarios activos del backend
3. Los usuarios aparecerán en tarjetas con su información

#### Paso 2: Seleccionar Usuario
1. Haz clic en el radio button del usuario deseado
2. La tarjeta del usuario se resaltará
3. El botón **"Conectarse"** se habilitará

#### Paso 3: Conectar al WebSocket
1. Haz clic en **"Conectarse"**
2. La aplicación se conectará al WebSocket del servidor
3. El estado de conexión cambiará a "Conectado"
4. Se cargarán automáticamente las oportunidades del usuario

#### Paso 4: Monitorear Oportunidades
- Las oportunidades se mostrarán en tarjetas organizadas
- Las estadísticas se actualizarán automáticamente
- Cualquier cambio en las oportunidades se reflejará en tiempo real

## 📊 Funcionalidades del Dashboard

### Panel de Usuarios
- Lista de usuarios activos del sistema
- Información básica: nombre, usuario, estado, tipo
- Selección mediante radio buttons
- Avatares con iniciales de nombre

### Panel de Oportunidades
- Tarjetas individuales para cada oportunidad
- Información completa: nombre, monto, etapa, probabilidad
- Badges de prioridad y etapa
- Efectos visuales para nuevas/actualizadas oportunidades

### Estadísticas
- **Total de Oportunidades**: Contador general
- **Oportunidades Activas**: Sin eliminar
- **Monto Total**: Suma de todos los montos
- **Notificaciones**: Contador de eventos

### Log de Actividad
- Registro de todas las acciones
- Timestamps precisos
- Colores por tipo de evento:
  - 🔵 Azul: Información
  - 🟢 Verde: Éxito
  - 🟡 Amarillo: Advertencia
  - 🔴 Rojo: Error

### Notificaciones Toast
- Alertas no intrusivas
- Iconos por tipo de evento
- Auto-dismiss después de unos segundos
- Animaciones suaves

## 🔌 Eventos WebSocket

La aplicación escucha los siguientes eventos:

### Conexión
- `connect`: Conexión establecida
- `disconnect`: Desconexión
- `connect_error`: Error de conexión

### Sala de Usuario
- `joined-user-room`: Usuario unido a su sala
- `left-user-room`: Usuario salido de su sala

### Oportunidades
- `new-opportunity`: Nueva oportunidad creada
- `opportunity-updated`: Oportunidad actualizada
- `opportunity-deleted`: Oportunidad eliminada

## 🎨 Personalización

### Colores
Los colores principales se definen en variables CSS:
```css
:root {
    --primary-color: #2c3e50;
    --secondary-color: #3498db;
    --success-color: #27ae60;
    --warning-color: #f39c12;
    --danger-color: #e74c3c;
}
```

### Configuración
Modifica el objeto `CONFIG` en `app.js`:
```javascript
const CONFIG = {
    serverUrl: 'http://localhost:8990',
    websocketUrl: 'ws://localhost:8990',
    reconnectAttempts: 5,
    reconnectDelay: 3000
};
```

## 🐛 Solución de Problemas

### Error de Conexión
- Verifica que el servidor backend esté ejecutándose
- Comprueba la URL del servidor en la configuración
- Revisa la consola del navegador para errores

### No se Cargaron Usuarios
- Verifica que el endpoint `/user/active` esté disponible
- Comprueba que haya usuarios activos en la base de datos
- Revisa la consola del navegador para errores de red

### WebSocket No Conecta
- Verifica que el servidor soporte WebSocket
- Comprueba que el namespace `/opportunity` esté configurado
- Revisa la configuración de CORS en el servidor

### Oportunidades No Aparecen
- Verifica que el usuario tenga oportunidades asignadas
- Comprueba que el endpoint `/opportunity/assigned/:userId` funcione
- Revisa que el campo `assignedUserId` esté correctamente mapeado

## 📱 Compatibilidad

### Navegadores Soportados
- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### Dispositivos
- Desktop: Resolución 1024x768+
- Tablet: Resolución 768x1024+
- Mobile: Resolución 375x667+

## 🔒 Seguridad

- La aplicación es de solo lectura
- No se envían datos sensibles
- Las conexiones WebSocket son seguras
- No se almacenan datos localmente

## 📈 Rendimiento

- Carga inicial optimizada
- Reconexión automática en caso de desconexión
- Límite de 100 entradas en el log de actividad
- Efectos visuales optimizados con CSS3

## 🤝 Contribución

Para contribuir al proyecto:
1. Fork el repositorio
2. Crea una rama para tu feature
3. Implementa los cambios
4. Prueba exhaustivamente
5. Envía un pull request

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo LICENSE para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- Revisa este README
- Consulta la documentación del backend
- Revisa la consola del navegador para errores
- Contacta al equipo de desarrollo
