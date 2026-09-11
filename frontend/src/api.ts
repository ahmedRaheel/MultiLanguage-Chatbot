import { getAccessToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type UserRole = "admin" | "user";

export type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  is_active: boolean;
};

export type Source = {
  document_id: string;
  filename: string;
  page_number: number | null;
  chunk_index: number;
  score: number;
  excerpt: string;
};

export type ChatReply = {
  conversation_id: string;
  answer: string;
  sources: Source[];
  cache_hit: boolean;
  cache_similarity: number | null;
};

export type KnowledgeDocument = {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
};

async function authenticatedHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const token = await getAccessToken();

  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function ensureSuccessfulResponse(response: Response): Promise<Response> {
  if (response.ok) {
    return response;
  }

  let message = `Request failed (${response.status})`;

  try {
    const body = await response.json();
    message = body.detail || message;
  } catch {
    // Keep the status-based fallback message.
  }

  throw new Error(message);
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: await authenticatedHeaders(),
  });

  await ensureSuccessfulResponse(response);
  return response.json();
}

export async function sendChat(
  message: string,
  conversationId: string | null,
  language: string,
  useKnowledgeBase: boolean,
): Promise<ChatReply> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: await authenticatedHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      language: language || null,
      use_knowledge_base: useKnowledgeBase,
    }),
  });

  await ensureSuccessfulResponse(response);
  return response.json();
}

export async function uploadDocument(file: File): Promise<KnowledgeDocument> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "POST",
    headers: await authenticatedHeaders(),
    body: formData,
  });

  await ensureSuccessfulResponse(response);
  return response.json();
}

export async function getDocuments(): Promise<KnowledgeDocument[]> {
  const response = await fetch(`${API_BASE_URL}/api/documents`, {
    headers: await authenticatedHeaders(),
  });

  await ensureSuccessfulResponse(response);
  return response.json();
}

export async function deleteDocument(documentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: await authenticatedHeaders(),
  });

  await ensureSuccessfulResponse(response);
}

export async function transcribeAudio(
  blob: Blob,
  language: string,
): Promise<{ text: string; language: string | null }> {
  const formData = new FormData();
  formData.append("file", blob, "speech.webm");

  if (language) {
    formData.append("language", language.split("-")[0]);
  }

  const response = await fetch(`${API_BASE_URL}/api/speech/transcribe`, {
    method: "POST",
    headers: await authenticatedHeaders(),
    body: formData,
  });

  await ensureSuccessfulResponse(response);
  return response.json();
}
