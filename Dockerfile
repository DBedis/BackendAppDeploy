FROM node:18-alpine

WORKDIR /usr/src/app

# Install build tools for native dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

COPY . .

# Environment variables (can override at runtime)
ENV NODE_ENV=production \
    PORT=13776 \
    MONGODB_URI=mongodb://mongo:27017/ArenaVRAdminPanel?directConnection=true

EXPOSE ${PORT}

CMD ["node", "server.js"]