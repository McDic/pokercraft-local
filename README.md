# Pokercraft Local

This is a customized visualization tool using downloaded data from Pokercraft in GGNetwork.

[Here is demo.](https://blog.mcdic.net/assets/raw_html/damavaco_performance.html)

## Dependencies

- Python 3.12
    - plotly, pandas

I develop most stuffs on WSL and did not tested on other operating systems yet.

## How to run

1. Install dependencies with `pip`, optionally on virtual environment.

    ```bash
    pip install -r requirements.txt
    ```

2. Download *"Game summaries"* file by pressing green button on your pokercraft tournament section.
    If there are too many tournament records on your account, GGNetwork will prevent you from bulk downloading, therefore you may have to download separately monthly or weekly records.

    ![img](./images/pokercraft_download.png)

3. Unzip your downloaded data, and put all of them under single folder. The library finds all `GG(blabla).txt` files recursively by default, so it's ok to make multiple folders inside to avoid duplication easier.

4. Run `run.py` with some arguments.
    If you installed dependencies in your virtual environment, make sure you enabled it before.

    ```bash
    python run.py -d (YOUR_DATA_FOLDER) -o (OUTPUT_FOLDER) -n (YOUR_GG_NICKNAME)
    ```

5. Go to your `OUTPUT_FOLDER` and open generated `.html` file.
    Note that plotly javascripts are included by CDN, so you need working internet connection to properly view it.

## Features

- Net Profit & Rake chart
- Profitable Tournaments Ratio chart
    (This is different from ITM; If you made profits by bounty killing without being ITM, then it is also counted as "profitable")
- Average Buy In Amount chart
- Relative Prize Return charts / ITM Scatters chart
