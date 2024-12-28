# Pokercraft Local

This is a customized visualization tool using downloaded data from Pokercraft in GGNetwork.

Here is working [demo](https://blog.mcdic.net/assets/raw_html/damavaco_performance.html).

## Dependencies

- Python 3.12
    - plotly, pandas

I develop most stuffs on WSL and did not tested on other operating systems yet.

## How to run

### 1. Installation

Clone this git repo and install dependencies with `pip install -r requirements.txt`, optionally on virtual environment.
If you want the library files only, you can download from PyPI. Run `pip install pokercraft-local`.

```bash
pip install -r requirements.txt  # When you cloned the whole repo
pip install pokercraft-local  # When you install library only via pip
```

Or alternatively, you can just download compiled binaries from [Releases page](https://github.com/McDic/pokercraft-local/releases).
This is the best decision when you don't know programming.

### 2. Collect your data files from Pokercraft

Download *"Game summaries"* file by pressing green button on your pokercraft tournament section.
If there are too many tournament records on your account, GGNetwork will prevent you from bulk downloading,
therefore you may have to download separately monthly or weekly records.

![pokercraft_download](./images/pokercraft_download.png)

After you downloaded, just put all `.zip` files in single folder.
The unzipping is not necessary anymore from `v1.7.0`.
The library finds all `GG(blabla).txt` files from both directory and `.zip` files recursively by default.

### 3. Running a program

For GUI, if you successfully run the program, you will be able to view something like following image.

![gui_screen](./images/gui_screen.png)

#### 3A. When you cloned this whole repo

Run `run_cli.py` with some arguments.
Make sure you installed all dependencies before running.

```bash
python run_cli.py --help
```

Or alternatively, you can run `run_gui.py` instead.

```bash
python run_gui.py
```

#### 3B. When you installed libraries via `pip`

Run following Python code to start GUI, and you are good to go.

```python
from pokercraft_local.gui import PokerCraftLocalGUI

if __name__ == "__main__":
    PokerCraftLocalGUI().run_gui()
```

To do something programatic, check `run_cli.py` for example references.

#### 3C. When you directly downloaded releases

Execute `run_gui-(YOUR_OS)/run_gui/run_gui.exe` from downloaded zip file on your local machine.

### 4. Check results

Go to your output folder and open generated `.html` file.
Note that plotly javascripts are included by CDN, so you need working internet connection to properly view it.

## Features

Each plots are now providing documentations in `.html`,
so please read when you generated a file.
There are following sections;

1. Historical Performances
2. RRE Heatmaps
3. Bankroll Analysis with Monte-Carlo simulation
4. Your Prizes
5. RR by Rank Percentiles
