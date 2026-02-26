FROM node:18-alpine

WORKDIR /app
COPY package.json .
COPY index.js .

# TARGET_URL must be provided at runtime via --env or docker-compose environment
CMD ["node", "index.js"]
