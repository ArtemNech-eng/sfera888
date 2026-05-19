---
description: Check Railway logs for the sfera888 API service
---

# Check Railway Logs

Steps to inspect the latest Railway logs for the API server.

1. Read the log file `railway-logs.txt` from the project root.
2. Scan for ERROR, FATAL, unhandled exceptions, or unusual patterns.
3. If the file is empty or stale, suggest running the live log capture command.
4. Summarize findings — highlight any issues and their context.

## Live log capture (run in terminal)

```bash
while true; do railway logs --lines 1500 > railway-logs.txt 2>&1; sleep 10; done
```

- Project: accurate-upliftment
- Service: sfera888 (api-server)
- Token: set via `RAILWAY_TOKEN` env var
