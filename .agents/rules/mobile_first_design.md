# Mobile-First & Smartphone-First Design (Telefon Odaklı Tasarım)

## Kural
SporTakip uygulaması (özellikle sporcu/üye deneyimi, salon yoklama ve günlük kullanım akışları) masaüstü yerine öncelikli olarak **akıllı telefon ekranları** (tek elle / başparmakla kullanım - thumb-zone) için tasarlanmalı ve optimize edilmelidir. Masaüstü görünümü yalnızca 1-2 kişinin gerek duyabileceği ikincil bir tamamlayıcıdır.

## Birincil Test ve Ölçüm Cihazı (Referans Benchmark)
- **Cihaz Modeli:** Xiaomi Redmi Note 8 Pro (6.53 inç, 19.5:9 oran)
- **Fiziksel Çözünürlük:** 1080 x 2340 piksel (DPR: ~2.75)
- **CSS Viewport Ölçüsü:** **393px × 851px** (Kullanılabilir tarayıcı alanı: ~393px × 780px - 820px)
- **Test Kriteri:** Tüm tarayıcı testleri (`browser_subagent`) ve ekran kontrolleri öncelikle bu çözünürlükte (393x851) doğrulanmalıdır.

## Talimatlar
1. **Thumb-Friendly Dokunmatik Alanlar**: Butonlar, seans kartları, filtreler ve sekmeler min 44-48px yükseklikte, büyük ve tek parmakla rahatça basılabilir olmalıdır.
2. **Yatay Kaydırmalı Hikaye (Story/Feed) Mimarisi**: Takvim matrisleri, karmaşık veri tabloları veya dar çoklu kolonlar yerine; Instagram Story tarzı yatay gün kabarcıkları (`date strip`), dikey kayan büyük Reels tarzı kartlar ve alt çekmeceler (`bottom sheet / drawer`) tercih edilmelidir.
3. **Masaüstü Kalabalığından Arındırma**: Geniş ekranlara özgü çok sütunlu, yoğun dashboard öğeleri sporcu arayüzüne taşınmamalıdır. Masaüstünde açılsa bile arayüz ortalanmış mobil uygulama genişliğinde (`max-width: 480px` veya şık bir mobil çerçeve / app-shell) akıcı ve doğal hissettirmelidir.
4. **Sıfır Sürtünmeli Giriş ve İşlemler**: Klavye açmayı en aza indiren, tek dokunuşla katılım (1-tap booking), SMS OTP çekmecesi ve WhatsApp yönlendirmesi gibi hızlı mobil mikro-etkileşimler korunmalıdır.
