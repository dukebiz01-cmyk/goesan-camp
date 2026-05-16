// js/uploads.js — v5.3 (Supabase Storage 한글 키 회피)
import { db } from "./supabase.js";
import { STORAGE_BUCKET, state } from "./config.js";
import { toast } from "./utils.js";

// 한글 docType → 영문 디렉토리 매핑 (Supabase Storage path는 ASCII만)
const DOC_TYPE_PATH = {
  // 보조사업 서류함 (회원)
  "사업계획서": "plan",
  "견적서": "quote",
  "업체자료": "vendor_doc",
  "행사사진": "photo",
  "지출증빙": "expense",
  "정산자료": "settlement",
  "기타": "etc",
  "자료": "doc",
  // 사업자 서류 (vendors)
  "사업자등록증": "license",
  "계좌사본": "bankbook",
  "명함": "card",
};

function safeDirName(docType) {
  if (DOC_TYPE_PATH[docType]) return DOC_TYPE_PATH[docType];
  // 매핑 없으면 ASCII만 허용, 빈 결과면 "doc"
  return docType.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "doc";
}

function safeFileName(name) {
  // Supabase Storage는 ASCII path만 안전 → 한글 파일명도 영문화
  // 확장자는 유지
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot > 0 ? name.slice(lastDot) : "";
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "file";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");
  return safeBase + safeExt;
}

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
    const safe = safeFileName(file.name);
    const dir = safeDirName(docType);
    const uid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const path = `${targetType}/${targetId}/${dir}/${uid}_${safe}`;

    const up = await db.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false });
    if (up.error) throw up.error;

    // attachments DB에는 원본 한글 파일명 + 한글 doc_type 그대로 저장
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

// 첨부파일 목록 조회 (특정 target)
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

// 첨부파일 삭제 (Storage + DB)
export async function deleteAttachment(file) {
  if (!file?.file_path) throw new Error("파일 경로 없음");
  const bucket = file.bucket || STORAGE_BUCKET;
  const { error: stErr } = await db.storage.from(bucket).remove([file.file_path]);
  if (stErr) console.warn("storage remove error:", stErr);
  const { error: dbErr } = await db.from("attachments").delete().eq("id", file.id);
  if (dbErr) throw dbErr;
  return true;
}
