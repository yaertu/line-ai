# Checkpoints

Native çalışma alanı runtime'ı checkpoint oluşturma, inceleme ve geri yükleme komutlarını Tauri IPC üzerinden sunar. Snapshot uygulamanın yerel veri dizininde tutulur; `.git`, `node_modules`, `target`, `dist` ve benzeri cache alanları dahil edilmez. Symlink/reparse noktaları izlenmez; dosya ve toplam boyut sınırları uygulanır.

`inspect` geri yüklemenin etkileyeceği yolları hesaplar. `restore`, yalnız `approved: true` ile çalışır; checkpoint anından sonra oluşan dosyaları kaldırabilir ve snapshot içeriğini geri yazar. Bu nedenle kullanıcı arayüzü bağlandığında önce etkilenen yollar gösterilmeli, ardından açık onay alınmalıdır.

v0.5.0'da native komutlar ve TypeScript wrapper'ları vardır; checkpoint yönetim ekranı veya kullanıcı onay akışı henüz yoktur.
