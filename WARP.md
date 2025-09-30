# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project scope
- Monorepo combining Java (Maven, Spring Boot) microservices and Node/Vue apps.
- Primary services today: Auth Service (Java) and API Gateway (Node). A Spring Cloud Gateway also exists but is not wired into the root Maven aggregator.
- Shared Java library provides common Spring components used across services.

Commands you’ll use most

Environment setup (Windows, PowerShell)
- Optional bootstrapping scripts at the repo root:
  - .\setup-development-environment.ps1
  - .\verify-development-environment.ps1

Java (Maven) — root aggregator and services/auth-service
- Build all Java modules (root aggregator includes shared/common-libs and services/auth-service):
  - mvn clean install
- Build a specific module with its dependencies:
  - mvn -pl services/auth-service -am clean install
- Run Auth Service (Spring Boot, dev profile):
  - mvn -pl services/auth-service spring-boot:run -Dspring-boot.run.profiles=dev
- Run all unit tests:
  - mvn test
- Run tests in a specific module only:
  - mvn -pl services/auth-service test
- Run a single test class or test method (in module scope):
  - mvn -pl services/auth-service -Dtest=ClassName test
  - mvn -pl services/auth-service -Dtest=ClassName#methodName test
- Run integration tests (Failsafe) for modules that define ITs:
  - mvn -P integration-test verify
- Code coverage (JaCoCo): generated under target/site/jacoco after tests.
- Database migrations (Flyway):
  - Root plugin uses shared/database/migrations. To run with explicit DB settings:
    - mvn -Dflyway.url={{JDBC_URL}} -Dflyway.user={{DB_USER}} -Dflyway.password={{DB_PASSWORD}} flyway:migrate
  - Auth Service has its own Flyway config under src/main/resources/db/migration:
    - mvn -pl services/auth-service flyway:migrate

Node.js — services/gateway-service (Express API Gateway)
- Install deps:
  - cd services/gateway-service && npm ci
- Start in dev with automatic reload:
  - $env:GATEWAY_PORT="3100"; npm run dev
- Start in production mode:
  - npm start
- Run all tests (Jest):
  - npm test
- Run a single test file or test by name:
  - npx jest path/to/file.test.js
  - npx jest -t "test name substring"
- Lint:
  - npm run lint

Frontend — frontend/web-app (Vue 3 + Vite + Vitest)
- Install deps:
  - cd frontend/web-app && npm ci
- Start dev server (Vite, default port 3000):
  - $env:VITE_API_BASE_URL="http://localhost:3100"; npm run dev
- Build:
  - npm run build
- Preview build locally:
  - npm run preview
- Tests (Vitest):
  - All: npm run test
  - Coverage: npm run test:coverage
  - Single test: npx vitest run path/to/file.test.ts -t "test name substring"
- Lint and formatting:
  - ESLint: npm run lint
  - Stylelint: npm run lint:style
  - Prettier: npm run format
- Type check:
  - npm run type-check
- Storybook:
  - npm run storybook

Optional — backend/roiplatform-gateway (Spring Cloud Gateway)
- This is a separate Spring Cloud Gateway project not included in the root aggregator. Typical commands:
  - Build: mvn -f backend/roiplatform-gateway/pom.xml clean package
  - Run: mvn -f backend/roiplatform-gateway/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev

High-level architecture and flow
- API boundary and routing
  - The default development gateway is services/gateway-service (Node + Express). It listens on GATEWAY_PORT (default 3000) and exposes:
    - GET /health — service health
    - /api/v1/* — proxied to backend services with per-service path prefixes
  - Proxy routing (see services/gateway-service/src/routes/index.js):
    - /api/v1/auth -> http://localhost:${AUTH_SERVICE_PORT|3001}
    - /api/v1/tenant -> http://localhost:${TENANT_SERVICE_PORT|3002}
    - /api/v1/i18n -> http://localhost:${I18N_SERVICE_PORT|3003}
    - /api/v1/notification -> http://localhost:${NOTIFICATION_SERVICE_PORT|3004}
    - /api/v1/files -> http://localhost:${FILE_DMS_SERVICE_PORT|3005}
    - /api/v1/pmis -> http://localhost:${PMIS_COLLAB_SERVICE_PORT|3006}
  - The gateway forwards and normalizes headers:
    - Tenant context header X-Tenant-Id (configurable via TENANT_HEADER)
    - X-Request-Id tracing header
  - Errors are standardized via a centralized error handler (services/gateway-service/src/middleware/errorHandler.js).

- Backend services (Java, Spring Boot)
  - services/auth-service
    - Uses shared/common-libs for common Spring components (security, web, validation, Redis, JPA, JWT, etc.).
    - Flyway manages schema migrations (module-local configuration). Testcontainers are available for integration testing.
  - shared/common-libs
    - Shared JAR with Spring starters, security, JPA, JSON, JWT utilities, OpenAPI, and monitoring integrations; managed via the root Maven BOMs and pluginManagement.
  - Root Maven project (pom packaging)
    - Centralizes versions (Spring Boot/Cloud, PostgreSQL, Flyway, Lombok, MapStruct), and sets up Surefire/Failsafe/JaCoCo defaults. Modules:
      - shared/common-libs
      - services/auth-service

- Frontend (Vue 3 + Vite)
  - Vite dev server defaults to port 3000 and proxies API calls via VITE_API_BASE_URL (vite.config.ts). For local end-to-end dev, point it at the running gateway, e.g., VITE_API_BASE_URL=http://localhost:3100.
  - Aliases (@, @components, @views, etc.) and PWA setup are configured in frontend/web-app/vite.config.ts.
  - Testing is via Vitest (jsdom environment with a setup file), with coverage outputs configured.

- Port coordination in local dev
  - The Vue dev server and Node gateway both default to port 3000. To avoid conflicts, either:
    - Change the gateway port (recommended): $env:GATEWAY_PORT="3100"; npm run dev
    - Or run the Vue dev server on a different port via Vite config/CLI.

Key references
- README.md — overall project description, endpoints, and environment expectations.
- docs/README.md — links to environment setup and development checklists.
- shared/database/migrations — canonical Flyway scripts used by the root Flyway plugin.
- frontend/web-app/vite.config.ts — dev server, proxy, aliases, PWA, and test settings.
- services/gateway-service/src — gateway routing, security middleware, and logging.
