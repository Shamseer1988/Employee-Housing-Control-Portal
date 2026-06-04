"""WSGI entry point for the Flask app.

Production (Windows or Linux):
    waitress-serve --listen=127.0.0.1:5000 --threads=8 wsgi:app

Dev / one-off:
    python wsgi.py
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
