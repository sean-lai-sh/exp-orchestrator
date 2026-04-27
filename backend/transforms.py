"""Lightweight plugin transforms for relay mode.

Each transform is a pure function: str -> str, matching a plugin by name.
"""

from __future__ import annotations

from typing import Callable, Dict, List


def caesar_cipher(text: str, shift: int = 3) -> str:
    result = []
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            result.append(chr((ord(ch) - base + shift) % 26 + base))
        else:
            result.append(ch)
    return "".join(result)


# Registry: lowercased plugin name → transform function
_TRANSFORMS: Dict[str, Callable[[str], str]] = {
    "caesar cipher": caesar_cipher,
}


def apply_pipeline(plugin_names: List[str], message: str) -> str:
    """Apply transforms in topological order for each plugin in the chain."""
    for name in plugin_names:
        transform = _TRANSFORMS.get(name.lower())
        if transform:
            message = transform(message)
    return message
