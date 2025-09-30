import functools
import random
import typing
import unittest

from pokercraft_local.data_structures import GeneralSimpleSegTree

T = typing.TypeVar("T")


class TestGeneralSimpleSegTree(unittest.TestCase):
    """
    Test cases for `GeneralSimpleSegTree`.
    """

    def bruteforce(
        self,
        arr: list[T],
        segtree: GeneralSimpleSegTree[T],
        func: typing.Callable[[T, T], T],
    ) -> None:
        for left in range(len(arr)):
            for right in range(left, len(arr)):
                expected = functools.reduce(func, arr[left : right + 1])
                result = segtree.get(left, right + 1)
                self.assertEqual(
                    expected,
                    result,
                    f"Failed for range [{left}, {right}]: expected {expected}, got {result}",
                )

    def test_base(self) -> None:
        for func in (
            lambda x, y: x + y,
            lambda x, y: min(x, y),
            lambda x, y: max(x, y),
        ):
            arr = [1 << x for x in range(19)]
            random.shuffle(arr)
            segtree: GeneralSimpleSegTree[int] = GeneralSimpleSegTree(arr, func)
            self.bruteforce(arr, segtree, func)
            for _ in range(100):
                random_idx = random.randint(0, len(arr) - 1)
                new_value = random.randint(0, (1 << len(arr)) - 1)
                arr[random_idx] = new_value
                segtree.change(random_idx, new_value)
                self.bruteforce(arr, segtree, func)


if __name__ == "__main__":
    unittest.main()
