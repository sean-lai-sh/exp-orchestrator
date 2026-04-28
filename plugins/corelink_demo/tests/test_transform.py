import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_transform_uppercases_text():
    from main import _transform
    assert _transform(b"hello world") == b"HELLO WORLD"


def test_transform_handles_empty():
    from main import _transform
    assert _transform(b"") == b""


def test_transform_passes_through_non_utf8():
    from main import _transform
    # Non-UTF-8 bytes pass through unchanged
    assert _transform(b"\xff\xfe") == b"\xff\xfe"
