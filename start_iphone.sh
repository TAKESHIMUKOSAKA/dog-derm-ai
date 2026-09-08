#!/usr/bin/env bash
set -e
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
IP=$(python3 - <<'PY'
import socket
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
try:
    s.connect(('10.255.255.255',1)); print(s.getsockname()[0])
except Exception: print('127.0.0.1')
finally: s.close()
PY
)
echo "Open Safari on iPhone (same Wi-Fi): http://$IP:8000"
uvicorn app:app --host 0.0.0.0 --port 8000
