
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase, type ChatbotRule } from "../lib/supabase";

type Message = {
  id: number;
  role: "user" | "bot";
  content: string;
  time: string;
};

const welcome =
  "Assalam-o-Alaikum! 👋\n\nWelcome to UOS Helpdesk Bot. Ask me about admissions, fees, hostel facilities, library services, examination rules and student life.";

const fallback =
  "I don't have a matching verified answer in my knowledge base yet. Please ask a more specific question about admissions, fees, hostels, library facilities or academic procedures.";

const topics = [
  {
    icon: "🎓",
    title: "Admissions",
    description: "Applications, deadlines and merit lists",
    question: "How can I apply for admission?",
  },
  {
    icon: "💳",
    title: "Fees",
    description: "Semester fees, payments and refunds",
    question: "What is the admission fee refund policy?",
  },
  {
    icon: "🏠",
    title: "Hostels",
    description: "Accommodation, rules and facilities",
    question: "How can I apply for a hostel?",
  },
  {
    icon: "📚",
    title: "Library",
    description: "Learning resources and facilities",
    question: "What facilities are provided by the UOS library?",
  },
  {
    icon: "📝",
    title: "Examinations",
    description: "Exam processes and rechecking",
    question: "How can I apply for examination paper rechecking?",
  },
  {
    icon: "🏛️",
    title: "Student Life",
    description: "Dress code and academic policies",
    question: "What is the dress code for UOS students?",
  },
];

const stopWords = new Set([
  "a", "an", "the", "is", "are", "was", "were",
  "i", "me", "my", "you", "your", "we", "it",
  "in", "on", "at", "of", "to", "for", "from",
  "with", "and", "or", "do", "does", "did",
  "can", "could", "would", "what", "which",
  "when", "where", "who", "how", "tell",
  "please", "about", "know", "want", "need",
  "there", "any", "get", "give", "some",
  "be", "by", "this", "that", "uos",
  "university", "sargodha"
]);

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((word) => word.length > 1 && !stopWords.has(word))
      .map((word) => {
        if (word.endsWith("ies") && word.length > 4) {
          return word.slice(0, -3) + "y";
        }

        if (word.endsWith("s") && word.length > 4 && !word.endsWith("ss")) {
          return word.slice(0, -1);
        }

        return word;
      })
  );
}

function findReply(question: string, rules: ChatbotRule[]) {
  const input = normalize(question);
  const inputWords = tokens(input);

  let highestScore = 0;
  let selectedAnswer = fallback;

  for (const rule of rules) {
    const phrases = [rule.question, ...rule.keywords];

    for (const phraseText of phrases) {
      const phrase = normalize(phraseText);

      if (!phrase) continue;

      const phraseWords = tokens(phrase);
      let score = 0;

      // Exact question
      if (input === phrase) {
        score = 1000 + phrase.length;
      }

      // Complete phrase contained in the message
      else if (
        phrase.length >= 8 &&
        ` ${input} `.includes(` ${phrase} `)
      ) {
        score = 500 + phrase.length;
      }

      // Similar wording
      else if (phraseWords.size > 0) {
        let common = 0;

        for (const word of phraseWords) {
          if (inputWords.has(word)) {
            common++;
          }
        }

        const precision = common / phraseWords.size;
        const coverage =
          common / Math.max(inputWords.size, 1);

        if (
          (common >= 2 && precision >= 0.65) ||
          (common === 1 &&
            phraseWords.size === 1 &&
            inputWords.size === 1)
        ) {
          score = precision * 60 + coverage * 20 + common * 5;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        selectedAnswer = rule.answer;
      }
    }
  }

  return highestScore >= 60 ? selectedAnswer : fallback;
}

function getTime() {
  return new Date().toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [screen, setScreen] = useState<"home" | "chat">("home");
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "bot", content: welcome, time: "" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const nextId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (screen === "chat") {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [messages, screen, loading]);

  async function sendMessage(text: string) {
    const question = text.trim();

    if (!question || busyRef.current) return;

    busyRef.current = true;
    setLoading(true);
    setInput("");
    setScreen("chat");
    setMobileMenu(false);

    const userMessage: Message = {
      id: nextId.current++,
      role: "user",
      content: question,
      time: getTime(),
    };

    setMessages((previous) => [...previous, userMessage]);

    try {
      // Read current rules directly from Supabase.
      const { data, error } = await supabase
        .from("chatbot_rules")
        .select("id, intent, question, keywords, answer")
        .eq("is_active", true)
        .order("id", { ascending: true })
        .limit(1000);

      if (error) {
        throw error;
      }

      const rules = (data ?? []) as ChatbotRule[];
      const answer = findReply(question, rules);

      const botMessage: Message = {
        id: nextId.current++,
        role: "bot",
        content: answer,
        time: getTime(),
      };

      setMessages((previous) => [...previous, botMessage]);
    } catch (error) {
      console.error("Supabase chatbot error:", error);

      setMessages((previous) => [
        ...previous,
        {
          id: nextId.current++,
          role: "bot",
          content:
            "Sorry, I couldn't connect to the knowledge database. Please check the Supabase connection and try again.",
          time: getTime(),
        },
      ]);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function openChat(question?: string) {
    setScreen("chat");
    setMobileMenu(false);

    if (question) {
      void sendMessage(question);
    }
  }

  function resetChat() {
    if (busyRef.current) return;

    nextId.current = 2;
    setMessages([
      { id: 1, role: "bot", content: welcome, time: "" },
    ]);
    setInput("");
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-[#192F59]">
      {/* University strip */}
      <div className="bg-[#192F59] px-5 py-3 text-white">
        <div className="mx-auto flex max-w-7xl justify-between gap-3">
          <span className="text-[11px] font-semibold tracking-wider">
            UNIVERSITY OF SARGODHA · STUDENT HELP PLATFORM
          </span>
          <span className="hidden text-xs text-blue-200 sm:block">
            Database-powered student support
          </span>
        </div>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button
            onClick={() => setScreen("home")}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#192F59] text-2xl text-white">
              🎓
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                UOS <span className="text-[#ED1C24]">CONNECT</span>
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Smart Student Helpdesk
              </p>
            </div>
          </button>

          <nav className="hidden items-center gap-8 md:flex">
            <button
              onClick={() => setScreen("home")}
              className="text-sm font-bold hover:text-[#ED1C24]"
            >
              Home
            </button>
            <button
              onClick={() => openChat()}
              className="text-sm font-bold hover:text-[#ED1C24]"
            >
              Helpdesk
            </button>
            <button
              onClick={() => openChat()}
              className="rounded-xl bg-[#ED1C24] px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Ask UOS Bot ↗
            </button>
          </nav>

          <button
            className="rounded-lg border border-slate-200 p-2 text-xl md:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>

        {mobileMenu && (
          <div className="space-y-2 border-t bg-white px-5 py-4 md:hidden">
            <button
              className="block w-full rounded-lg p-3 text-left"
              onClick={() => {
                setScreen("home");
                setMobileMenu(false);
              }}
            >
              Home
            </button>
            <button
              className="block w-full rounded-lg bg-red-50 p-3 text-left text-red-700"
              onClick={() => openChat()}
            >
              Helpdesk
            </button>
          </div>
        )}
      </header>

      {screen === "home" ? (
        <>
          {/* Hero */}
          <section className="relative overflow-hidden bg-white">
            <div className="absolute -right-20 -top-32 h-96 w-96 rounded-full bg-red-50 blur-3xl" />

            <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
              <div>
                <p className="mb-6 inline-block rounded-full bg-red-50 px-4 py-2 text-xs font-bold tracking-wider text-[#ED1C24]">
                  STUDENT SUPPORT · POWERED BY SUPABASE
                </p>

                <h2 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                  Your Campus.
                  <br />
                  Your Questions.
                  <br />
                  <span className="text-[#ED1C24]">
                    Answered.
                  </span>
                </h2>

                <p className="mt-7 max-w-xl text-base leading-8 text-slate-600">
                  Discover information about admissions,
                  university fees, hostels, library services,
                  examinations and student life. Our rule-based
                  chatbot retrieves its knowledge from a live
                  Supabase database.
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <button
                    onClick={() => openChat()}
                    className="rounded-xl bg-[#ED1C24] px-7 py-4 text-sm font-bold text-white shadow-lg shadow-red-100 transition hover:bg-red-700"
                  >
                    Start Chatting ↗
                  </button>

                  <button
                    onClick={() =>
                      document.getElementById("topics")?.scrollIntoView({
                        behavior: "smooth",
                      })
                    }
                    className="rounded-xl border-2 border-[#192F59] px-7 py-4 text-sm font-bold"
                  >
                    Explore Topics
                  </button>
                </div>

                <div className="mt-10 flex flex-wrap gap-5 text-xs text-slate-500">
                  <span>✓ Database answers</span>
                  <span>✓ No login required</span>
                  <span>✓ Easy updates</span>
                </div>
              </div>

              {/* Assistant preview */}
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center gap-3 bg-[#192F59] p-5 text-white">
                  <span className="rounded-xl bg-white/15 p-3 text-xl">
                    🎓
                  </span>
                  <div>
                    <h3 className="font-bold">UOS Helpdesk Bot</h3>
                    <p className="text-xs text-blue-200">
                      Connected to Supabase
                    </p>
                  </div>
                </div>

                <div className="space-y-5 bg-slate-50 p-6">
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-7 text-slate-700 shadow-sm">
                    Assalam-o-Alaikum! 👋
                    <br />
                    What would you like to know about UOS?
                  </div>
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#192F59] p-4 text-sm text-white">
                    How can I apply for a hostel?
                  </div>
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-7 text-slate-700 shadow-sm">
                    Complete the hostel application and obtain
                    your department chairperson&apos;s recommendation.
                    Allotment depends on merit and eligibility.
                  </div>
                </div>

                <button
                  onClick={() => openChat()}
                  className="w-full border-t px-5 py-5 text-sm font-bold text-[#ED1C24] hover:bg-red-50"
                >
                  Open Chatbot →
                </button>
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="bg-[#192F59] px-5 py-9 text-white">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 md:grid-cols-4">
              {[
                ["15+", "Starter questions"],
                ["6", "Student categories"],
                ["Live", "Database connection"],
                ["0", "Code changes for new rules"],
              ].map(([value, label]) => (
                <div key={label} className="text-center">
                  <p className="text-3xl font-black">{value}</p>
                  <p className="mt-2 text-xs text-blue-200">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Topic Cards */}
          <section id="topics" className="scroll-mt-24 px-5 py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mb-10 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-[#ED1C24]">
                  STUDENT SERVICES
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  How can we help you?
                </h2>
                <p className="mt-4 text-sm text-slate-500">
                  Choose a category to get a specific answer.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {topics.map((topic) => (
                  <button
                    key={topic.title}
                    onClick={() => openChat(topic.question)}
                    className="rounded-2xl border border-slate-200 bg-white p-7 text-left shadow-sm transition hover:-translate-y-1 hover:border-red-200 hover:shadow-xl"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                      {topic.icon}
                    </div>
                    <h3 className="mt-6 text-lg font-bold">
                      {topic.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {topic.description}
                    </p>
                    <p className="mt-6 text-sm font-bold text-[#ED1C24]">
                      Ask a question →
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="px-5 pb-20">
            <div className="mx-auto max-w-7xl rounded-3xl bg-[#192F59] p-10 text-center text-white">
              <h2 className="text-3xl font-black">
                Need an answer?
              </h2>
              <p className="mt-4 text-sm text-blue-100">
                Ask your question and get a response from the
                UOS chatbot knowledge base.
              </p>
              <button
                onClick={() => openChat()}
                className="mt-8 rounded-xl bg-[#ED1C24] px-8 py-4 text-sm font-bold transition hover:bg-red-700"
              >
                Launch Helpdesk ↗
              </button>
            </div>
          </section>
        </>
      ) : (
        /* Chat Interface */
        <section className="mx-auto max-w-7xl px-3 py-6 sm:px-5 sm:py-10">
          <div className="mb-6">
            <button
              onClick={() => setScreen("home")}
              className="mb-4 text-sm font-semibold text-slate-500 hover:text-red-600"
            >
              ← Back to Home
            </button>
            <h2 className="text-3xl font-black">
              Student Helpdesk
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Ask a question to search the Supabase knowledge base.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
            {/* Questions sidebar */}
            <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:block">
              <h3 className="mb-2 font-bold">💡 Suggested Questions</h3>
              <p className="mb-5 text-xs text-slate-500">
                Select a question to try the database chatbot.
              </p>

              <div className="space-y-2">
                {topics.map((topic) => (
                  <button
                    key={topic.title}
                    disabled={loading}
                    onClick={() => void sendMessage(topic.question)}
                    className="block w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left text-sm text-[#192F59] hover:bg-red-50 disabled:opacity-50"
                  >
                    <span className="mr-2">{topic.icon}</span>
                    {topic.question}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-xl bg-blue-50 p-4 text-xs leading-6 text-slate-600">
                <strong className="text-[#192F59]">
                  Database Integration
                </strong>
                <p className="mt-1">
                  Questions and answers are stored in Supabase.
                  New rules can be added without editing the
                  application code.
                </p>
              </div>
            </aside>

            {/* Chat Panel */}
            <div className="flex h-[min(78vh,760px)] min-h-[510px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between gap-3 bg-[#192F59] p-4 text-white sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-white/15 p-3 text-lg">
                    🎓
                  </span>
                  <div>
                    <h3 className="font-bold">
                      UOS Helpdesk Bot
                    </h3>
                    <p className="mt-1 text-xs text-blue-200">
                      {loading
                        ? "Searching database..."
                        : "● Supabase knowledge base"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={resetChat}
                  disabled={loading}
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium hover:bg-white/10 disabled:opacity-50"
                >
                  ↻ New Chat
                </button>
              </div>

              <div
                role="log"
                aria-live="polite"
                className="flex-1 space-y-5 overflow-y-auto bg-[#F8FAFD] p-4 sm:p-6"
              >
                <p className="text-center text-[11px] font-medium text-slate-400">
                  UOS STUDENT CONVERSATION
                </p>

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-end gap-2 ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    {message.role === "bot" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#192F59] text-white">
                        🎓
                      </div>
                    )}

                    <div
                      className={`max-w-[88%] sm:max-w-[77%] ${
                        message.role === "user"
                          ? "text-right"
                          : "text-left"
                      }`}
                    >
                      <p className="mb-1 text-[11px] font-semibold text-slate-500">
                        {message.role === "bot"
                          ? "UOS Bot"
                          : "You"}
                      </p>

                      <div
                        className={`rounded-2xl px-4 py-3 text-left text-sm leading-7 shadow-sm ${
                          message.role === "user"
                            ? "rounded-br-sm bg-[#192F59] text-white"
                            : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <p className="whitespace-pre-line break-words">
                          {message.content}
                        </p>
                      </div>

                      {message.time && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          {message.time}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div
                    role="status"
                    className="flex items-center gap-2 text-sm text-slate-500"
                  >
                    <span className="animate-pulse">● ● ●</span>
                    Searching for your answer...
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSubmit}
                className="flex gap-2 border-t border-slate-200 bg-white p-3 sm:gap-3 sm:p-5"
              >
                <label htmlFor="chat-input" className="sr-only">
                  Your question
                </label>

                <input
                  id="chat-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about admissions, fees, hostels..."
                  autoComplete="off"
                  disabled={loading}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none focus:border-[#192F59] focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="rounded-xl bg-[#ED1C24] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-7"
                >
                  {loading ? "..." : "Send ➤"}
                </button>
              </form>

              <p className="bg-white pb-3 text-center text-[10px] text-slate-400">
                Rule-based database chatbot · No AI API
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Floating Chat Button */}
      {screen === "home" && (
        <button
          onClick={() => openChat()}
          aria-label="Open chatbot"
          className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-[#ED1C24] text-2xl text-white shadow-xl transition hover:scale-110"
        >
          💬
        </button>
      )}

      <footer className="border-t border-slate-200 bg-white px-5 py-6">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-slate-500 sm:flex-row">
          <p>
            <strong className="text-[#192F59]">
              UOS CONNECT
            </strong>
            {" "}— Supabase Student Helpdesk Project
          </p>
          <p>
            Independent educational project · Not an official UOS service
          </p>
        </div>
      </footer>
    </main>
  );
}
