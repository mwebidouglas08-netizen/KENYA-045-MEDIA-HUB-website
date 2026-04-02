FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy all project files
COPY . .

# Ensure public directory exists (index.html and admin.html should already be in public/)
RUN mkdir -p public

EXPOSE 3000

CMD ["node", "server.js"]
