// main.ts — Coral Verde entry program (Node 22, standard library only).
//
// Hands the game in: copies game/ and screenshots/ from this repository
// into the output directory and writes /output/dossier.json with
// buildDossier from vendor/makefun-game.ts (the kit's copy, unchanged).
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
// Runs twice with identical bytes: the copy is a fresh wipe + copy, and
// the dossier is a pure function of the files it reads.

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function main(): void {
  const gameSrc = join(REPO_ROOT, 'game');
  const shotsSrc = join(REPO_ROOT, 'screenshots');
  if (!existsSync(gameSrc)) {
    throw new Error(`game/ not found under ${REPO_ROOT}`);
  }
  if (!existsSync(shotsSrc)) {
    throw new Error(`screenshots/ not found under ${REPO_ROOT}`);
  }

  // Fresh output every run, so a second run writes exactly the same bytes.
  // The wipe is scoped to the output directory alone; the repository is
  // never written to (the grader mounts it read-only).
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  cpSync(gameSrc, join(OUTPUT_DIR, 'game'), { recursive: true });
  cpSync(shotsSrc, join(OUTPUT_DIR, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
}

main();
