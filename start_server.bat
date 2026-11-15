@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:8765"
D:\Python\python.exe server.py --host 0.0.0.0 --port 8765
