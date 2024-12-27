import typing
from enum import Enum

from .constants import POKERCRAFT_AHREF


class Language(Enum):
    ENGLISH = "en"
    KOREAN = "ko"


TITLE_FRAME: typing.Final[str] = "%s's realistic tournament performance on GGNetwork"
SOFTWARE_CREDITS_FRAME: typing.Final[str] = "Generated by %s provided by McDic"
RR_PLOT_TITLE: typing.Final[
    str
] = "Relative Prize Returns (RR = Prize / BuyIn / (1 + ReEntries))"
BANKROLL_PLOT_TITLE: typing.Final[str] = (
    "Bankroll Analysis with Monte-Carlo Simulation "
    "based on RR (Only if your performance is winning)"
)
GUI_EXPORTED_SUCCESS: typing.Final[str] = (
    "Exported CSV and plot successfully;"
    "Please check {csv_path} and {plot_path} in {output_dir}."
)

# fmt: off
PRIZE_PIE_CHART_TITLE: typing.Final[
    str
] = "Your Prizes (Small prizes are grouped as 'Others')"
# fmt: on

# fmt: off
TRANSLATION: typing.Final[dict[Language, dict[str, str]]] = {
    Language.KOREAN: {
        # Title and credits
        TITLE_FRAME: "%s님의 GGNetwork 토너먼트에서의 현실적인 성적",
        SOFTWARE_CREDITS_FRAME: "McDic이 만든 %s에 의해 생성됨",
        # GUI
        "Select Language": "언어 선택",
        "Data Directory: %s": "선택된 데이터 폴더: %s",
        "Choose Data Directory": "데이터 폴더 선택",
        "Output Directory: %s": "분석파일 내보낼 폴더: %s",
        "Choose Output Directory": "분석파일 내보낼 폴더 선택",
        "Your GG nickname": "당신의 GG 닉네임",
        GUI_EXPORTED_SUCCESS: (
            "CSV와 그래프 파일이 성공적으로 생성되었습니다. "
            "{output_dir} 안에 있는 {csv_path}와 {plot_path}를 확인해주세요."
        ),
        "Nickname is not given.": "GG 닉네임이 입력되지 않았습니다.",
        "Data directory is not selected or invalid.": "데이터 폴더가 선택되지 않았거나 올바르지 않습니다.",
        "Output directory is not selected or invalid.": \
        "분석파일 내보낼 폴더가 선택되지 않았거나 올바르지 않습니다.",
        "Include Freerolls": "프리롤 포함하기",
        "Export plot and CSV data (Enter)": "CSV랑 분석 파일 생성하기 (Enter 키)",
        # Historical Performance
        "Historical Performance": "과거 성적",
        "Tournament Count": "토너먼트 참가 횟수",
        "Net Profit & Rake": "순수익 & 레이크",
        "Profitable Ratio": "수익 보는 비율",
        "Average Buy In": "평균 바이인 금액",
        "Profits & Rakes": "수익 & 레이크",
        "Net Profit": "순수익 (레이크 고려)",
        "Net Rake": "지불한 레이크",
        "Ideal Profit w.o. Rake": "레이크 없을 때 이상적인 수익",
        "Since 0": "전체 기준",
        "Recent %d": "최근 %d개 토너 기준",
        "Break-even": "멘징 지점",
        "Micro / Low": "마이크로 / 로우",
        "Low / Mid": "로우 / 미들",
        "Mid / High": "미들 / 하이롤러",
        # Relative Prize Returns
        RR_PLOT_TITLE: "바인 금액 대비 상대적 리턴 (RR = 상금 / 바이인 / (1 + 리엔트리))",
        "By Buy In Amount": "바인 금액별 분포",
        "By Total Entries": "엔트리수별 분포",
        "Nonzero prize only": "상금이 있는 토너만 포함됨",
        "Marginal RR Distribution": "누적 RR 분포",
        "Relative Prize Return (RR)": "바인 금액 대비 상대적 리턴 (RR)",
        "RR by Buy In": "바인 금액별 RR",
        "RR by Entries": "엔트리수별 RR",
        "Got %sx profit in this region": "이 구간에서 %s배 수익을 냄",
        "Buy In": "바인금액",
        "Total Entries": "총 엔트리 수",
        "Marginal RR": "누적 RR",
        "Break-even: 1x Profit": "멘징 지점: 1배 수익",
        "Good run: 4x Profit": "좋은 성적: 4배 수익",
        "Deep run: 32x Profit": "딥런: 32배 수익",
        # Bankroll Analysis
        BANKROLL_PLOT_TITLE: "RR 기반 몬테카를로 시뮬레이션을 통한 뱅크롤 분석 (당신이 위닝러인 경우에만)",
        "Metric": "메트릭",
        "Initial Capital": "초기 자본",
        "Bankruptcy Rate": "파산 확률",
        "Survival Rate": "생존 확률",
        "%.1f Buy-ins": "%.1f 바이인",
        # Prize Pie Chart
        PRIZE_PIE_CHART_TITLE: "당신의 상금 분포 (작은 상금은 '기타'로 분류됨)",
        "Others": "기타",
    },
}
# fmt: on

PLOT_DOCUMENTATIONS: typing.Final[list[dict[Language, str]]] = [
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
RR(Relative Prize Returns) is a relative return of your investment
for individual tournament. For example, if you got $30 from a tournament
with $10 buy-in and you made 1 re-entry, then RR is 30/20 = 1.5.

You can see 3 plots in this section;

1. RR by buy-in amount (Heatmap)
2. RR by total entries (Heatmap)
3. Marginal distribution for each RR range (Horizontal bar chart)

Note that X and Y axes are in log2 scale in these plots,
because these metrics have wide range of values so it makes
no sense to display in linear scale.

*Creator's comment: This section shows you are strong/weak in
which buy-in and which entry sizes, and also how much of
your profits are from in which RR range.*
""",
        Language.KOREAN: """
RR(상대적인 상금 리턴)은 당신의 투자에 대한 상대적인 수익입니다.
예를 들어서, 10불짜리 토너를 2번 바인해서 30불을 얻었다면, RR은 30/20 = 1.5입니다.

당신은 이 섹션에서 3개의 그래프를 볼 수 있습니다;

1. 바인 금액별 RR (히트맵)
2. 총 엔트리수별 RR (히트맵)
3. 각 RR 구간별 누적 분포 (수평 막대 그래프)

이 그래프들은 X와 Y축이 로그(log2) 스케일로 표시됩니다.
왜냐하면 이 메트릭들은 값의 범위가 넓기 때문에
선형(linear) 스케일로 표시하는 것은 의미가 없기 때문입니다.

*제작자의 코멘트: 이 섹션은 당신이 어떤 바인 금액과 엔트리수에서 강하고 약한지,
그리고 당신의 수익이 어느 RR 구간에서 얼마나 발생하는지를 보여줍니다.*
""",
    },
    # Bankroll Analysis
    {
        Language.ENGLISH: """
This section shows simplified result of the bankroll analysis simulations.
The exact procedure of the simulation is as follows;

- From your Pokercraft data, gather `RR-1` of every tournament results.
- Assuming you are continuously playing tournaments of 1 dollar buy-in,
    where each tournament yields one of `RR-1` as return,
    in uniform and independent manner.
- For single simulation, run `max(10 * YOUR_TOURNAMENT_COUNT, 4e4)` times
    and see if you are bankrupted or not.
- Run 25k parellel simulations.

Then each individual simulation yields one of two results;

- *"Profitable"*; The final capital is non-zero
- *"Bankruptcy"*; It bankrupted before reaching maximum iteration

So the survival rate is basically likelihood of your survival when
you start playing tournaments with specific BI.

*Creator's comment: I personally think 200 BI is the optimal bankroll
for tournament grinders, especially if you play massive tournaments
with thousands of participants.*
""",
        Language.KOREAN: """
이 섹션은 뱅크롤 분석 시뮬레이션의 결과를 간략하게 보여줍니다.
시뮬레이션의 정확한 절차는 다음과 같습니다;

- 당신의 Pokercraft 데이터로부터, 각 토너먼트 결과의 `RR-1`을 모읍니다.
- 1달러 바인 금액의 토너먼트를 연속적으로 플레이한다고 가정하고,
    각 토너먼트의 상금은 과거 `RR-1`들 중 하나를 랜덤하게 리턴합니다.
- 단일 시뮬레이션에서는 `max(10 * 당신의 토너먼트 수, 4e4)`번
    시뮬레이션을 돌리고, 파산했는지 안했는지를 확인합니다.
- 25,000개의 병렬 시뮬레이션을 돌립니다.

그러면 각각의 시뮬레이션은 두 가지 결과 중 하나를 보여줍니다;

- *"수익적"*; 최종 잔고가 0이 아님
- *"파산"*; 시뮬레이션의 끝에 도달하기 전에 파산함

그러므로 생존 확률은 특정 바인 금액으로 토너먼트를 시작했을 때 당신이 생존할 확률을 의미합니다.

*제작자의 코멘트: 저는 개인적으로 200바이인이 대규모 토너먼트를
플레이하는 토너먼트 그라인더들에게 최적의 뱅크롤이라고 생각합니다.*
""",
    },
    # Prize Pie Chart
    {
        Language.ENGLISH: """
This section shows how much of your total prizes are from specific tournaments.
Since there might be too much number of slices,
only tournaments gave you more than 0.5% of your total prizes are shown,
and the rest are grouped as "Others", which is the biggest separated slice.

*Creator's comment: You can see if you ignore small prizes, then lots of portion
of your prizes are gone. In a long term, there is no such thing like "one hit wonder".*
""",
        Language.KOREAN: """
이 섹션은 당신의 총 상금 중에서 특정 토너먼트에서 얼마나 상금을 받았는지를 보여줍니다.
너무 많은 조각이 있을 수 있기 때문에 총 상금의 0.5% 이상을 받은 토너만을 보여주고,
나머지는 "기타"로 묶어서 표시합니다. "기타"는 가장 큰 조각으로 분리됩니다.

*제작자의 코멘트: 작은 상금을 무시한다면, 당신의 상금의 상당 부분이 사라집니다.
장기적으로, "한방찍기"란 없다는 것을 이 섹션에서 알 수 있습니다.*
""",
    },
]


def translate_to(lang: Language, text: str) -> str:
    """
    Translate given text to target language.
    """
    if lang is Language.ENGLISH:
        return text
    else:
        return TRANSLATION[lang].get(text, text)


def get_html_title(nickname: str, lang: Language) -> str:
    """
    Get HTML title in the given language.
    """
    return translate_to(lang, TITLE_FRAME) % (nickname,)


def get_software_credits(lang: Language) -> str:
    """
    Get software credits in the given language.
    """
    return translate_to(lang, SOFTWARE_CREDITS_FRAME) % (POKERCRAFT_AHREF,)


def get_translated_column_moving_average(lang: Language, window_size: int) -> str:
    """
    Get translated column name for moving average.
    """
    if window_size == 0:
        return translate_to(lang, "Since 0")
    else:
        return translate_to(lang, "Recent %d") % (window_size,)
