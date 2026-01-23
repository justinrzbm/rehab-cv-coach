@echo off

REM Kill any process using port 8000
echo Checking for processes on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do (
    echo Killing process %%a on port 8000...
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 1 /nobreak >nul

REM Build and start Docker container
echo Starting Docker container...
docker-compose up --build
