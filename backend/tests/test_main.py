import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]

def test_websocket_connection():
    with client.websocket_connect("/ws") as websocket:
        data = websocket.receive_json()
        assert data["type"] == "snapshot"
        assert "pixels" in data
        
        # Test broadcast of user count
        data2 = websocket.receive_json()
        assert data2["type"] == "user_count"
        
        websocket.send_json({"type": "join", "username": "TestUser", "color": "#ffffff"})
        data3 = websocket.receive_json()
        assert data3["type"] == "join"
        assert data3["username"] == "TestUser"
