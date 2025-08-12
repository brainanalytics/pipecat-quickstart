"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Mic, PhoneOff, Settings, Loader2, Volume2 } from "lucide-react";

import { POST } from "@/app/api/offer/route";

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
 *   • Device selector + connection state + quick settings
 */

// --- Helper: create a single Pipecat client instance -----------------------------------------
function createClient() {
  const transportName =
    (typeof window !== "undefined" &&
      (window as any).__PIPECAT_TRANSPORT__) ||
    process.env.NEXT_PUBLIC_PIPECAT_TRANSPORT ||
    "small-webrtc";

  const transport = new SmallWebRTCTransport()

  return new PipecatClient({
    transport,
    enableCam: false,
    enableMic: true, // mic is controlled by our UI
  });
}

// --- Root export -----------------------------------------------------------------------------
export default function ChatGPTStyleVoiceUI() {
  const client = useMemo(() => createClient(), []);
  return (
    <PipecatClientProvider client={client}>
      <PipecatClientAudio />
      <AppShell />
    </PipecatClientProvider>
  );
}

// --- Main App Shell --------------------------------------------------------------------------
function AppShell() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-neutral-50 flex flex-col">
      <TopBar />
      <div className="flex-1 grid grid-rows-[1fr_auto] max-w-3xl w-full mx-auto px-4 gap-4 pb-28 md:pb-32">
        <MessagePane />
        <MicDock />
      </div>
    </div>
  );
}

// --- Top Bar ---------------------------------------------------------------------------------
function TopBar() {
  const state = usePipecatClientTransportState();
  const niceState = state?.toString?.().replace(/_/g, " ") ?? "DISCONNECTED";
  return (
    <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/40 bg-neutral-950/80 border-b border-white/5">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-2 rounded-full bg-emerald-500 animate-pulse" hidden={state !== "connected"} />
          <div className="size-2 rounded-full bg-amber-500 animate-pulse" hidden={state === "connected" || state === "disconnected"} />
          <div className="size-2 rounded-full bg-rose-500 animate-pulse" hidden={state !== "disconnected"} />
          <span className="text-sm text-neutral-300">{niceState}</span>
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
  const { availableMics, selectedMic, updateMic } = usePipecatClientMediaDevices();
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
    <Button variant="ghost" className="text-neutral-300 hover:text-white" size="icon">
      <Settings className="size-5" />
    </Button>
  );
}

// --- Message Pane ---------------------------------------------------------------------------
interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  ephemeral?: boolean;
}

function MessagePane() {
  const pcClient = usePipecatClient();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [botStream, setBotStream] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom as messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, botStream]);

  // User transcription (partial + final)
  useRTVIClientEvent(
    RTVIEvent.UserTranscript,
    useCallback((data: { text: string; final?: boolean }) => {
      setMsgs((prev) => {
        const withoutEphemeral = prev.filter((m) => !(m.role === "user" && m.ephemeral));
        if (data.final) {
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

  // Bot streaming tokens
  useRTVIClientEvent(
    RTVIEvent.BotLlmText,
    useCallback((data: { text: string }) => {
      setBotStream((s) => s + data.text);
    }, [])
  );

  // Bot final transcript
  useRTVIClientEvent(
    RTVIEvent.BotTranscript,
    useCallback((data: { text: string }) => {
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
    <div className="w-full overflow-y-auto pt-6">
      <div className="mx-auto max-w-3xl space-y-3">
        {msgs.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} ephemeral={m.ephemeral} />
        ))}
        {botStream && (
          <Bubble role="assistant" text={botStream} ephemeral />
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function Bubble({ role, text, ephemeral }: { role: ChatMsg["role"]; text: string; ephemeral?: boolean }) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const base = "rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm";
  const you = "bg-emerald-500/10 text-emerald-100 ring-1 ring-emerald-500/30";
  const bot = "bg-neutral-800 text-neutral-100 ring-1 ring-white/10";
  const sys = "bg-amber-700/20 text-amber-100 ring-1 ring-amber-500/30";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`w-fit max-w-[85%] ${isUser ? "ml-auto" : "mr-auto"}`}
    >
      <div className={`${base} ${isUser ? you : isAssistant ? bot : sys} ${ephemeral ? "opacity-70 italic" : ""}`}>
        {text}
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

  const isConnectedState = state === TransportStateEnum.READY || state === TransportStateEnum.CONNECTED;

  const startOrConnect = useCallback(async () => {
    if (!pcClient) return;
    setConnecting(true);
    try {
      const startEndpoint = process.env.NEXT_PUBLIC_PIPECAT_START_ENDPOINT;
      const offerUrl = process.env.NEXT_PUBLIC_PIPECAT_OFFER_URL;
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
    if (state === TransportStateEnum.READY || state === TransportStateEnum.CONNECTED || state === TransportStateEnum.DISCONNECTED) {
      setConnecting(false);
    }
  }, [state]);

  // Listen for bot speaking state to animate the ring
  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => setBotTalking(true), [])
  );
  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => setBotTalking(false), [])
  );

  // Also clear spinner on explicit errors
  useRTVIClientEvent(
    RTVIEvent.Error,
    useCallback(() => setConnecting(false), [])
  );

  const pressedRef = useRef(false);

  const onPress = useCallback(async () => {
    if (!pcClient) return;
    if (!isConnectedState) {
      await startOrConnect();
      return;
    }
    pressedRef.current = true;
    enableMic(true);
  }, [pcClient, isConnectedState, startOrConnect, enableMic]);

  const onRelease = useCallback(() => {
    pressedRef.current = false;
    setTimeout(() => {
      if (!pressedRef.current) enableMic(false);
    }, 120);
  }, [enableMic]);

  const isConnected = isConnectedState;
  const label = !isConnected
    ? connecting
      ? "Connecting…"
      : connectedOnce
      ? "Reconnect"
      : "Start"
    : isMicEnabled
    ? "Listening"
    : "Hold to talk";

  return (
    <div className="sticky bottom-0 left-0 right-0 mx-auto max-w-3xl">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-neutral-900 to-transparent" />

      <div className="relative flex items-center justify-center py-6">
        {/* Pulsing aura */}
        <AnimatePresence>
          {(botTalking || isMicEnabled) && (
            <motion.div
              key="aura"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.7, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className="absolute size-40 md:size-48 rounded-full bg-emerald-500/20 blur-2xl"
            />
          )}
        </AnimatePresence>

        <Card className="pointer-events-auto bg-neutral-850 border-white/10 shadow-xl rounded-full">
          <CardContent className="p-5">
            <div className="relative">
              {/* Visualizer ring */}
              <div className="absolute -inset-2 -z-10 flex items-center justify-center">
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

              {/* Mic button */}
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
                  enableMic(!isMicEnabled);
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
      </div>

      {/* Labels + actions */}
      <div className="pointer-events-none -mt-3 mb-6 text-center text-sm text-neutral-300 select-none">
        {label}
      </div>

      {/* Disconnect button */}
      <div className="flex justify-center pb-6">
        <Button
          variant="ghost"
          className="pointer-events-auto text-neutral-300 hover:text-white"
          onClick={() => pcClient?.disconnect?.()}
        >
          <PhoneOff className="size-4 mr-2" /> Disconnect
        </Button>
      </div>
    </div>
  );
}