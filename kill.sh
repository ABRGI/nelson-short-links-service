#!/bin/bash

# Script kills the server process if it is running
# If the process is not being killed when running this script, try running using sudo. lsof sometimes doesnt return port if not run as sudo

# kill manager
PORT=4006
LOG_FILE="logs/logs_manager.log"

PID=$(lsof -t -i :$PORT)

if [ -z "$PID" ]; then
  echo "No process is running on port $PORT." >> $LOG_FILE
else
  kill -9 $PID
  echo "Process on port $PORT (PID: $PID) has been terminated." >> $LOG_FILE
fi

# kill redirect service
PORT=4007
LOG_FILE="logs/logs_redirect.log"

PID=$(lsof -t -i :$PORT)

if [ -z "$PID" ]; then
  echo "No process is running on port $PORT." >> $LOG_FILE
else
  kill -9 $PID
  echo "Process on port $PORT (PID: $PID) has been terminated." >> $LOG_FILE
fi