echo "Checking for processes on port 8000..."
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "Killing processes on port 8000..."
    lsof -ti:8000 | xargs kill -9
    sleep 1
else
    echo "Port 8000 is free"
fi

npm install
npm run build 
npm start
