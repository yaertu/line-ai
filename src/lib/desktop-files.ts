import { invoke } from "@tauri-apps/api/core";
import type { FileContentKind } from "@/lib/file-content";

export type DesktopDroppedTextFile = {
	content: string;
	contentKind: FileContentKind;
	mimeType: string;
	name: string;
	size: number;
	truncated: boolean;
};

export const isTauriDesktop = () => "__TAURI_INTERNALS__" in window;

export const readDesktopDroppedTextFiles = async (
	paths: string[],
): Promise<DesktopDroppedTextFile[]> => {
	if (!isTauriDesktop()) {
		throw new Error(
			"Windows dosya bırakma köprüsü yalnız Line AI masaüstü uygulamasında kullanılabilir.",
		);
	}

	return invoke<DesktopDroppedTextFile[]>("read_dropped_text_files", { paths });
};
