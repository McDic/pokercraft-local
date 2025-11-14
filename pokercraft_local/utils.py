import logging
import math
import os
import time
import typing
import unittest

T = typing.TypeVar("T")
P = typing.ParamSpec("P")
Sel = typing.TypeVar("Sel")
Ret = typing.TypeVar("Ret")

logger = logging.getLogger("pokercraft_local.utils")


def evaluate_execution_speed(
    func: typing.Callable[P, Ret],
) -> typing.Callable[P, Ret]:
    """
    A decorator to evaluate execution speed of a function.
    This may be inaccurate if either the function is very fast
    or the function is running under concurrent environment.
    """

    def wrapper(*args: P.args, **kwargs: P.kwargs) -> Ret:
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        logger.debug(
            "Execution speed of %s: %.6f secs",
            func.__name__,
            end_time - start_time,
        )
        return result

    return wrapper


def cache_without_hashing_self(
    func: typing.Callable[typing.Concatenate[Sel, P], Ret],
) -> typing.Callable[typing.Concatenate[Sel, P], Ret]:
    """
    A decorator to cache function results without hashing `self`.
    There are some restrictions on using this decorator;

    - The function must be a method of a class.
    - The function must be a pure function (i.e., no side effects).
    - The function must not mutate `self`.
    - The function must not accept unhashable/mutable arguments.
    - The function must return immutable values.

    You can bypass these restrictions if you
    really want, but at your own risk.
    """
    cache: dict[tuple[int, tuple, frozenset], Ret] = {}

    def wrapper(self: Sel, *args: P.args, **kwargs: P.kwargs) -> Ret:
        key = (id(self), args, frozenset(kwargs.items()))
        if key not in cache:
            cache[key] = func(self, *args, **kwargs)
            # For some reasons, some different objects can be created
            # in exact same memory location, therefore `id(self)` is not
            # a safe way to cache. Let me think some more about this.
        return cache[key]

    return wrapper


TCT = typing.TypeVar("TCT", bound=unittest.TestCase)


def mark_expensive_test(
    method: typing.Callable[[TCT], None],
) -> typing.Callable[[TCT], None]:
    """
    A decorator to mark a test as expensive.
    If the test method is marked by this decorator,
    it will be skipped unless the environment variable
    `RUN_EXPENSIVE_TESTS` is set to `true` (case insensitive).
    """
    return unittest.skipIf(
        os.getenv("RUN_EXPENSIVE_TESTS", "false").lower() != "true",
        "Skipping because this is calculation-heavy",
    )(method)


def log2_or_nan(x: float | typing.Any) -> float:
    return math.log2(x) if x > 0 else math.nan


def infinite_iter(*first_values: T, default: T) -> typing.Iterator[T]:
    """
    Returns an endless iterator that yields
    `*first_values, default, default, ...`.
    """
    for element in first_values:
        yield element
    while True:
        yield default
