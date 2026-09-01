<p align="center">
  <img src="./public/line-ai-mark.svg" width="128" height="128" alt="Line AI logosu">
</p>

<h1 align="center">Line AI</h1>

<p align="center">
  <strong>Fikrini, dosyalarını ve kodunu tek bir düzenli çalışma alanında buluşturan açık kaynak Windows yapay zekâ uygulaması.</strong>
</p>

<p align="center">
  <img alt="Platform: Windows" src="https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows11&logoColor=white">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-Native-000000?logo=rust&logoColor=white">
  <img alt="Dil: Türkçe" src="https://img.shields.io/badge/Dil-Türkçe-E30A17">
  <img alt="Lisans: MIT" src="https://img.shields.io/badge/Lisans-MIT-2EA44F">
</p>

Line AI; desteklenen sağlayıcı API'lerini tek arayüzde kullandıran, sohbet geçmişini Line AI Cloud ile eşitleyen ve dosya ya da klasör bağlamıyla çalışabilen bir Windows masaüstü uygulamasıdır. Gösterişli bir maket değil: eklenen API bağlantısının doğrulanması, model seçimi, akıl yürütme düzeyi, dosya okuma, hata durumu, bulut geçmişi ve ayarlar gerçek uygulama akışlarına bağlıdır.

<p align="center">
  <a href="https://lineaicloud.vercel.app"><strong>Line AI tanıtım sitesini aç</strong></a>
</p>

## Uygulamadan görüntüler

![Line AI tanıtım](./docs/gorseller/line-ai-tanitim.gif)

| ☀️ Açık tema | 🌙 Koyu tema |
| --- | --- |
| ![Line AI açık tema](./docs/gorseller/line-ai-acik-tema.png) | ![Line AI koyu tema](./docs/gorseller/line-ai-koyu-tema.png) |

## Öne çıkan özellikler

- 💬 **Düzenli sohbet çalışma alanı:** Sidebar'ın üstünde arama, yeni sohbet, zaman damgalı ve gruplandırılmış geçmiş, sabitleme, yeniden adlandırma, silme ve beş saniyelik geri alma.
- 🧭 **Gerçek Sidebar:** 240–400 piksel arasında sürüklenerek veya klavyeyle yeniden boyutlandırılan geniş görünüm; daraltılmış ikon şeridi ve mobil çekmece.
- 🔀 **Sağlayıcı yönlendirme:** Kullanıcının eklediği desteklenen API bağlantılarını doğrular; otomatik modda yalnız çalıştığı doğrulanan bağlantılar arasında kontrollü geçiş yapar.
- 🧠 **Akıl yürütme ve durum:** Hızlı, orta ve yüksek düzeyler; istek hazırlama, gerçek sağlayıcı/model/deneme, artifact aktarım miktarı ve hata durumları sohbet içinde görünür.
- 🧩 **Gerçek artifact çalışma alanı:** Kod ve güvenli SVG çıktıları sohbet metnine dökülmeden KOD, ÖNİZLE ve indirme yüzeylerine gider; DIFF sekmesi önceki kararlı artifact ile güncel dosyayı provider'dan bağımsız olarak yerelde karşılaştırır.
- ⚙️ **İşlevsel Ayarlar:** Genel, içe/dışa aktarma, yapay zekâ, görünüm, kişiselleştirme, kısayollar, tarayıcı, bulut verileri, arşiv ve hakkında bölümleri; kontroller gerçek uygulama durumuna bağlıdır.
- 🌐 **Gerçek Chrome köprüsü:** Chrome'u başlatma/durdurma, etkin sayfayı okuma, URL açma, geri gitme, yenileme, tıklama ve yazma komutları native CDP köprüsü üzerinden çalışır.
- 📎 **Dosya, klasör ve arşiv bağlamı:** Windows sürükle-bırak; klasörleri güvenli dolaşma; ZIP, RAR, 7z, TAR ve sıkıştırılmış TAR ailesini diske çıkarmadan okuma; içerik tabanlı metin/ikili algılama.
- 👍 **İnsancıl geri bildirim:** Asistan yanıtlarına beğen/beğenme tepkisi, işlem durumları ve geri alınabilir arşivleme akışı.
- ⌨️ **`+` komut paneli:** Görünür bir ek düğme olmadan sağlayıcı, akıl yürütme, Truth Mode ve ek dosya komutlarına hızlı erişim.
- 🔎 **Hızlı komut merkezi:** `Ctrl+K` ile sohbetleri, ayarları, sağlayıcıyı, akıl yürütmeyi ve temayı tek arama alanından yönetme.
- 🛡️ **Truth Mode:** Varsayılan açık doğruluk disiplini; doğrulanmamış sonucu tamamlanmış gibi göstermeyi engelleyen sistem talimatı.
- 🔐 **Anahtar güvenliği:** Sağlayıcı anahtarları yalnız native masaüstü sürecinde okunur; arayüze veya sohbet kaydına yazılmaz.
- ☁️ **Line AI Cloud geçmişi:** Her kurulum için ayrı kimlikle otomatik eşitleme, eski cihaz geçmişini ilk başarılı bağlantıda taşıma, yeniden deneme ve bulut verilerini silme.
- 🌗 **Açık/koyu tema:** Sistem tercihini izleme, okunaklı tipografi ve hareket azaltma ayarına saygı.
- 📐 **Responsive yapı:** İçeriği ezmek yerine Sidebar ve panelleri ekran genişliğine uygun düzene dönüştürür.

## Gereksinimler

- Windows 10 veya Windows 11
- Node.js 20 veya üstü
- pnpm 10
- Rust stable toolchain
- Tauri 2 için Windows WebView2 ve C++ derleme araçları
- En az bir sağlayıcı anahtarı

## Sağlayıcı yapılandırması

Anahtarları kaynak dosyasına veya `.env` dosyasına eklemeyin. Windows kullanıcı ortam değişkeni olarak tanımlayın ve ardından Line AI'ı yeniden başlatın:

```powershell
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'ANAHTARINIZ', 'User')
[Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'ANAHTARINIZ', 'User')
```

İkinci Gemini anahtarı isteğe bağlıdır:

```powershell
[Environment]::SetEnvironmentVariable('GEMINI_API_KEY2', 'IKINCI_ANAHTARINIZ', 'User')
```

Varsayılan modeller isteğe bağlı olarak değiştirilebilir:

```powershell
[Environment]::SetEnvironmentVariable('LINE_AI_OPENAI_MODEL', 'gpt-5.6-terra', 'User')
[Environment]::SetEnvironmentVariable('LINE_AI_GEMINI_MODEL', 'gemini-3.7-flash', 'User')
```

Uygulama anahtar değerlerini arayüze döndürmez. Sağlayıcı hata metinleri kullanıcıya gösterilmeden önce anahtar değerlerinden arındırılır.

## Geliştirme

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Native geliştirme:

```powershell
pnpm tauri:dev
```

## Doğrulama ve derleme

Frontend statik kontrol, birim testleri ve production derlemesi:

```powershell
pnpm verify
```

Rust testleri:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Portable Windows çalıştırılabilir dosyası:

```powershell
pnpm tauri:build
```

Çıktı `src-tauri/target/release/line-ai.exe` yolunda oluşur. Dağıtımdaki çalıştırılabilir dosya imzalanmamışsa Windows bunu bilinmeyen yayıncı olarak gösterebilir; yayın öncesinde güvenilir bir Authenticode sertifikasıyla imzalanması önerilir.

Doğrulama, Rust testleri, native derleme ve masaüstü EXE kopyası tek komutla üretilebilir:

```powershell
pnpm release:desktop
```

Komut masaüstünde yalnız `Line AI.exe` teslim dosyasını günceller. GitHub Release indirmelerinde de tek özel varlık aynı doğrulanmış EXE'dir.

## Dosya ve klasör sınırları

- Tek işlemde en fazla **30 dosya**.
- Dosya başına en fazla **512 MiB**.
- Model bağlamı için dosya başına en fazla 64 KiB, toplamda en fazla 2 MiB metin önizlemesi okunur; dosyanın kendisi değiştirilmez.
- Dosyalar yalnız uzantı beyaz listesine göre değil, gerçek içeriklerine göre algılanır. Metin/kod türleri, uzantısız metinler ve bilinmeyen metin uzantıları kabul edilir; ikili içerikler güvenli metadata olarak eklenir.
- Bırakılan klasörler alt klasörleriyle güvenli biçimde taranır; sembolik bağlantılar izlenmez.
- `zip`, `rar`, `7z`, `tar`, `tar.gz`, `tgz`, `tar.bz2`, `tbz2`, `tar.xz`, `txz`, `gz`, `bz2`, `xz`, `cab` ve `cpio` arşivleri diske açılmadan güvenli biçimde okunur. Arşiv içindeki dosyalar da aynı adet ve boyut sınırlarına tabidir.
- İkili dosyalar belleğe metin gibi alınmaz; güvenli dosya metadatasıyla açıkça işaretlenir.
- Bırakılan içerik güvenilmeyen kullanıcı verisi kabul edilir; dosyadaki talimatlar sistem talimatı sayılmaz.

## `+` komut paneli

Sohbet alanı `+` ile başladığında komut paneli açılır. Kullanıcı buradan gerçek sağlayıcıyı ve akıl yürütme düzeyini değiştirebilir, Truth Mode'u açıp kapatabilir veya eklenmiş dosyaları temizleyebilir. `+` karakteri tek başına modele gönderilmez.

## Klavye kısayolları

- `Ctrl+K`: Sohbet ve gerçek uygulama komutlarını arayan komut merkezini açar.
- `Ctrl+N`: Yeni ve boş bir sohbet açar.
- `Ctrl+,`: Ayarlar panelini açar.
- `Enter`: Mesajı gönderir.
- `Shift+Enter`: Mesaj içinde yeni satır açar.

## Truth Mode

Truth Mode varsayılan olarak açıktır. Arayüzdeki kalkan düğmesiyle veya sohbet alanına aşağıdaki komutları yazarak değiştirilebilir:

```text
/truthmode
/truthmode aç
/truthmode kapat
```

Bu özellik model hatalarını tamamen ortadan kaldırma garantisi değildir. Önemli kararlar öncesinde model cevaplarını bağımsız olarak doğrulayın.

## Veri ve gizlilik

- Sohbet geçmişi, her Line AI kurulumuna ayrılan izole Line AI Cloud alanında saklanır ve HTTPS üzerinden eşitlenir.
- Uygulama ilk bağlantıda rastgele bir kurulum kimliği ve gizli anahtar oluşturur. Sunucuda yalnız gizli anahtarın özeti tutulur; özgün gizli anahtar Windows Credential Manager içinde saklanır.
- Tema ve arayüz tercihleri gibi cihaz ayarları cihazda kalır. Eski sürümden kalan sohbet geçmişi yalnız ilk başarılı bulut aktarımına kadar geçiş kaynağı olarak okunur ve aktarım tamamlanınca temizlenir.
- Mesaj gönderildiğinde seçili sağlayıcıya sohbet bağlamı ve eklenmiş dosya metni gönderilir.
- Bulut servisi konuşma içeriğini eşitlemek için işler; uçtan uca şifreli bir kasa değildir. Bulut kayıtları Ayarlar > Bulut verileri bölümünden silinebilir.
- Line AI Cloud kullanıcı hesabı istemez; erişim kurulum kimliği ile Windows Credential Manager'daki gizli anahtarın birlikte doğrulanmasına dayanır.
- API kullanımı, kota ve ücretlendirme seçilen sağlayıcının hesabına aittir.

## Line AI Cloud geliştirme ve doğrulama

Tanıtım sitesi ile konuşma API'si `cloud/` dizinindedir. Gizli değerler repoya eklenmez.

```powershell
pnpm -C cloud install --frozen-lockfile
pnpm -C cloud check
pnpm -C cloud smoke:production
```

Üretim sağlık uç noktası: [`https://lineaicloud.vercel.app/api/v1/health`](https://lineaicloud.vercel.app/api/v1/health)

## Türkçe sürüm ve görsel güncelleme standardı

- Kullanıcıya görünen her değişiklik [CHANGELOG.md](./CHANGELOG.md) içinde Türkçe kaydedilir.
- Arayüz değişikliklerinden sonra gerçek uygulamadan açık/koyu görüntüler ve tanıtım GIF'i yenilenir.
- Her yayın öncesinde doğrulama zinciri çalıştırılır; GitHub sürümüne yalnız aynı doğrulanmış EXE yüklenir.
- CI; lint, TypeScript, React testleri, production build ve Rust testlerini Windows üzerinde yeniden çalıştırır.

## Lisans ve atıf

Line AI MIT lisansı altında yayımlanır. Üçüncü taraf lisans ve telif bildirimleri [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) içinde korunur.
