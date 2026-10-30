# Render edge cache: `/resume` redirect loop

## Symptom

`https://jade.cool/resume` fails in the browser with "too many redirects". Every other page works, and so does `/resume` on the Render subdomain (`https://personal-site-3acq.onrender.com/resume`).

## Cause

Render's edge cache holds stale 301 responses for `/resume` on both custom domains, and the two redirect to each other:

```
https://jade.cool/resume      -> 301 location: https://www.jade.cool/resume
https://www.jade.cool/resume  -> 301 location: https://jade.cool/resume
```

They were most likely cached while the custom domains were moving from the old Web Service (since deleted) to the current Static Site. The current configuration can't produce them: `jade.cool` is the primary domain and `www.jade.cool` redirects to it, so nothing should send the apex to `www`.

How to tell a stale response from a live one:

| | Stale cached 301 | Live Render response |
|---|---|---|
| `rndr-id` header | absent | present |
| `Age` header | large, keeps growing (thousands of seconds) | small, resets within `s-maxage=300` |
| `location` header casing | lowercase | n/a |
| Query string | ignored (`?aud=fe` gets the same 301) | respected |

Things that did **not** clear it:
- A manual redeploy of the Static Site. The `Age` kept growing past the deploy.
- Purging DNS at `one.one.one.one/purge-cache`. DNS only returns addresses, it can't cache an HTTP 301.
- Waiting. As far as we can tell, nothing on Render's side expires these objects.

Render has no self-serve purge for Static Sites (the dashboard purge button only exists for Web Services with edge caching), so the fix needs Render support. A ticket has been escalated through the dashboard's "contact support" chat.

## Workaround: Cloudflare Redirect Rules

DNS for `jade.cool` is on Cloudflare. Both CNAMEs (`@` and `www`, pointing to `personal-site-3acq.onrender.com`) must be **Proxied**, otherwise the zone's rules never run. SSL mode is Full.

Two Single Redirect rules under Cloudflare > Rules > Redirect Rules catch these requests before they reach the stale objects. The values below follow the "Edit Single Redirect" form field by field.

### Rule 1: `jade cool render workaround`

Sends the apex `/resume` to `/resume/`. That URL is a different cache key, and Render serves it fresh (200 with `rndr-id`).

**If incoming requests match...** Custom filter expression

| Field | Operator | Value |
|---|---|---|
| Hostname | equals | `jade.cool` |
| And: URI Path | equals | `/resume` |

Expression Preview: `(http.host eq "jade.cool" and http.request.uri.path eq "/resume")`

**Then...** URL redirect

| Type | URL | Status code |
|---|---|---|
| Static | `https://jade.cool/resume/` | 301 - Permanent Redirect |

Preserve query string: checked

### Rule 2: `jade cool render workaround 2`

Sends every `www` request to the apex, so `www.jade.cool/resume` never reaches its stale object.

**If incoming requests match...** Custom filter expression

| Field | Operator | Value |
|---|---|---|
| Hostname | equals | `www.jade.cool` |

Expression Preview: `(http.host eq "www.jade.cool")`

**Then...** URL redirect

| Type | Expression | Status code |
|---|---|---|
| Dynamic | `concat("https://jade.cool", http.request.uri.path)` | 301 - Permanent Redirect |

Preserve query string: checked

**Place at:** Select order "Custom", fires after `jade cool render workaround`.

With both enabled, every entry point ends at `https://jade.cool/resume/` (query string kept, so `?aud=fe` still selects the front-end variant). The rule responses are easy to spot: capitalized `Location` and no `Age` header.

Rule 2 only duplicates Render's own `www` to apex redirect, so both rules can be deleted once Render purges the cache.

## Re-testing after a purge

The rules hide Render's edge, so they have to be switched off for the test. Users get the loop back during that window if the purge hasn't happened yet, so keep it short.

1. In Cloudflare, **disable** both redirect rules. Leave the DNS records Proxied.
2. Check both hosts (on Windows use `curl.exe`, because `curl` in PowerShell 5.1 is an alias for `Invoke-WebRequest`):

   ```bash
   curl.exe -sI https://jade.cool/resume
   curl.exe -sI https://www.jade.cool/resume
   curl.exe -sIL --max-redirs 5 "https://jade.cool/resume?aud=fe"
   ```

3. Read the result:
   - **Still stale:** `jade.cool/resume` returns 301 to `https://www.jade.cool/resume` with a large `Age` and no `rndr-id`, and the `-L` run stops at the redirect limit. Re-enable both rules right away.
   - **Purged:** responses carry `rndr-id`, `jade.cool/resume` either returns 200 or redirects within `jade.cool` (for example to `/resume/`), `www.jade.cool/resume` redirects to `jade.cool`, and the `-L` run ends at a 200 on `jade.cool` with `?aud=fe` still in the URL.
4. If purged, open `https://jade.cool/resume` and `https://jade.cool/resume?aud=fe` in a private window to confirm the page and the variant load, then delete both rules (or leave them disabled for a while as a fallback).
