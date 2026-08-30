# Line CLI

Line CLI, Windows üzerinde çalışan; OpenAI ve Gemini sağlayıcılarına doğrudan bağlanan, SmoothUI Chat Template temelli açık kaynak bir masaüstü yapay zekâ sohbet uygulamasıdır. Uygulamanın adı "CLI" olsa da dağıtılan ürün Tauri tabanlı grafik masaüstü uygulamasıdır.

## Öne çıkan özellikler

- SmoothUI Chat Template düzeni, açık/koyu tema ve hareket azaltma tercihine saygılı animasyonlar.
- Windows ortam değişkenlerinden okunan OpenAI ve Gemini anahtarları; anahtarlar tarayıcıya, `localStorage` alanına veya sohbet kaydına yazılmaz.
- `Otomatik`, `OpenAI` ve `Gemini` sağlayıcı seçimi.
- Otomatik modda OpenAI kullanılamazsa Gemini'ye kontrollü geçiş; açıkça seçilen sağlayıcıda sağlayıcılar arası sessiz geçiş yapılmaz.
- Hızlı, orta ve yüksek akıl yürütme seviyeleri.
- Varsayılan olarak açık `/truthmode`; doğrulanmamış sonucu tamamlanmış gibi sunmayı engelleyen sistem talimatı.
- Native Windows dosya sürükle-bırak desteği, uzantı/boyut/adet sınırı ve UTF-8 metin okuma.
- Cihazda saklanan sohbet geçmişi; sohbetleri açma, yeniden adlandırma ve silme.
- Sohbet ve mesajlar için fare/klavye ile erişilebilen bağlam menüleri.
- Daraltılabilir ve küçük ekranlara uyarlanan sohbet kenar çubuğu.
- G4F, Codex CLI, CODEXP çalışma zamanı veya başka bir yerel uygulamaya bağımlılık yoktur.

## Gereksinimler

- Windows 10 veya Windows 11
- Node.js 20 veya üstü
- pnpm 10
- Rust stable toolchain
- Tauri 2 için Windows WebView2 ve C++ derleme araçları
- En az bir sağlayıcı anahtarı

## Sağlayıcı yapılandırması

Anahtarları kaynak dosyasına veya `.env` dosyasına eklemeyin. Windows kullanıcı ortam değişkeni olarak tanımlayın ve ardından Line CLI'yi yeniden başlatın:

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
[Environment]::SetEnvironmentVariable('LINE_CLI_OPENAI_MODEL', 'gpt-5.6-terra', 'User')
[Environment]::SetEnvironmentVariable('LINE_CLI_GEMINI_MODEL', 'gemini-3.7-flash', 'User')
```

Uygulama anahtar değerlerini arayüze döndürmez. Sağlayıcı hata metinleri cevaplanmadan önce anahtar değerlerinden arındırılır.

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

Çıktı `src-tauri/target/release/line-cli.exe` yolunda oluşur. Dağıtımdaki çalıştırılabilir dosya imzalanmamışsa Windows bunu bilinmeyen yayıncı olarak gösterebilir; yayın öncesinde güvenilir bir Authenticode sertifikasıyla imzalanması önerilir.

## Dosya sürükle-bırak sınırları

- Tek işlemde en fazla 4 dosya.
- Dosya başına en fazla 1 MiB.
- Desteklenen uzantılar: `txt`, `md`, `json`, `csv`, `ts`, `tsx`, `js`, `jsx`, `py`, `rs`, `html`, `css`, `toml`, `yaml`, `yml`.
- Klasörler, çalıştırılabilir dosyalar ve desteklenmeyen ikili dosyalar reddedilir.
- Bırakılan dosya içeriği güvenilmeyen kullanıcı verisi kabul edilir; içindeki talimatlar sistem talimatı sayılmaz.

## Truth Mode

Truth Mode varsayılan olarak açıktır. Arayüzdeki kalkan düğmesiyle veya sohbet alanına aşağıdaki komutları yazarak değiştirilebilir:

```text
/truthmode
/truthmode aç
/truthmode kapat
```

Bu özellik model hatalarını tamamen ortadan kaldırma garantisi değildir. Model cevaplarını önemli kararlar öncesinde bağımsız olarak doğrulayın.

## Veri ve gizlilik

- Sohbet geçmişi cihazdaki WebView `localStorage` alanında tutulur.
- Mesaj gönderildiğinde seçili sağlayıcıya sohbet bağlamı ve eklenmiş dosya metni gönderilir.
- Telemetri veya ayrı bir Line CLI sunucusu bulunmaz.
- API kullanımı, kota ve ücretlendirme seçilen sağlayıcının hesabına aittir.

## Lisans ve atıf

Line CLI MIT lisansı altında yayımlanır. Arayüz, MIT lisanslı [SmoothUI Chat Template](https://smoothui.dev/docs/templates/chat) ve bileşenlerinden uyarlanmıştır. Ayrıntılar için `LICENSE` ve `THIRD_PARTY_NOTICES.md` dosyalarına bakın.

