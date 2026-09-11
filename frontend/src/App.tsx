import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Database,
  FileText,
  LoaderCircle,
  LogOut,
  Mic,
  MicOff,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import {
  CurrentUser,
  deleteDocument,
  getCurrentUser,
  getDocuments,
  KnowledgeDocument,
  sendChat,
  Source,
  transcribeAudio,
  uploadDocument,
} from "./api";
import { logout } from "./auth";

type UiMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  cacheHit?: boolean;
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        setCurrentUser(await getCurrentUser());
      } catch (error) {
        setAuthError((error as Error).message);
      } finally {
        setAuthLoading(false);
      }
    }

    loadCurrentUser();
  }, []);

  if (authLoading) {
    return (
      <div className="screen-loader">
        <LoaderCircle className="spin" size={28} />
        <span>Opening your secure workspace…</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="screen-loader">
        <ShieldCheck size={28} />
        <span>{authError || "Unable to load the authenticated user."}</span>
        <button onClick={() => logout()}>Return to sign in</button>
      </div>
    );
  }

  return <ChatWorkspace currentUser={currentUser} onLogout={logout} />;
}

function ChatWorkspace({ currentUser, onLogout }: { currentUser: CurrentUser; onLogout: () => void }) {
  const isAdmin = currentUser.role === "admin";
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("auto");
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const indexedChunks = useMemo(
    () => documents.reduce((sum, item) => sum + item.chunk_count, 0),
    [documents],
  );

  useEffect(() => {
    if (isAdmin) {
      loadDocuments();
    }
  }, [isAdmin]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function loadDocuments() {
    try {
      setDocuments(await getDocuments());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function ask() {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy(true);

    try {
      const reply = await sendChat(
        message,
        conversationId,
        language === "auto" ? "" : language,
        useKnowledgeBase,
      );

      setConversationId(reply.conversation_id);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: reply.answer,
          sources: reply.sources,
          cacheHit: reply.cache_hit,
        },
      ]);

      if (speakReplies) {
        speak(reply.answer);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!isAdmin || !files?.length) return;
    setUploading(true);
    setError("");

    try {
      for (const file of Array.from(files)) {
        await uploadDocument(file);
      }
      await loadDocuments();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(id: string) {
    if (!isAdmin) return;
    try {
      await deleteDocument(id);
      setDocuments((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (language !== "auto") utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  }

  async function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop?.();
      recorderRef.current?.stop?.();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      if (language !== "auto") recognition.lang = language;

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          transcript += event.results[index][0].transcript;
        }
        setInput(transcript);
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = (event: any) => {
        setListening(false);
        setError(`Voice recognition error: ${event.error}`);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        try {
          const result = await transcribeAudio(
            new Blob(chunksRef.current, { type: "audio/webm" }),
            language === "auto" ? "" : language,
          );
          setInput(result.text);
        } catch (err) {
          setError((err as Error).message);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch (err) {
      setError(`Microphone unavailable: ${(err as Error).message}`);
    }
  }

  return (
    <main className={`secure-shell ${isAdmin ? "admin-layout" : "user-layout"}`}>
      <aside className="secure-sidebar">
        <div className="login-brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div><strong>Nexa</strong><span>Knowledge AI</span></div>
        </div>

        <button className="primary-action" onClick={() => { setConversationId(null); setMessages([]); }}>
          <Plus size={17} /> New conversation
        </button>

        <div className="identity-card">
          <div className="profile-avatar">{currentUser.username.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{currentUser.username}</strong>
            <span>{currentUser.role === "admin" ? "Administrator" : "Chat user"}</span>
          </div>
          <span className={`role-badge ${currentUser.role}`}>{currentUser.role}</span>
        </div>

        <div className="permission-card">
          <ShieldCheck size={17} />
          <div>
            <strong>OAuth2 protected</strong>
            <span>JWT bearer + server-side RBAC</span>
          </div>
        </div>

        <button className="logout-button" onClick={onLogout}><LogOut size={16} /> Sign out</button>
      </aside>

      <section className="secure-chat">
        <header className="secure-header">
          <div>
            <span className="eyebrow">MULTILINGUAL RAG + CAG</span>
            <h1>Knowledge Assistant</h1>
            <p>Ask naturally. Repeated grounded questions can be served from PostgreSQL semantic cache.</p>
          </div>

          <div className="header-controls">
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
            <label><input type="checkbox" checked={useKnowledgeBase} onChange={(event) => setUseKnowledgeBase(event.target.checked)} /> Knowledge</label>
            <label><input type="checkbox" checked={speakReplies} onChange={(event) => setSpeakReplies(event.target.checked)} /> Speak</label>
          </div>
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="secure-welcome">
              <div className="welcome-symbol"><Bot size={28} /></div>
              <h2>What would you like to know?</h2>
              <p>{isAdmin ? "Upload knowledge on the right, then test grounded answers." : "Ask questions from the knowledge base prepared by your administrator."}</p>
            </div>
          )}

          <div className="secure-message-list">
            {messages.map((message, index) => (
              <article className={`secure-message ${message.role}`} key={`${message.role}-${index}`}>
                <div className="secure-message-label">{message.role === "assistant" ? "Nexa" : "You"}</div>
                <div className="secure-bubble">
                  <div className="message-text">{message.content}</div>
                  {message.cacheHit && <span className="cache-badge">CAG cache hit</span>}
                  {message.role === "assistant" && <button className="listen-button" onClick={() => speak(message.content)}><Volume2 size={14} /> Listen</button>}
                </div>

                {!!message.sources?.length && (
                  <div className="secure-sources">
                    {message.sources.map((source, sourceIndex) => (
                      <div className="secure-source" key={`${source.document_id}-${source.chunk_index}`}>
                        <FileText size={15} />
                        <div><strong>[S{sourceIndex + 1}] {source.filename}</strong><span>{source.page_number ? `Page ${source.page_number}` : `Chunk ${source.chunk_index + 1}`}</span></div>
                        <b>{Math.round(source.score * 100)}%</b>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {busy && (
              <article className="secure-message assistant">
                <div className="secure-message-label">Nexa</div>
                <div className="secure-bubble answer-loading">
                  <LoaderCircle className="spin" size={18} />
                  <div><strong>Preparing your answer…</strong><span>Checking cache, retrieving knowledge, and querying Ollama if needed.</span></div>
                </div>
              </article>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="secure-composer-zone">
          {error && <div className="error-banner">{error}</div>}
          {listening && <div className="voice-indicator"><span>Listening… speak naturally</span><button onClick={toggleVoice}>Stop</button></div>}
          <div className="secure-composer">
            <button className={listening ? "mic active" : "mic"} onClick={toggleVoice}>{listening ? <MicOff size={19} /> : <Mic size={19} />}</button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask();
                }
              }}
              placeholder="Ask in English, Urdu, Arabic, Hindi, or another language…"
              rows={1}
            />
            <button className="send-button" onClick={ask} disabled={!input.trim() || busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>
          </div>
        </div>
      </section>

      {isAdmin && (
        <aside className="admin-knowledge-panel">
          <div className="admin-panel-title">
            <div><Database size={18} /><div><strong>Knowledge base</strong><span>Admin only</span></div></div>
            <label className="mini-upload"><Upload size={16} /><input hidden multiple type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => handleUpload(event.target.files)} /></label>
          </div>

          <div className="knowledge-stats">
            <div><strong>{documents.length}</strong><span>Documents</span></div>
            <div><strong>{indexedChunks}</strong><span>Chunks</span></div>
          </div>

          {uploading && <div className="indexing-banner"><LoaderCircle className="spin" size={15} /> Indexing and invalidating stale cache…</div>}

          <div className="admin-document-list">
            {documents.length === 0 ? (
              <label className="drop-empty"><Upload size={22} /><strong>Upload knowledge</strong><span>PDF, DOCX, TXT or MD</span><input hidden multiple type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => handleUpload(event.target.files)} /></label>
            ) : documents.map((document) => (
              <div className="document-row" key={document.id}>
                <div className="document-icon"><FileText size={16} /></div>
                <div className="document-copy"><strong>{document.filename}</strong><span>{document.chunk_count} chunks</span></div>
                <button onClick={() => removeDocument(document.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </aside>
      )}
    </main>
  );
}
