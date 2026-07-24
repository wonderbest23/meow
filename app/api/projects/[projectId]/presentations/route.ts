import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import { getProject, savePresentationDecks } from "../../../../../lib/project-repository";

const slideOverrideSchema = z.object({
  title: z.string().trim().max(180).optional(),
  lead: z.string().trim().max(700).optional(),
  statement: z.string().trim().max(900).optional(),
  supporting: z.string().trim().max(700).optional(),
  note: z.string().trim().max(700).optional(),
  chartPreset: z.enum(["fit", "traction"]).nullable().optional(),
});

const deckDraftSchema = z.object({
  slides: z.record(z.string().regex(/^[a-z0-9-]+$/), slideOverrideSchema)
    .refine((slides) => Object.keys(slides).length <= 20, "슬라이드 수정값이 너무 많습니다."),
  updatedAt: z.string().datetime(),
});

const requestSchema = z.object({
  decks: z.object({
    intro: deckDraftSchema.optional(),
    ir: deckDraftSchema.optional(),
  }),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const project = await getProject(projectId, identity.hash);
    if (!project) {
      return privateJson({ error: { code: "PROJECT_NOT_FOUND", message: "프로젝트를 찾을 수 없습니다." } }, { status: 404 });
    }
    return privateJson({ decks: project.presentationDecks ?? {} });
  } catch (error) {
    return privateJson({
      error: {
        code: "PRESENTATION_LOAD_FAILED",
        message: error instanceof Error ? error.message : "발표자료 수정본을 불러오지 못했습니다.",
      },
    }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const identity = await requireGuestIdentity();
    const input = requestSchema.parse(await request.json());
    const decks = await savePresentationDecks(projectId, identity.hash, input.decks);
    return privateJson({ decks, savedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "발표자료 수정본을 저장하지 못했습니다.";
    return privateJson({
      error: {
        code: message === "PROJECT_NOT_FOUND" ? message : "PRESENTATION_SAVE_FAILED",
        message,
      },
    }, { status: message === "PROJECT_NOT_FOUND" ? 404 : 400 });
  }
}
