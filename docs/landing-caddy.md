# Servir hash.atikodigital.cl (Caddy)

Agregar al Caddyfile del VPS (`/etc/caddy/Caddyfile`):

    hash.atikodigital.cl {
        root * /var/www/hash
        encode gzip
        try_files {path} /index.html
        file_server
    }

Luego: `sudo systemctl reload caddy`.

DNS: crear un registro A `hash` → IP del VPS.

El token de KALY lo sirve el agente en `https://<agente>/api/public/kaly-token`
(ver docs/landing-token-endpoint.md). Si el agente está en otro dominio, su
CORS debe permitir `https://hash.atikodigital.cl`.
