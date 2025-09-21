import logging
import time
import typing

P = typing.ParamSpec("P")
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
