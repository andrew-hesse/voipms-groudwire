# VoIP.ms Balance for Groundwire

A small Cloudflare Worker that lets Groundwire display your VoIP.ms account balance without storing VoIP.ms credentials on your phone.

## How It Works

Groundwire calls the Worker balance endpoint:

```text
GET https://your-worker.workers.dev/balance
User-Agent: Groundwire/...
```

The Worker validates the Groundwire User-Agent, calls the VoIP.ms `getBalance` API with credentials stored as Cloudflare secrets, and returns:

```json
{
	"balanceString": "CAD 12.34"
}
```

User-Agent headers can be spoofed. Treat the Worker URL as private.

## Configure VoIP.ms

1. Open the VoIP.ms API settings page.
2. Enable the API.
3. Set an API password.
4. Allow Cloudflare Worker source IPs according to your VoIP.ms API settings. If you do not have a fixed Worker egress IP, VoIP.ms may require allowing `0.0.0.0`.

Use a VoIP.ms API password, not your normal account login password.

## Deploy

```bash
pnpm install

wrangler secret put VOIP_MS_USERNAME
wrangler secret put VOIP_MS_PASSWORD

pnpm deploy
```

Required secrets:

| Secret             | Description                           |
| ------------------ | ------------------------------------- |
| `VOIP_MS_USERNAME` | VoIP.ms API username or email address |
| `VOIP_MS_PASSWORD` | VoIP.ms API password                  |

Optional variables in `wrangler.toml`:

| Variable   | Default | Description                  |
| ---------- | ------- | ---------------------------- |
| `CURRENCY` | `CAD`   | Prefix shown in Groundwire   |
| `DEBUG`    | `false` | Enables extra Worker logging |

## Configure Groundwire

In Groundwire, open the account settings and configure the Balance Checker:

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| URL         | `https://your-worker.workers.dev/balance`  |
| Method      | `GET`                                      |
| Parse Field | `balanceString`, if Groundwire asks for it |

No custom authorization header is required.

## Endpoints

| Endpoint   | Method | Auth                | Description             |
| ---------- | ------ | ------------------- | ----------------------- |
| `/balance` | `GET`  | Groundwire UA check | Returns `balanceString` |
| `/health`  | `GET`  | None                | Deployment health check |

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

This project is pinned to pnpm 11 via `packageManager`.

## Troubleshooting

`401 Unauthorized`

- Requests must come from a Groundwire User-Agent.
- Confirm Groundwire is using the Balance Checker URL directly.

`500 Server configuration error`

- Confirm both required Cloudflare secrets are set.

`502 Failed to retrieve balance`

- Confirm the VoIP.ms API is enabled.
- Confirm `VOIP_MS_USERNAME` and `VOIP_MS_PASSWORD` are correct.
- Check whether VoIP.ms is blocking the Worker's source IP.

`504 Balance provider timed out`

- VoIP.ms did not answer quickly enough. Try again later.
