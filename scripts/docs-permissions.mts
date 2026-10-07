/** Régénère docs/securite/permissions.md depuis le code (pnpm docs:permissions). */
import { writeFile } from "node:fs/promises";

import { formattedPermissionsMarkdown } from "../src/domains/equipe/matrix-doc";

await writeFile(
  "docs/securite/permissions.md",
  await formattedPermissionsMarkdown(),
);
console.warn("docs/securite/permissions.md à jour.");
