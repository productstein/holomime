"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStudioStore } from "@/stores/studio";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const providerColors: Record<string, string> = {
  anthropic: "bg-amber-500/10 text-amber-400",
  openai: "bg-emerald-500/10 text-emerald-400",
  gemini: "bg-sky-500/10 text-sky-400",
  ollama: "bg-zinc-500/10 text-zinc-400",
};

let msgId = 0;

export function LiveChatPreview() {
  const traits = useStudioStore((s) => s.traits);
  const facets = useStudioStore((s) => s.facets);
  const signatures = useStudioStore((s) => s.signatures);
  const preferences = useStudioStore((s) => s.preferences);
  const selectedProvider = useStudioStore((s) => s.selectedProvider);

  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: "Hello! I\u2019m your agent. Try talking to me \u2014 my personality updates in real-time as you adjust the sliders." },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset chat when provider changes
  useEffect(() => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: `Hello! I\u2019m your agent running on ${selectedProvider}. Try talking to me \u2014 my personality updates in real-time.`,
    }]);
    setApiError(null);
  }, [selectedProvider]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setApiError(null);

    const userMsg: Message = { id: `msg-${++msgId}`, role: "user", content: userMessage };
    const assistantMsg: Message = { id: `msg-${++msgId}`, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Build message history for the API (only role + content)
    const history = [...messages, userMsg]
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          traits,
          facets,
          signatures,
          preferences,
          provider: selectedProvider,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const current = accumulated;
          setMessages((prev) =>
            prev.map((m) => m.id === assistantMsg.id ? { ...m, content: current } : m)
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      setApiError(
        message.includes("API key") || message.includes("503")
          ? "No API key configured. Add ANTHROPIC_API_KEY to your .env file to enable live chat."
          : message
      );
      // Remove empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id || m.content));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, messages, traits, facets, signatures, preferences, selectedProvider]);

  const colorClass = providerColors[selectedProvider] ?? providerColors.ollama;

  return (
    <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/50">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">Live Preview</span>
          {isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${colorClass}`}>
          {selectedProvider}
        </span>
      </div>

      {/* API error banner */}
      {apiError && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <p className="text-xs text-amber-400">{apiError}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {msg.content || (
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Talk to your agent..."
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
