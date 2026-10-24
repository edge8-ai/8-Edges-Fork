# ADR 0001 — One self-hosted deployment per client, chosen at build time

Date: 2026-09-08. Status: accepted.

## Context

Edge8 wants a client to be able to run a subset of the product's entities, the way an Odoo
customer installs some addons and not others. Three shapes were possible: hide unused
surfaces in a single Edge8 deployment; run several tenants on one deployment with per-tenant
configuration and row-level tenancy; or build one deployment per client from a deployment
file that lists the included entities.

## Decision

One deployment per client, hosted by the client. The client runs the code on their own
Vercel and Supabase accounts and owns the data outright; Edge8 supports on request and
does not operate the instance. A deployment file, closed under hard dependencies, selects
entities from the catalogue at build time. The composition root and its mounts, cron
schedule and shell contributions are generated from that file. Excluded entities do not
exist in the build.

## Consequences

- No multi-tenancy work: tables keep assuming one company, and no request-time check
  decides whether a feature exists.
- Edge8 carries no hosting cost and no operational duty per client. In exchange the repo
  must be installable by a stranger: a documented install path, a setup checklist generated
  from the deployment file, no Edge8-specific value baked into code, and the brand and
  company identity read from configuration.
- Clients never see Edge8's repository. Edge8 first gets the code right here, then hand-ports
  chosen entities into a separate product repository that clients can access. Porting is a
  deliberate, manual act per release, never automated, so internal entities and unreleased
  work cannot leak. Clients pull upgrades from the product repository, so every change must
  keep a client's deployment file and configuration untouched, and migrations must be
  additive.
- Every entity is marked internal or portable in the catalogue, and a portable entity may
  never require an internal one, or the port would not build.
- Support is by request, so Edge8 sees nothing at runtime unless the client opts into
  sharing. No telemetry is assumed.
- Tenancy on top of the same entity boundaries remains possible later if Edge8 ever hosts.
- Two deployment files, full and minimal, must be built in CI so exclusion is exercised on
  every change.
