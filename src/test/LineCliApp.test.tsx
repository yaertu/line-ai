import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LineCliApp from "@/LineCliApp";

describe("Line CLI SmoothUI masaüstü kabuğu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resmî SmoothUI sohbet yüzeyini Line CLI markasıyla sunar", () => {
    render(<LineCliApp executePrompt={vi.fn()} />);

    expect(screen.getByTestId("smoothui-chat-template")).toHaveAttribute("data-registry", "smoothui.dev/chat-template");
    expect(screen.getByRole("complementary", { name: "Sohbet kenar çubuğu" })).toBeInTheDocument();
    expect(screen.getByText("Line CLI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni sohbet" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Line CLI'ya mesaj gönder" })).toBeInTheDocument();
    expect(screen.queryByText(/simulated|smoothui demo|acme deploy/i)).not.toBeInTheDocument();
  });

  it("mesajı seçilen ortam API sağlayıcısına gönderir ve yanıtı gösterir", async () => {
    const user = userEvent.setup();
    const executePrompt = vi.fn().mockResolvedValue({
      message: "Gerçek OpenAI API yanıtı",
      model: "gpt-5.6-terra",
      provider: "openai",
    });
    render(<LineCliApp executePrompt={executePrompt} />);

    const input = screen.getByRole("textbox", { name: "Line CLI'ya mesaj gönder" });
    await user.type(input, "Bu klasörü açıkla");
    await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));

    expect(executePrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Bu klasörü açıkla",
      provider: "auto",
      reasoning: "medium",
      truthMode: true,
    }));
    const transcript = await screen.findByRole("log", { name: "Sohbet mesajları" });
    await waitFor(() => expect(transcript).toHaveTextContent("Gerçek OpenAI API yanıtı"));
    expect(within(transcript).getByText("Bu klasörü açıkla")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bu klasörü açıkla" })).toHaveAttribute("aria-current", "page");
    expect(JSON.parse(localStorage.getItem("line-cli.conversations.v1") ?? "[]")).toEqual([
      expect.objectContaining({
        title: "Bu klasörü açıkla",
        turns: expect.arrayContaining([
          expect.objectContaining({ from: "user", text: "Bu klasörü açıkla" }),
          expect.objectContaining({ from: "assistant", text: "Gerçek OpenAI API yanıtı" }),
        ]),
      }),
    ]);
  });

  it("kenar çubuğunu erişilebilir bir ikon rayına daraltır", async () => {
    const user = userEvent.setup();
    render(<LineCliApp executePrompt={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Kenar çubuğunu daralt" }));

    expect(screen.getByRole("complementary", { name: "Daraltılmış sohbet kenar çubuğu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kenar çubuğunu genişlet" })).toBeInTheDocument();
  });

  it("sohbet sağ tık menüsüyle yeniden adlandırır ve onayla siler", async () => {
    const user = userEvent.setup();
    localStorage.setItem("line-cli.conversations.v1", JSON.stringify([{
      group: "Bugün",
      id: "conversation-1",
      title: "Eski başlık",
      turns: [{ from: "user", id: "turn-1", text: "Merhaba", timestamp: "12:00" }],
    }]));
    render(<LineCliApp executePrompt={vi.fn()} />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Eski başlık" }), {
      clientX: 80,
      clientY: 120,
    });
    expect(screen.getByRole("menu", { name: "Sohbet işlemleri" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Yeniden adlandır" }));

    const renameDialog = screen.getByRole("dialog", { name: "Sohbeti yeniden adlandır" });
    const titleInput = within(renameDialog).getByLabelText("Sohbet başlığı");
    await user.clear(titleInput);
    await user.type(titleInput, "Yeni başlık");
    await user.click(within(renameDialog).getByRole("button", { name: "Kaydet" }));
    expect(screen.getByRole("button", { name: "Yeni başlık" })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("button", { name: "Yeni başlık" }), {
      clientX: 80,
      clientY: 120,
    });
    await user.click(screen.getByRole("menuitem", { name: "Sohbeti sil" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Sohbet silinsin mi?" });
    await user.click(within(deleteDialog).getByRole("button", { name: "Sohbeti sil" }));

    expect(screen.getByText("Henüz sohbet yok")).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("line-cli.conversations.v1")).toBe("[]"));
  });

  it("mesaj sağ tık menüsünden alıntı oluşturur", async () => {
    const user = userEvent.setup();
    localStorage.setItem("line-cli.conversations.v1", JSON.stringify([{
      group: "Bugün",
      id: "conversation-2",
      title: "Alıntı denemesi",
      turns: [{ from: "assistant", id: "turn-2", text: "Kanıtlanmış sonuç", timestamp: "12:01" }],
    }]));
    render(<LineCliApp executePrompt={vi.fn()} />);

    fireEvent.contextMenu(screen.getByLabelText("Line CLI mesajı işlemleri"), {
      clientX: 300,
      clientY: 220,
    });
    expect(screen.getByRole("menu", { name: "Mesaj işlemleri" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Mesajı alıntıla" }));

    expect(screen.getByRole("textbox", { name: "Line CLI'ya mesaj gönder" })).toHaveValue(
      "> Kanıtlanmış sonuç\n\n"
    );
  });
});
