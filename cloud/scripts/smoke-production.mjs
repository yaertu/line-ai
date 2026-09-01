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

let credentials = null;
let installationDeleted = false;

try {
	const landing = await requestRaw("/");
	const landingHtml = await landing.text();
	assert(landing.status === 200, "Landing sayfası yüklenemedi.");
	assert(
		landingHtml.includes("/media/line-ai-gercek-kodlama.mp4") &&
			landingHtml.includes("/media/line-ai-gercek-kodlama-poster.png"),
		"Landing doğrulanmış gerçek kodlama kaydını kullanmıyor.",
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
