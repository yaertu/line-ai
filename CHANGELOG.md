# Değişiklik Günlüğü

Bu projedeki kullanıcıya görünen değişiklikler Türkçe olarak kaydedilir. Sürümleme [SemVer](https://semver.org/lang/tr/) yaklaşımını izler.

## [0.2.0] - 2026-08-30

### Eklendi

- 🧭 Üst arama, zaman damgalı geçmiş, sabitleme, yeniden adlandırma, silme, geri alma ve klavye bağlam menüleri içeren; 240–400 piksel arasında yeniden boyutlandırılabilen Sidebar.
- ⚙️ Genel, Yapay zekâ, Görünüm, Yerel veriler ve Hakkında bölümlerinden oluşan ayrıntılı Ayarlar paneli.
- 🧠 Gerçek istek durumuna bağlı bekleme, düşünme, araç çalışması, hata ve tamamlanma bileşenleri.
- 🧩 Kod farkı, kaynak bağlantısı, görev listesi ve araç sonucu biçimlendirmeleri.
- ⌨️ Yalnız sohbet alanına `+` yazıldığında açılan sağlayıcı, akıl yürütme, Truth Mode ve dosya komut paneli.
- 📁 Alt klasörleri güvenle dolaşan klasör sürükle-bırak ve tam çalışma alanı bırakma katmanı.
- 🔎 `Ctrl+K` ile sohbet, sağlayıcı, akıl yürütme, tema ve ayarlara erişen gerçek komut merkezi; `Ctrl+N` ve `Ctrl+,` masaüstü kısayolları.

### Değiştirildi

- ✨ Ürün ve dağıtım adı **Line AI** olarak yenilendi.
- 📎 Dosya sınırı işlem başına 30 dosya ve dosya başına 512 MiB oldu; model bağlamı için bellek kullanımı ayrıca sınırlandı.
- 🔤 Türkçe karakterleri okunaklı gösteren Segoe UI Variable Text, Segoe UI ve Inter tabanlı modern sistem yazı düzenine geçildi.
- 🌗 Açık/koyu tema, hareket azaltma tercihi ve responsive panel davranışı güçlendirildi.

### Güvenlik

- API anahtarları yalnız native süreçte okunur; arayüze, depolamaya veya hata çıktısına aktarılmaz.
- Sembolik bağlantılar klasör taramasında izlenmez; desteklenmeyen dosyalar güvenli biçimde atlanır.
- Sağlayıcı hata metinleri kullanıcıya gösterilmeden önce gizli değerlerden arındırılır.

## [0.1.0] - 2026-08-30

- İlk Windows prototipi.
