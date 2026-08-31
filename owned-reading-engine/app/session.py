from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class MemoryAudioWindow:
    """Bounded in-memory PCM window. It has no persistence methods by design."""

    sample_rate: int
    seconds: float = 7.0
    _data: bytearray = field(default_factory=bytearray)

    @property
    def max_bytes(self) -> int:
        return max(1, int(self.sample_rate * 2 * self.seconds))

    def append(self, chunk: bytes) -> None:
        self._data.extend(chunk)
        overflow = len(self._data) - self.max_bytes
        if overflow > 0:
            del self._data[:overflow]

    def snapshot(self) -> bytes:
        return bytes(self._data)

    def clear(self) -> None:
        self._data.clear()
