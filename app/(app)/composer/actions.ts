"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/admin";
import { archiveContentIdea, createContentIdea, createGeneratedOutput, updateContentIdea, updateGeneratedOutputStatus } from "@/lib/content";
import {
  contentIdeaArchiveSchema,
  contentIdeaCreateSchema,
  contentIdeaUpdateSchema,
  formDataToContentRecord,
  generatedOutputCreateSchema,
  generatedOutputStatusActionSchema,
} from "@/lib/content/validation";

function redirectWithNotice(params: Record<string, string>): never {
  redirect(`/composer?${new URLSearchParams(params).toString()}`);
}

export async function createContentIdeaAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = contentIdeaCreateSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "idea_validation_failed" });
  }

  const idea = await createContentIdea(admin, parsed.data);
  redirectWithNotice({ notice: "idea_created", selected: idea.id });
}

export async function updateContentIdeaAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = contentIdeaUpdateSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "idea_update_failed" });
  }

  const idea = await updateContentIdea(admin, parsed.data);
  redirectWithNotice({ notice: "idea_updated", selected: idea.id });
}

export async function archiveContentIdeaAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = contentIdeaArchiveSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "idea_archive_failed" });
  }

  await archiveContentIdea(admin, parsed.data.id);
  redirectWithNotice({ notice: "idea_archived" });
}

export async function saveGeneratedOutputAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = generatedOutputCreateSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "output_validation_failed" });
  }

  const output = await createGeneratedOutput(admin, parsed.data);
  redirectWithNotice({ notice: "output_saved", output: output.id });
}

export async function updateGeneratedOutputStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = generatedOutputStatusActionSchema.safeParse(formDataToContentRecord(formData));

  if (!parsed.success) {
    redirectWithNotice({ notice: "output_action_failed" });
  }

  await updateGeneratedOutputStatus(admin, parsed.data);
  redirectWithNotice({ notice: `output_${parsed.data.action}` });
}
