# Documentation

This file is an overlay for 8-Edges-Fork. Upstream's `docs/README.md` is an
index of about thirty documents — the product north-star, the epics, the
architecture and engineering handbooks, the sprint and change logs — and it
names an owner. Twenty-four of its links point at documents that are internal
and do not sync, so in a fork it was a page of dead links under somebody else's
name.

These are the documents a fork actually receives. Each is here because it
explains something the code does not say on its own.

| Document | What it is for |
|---|---|
| [Architecture overview](./architecture-overview.md) | How the tree is laid out: the kernel, the entities, the composition root in `app/`, and the gates that keep them apart. Start here. |
| [Data dictionary](./db/data-dictionary.md) | Every table and column, what one row means, and who owns it. |

## Decision records

The reasoning behind the shape of the codebase. An ADR is not a manual: it says
what was decided, what it cost, and what would have to change to decide
otherwise.

| ADR | Decision |
|---|---|
| [0001](./adr/0001-one-deployment-per-client.md) | One deployment per client, not one multi-tenant instance. |
| [0002](./adr/0002-kernel-shells-and-entity-contributions.md) | The kernel owns the shells; entities contribute into them. |
| [0003](./adr/0003-in-process-event-bus.md) | An in-process event bus, not a queue. |
| [0004](./adr/0004-requires-edges-replace-hand-numbered-layers.md) | Dependency edges replace hand-numbered layers. |
| [0005](./adr/0005-portability-is-declared-not-remembered.md) | What may leave this repository is declared in the manifest, not remembered by a person. |
