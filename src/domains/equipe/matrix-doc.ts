import { format } from "prettier";

import { permissionsMarkdown } from "./matrix";

export function formattedPermissionsMarkdown(): Promise<string> {
  return format(permissionsMarkdown(), { parser: "markdown" });
}
