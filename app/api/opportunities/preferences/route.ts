import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { opportunityPreferenceInputSchema } from "../../../../lib/opportunity-preferences/domain";
import {
  deleteOpportunityPreference,
  deleteOpportunityPreferencesByState,
  listOpportunityPreferences,
  saveOpportunityPreference,
} from "../../../../lib/opportunity-preferences/repository";

const deleteSchema = z.object({ key: z.string().trim().min(1).max(160) });

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET() {
  try {
    const identity = await requireGuestIdentity();
    return privateJson({
      preferences: await listOpportunityPreferences(identity.hash),
      authenticated: Boolean(identity.userId),
    });
  } catch (error) {
    return privateJson(
      {
        error: {
          code: "PREFERENCES_LOAD_FAILED",
          message: error instanceof Error ? error.message : "저장한 사업을 불러오지 못했습니다.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const input = opportunityPreferenceInputSchema.parse(await request.json());
    const preference = await saveOpportunityPreference({
      identityHash: identity.hash,
      ownerId: identity.userId,
      state: input.state,
      opportunity: input.opportunity,
    });
    return privateJson({ preference, authenticated: Boolean(identity.userId) });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return privateJson(
      {
        error: {
          code: validation ? "PREFERENCE_INVALID" : "PREFERENCE_SAVE_FAILED",
          message: validation
            ? "저장할 사업 정보가 올바르지 않습니다."
            : error instanceof Error
              ? error.message
              : "사업을 저장하지 못했습니다.",
        },
      },
      { status: validation ? 400 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("state") === "excluded") {
      await deleteOpportunityPreferencesByState(identity.hash, "excluded");
      return privateJson({ deleted: true });
    }
    const input = deleteSchema.parse({ key: searchParams.get("key") });
    await deleteOpportunityPreference(identity.hash, input.key);
    return privateJson({ deleted: true });
  } catch (error) {
    const validation = error instanceof z.ZodError;
    return privateJson(
      {
        error: {
          code: validation ? "PREFERENCE_INVALID" : "PREFERENCE_DELETE_FAILED",
          message: validation
            ? "삭제할 사업을 확인하지 못했습니다."
            : error instanceof Error
              ? error.message
              : "저장 상태를 변경하지 못했습니다.",
        },
      },
      { status: validation ? 400 : 500 },
    );
  }
}
