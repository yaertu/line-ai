# Workflows

Workflow parser v1 JSON belgesini kabul eder. Belge 512 KiB ile, adım sayısı 50 ile sınırlıdır. Geçerli bir workflow; küçük harf/kebab-case ad, izin kapsamları, inputs, kanıt beklentileri, başarı kriterleri ve en az bir adım içerir.

Desteklenen adım türleri `prompt`, `terminal`, `git`, `browser` ve `checkpoint`tir. Adım durum hesabı tamamlanan adımları `completed`, sıradaki adımı `active` ya da onay gerektiriyorsa `approval_required`, diğerlerini `pending` yapar.

Parser yalnız şema ve durum hesabıdır. v0.5.0'da workflow çalıştırma arayüzü, otomatik yürütme ekranı veya replay yüzeyi yoktur.
