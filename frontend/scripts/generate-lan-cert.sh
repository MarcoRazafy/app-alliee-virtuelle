#!/usr/bin/env bash
set -euo pipefail

LAN_IP="${1:-}"

if [[ ! "${LAN_IP}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Usage : npm run cert:lan -- <adresse-ip-locale>"
  echo "Exemple : npm run cert:lan -- 192.168.1.34"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL est requis pour générer le certificat HTTPS local."
  exit 1
fi

FRONTEND_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${FRONTEND_DIR}/.cert"
CA_KEY="${CERT_DIR}/alliee-local-ca.key"
CA_CERT="${CERT_DIR}/alliee-local-ca.crt"
SERVER_KEY="${CERT_DIR}/lan-key.pem"
SERVER_CSR="${CERT_DIR}/lan-cert.csr"
SERVER_CERT="${CERT_DIR}/lan-cert.pem"
CA_SERIAL="${CERT_DIR}/alliee-local-ca.srl"

mkdir -p "${CERT_DIR}"
umask 077

if [[ ! -f "${CA_KEY}" || ! -f "${CA_CERT}" ]]; then
  openssl genpkey \
    -algorithm RSA \
    -pkeyopt rsa_keygen_bits:2048 \
    -out "${CA_KEY}"

  openssl req \
    -x509 \
    -new \
    -sha256 \
    -days 3650 \
    -key "${CA_KEY}" \
    -out "${CA_CERT}" \
    -subj "/CN=Alliee Local Development CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
fi

openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 \
  -out "${SERVER_KEY}"

openssl req \
  -new \
  -sha256 \
  -key "${SERVER_KEY}" \
  -out "${SERVER_CSR}" \
  -subj "/CN=${LAN_IP}" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LAN_IP}"

openssl x509 \
  -req \
  -sha256 \
  -days 825 \
  -in "${SERVER_CSR}" \
  -CA "${CA_CERT}" \
  -CAkey "${CA_KEY}" \
  -CAserial "${CA_SERIAL}" \
  -CAcreateserial \
  -copy_extensions copy \
  -out "${SERVER_CERT}"

chmod 600 "${CA_KEY}" "${SERVER_KEY}"
chmod 644 "${CA_CERT}" "${SERVER_CERT}"

echo
echo "Certificat HTTPS créé pour ${LAN_IP}."
echo "À partager avec l’équipe (certificat public uniquement) :"
echo "  ${CA_CERT}"
echo
echo "Ne partagez jamais les fichiers .key."
echo "Démarrage : npm run dev:lan"
