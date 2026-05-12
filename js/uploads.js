import { db } from "./supabase.js";
import { STORAGE_BUCKET, state } from "./config.js";
import { toast } from "./utils.js";

export async function uploadFiles(files, { targetType = "library", targetId = "general", docType = "자료" } = {}) {
  if (!files || !files.length) return [];
  if (!state.member?.id) throw new Error("회원 정보가 없습니다.");

  const uploaded = [];
  for (const file of [...files]) {
    if (file.size > 50 * 1024 * 1024) {
      toast(`${file.name}: 50MB 초과`);
      continue;
    }
    const safe = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
    const uid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const path = `${targetType}/${targetId}/${docType}/${uid}_${safe}`;

    const up = await db.storage.from(STORAGE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
    if (up.error) throw up.error;

    const row = {
      target_type: targetType,
      target_id: String(targetId),
      uploaded_by: state.member.id,
      bucket: STORAGE_BUCKET,
      file_path: path,
      file_name: `[${docType}] ${file.name}`,
      file_size: file.size,
      mime_type: file.type || null,
      doc_type: docType,
    };

    const ins = await db.from("attachments").insert(row).select("*").maybeSingle();
    if (ins.error) throw ins.error;
    uploaded.push(ins.data);
  }
  return uploaded;
}

export async function signedUrl(file) {
  if (!file?.file_path) return file?.file_url || "#";
  const { data, error } = await db.storage.from(file.bucket || STORAGE_BUCKET).createSignedUrl(file.file_path, 60 * 10);
  if (error) return "#";
  return data?.signedUrl || "#";
}
