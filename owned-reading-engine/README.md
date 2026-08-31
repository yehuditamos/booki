# מנוע הקריאה העברי של בוקי — הוכחת היתכנות

שירות ASR עצמאי שמריץ את `ivrit-ai/whisper-large-v3-turbo-ct2` בשרת של בוקי.
המודל ברישיון Apache-2.0. הקול מתקבל כ-PCM ב-WebSocket, נשמר בחלון זיכרון קצר
בלבד, מתומלל ונמחק בסגירת החיבור. אין כתיבה לדיסק, ל-Firebase או ל-Cloud Storage.

## הפעלה מקומית

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
BOOKI_ALLOW_UNAUTHENTICATED_DEV=1 BOOKI_MODEL_DEVICE=cpu BOOKI_MODEL_COMPUTE_TYPE=int8 \
  uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## משתני סביבה בפריסה

- `BOOKI_ENGINE_ACCESS_CODE` — קוד פרטי ארוך שאינו נשמר בקוד הלקוח.
- `BOOKI_ALLOWED_ORIGINS` — מקורות מורשים, מופרדים בפסיקים.
- `BOOKI_MODEL_ID` — ברירת מחדל: מודל ivrit.ai הפתוח.
- `BOOKI_MODEL_DEVICE=cuda`
- `BOOKI_MODEL_COMPUTE_TYPE=float16`

יש לפרוס עם מופע יחיד ו-GPU. קישור הטסט מקבל את הקוד פעם אחת בפרמטר `code`,
מעביר אותו ל-sessionStorage ומסיר אותו מיד משורת הכתובת. הקוד נשלח למנוע
רק בתוך הודעת WebSocket מוצפנת, ולא מופיע בכתובת הבקשה או ביומני הגישה.

## פריסה ל-Cloud Run

הפריסה הפרטית משתמשת ב-L4 יחיד בבלגיה, יורדת לאפס מופעים כשאין קריאה,
ומגבילה את עצמה למופע אחד. מתוך התיקייה הזאת:

```bash
export BOOKI_ENGINE_ACCESS_CODE="$(openssl rand -hex 32)"
./deploy-cloud-run.sh
```

לאחר הפריסה יש להכניס את כתובת ה-WebSocket שהתקבלה ל-meta
`booki-owned-engine-url` במסך הטסט. אין לפרסם או לשמור את קוד הגישה ב-Git.
