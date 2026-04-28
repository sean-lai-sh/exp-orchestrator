import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_transform_shifts_lowercase_by_default_10():
    # Default shift is 10, set before import via env-var fallback below.
    os.environ["CAESAR_SHIFT"] = "10"
    # Force a fresh module load so the constant picks up the env.
    if "main" in sys.modules:
        del sys.modules["main"]
    from main import _transform
    assert _transform(b"hello") == b"rovvy"


def test_transform_preserves_non_alpha():
    os.environ["CAESAR_SHIFT"] = "10"
    if "main" in sys.modules:
        del sys.modules["main"]
    from main import _transform
    assert _transform(b"hello, world! 123") == b"rovvy, gybvn! 123"


def test_transform_preserves_case():
    os.environ["CAESAR_SHIFT"] = "3"
    if "main" in sys.modules:
        del sys.modules["main"]
    from main import _transform
    assert _transform(b"AbC xyZ") == b"DeF abC"


def test_transform_passes_through_non_utf8():
    os.environ["CAESAR_SHIFT"] = "10"
    if "main" in sys.modules:
        del sys.modules["main"]
    from main import _transform
    assert _transform(b"\xff\xfe") == b"\xff\xfe"
