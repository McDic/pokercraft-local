import typing
from enum import Enum

from .constants import SOFTWARE_CREDITS_FRAME, TITLE_FRAME


class Language(Enum):
    ENGLISH = "en"
    KOREAN = "ko"


TRANSLATION: typing.Final[dict[Language, dict[str, str]]] = {
    Language.KOREAN: {
        TITLE_FRAME: "%s님의 GGNetwork 토너먼트에서의 현실적인 성적",
        SOFTWARE_CREDITS_FRAME: "McDic이 만든 %s에 의해 생성됨",
    },
}


def translate_to(target_language: Language, text: str) -> str:
    """
    Translate given text to target language.
    """
    if target_language is Language.ENGLISH:
        return text
    else:
        return TRANSLATION[target_language].get(text, text)
