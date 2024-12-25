import math
import typing
import warnings

import pandas as pd
import plotly.express as px
import plotly.graph_objects as plgo
from markdown import markdown
from plotly.subplots import make_subplots

from .bankroll import analyze_bankroll
from .constants import BASE_HTML_FRAME, DEFAULT_WINDOW_SIZES
from .data_structures import TournamentBrand, TournamentSummary
from .translate import (
    BANKROLL_PLOT_TITLE,
    PLOT_DOCUMENTATIONS,
    PRIZE_PIE_CHART_TITLE,
    RR_PLOT_TITLE,
    Language,
    get_html_title,
    get_software_credits,
    get_translated_column_moving_average,
    translate_to,
)


def log2_or_nan(x: float | typing.Any) -> float:
    return math.log2(x) if x > 0 else math.nan


def get_historical_charts(
    tournaments: list[TournamentSummary],
    lang: Language,
    max_data_points: int = 2000,
    window_sizes: tuple[int, ...] = DEFAULT_WINDOW_SIZES,
) -> plgo.Figure:
    """
    Get historical charts.
    """
    df_base = pd.DataFrame(
        {
            "Tournament Name": [t.name for t in tournaments],
            "Time": [t.start_time for t in tournaments],
            "Profit": [t.profit for t in tournaments],
            "Rake": [t.rake * t.my_entries for t in tournaments],
            "Profitable": [1 if t.profit > 0 else 0 for t in tournaments],
            "Buy In": [t.buy_in for t in tournaments],
        }
    )
    df_base["Net Profit"] = df_base["Profit"].cumsum()
    df_base["Net Rake"] = df_base["Rake"].cumsum()
    df_base["Ideal Profit w.o. Rake"] = df_base["Net Profit"] + df_base["Net Rake"]
    df_base.index += 1

    # Profitable ratio
    profitable_expanding = df_base["Profitable"].expanding()
    max_rolling_profitable: float = 0
    min_rolling_profitable: float = 1
    df_base["Profitable Ratio"] = (
        profitable_expanding.sum() / profitable_expanding.count()
    )
    for window_size in window_sizes:
        this_title = f"Profitable Ratio W{window_size}"
        df_base[this_title] = (
            df_base["Profitable"].rolling(window_size).sum() / window_size
        )
        max_rolling_profitable = max(max_rolling_profitable, df_base[this_title].max())
        min_rolling_profitable = min(min_rolling_profitable, df_base[this_title].min())

    # Avg buy-in
    buyin_expanding = df_base["Buy In"].expanding()
    df_base["Avg Buy In"] = buyin_expanding.sum() / buyin_expanding.count()
    max_rolling_buyin: float = 0
    min_rolling_buyin: float = 1e9
    for window_size in window_sizes:
        this_title = f"Avg Buy In W{window_size}"
        df_base[this_title] = df_base["Buy In"].rolling(window_size).mean()
        max_rolling_buyin = max(max_rolling_buyin, df_base[this_title].max())
        min_rolling_buyin = min(min_rolling_buyin, df_base[this_title].min())

    # Resampling
    df_base = df_base.iloc[:: max(1, math.ceil(len(df_base) / max_data_points)), :]

    figure = make_subplots(
        rows=3,
        cols=1,
        shared_xaxes=True,
        row_titles=[
            translate_to(lang, t)
            for t in ["Net Profit & Rake", "Profitable Ratio", "Average Buy In"]
        ],
        x_title=translate_to(lang, "Tournament Count"),
        vertical_spacing=0.01,
    )
    common_options = {"x": df_base.index, "mode": "lines"}

    for col in ("Net Profit", "Net Rake", "Ideal Profit w.o. Rake"):
        figure.add_trace(
            plgo.Scatter(
                y=df_base[col],
                legendgroup="Profit",
                legendgrouptitle_text=translate_to(lang, "Profits & Rakes"),
                name=translate_to(lang, col),
                hovertemplate="%{y:$,.2f}",
                **common_options,
            ),
            row=1,
            col=1,
        )

    for window_size in (0,) + window_sizes:
        pr_col = (
            "Profitable Ratio"
            if window_size == 0
            else f"Profitable Ratio W{window_size}"
        )
        figure.add_trace(
            plgo.Scatter(
                y=df_base[pr_col],
                meta=[y * 100 for y in df_base[pr_col]],
                legendgroup="Profitable Ratio",
                legendgrouptitle_text=translate_to(lang, "Profitable Ratio"),
                name=get_translated_column_moving_average(lang, window_size),
                hovertemplate="%{meta:.3f}%",
                **common_options,
            ),
            row=2,
            col=1,
        )

        avb_col = "Avg Buy In" if window_size == 0 else f"Avg Buy In W{window_size}"
        figure.add_trace(
            plgo.Scatter(
                y=df_base[avb_col],
                legendgroup="Avg Buy In",
                legendgrouptitle_text=translate_to(lang, "Avg Buy In"),
                name=get_translated_column_moving_average(lang, window_size),
                hovertemplate="%{y:$,.2f}",
                **common_options,
            ),
            row=3,
            col=1,
        )

    # Update layouts and axes
    figure.update_layout(
        title=translate_to(lang, "Historical Performance"),
        hovermode="x unified",
        yaxis1={"tickformat": "$"},
        yaxis2={"tickformat": ".2%"},
        yaxis3={"tickformat": "$"},
        legend_groupclick="toggleitem",
    )
    figure.update_traces(
        visible="legendonly",
        selector=(
            lambda barline: (
                barline.name
                in [translate_to(any_lang, "Net Rake") for any_lang in Language]
            )
            or ("800" in barline.name)
        ),
    )
    figure.update_traces(xaxis="x")
    figure.update_yaxes(
        row=2,
        col=1,
        minallowed=0,
        maxallowed=1,
        range=[min_rolling_profitable - 0.015, max_rolling_profitable + 0.015],
    )
    figure.update_yaxes(
        row=3,
        col=1,
        patch={
            "type": "log",
            "range": [
                math.log10(max(min_rolling_buyin, 0.1)) - 0.05,
                math.log10(max(max_rolling_buyin, 0.1)) + 0.05,
            ],
            "nticks": 8,
        },
    )

    # Hlines
    opacity_red = "rgba(255,0,0,0.25)"
    opacity_black = "rgba(0,0,0,0.25)"
    figure.add_hline(
        y=0.0,
        line_color=opacity_red,
        line_dash="dash",
        row=1,
        col=1,
        label={
            "text": translate_to(lang, "Break-even"),
            "textposition": "end",
            "font": {"color": opacity_red, "weight": 5, "size": 24},
            "yanchor": "top",
        },
        exclude_empty_subplots=False,
    )
    for threshold, text in [
        (5.0, "Micro / Low"),
        (20.0, "Low / Mid"),
        (100.0, "Mid / High"),
    ]:
        figure.add_hline(
            y=threshold,
            line_color=opacity_black,
            line_dash="dash",
            row=3,
            col=1,
            label={
                "text": translate_to(lang, text),
                "textposition": "start",
                "font": {"color": opacity_black, "weight": 5, "size": 18},
                "yanchor": "top",
            },
            exclude_empty_subplots=False,
        )
    figure.update_shapes(xref="x domain", xsizemode="scaled", x0=0, x1=1)

    return figure


def get_profit_heatmap_charts(
    tournaments: list[TournamentSummary],
    lang: Language,
) -> plgo.Figure:
    """
    Get profit scatter charts.
    """
    df_base = pd.DataFrame(
        {
            "Tournament Name": [t.name for t in tournaments],
            "Buy In": [t.buy_in for t in tournaments],
            "Relative Prize": [t.relative_return + 1 for t in tournaments],
            "Prize Ratio": [t.my_prize / t.total_prize_pool for t in tournaments],
            "Total Entries": [t.total_players for t in tournaments],
            "Tournament Brand": [
                TournamentBrand.find(t.name).name for t in tournaments
            ],
            "Profitable": [t.profit > 0 for t in tournaments],
        }
    )

    BLACK_WHITE_COLORSCALE: typing.Final[list[list]] = [
        [0, "rgba(255, 255, 255, 0.6)"],
        [1, "rgba(0, 0, 0, 0.6)"],
    ]
    NONZERO_PROFIT_ONLY: typing.Final[str] = translate_to(lang, "Nonzero prize only")
    GOT_X_PROFIT: typing.Final[str] = translate_to(
        lang, "Got %sx profit in this region"
    )

    figure = make_subplots(
        1,
        3,
        shared_yaxes=True,
        column_titles=[
            "%s<br>(%s)"
            % (translate_to(lang, "By Buy In Amount"), NONZERO_PROFIT_ONLY),
            "%s<br>(%s)"
            % (translate_to(lang, "By Total Entries"), NONZERO_PROFIT_ONLY),
            translate_to(lang, "Marginal RR Distribution"),
        ],
        y_title=translate_to(lang, "Relative Prize Return (RR)"),
        horizontal_spacing=0.01,
    )
    fig1_common_options = {
        "y": df_base["Relative Prize"].apply(log2_or_nan),
        "ybins": {"size": 1.0},
        "z": df_base["Relative Prize"],
        "coloraxis": "coloraxis",
        "histfunc": "sum",
    }
    figure.add_trace(
        plgo.Histogram2d(
            x=df_base["Buy In"].apply(log2_or_nan),
            name=translate_to(lang, "RR by Buy In"),
            hovertemplate="Log2(RR) = [%{y}]<br>Log2("
            + translate_to(lang, "Buy In")
            + ") = [%{x}]<br>"
            + (GOT_X_PROFIT % ("%{z:.2f}",)),
            **fig1_common_options,
        ),
        row=1,
        col=1,
    )
    figure.add_trace(
        plgo.Histogram2d(
            x=df_base["Total Entries"].apply(log2_or_nan),
            name=translate_to(lang, "RR by Entries"),
            hovertemplate="Log2(RR) = [%{y}]<br>Log2("
            + translate_to(lang, "Total Entries")
            + ") = [%{x}]<br>"
            + (GOT_X_PROFIT % ("%{z:.2f}",)),
            **fig1_common_options,
        ),
        row=1,
        col=2,
    )

    # Marginal distribution
    figure.add_trace(
        plgo.Histogram(
            x=df_base["Relative Prize"],
            y=fig1_common_options["y"],
            name=translate_to(lang, "Marginal RR"),
            histfunc=fig1_common_options["histfunc"],
            orientation="h",
            ybins=fig1_common_options["ybins"],
            hovertemplate="Log2(RR) = [%{y}]<br>" + (GOT_X_PROFIT % ("%{x:.2f}",)),
            marker={"color": "rgba(70,70,70,0.35)"},
        ),
        row=1,
        col=3,
    )

    figure.update_layout(title=translate_to(lang, RR_PLOT_TITLE))
    figure.update_coloraxes(colorscale=BLACK_WHITE_COLORSCALE)

    for y, color, hline_label in [
        (0.0, "rgb(140, 140, 140)", "Break-even: 1x Profit"),
        (2.0, "rgb(90, 90, 90)", "Good run: 4x Profit"),
        (5.0, "rgb(40, 40, 40)", "Deep run: 32x Profit"),
    ]:
        figure.add_hline(
            y=y,
            line_color=color,
            line_dash="dash",
            row=1,
            col="all",
            label={
                "text": translate_to(lang, hline_label),
                "textposition": "start",
                "font": {"color": color, "weight": 5, "size": 20},
                "yanchor": "bottom",
            },
        )

    figure.update_xaxes(fixedrange=True)
    figure.update_yaxes(fixedrange=True)
    return figure


def get_bankroll_charts(
    tournaments: list[TournamentSummary],
    lang: Language,
    initial_capitals: typing.Iterable[int] = (10, 20, 50, 100, 200, 500),
) -> plgo.Figure | None:
    """
    Get bankroll charts.
    """
    INITIAL_CAPITAL: typing.Final[str] = translate_to(lang, "Initial Capital")
    BANKRUPTCY_RATE: typing.Final[str] = translate_to(lang, "Bankruptcy Rate")
    SURVIVAL_RATE: typing.Final[str] = translate_to(lang, "Survival Rate")

    try:
        analyzed = analyze_bankroll(
            tournaments,
            initial_capital_and_exits=tuple((ic, 0.0) for ic in initial_capitals),
            max_iteration=max(10000, len(tournaments) * 10),
        )
    except ValueError as err:
        warnings.warn(
            (
                "Bankroll analysis failed with reason(%s)."
                " Perhaps your relative returns are losing."
            )
            % (err,)
        )
        return None
    else:
        df_base = pd.DataFrame(
            {
                INITIAL_CAPITAL: [
                    translate_to(lang, "%.1f Buy-ins") % (k,) for k in analyzed.keys()
                ],
                BANKRUPTCY_RATE: [v.get_bankruptcy_rate() for v in analyzed.values()],
                SURVIVAL_RATE: [v.get_profitable_rate() for v in analyzed.values()],
            }
        )

    figure = px.bar(
        df_base,
        x=INITIAL_CAPITAL,
        y=[BANKRUPTCY_RATE, SURVIVAL_RATE],
        title=translate_to(lang, BANKROLL_PLOT_TITLE),
        color_discrete_sequence=["rgb(242, 111, 111)", "rgb(113, 222, 139)"],
        text_auto=True,
    )
    figure.update_layout(
        legend_title_text=translate_to(lang, "Metric"),
        yaxis_title=None,
    )
    figure.update_traces(hovertemplate="%{x}: %{y:.2%}")
    figure.update_xaxes(fixedrange=True)
    figure.update_yaxes(
        tickformat=".2%",
        minallowed=0.0,
        maxallowed=1.0,
        fixedrange=True,
    )
    figure.update_layout(modebar_remove=["select2d", "lasso2d"])
    return figure


def get_profit_pie(
    tournaments: list[TournamentSummary],
    lang: Language,
) -> plgo.Figure:
    """
    Get the pie chart of absolute profits from past tournament summaries.
    """
    df_base = pd.DataFrame(
        {
            "ID": [t.id for t in tournaments],
            "Tournament Name": [t.name for t in tournaments],
            "Prize": [t.my_prize for t in tournaments],
            "Date": [t.start_time for t in tournaments],
        }
    )

    total_prizes: float = df_base["Prize"].sum()
    other_condition = df_base["Prize"] < total_prizes * 0.005
    df_base.loc[other_condition, "ID"] = 0
    df_base.loc[other_condition, "Tournament Name"] = "Others"
    df_base.loc[other_condition, "Date"] = math.nan
    df_base = df_base.groupby("ID").aggregate(
        {"Prize": "sum", "Tournament Name": "first", "Date": "first"}
    )
    df_base["ID"] = df_base.index

    figure = px.pie(
        df_base,
        values="Prize",
        names="ID",
        title=translate_to(lang, PRIZE_PIE_CHART_TITLE),
        hole=0,
    )
    df_base["Custom Data"] = (
        df_base["Tournament Name"] + " (" + df_base["Date"].dt.strftime("%Y%m%d") + ")"
    )
    df_base.fillna({"Custom Data": translate_to(lang, "Others")}, inplace=True)
    figure.update_traces(
        customdata=df_base["Custom Data"],
        showlegend=False,
        hovertemplate="%{customdata[0]}: %{value:$,.2f}",
        pull=[0.075 if id_ == 0 else 0 for id_ in df_base.index],
    )
    return figure


def plot_total(
    nickname: str,
    tournaments: typing.Iterable[TournamentSummary],
    sort_key: typing.Callable[[TournamentSummary], typing.Any] = (
        lambda t: t.sorting_key()
    ),
    max_data_points: int = 2000,
    window_sizes: tuple[int, ...] = DEFAULT_WINDOW_SIZES,
    lang: Language = Language.ENGLISH,
) -> str:
    """
    Plots the total prize pool of tournaments.
    """
    tournaments = sorted(tournaments, key=sort_key)
    figures: list[plgo.Figure | None] = [
        get_historical_charts(
            tournaments,
            lang,
            max_data_points=max_data_points,
            window_sizes=window_sizes,
        ),
        get_profit_heatmap_charts(tournaments, lang),
        get_bankroll_charts(tournaments, lang),
        get_profit_pie(tournaments, lang),
    ]
    return BASE_HTML_FRAME.format(
        title=get_html_title(nickname, lang),
        plots="<br><hr><br>".join(  # type: ignore[var-annotated]
            fig.to_html(include_plotlyjs=("cdn" if i == 0 else False), full_html=False)
            + "<br>"
            + markdown(doc_dict[lang])
            for i, (doc_dict, fig) in enumerate(
                zip(PLOT_DOCUMENTATIONS, figures, strict=True)
            )
            if fig is not None
        ),
        software_credits=get_software_credits(lang),
    )
