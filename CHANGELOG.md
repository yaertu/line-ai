# Değişiklik Günlüğü

Bu projedeki kullanıcıya görünen değişiklikler Türkçe olarak kaydedilir. Sürümleme [SemVer](https://semver.org/lang/tr/) yaklaşımını izler.

## [0.4.0] - 2026-08-31

### Eklendi

- 🌐 Chrome'u native CDP köprüsüyle başlatan, etkin sayfayı okuyan ve açık kullanıcı komutuyla gezinme, yenileme, geri dönme, tıklama ve yazma işlemlerini çalıştıran gerçek tarayıcı araçları.
- 🧩 KOD ve ÖNİZLE yanında her zaman görünür DIFF sekmesi; ilk artifact boş durumu ve sonraki kararlı sürümlerde eski/yeni satır numaralı yerel karşılaştırma.
- 🎨 Logo istekleri için sohbeti kaynak kodla doldurmayan gerçek SVG artifact, güvenli görsel önizleme ve `image/svg+xml` indirme akışı.
- 🗜️ ZIP, RAR, 7z, TAR, sıkıştırılmış TAR, CAB ve CPIO arşivlerini diske çıkarmadan; yol, adet, boyut ve içerik sınırlarıyla okuyan arşiv bağlamı.
- 🗃️ Sohbet arşivleme, Ayarlar içinden geri yükleme/kalıcı silme ve asistan yanıtlarında kalıcı beğen/beğenme geri bildirimi.
- ⚙️ On işlevsel Ayarlar bölümü: Genel, içe/dışa aktarma, yapay zekâ, görünüm, kişiselleştirme, kısayollar, tarayıcı, bulut verileri, arşiv ve hakkında.
- ✨ Dokuz arayüz kaynağından uyarlanan; tool-state, thinking, diff, dosya yükleme, geri alma, tepki ve ayar akışlarını tanıtan yeni responsive web deneyimi.

### Değiştirildi

- 📁 Dosya kabulü uzantı listesine bağlı olmaktan çıkarıldı; bilinmeyen dosyalar gerçek içeriğine göre metin veya ikili olarak güvenli biçimde sınıflandırılıyor.
- 🧠 Canlı işlem ve Chrome araç durumu; gerçek sağlayıcı, model, deneme ve aktarılan artifact miktarını açıkça gösteren yapılandırılmış akışa bağlandı.
- ☁️ Line AI web yüzü açık/koyu tema, azaltılmış hareket, klavye erişimi, gerçek bulut sağlık durumu ve geniş ekranı kullanan tam sayfa sinematik düzenle baştan tasarlandı.
- 🌍 Tanıtım sitesi ile Line AI Cloud API'si tek ve kalıcı `lineaicloud.vercel.app` adresinde birleştirildi.
- 📦 Masaüstü ve GitHub sürüm teslimatı tek `Line AI.exe` varlığına indirildi; özel kaynak arşivi kaldırıldı.

### Doğrulama

- Frontend lint, TypeScript, React testleri ve production build zinciri geçti.
- Rust testleri ve gerçek izole Chrome CDP testi geçti.
- Native Tauri/WebView2 üzerinde iki gerçek Gemini turu, SVG önizleme/indirme ve ikinci sürüm DIFF'i fiziksel olarak doğrulandı.
- Line AI Cloud üretim smoke zinciri geçti; landing, video/evidence hash'i ve Cloud CRUD akışı üretimde doğrulandı.

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
