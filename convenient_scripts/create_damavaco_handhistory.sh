#!/bin/bash

python run_cli.py \
    -d data/damavaco/handhistory \
    -o output/damavaco/handhistory \
    -n Damavaco \
    --plot-type handhistory \
    "$@"
