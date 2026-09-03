#!/bin/bash
# One command that says which transport is actually live, and why not.
S=$(curl -s -m 10 localhost:5173/api/slack/status)
[ -z "$S" ] && { echo "dev server not responding on :5173"; exit 1; }
python3 - "$S" <<'PY'
import json, sys, urllib.request, os, re
d = json.loads(sys.argv[1])
print(f"  token valid        {d.get('connected')}")
print(f"  socket configured  {d.get('socketConfigured')}")
print(f"  socket CONNECTED   {d.get('socketMode')}")
print(f"  events received    {d.get('eventsReceived')}   last: {d.get('lastEventAt')}")
print(f"  browser listeners  {d.get('listeners')}")
print()
if d.get('socketMode'):
    print("  => Socket Mode is live. Realtime does not need the tunnel.")
else:
    print("  => Socket Mode is DOWN.")
    if not d.get('socketConfigured'):
        print("     SLACK_APP_TOKEN is missing from .env.local.")
    # The HTTP fallback only works if the tunnel URL still resolves.
    try:
        env = open(os.path.join(os.path.dirname(__file__) or '.', '.env.local')).read()
    except OSError:
        env = ''
    m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', env)
    if m:
        try:
            urllib.request.urlopen(m.group(0) + '/api/slack/status', timeout=8)
            print(f"     Tunnel {m.group(0)} is UP — HTTP events can still arrive.")
        except Exception:
            print(f"     Tunnel {m.group(0)} is DEAD — HTTP events cannot arrive either.")
PY
