import { useEffect, useRef, useState } from "react";
import {
  Bot,
  FileText,
  LoaderCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";

import {
  deleteDocument,
  getDocuments,
  KnowledgeDocument,
  sendChat,
  Source,
  transcribeAudio,
  uploadDocument,
} from "./api";

type UiMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const languages = [
  { code: "auto", label: "Auto detect" },
  { code: "en-US", label: "English" },
  { code: "ur-PK", label: "اردو" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ar-SA", label: "العربية" },
  { code: "fr-FR", label: "Français" },
  { code: "es-ES", label: "Español" },
  { code: "de-DE", label: "Deutsch" },
  { code: "zh-CN", label: "中文" },
];

const initialMessage: UiMessage = {
  role: "assistant",
  content:
    "Hello! Upload knowledge documents, then ask me questions in your preferred language. You can type or use voice.",
};

export default function App() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([
    initialMessage,
  ]);

  const [conversationId, setConversationId] =
    useState<string | null>(null);

  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("auto");

  const [useKnowledgeBase, setUseKnowledgeBase] =
    useState(true);

  const [speakReplies, setSpeakReplies] =
    useState(false);

  const [isBusy, setIsBusy] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const speechRecognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isBusy]);

  async function loadDocuments() {
    try {
      const result = await getDocuments();

      setDocuments(result);
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    if (language !== "auto") {
      utterance.lang = language;
    }

    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage() {
    const message = input.trim();

    if (!message || isBusy) {
      return;
    }

    setErrorMessage("");
    setInput("");

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "user",
        content: message,
      },
    ]);

    setIsBusy(true);

    try {
      const response = await sendChat(
        message,
        conversationId,
        language === "auto" ? "" : language,
        useKnowledgeBase,
      );

      setConversationId(response.conversation_id);

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources,
        },
      ]);

      if (speakReplies) {
        speak(response.answer);
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDocumentUpload(
    files: FileList | null,
  ) {
    if (!files?.length) {
      return;
    }

    setErrorMessage("");
    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        await uploadDocument(file);
      }

      await loadDocuments();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsUploading(false);
    }
  }

  async function removeDocument(documentId: string) {
    try {
      await deleteDocument(documentId);

      setDocuments((currentDocuments) =>
        currentDocuments.filter(
          (document) => document.id !== documentId,
        ),
      );
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  async function toggleVoiceInput() {
    if (isListening) {
      speechRecognitionRef.current?.stop?.();
      mediaRecorderRef.current?.stop?.();

      setIsListening(false);

      return;
    }

    setErrorMessage("");

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      startBrowserSpeechRecognition(SpeechRecognition);

      return;
    }

    await startRecordedVoiceInput();
  }

  function startBrowserSpeechRecognition(
    SpeechRecognition: any,
  ) {
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;

    if (language !== "auto") {
      recognition.lang = language;
    }

    recognition.onresult = (event: any) => {
      let transcript = "";

      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        transcript +=
          event.results[index][0].transcript;
      }

      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);

      setErrorMessage(
        `Voice recognition error: ${event.error}`,
      );
    };

    speechRecognitionRef.current = recognition;

    recognition.start();

    setIsListening(true);
  }

  async function startRecordedVoiceInput() {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const recorder = new MediaRecorder(stream);

      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream
          .getTracks()
          .forEach((track) => track.stop());

        setIsListening(false);

        try {
          const audioBlob = new Blob(
            audioChunksRef.current,
            {
              type: "audio/webm",
            },
          );

          const result = await transcribeAudio(
            audioBlob,
            language === "auto" ? "" : language,
          );

          setInput(result.text);
        } catch (error) {
          setErrorMessage((error as Error).message);
        }
      };

      mediaRecorderRef.current = recorder;

      recorder.start();

      setIsListening(true);
    } catch (error) {
      setErrorMessage(
        `Microphone unavailable: ${(error as Error).message}`,
      );
    }
  }

  function startNewChat() {
    setConversationId(null);

    setMessages([
      {
        role: "assistant",
        content:
          "New conversation started. How can I help?",
      },
    ]);
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      sendMessage();
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <Bot size={22} />
          </div>

          <div>
            <strong>Polyglot AI</strong>
            <span>Local knowledge assistant</span>
          </div>
        </div>

        <button
          className="new-chat"
          onClick={startNewChat}
        >
          <Plus size={18} />
          New conversation
        </button>

        <section className="panel">
          <div className="panel-title">
            <span>Knowledge base</span>

            <label
              className="upload-icon"
              title="Upload documents"
            >
              <Upload size={17} />

              <input
                hidden
                multiple
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(event) =>
                  handleDocumentUpload(
                    event.target.files,
                  )
                }
              />
            </label>
          </div>

          {isUploading && (
            <div className="status-line">
              <LoaderCircle
                className="spin"
                size={16}
              />

              Indexing document…
            </div>
          )}

          <div className="documents">
            {documents.length === 0 && (
              <div className="empty-docs">
                <FileText size={28} />

                <span>No documents yet</span>
              </div>
            )}

            {documents.map((document) => (
              <div
                className="document"
                key={document.id}
              >
                <FileText size={16} />

                <div className="document-meta">
                  <strong title={document.filename}>
                    {document.filename}
                  </strong>

                  <small>
                    {document.chunk_count} chunks
                  </small>
                </div>

                <button
                  onClick={() =>
                    removeDocument(document.id)
                  }
                  title="Delete document"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="settings">
          <label>
            Response / voice language

            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value)
              }
            >
              {languages.map((item) => (
                <option
                  key={item.code}
                  value={item.code}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={useKnowledgeBase}
              onChange={(event) =>
                setUseKnowledgeBase(
                  event.target.checked,
                )
              }
            />

            Use knowledge base
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={speakReplies}
              onChange={(event) =>
                setSpeakReplies(
                  event.target.checked,
                )
              }
            />

            Speak replies
          </label>
        </section>
      </aside>

      <section className="chat">
        <header className="chat-header">
          <div>
            <h1>Multilingual Knowledge Chat</h1>

            <p>
              FastAPI · PostgreSQL · pgvector ·
              Ollama · Whisper
            </p>
          </div>

          <div className="local-pill">
            Local-first
          </div>
        </header>

        <div className="messages">
          {messages.map((message, index) => (
            <article
              className={`message ${message.role}`}
              key={`${message.role}-${index}`}
            >
              <div className="avatar">
                {message.role === "assistant" ? (
                  <Bot size={18} />
                ) : (
                  "You"
                )}
              </div>

              <div className="bubble">
                <div className="message-text">
                  {message.content}
                </div>

                {message.role === "assistant" && (
                  <button
                    className="speak-button"
                    onClick={() =>
                      speak(message.content)
                    }
                  >
                    <Volume2 size={15} />

                    Speak
                  </button>
                )}

                {!!message.sources?.length && (
                  <div className="sources">
                    <strong>Sources</strong>

                    {message.sources.map(
                      (source, sourceIndex) => (
                        <div
                          className="source"
                          key={`${source.document_id}-${source.chunk_index}`}
                        >
                          <span>
                            [S{sourceIndex + 1}]{" "}
                            {source.filename}
                          </span>

                          <small>
                            {source.page_number
                              ? `page ${source.page_number} · `
                              : ""}

                            relevance{" "}
                            {Math.round(
                              source.score * 100,
                            )}
                            %
                          </small>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}

          {isBusy && (
            <article className="message assistant">
              <div className="avatar">
                <Bot size={18} />
              </div>

              <div className="bubble thinking">
                <LoaderCircle
                  className="spin"
                  size={18}
                />

                Thinking with Ollama…
              </div>
            </article>
          )}

          <div ref={messagesBottomRef} />
        </div>

        <div className="composer-wrap">
          {errorMessage && (
            <div className="error">
              {errorMessage}
            </div>
          )}

          <div className="composer">
            <button
              className={
                isListening ? "mic active" : "mic"
              }
              onClick={toggleVoiceInput}
              title={
                isListening
                  ? "Stop listening"
                  : "Start voice input"
              }
            >
              {isListening ? (
                <MicOff size={20} />
              ) : (
                <Mic size={20} />
              )}
            </button>

            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? "Listening…"
                  : "Ask in English, Urdu, Arabic, Hindi, or another language…"
              }
              rows={1}
            />

            <button
              className="send"
              onClick={sendMessage}
              disabled={!input.trim() || isBusy}
              title="Send message"
            >
              <Send size={20} />
            </button>
          </div>

          <p className="hint">
            Enter to send · Shift+Enter for a new
            line · Voice requires microphone
            permission
          </p>
        </div>
      </section>
    </main>
  );
}
