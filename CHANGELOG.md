# v1.7.1

- Now unzipping is not necessary anymore; You can directly analyze `.zip` files
- Added new RR-RankPercentile chart
    - Use linear regression from `statsmodels`
- Use more strict criteria on bankroll analysis simulations; Use `RRs` instead of `RRE` (Read in-html docs for details)
- Use correct weights for bold fonts
- Improved minor translations
- Add subtitles for each plot
- Added option to fetch realtime currency conversion rate from the Forex
- Removed maximum data points for resampling
- Added range-slider on the "Historical Performance" section

# v1.6.1

- Now supports multiple languages; English, Korean
- Added in-html documentations for each plot
- Minorly changed some legend names in some plots
- Fixed encoding bug from v1.6.0 for Windows; Use utf-8

## v1.5.0

- Correctly calculate RR by considering number of re-entries
- Changed color scale of heatmaps
- Added marginal distribution on RR section
- Make grouped legend clickable individually
- Changed y-anchor of label of horizontal lines in heatmap
- Removed ITM scatters

## v1.4.1

- Added new Prize Pie chart
- Added `<hr>` tags to distuingish charts easier on HTML
- Restricted y range on historical profitable ratio graph

## v1.3.2

- Do not exit on profit during Monte-carlo simulation on bankroll

## v1.3.1

- Added bankroll analysis chart with development of [pokercraft-local-bankroll](https://github.com/McDic/pokercraft-local-bankroll)
- Fixed parsing for Flip & Go style tournament summaries

## v1.2.0

- Added option to include/exclude freerolls
- Fixed horizontal lines on plots

## v1.1.3

- Include version in generated `.html` file

## v1.1.1

- Fixed minor bug on logarithmic calculations

## v1.1.0

- Added horizontal lines on plots
- Use density heatmaps instead of scatters on RR plots
