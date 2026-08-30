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
- Her kullanıcıya görünen değişiklikte ekran görüntüleri, özellik listesi, changelog, EXE, kaynak ZIP ve GitHub Release birlikte yenilenir.

## SUPERSEDED / CANCELLED

- `Line CLI`, `line-cli`, `LineCli` marka ve dağıtım adları: SUPERSEDED.
- “CLI olsa da grafik uygulamadır” ve “SmoothUI temelli” tanıtım dili: CANCELLED.
- G4F entegrasyonu: CANCELLED.
- 4 dosya / 1 MiB ve klasör reddi: SUPERSEDED.

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
- Üretim tanıtım/API adresi: `https://lineai-eta.vercel.app`; istenen kısa `lineai.vercel.app` adı başka bir Vercel projesinde kayıtlı olduğundan doğrulanmış sabit alias kullanılıyor.
- Önceki v0.1.0 yayın/paket kanıtları marka ve dosya değişikliğinden sonra `STALE_REVERIFY`.

## EXACT NEXT ACTION

Dokümanları güncel doğrulamayla commit et; temiz commit üzerinden Windows EXE/kaynak ZIP üret; GitHub `yaertu/line-ai` ana dalını, v0.2.0 yayınını ve indirme varlıklarını doğrula.
