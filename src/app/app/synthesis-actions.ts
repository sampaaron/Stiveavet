"use server";

import { z } from "zod";

import { DomainError } from "@/domains/commun/actor";
import { memberContext } from "@/server/authz";
import { services } from "@/server/services";

import { text } from "./form-data";

/** Note au journal la copie d'une synthèse pour dr.veto ; rien d'autre ne part. */
export async function recordSynthesisCopyAction(form: FormData): Promise<void> {
  const followupId = z.uuid().safeParse(text(form, "followupId"));
  if (!followupId.success) return;
  const context = await memberContext();
  try {
    await services.synthesis().recordCopy(context, followupId.data);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
}
