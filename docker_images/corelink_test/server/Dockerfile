FROM docker.io/node:16-bullseye

RUN apt-get update -y && apt-get install -y net-tools && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json /app/
RUN npm install

COPY config/ /app/config/
COPY knex/ /app/knex/

# Overlay Docker-specific certs
COPY --from=certs ca-crt.pem ca-key.pem server-key.pem server-crt.pem /app/config/
# Overlay Docker-specific server config
COPY --from=server-config default.json5 /app/config/default.json5

RUN touch /app/dockerlog
RUN mkdir -p /app/data

# Initialize DB with migrations and seeds
RUN cd /app/config && \
    node ../node_modules/knex/bin/cli.js migrate:latest && \
    node ../node_modules/knex/bin/cli.js seed:run

COPY logger.js /app/
COPY corelink.js /app/

EXPOSE 20010/tcp 20011/udp 20011/tcp 20012/tcp 20013/tcp

CMD ["node", "corelink.js"]
