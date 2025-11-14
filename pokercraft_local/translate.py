import json
import typing
from enum import Enum
from pathlib import Path

from .constants import POKERCRAFT_AHREF

RAW_TRANSLATION_MAPTYPE: typing.TypeAlias = dict["Language", str]
NESTED_MAPPING: typing.TypeAlias = dict[
    str, typing.Union[RAW_TRANSLATION_MAPTYPE, "NESTED_MAPPING"]
]

DEFAULT_TRANSLATION_JSON_PATH = Path(__file__).parent / "translation_values.json"


def load_language_json(
    path: Path = DEFAULT_TRANSLATION_JSON_PATH,
) -> dict[str, NESTED_MAPPING]:
    """
    Load the language JSON file.
    """
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


LANGUAGE_MAP: typing.Final[dict[str, NESTED_MAPPING]] = load_language_json()


class Language(Enum):
    ENGLISH = "en"
    KOREAN = "ko"

    def __lshift__(self, entire_key: str) -> str:
        """
        Perform a translation on this text.
        If given translation is not found, raises `KeyError`.
        """
        # lang << "text"
        keys = entire_key.split(".")
        lang_map = LANGUAGE_MAP
        for key in keys:
            lang_map = lang_map[key]  # type: ignore[assignment]
        if self.value in lang_map and isinstance(
            translation := lang_map[self.value], str
        ):
            return translation
        elif "en" in lang_map and isinstance(translation := lang_map["en"], str):
            return translation
        else:
            raise KeyError(f"Translation for '{entire_key}' not found.")

    def get_gui_select_text(self) -> str:
        """
        Get text for GUI language selection.
        """
        match self:
            case Language.ENGLISH:
                return "English"
            case Language.KOREAN:
                return "한국어 (Korean)"
            case _:
                raise ValueError("Unsupported language")


def generate_summary_table_md(lang: Language, *kvs: tuple[str, typing.Any]) -> str:
    """
    Generate summary in the markdown.
    """
    head = (
        f"| {lang << 'plot.tourney_summary.head_summaries.category'}"
        f" | {lang << 'plot.tourney_summary.head_summaries.value'} |"
    )
    hr = "| --- | --- |"
    rows = "\n".join(f"| {lang << k} | {v} |" for k, v in kvs)
    return "\n".join((head, hr, rows))


TOURNEY_SUMMARY_PLOT_DOCUMENTATIONS: typing.Final[list[dict[Language, str]]] = [
    # Historical Performances
    {
        Language.ENGLISH: """
You can see 3 line graphs in this section;

1. Net profit, net rake, and ideal profit(when you do not pay the rake)
2. "Profitable ratio", including moving average;
    Downloaded data from the Pokercraft does not give you
    an information of ITM, instead it lets you know
    amount of your prizes(including bounties).
    Because of this, if you got enough bounty(more than buy-in)
    from some tournaments, then the system classifies that as "profitable".
    This value is slightly higher than actual ITM ratio.
3. Average buy in of your tournaments, including moving average.
    Note that buy-in is log-scaled.

*Creator's comment: This section is classic and probably the
most fundamental graph for all tournament grinders.
Note that the Pokercraft does not show the true PnL,
which means it does not correctly mirror the rake.*
""",
        Language.KOREAN: """
이 섹션에서는 3개의 선 그래프를 볼 수 있습니다;

1. 순수익, 지불한 레이크, 이상적인 수익(레이크를 지불하지 않았을 때)
2. "수익 보는 비율", 이동평균 포함;
    Pokercraft에서 다운받는 데이터는 ITM 정보를 제공하지 않고,
    대신에 당신의 상금(바운티 포함)만 알려줍니다.
    이 때문에, 어떤 토너에서 충분한 바운티(바이인 이상)를 받았다면,
    시스템은 해당 토너먼트를 "수익적"으로 분류합니다.
    그렇기 때문에 이 값은 실제 ITM 비율보다 약간 높습니다.
3. 당신의 토너먼트의 평균 바이인, 이동평균 포함.
    바이인 가격은 로그 스케일로 표시됩니다.

*제작자의 코멘트: 이 섹션은 아마도 토너먼트 그라인더들에게
가장 기본적인 그래프를 제공하는 섹션일 것입니다.
Pokercraft는 레이크를 제대로 반영하지 않음으로써
진짜 PnL을 그래프 상에서 보여주지 않습니다.*
""",
    },
    # Relative prize returns
    {
        Language.ENGLISH: """
RRE(Relative Returns with re-Entries) is a relative return of your investment
for individual tournament, considering re-entries.
For example, if you got $30 from a tournament with
$10 buy-in and you made 1 re-entry, then RRE = 30/20 = 1.5.

You can see 3 plots in this section;

1. RRE by buy-in amount (Heatmap)
2. RRE by total entries (Heatmap)
3. RRE by time of day (Heatmap, your local timezone is applied)
4. Marginal distribution for each RRE range (Horizontal bar chart)

Note that the Y axis and some plots's X axes are in log2 scale,
because these metrics have wide range of values so it makes
no sense to display in linear scale.

*Creator's comment: This section shows you are strong/weak in
which buy-in and which entry sizes, and also how much of
your profits are from in which RRE range.*
""",
        Language.KOREAN: """
RRE(리엔트리를 고려한 상대적인 상금 리턴)은 당신의 투자에 대한 상대적인 수익입니다.
예를 들어서, 10불짜리 토너를 2번 바인해서 30불을 얻었다면, RRE = 30/20 = 1.5입니다.

당신은 이 섹션에서 3개의 그래프를 볼 수 있습니다;

1. 바인 금액별 RRE (히트맵)
2. 총 엔트리수별 RRE (히트맵)
3. 시간대별 RRE (히트맵, 당신의 시간대가 적용됩니다)
4. 각 RRE 구간별 누적 분포 (수평 막대 그래프)

이 그래프들은 Y축과 몇몇 X축들이 log2(로그) 스케일로 표시됩니다.
왜냐하면 이 메트릭들은 값의 범위가 넓기 때문에
선형(linear) 스케일로 표시하는 것은 의미가 없기 때문입니다.

*제작자의 코멘트: 이 섹션은 당신이 어떤 바인 금액과 엔트리수에서 강하고 약한지,
그리고 당신의 수익이 어느 RRE 구간에서 얼마나 발생하는지를 보여줍니다.*
""",
    },
    # Bankroll Analysis
    {
        Language.ENGLISH: """
This section shows simplified result of the bankroll analysis simulations.
The exact procedure of the simulation is as follows;

- From your Pokercraft data, gather `RRs` of every tournament results.
    Unlike `RRE` plots, you get multiple values from single tournament
    if you did re-entries; For example, if you got $30 from a tournament
    with $10 buy-in and you made 1 re-entry, then `RRs = [-1.0, 2.0]`.
- Assuming you are continuously playing tournaments of 1 dollar buy-in,
    where each tournament yields one of all `RRs` as return,
    in uniform and independent manner.
- For single simulation, run `max(10 * YOUR_TOURNAMENT_COUNT, 4e4)` times
    and see if you are bankrupted or not.
- Run 25k parellel simulations.

Then each individual simulation yields one of two results;

- *"Survived"*; The final capital is non-zero
- *"Bankruptcy"*; It bankrupted before reaching maximum iteration

So the survival rate is basically likelihood of your survival when
you start playing tournaments with specific BI.

*Creator's comment: I use `RRs` instead of `RRE` because
`RRE` assumes you will end getting prize, but in reality
you may not be able to get prize even after multiple re-entries.
Also, I personally think 200 BI is the optimal bankroll
for tournament grinders, especially if you play massive tournaments
with thousands of participants.*
""",
        Language.KOREAN: """
이 섹션은 뱅크롤 분석 시뮬레이션의 결과를 간략하게 보여줍니다.
시뮬레이션의 정확한 절차는 다음과 같습니다;

- 당신의 Pokercraft 데이터로부터, 각 토너먼트 결과의 `RRs`를 모읍니다.
    `RRE` 그래프와는 다르게, `RRs`는 한 토너에서 여러 개의 값들을 반환할 수 있습니다;
    예를 들어 30달러 상금을 10달러짜리 토너에서 2번 바인해서 받았다면,
    `RRs = [-1.0, 2.0]` 입니다.
- 1달러 바인 금액의 토너먼트를 연속적으로 플레이한다고 가정하고,
    각 토너먼트의 상금은 과거 `RRs` 값들 중 하나를 랜덤하게 리턴합니다.
- 단일 시뮬레이션에서는 `max(10 * 당신의 토너먼트 수, 4e4)`번
    시뮬레이션을 돌리고, 파산했는지 안했는지를 확인합니다.
- 25,000개의 병렬 시뮬레이션을 돌립니다.

그러면 각각의 시뮬레이션은 두 가지 결과 중 하나를 보여줍니다;

- *"생존"*; 최종 잔고가 0이 아님
- *"파산"*; 시뮬레이션의 끝에 도달하기 전에 파산함

그러므로 생존 확률은 특정 바인 금액으로 토너먼트를 시작했을 때 당신이 생존할 확률을 의미합니다.

*제작자의 코멘트: `RRE` 값의 문제는 리바인을 계속하다보면 상금을 얻는다는
가정을 가지고 있는데, 실제로는 그렇지 않을 수 있으므로,
저는 뱅크롤 시뮬레이션에서 `RRs`를 대신 사용하기로 했습니다.
또한, 저는 개인적으로 200 BI가 대규모 토너먼트를
플레이하는 토너먼트 그라인더들에게 최적의 뱅크롤이라고 생각합니다.*
""",
    },
    # Prize Pie Chart
    {
        Language.ENGLISH: """
This section shows how much of your total prizes are from specific tournaments.

In main pie chart, since there might be too much number of slices,
only tournaments gave you more than 1% of your total prizes are shown,
and the rest are grouped as "Others", which is the biggest separated slice.

The second pie chart shows your prizes by weekday.
In most cases, weekend tournaments are usually more profitable than weekdays.

*Creator's comment: You can see if you ignore small prizes, then lots of portion
of your prizes are gone. In a long term, there is no such thing like "one hit wonder".*
""",
        Language.KOREAN: """
이 섹션은 당신의 총 상금 중에서 특정 토너먼트에서 얼마나 상금을 받았는지를 보여줍니다.

1번째 메인 차트에서는 너무 많은 조각이 있을 수 있기 때문에 총 상금의 1% 이상을 받은 토너만을 보여주고,
나머지는 "기타"로 묶어서 표시합니다. "기타"는 가장 큰 조각으로 분리됩니다.

두번째 파이 차트는 요일별 상금을 보여줍니다.
대부분의 경우, 주말 토너먼트가 평일보다 더 수익성이 높습니다.

*제작자의 코멘트: 작은 상금을 무시한다면, 당신의 상금의 상당 부분이 사라집니다.
장기적으로, "한방찍기"란 없다는 것을 이 섹션에서 알 수 있습니다.*
""",
    },
    # Rank Profit Chart
    {
        Language.ENGLISH: """
This section shows how RR grows over your rank percentile.
RR is calculated as prize divided by buy-in(re-entries are not considered),
and PERR is calculated as RR multiplied by rank percentile.

The RR trendline is a line for RR and rank percentile generated by
[linear regression](https://en.wikipedia.org/wiki/Linear_regression).
It does not trained on low ranked results(worse than 12.5%),
because there are way too many noises in such area.

*Creator's comment:
You can see RR and Rank Percentile are having roughly linear relationship.
You can check PERR of some important points to know
how much you should frequently achieve such deep runs,
and also how hard to make profits in tournaments in long term.
Some tournaments like `Flip & Go (Go Stage)` or Day1 tourneys
may make a noise due to how GGPoker gives an incomplete data.*
""",
        Language.KOREAN: """
이 섹션은 당신의 토너 순위 백분위에 따른 RR의 변화를 보여줍니다.
RR은 상금을 바인비로 나눈 값이고(리엔트리 고려 안함),
PERR은 RR을 순위 백분위로 곱한 값입니다.

RR 추세선은 [Linear Regression](https://en.wikipedia.org/wiki/Linear_regression)
을 통하여 만들어진 RR과 순위 백분위의 선형 회귀선입니다.
상위 12.5% 안에 들지 못한 결과들은 너무 많은 노이즈가 있기 때문에
해당 토너먼트들은 추세선 데이터로 트레이닝되지 않았습니다.

*제작자의 코멘트:
RR과 순위 백분위는 대략적으로 서로 비례함을 확인할 수 있습니다.
당신은 주요 딥런한 토너들의 PERR을 확인하여 얼마나 자주
그런 딥런을 만들어야 수익성이 생기는 지, 그리고 토너먼트에서
장기적으로 수익을 챙기는 것이 왜 어려운 지를 확인할 수 있습니다.
`플립앤고`나 Day1 같은 토너들이 데이터에 노이즈를 줄 수 있는데,
그것은 GGPoker가 데이터를 불완전하게 제공하기 때문입니다.*
""",
    },
]

HAND_HISTORY_PLOT_DOCUMENTATIONS: typing.Final[list[dict[Language, str]]] = [
    # All-in Equity Analysis
    {
        Language.ENGLISH: """
This section shows analysis of your all-in equity results in two manners;

1. Bidirectional count histograms
2. Winning/losing rate bar chart

*Creator's comment: This section makes you able to compare
your actual results and expected equities in all-in situations.
Many people think they are "unlucky" in general.
But in reality, it converges to actual equity in long term.*
""",
        Language.KOREAN: """
이 섹션은 당신의 올인 에퀴티 분석 결과를 두 가지 방식으로 보여줍니다;

1. 양방향 카운트 히스토그램
2. 승률 바 차트

*제작자의 코멘트: 이 섹션은 당신이 실제 올인 상황에서 얼마나
에퀴티에 가까운 결과를 냈는지를 비교할 수 있게 해줍니다.
많은 사람들이 자신이 전반적으로 "운이 없다"고 생각합니다.
하지만 실제로 장기적으로는 올인 결과는 에퀴티에 수렴하게 됩니다.*
""",
    },
    {
        Language.ENGLISH: """
This section shows analysis of your chip histories in tournaments.

1. Chip stack over time (Line chart)
2. Inversed cumulative histogram of number of hands played
3. Death Threshold histogram;
    The ratio of non-increasing death after you fall below
    specific portion of your previous peak stack.

*Creator's comment:
This section shows how your chip stack evolves over time.
Most of the time, you die before playing 100 hands.
Also surprisingly, according to the Death Threshold chart,
if your stack becomes less than 25% of previous peak,
then you are very likely to be eliminated soon.*
""",
        Language.KOREAN: """
이 섹션은 토너먼트에서 당신의 칩 히스토리 분석 결과를 보여줍니다.

1. 시간에 따른 칩 스택 (라인 차트)
2. 플레이한 핸드 수의 역누적 히스토그램
3. 사망 임계값 히스토그램;
    이전 최고 스택의 특정 비율 이하로 떨어진 후에
    계속 칩을 잃기만 하면서 사망할 확률입니다.

*제작자의 코멘트:
이 섹션은 시간에 따라 당신의 칩 스택이 어떻게 변화하는지를 보여줍니다.
대부분의 경우, 당신은 100 핸드 전에 탈락합니다.
또한 놀랍게도, 사망 임계값 차트에 따르면, 이전 최고 스택의 25% 이하로 스택이 떨어지면
곧 탈락할 가능성이 매우 높다는 것을 알 수 있습니다.*
""",
    },
    {
        Language.ENGLISH: """
This section shows your hand usage statistics by table positions.
The VPIP is counted by "number of non-folds on preflop" /
"number of cards dealt" with some exception handlings.
(Raising and then folding to 3bet/4bet also increases VPIP here.)

*Creator's comment:
This section helps you to analyze how your range becomes different by positions.
For me, initially I was surprised to see my opening ranges were very static except BB.*
""",
        Language.KOREAN: """
이 섹션은 테이블 포지션별 당신의 핸드 사용 통계를 보여줍니다.
VPIP는 "프리플랍에 폴드하지 않은 횟수" / "카드를 딜링받은 횟수"로 계산됩니다.
(몇몇 예외처리가 존재하며, 레이징 후 3벳/4벳에 폴드하는 경우 등에는 VPIP가 증가합니다.)

*제작자의 코멘트:
이 섹션은 당신의 레인지가 포지션에 따라 어떻게 달라지는지를 보여줍니다.
저의 경우, 제 레인지가 빅블을 제외하고 포지션에 따라 크게 달라지지 않아서 놀랐습니다.*
""",
    },
]


def get_software_credits(lang: Language) -> str:
    """
    Get software credits.
    """
    return (lang << "plot.software_credits") % (POKERCRAFT_AHREF,)


def format_dollar(value: float | int) -> str:
    """
    Format a dollar value to string with two decimal places.
    """
    if value >= 0:
        return "$%.2f" % value
    else:
        return "-$%.2f" % -value


def format_percent(value: float | int) -> str:
    """
    Format a percentage value to string with two decimal places.
    """
    return "%.2f%%" % (value * 100,)
