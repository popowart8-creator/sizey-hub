# Local AI for SIZEY product descriptions

The admin editor calls the existing authenticated `/hub-api/admin/ai/status` and `/hub-api/admin/ai/description` routes. These now call a **local Ollama** instance; no OpenRouter API key or cloud inference is used.

## Before enabling in production

1. Check server memory, free disk, CPU and container memory limits. **Do not install a model on the production host until its spare capacity is confirmed.** Running inference on the same host as the shop and loyalty services may cause slowdowns.
2. Install Ollama on a host with sufficient capacity (ideally a separate machine). Keep its API on a private network, never exposed to the public internet.
3. Pull a model: `ollama pull deepseek-r1:1.5b` (small initial model; consider `deepseek-r1:7b` after measuring capacity).
4. Configure the API container's `OLLAMA_URL` (for example `http://ollama:11434` on a private Docker network) and `OLLAMA_MODEL=deepseek-r1:1.5b`. **Inside Docker, 127.0.0.1 is the API container, not the host.**
5. Restart only the SIZEY hub API service, verify `/hub-api/admin/ai/status` while authenticated, then generate a draft description. Keep the original description until reviewed.
6. Monitor CPU/RAM, latency and API errors. Roll back the hub API image if necessary.

The old OpenRouter settings file is not used. Do not delete it until backup and rollback requirements have been reviewed. The endpoint and model are controlled by server environment variables; admin users cannot redirect the API to arbitrary hosts.

Run `node --test server/ai-description.test.mjs` and `npm run build` before deployment.
