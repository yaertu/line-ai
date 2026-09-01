/* global console, process, setTimeout, clearTimeout, performance, AbortController, fetch, TextDecoder */

const keyName = process.env.LINE_AI_PROBE_KEY === "2" ? "GEMINI_API_KEY2" : "GEMINI_API_KEY";
const key = process.env[keyName]?.trim();
if (!key) throw new Error("GEMINI_API_KEY bulunamadı.");

const model = process.env.LINE_AI_PROBE_MODEL?.trim() || process.env.LINE_AI_GEMINI_MODEL?.trim() || "gemini-3.7-flash";
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
const prompt = [
	"Oyuncular için yüksek kaliteli, karanlık neon temalı ve tamamen çalışan tek dosyalık bir e-spor topluluk landing sayfası oluştur.",
	"Responsive hero, yaklaşan turnuva kartları, canlı oyuncu istatistikleri, takım bölümü, erişilebilir klavye odağı ve prefers-reduced-motion desteği içersin.",
	"Harici ağ kaynağı kullanma; CSS ve JavaScript aynı HTML dosyasında olsun.",
	"Kısa bir girişten sonra çıktıyı tam olarak html dilinde, file=index.html adlı fenced kod bloğunda ver.",
].join(" ");
const systemInstruction = [
	"Sen Line AI masaüstü asistanısın. Kullanıcının dilinde, açık, doğal ve yararlı cevap ver.",
	"Kullanıcı kod veya dosya üretmeni istediğinde her dosyayı ```dil file=dosya-adı biçimindeki ayrı bir kod bloğunda döndür; açıklamayı kod bloklarının dışında kısa tut.",
	"/truthmode AÇIK: Çalıştırılmamış bir işlemi çalıştı, doğrulanmamış bir sonucu doğrulandı ve tamamlanmamış bir işi tamamlandı diye sunma.",
	"Yanıt stili: Netlik ile yeterli açıklama arasında dengeli ol.",
].join(" ");

const modes = [process.env.LINE_AI_PROBE_SEARCH === "1"];
for (const withSearch of modes) {
	const startedAt = performance.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 90_000);
	let firstTextAt;
	let textCharacters = 0;
	let events = 0;
	const finishReasons = new Set();
	const partKinds = new Set();
	let status = 0;
	let usage;
	let error;
	try {
		const body = {
			...(process.env.LINE_AI_PROBE_SYSTEM === "1"
				? { systemInstruction: { parts: [{ text: systemInstruction }] } }
				: {}),
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			generationConfig: {
				maxOutputTokens: 8192,
				thinkingConfig: { thinkingLevel: "LOW" },
			},
			...(withSearch ? { tools: [{ google_search: {} }] } : {}),
		};
		const response = await fetch(endpoint, {
			body: JSON.stringify(body),
			headers: {
				"content-type": "application/json",
				"x-goog-api-key": key,
			},
			method: "POST",
			signal: controller.signal,
		});
		status = response.status;
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
			const blocks = buffer.split(/\r?\n\r?\n/);
			buffer = done ? "" : blocks.pop() ?? "";
			for (const block of blocks) {
				const data = block
					.split(/\r?\n/)
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trimStart())
					.join("\n");
				if (!data || data === "[DONE]") continue;
				events += 1;
				const json = JSON.parse(data);
				if (json?.usageMetadata) usage = json.usageMetadata;
				const finishReason = json?.candidates?.[0]?.finishReason;
				if (finishReason) finishReasons.add(finishReason);
				for (const part of json?.candidates?.[0]?.content?.parts ?? []) {
					partKinds.add(
						Object.keys(part ?? {})
							.filter((key) => key !== "text")
							.sort()
							.join("+") || "text-only",
					);
				}
				const text = json?.candidates?.[0]?.content?.parts
					?.map((part) => part?.text ?? "")
					.join("") ?? "";
				if (text) {
					firstTextAt ??= performance.now();
					textCharacters += text.length;
				}
			}
			if (done) break;
		}
	} catch (caught) {
		error = caught instanceof Error ? caught.name + ": " + caught.message : "unknown";
	} finally {
		clearTimeout(timeout);
	}
	console.log(
		JSON.stringify({
			withSearch,
			keySlot: keyName === "GEMINI_API_KEY2" ? 2 : 1,
			model,
			status,
			events,
			finishReasons: [...finishReasons],
			partKinds: [...partKinds],
			usage,
			textCharacters,
			firstTextMilliseconds: firstTextAt
				? Math.round(firstTextAt - startedAt)
				: null,
			totalMilliseconds: Math.round(performance.now() - startedAt),
			error,
		}),
	);
}
