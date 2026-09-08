@echo off
if not exist .venv py -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do set IP=%%a
set IP=%IP: =%
echo.
echo Dog Derm AI is starting for iPhone on the same Wi-Fi.
echo Open Safari on iPhone and enter: http://%IP%:8000
echo.
uvicorn app:app --host 0.0.0.0 --port 8000
