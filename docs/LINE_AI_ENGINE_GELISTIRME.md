# Line AI API’yi Sürekli Geliştirme Rehberi

Bu belge Line AI Engine’i güvenli ve ölçülebilir biçimde geliştirmek için günlük çalışma sırasını anlatır. İçinde yönetici e-postası, parola, proje anahtarı veya runtime anahtarı yoktur.

## 1. Üç ayrı şeyi karıştırma

Line AI üç katmandan oluşur:

1. **Masaüstü ürün:** Sohbet, dosya, kod alanı, DIFF, Image Studio ve Chrome araçları.
2. **Line AI Engine API:** Kimlik, proje anahtarı, kota, maliyet, istek tekrarı, davranış politikası ve denetim kaydı.
3. **Özel runtime:** Metin ve görsel çıkarımını sunucuda yapan değiştirilebilir çalışma motoru.

API’yi geliştirmek için her seferinde temel model eğitmek gerekmez. Yeni davranış, güvenlik veya cevap kalitesi önce politika ve değerlendirme katmanında geliştirilir. Kendi model ağırlıklarımız hazır olduğunda yalnız özel runtime değiştirilir; masaüstü ve API anahtarları aynı kalır.

## 2. Her gün kullanılacak geliştirme döngüsü

1. Gerçek bir sorun seç: örneğin eksik kod, gereksiz uzun cevap, yanlış belirsizlik veya zayıf dosya analizi.
2. Sorunu tekrar üreten küçük bir değerlendirme vakası yaz. Beklenen sonuç elle ve açık ölçütle tanımlansın.
3. Mevcut yayın sürümünü bu vakada ölç; sonucu kaydet.
4. Yönetim panelinde yeni davranış politikası taslağı oluştur. Canlı politikayı doğrudan değiştirme.
5. Adayı sabit test paketiyle değerlendir. Tüm zorunlu vakalar geçmeden yayınlama.
6. Aday temel sürümden daha iyi değilse nedeni incele, taslağı düzelt ve yeniden ölç.
7. Yalnız geçen sürümü yayınla. Hata görülürse panelden daha önce geçmiş sürüme dön.

Yönetim paneli: `https://lineaicloud.vercel.app/admin`

## 3. Geri bildirim nasıl kullanılır?

- Beğeni/beğenmeme tek başına eğitim verisi değildir.
- Kullanıcı “geliştirmeye izin ver” seçeneğini açmadıysa not kalite taslağına girmez.
- İzinli notlardan e-posta ve anahtar biçimleri temizlenir.
- Geri bildirim canlı politikayı otomatik değiştirmez; yalnız taslak önerir.
- Otomatik bakım yalnız tüm testleri geçen ve mevcut yayından daha iyi puan alan adayı yayınlayabilir.

## 4. API kodu değiştirirken

Kaynak klasörü:

`cloud/api`

Önemli dosyalar:

- `_lib/engine-core.ts`: giriş doğrulama ve sistem davranışı.
- `_lib/engine-store.ts`: proje, anahtar, rezervasyon, kota ve maliyet muhasebesi.
- `_lib/engine-runtime.ts`: özel runtime sözleşmesi.
- `_lib/engine-learning.ts`: sabit kalite vakaları, aday değerlendirme ve iyileştirme taslağı.
- `v1/engine.ts`: dış `/api/v1` uçları.
- `admin.ts`: yönetim işlemleri ve rol kontrolü.

Her değişiklikten önce hatayı yakalayan test yaz. Sonra en küçük düzeltmeyi yap ve şu kontrolleri çalıştır:

```powershell
pnpm -C cloud check
pnpm -C cloud test
pnpm -C cloud test:engine:database
```

Üretim dağıtımından sonra:

```powershell
pnpm -C cloud smoke:production
```

## 5. Masaüstü uygulamasını geliştirirken

```powershell
pnpm lint
pnpm typecheck
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri:build
```

Kullanıcıya görünen değişiklikten sonra açık/koyu ekran görüntülerini ve özellik videolarını yenile. Site videosu, uygulamanın gerçekten yapmadığı bir şeyi “hazır” diye göstermemeli.

## 6. Kota ve maliyet kuralı

- İstek başlamadan önce en kötü durum rezervasyonu yapılır.
- Aynı `Idempotency-Key` aynı gövdeyle tekrar gelirse runtime ikinci kez çalıştırılmaz.
- Aynı anahtar başka gövdeyle gelirse istek reddedilir.
- Kesin reddedilen işte rezervasyon iade edilir.
- Ağ sonucu belirsizse çift harcamayı önlemek için rezervasyon korunur ve yönetim kaydında incelenir.
- Proje başına günlük/aylık token, görsel, maliyet, RPM ve eşzamanlılık sınırı ayrı tutulur.

## 7. Kendi temel modelimize geçiş yolu

Gerçek anlamda kendi model ağırlıklarımız için ayrı bir GPU projesi gerekir:

1. Lisansı açık ve temiz veri kümesi politikası oluştur.
2. Türkçe, kodlama, dosya anlama ve güvenlik için ayrı eğitim/değerlendirme kümeleri hazırla.
3. Küçük bir açık ağırlıklı temel üzerinde fine-tuning ile başla; sıfırdan pretraining maliyetini ölçmeden büyük eğitim başlatma.
4. Her model sürümünü değişmez test paketi, güvenlik testleri, gecikme ve maliyetle karşılaştır.
5. Model sunucusunu özel Line AI runtime sözleşmesine uyarla.
6. Önce sınırlı projede canary çalıştır; sonuç iyi ise runtime URL’sini yeni worker’a geçir.

Bir modelin “kendi kendine gelişmesi”, kontrolsüz biçimde kullanıcı konuşmalarını eğitime alması anlamına gelmez. Gelişim; izin, sürüm, ölçüm, insan kontrollü yayın ve geri alma ile yapılır.

## 8. Sırlar nerede tutulur?

- Masaüstü Engine anahtarı: Windows Credential Manager.
- Yönetici erişimi: `%USERPROFILE%\.lineai\engine-operator.json` ve kimlik servisi.
- Runtime/servis anahtarları: yalnız Vercel Production ortam değişkenleri.
- GitHub ve kaynak ZIP: hiçbir gerçek parola veya anahtar içermez.

Anahtarları README, ekran görüntüsü, video, issue, commit mesajı veya terminal çıktısına yapıştırma. Bir anahtar yanlışlıkla görünürse yalnız dosyadan silmek yetmez; sunucuda iptal et ve yenisini üret.
