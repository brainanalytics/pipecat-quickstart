"use client";

import dynamic from "next/dynamic";
const ChatGPTStyleVoiceUI = dynamic(
  () => import("@/components/ChatGPTStyleVoiceUI"),
  { ssr: false }
);
export default function Page() {
  return <ChatGPTStyleVoiceUI />;
}
