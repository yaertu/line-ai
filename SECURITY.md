# Güvenlik Politikası

## Desteklenen sürüm

Güvenlik düzeltmeleri ana daldaki en güncel Line CLI sürümüne uygulanır. Eski ikili dosyalar için güvenlik güncellemesi garantisi verilmez.

## Güvenlik açığı bildirimi

Güvenlik açığını herkese açık bir issue içinde ayrıntılandırmayın. Depoda özel güvenlik bildirimi açıksa GitHub `Security` bölümündeki private vulnerability reporting özelliğini kullanın. Bu özellik kullanılamıyorsa yalnız yeniden üretim adımlarını ve etkilenen sürümü içeren, gizli anahtar barındırmayan kısa bir issue açarak özel iletişim kanalı talep edin.

Bildirimde şunlar bulunmalıdır:

- etkilenen sürüm veya commit,
- beklenen ve gözlenen davranış,
- yeniden üretim için en küçük güvenli örnek,
- olası etki,
- varsa önerilen düzeltme.

Gerçek API anahtarlarını, erişim belirteçlerini, kullanıcı verilerini veya özel dosyaları hiçbir rapora eklemeyin.

## Güvenlik sınırları

- Sağlayıcı anahtarları yalnız Rust/Tauri sürecinde Windows ortam değişkenlerinden okunur.
- Anahtarlar frontend'e, sohbet kaydına veya `localStorage` alanına gönderilmez.
- Dosya bırakma yalnız allowlist içindeki küçük UTF-8 metin/kod dosyalarını kabul eder.
- Ek dosya içeriği güvenilmeyen veri sayılır; sistem talimatı değildir.
- Line CLI, sağlayıcı cevaplarının doğruluğunu veya haricî servislerin sürekliliğini garanti etmez.

