# Access Control Decision — "Only me" access for EC2 deployment

Date: 2026-03-16

## Decision summary
For your requirement (**always-on**, **any of your devices**, **only you**), the best practical approach is:

- **Keep app private on EC2** (no public app port)
- **Use Tailscale as identity/device gate**
- **Require MFA on your Tailscale identity account**

This gives strong access control with low operational overhead.

## Why not only Security Group IP allowlist?
IP allowlisting alone is weak for this use case:
- Mobile/home IPs change frequently
- You will lock yourself out while traveling
- Managing dynamic IP updates is brittle

## Options compared

### Option A — Public app + app auth (Basic/Auth page)
- Setup: easy
- Security: medium/weak for single-user private service
- Drawback: service is still Internet-exposed and attackable

### Option B — EC2 Security Group allowlist your IPs only
- Setup: easy initially
- Security: medium
- Drawback: poor usability with changing IPs, hotspots, roaming

### Option C — AWS Client VPN (AWS-native)
- Setup: medium/high
- Security: strong
- Drawback: more components/cost/management for one-user scenario

### Option D — Tailscale overlay network (recommended)
- Setup: low/medium
- Security: strong (WireGuard + identity + MFA)
- Benefit: works smoothly across laptop/phone/tablet anywhere

## Recommended controls (minimum)
1. EC2 Security Group:
   - Keep `3000` closed to public Internet
   - Restrict `22` to your admin IP only (or use SSM)
2. Tailscale policy:
   - One user identity only
   - MFA enforced in your identity provider
   - Device approval required
3. Host hardening:
   - Enable automatic security updates
   - Use non-root service account for app process
4. App-level guard (optional but useful):
   - Add a shared secret header token for API requests
   - Keep token in `.env`

## AWS-native alternative (if you prefer pure AWS stack)
If you want no third-party network tool, choose **AWS Client VPN + private subnet instance**:
- EC2 app stays private (no public app endpoint)
- You connect devices through AWS VPN client
- Security is excellent, but setup/ops are heavier

## Final recommendation for this project
Choose **Option D (Tailscale)** now for fastest secure outcome.

Revisit **Option C (AWS Client VPN)** later if you need strict AWS-only compliance requirements.
