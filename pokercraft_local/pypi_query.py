import typing

import requests

from .constants import VERSION

VERSION_TRIPLE = tuple[int, int, int]


def extract_version(version_str: str) -> VERSION_TRIPLE:
    """
    Extract version from a string.
    """
    return tuple(map(int, version_str.split(".")))  # type: ignore[return-value]


VERSION_EXTRACTED: typing.Final[VERSION_TRIPLE] = extract_version(VERSION)


def get_library_versions(
    library_name: str = "pokercraft-local",
) -> list[VERSION_TRIPLE]:
    """
    Get list of versions of a library from PyPI.
    """
    with requests.Session() as request:
        response = request.get(
            url="https://pypi.org/pypi/{library_name}/json".format(
                library_name=library_name
            )
        )
        result: list[VERSION_TRIPLE] = []
        for version_string in response.json()["releases"].keys():
            try:
                version = extract_version(version_string)
            except (ValueError, TypeError):
                continue
            else:
                result.append(version)
    return result
