# Tehran Radar — GitHub main branch, local Docker development

This working tree was cloned from `bijanbijane/radartehran` branch `main`.
The checked-out source commit is the result of `git rev-parse HEAD`.
The local working branch is `docker/main-debug-2026-11-25`.

## Start
```sh
docker compose -f compose.main.local.yaml up --build -d
```

Open http://localhost:3001

## Verify and inspect
```sh
docker compose -f compose.main.local.yaml ps
docker compose -f compose.main.local.yaml logs -f radar-main
curl -fsS http://localhost:3001/api/healthz
```

## Stop / restart
```sh
docker compose -f compose.main.local.yaml down
docker compose -f compose.main.local.yaml up -d
```

The host port is bound to 127.0.0.1 only. No `.env` or runtime credentials are included.
node_modules, module cache, and media storage are isolated in Docker named volumes.
The source tree is bind-mounted for development/HMR. Changes remain in this local clone.
