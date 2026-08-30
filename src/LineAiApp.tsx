import ChatTemplate from "@/components/line-ai/chat-template";
import type { PromptExecutor } from "@/components/line-ai/chat-template/chat-data";
import { executeDesktopPrompt } from "@/lib/ai";

export type LineAiAppProps = {
  executePrompt?: PromptExecutor;
};

const LineAiApp = ({
  executePrompt = executeDesktopPrompt,
}: LineAiAppProps) => (
  <main className="h-dvh min-h-[36rem] min-w-0 overflow-hidden bg-background text-foreground">
    <ChatTemplate className="h-full" executePrompt={executePrompt} />
  </main>
);

export default LineAiApp;
