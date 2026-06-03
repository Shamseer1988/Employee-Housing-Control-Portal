edge-proxy/ssl/ — Cloudflare Origin Certificate material.

This nginx terminates TLS with two files placed in this directory:

    origin.crt   — full certificate chain (PEM-encoded)
    origin.key   — private key (PEM-encoded, unencrypted)

Both files are bind-mounted into the nginx container at
/etc/nginx/ssl read-only. They are loaded by snippets/ssl-common.conf
at startup; nginx will fail fast with "cannot load certificate" if
either is missing.


How to obtain the cert (one-time)
---------------------------------
1.  Cloudflare dashboard → select your zone (parisunitedgroup.com)
    → SSL/TLS → Origin Server → "Create Certificate".
2.  Private key type: RSA (2048).
    Hostnames:
        *.parisunitedgroup.com
        parisunitedgroup.com
    Validity: 15 years (longest Cloudflare offers).
3.  Two text blocks will appear:
       - "Origin Certificate" → paste into ssl/origin.crt
       - "Private key"        → paste into ssl/origin.key
    Each file should look like:
       -----BEGIN CERTIFICATE-----
       MIIE...lots of base64...
       -----END CERTIFICATE-----
    and for the key:
       -----BEGIN PRIVATE KEY-----
       MIIE...lots of base64...
       -----END PRIVATE KEY-----


Live cert rotation (zero downtime)
----------------------------------
1.  Overwrite ssl/origin.crt and ssl/origin.key with the new files.
2.  docker compose exec nginx nginx -s reload


Windows line endings
--------------------
When pasting from the Cloudflare dashboard into Notepad / VS Code,
save as UTF-8 with **LF** line endings:
  - VS Code: bottom-right "CRLF" → click → "LF" → Save.
  - Notepad++: Edit → EOL Conversion → Unix (LF).


DO NOT COMMIT
-------------
.gitignore in this folder excludes *.crt / *.key. If you accidentally
`git add origin.crt` or origin.key, REVOKE the certificate in
Cloudflare and mint a new one. Once a private key has touched a public
history it's compromised forever.
