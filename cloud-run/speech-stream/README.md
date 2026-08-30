# Booki private speech-stream proof of concept

Cloud Run WebSocket bridge for temporary Hebrew streaming recognition.

- Accepts 16 kHz mono PCM16 chunks only.
- Sends audio directly to Google Cloud Speech-to-Text (`he-IL`).
- Does not write audio or transcripts to disk, Cloud Storage, Firestore, or logs.
- Requires a private token and validates the GitHub Pages origin.

Required environment variables:

- `PRIVATE_TEST_TOKEN`
- `ALLOWED_ORIGINS=https://yehuditamos.github.io`

The Cloud Run service account needs the least-privilege role required to call Speech-to-Text.
