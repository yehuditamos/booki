import os
import unittest

os.environ.setdefault("BOOKI_ALLOW_UNAUTHENTICATED_DEV", "1")

from app.session import MemoryAudioWindow
from app.transcriber import OwnedHebrewTranscriber, pcm16_to_float32


class MemoryAudioWindowTests(unittest.TestCase):
    def test_keeps_only_rolling_memory_window(self):
        window = MemoryAudioWindow(sample_rate=10, seconds=1)
        window.append(b"a" * 12)
        window.append(b"b" * 12)
        self.assertEqual(len(window.snapshot()), 20)
        self.assertEqual(window.snapshot(), b"a" * 8 + b"b" * 12)

    def test_clear_drops_all_audio(self):
        window = MemoryAudioWindow(sample_rate=16_000)
        window.append(b"audio")
        window.clear()
        self.assertEqual(window.snapshot(), b"")

    def test_pcm_conversion_stays_in_memory(self):
        audio = pcm16_to_float32(b"\x00\x00\xff\x7f", 16_000)
        self.assertEqual(audio.shape[0], 2)
        self.assertGreater(float(audio[1]), 0.99)

    def test_silence_never_loads_or_calls_the_model(self):
        transcriber = OwnedHebrewTranscriber()
        silence = b"\x00\x00" * 16_000
        self.assertEqual(transcriber.transcribe_pcm(silence, 16_000, "התשובה"), "")
        self.assertFalse(transcriber.loaded)


if __name__ == "__main__":
    unittest.main()
