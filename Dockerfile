# Usar Node 20
FROM node:20

# Carpeta de la app
WORKDIR /app

# Copiar dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar todo el proyecto
COPY . .

# Iniciar el bot
CMD ["node", "index.js"]