# Yerel model desteği

Yerel model çalıştırma desteği v0.6.1 ile üründen kaldırıldı.

Line AI masaüstü uygulaması yalnız `https://lineaicloud.vercel.app/api/v1` adresindeki Line AI Engine’e bağlanır. Ollama, LM Studio, loopback uyumlu uçlar ve doğrudan üçüncü taraf kullanıcı anahtarları desteklenmez. Bu karar kullanıcının bilgisayarında model indirme, RAM/VRAM tüketimi ve motor seçimi karmaşasını kaldırır.

Eski tercihler açılışta Line AI Engine’e ve açık doğruluk korumasına taşınır. Eski endpoint ve model alanları yeniden kaydedilmez.
