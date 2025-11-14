import logging
import math
import typing
import warnings

import numpy as np
import pandas as pd
import plotly.graph_objects as plgo
from markdown import markdown
from plotly.subplots import make_subplots

from ..constants import BASE_HTML_FRAME, HAND_STAGE_TYPE, HORIZONTAL_PLOT_DIVIDER
from ..data_structures import GeneralSimpleSegTree, HandHistory, SequentialHandHistories
from ..rust import card as rust_card
from ..rust import equity as rust_equity
from ..translate import HAND_HISTORY_PLOT_DOCUMENTATIONS, Language, get_software_credits
from ..utils import infinite_iter

logger = logging.getLogger("pokercraft_local.visualize")

Card = rust_card.Card
CardNumber = rust_card.CardNumber


def get_all_in_equity_histogram(
    hand_histories: list[HandHistory],
    lang: Language,
    *,
    max_length: int = -1,
) -> plgo.Figure:
    """
    Get all-in win/lose histogram.
    """
    TRKEY_PREFIX: typing.Final[str] = "plot.hand_history.all_in_equity"

    all_in_hand_histories = list(
        filter(
            lambda h: (
                (h.all_ined_street("Hero") in ("preflop", "flop", "turn"))
                and len(h.showdown_players()) >= 2
            ),
            hand_histories,
        )
    )
    if max_length > 0:
        all_in_hand_histories = all_in_hand_histories[
            : min(max_length, len(all_in_hand_histories))
        ]

    all_in_streets: list[typing.Literal["preflop", "flop", "turn"]] = typing.cast(
        list[typing.Literal["preflop", "flop", "turn"]],
        [h.all_ined_street("Hero") for h in all_in_hand_histories],
    )
    logger.info(
        "Total %d all-in hands found. "
        "Preflop all-in = %d hands, preflop heads-up all-in = %d hands",
        len(all_in_hand_histories),
        all_in_streets.count("preflop"),
        sum(
            1
            for hh, street in zip(all_in_hand_histories, all_in_streets)
            if street == "preflop" and len(hh.showdown_players()) == 2
        ),
    )

    equities_by_streets: list[dict[HAND_STAGE_TYPE, dict[str, tuple[float, bool]]]] = []
    for i, h in enumerate(all_in_hand_histories):
        eqd = h.calculate_equity_arbitrary(
            "Hero",
            *(player_id for player_id in h.showdown_players() if player_id != "Hero"),
            stages=(all_in_streets[i],),
        )
        equities_by_streets.append(eqd)
        if (i + 1) % 50 == 0:
            logger.info("Calculated equity for %d all-in hands", i + 1)

    was_best_hands = [h.was_best_hand("Hero") for h in all_in_hand_histories]
    MAIN_COLUMN_NAME: typing.Final[str] = "Hero Equity"
    df_base = pd.DataFrame(
        {
            "Hand ID": [h.id for h in all_in_hand_histories],
            "Tournament ID": [h.tournament_id or 0 for h in all_in_hand_histories],
            MAIN_COLUMN_NAME: [
                eqd[street]["Hero"][0]
                for street, eqd in zip(all_in_streets, equities_by_streets)
            ],
            "Actual Got": [0 if wbh < 0 else 1.0 / (wbh + 1) for wbh in was_best_hands],
        }
    )

    UPPER_LIMIT = 0.99
    LOWER_LIMIT = 1 - UPPER_LIMIT
    df_winning = df_base[df_base["Actual Got"] > UPPER_LIMIT]
    df_chopped = df_base[
        (UPPER_LIMIT >= df_base["Actual Got"]) & (df_base["Actual Got"] > LOWER_LIMIT)
    ]
    df_losing = df_base[df_base["Actual Got"] <= LOWER_LIMIT]

    luckscore_calculator = rust_equity.LuckCalculator()
    for row in df_base.itertuples(index=False):
        equity = row[2]
        actual = row[3]
        luckscore_calculator.add_result_py(equity, actual)
    luck_score = luckscore_calculator.luck_score_py()
    upper_tail, lower_tail, twosided = luckscore_calculator.tails_py()
    logger.info(
        "All-in luck score Z = %.6g, upper tail = %.6f, "
        "lower tail = %.6f, two-sided = %.6f",
        luck_score,
        upper_tail,
        lower_tail,
        twosided,
    )

    OPACITY_GREEN = "rgba(52,203,59,0.8)"
    OPACITY_YELLOW = "rgba(204,198,53,0.8)"
    OPACITY_RED = "rgba(206,37,37,0.8)"

    with np.errstate(divide="ignore", invalid="ignore"):
        bins = np.linspace(0.0, 1.0, 21)
        win_hist, _win_edges = np.histogram(df_winning[MAIN_COLUMN_NAME], bins)
        chop_hist, _chop_edges = np.histogram(df_chopped[MAIN_COLUMN_NAME], bins)
        lose_hist, _lose_edges = np.histogram(df_losing[MAIN_COLUMN_NAME], bins)
        sum_hist = win_hist + chop_hist + lose_hist
        bin_centers = (bins[1:] + bins[:-1]) / 2.0
        bin_widths = np.diff(bins)

        figure = make_subplots(
            rows=2,
            cols=1,
            shared_xaxes=True,
            vertical_spacing=0.01,
        )
        common_customdata = np.stack(
            (
                win_hist,
                chop_hist,
                lose_hist,
                bin_centers - bin_widths / 2.0,
                bin_centers + bin_widths / 2.0,
            ),
            axis=-1,
        )
        common_options: dict = {
            "x": bin_centers,
            "width": bin_widths,
            "customdata": common_customdata,
        }
        for bar in [
            plgo.Bar(
                y=win_hist,
                base=chop_hist / 2.0,
                name=lang << f"{TRKEY_PREFIX}.legends.hero_won",
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplates.hero_won",
                marker_color=OPACITY_GREEN,
                legendgroup=lang << f"{TRKEY_PREFIX}.legends.hero_won",
                **common_options,
            ),  # Winning histogram
            plgo.Bar(
                y=chop_hist,
                base=-chop_hist / 2.0,
                name=lang << f"{TRKEY_PREFIX}.legends.chopped",
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplates.chopped",
                marker_color=OPACITY_YELLOW,
                legendgroup=lang << f"{TRKEY_PREFIX}.legends.chopped",
                **common_options,
            ),  # Chopped histogram
            plgo.Bar(
                y=lose_hist,
                base=-chop_hist / 2.0 - lose_hist,
                name=lang << f"{TRKEY_PREFIX}.legends.hero_lost",
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplates.hero_lost",
                marker_color=OPACITY_RED,
                legendgroup=lang << f"{TRKEY_PREFIX}.legends.hero_lost",
                **common_options,
            ),  # Losing histogram
        ]:
            figure.add_trace(bar, row=1, col=1)

        common_options["showlegend"] = False
        for bar in [
            plgo.Bar(
                y=win_hist / sum_hist,
                base=1 - win_hist / sum_hist,
                name=lang << f"{TRKEY_PREFIX}.legends.hero_won",
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplates.hero_won",
                marker_color=OPACITY_GREEN,
                legendgroup=lang << f"{TRKEY_PREFIX}.legends.hero_won",
                **common_options,
            ),  # Winning histogram
            plgo.Bar(
                y=chop_hist / sum_hist,
                base=lose_hist / sum_hist,
                name=lang << f"{TRKEY_PREFIX}.legends.chopped",
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplates.chopped",
                marker_color=OPACITY_YELLOW,
                legendgroup=lang << f"{TRKEY_PREFIX}.legends.chopped",
                **common_options,
            ),  # Chopped histogram
            plgo.Bar(
                y=lose_hist / sum_hist,
                # base=0.0,  # No base set
                name=lang << f"{TRKEY_PREFIX}.legends.hero_lost",
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplates.hero_lost",
                marker_color=OPACITY_RED,
                legendgroup=lang << f"{TRKEY_PREFIX}.legends.hero_lost",
                **common_options,
            ),  # Losing histogram
        ]:
            figure.add_trace(bar, row=2, col=1)

    figure.add_shape(
        type="line",
        x0=0.0,
        x1=1.0,
        y0=1.0,
        y1=0.0,
        line={"color": "rgba(0,0,0,0.25)", "dash": "dash"},
        row=2,
        col=1,
    )

    figure.update_layout(
        barmode="overlay",
        title={
            "text": lang << f"{TRKEY_PREFIX}.title",
            "subtitle": {
                "text": (lang << f"{TRKEY_PREFIX}.subtitle").format(
                    luck_score=luck_score,
                    tail=100 * (1 - lower_tail),
                ),
                "font": {"style": "italic"},
            },
        },
        modebar_remove=["select2d", "lasso2d"],
    )
    figure.update_xaxes(fixedrange=True)
    figure.update_yaxes(fixedrange=True)
    figure.update_xaxes(
        title={"text": lang << f"{TRKEY_PREFIX}.x_axis"},
        tickformat=".2%",
        range=[0.0, 1.0],
        row=2,
        col=1,
    )
    figure.update_yaxes(
        showticklabels=False,
        title={"text": lang << f"{TRKEY_PREFIX}.y_axis1"},
        row=1,
        col=1,
    )
    figure.update_yaxes(
        title={"text": lang << f"{TRKEY_PREFIX}.y_axis2"},
        tickformat=".0%",
        range=[0.0, 1.0],
        row=2,
        col=1,
    )
    return figure


def get_chip_histories(
    hand_histories: list[HandHistory],
    lang: Language,
) -> plgo.Figure:
    """
    Extract chip histories from hand histories.
    Max sampling is not applied here.
    """
    THIS_TRKEY_PREFIX: typing.Final[str] = "plot.hand_history.chip_histories"
    figure = make_subplots(
        2,
        2,
        specs=[
            [{"colspan": 2}, None],
            [{}, {}],
        ],
        vertical_spacing=0.06,
        horizontal_spacing=0.1,
    )

    # Gather data, and also add each tourney chip history
    total_tourneys: int = 0
    died_at: list[int] = []
    max_hand_lengths: int = 1
    death_thresholds: list[float] = [
        3 / 4,
        3 / 5,
        1 / 2,
        2 / 5,
        1 / 3,
        1 / 4,
        1 / 5,
        1 / 8,
        1 / 10,
    ]
    death_threshold_count: dict[float, int] = {th: 0 for th in death_thresholds}

    # Iterate each tourney
    for sequential_hand_histories in SequentialHandHistories.generate_sequences(
        hand_histories
    ):
        first_hh = sequential_hand_histories.histories[0]
        if first_hh.tournament_id is None:
            warnings.warn(
                "Dropping non-tournament hand histories(%d histories found).."
                % (len(sequential_hand_histories.histories),)
            )
            continue

        total_tourneys += 1
        chip_history_raw = sequential_hand_histories.generate_chip_history()
        initial_chips = chip_history_raw[0]

        # Build segtree to analyze several attributes
        chip_history_segtree_max = GeneralSimpleSegTree(chip_history_raw, max)

        # Death threshold
        for threshold in death_thresholds:
            if all(
                chip_history_segtree_max.get(idx, None) <= v
                for idx, v in enumerate(chip_history_raw)
                if v <= threshold * chip_history_segtree_max.get(None, idx + 1)
            ):
                death_threshold_count[threshold] += 1

        # Chip history raw is manipulated for plot from here
        if chip_history_raw[-1] <= 0:
            died_at.append(len(chip_history_raw))
        while chip_history_raw[-1] == 0:
            chip_history_raw.pop()
        max_hand_lengths = max(max_hand_lengths, len(chip_history_raw))

        chip_history = np.array(chip_history_raw)
        chip_history = np.multiply(chip_history, 1.0 / initial_chips)
        figure.add_trace(
            plgo.Scatter(
                x=np.arange(len(chip_history)) + 1,
                y=chip_history,
                mode="lines",
                name=sequential_hand_histories.get_name(),
                hovertemplate=lang
                << f"{THIS_TRKEY_PREFIX}.hovertemplates.chip_histories",
            ),
            row=1,
            col=1,
        )

    # Danger line
    x_danger_line = np.arange(max_hand_lengths) + 1
    danger_func = lambda x: np.maximum(
        np.exp(x / 100.0 * math.log(10)) * 1.4e-2, 1.0 / 3
    )
    COLOR_DANGER_LINE = "rgba(33,33,33,0.33)"
    figure.add_trace(
        plgo.Scatter(
            x=x_danger_line,
            y=danger_func(x_danger_line),
            mode="lines",
            line={"dash": "dash", "color": COLOR_DANGER_LINE},
            name=lang << f"{THIS_TRKEY_PREFIX}.names.danger_line",
            hoverinfo="none",
        ),
        row=1,
        col=1,
    )
    DANGER_ANNOTATION_X = 0.75 * max_hand_lengths
    figure.add_annotation(
        x=DANGER_ANNOTATION_X,
        y=math.log10(danger_func(DANGER_ANNOTATION_X)),
        text=lang << f"{THIS_TRKEY_PREFIX}.names.danger_line",
        showarrow=False,
        font={"size": 24, "color": COLOR_DANGER_LINE, "weight": 1000},
        yanchor="top",
        xanchor="left",
        row=1,
        col=1,
    )

    # Died at histogram
    COLOR_DIED_AT = "rgba(38,210,87,0.9)"
    died_at_xbins = np.arange(max_hand_lengths) + 1
    died_at_histogram_y, died_at_histogram_x = np.histogram(
        died_at, bins=died_at_xbins, density=True
    )
    died_at_histogram_y = 1.0 - died_at_histogram_y.cumsum() * (
        len(died_at) / total_tourneys
    )  # Tourneys with 1st are excluded from `died_at`
    figure.add_trace(
        plgo.Bar(
            x=died_at_histogram_x,
            y=died_at_histogram_y,
            marker_color=COLOR_DIED_AT,
            name=lang << f"{THIS_TRKEY_PREFIX}.names.died_at",
            hovertemplate=lang << f"{THIS_TRKEY_PREFIX}.hovertemplates.died_at",
        ),
        row=2,
        col=1,
    )

    # Died at average
    COLOR_DIED_AT_AVG = "rgba(12,17,166,0.7)"
    died_at_avg = np.mean(died_at)
    figure.add_vline(
        x=died_at_avg,
        line_dash="dash",
        line_color=COLOR_DIED_AT_AVG,
        label={
            "text": (lang << f"{THIS_TRKEY_PREFIX}.names.died_at_avg") % (died_at_avg,),
            "font": {"color": COLOR_DIED_AT_AVG, "weight": 1000},
            "textposition": "end",
            "xanchor": "right",
        },
        row=2,
        col=1,
    )

    # Death threshold
    COLOR_DEATH_THRESHOLD = "rgba(222,118,177,0.9)"
    sorted_death_thresholds = sorted(death_thresholds, reverse=True)
    figure.add_trace(
        plgo.Bar(
            x=["%2gx" % (threshold,) for threshold in sorted_death_thresholds],
            y=[
                death_threshold_count[th] / total_tourneys
                for th in sorted_death_thresholds
            ],
            marker_color=COLOR_DEATH_THRESHOLD,
            name=lang << f"{THIS_TRKEY_PREFIX}.names.death_threshold",
            hovertemplate=lang << f"{THIS_TRKEY_PREFIX}.hovertemplates.death_threshold",
        ),
        row=2,
        col=2,
    )

    # All other settings
    figure.update_layout(
        title=lang << f"{THIS_TRKEY_PREFIX}.title",
        showlegend=False,
    )
    figure.update_xaxes(
        minallowed=0,
        maxallowed=max_hand_lengths + 1,
        title=lang << f"{THIS_TRKEY_PREFIX}.x_axes.chip_histories",
        row=1,
        col=1,
    )
    figure.update_yaxes(
        minallowed=-2.25,
        type="log",
        title=lang << f"{THIS_TRKEY_PREFIX}.y_axes.chip_histories",
        row=1,
        col=1,
    )
    figure.update_xaxes(
        minallowed=1,
        maxallowed=max_hand_lengths + 1,
        title=lang << f"{THIS_TRKEY_PREFIX}.x_axes.died_at",
        row=2,
        col=1,
    )
    figure.update_yaxes(
        minallowed=0.0,
        maxallowed=1.0,
        title=lang << f"{THIS_TRKEY_PREFIX}.y_axes.died_at",
        tickformat=".2%",
        row=2,
        col=1,
    )
    figure.update_xaxes(
        title=lang << f"{THIS_TRKEY_PREFIX}.x_axes.death_threshold",
        row=2,
        col=2,
    )
    figure.update_yaxes(
        minallowed=0.0,
        maxallowed=1.0,
        title=lang << f"{THIS_TRKEY_PREFIX}.y_axes.death_threshold",
        tickformat=".2%",
        row=2,
        col=2,
    )
    return figure


def get_hand_usage_heatmaps(
    hand_histories: list[HandHistory],
    lang: Language,
) -> plgo.Figure | None:
    """
    Get hand usage heatmaps.
    """
    TRKEY_PREFIX: typing.Final[str] = "plot.hand_history.hand_usages"

    figure = make_subplots(
        3,
        3,
        specs=[[{"rowspan": 1, "colspan": 1} for _ in range(3)] for _ in range(3)],
        vertical_spacing=0.05,
        horizontal_spacing=0.02,
    )
    matrices = {
        offset: [
            [{"prefold": 0, "total_dealt": 0} for _ in range(13)] for _ in range(13)
        ]
        for offset in (-5, -4, -3, -2, -1, 0, 1, 2, None)
    }
    matrices[-6] = matrices[-5]

    def get_idx2d(hand: tuple[Card, Card]) -> tuple[int, int]:
        """
        Get 2D matrix index from given card.
        """
        is_suited = hand[0].shape == hand[1].shape
        num_big = int(hand[0].number)
        num_small = int(hand[1].number)
        num_big, num_small = max(num_big, num_small), min(num_big, num_small)
        if is_suited:
            # Suited: big row, small column
            return -2 + num_big, 14 - num_small
        else:
            # Offsuited / pocket: big column, small row
            return (-2 + num_small, 14 - num_big)

    def idx2d_to_str(idx2d: tuple[int, int]) -> str:
        x, y = idx2d
        desired_number_x = x + 2
        desired_number_y = -y + 14
        is_suited = desired_number_x > desired_number_y
        cardnum_x = next(
            cardnum
            for cardnum in CardNumber.all_py()
            if int(cardnum) == desired_number_x
        )
        cardnum_y = next(
            cardnum
            for cardnum in CardNumber.all_py()
            if int(cardnum) == desired_number_y
        )
        if cardnum_x == cardnum_y:
            return str(cardnum_x) + str(cardnum_y)
        elif is_suited:
            return str(cardnum_x) + str(cardnum_y) + "s"
        else:
            return str(cardnum_y) + str(cardnum_x) + "o"

    def increment(
        matrix_element: dict[str, int],
        prefolded: bool,
    ) -> None:
        """
        Helper function to apply changes on individual matrix element.
        """
        matrix_element["total_dealt"] += 1
        if prefolded:
            matrix_element["prefold"] += 1

    def aggregate_vpip(matrix: list[list[dict]]) -> float:
        """
        Aggregate VPIP.
        """
        prefold_total: int = 0
        total_dealt: int = 0
        for row in matrix:
            for element in row:
                prefold_total += element["prefold"]
                total_dealt += element["total_dealt"]
        return 1 - prefold_total / total_dealt if total_dealt > 0 else float("nan")

    for hand_history in hand_histories:
        button_offset = hand_history.get_offset_from_button("Hero")
        if button_offset not in matrices:
            warnings.warn(
                "Button offset %d is not available; Hand ID %s from %s (%s)"
                % (
                    button_offset,
                    hand_history.id,
                    hand_history.tournament_name,
                    hand_history.dt,
                )
            )
            continue

        hero_hand = hand_history.known_cards["Hero"]
        idx_x, idx_y = get_idx2d(hero_hand)
        prefolded = hand_history.preflop_passive_folded("Hero")
        # was_best_hand = hand_history.was_best_hand("Hero")
        # won_showdown = 1.0 / (was_best_hand + 1) if was_best_hand >= 0 else 0.0
        if prefolded is not None:
            increment(matrices[button_offset][idx_x][idx_y], prefolded)
            increment(matrices[None][idx_x][idx_y], prefolded)

    del matrices[-6]

    heatmaps = {
        offset: [
            [1 - col["prefold"] / col["total_dealt"] for col in row] for row in matrix
        ]
        for offset, matrix in matrices.items()
    }
    texts = [[idx2d_to_str((i, j)) for j in range(13)] for i in range(13)]

    for btn_offset, fig_x, fig_y, pos_name in (  # type: ignore[assignment]
        (-5, 0, 0, "UTG"),
        (-4, 0, 1, "UTG1"),
        (-3, 0, 2, "MP"),
        (-2, 1, 0, "MP1"),
        (-1, 1, 1, "CO"),
        (0, 1, 2, "BTN"),
        (1, 2, 0, "SB"),
        (2, 2, 1, "BB"),
        (None, 2, 2, "all_positions"),
    ):
        this_title = (lang << f"{TRKEY_PREFIX}.positions.{pos_name}") + (
            " (VPIP %.2f%%)" % (100 * aggregate_vpip(matrices[btn_offset]),)
        )
        figure.add_trace(
            plgo.Heatmap(
                z=heatmaps[btn_offset],
                text=texts,
                name=this_title,
                texttemplate="%{text}",
                showscale=False,
                hovertemplate=lang << f"{TRKEY_PREFIX}.hovertemplate",
            ),
            row=fig_x + 1,
            col=fig_y + 1,
        )
        figure.update_xaxes(
            row=fig_x + 1,
            col=fig_y + 1,
            title=this_title,
        )

    figure.update_layout(
        title=lang << f"{TRKEY_PREFIX}.title",
        xaxis_showgrid=False,
        yaxis_showgrid=False,
    )
    figure.update_xaxes(showticklabels=False)
    figure.update_yaxes(showticklabels=False)
    return figure


def plot_hand_histories(
    nickname: str,
    hand_histories: typing.Iterable[HandHistory],
    lang: Language = Language.ENGLISH,
    *,
    max_sampling: int | None = None,
    sort_key: typing.Callable[[HandHistory], typing.Any] = (lambda h: h.sorting_key()),
    toggling_masks: typing.Iterable[bool] = (),
) -> str:
    """
    Generate hand history analysis HTML report.
    """
    iter_masks = iter(toggling_masks or infinite_iter(default=True))
    hand_histories = sorted(hand_histories, key=sort_key)
    figures: list[plgo.Figure | None] = [
        (
            get_all_in_equity_histogram(
                hand_histories,
                lang,
                max_length=max_sampling if max_sampling else -1,
            )
            if next(iter_masks)
            else None
        ),
        get_chip_histories(hand_histories, lang) if next(iter_masks) else None,
        get_hand_usage_heatmaps(hand_histories, lang) if next(iter_masks) else None,
    ]

    plotlyjs_iter = infinite_iter("cdn", default=False)
    return BASE_HTML_FRAME.format(
        title=(lang << "plot.hand_history.title") % (nickname,),
        summary=markdown("No summary yet.."),
        plots=HORIZONTAL_PLOT_DIVIDER.join(
            fig.to_html(include_plotlyjs=next(plotlyjs_iter), full_html=False)
            + markdown(HAND_HISTORY_PLOT_DOCUMENTATIONS[i][lang])
            for i, fig in enumerate(figures)
            if fig is not None
        ),
        software_credits=get_software_credits(lang),
    )
