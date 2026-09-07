import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import LineAiApp from "@/LineAiApp";

const cloud = vi.hoisted(() => ({
  clearCloudHistory: vi.fn(), loadCloudHistory: vi.fn(), readCloudStatus: vi.fn(),
  removeCloudConversation: vi.fn(), saveCloudConversation: vi.fn(),
}));
vi.mock("@/lib/cloud-history", async (original) => ({
  ...(await original<typeof import("@/lib/cloud-history")>()), ...cloud,
}));
const conversation = (id: string, archived = false) => ({
  id: archived ? "archived" : "current", title: id, archived, pinned: false, turns: [{ from: "user", id: "turn-1", text: "Merhaba", timestamp: "12:00" }],
  updatedAt: "2026-09-07T10:00:00Z",
});
const history = [conversation("Güncel"), conversation("Arşiv", true)];
const pendingKey = "line-ai.history-clear-pending.v1";
beforeEach(() => {
  localStorage.clear(); vi.resetAllMocks();
  cloud.loadCloudHistory.mockResolvedValue({ conversations: history, endpoint: "https://lineaicloud.vercel.app/api/v1" });
  cloud.readCloudStatus.mockResolvedValue({ connected: true });
  cloud.clearCloudHistory.mockResolvedValue(undefined);
  cloud.removeCloudConversation.mockResolvedValue(undefined);
  cloud.saveCloudConversation.mockResolvedValue(undefined);
});
async function confirmClear() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Tüm sohbetleri sil" }));
  const dialog = screen.getByRole("dialog", { name: "Tüm sohbetler silinsin mi?" });
  await user.click(within(dialog).getByRole("button", { name: "Tümünü sil" }));
}

it("toplu silme onayı sayıları ve arşiv kapsamını gösterir; iptal veri silmez", async () => {
  const user = userEvent.setup(); render(<LineAiApp executePrompt={vi.fn()} />);
  await screen.findByRole("button", { name: "Güncel" });
  const trigger = screen.getByRole("button", { name: "Tüm sohbetleri sil" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Tüm sohbetler silinsin mi?" });
  expect(dialog).toHaveTextContent("2 sohbet · 2 mesaj");
  expect(dialog).toHaveTextContent("Arşivlenen sohbetler de dahildir");
  expect(within(dialog).getByRole("button", { name: "Vazgeç" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(cloud.clearCloudHistory).not.toHaveBeenCalled();
});

it("tek sohbet silinirken diğer arşivler silinmez", async () => {
  const user = userEvent.setup(); render(<LineAiApp executePrompt={vi.fn()} />);
  fireEvent.contextMenu(await screen.findByRole("button", { name: "Güncel" }));
  await user.click(screen.getByRole("menuitem", { name: "Sohbeti sil" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sohbeti sil" }));
  await waitFor(() => expect(cloud.removeCloudConversation).toHaveBeenCalledWith("current"));
  expect(cloud.removeCloudConversation).not.toHaveBeenCalledWith("archived");
});

it("toplu silme sunucu yanıtını bekler; hata görünür ve yeniden denenebilir", async () => {
  cloud.clearCloudHistory.mockRejectedValueOnce(new Error("Bağlantı kesildi"));
  render(<LineAiApp executePrompt={vi.fn()} />);
  await screen.findByRole("button", { name: "Güncel" });
  await confirmClear();
  expect(await screen.findByRole("alert")).toHaveTextContent("Buluttan silinemedi");
  expect(localStorage.getItem(pendingKey)).toBe("1");
  await userEvent.click(screen.getByRole("button", { name: "Silmeyi yeniden dene" }));
  await screen.findByText("Tüm sohbetler buluttan silindi.");
  expect(cloud.clearCloudHistory).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem(pendingKey)).toBeNull();
  expect(screen.getByRole("button", { name: "Tüm sohbetleri sil" })).toBeDisabled();
});

it("yeniden açılışta bekleyen silme eski bulut sohbetlerini geri getirmez", async () => {
  localStorage.setItem(pendingKey, "1");
  render(<LineAiApp executePrompt={vi.fn()} />);
  await waitFor(() => expect(cloud.clearCloudHistory).toHaveBeenCalledTimes(1));
  await screen.findByText("Tüm sohbetler buluttan silindi.");
  expect(screen.queryByRole("button", { name: "Güncel" })).not.toBeInTheDocument();
  expect(cloud.saveCloudConversation).not.toHaveBeenCalled();
});

it("ilk bulut yüklemesi sürerken toplu silme eski yanıtı uygulamaz", async () => {
  let resolve!: (value: unknown) => void;
  cloud.loadCloudHistory.mockReturnValue(new Promise((done) => { resolve = done; }));
  localStorage.setItem("line-ai.conversations.v1", JSON.stringify(history));
  render(<LineAiApp executePrompt={vi.fn()} />);
  await confirmClear();
  await act(async () => { resolve({ conversations: history, endpoint: "https://lineaicloud.vercel.app/api/v1" }); });
  await screen.findByText("Tüm sohbetler buluttan silindi.");
  expect(screen.queryByRole("button", { name: "Güncel" })).not.toBeInTheDocument();
  expect(cloud.saveCloudConversation).not.toHaveBeenCalled();
  expect(localStorage.getItem("line-ai.conversations.v1")).toBeNull();
});

it("devam eden kayıt bittikten sonra toplu siler; eski sohbeti yeniden yazmaz", async () => {
  let finishSave!: () => void;
  const user = userEvent.setup(); render(<LineAiApp executePrompt={vi.fn()} />);
  const current = await screen.findByRole("button", { name: "Güncel" });
  cloud.saveCloudConversation.mockClear();
  cloud.saveCloudConversation.mockReturnValue(new Promise<void>((done) => { finishSave = done; }));
  fireEvent.contextMenu(current);
  await user.click(screen.getByRole("menuitem", { name: "Sohbeti sabitle" }));
  await waitFor(() => expect(cloud.saveCloudConversation).toHaveBeenCalledTimes(1));
  await confirmClear();
  expect(cloud.clearCloudHistory).not.toHaveBeenCalled();
  await act(async () => { finishSave(); });
  await screen.findByText("Tüm sohbetler buluttan silindi.");
  expect(cloud.clearCloudHistory).toHaveBeenCalledTimes(1);
  expect(cloud.saveCloudConversation).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Güncel" })).not.toBeInTheDocument();
});

it("boş geçmişte silme devre dışıdır; yalnız arşiv varsa kullanılabilir", async () => {
  cloud.loadCloudHistory.mockResolvedValue({ conversations: [history[1]], endpoint: "https://lineaicloud.vercel.app/api/v1" });
  render(<LineAiApp executePrompt={vi.fn()} />);
  await waitFor(() => expect(cloud.readCloudStatus).toHaveBeenCalled());
  await confirmClear();
  await screen.findByText("Tüm sohbetler buluttan silindi.");
  expect(screen.getByRole("button", { name: "Tüm sohbetleri sil" })).toBeDisabled();
});

it("paralel kayıtlardan biri başarısızsa diğer kayıt bitmeden silme tekrarını açmaz", async () => {
  let failSave!: (error: Error) => void;
  let finishSave!: () => void;
  cloud.loadCloudHistory.mockResolvedValue({ conversations: [], endpoint: "https://lineaicloud.vercel.app/api/v1" });
  cloud.saveCloudConversation
    .mockReturnValueOnce(new Promise<void>((_, reject) => { failSave = reject; }))
    .mockReturnValueOnce(new Promise<void>((resolve) => { finishSave = resolve; }));
  localStorage.setItem("line-ai.conversations.v1", JSON.stringify(history));
  render(<LineAiApp executePrompt={vi.fn()} />);
  await waitFor(() => expect(cloud.saveCloudConversation).toHaveBeenCalledTimes(2));
  await confirmClear();
  await act(async () => { failSave(new Error("İlk kayıt başarısız")); });
  expect(screen.queryByRole("button", { name: "Silmeyi yeniden dene" })).not.toBeInTheDocument();
  expect(cloud.clearCloudHistory).not.toHaveBeenCalled();
  await act(async () => { finishSave(); });
  await userEvent.click(await screen.findByRole("button", { name: "Silmeyi yeniden dene" }));
  await screen.findByText("Tüm sohbetler buluttan silindi.");
  expect(cloud.clearCloudHistory).toHaveBeenCalledTimes(1);
  expect(cloud.saveCloudConversation).toHaveBeenCalledTimes(2);
});
