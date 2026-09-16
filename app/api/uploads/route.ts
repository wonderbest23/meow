import { NextResponse } from "next/server";
import { getServerSupabase } from "../../../lib/persistence";
import { getAuthenticatedUser } from "../../../lib/account-auth";
import { enforceRateLimit } from "../../../lib/rate-limit";
import { hashIdentityToken, userProjectToken } from "../../../lib/identity-tokens";
import { containsUploadReference, issueUploadCleanupToken, readUploadCleanupToken } from "../../../lib/landing/upload-cleanup";

export const runtime = "nodejs";

/*
 * 홈페이지에 넣을 사진 업로드.
 *
 * 예전에는 사진을 base64 문자열로 페이지 JSON에 그대로 넣었다. 한 장에 최대
 * 900KB라 몇 장만 올려도 페이지 전체가 4MB 한도에 걸려 저장이 막혔다.
 * 파일은 스토리지에 두고 JSON에는 주소만 남긴다.
 *
 * 검사는 서버에서 한다 — 화면 쪽 검사는 우회할 수 있고, 이 경로는 로그인한
 * 사람이 우리 스토리지에 파일을 쓰는 통로다.
 */

const BUCKET = "landing-images";
const MAX_BYTES = 5 * 1024 * 1024;
/* 스키마(landingImage)가 허용하는 세 가지와 같아야 한다 */
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: Request) {
  const limited = await enforceRateLimit("upload-image", req, {
    limit: 40,
    windowMs: 10 * 60_000,
    message: "사진 업로드가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;

  // 손님은 올릴 수 없다 — 파일은 계정에 귀속된다
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required", message: "사진을 선택해주세요." }, { status: 400 });
  }

  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "unsupported_type", message: "PNG, JPG, WEBP 형식만 올릴 수 있습니다." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "사진은 5MB까지 올릴 수 있습니다." },
      { status: 413 },
    );
  }

  /*
   * 경로에 계정을 넣어 누구 파일인지 남긴다. 이름은 무작위로 짓는다 —
   * 사용자가 올린 파일명을 그대로 쓰면 경로를 거슬러 올라가거나 남의 파일을
   * 덮어쓸 수 있다.
   */
  const name = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(name, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    console.error("[upload] 실패:", error.message);
    return NextResponse.json(
      { error: "upload_failed", message: "사진을 올리지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
  if (!data?.publicUrl) {
    await supabase.storage.from(BUCKET).remove([name]);
    return NextResponse.json({ error: "url_failed", message: "사진 주소를 만들지 못했습니다." }, { status: 502 });
  }
  const secret = process.env.AUTH_PROJECT_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const cleanupToken = form?.get("editorDraft") === "true" && secret ? issueUploadCleanupToken(name, user.id, secret) : undefined;
  return NextResponse.json({ url: data.publicUrl, ...(cleanupToken ? { cleanupToken } : {}) });
}

export async function DELETE(req: Request) {
  const limited = await enforceRateLimit("discard-editor-image", req, { limit: 40, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const secret = process.env.AUTH_PROJECT_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const path = typeof body?.cleanupToken === "string" ? readUploadCleanupToken(body.cleanupToken, user.id, secret) : null;
  if (!path) return NextResponse.json({ error: "invalid_cleanup_receipt" }, { status: 400 });
  const db = getServerSupabase();
  if (!db) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);
  const owner = hashIdentityToken(userProjectToken(user.id));
  const plans = await db.from("plan_states").select("data").eq("owner_hash", owner).maybeSingle();
  if (plans.error) return NextResponse.json({ error: "reference_check_failed" }, { status: 503 });
  if (containsUploadReference(plans.data?.data, publicUrl)) return NextResponse.json({ error: "upload_in_use" }, { status: 409 });
  // Check every saved draft and published history page; never delete an accepted image.
  for (let from = 0; ; from += 100) {
    const projects = await db.from("projects").select("id").or(`owner_id.eq.${user.id},guest_token_hash.eq.${owner}`).order("id").range(from, from + 99);
    if (projects.error) return NextResponse.json({ error: "reference_check_failed" }, { status: 503 });
    for (const project of projects.data ?? []) {
      const sites = await db.from("landing_sites").select("id,draft").eq("project_id", project.id);
      if (sites.error) return NextResponse.json({ error: "reference_check_failed" }, { status: 503 });
      for (const site of sites.data ?? []) {
        if (containsUploadReference(site.draft, publicUrl)) return NextResponse.json({ error: "upload_in_use" }, { status: 409 });
        for (let offset = 0; ; offset += 100) {
          const versions = await db.from("landing_versions").select("config").eq("site_id", site.id).order("version").range(offset, offset + 99);
          if (versions.error) return NextResponse.json({ error: "reference_check_failed" }, { status: 503 });
          if (versions.data.some(version => containsUploadReference(version.config, publicUrl))) return NextResponse.json({ error: "upload_in_use" }, { status: 409 });
          if (versions.data.length < 100) break;
        }
      }
    }
    if ((projects.data?.length ?? 0) < 100) break;
  }
  const removed = await db.storage.from(BUCKET).remove([path]);
  if (removed.error) return NextResponse.json({ error: "cleanup_failed" }, { status: 502 });
  return NextResponse.json({ removed: true });
}
