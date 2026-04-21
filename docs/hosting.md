# Hosting on Fly.io

The server supports two transports, chosen by the `MCP_TRANSPORT` environment variable:

- `stdio` (default) — local-only, what MCP clients use when they spawn a child process.
- `http` — bind a Bun HTTP server on `$PORT` (default `8080`), serve MCP over `POST /mcp`, with `/health` for health checks and optional bearer-token auth.

For hosting, you want `http`. This doc walks through deploying to [Fly.io](https://fly.io).

## Prerequisites

- A Fly.io account.
- `flyctl` installed locally: `brew install flyctl` (or see [fly.io/docs/hands-on/install-flyctl](https://fly.io/docs/hands-on/install-flyctl/)).
- You're logged in: `fly auth login`.

## One-time setup

### 1. Create the app

From the repo root:

```bash
fly apps create wandering-trader-mcp
```

(The name has to be globally unique on Fly. If someone took it, pick a different name and update `app = "..."` in `fly.toml` to match.)

### 2. Create the persistent volume for SQLite

Pick a [region](https://fly.io/docs/reference/regions/) near you (e.g. `iad` for US-East, `fra` for Europe, `sjc` for US-West). Match the `primary_region` in `fly.toml` or override it.

```bash
fly volumes create wandering_trader_data --region iad --size 1 --app wandering-trader-mcp
```

1 GB is plenty — a run's state is a few KB.

### 3. Set a bearer token (required — do not skip)

Without `AUTH_TOKEN`, the server accepts unauthenticated MCP requests. That means anyone on the internet can drain your cheapest-VM CPU and make you look weird in server logs. Generate something random and set it as a Fly secret:

```bash
fly secrets set AUTH_TOKEN="$(openssl rand -hex 32)" --app wandering-trader-mcp
```

### 4. First deploy (local, bootstrap)

```bash
fly deploy
```

This builds from the `Dockerfile`, pushes the image to Fly's registry, and starts the app. Once it's green:

```bash
fly status --app wandering-trader-mcp
curl https://wandering-trader-mcp.fly.dev/health
```

Should return `ok`.

### 5. Wire up GitHub Actions for auto-deploy on release

Create a deploy token and add it to GitHub as a repo secret:

```bash
fly tokens create deploy --app wandering-trader-mcp --expiry 9999h
```

Copy the output (starts with `FlyV1 fm2_...`). In GitHub:

1. Repo → Settings → Secrets and variables → Actions → **New repository secret**
2. Name: `FLY_API_TOKEN`
3. Value: the token you just copied

From now on, every release (semantic-release creating a new tag) will automatically redeploy Fly after the GHCR image is pushed. The `deploy-fly` job in `.github/workflows/release.yml` uses `FLY_API_TOKEN` to authenticate and points Fly at the freshly-published `ghcr.io/.../wandering-trader-mcp:<version>` image.

## Using the hosted server

### From Claude Code

```bash
claude mcp add wandering-trader-hosted \
  --transport http \
  --header "Authorization: Bearer YOUR_TOKEN" \
  https://wandering-trader-mcp.fly.dev/mcp
```

### From MCP Inspector

```bash
bunx @modelcontextprotocol/inspector
```

In the UI, pick "Streamable HTTP", URL `https://wandering-trader-mcp.fly.dev/mcp`, add header `Authorization: Bearer YOUR_TOKEN`, connect.

### From any MCP HTTP client

`POST https://wandering-trader-mcp.fly.dev/mcp` with header `Authorization: Bearer <AUTH_TOKEN>` and a standard MCP JSON-RPC body.

## Expected cost

With `auto_stop_machines = "stop"` and `min_machines_running = 0` (both set in `fly.toml`), the VM hibernates when idle. Only billed for time actually serving requests.

At hobby traffic: **~$0–3 / month**. The persistent volume (1 GB) is free on the hobby plan.

## Operations

```bash
# Logs
fly logs --app wandering-trader-mcp

# Status + running machines
fly status --app wandering-trader-mcp

# Force a wake (skip the cold start for debugging)
fly machine start --app wandering-trader-mcp

# Update a secret
fly secrets set AUTH_TOKEN=new-value --app wandering-trader-mcp

# Scale memory up (if you ever need it)
fly scale memory 512 --app wandering-trader-mcp

# Destroy and redeploy from scratch (nuclear)
fly apps destroy wandering-trader-mcp
```

## Running the HTTP mode locally

Useful for poking at the hosted shape before deploying:

```bash
MCP_TRANSPORT=http AUTH_TOKEN=dev-token PORT=8080 bun run src/index.ts
# In another terminal:
curl -s http://localhost:8080/health
curl -s -H "Authorization: Bearer dev-token" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
     http://localhost:8080/mcp
```

The second call should return an MCP `initialize` response.
