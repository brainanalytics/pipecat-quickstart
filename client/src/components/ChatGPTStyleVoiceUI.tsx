"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PipecatClient,
  RTVIEvent,
  TransportState,
  TransportStateEnum,
} from "@pipecat-ai/client-js";
import {
  PipecatClientProvider,
  PipecatClientAudio,
  VoiceVisualizer,
  usePipecatClient,
  usePipecatClientTransportState,
  usePipecatClientMediaDevices,
  usePipecatClientMicControl,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
// Optional alternative transport (Daily). Uncomment if you use Daily on the server.
// import { DailyTransport } from "@pipecat-ai/daily-transport";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Mic,
  Phone,
  PhoneOff,
  Settings,
  Loader2,
  Volume2,
  Wrench,
  Plus,
} from "lucide-react";
import Image from "next/image";

/**
 * 🧠 How to use
 * - Install deps:
 *   npm i @pipecat-ai/client-js @pipecat-ai/client-react @pipecat-ai/small-webrtc-transport framer-motion lucide-react
 *   # If you want shadcn/ui, install it in your project (this file assumes shadcn is configured)
 *
 * - Configure env:
 *   NEXT_PUBLIC_PIPECAT_START_ENDPOINT=/api/start           # preferred: returns { webrtcUrl }
 *   NEXT_PUBLIC_PIPECAT_OFFER_URL=/api/offer                # fallback: direct offer/answer endpoint
 *   NEXT_PUBLIC_PIPECAT_TRANSPORT=small-webrtc              # or "daily" if using DailyTransport
 *
 * - Drop <ChatGPTStyleVoiceUI/> into your app. The UI mimics ChatGPT Realtime Voice:
 *   • Big pulsing round mic button (press-and-hold or tap-to-toggle)
 *   • Waveform when you speak; glow when the bot speaks
 *   • Streaming transcripts for you and the assistant
 *   • Function call events displayed before responses
 *   • Device selector + connection state + quick settings
 */

// --- Helper: create a single Pipecat client instance -----------------------------------------
function createClient() {
  // Avoid constructing WebRTC transport during SSR
  if (typeof window === "undefined") return null as any;

  const transportName =
    (window as any).__PIPECAT_TRANSPORT__ ||
    process.env.NEXT_PUBLIC_PIPECAT_TRANSPORT ||
    "small-webrtc";

  const transport =
    transportName === "daily"
      ? // new DailyTransport() // if you switch transports
        new SmallWebRTCTransport()
      : new SmallWebRTCTransport();

  return new PipecatClient({
    transport,
    enableCam: false,
    enableMic: true,
  });
}

// --- Custom hook for managing thread and user IDs --------------------------------------------
function useThreadAndUserId() {
  const [threadId, setThreadId] = useState<string>(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const stored = localStorage.getItem("voice-thread-id");
    if (stored) return stored;
    const newId = crypto.randomUUID();
    localStorage.setItem("voice-thread-id", newId);
    return newId;
  });

  const [userId, setUserId] = useState<string>(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const stored = localStorage.getItem("voice-user-id");
    if (stored) return stored;
    const newId = crypto.randomUUID();
    localStorage.setItem("voice-user-id", newId);
    return newId;
  });

  const startNewConversation = useCallback(() => {
    const newThreadId = crypto.randomUUID();
    const newUserId = crypto.randomUUID();

    localStorage.setItem("voice-thread-id", newThreadId);
    localStorage.setItem("voice-user-id", newUserId);

    setThreadId(newThreadId);
    setUserId(newUserId);

    return { newThreadId, newUserId };
  }, []);

  return { threadId, userId, startNewConversation };
}

// --- Root export -----------------------------------------------------------------------------
export default function ChatGPTStyleVoiceUI() {
  const [client, setClient] = useState<PipecatClient | null>(null);

  // Instantiate the client only on the browser after mount
  useEffect(() => {
    const c = createClient();
    if (c) setClient(c);
    return () => {
      try {
        c?.disconnect?.();
      } catch {}
    };
  }, []);

  if (!client) return null; // or a small loader

  return (
    <PipecatClientProvider client={client}>
      <PipecatClientAudio />
      <AppShell />
    </PipecatClientProvider>
  );
}

// --- Main App Shell --------------------------------------------------------------------------
function AppShell() {
  const { startNewConversation } = useThreadAndUserId();
  const pcClient = usePipecatClient();

  const handleNewConversation = () => {
    startNewConversation();

    // Disconnect current connection to ensure new thread ID is used
    if (pcClient) {
      pcClient.disconnect();
    }

    // The MessagePane will handle clearing messages
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-50 flex flex-col">
      <TopBar onNewConversation={handleNewConversation} />
      <div className="flex-1 grid grid-rows-[1fr_auto] max-w-3xl w-full mx-auto px-4 gap-4 pb-28 md:pb-32">
        <MessagePane onNewConversation={handleNewConversation} />
        <MicDock />
      </div>
    </div>
  );
}

// --- Top Bar ---------------------------------------------------------------------------------
function TopBar({ onNewConversation }: { onNewConversation: () => void }) {
  // Use the custom hook for managing thread and user IDs
  const state = usePipecatClientTransportState();
  const isConnectedState =
    state === TransportStateEnum.READY ||
    state === TransportStateEnum.CONNECTED;
  const isDisconnectedState =
    state === TransportStateEnum.DISCONNECTED ||
    state === undefined ||
    (state as any) === null;
  const isTransientState = !isConnectedState && !isDisconnectedState;
  const niceState = (state?.toString?.() || "DISCONNECTED").replace(/_/g, " ");

  return (
    <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/40 bg-neutral-950/80 border-b border-white/5">
      <div className="mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image
            src="/2.png"
            alt="Company logo"
            width={120}
            height={32}
            className="h-6 w-auto"
            priority
          />
          <div className="text-sm text-neutral-30 flex items-center gap-2">
            <div
              className="size-2 rounded-full bg-emerald-500 animate-pulse"
              hidden={!isConnectedState}
            />
            <div
              className="size-2 rounded-full bg-amber-500 animate-pulse"
              hidden={!isTransientState}
            />
            <div
              className="size-2 rounded-full bg-rose-500 animate-pulse"
              hidden={!isDisconnectedState}
            />
            <span className="text-sm text-neutral-300">{niceState}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DeviceSelector />
          <QuickSettings />
        </div>
      </div>
    </div>
  );
}

// --- Device Selector -------------------------------------------------------------------------
function DeviceSelector() {
  const { availableMics, selectedMic, updateMic } =
    usePipecatClientMediaDevices();
  return (
    <div className="inline-flex items-center gap-2">
      <Volume2 className="size-4 text-neutral-400" />
      <select
        className="bg-neutral-900 text-neutral-200 text-sm rounded-xl px-3 py-1.5 outline-none ring-1 ring-white/10 hover:ring-white/20"
        value={selectedMic?.deviceId || ""}
        onChange={(e) => updateMic(e.target.value)}
      >
        {availableMics.map((m) => (
          <option key={m.deviceId} value={m.deviceId}>
            {m.label || `Mic ${m.deviceId}`}
          </option>
        ))}
      </select>
    </div>
  );
}

// --- Quick Settings (placeholder) ------------------------------------------------------------
function QuickSettings() {
  return (
    <Button
      variant="ghost"
      className="text-neutral-300 hover:text-white"
      size="icon"
    >
      <Settings className="size-5" />
    </Button>
  );
}

// --- Message Pane ---------------------------------------------------------------------------
interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system" | "function";
  text: string;
  ephemeral?: boolean;
  functionName?: string;
  functionArgs?: any;
}

function MessagePane({ onNewConversation }: { onNewConversation: () => void }) {
  const pcClient = usePipecatClient();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [botStream, setBotStream] = useState("");
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [dockPadding, setDockPadding] = useState<number>(280);
  const transportState = usePipecatClientTransportState();

  // Clear messages when starting a new conversation
  const clearMessages = useCallback(() => {
    setMsgs([]);
    setBotStream("");
    setIsWaitingForResponse(false);
  }, []);

  // Listen for new conversation requests
  useEffect(() => {
    clearMessages();
  }, [onNewConversation, clearMessages]);

  // Clear messages whenever a new connection is established
  useEffect(() => {
    if (
      transportState === TransportStateEnum.READY ||
      transportState === TransportStateEnum.CONNECTED
    ) {
      clearMessages();
    }
  }, [transportState, clearMessages]);

  // Scroll to bottom as messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, botStream, isWaitingForResponse]);

  // Measure the mic dock height and pad the scroll area so content
  // never scrolls underneath the fixed dock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dock = document.getElementById("mic-dock");
    const update = () => {
      if (!dock) return;
      const h = dock.offsetHeight || 0;
      // Add a little extra breathing room above the dock
      setDockPadding(h + 24);
    };
    update();
    if (!dock) return;
    const ResizeObs = (window as any).ResizeObserver;
    let ro: any = null;
    if (ResizeObs) {
      ro = new ResizeObs(update);
      ro.observe(dock);
    }
    window.addEventListener("resize", update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // User transcription (partial + final)
  useRTVIClientEvent(
    RTVIEvent.UserTranscript,
    useCallback((data: { text: string; final?: boolean }) => {
      console.log("UserTranscript Event", data);
      setMsgs((prev) => {
        const withoutEphemeral = prev.filter(
          (m) => !(m.role === "user" && m.ephemeral)
        );
        if (data.final) {
          // Start waiting for response when user finishes speaking
          setIsWaitingForResponse(true);
          return [
            ...withoutEphemeral,
            { id: crypto.randomUUID(), role: "user", text: data.text },
          ];
        } else {
          return [
            ...withoutEphemeral,
            {
              id: "ephemeral-user",
              role: "user",
              text: data.text,
              ephemeral: true,
            },
          ];
        }
      });
    }, [])
  );

  // Function call event (before the response)
  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCall,
    useCallback((data: { function_name: string; args?: any }) => {
      console.log("LLMFunctionCall Event1", data);
      // Clear waiting state when we get a function call
      setIsWaitingForResponse(false);
      setMsgs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "function",
          text: `Calling function: ${data.function_name}`,
          functionName: data.function_name,
          functionArgs: data.args,
        },
      ]);
    }, [])
  );

  // Alternative function call event patterns (in case the server sends different events)
  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCall,
    useCallback(
      (data: {
        name?: string;
        function_name?: string;
        args?: any;
        arguments?: any;
      }) => {
        console.log("LLMFunctionCall Event2", data);
        const functionName = data.name || data.function_name;
        const functionArgs = data.args || data.arguments;

        if (functionName) {
          // Clear waiting state when we get a function call
          setIsWaitingForResponse(false);
          setMsgs((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "function",
              text: `Calling function: ${functionName}`,
              functionName,
              functionArgs,
            },
          ]);
        }
      },
      []
    )
  );

  // Generic function-related events
  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCall,
    useCallback((data: any) => {
      console.log("LLMFunctionCall Event3", data);
      const functionName =
        data?.function_name || data?.name || data?.function || "unknown";
      // Clear waiting state when we get a function call
      setIsWaitingForResponse(false);
      setMsgs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "function",
          text: `Calling function: ${functionName}`,
          functionName,
          functionArgs: data?.args || data?.arguments,
        },
      ]);
    }, [])
  );

  // Bot streaming tokens
  useRTVIClientEvent(
    RTVIEvent.BotLlmText,
    useCallback((data: { text: string }) => {
      console.log("BotLlmText Event", data);
      // Clear waiting state when we start getting bot response
      setIsWaitingForResponse(false);
      setBotStream((s) => s + data.text);
    }, [])
  );

  // Bot final transcript
  useRTVIClientEvent(
    RTVIEvent.BotTranscript,
    useCallback((data: { text: string }) => {
      console.log("BotTranscript Event", data);
      // Clear waiting state when we get final response
      setIsWaitingForResponse(false);
      setMsgs((prev) => [
        ...prev.filter((m) => !(m.role === "assistant" && m.ephemeral)),
        { id: crypto.randomUUID(), role: "assistant", text: data.text },
      ]);
      setBotStream("");
    }, [])
  );

  // Errors (optional)
  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback((msg: any) => {
      console.log("Error Event", msg);
      // Clear waiting state on error
      setIsWaitingForResponse(false);
      setMsgs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `Error: ${msg?.data?.message || "Unknown error"}`,
        },
      ]);
    }, [])
  );

  return (
    <div
      className="w-full overflow-y-auto pt-6"
      style={{ paddingBottom: dockPadding }}
    >
      <div className="mx-auto max-w-3xl space-y-3">
        {msgs.map((m) => (
          <Bubble
            key={m.id}
            role={m.role}
            text={m.text}
            ephemeral={m.ephemeral}
            functionName={m.functionName}
            functionArgs={m.functionArgs}
          />
        ))}
        {botStream && <Bubble role="assistant" text={botStream} ephemeral />}
        {isWaitingForResponse && (
          <Bubble 
            role="assistant" 
            text="..." 
            ephemeral 
            isTyping={true}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function Bubble({
  role,
  text,
  ephemeral,
  functionName,
  functionArgs,
  isTyping,
}: {
  role: ChatMsg["role"];
  text: string;
  ephemeral?: boolean;
  functionName?: string;
  functionArgs?: any;
  isTyping?: boolean;
}) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isFunction = role === "function";
  const base = "rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm";
  const you = "bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/30";
  const bot = "bg-neutral-800 text-neutral-100 ring-1 ring-white/10";
  const sys = "bg-amber-700/20 text-amber-100 ring-1 ring-amber-500/30";
  const func = "bg-blue-700/20 text-blue-100 ring-1 ring-blue-500/30";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`w-fit max-w-[85%] ${isUser ? "ml-auto" : "mr-auto"}`}
    >
      <div
        className={`${base} ${
          isUser ? you : isAssistant ? bot : isFunction ? func : sys
        } ${ephemeral ? "opacity-70 italic" : ""}`}
      >
        {isFunction && (
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="size-4" />
            <span className="font-medium">Function Call</span>
          </div>
        )}
        {isTyping ? (
          <div className="flex items-center gap-1">
            {/* <span className="text-neutral-400">Thinking</span> */}
            <div className="flex gap-1">
              <motion.div
                className="w-1 h-1 bg-neutral-400 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
              />
              <motion.div
                className="w-1 h-1 bg-neutral-400 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="w-1 h-1 bg-neutral-400 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              />
            </div>
          </div>
        ) : (
          text
        )}
        {isFunction && functionArgs && (
          <div className="mt-2 text-xs opacity-70">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(functionArgs, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --- Mic Dock (ChatGPT-style round button + visualizer) --------------------------------------
function MicDock() {
  const pcClient = usePipecatClient();
  const state = usePipecatClientTransportState();
  const { isMicEnabled, enableMic } = usePipecatClientMicControl();

  const [botTalking, setBotTalking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectedOnce, setConnectedOnce] = useState(false);
  // Modes: push-to-talk vs hands-free (VAD)
  const [mode, setMode] = useState<"push" | "handsfree">(
    () =>
      (typeof window !== "undefined" &&
        (localStorage.getItem("voice-mode") as any)) ||
      "push"
  );
  const [autoDuck, setAutoDuck] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("voice-autoduck") === "1"
      : false
  );

  const isConnectedState =
    state === TransportStateEnum.READY ||
    state === TransportStateEnum.CONNECTED;
  const isDisconnectedState =
    state === TransportStateEnum.DISCONNECTED ||
    state === undefined ||
    (state as any) === null;
  const isTransientState = !isConnectedState && !isDisconnectedState;
  const niceState = (state?.toString?.() || "DISCONNECTED").replace(/_/g, " ");

  const startOrConnect = useCallback(async () => {
    if (!pcClient) return;
    setConnecting(true);
    try {
      const startEndpoint = process.env.NEXT_PUBLIC_PIPECAT_START_ENDPOINT;
      const offerUrl = process.env.NEXT_PUBLIC_PIPECAT_OFFER_URL;

      console.log(
        `Connecting to backend (thread ID will be generated by backend)`
      );

      if (startEndpoint) {
        await pcClient.startBotAndConnect({ endpoint: startEndpoint });
      } else if (offerUrl) {
        await pcClient.connect({ webrtcUrl: offerUrl });
      } else {
        await pcClient.startBotAndConnect({ endpoint: "/api/start" });
      }
      setConnectedOnce(true);
    } catch (e) {
      console.error("connect error", e);
    } finally {
      // We'll also clear this in a state watcher below, but reset here too
      setConnecting(false);
    }
  }, [pcClient]);

  // Clear connecting when transport settles to any terminal-ish state
  useEffect(() => {
    if (
      state === TransportStateEnum.READY ||
      state === TransportStateEnum.CONNECTED ||
      state === TransportStateEnum.DISCONNECTED
    ) {
      setConnecting(false);
    }
  }, [state]);

  // Persist mode settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("voice-mode", mode);
    } catch {}
  }, [mode]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("voice-autoduck", autoDuck ? "1" : "0");
    } catch {}
  }, [autoDuck]);

  // Hands-free: keep mic open when connected
  useEffect(() => {
    if (mode === "handsfree" && isConnectedState) {
      enableMic(true);
    }
  }, [mode, isConnectedState, enableMic]);

  // Optional: Auto-duck mic when bot speaks (off by default)
  useEffect(() => {
    if (mode !== "handsfree" || !isConnectedState) return;
    if (!autoDuck) return;
    enableMic(!botTalking);
  }, [botTalking, autoDuck, mode, isConnectedState, enableMic]);

  // Listen for bot speaking state to animate the ring
  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      console.log("BotStartedSpeaking Event");
      setBotTalking(true);
    }, [])
  );
  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => {
      console.log("BotStoppedSpeaking Event");
      setBotTalking(false);
    }, [])
  );

  // Also clear spinner on explicit errors
  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback(() => {
      console.log("Error Event");
      setConnecting(false);
    }, [])
  );

  const pressedRef = useRef(false);

  const onPress = useCallback(async () => {
    if (!pcClient) return;
    if (!isConnectedState) {
      await startOrConnect();
      return;
    }
    if (mode === "handsfree") return; // no press-to-talk in handsfree
    pressedRef.current = true;
    enableMic(true);
  }, [pcClient, isConnectedState, startOrConnect, enableMic, mode]);

  const onRelease = useCallback(() => {
    if (mode === "handsfree") return; // no release effect in handsfree
    pressedRef.current = false;
    setTimeout(() => {
      if (!pressedRef.current) enableMic(false);
    }, 120);
  }, [enableMic, mode]);

  const isConnected = isConnectedState;
  const label =
    mode === "handsfree"
      ? isConnected
        ? isMicEnabled
          ? "Hands‑free listening"
          : "Muted"
        : connecting
        ? "Connecting…"
        : connectedOnce
        ? "Reconnect"
        : "Start"
      : !isConnected
      ? connecting
        ? "Connecting…"
        : connectedOnce
        ? "Reconnect"
        : "Start"
      : isMicEnabled
      ? "Listening"
      : "Hold to talk";

  return (
    <div id="mic-dock" className="fixed bottom-0 left-0 right-0 z-20">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-neutral-900 to-transparent" />
      <div className="relative mx-auto">
        <div className="pointer-events-auto grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-4 bg-neutral-900 ring-1 ring-white/10 shadow-lg">
          <div className="h-full w-full flex flex-col items-center justify-center gap-3">
            <div className="rounded-full bg-neutral-800/70 ring-1 ring-white/10 p-1">
              <button
                className={`px-3 py-1 text-sm rounded-full cursor-pointer ${
                  mode === "push"
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-300 hover:bg-neutral-700/40"
                }`}
                onClick={() => setMode("push")}
              >
                Push
              </button>
              <button
                className={`px-3 py-1 text-sm rounded-full cursor-pointer ${
                  mode === "handsfree"
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-300 hover:bg-neutral-700/40"
                }`}
                onClick={() => setMode("handsfree")}
              >
                Hands‑free
              </button>
            </div>
            <label className="text-sm text-neutral-300 inline-flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={autoDuck}
                onChange={(e) => setAutoDuck(e.target.checked)}
              />
              Auto‑mute on bot
            </label>
            <Button
              variant="ghost"
              className="text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 cursor-pointer"
              onClick={() => {
                if (isConnectedState) {
                  pcClient?.disconnect?.();
                } else {
                  startOrConnect();
                }
              }}
              disabled={!isConnectedState && connecting}
            >
              {isConnectedState ? (
                <>
                  <PhoneOff className="size-4 mr-2" /> Disconnect
                </>
              ) : (
                <>
                  {connecting ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <Phone className="size-4 mr-2" />
                  )}
                  {connecting
                    ? "Connecting…"
                    : connectedOnce
                    ? "Reconnect"
                    : "Connect"}
                </>
              )}
            </Button>
          </div>

          <div className="relative justify-self-center">
            <AnimatePresence>
              {(botTalking || isMicEnabled) && (
                <motion.div
                  key="aura"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 0.7, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="absolute -inset-6 md:-inset-8 -z-10 rounded-full bg-emerald-500/20 blur-2xl"
                />
              )}
            </AnimatePresence>
            <Card className="bg-neutral-800 border-white/10 shadow-xl rounded-full">
              <CardContent className="p-5">
                <div className="relative">
                  <motion.button
                    className={`relative size-20 md:size-24 rounded-full grid place-items-center select-none ${
                      isMicEnabled ? "bg-emerald-500/90" : "bg-neutral-800"
                    } shadow-inner ring-1 ring-white/10`}
                    onMouseDown={onPress}
                    onMouseUp={onRelease}
                    onMouseLeave={onRelease}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      onPress();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      onRelease();
                    }}
                    onClick={async () => {
                      if (!isConnectedState) {
                        await startOrConnect();
                        return;
                      }
                      if (mode === "handsfree") {
                        enableMic(!isMicEnabled);
                      } else {
                        enableMic(!isMicEnabled);
                      }
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {connecting ? (
                      <Loader2 className="size-7 animate-spin" />
                    ) : (
                      <Mic className="size-7" />
                    )}
                  </motion.button>
                </div>
              </CardContent>
            </Card>
            <div className="mt-2 text-center text-xs text-neutral-300 select-none">
              {label}
            </div>
          </div>
          <div className="h-full w-full justify-self-stretch">
            <div className="h-full flex items-center justify-center">
              <div className="rounded-full ring-2 ring-white/10 p-2">
                <VoiceVisualizer
                  participantType="local"
                  barCount={24}
                  barGap={6}
                  barWidth={3}
                  barMaxHeight={28}
                  backgroundColor="transparent"
                  barColor="white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
