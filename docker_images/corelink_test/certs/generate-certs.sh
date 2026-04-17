#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Generating CA key..."
openssl genrsa -out ca-key.pem 4096

echo "Creating CA certificate..."
openssl req -new -x509 -key ca-key.pem -days 9999 -out ca-crt.pem -config ca.cnf

echo "Creating server CSR + key..."
openssl req -nodes -new -days 9999 -config server.cnf -keyout server-key.pem -out server-csr.pem

echo "Signing server certificate with CA..."
openssl x509 -req -days 9999 -extfile server.cnf -extensions req_ext \
  -in server-csr.pem -CA ca-crt.pem -CAkey ca-key.pem -CAcreateserial -out server-crt.pem

echo "Verifying certificate..."
openssl verify -CAfile ca-crt.pem server-crt.pem

echo "Checking SANs..."
openssl x509 -in server-crt.pem -noout -text | grep -A1 "Subject Alternative Name"

echo "Done. Certificates generated in $(pwd)"
