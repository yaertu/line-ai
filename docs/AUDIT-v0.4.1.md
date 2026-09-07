# Line AI v0.4.1 — silme denetimi

Tarih: 7 Eylül 2026. Bu kayıt yalnız bu sürümde incelenen kapsamın kanıtıdır; bütün üründe hata olmadığı iddiası değildir.

## Girdi ve kaynak doğruluğu

- Başlangıç commit'i: `a4d289bd7576a693293d541e36816028e3d40f8b`.
- Masaüstündeki `Line AI v0.4.0 Source.zip` ile ilgili kaynak dosyaları karşılaştırıldı. Satır sonları normalize edildiğinde package manifesti, cloud-history ve native cloud kaynağı eşleşiyordu.
- `Kaynak-Kod-Duzeltilmis.zip`, Samsung/ADB odaklı farklı bir C# projesi içeriyor; Line AI'ya karıştırılmadı.
- `PROJECT_LEDGER.md` başlangıçta kullanıcı çalışma ağacında silinmişti. Silme geri alınmadı ve bu görevin commit'ine eklenmedi. Yeni kaynak ZIP'i eski ledger'ı yeniden içermez.
- Ekrandaki Truth Mode kapalı durumu tek başına hata kanıtı değildir; kullanıcı tercihi değiştirilmedi.

## Düzeltilen gerçek sorunlar

1. Tek sohbet silme, kalan listeyi `!archived` ile filtreleyerek diğer arşivleri de cloud silme kuyruğuna sokuyordu. Artık yalnız hedef kimlik çıkarılıyor.
2. Toplu silme yalnız Ayarlar'da bulunuyordu. Geniş/dar sidebar ve mobil çekmecede görünür eylem, güvenli ilk odak, Escape ve odak dönüşlü onay eklendi.
3. Başarısız cloud clear görünür/yeniden denenebilir değildi. Sunucu onayı gelmeden buluttan silindi mesajı verilmez.
4. İlk yükleme ve devam eden kayıtlar silinen geçmişi geri getirebiliyordu. Silme nesli ve bekleyen silme kontrolü ile eski snapshot uygulanmaz.
5. Bir paralel kayıt hata verince kalan kayıt bitmeden tekrar deneme başlayabiliyordu. Tüm paralel işlemler sonuçlanmadan senkronizasyon bariyeri açılmaz.
6. Kapanış sonrası bekleyen clear kayboluyordu. `line-ai.history-clear-pending.v1=1` işareti yalnız başarıda kaldırılır; sohbet içeriği veya secret içermez.

## Testler

- TDD: görünür toplu silme, arşivin yanlış silinmesi ve bekleyen silme regresyonları önce kırıldı; implementasyon sonrası odaklı sekiz test geçti. Paralel kayıt testinin RED nedeni, ikinci kayıt bitmeden `Silmeyi yeniden dene` düğmesinin açılmasıydı.
- `pnpm verify`: lint, TypeScript, 50 test / 7 dosya, production build başarılı.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: başarılı.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 22 başarılı, 2 ignored. Gerçek Chrome ve Gemini testleri bu sürümde yeniden çalıştırılmadı; native Rust davranış kaynağı değiştirilmedi.
- `pnpm audit --prod --audit-level high`: bilinen güvenlik açığı raporlanmadı. Bu sonuç kapsamlı güvenlik denetimi değildir.
- Frontend build'de yaklaşık 518 kB minify edilmiş ana chunk için boyut uyarısı var; build hatası değil. Bu sürümde bağımlılık eklenmedi/güncellenmedi.

## Native kanıt ve yeniden üretim

`scripts/verify-native-history.mjs` yerel HTTP sözleşme test sunucusunu ve CDP doğrulamasını içerir. Ürün fallback'i değildir. Var olan native kurulum kimliği kullanılır; test sunucusu kimlik oluşturmaz, anahtarları veya HTTP başlıklarını kaydetmez.

Repo kökünde ayrı terminallerde:

```powershell
node scripts/verify-native-history.mjs --server
pnpm dev --port 1431
$env:LINE_AI_CLOUD_URL='http://127.0.0.1:19431/api/v1'
pnpm tauri dev --config scripts/tauri-history-check.conf.json
node scripts/verify-native-history.mjs
```

Sunucu ve native süreç hazır olduktan sonra son komut çalıştırılır. Her tekrarda test sunucusu yeniden başlatılır. 1431 kökeni test localStorage'ını ana uygulamadan ayırır. Silme öncesi native endpoint'in tam eşleşmesi zorunludur; başka endpoint'te test durur.

Kanıt: `outputs/history-v0.4.1/evidence.json` ve aynı klasörde light/dark/mobile ekran görüntüleri. Kontroller: onay metni/sayıları, güvenli ilk odak, Shift+Tab çevrimi, Escape/odak dönüşü, dar sidebar, 390 px mobil görünüm, native HTTP 503 hata görünürlüğü, ikinci DELETE ile arşiv dahil boşalma, yeniden yüklemede boş kalma.

## Sınırlar ve teslim

- Gerçek kullanıcı sohbetleri ve API anahtarları bu doğrulamada silinmedi. Üretim cloud toplu silme test edilmedi.
- Yeni gerçek provider turu/video kaydı yapılmadı; önceki video yeni toplu silme özelliğinin kanıtı değildir.
- Vercel aktarımı/deployment beklemede. Bu düzeltme production doğrulaması olarak raporlanmaz.
- Dağıtım Windows EXE + masaüstünde temiz kaynak ZIP'idir. GitHub Release'e kaynak ZIP yüklenmez.
- EXE Authenticode ile imzalı değildir; Windows yayımlayıcı uyarısı gösterebilir. Teslim dosyalarının SHA-256 değerleri ayrıca kaydedilir.
