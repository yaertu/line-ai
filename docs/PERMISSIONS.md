# Permissions

Çekirdek izin kapsamları `file_read`, `file_write`, `terminal`, `network`, `browser`, `git` ve `external_app`tır. Risk düzeyleri `low`, `medium`, `high` ve `critical` olarak modellenir.

Native terminal isteği `approved` değeri olmadan çalışmaz. Runtime terminal komutunun stdout, stderr, exit code, timeout, cancellation ve risk sınıfını döndürür; çıktıda bilinen veya biçiminden tanınan sırlar redakte edilir. Git durum sorgusu salt okunurdur. Checkpoint restore ayrıca açık `approved: true` ister.

Bu kurallar native/runtime sınırındadır. İzin isteme, karar saklama ve kullanıcıya sunulan izin paneli v0.5.0'da bağlanmış değildir.
