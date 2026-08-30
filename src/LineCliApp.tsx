import ChatTemplate from "@/components/smoothui/chat-template";
import type { PromptExecutor } from "@/components/smoothui/chat-template/chat-data";
import { executeDesktopPrompt } from "@/lib/ai";

export type LineCliAppProps = {
  executePrompt?: PromptExecutor;
};

const LineCliApp = ({
  executePrompt = executeDesktopPrompt,
}: LineCliAppProps) => (
  <main className="h-dvh min-h-[36rem] min-w-0 overflow-hidden bg-background text-foreground">
    <ChatTemplate className="h-full" executePrompt={executePrompt} />
  </main>
);

export default LineCliApp;
