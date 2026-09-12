# Değişiklik Günlüğü

Bu projedeki kullanıcıya görünen değişiklikler Türkçe olarak kaydedilir. Sürümleme [SemVer](https://semver.org/lang/tr/) yaklaşımını izler.

## [0.6.1] - 2026-09-12

### Değiştirildi

- Masaüstündeki doğrudan üçüncü taraf ve yerel model yolları kaldırıldı; sohbet ve kodlama yalnız Line AI Engine üzerinden çalışır.
- Sağlayıcı seçicileri, eski bağlantı durumları ve model adları sohbet, ayarlar, komut merkezi ve yanıt alt bilgisinden kaldırıldı.
- Line AI API dış modeli `line-ai-neural-v1`, görsel modeli `line-ai-vision-v1` olarak sabitlendi; çıkarım özel ve değiştirilebilir sunucu runtime'ına ayrıldı.
- Site ve yönetim paneli programın graphite/mint renklerine geçirildi; içerikler özel API, gerçek kota/maliyet ve sürekli değerlendirme döngüsünü anlatacak biçimde yenilendi.
- Uygulama, site ve Windows için yeni konuşma balonu/spark ikonu üretildi.

### Güvenlik

- Yönetici erişim dosyası, runtime anahtarları ve servis sırları GitHub ile kaynak ZIP'in dışında tutulur.
- Runtime hata gövdeleri istemciye veya loglara aktarılmaz; kesin reddedilen işlerde kota iade edilir, belirsiz ağ sonucunda rezervasyon korunur.

### Doğrulama

- React: 12 dosyada 84 test.
- Cloud API: 4 dosyada 18 test.
- Rust/Tauri: 23 test başarılı, gerçek Chrome isteyen 1 test isteğe bağlıdır.

## [0.5.0] - 2026-09-11

### Eklendi

- Gerçek Trace oturumları, Evidence kayıtları ve kanıta dayalı `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`, `BLOCKED` sonuç hesabı.
- SHA-256 bütünlük kontrollü Proof Bundle, Interrupted oturum kurtarma, v1 `.line` workflow doğrulaması ve evidence bağlı Project Memory çekirdeği.
- Windows native terminal motoru: PowerShell komutu, stdout/stderr, exit code, timeout, iptal, risk sınıfı ve secret redaksiyonu.
- Salt-okunur Git durum özeti ve cache klasörlerini dışarıda bırakan, onaylı restore destekli workspace checkpoint motoru.
- Ollama, LM Studio ve loopback OpenAI-compatible yerel sağlayıcı desteği; yerel hata cloud sağlayıcıya sessizce yükseltilmez.
- BUILD, FIX, RESEARCH, AUDIT ve AUTOMATE görev tanımları ile gerçek Trace olaylarına bağlı görev planı reducer'ı.

### Doğrulama

- Frontend: 11 test dosyası, 80/80 test; lint, TypeScript ve Vite production build başarılı.
- Rust: 29 test, 27 başarılı, gerçek Chrome ve gerçek Gemini ağ/anahtar isteyen 2 test `ignored`.
- Üretim build ana JavaScript çıktısı 523.34 kB; v0.4.1 baseline 518.23 kB.

### Sınırlar

- Mission Control panelleri ve replay ekranı bu teslimde çekirdek API ve test kapsamı olarak hazırlandı; tüm paneller sohbet ana akışına henüz bağlanmış değildir.
- Cloud production deployment ve GitHub final release doğrulaması bu commit'in ardından yapılacaktır.

## [0.5.0-rc.3] - 2026-09-11

### Eklendi

- Ayarlar → Hakkında ekranına **Yenilikler · v0.5.0** kartı eklendi. İşlem izi/kanıt, dayanıklı oturumlar ve yerel çalışma alanı altyapısı anlaşılır biçimde listelenir; kullanıcı arayüzüne henüz bağlanmayan Mission Control, replay, Jury ve local model yüzeyleri açıkça belirtilir.

### Düzeltildi

- Hakkında ekranındaki eski `Line AI 0.4.1` metni güncel `Line AI v0.5.0-rc.3` sürümüyle değiştirildi.

## [0.5.0-rc.2] - 2026-09-11

### Düzeltildi

- Varsayılan Line AI Cloud kökü, güncel üretim adresi olan `https://lineai-eta.vercel.app/api/v1` olarak düzeltildi; masaüstü uygulaması, README ve production smoke testi aynı kanonik adrese yönelir.
- Tanıtım sitesinin aday EXE indirme bağlantısı, GitHub'ın yayımladığı gerçek asset yolu olan `Line.AI.exe` ile eşitlendi.

## [0.5.0-rc.1] - 2026-09-11

### Eklendi

- TypeScript Trace/Evidence/Verification çekirdeği: sıralı Trace olayları, secret sanitization ve zorunlu kriter kanıtlarından hesaplanan `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`, `BLOCKED` sonuçları.
- Tarayıcı yerel saklaması, beklenmedik kapanan oturumların recovery işareti, SHA-256 bütünlük kontrollü proof bundle, v1 workflow parser/adım durumları ve kanıt bağlı proje hafızası.
- Rust native çalışma alanı runtime'ı ve TypeScript IPC sarmalayıcıları: terminal stdout/stderr/çıkış kodu/süre aşımı/iptal, secret redaksiyonu, salt-okunur Git durum özeti, checkpoint oluşturma/inceleme ve açık onaylı geri yükleme.

### Sınırlar

- Bu sürümde yeni çekirdekler kullanıcı arayüzüne bağlanmış değildir. Mission Control, replay, local provider/model ve Jury arayüzleri uygulanmadı; bu nedenle kullanıma hazır ürün yüzeyi olarak sunulmaz.
- Bu kayıt, aday paketin kaynak ve test kapsamını anlatır. Yayın kanıtı yalnız aynı commit'ten üretilmiş EXE, kaynak ZIP'i ve production site doğrulandıktan sonra eklenir.

### Dokümantasyon

- Trace, checkpoint, doğrulama, workflow, izinler, replay, local models ve v0.5.0 release sınırları için `docs/` altında kaynak odaklı belgeler eklendi.

## [0.4.1] - 2026-09-07

### Eklendi

- Geniş, daraltılmış ve mobil sidebar'da görünür **Tüm sohbetleri sil** eylemi. Onay; sohbet/mesaj sayısını, arşiv kapsamını ve geri alınamazlık uyarısını gösterir. API anahtarları ve tercihler korunur.
- Bulut silme isteği için bekleme, hata, yeniden deneme ve sunucu onaylı başarı bildirimi. Tamamlanmamış silme isteği içerik taşımayan yerel işaretle yeniden açılışta sürdürülür.

### Düzeltildi

- Tek bir sohbet silinirken diğer arşivli sohbetlerin de silinmesi önlendi.
- İlk bulut yüklemesinin veya devam eden kayıtların toplu silinmiş geçmişi yeniden getirmesi önlendi.
- Paralel bulut işlemlerinden biri hata verdiğinde diğer işlemler sonuçlanmadan silme tekrarının başlaması önlendi.

### Kanıt kapsamı

- Sekiz silme regresyon testi dahil 50 frontend testi, lint, TypeScript ve production build geçti. Rust: 22 başarılı, iki dış ortama bağlı test atlandı.
- Native Tauri/WebView2 doğrulaması izole yerel HTTP test verileriyle yapılır; gerçek kullanıcı geçmişi silinmez. Üretim bulutunda toplu silme veya yeni provider/video doğrulaması anlamına gelmez.
- Vercel deployment beklemede. Ayrıntılar: `docs/AUDIT-v0.4.1.md`.

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
- 🧠 Canlı işlem ve Chrome araç durumu; gerçek sağlayıcı, model, deneme, aktarılan artifact miktarı ve tamamlanan son gerçek işlem adımlarını açıkça gösteren yapılandırılmış akışa bağlandı.
- 🗑️ Sohbet silme onayı; tam başlığı ayrı yüksek-kontrast yüzeyde, gerçek mesaj sayısını ve light/dark temada görünür silme eylemini gösterecek şekilde yenilendi. Güvenli başlangıç odağı, Esc ile kapatma ve odağı geri verme eklendi.
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
