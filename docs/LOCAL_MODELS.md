# Yerel modeller

Line AI, **Yerel model** sağlayıcısında Ollama, LM Studio ve OpenAI uyumlu yerel sunuculara standart OpenAI Chat Completions akışıyla bağlanır. Ayarlar → Yapay zekâ bölümünden motor, uç nokta ve model adı seçilir; sohbet içindeki sağlayıcı seçicisinden **Yerel model** etkinleştirilir.

## Uyumlu varsayılanlar

| Motor | Varsayılan uç nokta | Varsayılan model |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434/v1` | `llama3.2` |
| LM Studio | `http://127.0.0.1:1234/v1` | `llama3.2` |
| OpenAI uyumlu | `http://127.0.0.1:8000/v1` | `llama3.2` |

Sunucunun OpenAI uyumlu `POST /v1/chat/completions` akışlı yanıt vermesi gerekir. Line AI istekleri `stream: true` ile gönderir; `choices[].delta.content` parçalarını kullanıcıya anlık iletir. HTTP veya akış hataları hata olarak gösterilir, başarıya çevrilmez.

## Ağ sınırı

Yerel bağlantı yalnız aşağıdaki uç noktaları kabul eder:

- `http` şeması,
- açık ve sıfır olmayan bir port,
- tam olarak `localhost`, `127.0.0.0/8` veya `[::1]` loopback adresi,
- kullanıcı adı, parola, sorgu parametresi ve URL parçası olmadan.

Yerel istemci sistem proxy'sini kullanmaz ve yönlendirme takip etmez. Böylece yerel model tercihi uzak bir ağa sessizce taşınamaz. Model uç noktası ve model adı cihaz tercihinde saklanır; API anahtarı istenmez veya saklanmaz.

## Sağlayıcı davranışı

**Otomatik** mod yalnız OpenAI ve Gemini arasında mevcut kontrollü geçişini sürdürür. Yerel model seçildiğinde bağlantı ya da model hatası oluşursa Line AI OpenAI, Gemini veya buluta kendiliğinden geçmez.

Yerel modelde web araması, model listesi, sağlık kontrolü veya otomatik model kurulumu yoktur. Sunucuyu ve modeli kullanıcı başlatır; bağlantı hatası uygulamada açıkça görünür.
