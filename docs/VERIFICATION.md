# Verification

`calculateResult`, yalnız zorunlu kriterlere bağlı kanıtlardan sonuç üretir. Başarılı provider yanıtı tek başına doğrulanmış sonuç sayılmaz.

| Sonuç | Kural |
| --- | --- |
| `VERIFIED` | Tüm zorunlu kriterler için geçen kanıt vardır. |
| `PARTIALLY_VERIFIED` | En az bir zorunlu kriter geçmiştir; tamamı geçmemiştir. |
| `UNVERIFIED` | Zorunlu kriterler için geçen kanıt yoktur. |
| `FAILED` | Oturum başarısızdır veya bir zorunlu kriterde başarısız kanıt vardır. |
| `BLOCKED` | Oturum blocked durumundadır ve failed koşulu oluşmamıştır. |

Sonuç, geçen kriter sayısını, toplamı, failed ve missing kriter kimliklerini de döndürür. Çalıştırılmayan doğrulama alanı kanıt üretilene kadar eksik kalır.

Bu hesaplama v0.5.0 çekirdeğidir; sonuç kartı veya replay kullanıcı arayüzü henüz uygulanmadı.
