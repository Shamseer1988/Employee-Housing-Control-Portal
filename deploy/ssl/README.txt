deploy/ssl/  —  Cloudflare Origin Certificate material.

Production nginx terminates TLS with two files placed in this directory:

    origin.pem   — full certificate chain (PEM, leaf + any intermediates)
    origin.key   — private key (PEM, unencrypted)

Both files are mounted into the nginx container at /etc/nginx/ssl
read-only. They are loaded by deploy/nginx.conf at startup; nginx will
fail fast if either is missing.

How to obtain the cert
----------------------
1.  Cloudflare dashboard → your zone → SSL/TLS → Origin Server →
    "Create Certificate".
2.  Private key type: RSA (2048). Hostnames: housing.example.com (and
    *.example.com if you'll add subdomains later). Validity: 15 years
    (the longest Cloudflare offers).
3.  Copy the certificate PEM into deploy/ssl/origin.pem.
    Copy the private key PEM into deploy/ssl/origin.key.

File permissions
----------------
Lock down the key on the host so only the owner can read it:

    chmod 644 deploy/ssl/origin.pem
    chmod 600 deploy/ssl/origin.key

DO NOT COMMIT
-------------
.gitignore already excludes everything in this directory except this
README. If you accidentally `git add deploy/ssl/origin.*`, REVOKE the
certificate in Cloudflare and mint a new one. Once a private key has
touched a public history it's compromised forever.

Full deployment runbook: see ../DEPLOY.md.
