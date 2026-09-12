# Line AI Engine v0.7.0

Base URL: `https://lineaicloud.vercel.app/api/v1`

Line AI Engine; istemci kimliği, proje anahtarı, kapsam, kota, maliyet, tekrar koruması, kalite politikası, geri bildirim ve denetim kaydını yöneten Line AI’a ait API katmanıdır. Kullanıcının bilgisayarında model veya GPU çalıştırmaz.

## API sözleşmesi

`Authorization: Bearer <Engine key>` kullanılır. Sohbet geçmişi kurulum anahtarı Engine uçlarını yetkilendiremez. Üretim çağrıları 12–96 karakterlik benzersiz `Idempotency-Key` ister; aynı anahtar yalnız aynı isteğin sonucunu kurtarmak için yeniden kullanılabilir.

| Yöntem | Yol | Amaç |
| --- | --- | --- |
| `GET` | `/capabilities` | Proje limitleri, kullanım, Line AI model kimliği ve kullanılabilirlik |
| `POST` | `/generate` | `prompt`, `transcript`, `customInstructions`, `responseStyle`, `reasoning`, `truthMode` |
| `POST` | `/images/generations` | `prompt`, `aspectRatio`, `quality`, `style` |
| `GET/DELETE` | `/images/:id` | Görsel işinin durumu veya silinmesi |
| `GET` | `/assets/:id` | 600 saniye geçerli proje yetkili imzalı bağlantı |
| `GET` | `/requests/:id` | Prompt veya yanıt metni olmadan istek durumu |
| `POST` | `/feedback` | `requestId`, `rating`, `note`, `trainingOptIn` |

İstemciye yalnız `line-ai-neural-v1` ve `line-ai-vision-v1` kimlikleri döner. Sunucudaki çıkarım runtime’ı ayrı, özel ve değiştirilebilir bir bağlantıdır. Runtime değiştiğinde masaüstü API sözleşmesi, proje anahtarları ve kota kayıtları değişmez.

Prompt metni istek tablosunda tutulmaz. Tamamlanan yanıtlar 24 saat tekrar kurtarma amacıyla saklanır; günlük bakım nedeniyle fiziksel saklama 48 saate yaklaşabilir. İzin verilmiş geri bildirim notları en fazla 90 gün tutulur. Görseller silinene kadar özel alandadır; daha önce verilmiş imzalı bağlantı kısa ömrü boyunca çalışabilir.

Token sayıları runtime kullanım bilgisinden gelir. Kullanım bilgisi yoksa konservatif rezervasyon korunur. Maliyetler mikro-USD cinsinden yapılandırılmış tahminlerdir; fatura değildir.

## Sunucu kurulumu

1. `pnpm install` ile bağımlılıkları kurun.
2. Supabase ve veritabanı sırlarını yalnız izlenmeyen `.env.local` içinde veya Vercel ortamında tanımlayın.
3. `pnpm migrate`, `pnpm verify:database` ve `pnpm test:engine:database` komutlarını çalıştırın.
4. `node --env-file=.env.local --env-file=.env.engine scripts/bootstrap-engine.mjs` ile ilk operator ve sınırlı projeleri oluşturun.
5. Operator erişim dosyası repo dışında `%USERPROFILE%\.lineai\engine-operator.json` yolunda tutulur. Bu dosya GitHub’a, ZIP’e veya siteye eklenmez.
6. Üretime bağlı Vercel projesini dağıtın. Yönetim yazma işlemleri yalnız `LINE_AI_ADMIN_ORIGIN` kaynağından kabul edilir; oturum çerezleri Secure, HttpOnly ve SameSite=Strict’tir.

Sunucu değişkenleri:

- `LINE_AI_ENGINE_ENABLED`
- `LINE_AI_IMAGES_ENABLED`
- `LINE_AI_ENGINE_PEPPER`
- `LINE_AI_TEXT_RUNTIME_URL`
- `LINE_AI_TEXT_RUNTIME_KEY`
- `LINE_AI_IMAGE_RUNTIME_URL`
- `LINE_AI_IMAGE_RUNTIME_KEY`
- `LINE_AI_ADMIN_ORIGIN`
- `CRON_SECRET`
- mevcut Supabase/PostgreSQL değişkenleri

Runtime URL ve anahtarları sunucuya özeldir. `NEXT_PUBLIC_` önekiyle tanımlanmaz ve tarayıcı paketine alınmaz.

## Sürekli geliştirme

Davranış politikası doğrudan canlıya yazılmaz. Yönetici yeni bir taslak oluşturur veya yalnız açık izinli geri bildirimlerden öneri üretir. Aday sürüm sabit regresyon vakalarında mevcut yayınla karşılaştırılır. Tüm vakaları geçmeyen sürüm yayınlanamaz; otomatik bakım yalnız kesin olarak daha iyi sonucu yayınlar.

Bu mekanizma prompt/politika geliştirmesidir. Model ağırlıklarını kendi kendine eğitmez, uygulama kodunu değiştirmez ve testleri yeniden yazmaz. Yeni temel model veya kendi GPU worker’ı hazırlandığında özel runtime bağlantısı değiştirilir ve aynı değerlendirme paketiyle doğrulanır.

## Doğrulama

```powershell
pnpm check
pnpm test
pnpm test:engine:database
pnpm smoke:production
```

Canlı smoke testi; yönetici/CSRF, anahtar yaşam döngüsü, gerçek metin üretimi, token muhasebesi, tekrar koruması, proje yalıtımı, geri bildirim izni ve özel varlık silmeyi sınar. Runtime kapasitesi yoksa sahte başarı üretmez.
