import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LineAiApp from "@/LineAiApp";

describe("Line AI masaüstü çalışma alanı", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("Line AI sohbet çalışma alanını sunar", () => {
    render(<LineAiApp executePrompt={vi.fn()} />);

    expect(screen.getByTestId("line-ai-chat-workspace")).toHaveAttribute("data-registry", "line-ai/chat-workspace");
    expect(screen.getByRole("complementary", { name: "Sohbet kenar çubuğu" })).toBeInTheDocument();
    expect(screen.getByText("Line AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeni sohbet" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" })).toBeInTheDocument();
    expect(screen.queryByText(/simulated|smoothui demo|acme deploy/i)).not.toBeInTheDocument();
  });

  it("sohbet aramasını yeni sohbet eyleminden önce ve üst alanda sunar", () => {
    render(<LineAiApp executePrompt={vi.fn()} />);

    const search = screen.getByRole("searchbox", { name: "Sohbetlerde ara" });
    const newChat = screen.getByRole("button", { name: "Yeni sohbet" });
    expect(search.compareDocumentPosition(newChat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sohbetlerde ara" })).toBeInTheDocument();
  });

  it("Ctrl+K komut merkezinde sohbetleri ve gerçek tercih eylemlerini arar", async () => {
    const user = userEvent.setup();
    render(<LineAiApp executePrompt={vi.fn()} />);

    fireEvent.keyDown(window, { ctrlKey: true, key: "k" });
    const palette = screen.getByRole("dialog", { name: "Hızlı arama ve komutlar" });
    const search = within(palette).getByRole("combobox", { name: "Sohbet veya işlem ara" });
    await user.type(search, "ayarlar");
    await user.click(within(palette).getByRole("option", { name: /Ayarları aç/ }));

    expect(screen.getByRole("dialog", { name: "Line AI ayarları" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Hızlı arama ve komutlar" })).not.toBeInTheDocument(),
    );
  });

  it("mesajı seçilen ortam API sağlayıcısına gönderir ve yanıtı gösterir", async () => {
    const user = userEvent.setup();
    const executePrompt = vi.fn().mockResolvedValue({
      message: "Gerçek OpenAI API yanıtı",
      model: "gpt-5.6-terra",
      provider: "openai",
    });
    render(<LineAiApp executePrompt={executePrompt} />);

    const input = screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" });
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
    expect(JSON.parse(localStorage.getItem("line-ai.conversations.v1") ?? "[]")).toEqual([
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
    render(<LineAiApp executePrompt={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Kenar çubuğunu daralt" }));

    expect(screen.getByRole("complementary", { name: "Daraltılmış sohbet kenar çubuğu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kenar çubuğunu genişlet" })).toBeInTheDocument();
  });

  it("geçmiş sohbeti son işlem saatiyle gösterir", () => {
    const updatedAt = new Date();
    updatedAt.setHours(14, 35, 0, 0);
    localStorage.setItem("line-ai.conversations.v1", JSON.stringify([{
      id: "conversation-time",
      title: "Zaman damgalı sohbet",
      turns: [{ from: "user", id: "turn-time", text: "Merhaba", timestamp: "14:35" }],
      updatedAt: updatedAt.toISOString(),
    }]));

    render(<LineAiApp executePrompt={vi.fn()} />);

    expect(within(screen.getByRole("button", { name: "Zaman damgalı sohbet" })).getByText("14:35")).toBeInTheDocument();
  });

  it("sohbet sağ tık menüsüyle yeniden adlandırır ve onayla siler", async () => {
    const user = userEvent.setup();
    localStorage.setItem("line-ai.conversations.v1", JSON.stringify([{
      id: "conversation-1",
      title: "Eski başlık",
      turns: [{ from: "user", id: "turn-1", text: "Merhaba", timestamp: "12:00" }],
      updatedAt: new Date().toISOString(),
    }]));
    render(<LineAiApp executePrompt={vi.fn()} />);

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
    await waitFor(() => expect(localStorage.getItem("line-ai.conversations.v1")).toBe("[]"));
  });

  it("silinen sohbeti zaman sınırlı geri alma kaydıyla geri getirir", async () => {
    const user = userEvent.setup();
    localStorage.setItem("line-ai.conversations.v1", JSON.stringify([{
      id: "conversation-undo",
      title: "Geri alınacak sohbet",
      turns: [{ from: "user", id: "turn-undo", text: "Merhaba", timestamp: "12:00" }],
      updatedAt: new Date().toISOString(),
    }]));
    render(<LineAiApp executePrompt={vi.fn()} />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Geri alınacak sohbet" }), {
      clientX: 80,
      clientY: 120,
    });
    await user.click(screen.getByRole("menuitem", { name: "Sohbeti sil" }));
    await user.click(within(screen.getByRole("dialog", { name: "Sohbet silinsin mi?" })).getByRole("button", { name: "Sohbeti sil" }));
    expect(screen.getByRole("status")).toHaveTextContent("Sohbet silindi");

    await user.click(screen.getByRole("button", { name: "Geri al" }));
    expect(screen.getByRole("button", { name: "Geri alınacak sohbet" })).toBeInTheDocument();
  });

  it("sohbeti sağ tık menüsünden sabitleyip ayrı grupta saklar", async () => {
    const user = userEvent.setup();
    localStorage.setItem("line-ai.conversations.v1", JSON.stringify([{
      id: "conversation-pin",
      title: "Sabitlenecek sohbet",
      turns: [{ from: "user", id: "turn-pin", text: "Merhaba", timestamp: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    }]));
    render(<LineAiApp executePrompt={vi.fn()} />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Sabitlenecek sohbet" }), {
      clientX: 80,
      clientY: 120,
    });
    await user.click(screen.getByRole("menuitem", { name: "Sohbeti sabitle" }));

    expect(screen.getByText("Sabitlenenler")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("line-ai.conversations.v1") ?? "[]")[0]?.pinned).toBe(true));
  });

  it("sidebar genişliğini klavye ile değiştirip cihazda saklar", async () => {
    render(<LineAiApp executePrompt={vi.fn()} />);
    const separator = screen.getByRole("separator", { name: "Kenar çubuğu genişliğini ayarla" });

    fireEvent.keyDown(separator, { key: "ArrowRight" });

    expect(separator).toHaveAttribute("aria-valuenow", "288");
    await waitFor(() => expect(localStorage.getItem("line-ai.sidebar-width.v1")).toBe("288"));
  });

  it("mesaj sağ tık menüsünden alıntı oluşturur", async () => {
    const user = userEvent.setup();
    localStorage.setItem("line-ai.conversations.v1", JSON.stringify([{
      id: "conversation-2",
      title: "Alıntı denemesi",
      turns: [{ from: "assistant", id: "turn-2", text: "Kanıtlanmış sonuç", timestamp: "12:01" }],
      updatedAt: new Date().toISOString(),
    }]));
    render(<LineAiApp executePrompt={vi.fn()} />);

    fireEvent.contextMenu(screen.getByLabelText("Line AI mesajı işlemleri"), {
      clientX: 300,
      clientY: 220,
    });
    expect(screen.getByRole("menu", { name: "Mesaj işlemleri" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Mesajı alıntıla" }));

    expect(screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" })).toHaveValue(
      "> Kanıtlanmış sonuç\n\n"
    );
  });

  it("ayarları gerçek sohbet tercihleriyle birlikte yönetir", async () => {
    const user = userEvent.setup();
    const executePrompt = vi.fn().mockResolvedValue({
      message: "Gemini yanıtı",
      model: "gemini-test",
      provider: "gemini",
    });
    render(<LineAiApp executePrompt={executePrompt} />);

    await user.click(screen.getByRole("button", { name: "Ayarları aç" }));
    const settings = screen.getByRole("dialog", { name: "Line AI ayarları" });
    await user.click(within(settings).getByRole("button", { name: "Yapay zekâ" }));
    await user.click(within(settings).getByRole("button", { name: /^Gemini/ }));
    await user.click(within(settings).getByRole("button", { name: /^Derin/ }));
    await user.click(within(settings).getByRole("button", { name: /^Truth Mode/ }));
    await user.click(within(settings).getAllByRole("button", { name: "Ayarları kapat" }).at(-1)!);

    const input = screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" });
    await user.type(input, "Tercihleri doğrula");
    await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));

    await waitFor(() => expect(executePrompt).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gemini",
      reasoning: "high",
      truthMode: false,
    })));
    expect(JSON.parse(localStorage.getItem("line-ai.preferences.v1") ?? "null")).toEqual({
      provider: "gemini",
      reasoning: "high",
      theme: "system",
      truthMode: false,
    });
  });

  it("komut panelini yalnız artı yazıldığında açar ve seçimi gönderime uygular", async () => {
    const user = userEvent.setup();
    const executePrompt = vi.fn().mockResolvedValue({
      message: "Tamam",
      model: "gemini-test",
      provider: "gemini",
    });
    render(<LineAiApp executePrompt={executePrompt} />);

    expect(screen.queryByRole("menu", { name: "Line AI komutları" })).not.toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Line AI'ya mesaj gönder" });
    await user.type(input, "+gemini");
    const commandMenu = screen.getByRole("menu", { name: "Line AI komutları" });
    await user.click(within(commandMenu).getByRole("menuitem", { name: /Sağlayıcı: Gemini/ }));
    expect(input).toHaveValue("");

    await user.type(input, "Komut seçimi çalıştı mı?");
    await user.click(screen.getByRole("button", { name: "Mesajı gönder" }));
    await waitFor(() => expect(executePrompt).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gemini",
      prompt: "Komut seçimi çalıştı mı?",
    })));
  });
});
