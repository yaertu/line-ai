# Değişiklik Günlüğü

Bu projedeki kullanıcıya görünen değişiklikler Türkçe olarak kaydedilir. Sürümleme [SemVer](https://semver.org/lang/tr/) yaklaşımını izler.

## [0.3.0] - 2026-08-30

### Eklendi

- 🧭 Üst arama, zaman damgalı geçmiş, sabitleme, yeniden adlandırma, silme, geri alma ve klavye bağlam menüleri içeren; 240–400 piksel arasında yeniden boyutlandırılabilen Sidebar.
- ⚙️ Genel, Yapay zekâ, Görünüm, Bulut verileri ve Hakkında bölümlerinden oluşan ayrıntılı Ayarlar paneli.
- 🧠 Gerçek istek durumuna bağlı bekleme, düşünme, araç çalışması, hata ve tamamlanma bileşenleri.
- 🧩 Kod farkı, kaynak bağlantısı, görev listesi ve araç sonucu biçimlendirmeleri.
- ⌨️ Yalnız sohbet alanına `+` yazıldığında açılan sağlayıcı, akıl yürütme, Truth Mode ve dosya komut paneli.
- 📁 Alt klasörleri güvenle dolaşan klasör sürükle-bırak ve tam çalışma alanı bırakma katmanı.
- 🔎 `Ctrl+K` ile sohbet, sağlayıcı, akıl yürütme, tema ve ayarlara erişen gerçek komut merkezi; `Ctrl+N` ve `Ctrl+,` masaüstü kısayolları.
- ☁️ Kullanıcı hesabı gerektirmeden her kurulumu ayrı kimlik ve gizli anahtarla yalıtan Line AI Cloud konuşma geçmişi.
- 🌐 Açık/koyu/sistem temalı, hareket azaltma tercihine saygı gösteren ve responsive çalışan Line AI tanıtım sitesi.
- 🔄 Eski cihaz geçmişini ilk başarılı bağlantıda buluta taşıyan; kayıt, güncelleme, silme, tümünü temizleme ve yeniden deneme akışları.

### Değiştirildi

- ✨ Ürün ve dağıtım adı **Line AI** olarak yenilendi.
- 📎 Dosya sınırı işlem başına 30 dosya ve dosya başına 512 MiB oldu; model bağlamı için bellek kullanımı ayrıca sınırlandı.
- 🔤 Uygulama geneli ve chatbox için Türkçe karakterleri okunaklı gösteren gömülü Geist Sans; kod ve diff alanları için Geist Mono yazı düzenine geçildi.
- 🌗 Açık/koyu tema, hareket azaltma tercihi ve responsive panel davranışı güçlendirildi.
- 📄 Dosya kabulü sabit uzantı beyaz listesinden içerik tabanlı metin/ikili algılamaya geçirildi; metin içeren bilinmeyen uzantılar da güvenli önizlemeye alınır.

### Güvenlik

- API anahtarları yalnız native süreçte okunur; arayüze, depolamaya veya hata çıktısına aktarılmaz.
- Sembolik bağlantılar klasör taramasında izlenmez; desteklenmeyen dosyalar güvenli biçimde atlanır.
- Sağlayıcı hata metinleri kullanıcıya gösterilmeden önce gizli değerlerden arındırılır.
- Line AI Cloud gizli anahtarının yalnız özeti sunucuda tutulur; özgün değer Windows Credential Manager içinde saklanır.
- Bulut API'sine istek ve depolama kotaları, gövde boyutu sınırı, zaman sabitli kimlik doğrulama, RLS ve daraltılmış veritabanı yetkileri eklendi.

## [0.1.0] - 2026-08-30

- İlk Windows prototipi.
