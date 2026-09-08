from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_health():
    r = client.get('/api/health')
    assert r.status_code == 200
    assert r.json()['ok'] is True

def test_evidence():
    r = client.get('/api/evidence')
    assert r.status_code == 200
    ids = {x['id'] for x in r.json()}
    assert 'ISCAID_PYODERMA_2025' in ids
