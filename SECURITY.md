# Güvenlik Politikası

## Desteklenen sürüm

Güvenlik düzeltmeleri ana daldaki en güncel Line AI sürümüne uygulanır. Eski ikili dosyalar için güvenlik güncellemesi garantisi verilmez.

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
- Dosya bırakma uzantıya güvenmek yerine içerik tabanlı metin/ikili algılama uygular; okunan önizleme ve toplam bağlam ayrıca sınırlandırılır.
- Klasör taramasında sembolik bağlantılar izlenmez; ikili içerik metin gibi işlenmez.
- Ek dosya içeriği güvenilmeyen veri sayılır; sistem talimatı değildir.
- Line AI Cloud her kurulumu ayrı kimlik ve gizli anahtarla doğrular. Özgün gizli anahtar Windows Credential Manager içinde, sunucu tarafında yalnız SHA-256 özeti tutulur.
- Bulut trafiği HTTPS kullanır; API gövde, konuşma, turn ve depolama kotaları uygular. Konuşma içeriği servis tarafından işlenebildiği için sistem uçtan uca şifreleme iddiasında bulunmaz.
- Bulut verileri uygulamanın Ayarlar > Bulut verileri bölümünden silinebilir; kurulum kaydını silmek mevcut cihazın bulut kimliğini de geçersiz kılar.
- Line AI, sağlayıcı cevaplarının doğruluğunu veya haricî servislerin sürekliliğini garanti etmez.
