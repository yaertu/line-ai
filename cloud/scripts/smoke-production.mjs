import { createHash, randomUUID } from "node:crypto";

const baseUrl = (process.env.LINE_AI_CLOUD_URL ?? "https://lineaicloud.vercel.app").replace(/\/$/, "");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${path} JSON olmayan bir yanıt döndürdü (${response.status}).`);
    }
  }
  return { body, response };
};

const requestRaw = (path, init = {}) => fetch(`${baseUrl}${path}`, init);

const sourceUiTours = [
	{ id: "line-ai-baslangic-turu", surface: "Yeni sohbet ana ekranı" },
	{ id: "line-ai-dosya-baglami-turu", surface: "Yeni sohbet > dosya bağlamı ekleme" },
	{ id: "line-ai-bulut-veri-turu", surface: "Ayarlar > Bulut verileri" },
	{ id: "line-ai-gorunum-turu", surface: "Ayarlar > Görünüm" },
	{ id: "line-ai-tarayici-turu", surface: "Ayarlar > Tarayıcı" },
];

const requestAndHash = async (path) => {
	const response = await requestRaw(path);
	const bytes = Buffer.from(await response.arrayBuffer());
	return {
		response,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
};

let credentials = null;
let installationDeleted = false;

try {
	const landing = await requestRaw("/");
	const landingHtml = await landing.text();
	assert(landing.status === 200, "Landing sayfası yüklenemedi.");
	assert(
		landingHtml.includes("Bir şey yaz.") &&
			landingHtml.includes("Fikirden sonuca") &&
			landingHtml.includes("Video stüdyosu") &&
			landingHtml.includes('class="feature-card"') &&
			landingHtml.includes('id="tour-video"') &&
		sourceUiTours.every(
			({ id }) =>
				landingHtml.includes(`/media/${id}.mp4`) &&
				landingHtml.includes(`/media/${id}-poster.png`),
		),
		"Landing yeni, basit video turunu ve tüm kısa kaynak UI kayıtlarını sunmuyor.",
	);
	assert(
		landingHtml.includes("/media/line-ai-gercek-kodlama.mp4") &&
			landingHtml.includes("/media/line-ai-gercek-kodlama-poster.png"),
		"Landing doğrulanmış gerçek kodlama kaydını kullanmıyor.",
	);
	assert(
		landingHtml.includes("/media/line-ai-v061-yenilikler.mp4") &&
			landingHtml.includes("/media/line-ai-v061-yenilikler-poster.png") &&
			landingHtml.includes("releases/download/v0.6.1/Line.AI.exe"),
		"Landing v0.6.1 kaynak arayüz kaydını veya sabit indirme bağlantısını kullanmıyor.",
	);

	const evidenceResponse = await requestRaw(
		"/media/line-ai-gercek-kodlama.evidence.json",
	);
	const evidence = await evidenceResponse.json();
	assert(evidenceResponse.status === 200, "Capture evidence JSON yayınlanmıyor.");
	assert(
		evidence?.artifact?.fileName === "line-ai-logo.svg" &&
			evidence?.artifact?.conversation?.artifactTurns === 2 &&
			evidence?.artifact?.chatSourceHiddenVerified === true,
		"Production capture evidence iki gerçek, sızıntısız SVG turunu doğrulamıyor.",
	);

	const videoResponse = await requestRaw("/media/line-ai-gercek-kodlama.mp4");
	const videoBytes = Buffer.from(await videoResponse.arrayBuffer());
	const videoHash = createHash("sha256").update(videoBytes).digest("hex");
	assert(videoResponse.status === 200, "Gerçek kodlama videosu yayınlanmıyor.");
	assert(
		videoHash === evidence?.video?.sha256,
		"Production videosu ile evidence SHA-256 özeti eşleşmiyor.",
	);
	console.log("landingRealCapture=PASS");

	const sourceUiEvidenceResponse = await requestRaw(
		"/media/line-ai-v061-yenilikler.evidence.json",
	);
	const sourceUiEvidence = await sourceUiEvidenceResponse.json();
	assert(sourceUiEvidenceResponse.status === 200, "v0.6.1 kaynak arayüz evidence JSON yayınlanmıyor.");
	assert(
		sourceUiEvidence?.source?.kind === "vite-source-ui-playwright" &&
			sourceUiEvidence?.source?.surface === "Ayarlar > Hakkında > Yenilikler · v0.6.1" &&
			sourceUiEvidence?.claims?.notShownAsProductUi?.includes("yönetici giriş bilgileri veya Engine anahtarı"),
		"v0.6.1 kaynak arayüz kaydının kapsamı ve sınırı doğrulanamıyor.",
	);

	const sourceUiVideoResponse = await requestRaw("/media/line-ai-v061-yenilikler.mp4");
	const sourceUiVideoBytes = Buffer.from(await sourceUiVideoResponse.arrayBuffer());
	const sourceUiVideoHash = createHash("sha256").update(sourceUiVideoBytes).digest("hex");
	assert(sourceUiVideoResponse.status === 200, "v0.6.1 kaynak arayüz videosu yayınlanmıyor.");
	assert(
		sourceUiVideoHash === sourceUiEvidence?.video?.sha256,
		"v0.6.1 kaynak arayüz videosu ile evidence SHA-256 özeti eşleşmiyor.",
	);
	console.log("landingV050SourceUi=PASS");

	for (const tour of sourceUiTours) {
		const evidenceResponse = await requestRaw(`/media/${tour.id}.evidence.json`);
		const evidence = await evidenceResponse.json();
		assert(evidenceResponse.status === 200, `${tour.id} evidence JSON yayınlanmıyor.`);
		assert(
			evidence?.source?.kind === "vite-source-ui-playwright" &&
			evidence?.source?.surface === tour.surface &&
				evidence?.video?.fileName === `${tour.id}.mp4` &&
				evidence?.poster?.fileName === `${tour.id}-poster.png` &&
				evidence?.capture?.publishedDurationSeconds === 5 &&
				evidence?.capture?.startupFramesPublished === false &&
				Array.isArray(evidence?.claims?.shown) &&
				evidence.claims.shown.length > 0,
			`${tour.id} gerçek kaynak arayüz kapsamını doğrulamıyor.`,
		);

		const [video, poster] = await Promise.all([
			requestAndHash(`/media/${tour.id}.mp4`),
			requestAndHash(`/media/${tour.id}-poster.png`),
		]);
		assert(video.response.status === 200, `${tour.id} videosu yayınlanmıyor.`);
		assert(poster.response.status === 200, `${tour.id} poster görseli yayınlanmıyor.`);
		assert(video.sha256 === evidence.video.sha256, `${tour.id} videosu evidence özetiyle eşleşmiyor.`);
		assert(poster.sha256 === evidence.poster.sha256, `${tour.id} poster görseli evidence özetiyle eşleşmiyor.`);
	}
	console.log("landingFeatureSourceUiTours=PASS");

  const engineEvidenceResponse = await requestRaw('/media/line-ai-engine-yonetim.evidence.json');
  const engineEvidence = await engineEvidenceResponse.json();
  const engineVideo = await requestAndHash('/media/line-ai-engine-yonetim.mp4');
  assert(landingHtml.includes('data-tour="engine"') && engineEvidence.source.kind === 'live-production-admin' && engineEvidence.credentialsRecorded === false && engineVideo.response.status === 200 && engineVideo.sha256 === engineEvidence.sha256, 'Canlı Engine yönetim videosu doğrulanamadı.');
  console.log('landingEngineManagementTour=PASS');
  const health = await request("/api/v1/health");
  assert(health.response.status === 200, "Health endpoint başarısız.");
  assert(health.body?.status === "ok" && health.body?.database === "ready", "Health yanıtı hazır değil.");
  console.log("health=PASS");

  const unauthenticated = await request("/api/v1/conversations");
  assert(unauthenticated.response.status === 401, "Kimliksiz istek reddedilmedi.");
  console.log("unauthenticatedRejected=PASS");

  const registration = await request("/api/v1/installations", {
    method: "POST",
    body: JSON.stringify({ client: "line-ai-production-smoke" }),
  });
  assert(registration.response.status === 201, "Kurulum kaydı oluşturulamadı.");
  assert(typeof registration.body?.installationId === "string", "Kurulum kimliği eksik.");
  assert(/^lai_live_[A-Za-z0-9_-]{43}$/.test(registration.body?.secret ?? ""), "Kurulum secret biçimi geçersiz.");
  credentials = {
    installationId: registration.body.installationId,
    secret: registration.body.secret,
  };
  console.log("installationCreate=PASS");

  const authHeaders = {
    authorization: `Bearer ${credentials.secret}`,
    "x-lineai-installation": credentials.installationId,
  };
  const conversationId = `smoke-${randomUUID()}`;
  const conversation = {
    id: conversationId,
    pinned: false,
    title: "Production doğrulama",
    turns: [
      { role: "user", text: "Geçici doğrulama iletisi" },
      { role: "assistant", text: "Geçici doğrulama yanıtı" },
    ],
    updatedAt: new Date().toISOString(),
  };

  const upsert = await request("/api/v1/conversations", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ conversation }),
  });
  assert(upsert.response.status === 200 && Number(upsert.body?.version) === 1, "Sohbet kaydı yazılamadı.");
  console.log("conversationUpsert=PASS");

  const list = await request("/api/v1/conversations", { headers: authHeaders });
  assert(list.response.status === 200, "Sohbet listesi okunamadı.");
  assert(list.body?.conversations?.some((entry) => entry.id === conversationId), "Yazılan sohbet listede bulunamadı.");
  console.log("conversationRead=PASS");

  const removeConversation = await request(`/api/v1/conversations?id=${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  assert(removeConversation.response.status === 204, "Sohbet silinemedi.");
  console.log("conversationDelete=PASS");

  const removeInstallation = await request("/api/v1/installations", {
    method: "DELETE",
    headers: authHeaders,
  });
  assert(removeInstallation.response.status === 204, "Kurulum verileri silinemedi.");
  installationDeleted = true;
  console.log("installationDelete=PASS");

  const revoked = await request("/api/v1/conversations", { headers: authHeaders });
  assert(revoked.response.status === 401, "Silinen kurulum kimliği yeniden kullanılabildi.");
  console.log("deletedCredentialRejected=PASS");
} finally {
  if (credentials && !installationDeleted) {
    await request("/api/v1/installations", {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${credentials.secret}`,
        "x-lineai-installation": credentials.installationId,
      },
    }).catch(() => {});
  }
}
