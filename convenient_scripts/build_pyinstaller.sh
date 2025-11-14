#!/bin/bash

pyinstaller run_gui.py --distpath ./dist \
    --add-data "./pokercraft_local/translation_values.json:pokercraft_local" \
    --add-data "./pokercraft_local/hu_preflop_cache.txt.gz:pokercraft_local"
