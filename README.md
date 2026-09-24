# TheDrunkBots Pay Check API

Drop-in Paytm payment verifier for Telegram bots. Same contract as the old Heroku proxy:

```
GET https://YOUR-HOST/?mid=YOUR_MID&oid=ORDER_ID
```

Always HTTP 200. Read `STATUS` (`TXN_SUCCESS` / `TXN_FAILURE` / `PENDING`). Never fakes success.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy (Render / Railway)

1. Upload this folder (or connect the zip).
2. Build: `npm install`
3. Start: `npm start`
4. Copy the public URL into your bot as `PAYMENT_API_URL` **with a trailing slash**.

```
PAYMENT_API_URL=https://your-service.onrender.com/
```

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/?mid=&oid=` | Bot drop-in |
| GET | `/api?mid=&oid=` | Same JSON |
| GET/POST | `/api/verify` | JSON body `{ mid, oid }` also works |
| GET | `/api/health` | Liveness |
| GET | `/docs` | API docs HUD |

Optional: set `PAYTM_API_KEY`. Then send `x-api-key` or `?key=`. Leave unset to stay compatible with CONTENT-X.
