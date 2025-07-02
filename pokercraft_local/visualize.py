import math
import typing
import warnings

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as plgo
import statsmodels.api as smapi
from markdown import markdown
from plotly.subplots import make_subplots

from .bankroll import analyze_bankroll
from .constants import BASE_HTML_FRAME, DEFAULT_WINDOW_SIZES
from .data_structures import TournamentSummary
from .translate import (
    BANKROLL_PLOT_SUBTITLE,
    BANKROLL_PLOT_TITLE,
    PLOT_DOCUMENTATIONS,
    PRIZE_PIE_CHART_SUBTITLE,
    PRIZE_PIE_CHART_TITLE,
    RR_RANK_CHART_HOVERTEMPLATE,
    RR_RANK_CHART_SUBTITLE,
    RR_RANK_CHART_TITLE,
    RRE_PLOT_SUBTITLE,
    RRE_PLOT_TITLE,
    Language,
    get_html_title,
    get_software_credits,
    get_translated_column_moving_average,
)


def log2_or_nan(x: float | typing.Any) -> float:
    return math.log2(x) if x > 0 else math.nan


def get_historical_charts(
    tournaments: list[TournamentSummary],
    lang: Language,
    *,
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

    figure = make_subplots(
        rows=3,
        cols=1,
        shared_xaxes=True,
        row_titles=[
            lang << t
            for t in ["Net Profit & Rake", "Profitable Ratio", "Average Buy In"]
        ],
        vertical_spacing=0.01,
    )
    common_options = {"x": df_base.index, "mode": "lines"}

    for col in ("Net Profit", "Net Rake", "Ideal Profit w.o. Rake"):
        figure.add_trace(
            plgo.Scatter(
                y=df_base[col],
                legendgroup="Profit",
                legendgrouptitle_text=lang << "Profits & Rakes",
                name=lang << col,
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
                legendgrouptitle_text=lang << "Profitable Ratio",
                name=get_translated_column_moving_average(lang, window_size),
                hovertemplate="%{meta:.2f}%",
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
                legendgrouptitle_text=lang << "Average Buy In",
                name=get_translated_column_moving_average(lang, window_size),
                hovertemplate="%{y:$,.2f}",
                **common_options,
            ),
            row=3,
            col=1,
        )

    # Update layouts and axes
    figure.update_layout(
        title=lang << "Historical Performance",
        hovermode="x unified",
        yaxis1={"tickformat": "$"},
        yaxis2={"tickformat": ".2%"},
        yaxis3={"tickformat": "$"},
        xaxis={
            "rangeslider": {"visible": True, "autorange": True},
            "labelalias": {
                i: (lang << "Tourney #%d") % (i,) for i in range(1, len(df_base) + 1)
            },
        },
        legend_groupclick="toggleitem",
    )
    figure.update_traces(
        visible="legendonly",
        selector=(
            lambda barline: (
                barline.name in [any_lang << "Net Rake" for any_lang in Language]
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
    figure.update_xaxes(
        autorange=True,
        minallowed=1,
        maxallowed=len(df_base),
        rangeslider_thickness=0.075,
    )
    figure.update_yaxes(fixedrange=False)

    # Hlines
    OPACITY_RED = "rgba(255,0,0,0.3)"
    OPACITY_BLUE = "rgba(0,0,255,0.3)"
    OPACITY_BLACK = "rgba(0,0,0,0.3)"
    figure.add_hline(
        y=0.0,
        line_color=OPACITY_RED,
        line_dash="dash",
        row=1,
        col=1,
        label={
            "text": lang << "Break-even",
            "textposition": "end",
            "font": {"color": OPACITY_RED, "weight": 1000, "size": 18},
            "yanchor": "top",
        },
        exclude_empty_subplots=False,
    )
    figure.add_hline(
        y=df_base["Net Profit"].iat[-1],
        line_color=OPACITY_BLUE,
        line_dash="dash",
        row=1,
        col=1,
        label={
            "text": lang << "Current Net Profit",
            "textposition": "start",
            "font": {"color": OPACITY_BLUE, "weight": 1000, "size": 18},
            "yanchor": "bottom",
        },
    )
    for threshold, text in [
        (5.0, "Micro / Low"),
        (20.0, "Low / Mid"),
        (100.0, "Mid / High"),
    ]:
        figure.add_hline(
            y=threshold,
            line_color=OPACITY_BLACK,
            line_dash="dash",
            row=3,
            col=1,
            label={
                "text": lang << text,
                "textposition": "start",
                "font": {"color": OPACITY_BLACK, "weight": 1000, "size": 18},
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
            "RRE": [t.rre for t in tournaments],
            "Prize Ratio": [t.my_prize / t.total_prize_pool for t in tournaments],
            "Total Entries": [t.total_players for t in tournaments],
            "Profitable": [t.profit > 0 for t in tournaments],
            "Weekday": [t.time_of_week[0] for t in tournaments],
            "TimeOfDay": [t.time_of_week[1] for t in tournaments],
        }
    )

    BLACK_WHITE_COLORSCALE: typing.Final[list[list]] = [
        [0, "rgba(255, 255, 255, 0.6)"],
        [1, "rgba(0, 0, 0, 0.6)"],
    ]
    GOT_X_PROFIT: typing.Final[str] = lang << "Got %sx profit in this region"

    figure = make_subplots(
        1,
        4,
        shared_yaxes=True,
        column_titles=[
            lang << "By Buy In Amount",
            lang << "By Total Entries",
            lang << "By Time of Day",
            lang << "Marginal RRE Distribution",
        ],
        y_title=lang << "RRE",
        horizontal_spacing=0.01,
        column_widths=[0.2, 0.2, 0.2, 0.1],
    )
    fig1_common_options = {
        "y": df_base["RRE"].apply(log2_or_nan),
        "ybins": {"size": 0.5, "start": -3},
        "z": df_base["RRE"],
        "coloraxis": "coloraxis",
        "histfunc": "sum",
    }
    figure.add_trace(
        plgo.Histogram2d(
            x=df_base["Buy In"].apply(log2_or_nan),
            name=lang << "RRE by Buy In",
            hovertemplate="Log2(RRE) = [%{y}]<br>Log2("
            + (lang << "Buy In")
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
            name=lang << "RRE by Entries",
            hovertemplate="Log2(RRE) = [%{y}]<br>Log2("
            + (lang << "Total Entries")
            + ") = [%{x}]<br>"
            + (GOT_X_PROFIT % ("%{z:.2f}",)),
            xbins={"start": 1.0, "size": 1.0},
            **fig1_common_options,
        ),
        row=1,
        col=2,
    )
    figure.add_trace(
        plgo.Histogram2d(
            x=df_base["TimeOfDay"],
            name=lang << "RRE by Time of Day",
            hovertemplate="Log2(RRE) = [%{y}]<br>"
            + (lang << "Time of Day")
            + " = [%{x}] mins<br>"
            + (GOT_X_PROFIT % ("%{z:.2f}",)),
            xbins={"start": 0.0, "size": 60.0 * 2, "end": 60.0 * 24},
            **fig1_common_options,
        ),
        row=1,
        col=3,
    )

    # Marginal distribution
    figure.add_trace(
        plgo.Histogram(
            x=df_base["RRE"],
            y=fig1_common_options["y"],
            name=lang << "Marginal RRE",
            histfunc=fig1_common_options["histfunc"],
            orientation="h",
            ybins=fig1_common_options["ybins"],
            hovertemplate="Log2(RRE) = [%{y}]<br>" + (GOT_X_PROFIT % ("%{x:.2f}",)),
            marker={"color": "rgba(70,70,70,0.35)"},
        ),
        row=1,
        col=4,
    )

    figure.update_layout(
        title=lang << RRE_PLOT_TITLE,
        title_subtitle_text=lang << RRE_PLOT_SUBTITLE,
        title_subtitle_font_style="italic",
    )
    figure.update_coloraxes(colorscale=BLACK_WHITE_COLORSCALE)

    for y, color, hline_label in [
        (0.0, "rgb(140, 140, 140)", "Break-even: 1x Profit"),
        (2.0, "rgb(90, 90, 90)", "Good run: 4x Profit"),
        (5.0, "rgb(40, 40, 40)", "Deep run: 32x Profit"),
    ]:
        for col in range(1, 4):
            figure.add_hline(
                y=y,
                line_color=color,
                line_dash="dash",
                row=1,
                col=col,
                label={
                    "text": lang << hline_label,
                    "textposition": "start",
                    "font": {"color": color, "weight": 1000, "size": 16},
                    "yanchor": "bottom",
                },
            )

    figure.update_xaxes(fixedrange=True)
    figure.update_yaxes(fixedrange=True)
    return figure


def get_bankroll_charts(
    tournaments: list[TournamentSummary],
    lang: Language,
    *,
    initial_capitals: typing.Iterable[int] = (10, 20, 50, 100, 200, 500),
    min_simulation_iterations: int,
    simulation_count: int,
) -> plgo.Figure | None:
    """
    Get bankroll charts.
    """
    INITIAL_CAPITAL: typing.Final[str] = lang << "Initial Capital"
    BANKRUPTCY_RATE: typing.Final[str] = lang << "Bankruptcy Rate"
    SURVIVAL_RATE: typing.Final[str] = lang << "Survival Rate"

    try:
        analyzed = analyze_bankroll(
            tournaments,
            initial_capital_and_exits=tuple((ic, 0.0) for ic in initial_capitals),
            max_iteration=max(min_simulation_iterations, len(tournaments) * 10),
            simulation_count=simulation_count,
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
                    lang << "%.1f Buy-ins" % (k,) for k in analyzed.keys()
                ],
                BANKRUPTCY_RATE: [v.get_bankruptcy_rate() for v in analyzed.values()],
                SURVIVAL_RATE: [v.get_survival_rate() for v in analyzed.values()],
            }
        )

    figure = px.bar(
        df_base,
        x=INITIAL_CAPITAL,
        y=[BANKRUPTCY_RATE, SURVIVAL_RATE],
        title=lang << BANKROLL_PLOT_TITLE,
        color_discrete_sequence=["rgb(242, 111, 111)", "rgb(113, 222, 139)"],
        text_auto=True,
    )
    figure.update_layout(
        legend_title_text=lang << "Metric",
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
    figure.update_layout(
        modebar_remove=["select2d", "lasso2d"],
        title_subtitle_text=lang << BANKROLL_PLOT_SUBTITLE,
        title_subtitle_font_style="italic",
    )
    return figure


def get_profit_pies(
    tournaments: list[TournamentSummary],
    lang: Language,
) -> plgo.Figure:
    """
    Get pie charts of absolute profits
    from past tournament summaries.
    """
    weekday_strs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekday_strs = [lang << s for s in weekday_strs]
    df_base = pd.DataFrame(
        {
            "ID": [t.id for t in tournaments],
            "Tournament Name": [t.name_with_date() for t in tournaments],
            "Prize": [t.my_prize for t in tournaments],
            "Date": [t.start_time for t in tournaments],
            "Weekday": [weekday_strs[t.time_of_week[0]] for t in tournaments],
        }
    )
    total_prizes: float = df_base["Prize"].sum()

    figure = make_subplots(
        2,
        1,
        specs=[[{"type": "pie"}], [{"type": "sunburst"}]],
        horizontal_spacing=0.01,
        vertical_spacing=0.01,
    )

    df_main = df_base.copy(deep=True)
    other_condition = df_main["Prize"] < total_prizes * 0.01
    df_main.loc[other_condition, "ID"] = 0
    df_main.loc[other_condition, "Tournament Name"] = "Others"
    df_main.loc[other_condition, "Date"] = math.nan
    df_main = df_main.groupby("ID").aggregate(
        {"Prize": "sum", "Tournament Name": "first", "Date": "first"}
    )
    figure.add_trace(
        plgo.Pie(
            labels=df_main["Tournament Name"],
            values=df_main["Prize"],
            name=lang << "Individual Prizes",
        ),
        row=1,
        col=1,
    )

    df_weekday = df_base.copy(deep=True)
    for weekday_idx, weekday_str in enumerate(weekday_strs):
        df_weekday.loc[-1] = {
            "ID": weekday_str,
            "Tournament Name": f"{weekday_str}",
            "Prize": df_weekday[df_weekday["Weekday"] == weekday_str]["Prize"].sum(),
            "Weekday": weekday_str,
        }
        df_weekday.index = df_weekday.index + 1
    df_weekday = df_weekday.sort_index()
    df_weekday["Parent"] = df_weekday.apply(
        (lambda r: r["Weekday"] if r["ID"] != r["Weekday"] else ""),
        axis=1,
    )
    df_weekday = df_weekday[df_weekday["Prize"] > 0.005 * total_prizes]
    figure.add_trace(
        plgo.Sunburst(
            labels=df_weekday["Tournament Name"],
            parents=df_weekday["Parent"],
            values=df_weekday["Prize"],
            maxdepth=2,
            name=lang << "Prizes by Weekday",
        ),
        row=2,
        col=1,
    )

    figure.update_traces(
        row=1,
        col=1,
        showlegend=False,
        pull=[0.075 if id_ == 0 else 0 for id_ in df_main.index],
    )
    figure.update_traces(hovertemplate="%{label}: %{value:$,.2f}")
    figure.update_layout(
        title=lang << PRIZE_PIE_CHART_TITLE,
        title_subtitle_text=lang << PRIZE_PIE_CHART_SUBTITLE,
        title_subtitle_font_style="italic",
    )
    return figure


def get_rr_by_rank_chart(
    tournaments: list[TournamentSummary], lang: Language
) -> plgo.Figure:
    """
    Get `RR by Rank Percentile` chart.
    """
    df_base = pd.DataFrame(
        {
            "Rank": [t.my_rank for t in tournaments],
            "Rank Percentile": [t.my_rank / t.total_players for t in tournaments],
            "RR": [t.rrs[-1] + 1.0 if t.rrs else math.nan for t in tournaments],
            "Name": [
                "%s (%s)" % (t.name, t.start_time.strftime("%Y%m%d"))
                for t in tournaments
            ],
            "Total Players": [t.total_players for t in tournaments],
        }
    )
    df_base["Percentile mul RR"] = df_base["Rank Percentile"] * df_base["RR"]
    df_base = df_base[df_base["RR"] > 0.0]
    max_rr = df_base["RR"].max()
    best_percentile_log = math.log10(df_base["Rank Percentile"].min())

    # Linear regression
    df_hhh_only = df_base[df_base["Rank Percentile"] <= 1 / 8.0].copy()
    df_hhh_only["RR"] = df_hhh_only["RR"].apply(log2_or_nan)
    df_hhh_only["Rank Percentile"] = df_hhh_only["Rank Percentile"].apply(log2_or_nan)
    fit_results = (
        smapi.OLS(
            df_hhh_only["RR"],
            smapi.add_constant(df_hhh_only["Rank Percentile"]),
            missing="drop",
        )
        .fit()
        .predict()
    )
    df_hhh_only["Fitted"] = fit_results
    df_hhh_only["Fitted"] = df_hhh_only["Fitted"].apply(lambda x: 2**x)
    df_hhh_only["RR"] = df_hhh_only["RR"].apply(lambda x: 2**x)
    df_hhh_only["Rank Percentile"] = df_hhh_only["Rank Percentile"].apply(
        lambda x: 2**x
    )

    COMMON_CUSTOM_DATA = np.stack(
        (
            df_base["Name"],
            df_base["Total Players"],
            df_base["Rank"],
            df_base["RR"],
            df_base["Percentile mul RR"],
        ),
        axis=-1,
    )
    COMMON_OPTIONS = {
        "x": df_base["Rank Percentile"],
        "mode": "markers",
        "customdata": COMMON_CUSTOM_DATA,
        "hovertemplate": lang << RR_RANK_CHART_HOVERTEMPLATE,
    }

    figure = make_subplots(specs=[[{"secondary_y": True}]])
    figure.add_trace(
        plgo.Scatter(
            y=df_base["RR"],
            name=lang << "RR by Percentile",
            **COMMON_OPTIONS,
        )
    )
    figure.add_trace(
        plgo.Scatter(
            y=df_base["Percentile mul RR"],
            name=lang << "PERR",
            visible="legendonly",
            marker_color="#BB75FF",
            **COMMON_OPTIONS,
        ),
        secondary_y=True,
    )
    figure.add_trace(
        plgo.Scatter(
            x=df_hhh_only["Rank Percentile"],
            y=df_hhh_only["Fitted"],
            name=lang << "RR Trendline",
            showlegend=True,
            mode="lines",
            hoverinfo="skip",
            marker_color="RGBA(54,234,201,0.4)",
        )
    )
    figure.update_layout(
        title=lang << RR_RANK_CHART_TITLE,
        title_subtitle_text=lang << RR_RANK_CHART_SUBTITLE,
        title_subtitle_font_style="italic",
        xaxis_title=lang << "Rank Percentile",
    )
    OPACITY_RED = "rgba(255,0,0,0.3)"
    OPACITY_GRAY = "rgb(180,180,180)"
    OPACITY_GREEN = "rgba(74,131,78,0.7)"
    figure.add_vline(x=1.0, line_dash="dash", line_color=OPACITY_GRAY)
    figure.add_vline(
        x=1 / 8.0,
        line_dash="dash",
        line_color=OPACITY_GREEN,
        label={
            "text": lang << "Rough ITM Cut (1/8)",
            "font": {"size": 16, "color": OPACITY_GREEN, "weight": 1000},
            "textposition": "end",
            "xanchor": "right",
        },
    )
    figure.add_hline(
        y=1.0,
        line_dash="dash",
        line_color=OPACITY_RED,
        label={
            "text": lang << "Break-even",
            "font": {"size": 28, "color": OPACITY_RED, "weight": 1000},
            "textposition": "end",
            "yanchor": "top",
        },
    )
    figure.update_xaxes(
        type="log",
        range=[0, best_percentile_log - 0.2],
        minallowed=-7.0,
        maxallowed=1.0,
        tickformat=",.2%",
        dtick=0.5,
    )
    figure.update_yaxes(
        type="log",
        minallowed=-2.0,
        maxallowed=7.0,
        range=[-1.0, math.log10(max(max_rr, 1)) + 0.1],
        autorange=False,
        title_text="RR",
        secondary_y=False,
    )
    figure.update_yaxes(
        type="log",
        range=[math.log10(0.01), math.log10(0.75)],
        title_text="PERR",
        secondary_y=True,
        autorange=False,
    )
    return figure


def plot_total(
    nickname: str,
    tournaments: typing.Iterable[TournamentSummary],
    lang: Language = Language.ENGLISH,
    *,
    sort_key: typing.Callable[[TournamentSummary], typing.Any] = (
        lambda t: t.sorting_key()
    ),
    window_sizes: tuple[int, ...] = DEFAULT_WINDOW_SIZES,
    bankroll_simulation_count: int = 25_000,
    bankroll_min_simulation_iterations: int = 40_000,
) -> str:
    """
    Plots the total prize pool of tournaments.
    """
    tournaments = sorted(tournaments, key=sort_key)
    figures: list[plgo.Figure | None] = [
        get_historical_charts(
            tournaments,
            lang,
            window_sizes=window_sizes,
        ),
        get_profit_heatmap_charts(tournaments, lang),
        get_bankroll_charts(
            tournaments,
            lang,
            simulation_count=bankroll_simulation_count,
            min_simulation_iterations=bankroll_min_simulation_iterations,
        ),
        get_profit_pies(tournaments, lang),
        get_rr_by_rank_chart(tournaments, lang),
    ]
    return BASE_HTML_FRAME.format(
        title=get_html_title(nickname, lang),
        plots="<br><hr><br>".join(  # type: ignore[var-annotated]
            fig.to_html(include_plotlyjs=("cdn" if i == 0 else False), full_html=False)
            + markdown(doc_dict[lang])
            for i, (doc_dict, fig) in enumerate(
                zip(PLOT_DOCUMENTATIONS, figures, strict=True)
            )
            if fig is not None
        ),
        software_credits=get_software_credits(lang),
    )
