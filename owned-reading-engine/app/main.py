from __future__ import annotations

import asyncio
import hmac
import json
import os
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from .session import MemoryAudioWindow
from .transcriber import OwnedHebrewTranscriber


MAX_SESSION_SECONDS = int(os.getenv("BOOKI_MAX_SESSION_SECONDS", "600"))
ROLLING_WINDOW_SECONDS = float(os.getenv("BOOKI_ROLLING_WINDOW_SECONDS", "7"))
TRANSCRIBE_INTERVAL_SECONDS = float(os.getenv("BOOKI_TRANSCRIBE_INTERVAL_SECONDS", "0.85"))
MAX_CHUNK_BYTES = 64 * 1024
MAX_EXPECTED_TEXT_CHARS = 1_500
ALLOWED_ORIGINS = {
    item.strip()
    for item in os.getenv(
        "BOOKI_ALLOWED_ORIGINS",
        "https://yehuditamos.github.io,https://mitarim-reading.web.app,https://mitarim-reading.firebaseapp.com",
    ).split(",")
    if item.strip()
}
ACCESS_CODE = os.getenv("BOOKI_ENGINE_ACCESS_CODE", "")
ALLOW_UNAUTHENTICATED_DEV = os.getenv("BOOKI_ALLOW_UNAUTHENTICATED_DEV", "0") == "1"

app = FastAPI(
    title="Booki Owned Hebrew Reading Engine",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
transcriber = OwnedHebrewTranscriber()


def allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin", "")
    return origin in ALLOWED_ORIGINS or (ALLOW_UNAUTHENTICATED_DEV and origin.startswith("http://localhost"))


def valid_access_code(supplied: str) -> bool:
    if ALLOW_UNAUTHENTICATED_DEV and not ACCESS_CODE:
        return True
    return bool(ACCESS_CODE) and hmac.compare_digest(supplied, ACCESS_CODE)


async def receive_config(websocket: WebSocket) -> tuple[int, str]:
    message = await asyncio.wait_for(websocket.receive_text(), timeout=10)
    payload = json.loads(message)
    if payload.get("type") != "start":
        raise ValueError("start message required")
    if not valid_access_code(str(payload.get("accessCode", ""))):
        raise PermissionError("private test only")
    sample_rate = int(payload.get("sampleRate", 0))
    expected_text = str(payload.get("expectedText", "")).strip()
    if not 8_000 <= sample_rate <= 96_000:
        raise ValueError("unsupported sample rate")
    if not expected_text or len(expected_text) > MAX_EXPECTED_TEXT_CHARS:
        raise ValueError("invalid expected text")
    return sample_rate, expected_text


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {"ok": True, "modelLoaded": transcriber.loaded, "audioPersistence": False},
        headers={"Cache-Control": "no-store"},
    )


@app.websocket("/v1/read")
async def read_stream(websocket: WebSocket) -> None:
    if not allowed(websocket):
        await websocket.close(code=1008, reason="private test only")
        return

    await websocket.accept()
    audio: MemoryAudioWindow | None = None
    inference_task: asyncio.Task | None = None
    started_at = time.monotonic()
    last_inference_at = 0.0
    last_transcript = ""

    try:
        sample_rate, expected_text = await receive_config(websocket)
        audio = MemoryAudioWindow(sample_rate, ROLLING_WINDOW_SECONDS)
        await websocket.send_json({"type": "preparing"})
        await asyncio.to_thread(transcriber.ensure_loaded)
        await websocket.send_json({"type": "ready", "audioPersistence": False})

        async def infer(snapshot: bytes) -> None:
            nonlocal last_transcript
            before = time.monotonic()
            transcript = await asyncio.to_thread(
                transcriber.transcribe_pcm,
                snapshot,
                sample_rate,
                expected_text,
            )
            if transcript and transcript != last_transcript:
                last_transcript = transcript
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "text": transcript,
                        "latencyMs": round((time.monotonic() - before) * 1000),
                    }
                )

        while time.monotonic() - started_at < MAX_SESSION_SECONDS:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("text"):
                payload = json.loads(message["text"])
                if payload.get("type") == "stop":
                    break
                continue
            chunk = message.get("bytes")
            if not chunk:
                continue
            if len(chunk) > MAX_CHUNK_BYTES:
                await websocket.close(code=1009, reason="audio chunk too large")
                return
            audio.append(chunk)
            now = time.monotonic()
            if (
                now - last_inference_at >= TRANSCRIBE_INTERVAL_SECONDS
                and (inference_task is None or inference_task.done())
            ):
                last_inference_at = now
                inference_task = asyncio.create_task(infer(audio.snapshot()))

        if inference_task is not None:
            await asyncio.gather(inference_task, return_exceptions=True)
        await websocket.close(code=1000)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except PermissionError:
        await websocket.close(code=1008, reason="private test only")
    except (ValueError, json.JSONDecodeError):
        await websocket.close(code=1003, reason="invalid request")
    except Exception:
        try:
            await websocket.send_json({"type": "error", "code": "engine_unavailable"})
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if inference_task is not None and not inference_task.done():
            inference_task.cancel()
        if audio is not None:
            audio.clear()
