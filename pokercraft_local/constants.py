import re
import typing

VERSION: typing.Final[str] = "1.7.1"

POKERCRAFT_AHREF: typing.Final[str] = (
    '<a href="https://github.com/McDic/pokercraft-local/">'
    "Pokercraft Local v{version}</a>"
).format(version=VERSION)

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
