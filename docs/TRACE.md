# Trace

v0.5.0, gerçek çalışma olaylarını `TraceSession` içinde sıralı olarak tutan TypeScript çekirdeğini içerir. Bir oturum görev türü, prompt, başlangıç/bitiş zamanı, plan, olaylar ve kanıt kayıtlarını taşır.

Her `TraceEvent` oturum kimliği, monoton `sequence`, zaman damgası, tür ve durumla yazılır. Terminal durumuna gelmiş oturumlara yeni olay eklenemez; geçersiz durum geçişleri hata verir. Olay türleri plan, okuma/yazma, terminal, Git, provider, artifact, checkpoint, approval, test ve doğrulama gibi gerçek çalışma alanı kategorilerini kapsar.

Kanıt özetleri ve ayrıntıları kaydedilmeden önce secret sanitization'dan geçer. Authorization, cookie, token, password ve API-key benzeri alanlar ile tanınan anahtar biçimleri redakte edilir. Trace gizli akıl yürütme metnini depolamak için tasarlanmamıştır.

Bu çekirdek kaynakta ve testlerde vardır. v0.5.0'da Trace'i gösteren veya provider/browser olaylarına bağlayan Mission Control kullanıcı arayüzü yoktur.
