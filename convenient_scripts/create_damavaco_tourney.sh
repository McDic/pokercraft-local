#!/bin/bash

python run_cli.py \
    -d data/damavaco/tourney \
    -o output/damavaco/tourney \
    -n Damavaco \
    --plot-type tourney \
    "$@"
