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

After you downloaded, unzip your downloaded `.zip` files, and put all of them under single folder.
The library finds all `GG(blabla).txt` files recursively by default, so it's ok to make multiple folders inside to make better organization of files.

### 3. Running a program

For GUI, if you successfully run the program, you will be able to view something like following image.

![gui_screen](./images/gui_screen.png)

#### 3A. When you cloned this whole repo

For CLI, run `run_cli.py` with some arguments.
If you installed dependencies in your virtual environment, make sure you enabled it before.

```bash
python run_cli.py -d (YOUR_DATA_FOLDER) -o (OUTPUT_FOLDER) -n (YOUR_GG_NICKNAME)
```

For GUI, simply run `run_gui.py` or you can directly download binaries from [Releases](https://github.com/McDic/pokercraft-local/releases) to execute compiled program directly.
When you start the GUI program, then you will be able to view something like above image.
Choose data directory and output directory, input your nickname, then run the process by clicking the bottom button.

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

Execute `run_gui-(YOUR_OS)/dist/run_gui/run_gui.exe` from downloaded zip file on your local machine.

### 4. Check results

Go to your output folder and open generated `.html` file.
Note that plotly javascripts are included by CDN, so you need working internet connection to properly view it.

## Features

### Historical performances

![historical_perf](./images/features/historical_performance.png)

You can see 3 line graphs in this section;

1. Net profit, net rake, and ideal profit(when you do not pay the rake)
2. *"Profitable ratio"*, including moving average -
   Pokercraft does not give you an information of ITM,
   instead it lets you know amount of your prizes(including bounties) instead.
   Because of this, if you got enough bounty(more than buy-in) from some tournaments,
   then the system classifies that as "profitable".
   This value is slightly higher than actual ITM ratio.
3. Average buy in of your tournaments, including moving average.
   Note that buy-in is log-scaled.

*My comment:
This section is classic and probably the most fundamental graph for all tournament grinders.
Note that the Pokercraft does not show the true PnL. It does not correctly mirror the rake.*

### Relative prize returns

![relative_rr](./images/features/relative_prize_returns.png)

RR(Relative Prize Returns) is a relative return of your investment for individual tournament.
For example, if you got $30 from a tournament with $10 buy-in and you made 1 re-entry, then your total investment is $20, therefore $RR = \frac{\$30}{\$10 \times 2} = 1.5$.

You can see 3 heatmaps in this section;

1. RR by buy-in of tournaments
2. RR by total entries of tournaments
3. Marginal distribution of each RR range

Note that X and Y axes are in log2 scale in these plots,
because these metrics have wide range of values
so it makes no sense to display in linear scale.

*My comment:
This section shows you are strong/weak in which buy-in and which entry sizes,
and also how much of your relative profits are from in RR range.*

### Bankroll analysis with Monte-Carlo simulation

![bankroll_analysis](./images/features/bankroll_analysis.png)

This section shows simplified result of bankroll analysis simulations.
The exact procedure of simulation follows;

- From your Pokercraft data, gather $RR-1$ of every tournament results.
- Assuming you are continuously playing tournaments of $1 dollar buy-in, where each tournament yields one of $RR-1$ as return, in uniform and independent manner.
- For single simulation, run `max(10 * YOUR_TOURNAMENT_COUNT, 1e4)` times and see if you are bankrupted or not.
- Run 25000 parellel simulations.

Then each individual simulation yields one of two results;

- *"Profitable"* (The final capital is non-zero)
- *"Bankruptcy"* (It bankrupted before reaching maximum iteration)

So profitable rate is basically likelihood of your survival when you start playing tournaments with specific BI.

*My comment:
I personally think 200 BI is the optimal bankroll for tournament grinders,
especially if you play massive tournaments with thousands of participants.*

### Prize pie chart

![prize_pie_chart](./images/features/your_prizes.png)

This section shows how much of your total prizes are from specific tournaments.
Since there might be too much number of slices,
only tournaments gave you more than 0.5% of your total prizes are shown,
and all other tournaments are merged into "Others",
which is the biggest separated slice.

*My comment:
You can see if you ignore small prizes, then lots of portion of your prizes are gone,
which means you should not ignore them.*
