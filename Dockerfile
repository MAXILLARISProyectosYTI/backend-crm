# Etapa 1: Construcción
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias (incluyendo package-lock.json)
COPY package.json package-lock.json* ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src ./src
COPY public ./public

# Construir la aplicación
RUN npm run build

# Etapa 2: Producción
FROM node:20-alpine AS production

WORKDIR /app

# Zona horaria Lima, Perú
RUN apk add --no-cache tzdata
ENV TZ=America/Lima

# Crear usuario no root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copiar archivos de dependencias (incluyendo package-lock.json)
COPY package.json package-lock.json* ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Copiar archivos construidos desde la etapa de construcción
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Crear directorio de uploads y asignar permisos
RUN mkdir -p uploads/contacts uploads/opportunities uploads/users && \
    chown -R nestjs:nodejs /app

# Cambiar al usuario no root
USER nestjs

# Exponer puerto
EXPOSE ${PORT}

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=${PORT}

# Comando para iniciar la aplicación
CMD ["node", "dist/main.js"]

