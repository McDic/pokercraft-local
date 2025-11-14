# Pokercraft Local

This is a customized visualization tool using downloaded data from Pokercraft in GGNetwork.
Following is a list of working demos.

- [Tourney result analysis](https://blog.mcdic.net/assets/raw_html/damavaco_performance_en.html)
- [Hand history analysis](https://blog.mcdic.net/assets/raw_html/damavaco_handhistories_en.html)

일반인을 위한 한글 사용법 문서는 [여기](INSTRUCTION_kr.md)를 눌러주세요.

## Dependencies

- Python 3.12 (for libraries, check `requirements.txt`.)

## How to run

### 1. Installation

Clone this git repo and install dependencies with `pip install -r requirements.txt`, optionally on virtual environment.

You can also download this library from PyPI; Run `pip install pokercraft-local`.

Or alternatively, you can just download compiled binaries from [Releases page](https://github.com/McDic/pokercraft-local/releases).
This is the best decision when you are a Windows user and don't know programming.

### 2. Collect your data files from Pokercraft

Download *"Game summaries"* file by pressing green button on your pokercraft tournament section,
and *"Hand histories"* file by pressing red button on your pokercraft tournament section.
If there are too many tournament records on your account, GGNetwork will prevent you from bulk downloading,
therefore you may have to download separately monthly or weekly records.

![pokercraft_download](./images/pokercraft_download.png)

Also there are some expiration dates for each file;
You cannot download tournament summaries for tourneys which are 1 year old or older,
neither hand histories for tourneys which are 3 months old or older.

After you downloaded, just put all `.zip` files in single folder.
The library finds all `GG(blabla).txt` files from a selected directory and `.zip` files recursively by default.

### 3. Running a program

For GUI, if you successfully run the program, you will be able to view something like following image.

![gui_screen](./images/gui_screen_en_2.2.0.png)

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

Execute `pokercraft-local-.../run_gui/run_gui.exe` from downloaded zip file on your local machine.

### 4. Check results

Go to your output folder and open generated `.html` file.
Note that plotly javascripts are included by CDN, so you need working internet connection to properly view it.

## Features

Each plots are now providing documentations in `.html`,
so please read when you generated a file.
There are following sections;

### Tournament Summary Analysis

1. Historical Performances
2. RRE Heatmaps
3. Bankroll Analysis with Monte-Carlo Simulation
4. Your Prizes
5. RR by Rank Percentiles

### Hand History Analysis

1. All-in Equity Chart
2. Chip Histories
3. Your Hand Usage by Positions
