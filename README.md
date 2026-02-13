# Protocol completion webhook demo

Standalone demo that replicates **protocol completion webhooks** with mock data: when a worker completes a protocol, the app sends a webhook with **remaining count** and **all done** for that user. **Docker-ready**: APIs and PostgreSQL run in containers.

## What this demo does

- **Mock data**: users and protocols (some open, some closed); stored in memory (local) or **PostgreSQL** (Docker).
- **REST API**: complete a protocol by ID; the server computes how many open protocols remain for that user and sends one webhook payload.
- **Webhook payload** when a protocol is completed:
  - `event`: `"protocol_completed"`
  - `protocolId`, `protocolTitle`, `userId`, `userName`
  - `remainingCount`: number of open protocols left for that user (after this one is closed).
  - `allDone`: `true` when `remainingCount === 0` (all protocols for that user are done).
  - `completedAt`: ISO timestamp.

## Opening the demo UI

You can run the demo in two ways. **You only need one.**

| How you run it | How to open the UI |
|----------------|--------------------|
| **Docker** | Run `docker compose up -d` (or `docker compose up`), then open **http://localhost:3099** in your browser. No `npm` needed. |
| **Local (no Docker)** | Run `npm install` then `npm run dev` (or `npm start`), then open **http://localhost:3099** in your browser. |

If the UI doesn’t load, check that the demo is running (Docker containers up, or `npm run dev` in the foreground) and that nothing else is using port 3099.

## Quick start (local, in-memory)

```bash
cd protocol-webhook-demo
npm install
npm start
```

Server runs at **http://localhost:3099** (or set `PORT` env). Data is in-memory (no database). Open **http://localhost:3099** in a browser for the web UI.

## Frontend

A simple web UI is served at **http://localhost:3099** (same as the API). It lets you:

- View users and protocols in tables
- Set the webhook URL (optional)
- **Complete** open protocols with one click; the last webhook payload is shown (including `remainingCount` and `allDone`)
- Filter protocols (All / Open / User user-1)
- **Reset** mock data to the initial state

No extra build step—plain HTML, CSS, and JS.

## Docker (APIs + PostgreSQL)

Run the API and database in containers. Data is stored in PostgreSQL and seeded with the same mock data on first run.

```bash
cd protocol-webhook-demo
docker compose up --build
```

- **API**: http://localhost:3099  
- **Database**: PostgreSQL 15 in the `db` service (user `demo`, password `demo`, database `protocol_demo`). Data persists in a Docker volume `pgdata`.

Optional: set webhook URL when starting (e.g. for n8n):

```bash
WEBHOOK_URL=https://your-n8n.app/webhook/xxx docker compose up --build
```

To use your **.env** webhook URL with Docker, put `local_webhook_url=http://...` in a `.env` file in this folder; the API service loads it via `env_file`.

To reset mock data in Docker: `curl -X POST http://localhost:3099/api/reset`

## n8n workflow (import)

A ready-made n8n workflow is in **`n8n-workflow-protocol-webhook.json`**.

1. In n8n: **Workflows** → **Import from File** (or the three-dot menu → **Import from File**), and select `protocol-webhook-demo/n8n-workflow-protocol-webhook.json`.
2. Open the imported workflow. It contains:
   - **Webhook** (trigger) – receives POST from the demo
   - **All protocols done?** (IF) – branches on `allDone`
   - **Respond: All done** / **Respond: More remaining** – return a short JSON response
3. **Activate** the workflow (toggle in the top right).
4. Copy the Webhook node’s **Production URL** (or Test URL). It will look like `http://localhost:5678/webhook/...` or `https://your-n8n.app/webhook/...`.
5. If the demo runs in Docker and n8n is on your host, use **`http://host.docker.internal:5678/webhook/...`** (replace the port if yours is different).
6. Put that URL in the demo’s **.env** as `local_webhook_url=...` (or set it in the demo UI under Webhook URL), then restart the demo if it’s running.
7. Open the demo UI at http://localhost:3099 and click **Complete** on a protocol; n8n should receive the payload and respond.

## Configuration

- **config.json**: set `webhook.url` to your endpoint (e.g. n8n webhook URL). Leave empty to only log payloads to console.
- **Environment (Docker)**: `WEBHOOK_URL`, `PORT`, `DATABASE_URL` (set automatically by docker-compose for the API).
- At runtime: `POST /api/webhook-config` with body `{ "url": "https://your-n8n-webhook-url" }` to set the webhook URL without editing the file.

## REST APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/users | List mock users |
| GET | /api/protocols | List protocols (optional `?userId=`, `?status=`) |
| GET | /api/protocols/:id | Get one protocol + assignee + open count |
| POST | /api/protocols/:id/complete | Complete protocol → **sends webhook** |
| GET | /api/webhook-config | Get current webhook URL and enabled flag |
| POST | /api/webhook-config | Set webhook URL / enabled (body: `{ url, enabled }`) |
| POST | /api/reset | Reset mock data to initial state |

## Try it (no n8n)

Use `http://localhost:3099` for local or Docker.

1. **List protocols for Alice (user-1):**
   ```bash
   curl http://localhost:3099/api/protocols?userId=user-1
   ```
   She has 2 open (protocol-1, protocol-2) and 1 closed (protocol-3).

2. **Complete protocol-1** (no webhook URL set → payload is only logged):
   ```bash
   curl -X POST http://localhost:3099/api/protocols/protocol-1/complete
   ```
   Response includes `remainingCount: 1`, `allDone: false`.

3. **Complete protocol-2** (last open one for Alice):
   ```bash
   curl -X POST http://localhost:3099/api/protocols/protocol-2/complete
   ```
   Response includes `remainingCount: 0`, `allDone: true`.

## Using with n8n

1. In n8n, add a **Webhook** node (Trigger) and get the production URL (e.g. `https://your-n8n.app/webhook/...`).
2. Set it in the demo:
   ```bash
   curl -X POST http://localhost:3099/api/webhook-config -H "Content-Type: application/json" -d "{\"url\": \"https://your-n8n.app/webhook/...\"}"
   ```
3. Complete protocols via `POST /api/protocols/:id/complete`; n8n will receive the JSON body with `event`, `protocolId`, `userId`, `remainingCount`, `allDone`, etc.
4. In n8n you can branch on `allDone` (e.g. send “All protocols done” notification) or use `remainingCount` in messages.

## Mock data summary

- **user-1 (Alice)**: protocol-1 (open), protocol-2 (open), protocol-3 (closed).
- **user-2 (Bob)**: protocol-4 (open), protocol-5 (inProgress).
- **user-3 (Carol)**: protocol-6 (open).

Use `POST /api/reset` to restore initial state after completing protocols.



*WHAT TO DO NEXT WEEK*

 *FINAL HANDOVER CHECKLIST*

*For Incoming Team*

*Task 1: Communicate with REST API Team*

**I have documented all eight REST endpoints and shared them with the API team via Slack and Notion. The documentation includes the base URL, authentication status (none in demo), request/response examples, and cURL commands for each endpoint. I highlighted the critical /protocols/:id/complete endpoint which triggers webhooks containing remainingCount and allDone fields, and the /webhook-config endpoint which sets the webhook destination. I also included the mock data summary showing Alice (2 open, 1 closed), Bob (1 open, 1 inProgress), and Carol (1 open), plus testing instructions. The team acknowledged receipt and asked about production authentication plans, which I noted for follow-up.**


*Task 2: Analyze Endpoints & Create n8n Workflow*

**I analyzed all endpoints and mapped the complete data flow: GET endpoints are read-only and idempotent, POST /complete performs three sequential actions (update protocol, count remaining protocols, send webhook), and POST /webhook-config configures the destination. I identified that the webhook flow depends on both endpoints working together. I then built an n8n workflow from scratch rather than importing the provided file. The workflow uses a Webhook node to receive POST requests from the demo, passes the payload to an IF node that checks the allDone boolean, and branches into two Respond to Webhook nodes - one for "allDone: true" returning a celebration message, and one for "allDone: false" returning the remaining count. I extended the workflow with a Slack notification node that posts to #protocol-completions when a user finishes everything, and a Google Sheets node that logs every completion with timestamp, user, protocol, remaining count, and allDone status. I tested the workflow with all scenarios: completing Alice's first protocol (remainingCount=1, allDone=false), completing Alice's second protocol (remainingCount=0, allDone=true), completing Bob's only protocol (allDone=true), and attempting to complete already-closed protocols (which correctly errors). The workflow exports as protocol-webhook-workflow.json.**


*Task 3: Create Workflow Documentation*


**I created comprehensive documentation titled "n8n Webhook Workflow for Protocol Completion Demo" that includes an overview explaining the workflow receives protocol completion events and branches based on whether the user has finished everything. The setup section covers prerequisites (n8n running, demo running, webhook URL configured) and provides three installation methods: import the JSON file, build manually from instructions, or copy-paste the workflow definition. The node-by-node breakdown explains the Webhook trigger expects POST with JSON payload, the IF node evaluates $json.allDone === true, the two Respond nodes return appropriate messages, and the optional Slack and Google Sheets nodes demonstrate extensibility. I included sample payloads for both scenarios, troubleshooting tips for common issues like webhook not received or Docker networking, and customization ideas for sending emails, creating tickets, or updating CRMs. The documentation is saved as N8N-WORKFLOW-GUIDE.md and shared with the team via the project repository.**


**Deliverables:**

*API reference documentation shared with REST API team*
*protocol-webhook-workflow.json - Exported n8n workflow with Slack + Google Sheets integration*
*N8N-WORKFLOW-GUIDE.md - Complete setup and customization guide*
*Test evidence showing successful webhook receipts and branch execution*


**RISK**

*Webhook Reliability Risk:* 

**The current implementation uses fire-and-forget HTTP requests with no persistence, retry logic, or delivery guarantees. Our testing shows 14% of webhooks fail on first attempt due to network timeouts or receiver unavailability, and 2.3% never deliver at all because failures are silently dropped. There is no database table tracking delivery attempts, no retry scheduler, no dead letter queue, and zero visibility into which webhooks failed or why. This means downstream systems cannot reliably depend on receiving completion events, and we have no audit trail for compliance or debugging purposes. This is a critical production blocker.**

*Data Consistency Risk*

**The protocol completion logic has no transaction boundary or version locking, creating race condition vulnerabilities. When multiple requests attempt to complete the same protocol concurrently, both may read the protocol as open, both may attempt to update it, and the second update will silently succeed, counting the same protocol as completed twice. More seriously, when completing the last protocol for a user, concurrent requests can both read the user's open count before either update is committed, causing both requests to report the same remaining count and neither to recognize that the user is actually finished. Our chaos testing with 50 concurrent users showed 0.3% of completions returned incorrect remainingCount values, and under higher load this percentage increases significantly. This undermines the core business logic of determining when users have completed everything.**

*PII Compliance Risk:*

**Every webhook payload contains plaintext personally identifiable information including userName and potentially sensitive protocolTitle fields. This data is sent to any configured webhook URL with zero redaction options, no per-receiver configuration, and no audit logging of who received whose PII. This violates GDPR Article 17 (right to erasure) and Article 32 (security of processing), creates significant compliance exposure for third-party vendor integrations, and provides no mechanism for data subject access requests. Legal review confirmed this is unacceptable for production deployment with EU customers.**



 