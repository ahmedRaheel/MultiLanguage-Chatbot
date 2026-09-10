const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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
};

export type KnowledgeDocument = {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
};

type TranscriptionResult = {
  text: string;
  language: string | null;
};

async function ensureSuccessfulResponse(
  response: Response,
): Promise<Response> {
  if (response.ok) {
    return response;
  }

  let errorMessage = `Request failed with status ${response.status}`;

  try {
    const errorResponse = await response.json();

    if (errorResponse.detail) {
      errorMessage = errorResponse.detail;
    }
  } catch {
    // Keep the default message if the response body
    // does not contain valid JSON.
  }

  throw new Error(errorMessage);
}

export async function sendChat(
  message: string,
  conversationId: string | null,
  language: string,
  useKnowledgeBase: boolean,
): Promise<ChatReply> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

export async function uploadDocument(
  file: File,
): Promise<KnowledgeDocument> {
  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/api/documents`,
    {
      method: "POST",
      body: formData,
    },
  );

  await ensureSuccessfulResponse(response);

  return response.json();
}

export async function getDocuments(): Promise<KnowledgeDocument[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/documents`,
  );

  await ensureSuccessfulResponse(response);

  return response.json();
}

export async function deleteDocument(
  documentId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${documentId}`,
    {
      method: "DELETE",
    },
  );

  await ensureSuccessfulResponse(response);
}

export async function transcribeAudio(
  audioBlob: Blob,
  language: string,
): Promise<TranscriptionResult> {
  const formData = new FormData();

  formData.append(
    "file",
    audioBlob,
    "speech.webm",
  );

  if (language) {
    const languageCode = language.split("-")[0];

    formData.append(
      "language",
      languageCode,
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/api/speech/transcribe`,
    {
      method: "POST",
      body: formData,
    },
  );

  await ensureSuccessfulResponse(response);

  return response.json();
}

