# DEV_RUNBOOK_WINDOWS.md

This runbook captures issues and fixes encountered while bringing up ROIPLATFORM V2 on Windows (PowerShell), to be reused across projects.

Date: 2025-10-01
Author: Agent Mode (Warp)

Summary
- Stack: Java/Spring Boot services via Maven, Node/Express gateway, Vue 3 + Vite frontend, PostgreSQL 17.
- Windows specifics: Prefer Memurai (Redis-compatible). Avoid Docker in dev as per project docs. Use npm stable with workspace features disabled for isolated installs when needed.

Decisions
- Database name unified to roiplatform across Maven Flyway configs and app configs.
- For Windows dev, Redis health checks disabled in auth-service to prevent Actuator 503s when Redis isn’t running; recommend installing Memurai for full parity.

Steps performed and outcomes
1) Java build
- Command: mvn -B -pl shared/common-libs,services/auth-service -am clean install
- Result: SUCCESS

2) Flyway migration (baseline existing non-empty schema)
- Problem: Found non-empty schema but no flyway_schema_history.
- Change: services/auth-service/pom.xml -> flyway-maven-plugin: baselineOnMigrate=true
- Command: mvn -B -pl services/auth-service flyway:migrate
- Result: SUCCESS (baseline + schema current)

3) Unify DB name
- Changed JDBC URLs from roiplatform_dev to roiplatform in root and auth-service POMs.
- Verified DB exists; created if necessary.

4) Auth service start
- Command: SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/roiplatform; spring-boot:start
- Result: Started on 3001.
- Issue: /actuator/health returned 503 due to Redis health contributor.

5) Redis on Windows
- Observed installed Redis service (stopped) but failed to start (likely requires admin / missing binaries): Start-Service -Name Redis
- Workaround (dev): Disable Redis health in auth-service (application.yml):
  - management.health.redis.enabled=false
  - For profile dev/development, also excluded Redis auto-config:
    spring.autoconfigure.exclude:
      - org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
      - org.springframework.boot.autoconfigure.data.redis.RedisReactiveAutoConfiguration
- After restart: health still attempted Redis checks under some runs; excluding auto-config is the reliable fix; prefer installing Memurai to re-enable.

6) Gateway (Node/Express)
- Commands: npm install (services/gateway-service), GATEWAY_PORT=3100 npm run dev
- Result: Healthy: http://localhost:3100/health, /api/v1/status

7) Frontend (Vue/Vite)
- Issues and fixes:
  - npm workspaces interference from root package.json caused EUNSUPPORTEDPROTOCOL (workspace:*). Fix: removed root workspaces field for isolated install in this repo context.
  - Missing vue/index.mjs with Vue 3.5.22 caused Vite dev failure. Fix: pin vue to 3.5.11 (stable, satisfies pinia@2.3.1 peer).
  - esbuild binary error on Node 22: added devDependency esbuild@^0.21.5 explicitly.
  - Cleanup: remove deprecated/invalid dev deps (eslint-plugin-vue-a11y, windicss-analyzer) that break install.
  - When node_modules locked files prevented removal, closed node processes / re-ran install without full clean.
- Commands:
  - npm install (frontend/web-app) -> OK after adjustments
  - VITE_API_BASE_URL=http://localhost:3100 npm run dev -> returns 404 on root while starting; check logs in terminal window.

Recommendations (Windows)
- Redis-compatible: Install Memurai Developer (stable) as Windows service; default port 6379. Start as admin: Start-Service Memurai (or via Services.msc).
- If skipping Redis locally, keep spring.autoconfigure.exclude for Redis in dev profiles to avoid actuator 503.
- Keep Vue pinned to 3.5.11 until plugin-vue resolves index.mjs resolution for newer versions.
- Use npm LTS and keep eslint in ^8.56 for @vue/eslint-config-typescript@13 compatibility.

Admin requirements
- Starting Windows services (Redis/Memurai) typically needs elevated PowerShell.
- Deleting busy node_modules files may require closing terminals or admin shell.

Verification endpoints
- Auth: http://localhost:3001/actuator/health (should be 200 OK after Redis exclude)
- Gateway: http://localhost:3100/health, /api/v1/status
- Frontend: http://localhost:3000 (Vite banner appears in terminal; initial 404 until routes render)

Open items
- Re-enable Redis health once Memurai/Redis is installed.
- Add OpenAPI UI endpoint confirmation for auth service.
- Add minimal auth API smoke tests and frontend login flow wiring.
