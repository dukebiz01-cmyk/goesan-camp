// js/uploads.js — v5.2 (bucket 옵션 추가)
import { db } from "./supabase.js";
import { STORAGE_BUCKET, state } from "./config.js";
import { toast } from "./utils.js";

export async function uploadFiles(files, {
  targetType = "library",
  targetId = "general",
  docType = "자료",
  bucket = STORAGE_BUCKET,
  maxSizeMB = 50,
} = {}) {
  if (!files || !files.length) return [];
  if (!state.member?.id) throw new Error("회원 정보가 없습니다.");

  const uploaded = [];
  for (const file of [...files]) {
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast(`${file.name}: ${maxSizeMB}MB 초과`);
      continue;
    }
    const safe = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
    const uid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const path = `${targetType}/${targetId}/${docType}/${uid}_${safe}`;

    const up = await db.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false });
    if (up.error) throw up.error;

    const row = {
      target_type: targetType,
      target_id: String(targetId),
      uploaded_by: state.member.id,
      bucket: bucket,
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

// ★ NEW: 첨부파일 목록 조회 (특정 target)
export async function listAttachments({ targetType, targetId, docType = null }) {
  let q = db.from("attachments")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", String(targetId))
    .order("created_at", { ascending: false });
  if (docType) q = q.eq("doc_type", docType);
  const { data, error } = await q;
  if (error) {
    console.warn("listAttachments error:", error);
    return [];
  }
  return data || [];
}

// ★ NEW: 첨부파일 삭제 (Storage + DB)
export async function deleteAttachment(file) {
  if (!file?.file_path) throw new Error("파일 경로 없음");
  const bucket = file.bucket || STORAGE_BUCKET;
  // Storage에서 삭제
  const { error: stErr } = await db.storage.from(bucket).remove([file.file_path]);
  if (stErr) console.warn("storage remove error:", stErr);
  // DB에서 삭제
  const { error: dbErr } = await db.from("attachments").delete().eq("id", file.id);
  if (dbErr) throw dbErr;
  return true;
}
