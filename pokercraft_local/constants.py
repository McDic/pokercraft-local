import re
import typing

VERSION = "1.1.3"

BASE_HTML_FRAME: typing.Final[
    str
] = """
<html>
<head><meta charset="utf-8" /></head>
<body>
<h1>%s's realistic tournament performance on GGNetwork</h1>
<br>
%s
</body>
<br>
<h1>Generated by McDic's tool v{version}</h1>
</html>
""".format(
    version=VERSION
)

DEFAULT_WINDOW_SIZES: tuple[int, ...] = (50, 100, 200, 400, 800)

STR_PATTERN = re.Pattern[str]
ANY_INT: STR_PATTERN = re.compile(r"\d+")
ANY_MONEY: STR_PATTERN = re.compile(r"[\$¥฿₫₱₩]\d(\d|(,\d))*(\.[\d,]+)?")
