from __future__ import annotations

import os
import threading
from typing import Any

import numpy as np


DEFAULT_MODEL_ID = "ivrit-ai/whisper-large-v3-turbo-ct2"
TARGET_SAMPLE_RATE = 16_000
MIN_AUDIO_SECONDS = float(os.getenv("BOOKI_MIN_AUDIO_SECONDS", "0.7"))
MIN_AUDIO_RMS = float(os.getenv("BOOKI_MIN_AUDIO_RMS", "0.006"))


def pcm16_to_float32(pcm: bytes, sample_rate: int) -> np.ndarray:
    if not pcm:
        return np.empty(0, dtype=np.float32)
    audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    if sample_rate == TARGET_SAMPLE_RATE or audio.size < 2:
        return audio
    duration = audio.size / float(sample_rate)
    target_size = max(1, int(round(duration * TARGET_SAMPLE_RATE)))
    source_axis = np.linspace(0.0, duration, num=audio.size, endpoint=False)
    target_axis = np.linspace(0.0, duration, num=target_size, endpoint=False)
    return np.interp(target_axis, source_axis, audio).astype(np.float32)


class OwnedHebrewTranscriber:
    """Lazy-loaded, self-hosted Hebrew ASR. Audio only exists in process memory."""

    def __init__(self) -> None:
        self.model_id = os.getenv("BOOKI_MODEL_ID", DEFAULT_MODEL_ID)
        self.device = os.getenv("BOOKI_MODEL_DEVICE", "cuda")
        self.compute_type = os.getenv("BOOKI_MODEL_COMPUTE_TYPE", "float16")
        self._model: Any | None = None
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self.model_id,
                device=self.device,
                compute_type=self.compute_type,
            )

    def transcribe_pcm(self, pcm: bytes, sample_rate: int, expected_text: str) -> str:
        audio = pcm16_to_float32(pcm, sample_rate)
        if audio.size < int(TARGET_SAMPLE_RATE * MIN_AUDIO_SECONDS):
            return ""
        # Whisper may invent text from silence. Reject quiet windows before the
        # model runs, and never prime it with the answer that the child reads.
        rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float32))))
        if not np.isfinite(rms) or rms < MIN_AUDIO_RMS:
            return ""
        self.ensure_loaded()
        with self._infer_lock:
            segments, _ = self._model.transcribe(
                audio,
                language="he",
                beam_size=1,
                best_of=1,
                temperature=0.0,
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 220},
                without_timestamps=True,
            )
            return " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
