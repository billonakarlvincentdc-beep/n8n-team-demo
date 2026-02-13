*1. Webhook Push vs. Polling Pull: What Fits Reportheld Best?*

For Reportheld's protocol completion scenario, push-based webhooks are the clear architectural winner. Your demo already implements the correct pattern: when a protocol is completed, the system immediately pushes a rich payload containing remainingCount and allDone to a configured endpoint . This is fundamentally superior to polling for your use case because completions are discrete, event-driven actions that require near-real-time notification. Polling would force downstream systems to constantly query "are we done yet?" — wasteful, inefficient, and incapable of providing the synchronous confirmation your UI currently enjoys.

Webhook push fits because your domain has natural events. Every protocol completion is a meaningful business moment that triggers downstream workflows (notifications, certificate generation, CRM updates). The allDone flag specifically enables branching logic that polling cannot replicate without complex state tracking on the consumer side. Your n8n workflow demonstrating IF nodes branching on this single boolean proves the elegance of event-driven architecture .

The retention period question changes the calculus. If Reportheld requires that completion events be queryable for months after they occur, you need both: webhooks for real-time reaction and an API for historical lookup. Your current dual approach (webhook + GET /protocols endpoint) is correct — push for immediacy, pull for audit.

Verdict: Stay with webhooks. Polling would be a regression in user experience and system efficiency.

*2. Exposing Webhooks Safely On-Premise*

Reverse Proxy: Your Security Perimeter
NGINX as TLS termination and access control point is non-negotiable for on-premise deployment . Your n8n instance should never be directly exposed; instead, route all /webhook/ traffic through a reverse proxy that handles:

TLS termination — HTTPS with modern ciphers, automatic certificate renewal

Request size limiting — prevent memory exhaustion attacks

Rate limiting — per source IP to blunt brute-force attempts

Path-based routing — /webhook/* → n8n, /api/* → your protocol API

Configuration foundation:

nginx
location /webhook/ {
    proxy_pass http://localhost:5678;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 1m;
    limit_req zone=webhook burst=20 nodelay;
}
IP Allowlisting: Defense in Depth
For on-premise, IP allowlisting is your strongest control but requires architectural discipline . If Reportheld's consumers have static egress IPs, configure NGINX to reject everything else:

nginx
location /webhook/ {
    allow 203.0.113.0/24;  # Consumer A
    allow 198.51.100.0/24; # Consumer B  
    deny all;
    # ... proxy config
}
Reality check: If consumers are cloud services without static IPs, allowlisting becomes impractical. You then lean entirely on signed requests.

Signed Requests: The Non-Negotiable Minimum
Every webhook endpoint must verify that incoming requests genuinely come from your system. HMAC-SHA256 signing with a shared secret is the industry standard . Implementation pattern:

javascript
// In your protocol demo's webhook sender
const signature = crypto
  .createHmac('sha256', WEBHOOK_SIGNING_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');

headers: { 'X-Webhook-Signature': signature }

// In n8n receiving node - verification code
const expected = crypto
  .createHmac('sha256', process.env.WEBHOOK_SIGNING_SECRET)
  .update(JSON.stringify($json.body))
  .digest('hex');

if (!crypto.timingSafeEqual(signature, expected)) {
  return { statusCode: 401, body: 'Invalid signature' };
}
Critical: Use timingSafeEqual, not string comparison. Store the signing secret in your secrets manager, never in workflow JSON .

Defense in depth summary: Reverse proxy + IP allowlist (where possible) + HMAC signature verification. Any one layer failing is contained.

3. Credential Storage and Rotation Strategy for Self-Hosted n8n

The Encryption Key: Your Root of Trust
The single most critical secret in self-hosted n8n is N8N_ENCRYPTION_KEY . This 32-byte hex string encrypts every credential stored in n8n's database. Lose it or change it incorrectly and all credentials become permanently undecipherable — not just broken, but irrecoverable .

Generation (do this now, not later):

bash
openssl rand -hex 32
# Store this in your password manager AND secrets manager
Storage mandate: Never in .env files committed to git. Use Docker secrets, Kubernetes secrets, HashiCorp Vault, or your cloud provider's secret manager .

Rotation Procedure: Zero Tolerance for Guesswork
Rotation is a controlled migration, not a configuration update . The correct sequence:

Full backup: Database dump + VPS snapshot + workflow exports 

Export all credentials in decrypted form:

bash
n8n export:credentials --all --output=credentials-2024-04-15.json
Stop n8n (downtime is required — accept it)

Deploy new encryption key via environment/secret injection

Start n8n (credentials are now undecipherable — this is expected)

Re-import credentials to encrypt them with the new key:

bash
n8n import:credentials --input=credentials-2024-04-15.json
Verify critical workflows execute successfully

Without step 2, step 6 is impossible. This is the single most common production outage in self-hosted n8n .

Rotation frequency: Every 6-12 months if compliance requires, or immediately upon suspected compromise. Otherwise, stability trumps rotation cadence .

Beyond the Encryption Key: Full-Spectrum Secret Management
n8n's built-in credential system is secure but operationally limited . It encrypts at rest and presents a clean UI, but it does not solve:

Multi-user credential isolation — n8n credentials are static and workflow-scoped; you cannot dynamically route to User A's Google vs. User B's Google without external tooling 

Audit logging — who accessed which credential when?

Automated rotation — n8n cannot rotate its own secrets

For Reportheld, your architecture likely fits Pattern A: Credentials + Secret-Backed Environment Variables . This is appropriate for single-tenant or admin-managed integrations.

If Reportheld requires true multi-tenant credential isolation (each end-user authenticates with their own Google/Salesforce/etc.), you have hit n8n's fundamental architectural limitation . The platform was not designed for this. Your options:

Build the workaround: External OAuth service + credential database + token refresh logic + user-ID routing . This is 3-6 months of engineering.

Adopt an MCP Gateway like Fastn UCL that sits between n8n and APIs, handling tenant-specific credential routing via tenant_id parameters . This is hours of configuration, not months.

The MCP approach is production-proven: one team reduced context windows by 30-40% and saved $18,000/month in token costs . For multi-user scenarios, it is not a luxury — it is the only scalable path.

Operational Hygiene: Non-Negotiables
Automated daily backups of workflows and credentials to S3-compatible storage with retention policies 

Secrets-free workflows: No API keys in HTTP headers, no tokens in Code nodes, no credentials in node configuration — everything references n8n Credentials or environment variables 

Environment isolation: Separate dev/staging/prod credentials with least-privilege scopes 

Editor access lockdown: VPN/SSO + MFA. Anyone who can open the editor can view credential configurations 