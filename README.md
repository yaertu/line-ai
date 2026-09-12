<p align="center">
  <img src="./public/line-ai-mark.svg" width="128" height="128" alt="Line AI logosu">
</p>

<h1 align="center">Line AI</h1>

<p align="center">
  <strong>Sohbeti, kodu, dosyaları ve görsel üretimini tek Windows çalışma alanında birleştiren açık kaynak istemci.</strong>
</p>

<p align="center">
  <a href="https://lineaicloud.vercel.app"><strong>Tanıtım sitesi</strong></a> ·
  <a href="https://lineaicloud.vercel.app/admin"><strong>Engine yönetimi</strong></a> ·
  <a href="https://github.com/yaertu/line-ai/releases/tag/v0.6.1"><strong>v0.6.1</strong></a>
</p>

## v0.6.1

Line AI artık masaüstünde tek yapay zekâ yolu kullanır: **Line AI Engine**. Eski OpenAI, Gemini, otomatik sağlayıcı ve yerel model seçenekleri uygulamadan kaldırıldı. Kullanıcının bilgisayarında model, Ollama veya GPU kurulumu gerekmez.

- Modern graphite ve mint sohbet arayüzü ile yeni konuşma balonu ikonu.
- ChatGPT benzeri yeni sohbet, aranabilir geçmiş, yeniden adlandırma, sabitleme, arşivleme ve silme akışı.
- Codex benzeri dosya/klasör bağlamı, kod artifact alanı, güvenli SVG önizleme ve sürümler arası DIFF.
- Line AI Image Studio, Chrome araçları, yanıtı durdurma/yeniden deneme ve isteğe bağlı geri bildirim.
- Tek Line AI Engine API sözleşmesi: proje anahtarları, kapsamlar, sona erme, iptal, token ve görsel kotaları, eşzamanlılık, maliyet sınırı ve tekrar koruması.
- Değerlendirilmeden yayına çıkmayan davranış politikaları; izin verilmiş geri bildirimden taslak üretme ve sabit regresyon vakalarıyla ölçme.
- Yönetici oturumu, çalışma anahtarları ve servis sırları GitHub kaynağına veya tarayıcı paketine girmez.

Line AI API, anahtar/kota/politika/denetim katmanı ve masaüstü sözleşmesi bu projeye aittir. Temel çıkarım, sunucuda özel ve değiştirilebilir bir runtime arkasında yürür. Bu sürüm temel model ağırlıklarının sıfırdan eğitildiği iddiasını taşımaz; runtime ileride masaüstünü veya kullanıcı anahtarlarını değiştirmeden Line AI’ın kendi GPU altyapısına geçirilebilir.

## Görsel turlar

![Line AI çalışma alanı](./docs/gorseller/line-ai-tanitim.gif)

| Açık tema | Koyu tema |
| --- | --- |
| ![Line AI açık tema](./docs/gorseller/line-ai-acik-tema.png) | ![Line AI koyu tema](./docs/gorseller/line-ai-koyu-tema.png) |

Sitedeki sekiz video; başlangıç, dosya bağlamı, kod üretimi ve DIFF, bulut verileri, görünüm, tarayıcı, kanıt çekirdeği ve Engine yönetimini ayrı ayrı gösterir.

## Line AI Engine

Masaüstü uygulamasında Ayarlar → Yapay zekâ bölümüne yönetim panelinden üretilen `lai_sk_live_…` anahtarı girilir. Anahtar Windows Credential Manager’da tutulur. İstekler yalnız `https://lineaicloud.vercel.app/api/v1` üzerinden gider.

Başlıca uçlar:

| Yöntem | Uç | Amaç |
| --- | --- | --- |
| `GET` | `/capabilities` | Engine, proje, kota ve model yetenekleri |
| `POST` | `/generate` | Sohbet, kod ve dosya bağlamı üretimi |
| `POST` | `/images/generations` | Görsel işi oluşturma |
| `GET/DELETE` | `/images/:id` | Görsel işi durumu ve silme |
| `POST` | `/feedback` | İsteğe bağlı yanıt geri bildirimi |

Ayrıntılar: [cloud/README.md](./cloud/README.md)

## Program özellikleri

- Aranabilir ve gruplandırılmış sohbet geçmişi; mobil çekmece ve yeniden boyutlandırılabilir kenar çubuğu.
- Hızlı, dengeli ve derin akıl yürütme düzeyleri.
- `Ctrl+K` komut merkezi ve yazma alanındaki `+` akıl yürütme/ek temizleme komutları.
- Dosya, klasör, ZIP/RAR/7z/TAR ve sıkıştırılmış arşivleri diske çıkarmadan güvenli okuma.
- Dosya başına 64 KiB, toplam 2 MiB metin bağlamı; ikili dosyalar yalnız güvenli metadata olarak eklenir.
- Kod, HTML ve SVG artifact önizleme; önceki sürümle yerel DIFF ve dosya indirme.
- Chrome başlatma/durdurma, sayfa okuma, URL açma, geri gitme, yenileme, tıklama ve yazma araçları.
- Açık/koyu tema, yazı boyutu, hareket azaltma ve özel yanıt tercihleri.
- Kurulum kimliğiyle Line AI Cloud geçmiş eşitleme ve uygulama içinden toplu silme.

Doğruluk koruması kullanıcı tarafından kapatılamayan Engine politikasıdır. Line AI çalıştırmadığı işlemi tamamlandı diye sunmamak, belirsizliği belirtmek ve kaynak uydurmamak üzere yönlendirilir; bu yine de her yanıtın hatasız olduğu garantisi değildir.

## Geliştirme

Gereksinimler: Windows 10/11, Node.js 20+, pnpm 10, Rust stable, WebView2 ve Tauri 2 için C++ derleme araçları.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Native geliştirme:

```powershell
pnpm tauri:dev
```

Tam doğrulama ve portable EXE:

```powershell
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri:build
```

Çıktı `src-tauri/target/release/line-ai.exe` yolunda oluşur. `pnpm release:desktop` doğrulama ve masaüstü teslimini birlikte çalıştırır.

## Gizlilik

- Engine anahtarı Windows Credential Manager’da saklanır; React durumuna veya sohbet kaydına yazılmaz.
- Yönetici bilgileri yalnız yerel operator kasasında ve sunucu ortamında tutulur.
- Tema ve cihaz tercihleri yerelde kalır; sohbet geçmişi kurulum kimliğiyle Line AI Cloud’da eşitlenir ve silinebilir.
- Gönderilen sohbet bağlamı ve izin verilen dosya metni üretim için Engine’e iletilir; Engine prompt içeriğini istek tablosunda saklamaz.
- İstek maliyeti ve kota kullanımı yönetim panelinde görünür. Başarısız ve kesin reddedilmiş işlerde ayrılan kota iade edilir.

## Lisans

Line AI MIT lisansı altında yayımlanır. Üçüncü taraf bildirimleri [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) içinde korunur.
