const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type UserRole = "admin" | "user";

export type CurrentUser = {
  id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type RegisterRequest = {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  password: string;
  confirm_password: string;
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

async function readError(response: Response): Promise<string> {
  let message = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(" · ") || message;
    }
  } catch {
    // Keep the HTTP status fallback when the API does not return JSON.
  }
  return message;
}

async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
  });

  if (response.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (refreshed.ok) {
      return apiFetch(path, init, false);
    }
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response;
}

export async function login(request: LoginRequest): Promise<CurrentUser> {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, false);

  const body = await response.json();
  return body.user;
}

export async function register(request: RegisterRequest): Promise<CurrentUser> {
  const response = await apiFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, false);

  const body = await response.json();
  return body.user;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: "include",
  });

  if (response.status === 401) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!refreshed.ok) {
      return null;
    }

    const retry = await fetch(`${API_BASE_URL}/api/auth/me`, {
      credentials: "include",
    });

    if (retry.status === 401) return null;
    if (!retry.ok) throw new Error(await readError(retry));
    return retry.json();
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json();
}

export async function sendChat(
  message: string,
  conversationId: string | null,
  language: string,
  useKnowledgeBase: boolean,
): Promise<ChatReply> {
  const response = await apiFetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      language: language || null,
      use_knowledge_base: useKnowledgeBase,
    }),
  });

  return response.json();
}

export async function uploadDocument(file: File): Promise<KnowledgeDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch("/api/documents", { method: "POST", body: formData });
  return response.json();
}

export async function getDocuments(): Promise<KnowledgeDocument[]> {
  const response = await apiFetch("/api/documents");
  return response.json();
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/documents/${documentId}`, { method: "DELETE" });
}

export async function transcribeAudio(
  blob: Blob,
  language: string,
): Promise<{ text: string; language: string | null }> {
  const formData = new FormData();
  formData.append("file", blob, "speech.webm");
  if (language) formData.append("language", language.split("-")[0]);

  const response = await apiFetch("/api/speech/transcribe", {
    method: "POST",
    body: formData,
  });
  return response.json();
}
