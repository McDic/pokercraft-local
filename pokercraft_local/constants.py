import re
import typing

VERSION: typing.Final[str] = "2.2.0"

POKERCRAFT_AHREF: typing.Final[str] = (
    '<a href="https://github.com/McDic/pokercraft-local/">'
    "Pokercraft Local</a> v{version}"
).format(version=VERSION)

HORIZONTAL_PLOT_DIVIDER: typing.Final[str] = "<br><hr><br>"

# fmt: off
BASE_HTML_FRAME: typing.Final[
    str
] = """
<html>
<head><meta charset="utf-8" /></head>
<body>
<h1>{title}</h1>
<hr>
<br>
{summary}
<br>
<hr>
<br>
{plots}
<br>
<hr>
<h1>{software_credits}</h1>
</body>
</html>
"""
# fmt: on

DEFAULT_WINDOW_SIZES: tuple[int, ...] = (50, 100, 200, 400, 800)

STR_PATTERN = re.Pattern[str]
ANY_INT: STR_PATTERN = re.compile(r"\d+")
ANY_MONEY: STR_PATTERN = re.compile(r"[\$¥฿₫₱₩]\d(\d|(,\d))*(\.[\d,]+)?")

HAND_STAGE_TYPE: typing.TypeAlias = typing.Literal["preflop", "flop", "turn", "river"]
