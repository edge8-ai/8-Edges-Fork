# ADR 0004 — Declared `requires` edges replace hand-numbered layers

Date: 2026-09-08. Status: accepted.

## Context

Each entity carries a hand-assigned `layer` number, and a door may import only a
lower-layer door. That made the door graph a DAG during the migration to entities. With
twenty entities after the Company OS and Team splits, numbers stop describing anything: a
reader cannot tell from "layer 3" what the entity actually needs, and adding an entity means
renumbering.

## Decision

Every entity declares `requires: [...]` in the catalogue. A door import from A into B is legal
only when A requires B, or B is in the mandatory set. Layers are derived as the longest
`requires` chain to the mandatory set, and the gate fails on any cycle. Cross-entity writes are
legal only along a `requires` edge or through the event bus, and the route-body exemption for
writes is withdrawn. Deployment files must be closed under `requires`; entity environment
declarations follow the same closure.

## Alternatives rejected

- Keep numbers and add `requires` beside them. Two sources of truth for one fact.
- Allow any import between optional entities and rely on review. That is how the 34 reverse
  edges from Company OS into Team accumulated.

## Consequences

- The `check:entity-layers` gate is retired and `check:requires`, `check:no-cross-writes`,
  `check:deployment` and `check:generated` take its place.
- An entity's dependencies are readable in one line of the catalogue, which is also what a
  deployment file author needs to know.
