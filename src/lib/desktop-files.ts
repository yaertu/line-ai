import { invoke } from "@tauri-apps/api/core";

export type DesktopDroppedTextFile = {
  content: string;
  mimeType: string;
  name: string;
  size: number;
};

export const isTauriDesktop = () => "__TAURI_INTERNALS__" in window;

export const readDesktopDroppedTextFiles = async (
  paths: string[]
): Promise<DesktopDroppedTextFile[]> => {
  if (!isTauriDesktop()) {
    throw new Error("Windows dosya bırakma köprüsü yalnız Line CLI masaüstü uygulamasında kullanılabilir.");
  }

  return invoke<DesktopDroppedTextFile[]>("read_dropped_text_files", { paths });
};
