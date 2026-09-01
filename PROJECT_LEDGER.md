# Line AI — canlı proje kaydı

## ACTIVE

- Marka ve ürün adı: **Line AI**.
- Windows masaüstü uygulaması; OpenAI ve Gemini ortam anahtarlarıyla native Tauri işleminden çalışır.
- Sohbet geçmişi, kullanıcı hesabı gerektirmeyen kurulum bazlı Line AI Cloud alanında tutulur; kurulum gizli anahtarı Windows Credential Manager içindedir.
- G4F veya izinsiz üçüncü taraf sağlayıcı geçidi kullanılmaz.
- `/truthmode` varsayılan açıktır.
- Dosya/klasör sürükle-bırak: tek işlemde en fazla 30 desteklenen dosya, dosya başına en fazla 512 MiB.
- Büyük dosyalar bütünüyle belleğe veya sağlayıcı isteğine alınmaz; sınırlı metin önizlemesi açıkça işaretlenir.
- GitHub tanıtımı Türkçe, insan yazımı ürün diliyle tutulur; başka arayüz markaları tanıtım metninde öne çıkarılmaz.
- Sağ çalışma alanında KOD ve ÖNİZLE yanında her zaman görünür gerçek bir DIFF sekmesi bulunur. DIFF provider çıktısına bağlı değildir; önceki kararlı artifact ile güncel gerçek dosya içeriğini yerel olarak karşılaştırır.
- İlk kararlı artifact DIFF görünümünde karşılaştırılacak önceki sürüm olmadığı açıkça gösterilir; sonraki sürümlerde eklenen, silinen ve bağlam satırları eski/yeni satır numaralarıyla görünür.
- Her kullanıcıya görünen değişiklikte ekran görüntüleri, özellik listesi, changelog, EXE ve GitHub Release birlikte yenilenir.
- Temiz kaynak ZIP yalnız masaüstünde yerel teslim olarak üretilir; GitHub Release'e kaynak ZIP konmaz ve GitHub Release EXE-only kalır.
- Fake/demo/sahte/şablon/placeholder çıktı ve çalışmayan başarı gösterimi yasaktır. Görsel/logo isteğinde kaynak sohbet metnine dökülmez; desteklenen gerçek SVG artifact ÖNİZLE/indir yüzeyine gider, desteklenmeyen raster üretim sınırı açıkça söylenir.
- Uzun provider işlemi yalnız “Düşünüyor” demez; gerçek provider/model/deneme ve alınan artifact byte ilerlemesini kullanıcıya gösterir.

## SUPERSEDED / CANCELLED

- `Line CLI`, `line-cli`, `LineCli` marka ve dağıtım adları: SUPERSEDED.
- “CLI olsa da grafik uygulamadır” ve “SmoothUI temelli” tanıtım dili: CANCELLED.
- G4F entegrasyonu: CANCELLED.
- 4 dosya / 1 MiB ve klasör reddi: SUPERSEDED.
- Provider'ın ayrıca `diff` bloğu üretmesine bağımlı fark görünümü: SUPERSEDED.
- Eski e-spor HTML capture ve onu güncel ürün kanıtı sayma: CANCELLED; ilgili eski video/evidence hash'i `STALE_REVERIFY`.

## KANIT DURUMU

- Başlangıç HEAD: `898720e38fa63e3d0c20d12f8546d4fc6a1b6970`; çalışma ağacı temizdi.
- Marka göçü tamamlandı: kaynak, Tauri, test, doküman ve dağıtım adları `Line AI` / `line-ai` olarak güncellendi.
- Frontend doğrulaması: lint `PASS`, TypeScript `PASS`, React/Vitest `23/23 PASS`, Vite production build `PASS`.
- Rust testleri: `15/15 PASS` (Windows GNU linker bilgilendirme çıktısı dışında hata yok).
- Açık/koyu tema ilk boyamada senkron uygulanıyor; modern font yığını, görünür yeni sohbet eylemi, üst sohbet araması, tarih gruplu zaman damgaları, sabitleme ve silmeyi geri alma eklendi.
- Sidebar 240–400 piksel arasında fare/klavye ile yeniden boyutlandırılabiliyor; dar ikon şeridi ve mobil çekmece korunuyor.
- `Ctrl+K` gerçek sohbet/ayar/sağlayıcı/akıl yürütme/tema komut merkezi, `Ctrl+N` yeni sohbet ve `Ctrl+,` ayarlar kısayolları eklendi.
- Güncel gerçek uygulama görselleri: `line-ai-acik-tema.png`, `line-ai-koyu-tema.png`, `line-ai-tanitim.gif`.
- Line AI Cloud: üretim sağlık, yetkisiz istek reddi, kurulum oluşturma, konuşma yazma/okuma/silme, kurulum silme ve silinmiş kimlik reddi `PASS`; geçici duman testi verisi temizlendi.
- Bulut veritabanı tabloları/RLS, anonim ve authenticated tablo yetkilerinin kapalı olması ve daraltılmış service-role fonksiyon yetkileri `PASS`.
- Vercel proje adı ve üretim adresi: `lineaicloud` / `https://lineaicloud.vercel.app`; `/` tam genişlikte ürün sitesini, `/api/v1/*` Line AI Cloud API uçlarını sunar.
- Önceki v0.1.0 yayın/paket kanıtları marka ve dosya değişikliğinden sonra `STALE_REVERIFY`.
- Yerel DIFF motoru ve gerçek DIFF sekmesi kaynakta uygulandı (`E1 SOURCE_IMPLEMENTED`); yeni bağımlılık eklenmedi.
- TDD kırmızı kanıtı: DIFF regresyon testleri önce sekme olmadığı için; SVG preview/chat ayrımı ve tam SVG backend yeterlilik testleri de ilgili davranışlar uygulanmadan önce beklenen nedenle `FAIL` oldu. Minimal uygulama sonrası tam `pnpm verify`: lint, TypeScript, `42/42 PASS`, Vite production build `PASS` (`E3 SELF_TEST_PASSED`).
- Rust kaynak doğrulaması: `cargo fmt --check PASS`; `cargo test --manifest-path src-tauri/Cargo.toml` sonucu `22 PASS`, `0 FAIL`, gerçek Chrome ve gerçek-ağ Gemini isteyen `2 IGNORED` (`E3 SELF_TEST_PASSED`).
- Gerçek SVG logo artifact desteği, güvenli data-image ÖNİZLE, `image/svg+xml` download, HTML'den ayrı SVG bütünlük/güvenlik kapısı ve kullanıcıya gerçek provider/model/deneme/artifact KB ilerlemesi kaynakta ve testte doğrulandı. Yeni bağımlılık eklenmedi.
- Native Tauri/WebView2 CDP doğrulaması: iki gerçek Gemini turunda iki `line-ai-logo.svg`; kaynak sohbet metnine sızmadı. İlk DIFF boş durumu; ikinci sürümde `24 added / 24 removed / 64 context` ve eski/yeni numaralar; KOD/ÖNİZLE/download/diagnostics, sidebar kapat-aç ve mesaj copy/edit/retry/vote `PASS` (`E4 RUNTIME_VERIFIED_ISOLATED`, `E5 INTEGRATION_VERIFIED`, `E6 PHYSICALLY_VERIFIED_PREVIEW`).
- Temiz gerçek capture: `cloud/media/line-ai-gercek-kodlama.mp4`, 1440×900 H.264, 135.133 s, SHA-256 `447bbcfeee83a2e314e7d4b8e4dae086f891a69b3ec5d868dbbc26268ba54972`; poster ve evidence JSON aynı native koşudan üretildi. Capture-only Tauri/WebView2 CDP ve Vite süreçleri doğrulama sonrası kapatıldı.
- Landing preview aynı artifact üzerinde tam smoke `PASS` olduktan sonra production'a promote edildi. `https://lineaicloud.vercel.app` doğrulanmış `dpl_5en4T8nDFrYBJ6gQUU2GER2pvtYH` deployment'ına yönlendirildi; public landing/video/evidence hash, health, auth reddi, Cloud konuşma yaz/oku/sil ve silinen kimliği reddetme `PASS`; geçici smoke verisi temizlendi (`E7 PRODUCTION_VERIFIED`).
- Production error-log taramasında işlevsel hata görülmedi; başarılı DELETE fonksiyon çağrısında Node/Supabase zincirinden gelen bir `url.parse()` deprecation uyarısı kaldı.
- Güncel EXE, masaüstü temiz kaynak ZIP'i ve GitHub EXE-only release henüz yeniden üretilip doğrulanmadı.

## EXACT NEXT ACTION

Dirty worktree'deki mevcut Line AI değişikliklerini secret ve kapsam denetiminden geçir; kullanıcı değişikliklerini silmeden doğrulanabilir bir commit oluştur. Sonra sırasıyla güncel Windows EXE'yi temiz commit'ten derle/kopyala/hash doğrula → masaüstünde build/cache/secret içermeyen temiz yerel kaynak ZIP'i üret → GitHub `yaertu/line-ai` release'ini yalnız aynı doğrulanmış EXE ile güncelle → public download/hash ve EXE-only varlık listesini doğrula. Kaynak ZIP'i GitHub'a yükleme. P0 bitince geçici Gemini anahtarlarının kullanıcı tarafından revoke/rotate edilmesi gerektiğini bildir ve ancak sonrasında onaylı eski Line AI/Codex temizlik kapsamına geç.
