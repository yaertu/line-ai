# Değişiklik Günlüğü

Bu projedeki kullanıcıya görünen değişiklikler Türkçe olarak kaydedilir. Sürümleme [SemVer](https://semver.org/lang/tr/) yaklaşımını izler.

## [0.1.0] - 2026-08-30

### Eklendi

- 🪟 Tauri 2 tabanlı portable Windows uygulaması.
- 🎨 SmoothUI Chat Template temelli açık ve koyu arayüz.
- 🤖 Windows ortam değişkenlerinden güvenli biçimde okunan OpenAI ve Gemini sağlayıcıları.
- 🔀 Otomatik sağlayıcı seçiminde kontrollü OpenAI → Gemini geçişi.
- 🧠 Hızlı, orta ve yüksek akıl yürütme seviyeleri.
- 🛡️ Varsayılan açık `/truthmode` ve sohbet içi durum denetimi.
- 📎 Native Windows dosya sürükle-bırak ve güvenli metin dosyası okuma sınırları.
- 💬 Cihazda kalıcı sohbet geçmişi; açma, arama, yeniden adlandırma ve silme.
- 🖱️ Sohbet ve mesajlar için erişilebilir bağlam menüleri.
- 📐 Daraltılabilir, responsive kenar çubuğu.
- 🧪 React, TypeScript ve Rust sözleşme/regresyon testleri.

### Güvenlik

- API anahtarları frontend, `localStorage`, sohbet geçmişi ve kaynak paketine yazılmaz.
- Dosya içeriği güvenilmeyen kullanıcı verisi kabul edilir.
- Dosya türü, dosya adedi ve dosya boyutu native Rust katmanında sınırlandırılır.

### Dağıtım notu

- İlk portable EXE Authenticode ile imzalanmamıştır. Windows bilinmeyen yayıncı uyarısı gösterebilir.
