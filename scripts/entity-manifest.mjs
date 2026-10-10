// Reads entities.manifest.json and answers "which entity owns this path?".
//
// The manifest is the single description of the multi-entity layout
// (docs/engineering/2026-09-03-multi-entity-design.md). Two gates are derived
// from it — the ESLint boundary zones (scripts/gen-entity-zones.mjs) and the
// cross-entity import gate (scripts/check-entity-imports.mjs) — and the
// table-ownership ratchet (scripts/check-table-ownership.mjs) is the third. Keeping the resolver here
// means every gate agrees on who owns a file.
//
// Resolution is longest-prefix over every `current` and `target` entry. An
// entry names a directory (matches everything beneath it), an exact file, or an
// extensionless stem: `kernel/config/env` owns env.ts, env.test.ts and env/.
// Since ME-13 every `current` is `[target]`, so an entity owns exactly its
// directory. Files under app/ belong to the composition root, named "app";
// anything else unclaimed is "unassigned" so the gate can show it.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";

export const MANIFEST_FILE = "entities.manifest.json";
export const KERNEL = "kernel";
export const APP_ROOT = "app";
export const UNASSIGNED = "unassigned";

export function loadManifest(root) {
  const file = path.join(root, MANIFEST_FILE);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  validateManifest(manifest);
  return manifest;
}

/** Throws with a plain message when the manifest shape is wrong. */
export function validateManifest(manifest) {
  if (!manifest.kernel?.target) throw new Error(`${MANIFEST_FILE}: kernel.target is required`);
  if (!manifest.entities || typeof manifest.entities !== "object") {
    throw new Error(`${MANIFEST_FILE}: entities must be an object`);
  }
  const seen = new Map();
  const claim = (entry, owner) => {
    const norm = normalizeEntry(entry);
    if (seen.has(norm) && seen.get(norm) !== owner) {
      throw new Error(`${MANIFEST_FILE}: "${entry}" is claimed by both ${seen.get(norm)} and ${owner}`);
    }
    seen.set(norm, owner);
  };
  claim(manifest.kernel.target, KERNEL);
  for (const entry of manifest.kernel.current ?? []) claim(entry, KERNEL);
  for (const [name, entity] of Object.entries(manifest.entities)) {
    if (!entity.target) throw new Error(`${MANIFEST_FILE}: entities.${name}.target is required`);
    // Deciding this is the point: an entity with no portability is one nobody
    // has decided may leave, and the fork sync would otherwise ship it by
    // default. Fail here rather than in the sync, where the cost is a leak.
    if (entity.portability !== "portable" && entity.portability !== "internal") {
      throw new Error(
        `${MANIFEST_FILE}: entities.${name}.portability must be "portable" or "internal" — ` +
          `decide whether this entity may leave the repo (ADR 0001) before adding it.`,
      );
    }
    for (const rel of entity.ownedPaths ?? []) {
      if (rel.startsWith("/") || rel.includes("..") || rel.startsWith("entities/")) {
        throw new Error(
          `${MANIFEST_FILE}: entities.${name}.ownedPaths is for paths OUTSIDE entities/ ` +
            `(scripts, supabase functions); "${rel}" belongs in target/current instead`,
        );
      }
    }
    for (const rel of entity.internalPaths ?? []) {
      if (rel.startsWith("/") || rel.includes("..")) {
        throw new Error(`${MANIFEST_FILE}: entities.${name}.internalPaths must be entity-relative: "${rel}"`);
      }
    }
    if (entity.portability === "internal" && (entity.internalPaths ?? []).length > 0) {
      throw new Error(`${MANIFEST_FILE}: entities.${name} is internal, so internalPaths is redundant`);
    }
    claim(entity.target, name);
    for (const entry of entity.current ?? []) claim(entry, name);
    for (const m of entity.modules ?? []) {
      if (!/^[a-z][a-z0-9-]*$/.test(m)) throw new Error(`${MANIFEST_FILE}: bad module name "${m}" in ${name}`);
    }
  }
}

function normalizeEntry(entry) {
  return entry.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Every (entry, owner) pair, sorted longest entry first so the first hit wins. */
export function ownershipEntries(manifest) {
  const out = [];
  out.push([normalizeEntry(manifest.kernel.target), KERNEL]);
  for (const entry of manifest.kernel.current ?? []) out.push([normalizeEntry(entry), KERNEL]);
  for (const [name, entity] of Object.entries(manifest.entities)) {
    out.push([normalizeEntry(entity.target), name]);
    for (const entry of entity.current ?? []) out.push([normalizeEntry(entry), name]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
}

/** True when `entry` owns `rel` under the directory / file / stem rules above. */
export function entryMatches(entry, rel) {
  if (rel === entry) return true;
  if (rel.startsWith(`${entry}/`)) return true;
  // A stem entry (no extension in its last segment) also owns its extension
  // siblings, so `lib/env` covers lib/env.ts and lib/env.test.ts. An entry that
  // already carries an extension (`app/page.tsx`, `lib/ogRender.js`) matches exactly.
  const last = entry.slice(entry.lastIndexOf("/") + 1);
  const hasExtension = /\.[a-z0-9]+$/i.test(last);
  return !hasExtension && rel.startsWith(`${entry}.`);
}

/**
 * Owner of a repo-relative path: an entity name, "kernel", "app" for unclaimed
 * files under app/, or "unassigned".
 */
export function entityOf(rel, manifest, entries = ownershipEntries(manifest)) {
  const norm = normalizeEntry(rel);
  for (const [entry, owner] of entries) {
    if (entryMatches(entry, norm)) return owner;
  }
  if (norm === APP_ROOT || norm.startsWith(`${APP_ROOT}/`)) return APP_ROOT;
  return UNASSIGNED;
}

/** Entity names in manifest order. */
export function entityNames(manifest) {
  return Object.keys(manifest.entities);
}
