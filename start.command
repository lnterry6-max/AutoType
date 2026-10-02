#!/bin/bash
cd "$(dirname "$0")"
PORT=8080
echo "Starting AutoType at http://localhost:$PORT/"
python3 -m http.server "$PORT" >/tmp/autotype-server.log 2>&1 &
PID=$!
sleep 1
open "http://localhost:$PORT/index.html"
echo "AutoType is running. Keep this window open. Press Control-C to stop."
trap "kill $PID 2>/dev/null" EXIT
wait $PID
