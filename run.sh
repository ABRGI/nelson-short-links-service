#!/bin/bash

# Script to run this on a dedicated server or local dev instance
# To stop the process, run command ps aux | grep http-serve
# Then find the process id for the correct port and run kill <PID>
# Or run command kill $(lsof -t -i :<PORT>) to find the process id and kill it
# To see the logs in action, run command tail -f logs.log

# Remember to install dependencies first by running command npm i


current_datetime=$(date +%Y%m%d_%H%M%S)
logs_folder="logs"
log_file_manager="$logs_folder/logs_manager.log"
log_file_redirect="$logs_folder/logs_redirect.log"

if [ ! -d "$logs_folder" ]; then
    mkdir "$logs_folder"
    echo "Created logs folder"
fi

# Start the manager first
if [ -f "$log_file_manager" ]; then
    cp "$log_file_manager" "$logs_folder/logs_manager_${current_datetime}.log"
    echo "logs_manager.log has been copied to $logs_folder/logs_manager_${current_datetime}.log"
else
    echo "logs_manager.log does not exist in the logs folder"
fi

export PORT=4006
export LOCAL=true
export ENV_REGION=eu-central-1
export LINKS_TABLE=Test-nelson-shortlinks
export TENANT_LINKS_TABLE=Test-nelson-tenant-shortlinks
export ID_LENGTH=5
export INCLUDE_TIME_STAMP=false
export ACCESSKEY={AWS_ACCESS_KEY}
export SECRETKEY={AWS_SECRET_KEY}
node index_manager.js > $log_file_manager 2>&1 &

echo "short links manager started on port $PORT"

# Start redirect service
if [ -f "$log_file_redirect" ]; then
    cp "$log_file_redirect" "$logs_folder/logs_manager_${current_datetime}.log"
    echo "logs_redirect.log has been copied to $logs_folder/logs_redirect_${current_datetime}.log"
else
    echo "logs_redirect.log does not exist in the logs folder"
fi

export PORT=4007
export LOCAL=true
export ENV_REGION=eu-central-1
export LINKS_TABLE=Test-nelson-shortlinks
export ACCESSKEY={AWS_ACCESS_KEY}
export SECRETKEY={AWS_SECRET_KEY}
node index_redirect.js > $log_file_redirect 2>&1 &

echo "short links redirect service started on port $PORT"