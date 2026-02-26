FROM node:18-alpine

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY index.js .

EXPOSE 3000

# NEXT_SERVICE_URL must be provided at runtime
CMD ["node", "index.js"]
