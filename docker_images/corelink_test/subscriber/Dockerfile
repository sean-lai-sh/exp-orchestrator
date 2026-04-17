FROM node:18-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY subscriber/package.json /app/package.json
RUN npm install --omit=dev

COPY lib/corelink.lib.js /app/corelink.lib.js
COPY subscriber/subscriber.js /app/subscriber.js

EXPOSE 3000

CMD ["node", "subscriber.js"]
