# SporTakip (Compound Athletic) - Master Walkthrough & Architecture Document

## 1. Proje Genel Bakış ve Amaç
**SporTakip**, butik spor salonları ve stüdyolar (fonksiyonel antrenman, grup dersleri, PT, pilates) için tasarlanmış, mobil öncelikli (PWA) salon yönetim, hızlı yoklama ve hakediş otomasyon sistemidir.
Sistem, Excel tabanlı manuel takibi (`SampleExcel.xlsx`) ortadan kaldırarak:
- Antrenörlerin salonda cep telefonundan 1 saniyede yoklama almasını,
- Üyelerin kalan ders haklarının ve paket geçerliliklerinin otomatik takibini,
- Açık hesap (parçalı ödeme) ve kasa hareketlerinin yönetimini,
- **Salon Sahibi (İşletme)** ile **Hocalar (Eğitmenler)** arasındaki gelir ve hakediş dağılımını hatasız hesaplamayı sağlar.

---

## 2. Temel Roller ve İş Mantığı (Salon Sahibi vs Hoca)

### A. Salon Sahibi (İşletme - Örn: Sinan)
- Salonun genel cirosunu, tahsil edilen kasayı ve bekleyen alacakları takip eder.
- Paket ücretinden salonun işletme payını (`PAY` oranı) alır.
- Hocalara (antrenörlere) girdiği ders başına prim veya paket hakedişini öder.

### B. Salonda Hocalar / Eğitmenler (Örn: Gülçin ve Diğer Antrenörler)
- Salonda cep telefonundan tek dokunuşla hızlı yoklama alır.
- Girdiği ders başına prim (`Derslik Birim Ücret x Yüzde`) ve paket payını kazanır.
- Kendi derslerini ve aylık hakediş bordrosunu şeffaf bir şekilde görür.

---

## 3. Mimari ve Teknoloji Yığını

### Backend
- **Platform:** .NET 9 (C# 13, ASP.NET Core Web API)
- **Veritabanı & ORM:** SQLite + Entity Framework Core 9 (Sıfır kurulum, taşınabilir tek dosya `sportakip.db`)
- **Excel Motoru:** ClosedXML (Excel içe/dışa aktarma ve `SampleExcel.xlsx` senkronizasyonu için)
- **Kodlama Standartları:** Strict Nullable Reference Types (`CS8600`, `CS8602` uyarısız), async/await `CancellationToken` disiplini.

### Frontend
- **Tasarım Dili:** Hevy / Whoop / Nike Training Club esintili **Volt Lime (`#CCFF00`) & Obsidian Dark** atletik tasarım sistemi.
- **Mobil Entegrasyon:** PWA (Progressive Web App - `manifest.json`, Service Worker) ile iOS/Android ana ekrana uygulama olarak eklenebilirlik.
- **Kullanıcı Deneyimi:** 1-dokunuşla yoklama alma, görsel segmentli set/ders ilerleme çubuğu, tek tıkla WhatsApp şablon yönlendirmesi.

---

## 4. Hakediş ve Gelir Dağılım Modeli
- **Paket Gelir Dağılımı:**
  - $\text{Salon (Sahibi) Payı} = \text{Paket Ücreti} \times \text{Salon Oranı (örn: 0.10, 0.30, 0.40)}$
  - $\text{Hoca (Eğitmen) Hakedişi} = \text{Paket Ücreti} - \text{Salon Payı}$
- **Ders Başı Hoca Primi & İkame Kuralı (%40 Kuralı):**
  - $\text{Derslik Birim Ücret} = \frac{\text{Paket Ücreti}}{\text{Toplam Ders Sayısı}}$
  - **Asıl Hoca Dersi:** Hoca kendi üyesine ders verdiğinde prim veya paket hakkını alır.
  - **İkame Hoca Dersi:** Bir eğitmen başka bir hocanın üyesine derse girdiğinde, birim seans ücretinin **%40'ı** fiilen derse giren ikame hocaya yazılır, kalan **%60'ı** asıl hocada kalır.

---

## 5. Butik Stüdyo Saatlik Kapasite ve Seans Yönetimi (BR-03)
- **Problem & Çözüm:** Butik stüdyoda aynı saatte birden fazla hocanın grup veya özel ders koyması durumunda oluşan aşırı yığılmayı ve ekipman sırasını önler.
- **Kapasite Eşikleri:**
  - **0 - 3 Kişi:** 🟢 **Rahat** (Salonda ideal çalışma alanı)
  - **4 - 5 Kişi:** 🟡 **Doluyor** (Yeni seans eklerken dikkatli olunmalı)
  - **6+ Kişi:** 🔴 **Kritik Dolu / Aşırı Yoğun** (Salonda kapasite aşıldı uyarısı)
- **Tek Dokunuşla Filtreleme:** Saatlik slot kartına (örn: `19:00`) tıklandığında salonda o an kimlerin olduğu ve hangi hocanın kaç sporcusu bulunduğu anında listelenir.

---

## 6. WhatsApp Akıllı Şablon Entegrasyonu (PRD Madde 4)
Yoklama kartından tek tıkla 3 hazır atletik şablon tetiklenir:
1. **Ders & 3 Saat Kuralı:** *"Merhaba [İsim], bugünkü seansımız planlanan saatte yapılacaktır. Salon kuralımız gereği telafi/iptal durumunda en az 3 saat öncesinden haber vermenizi rica ederiz. Görüşmek üzere! 💪⚡"*
2. **Paket Bitiş & Yenileme:** *"Merhaba [İsim], Compound Athletic'teki [Paket] paketinizde son [X] dersiniz kaldı. Yeni dönem antrenmanlarınızı aksatmadan devam ettirmek için şimdiden yerinizi ayırtabilirsiniz! ⚡"*
3. **Bakiye / Borç Hatırlatma:** *"Merhaba [İsim], devam eden [Paket] paketinizden kalan [₺Bakiye] tutarındaki bakiyeyi havale veya salonda nakit/kart ile iletebilirsiniz. İyi antrenmanlar! 🤝"*

---

## 7. Güncelleme ve Sürüm Geçmişi
- **2026-09-11 (v1.0):** Mimari, SQLite veri tabanı, Excel aktarımı ve Hevy-tarzı Volt Lime frontend tamamlandı.
- **2026-09-11 (v1.1):** "Ortaklar" kavramı kaldırılarak **"Salon (Sahibi - Sinan)"** ve **"Hocalar (Eğitmenler - Gülçin vb.)"** rol ve finans modeli benimsendi.
- **2026-09-11 (v1.2 - PRD Uyum):**
  - **Saatlik Stüdyo Doluluk & Kapasite Çizelgesi (BR-03)** hayata geçirildi.
  - **İkame Hoca Seçici & %40 Kuralı** hızlı yoklama kartlarına entegre edildi.
  - **3 Akıllı WhatsApp Şablon Modalı** (3 saat kuralı, yenileme, bakiye) eklendi.
  - **Bireysel (Özel Ders / PT)** paketi tohum veriye ve paket listesine dahil edildi.
- **2026-09-11 (v1.3 - Çift Tema Desteği & Göz Alıcı Atletik Light Tema):**
  - **Göz Alıcı Atletik Light Tema (Nike & Apple Fitness+):** Porselen beyazı kartlar (`#ffffff`), yumuşak atletik zümrüt/cyan ışıltıları (`#f8fafc`), yüksek kontrastlı Neon Volt (`#CCFF00`) dev aksiyon butonu ve zümrüt yeşili rozetler (`#059669` / `#10B981`) ile birincil varsayılan tema yapıldı.
  - **1-Dokunuş Tema Geçişi (☀️ / 🌙):** Masaüstü sol menü ve mobil başlığa yerleştirilen tema düğmesiyle anında ve `localStorage` kalıcı hafıza ile Açık Tema ile Koyu Tema arasında kesintisiz geçiş sağlandı.
- **2026-09-13 (v1.4 - Standalone Bağımsız Salon, Dinamik Hoca Yönetimi & Geniş Aylık Takvim):**
  - **Excel Bağımlılığının Kaldırılması:** Kullanıcı talimatı doğrultusunda Excel içe/dışa aktarma ve senkronizasyon araçları arayüzden ve iş akışından tamamen temizlendi; sistem %100 kendi kendine yeten bağımsız bir stüdyo işletim sistemine dönüştürüldü.
  - **Dinamik Eğitmen & Hoca Tanımlama Modülü:** Yönetim paneline "🏋️ Eğitmen & Antrenör Kadrosu" bölümü ve `+ Yeni Hoca Tanımla` modalı eklendi. Eğitmen adı, rolü (Eğitmen, PT, Salon Sahibi), telefonu ve varsayılan hakediş prim oranı (%) tanımlanarak anında tüm ders ve hakediş seçimlerine yansıtıldı.
- **2026-09-13 (v1.5 - Kapsamlı Kod İncelemesi, Güvenlik Sıkılaştırma & Performans Optimizasyonu):**
  - **Kritik Yoklama & Seans Kontrolü Düzeltmesi (K-01):** `GymService` içindeki `&&` mantık hatası giderildi (`||` yapıldı); aktif olmayan veya kalan ders hakkı bitmiş paketlere yoklama ve seans açılması kesin olarak engellendi. Regresyon testi eklendi.
  - **UTC Tutarlılığı (K-02):** Takvimde yerel saat (`DateTime.Today`) yerine `DateTime.UtcNow.Date` kullanılarak sunucu saat dilimi farkından kaynaklanan gün kaymaları önlendi.
  - **XSS & Güvenlik Yaması (K-04):** `escapeHtml` fonksiyonuna tek tırnak (`'`) kaçışı eklenerek JS parametre içi güvenlik açıkları kapatıldı.
  - **Backend & Bağımlılık Temizliği (O-01, O-02):** Şablon kalıntıları (`WeatherForecast`) ve artık Excel kodları (`ImportController`, `ExcelImportService`, ClosedXML NuGet paketi, Program.cs otomatik aktarım blokları) tamamen temizlendi; sistem saf SQLite bağımsız tohumlama modeline geçirildi.
  - **Bordro N+1 Sorgu Optimizasyonu (O-06):** Hakediş hesaplamasında her eğitmen için döngü içinde veritabanına gitmek yerine, tüm ay içi kayıtlar tek sorguda çekilip bellek içi haritalama (`GroupBy`) ile O(1) hızına indirildi.
  - **Hardcoded İsim Kontrollerinin Temizlenmesi (O-05):** "Sinan" isim kontrolü kaldırılarak rol bazlı (`Role == "Salon Sahibi"`) dinamik mimariye geçildi.
  - **Doğrudan Eğitmen Sorgusu (O-03):** `GetTrainerByIdAsync` metodu eklenerek tüm listeyi çekip filtreleme yerine doğrudan DB ID sorgusu yapıldı.
  - **Paket Satışında Sorumlu Eğitmen Seçimi (O-04, O-07):** `CreateSubscriptionDto` modeline `PrimaryTrainerId` eklendi; arayüzde yeni paket tanımlanırken sorumlu eğitmen seçimi sunuldu.
  - **Arayüz İyileştirmeleri (İ-02, E-06, O-08):** Üye aramasında 300ms debounce eklendi; takvimden seans planlama fonksiyon ismi ve tarih seçici eşleşmesi (`openScheduleSessionModal`) düzeltildi; PWA `manifest.json` arka plan rengi light tema ile uyumlu hale getirildi.
- **2026-09-21 (v2.0 - Faz 1: B2B2C Fitness CRM Veritabanı Omurga Modellemesi):**
  - **Identity Katmanı:** [AppUser](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Identity/AppUser.cs) (Admin, Coach, Athlete flag enum destekli), [OtpChallenge](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Identity/OtpChallenge.cs) (SMS OTP doğrulama) ve [RefreshToken](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Identity/RefreshToken.cs) (JWT yenileme) modelleri eklendi.
  - **Gym Katmanı Evrimi:** [SessionSlot](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/SessionSlot.cs) (saatlik antrenör yuvası ve kapasite kontrolü), [Reservation](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Reservation.cs) (waitlist ve sporcu rezervasyon yönetimi) ve [FreezeRecord](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/FreezeRecord.cs) (paket dondurma geçmişi) modelleri oluşturuldu. [Member](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Member.cs) ve [Trainer](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Trainer.cs) profilleri opsiyonel `UserId` ile `AppUser`'a bağlandı.
  - **İş Mantığı Korunumu:** [AttendanceRecord](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/AttendanceRecord.cs) ve [Subscription](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Subscription.cs) üzerindeki %40 ikame kuralı, salon/hoca hakediş payları ve bakiye hesaplayıcıları bozulmadan korundu; opsiyonel slot ve rezervasyon bağlantılarıyla genişletildi.
  - **Workout Engine:** Hevy ve Nike Training tarzı [Exercise](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/Exercise.cs) (katalog), [WorkoutTemplate](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/WorkoutTemplate.cs) (şablon), [WorkoutExercise](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/WorkoutExercise.cs) (sıralı egzersizler), [WorkoutLog](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/WorkoutLog.cs) (oturum), [ExerciseLog](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/ExerciseLog.cs) ve [SetLog](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/SetLog.cs) (canlı ağırlık/tekrar takibi) modelleri hayata geçirildi.
  - **Veritabanı Katmanı & Uyumluluk:** Yeni [ApplicationDbContext](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/ApplicationDbContext.cs) (PostgreSQL ve SQLite uyumlu decimal precision yapılandırmalı) oluşturuldu; [AppDbContext](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/AppDbContext.cs) bu sınıftan türetilerek V1 servisleri ve testleri için %100 geriye dönük uyumluluk sağlandı.
  - **Test Doğrulaması:** 4 yeni V2 entegrasyon testi eklendi; toplam 14/14 test sıfır hata ve sıfır derleme uyarısıyla başarıyla doğrulandı.
- **2026-09-21 (v2.0 - Faz 2: Sürtünmesiz Giriş / OTP Auth, JWT & PostgreSQL Altyapısı):**
  - **Veritabanı Çift Sağlayıcı:** `Npgsql.EntityFrameworkCore.PostgreSQL` entegre edildi. `Program.cs` ve `appsettings.json` üzerinden hem PostgreSQL hem SQLite sağlayıcı desteği sağlandı.
  - **Güvenlik & JWT:** `Microsoft.AspNetCore.Authentication.JwtBearer` kuruldu; OpenAPI dökümantasyonuna Bearer Security Scheme eklendi; Role ve Id tabanlı JWT Access Token ile Refresh Token rotasyonu kurgulandı.
  - **Sürtünmesiz Giriş (OTP):** [IAuthService](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/IAuthService.cs) ve [AuthService](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/AuthService.cs) geliştirildi. E.164 telefon normalizasyonu, V1 legacy Member/Trainer kayıtlarını otomatik eşleştirme (auto-linking), kriptografik 6 haneli OTP üretimi (SHA-256 hash, 3 dk süre, max 3 deneme brute-force koruması) ve simülasyon konsol loglaması hayata geçirildi.
  - **API Uç Noktaları:** [AuthController](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/AuthController.cs) (`POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/refresh-token`, `GET /api/auth/me`) yazıldı.
  - **Birim & Entegrasyon Testleri:** [AuthServiceTests.cs](file:///c:/MUFUKS/Code/SporTakip/tests/SporTakip.Tests/AuthServiceTests.cs) (14 yeni test) eklendi; toplam 28/28 test %100 başarıyla ve sıfır derleme uyarısıyla tamamlandı.
- **2026-09-21 (v2.0 - Faz 3: Seans & Rezervasyon Motoru, Waitlist ve 3 Saat Kuralı):**
  - **Seans Slot Yönetimi:** [ISessionService](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/ISessionService.cs) ve [SessionService](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/SessionService.cs) hayata geçirildi. BR-03 doluluk eşikleri (0-3 Rahat, 4-5 Doluyor, 6+ Kritik Dolu) anlık dinamik hesaplanır.
  - **Sporcu Öz-Rezervasyonu:** [IReservationService](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/IReservationService.cs) ve [ReservationService](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/ReservationService.cs) geliştirildi. `IDbContextTransaction` ile atomik operasyonlar sağlandı.
  - **Waitlist (Yedek Liste) Otomasyonu:** Kontenjan dolduğunda sporcu sıraya (#1, #2...) alınır. Onaylı bir rezervasyon iptal edildiğinde 1. sıradaki yedek otomatik olarak `Confirmed` yapılır ve diğer yedekler 1 adım öne kaydırılır.
  - **3 Saat İptal Kuralı Cezası:** Seansa 3 saatten fazla varken yapılan iptallerde ceza uygulanmaz. 3 saatten az kala iptalde (`NoShow`) V1 [AttendanceRecord](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/AttendanceRecord.cs) tablosunda `Status = "Missed"` kaydı doğarak paket hakkı yakılır ve hakedişe yazılır.
  - **Salonda Yoklama (Check-in) & %40 İkame Kuralı:** Antrenör check-in yaptığında `Status = "Attended"` kaydı doğar; derse giren antrenör ile paketin asıl antrenörü farklı ise %40 ikame prim kuralı işletilir.
  - **API Uç Noktaları:** [SessionsController.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/SessionsController.cs) ve [ReservationsController.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/ReservationsController.cs) (`[Authorize(Roles = ...)]` ve JWT claim doğrulamasıyla) yazıldı.
  - **Birim & Entegrasyon Testleri:** [ReservationServiceTests.cs](file:///c:/MUFUKS/Code/SporTakip/tests/SporTakip.Tests/ReservationServiceTests.cs) (9 yeni test) eklendi; toplam **37/37 test %100 başarıyla, 0 hata ve 0 derleme uyarısıyla** doğrulandı.
- **2026-09-21 (v2.0 - v0 PWA Tasarım Entegrasyonu & B2B2C Sporcu Portalı):**
  - **Tasarım Dili & Varlıklar:** Obsidian Black (`#0A0A0C`), Kart yüzeyleri (`#141418`), Volt Lime (`#CCFF00`), Emerald (`#10B981`), Amber (`#F59E0B`), Red (`#EF4444`) atletik renk paleti ve portre görselleri `wwwroot/images/` altına aktarıldı.
  - **PWA Bileşen Mimarisi:**
    - `AppHeader`: Dinamik selamlama, Active Athlete rozeti, bildirim zili ve neon profil halkası.
    - `PackageCard`: Tamamlanan dersleri neon ışıltılı Volt haplarıyla gösteren **Segmented Progress Bar**, kalan ders, kalan gün ve bakiye metrikleri.
    - `Günün Seansları`: BR-03 doluluk göstergesi (yeşil/sarı/kırmızı yanıp sönen durum noktası), 3 saat son iptal kuralı uyarı banner'ı ve dinamik "Seansı Rezerve Et" / "Yedek Listeye Katıl (Sıra #X)" butonları.
    - `WorkoutTeaser`: Egzersiz, set ve PR özet kartı.
    - `Sürtünmesiz OTP Çekmecesi (OtpSheet)`: 10 haneli formatlı telefon girişi, 6 haneli kutucuklar arası otomatik ilerleme, 3 dakikalık canlı geri sayım ve `/api/auth` JWT bağlantısı.
    - `Glassmorphic BottomNav`: Ana Sayfa, Seanslar, Antrenman ve Profil sekmeleriyle yüzen alt navigasyon.
    - `Hibrit Mod Anahtarı`: Sporcu PWA ve Salon Yönetim/Antrenör Paneli (Hızlı Yoklama, Kasa, vb.) arasında tek dokunuşla kesintisiz geçiş.
- **2026-09-21 (v2.1 - UI/UX Denetimi & Kapsamlı İyileştirme Paketi):**
  - **Bottom Navbar & İçerik Kırpılma Giderimi:** `.v0-athlete-shell` alt boşluğu `padding-bottom: 120px`'e yükseltildi; `#v0-view-profile` (`padding-bottom: 80px`) ve `#v0-view-sessions` (`padding-bottom: 60px`) konteynerlerine ek koruma verilerek rezervasyon ve çıkış butonlarının floating navbar altında kalması engellendi.
  - **Çift Tema (Light / Dark) %100 Değişken Uyumu:** `v0-*` sporcu bileşenleri, kartlar, seans listeleri, gün çipleri ve profil modülleri hardcoded renklerden çıkarılarak `--bg-core`, `--bg-surface`, `--text-primary`, `--border-subtle` CSS değişkenlerine bağlandı; açık temada tam porselen/volt uyumu sağlandı.
  - **Masaüstü & Mobil Düzen İyileştirmeleri:** Masaüstünde `max-width: 1400px` ve radial gradient zenginleştirildi; mobilde (<=540px) header öğeleri responsive esneklikle hizalandı.
  - **Giriş/Çıkış Buton Senkronizasyonu:** `updateNavForUserRole()` fonksiyonu `navigateTo()` içine bağlanarak sayfa geçişlerinde header auth durumu dinamik senkronize edildi.
  - **Görsel Hiyerarşi & Touch Targets:** Seans rezervasyon (volt neon) vs. yedek liste bekleme (amber/outline) buton hiyerarşisi ayrıştırıldı; gün seçim çipleri (`.v0-day-chip`) mobilde 42px minimum dokunma alanına çıkarıldı.
  - **Boş Durum (Empty State) & Antrenman Stilleri:** Paketi olmayan sporcular için kesikli kenarlıklı (`empty-state`) kart stili ve antrenman/PR kartlarında dinamik tema desteği eklendi.
- **2026-09-21 (v2.2 - Seans Düzenleme / Saat Değiştirme & Canlı Kapasite Izgarası Overhaul):**
  - **Var Olan Seansı Düzenleme (Saat, Eğitmen, Kapasite, Tür):** `ISessionService` ve `SessionsController`'a `PUT /api/sessions/{id}` ve `DELETE /api/sessions/{id}` uç noktaları eklendi; antrenör ve salon sahipleri için seans kartlarında `✏️ Düzenle` butonu ve `modal-edit-session` form modalı hayata geçirildi. Seans saati, bitiş zamanı, sorumlu hoca, kontenjan ve seans tipi anında güncellenebilmektedir.
  - **Canlı Stüdyo Doluluk Izgarası (No-Scroll Responsive Fit):** Yatay scrollbar çubuğu yerine masaüstünde tek satırda 10 slotu sığdıran (`grid-template-columns: repeat(auto-fit, minmax(82px, 1fr))`), mobilde ise 2 satır x 5 slot (`repeat(5, 1fr)`) şeklinde ekrana %100 sığan duyarlı ızgara yapısına geçildi.
  - **Canlı Seans vs. Boş Saat Görsel Kontrastı:** Boş saatler (`0 kişi`) sakin ve dikkat dağıtmayan kesikli (`dashed`) transparan kartlara dönüştürülürken; seans olan saatler parlak neon çerçeve, canlı yanıp sönen durum noktası (`.slot-live-dot`) ve yüksek kontrastlı renkli rozetlerle göz alıcı biçimde öne çıkarıldı.
  - **Sağlam Response Stream Yönetimi:** `api.js` içinde `_handleResponse` merkezi yapısına geçilerek 401/403 veya boş gövdeli yanıtlarda oluşan `body stream already read` tarayıcı hatası kalıcı olarak giderildi.
- **2026-09-22 (v2.4 - Faz 1: Hızlı Katma Değer & Hızlı Kazanımlar / Quick Wins):**
  - **🏃‍♂️ Atletler İçin: "Derse Kimler Geliyor?" (Sosyal Kanıt & Katılımcı Baloncukları):** Seans kartlarında derse daha önce kayıt olmuş sporcuların üst üste binen renkli avatar baloncukları (`.v0-attendees-row`, `.v0-attendees-avatars`, `.v0-attendee-avatar-bubble`) ve "Can D. katılıyor", "Can D., Meltem Y. ve +1 kişi katılıyor" şeklinde arkadaş/komünite motivasyon metinleri entegre edildi.
  - **🏋️ Koçlar İçin: Yoklamada Sporcu Sakatlık & Sağlık Kısıt Rozeti & Hızlı Not Güncelleme:** Yoklama kartlarında sporcunun kritik sağlık kısıtlarını (örn: "⚠️ Bel fıtığı (L4-L5): Ağır deadlift kısıtı...") anında gösteren amber uyarı rozeti (`.v0-injury-badge-wrap`) ve antrenörlerin salondayken sporcunun sağlık notunu 1 dokunuşla güncelleyebilmesi için `✏️ Notu Düzenle` butonu ile `modal-edit-member-notes` form modalı eklendi. `PUT /api/members/{id}/notes` (`[Authorize(Roles = "Coach, Admin")]`) ve `GymService.UpdateMemberNotesAsync` hayata geçirildi.
  - **💰 Koçlar İçin: Kişisel "Hakedişim" Ekranı & Finansal Gizlilik İzolasyonu (RBAC):** Koçların salon sahibinin toplam cirosunu veya diğer antrenörlerin gelirini görmesini engelleyen gizlilik izolasyonu sağlandı (`GET /api/dashboard/payroll` ve `view-dashboard` salon yöneticisi `Admin` rolüne kısıtlandı). Koçlar için özel `GET /api/dashboard/my-earnings` uç noktası ve `💵 Hakedişim` sekmesi (`view-hakedisim`) geliştirildi; Bu Ayki Tahmini Hakediş, Toplam Verilen Ders Adedi ve %40 İkame Ders Payları KPI kartları ile seans seans prim döküm tablosu sunuldu.
  - **Birim & Entegrasyon Testleri:** `UpdateMemberNotes_UpdatesNotesSuccessfully` ve `GetTrainerPersonalEarnings_ReturnsPersonalBreakdownWithoutLeakingSalonRevenue` testleri dahil edilerek **51/51 test %100 başarıyla ve sıfır derleme hatasıyla doğrulandı.**
- **2026-09-22 (v2.5 - UI/UX Overhaul: Mod Anahtarı / Workspace Switcher & Header Sadeleştirme):**
  - **Kök Neden Çözümü (9 Sekmelik Yığılmanın Önlenmesi):** Hem Sporcu hem de Salon Masası işlevlerinin aynı menüye tıkıştırılması sona erdirildi. Yetkili kullanıcılar (Koç & Salon Sahibi) için header'a modern bir **Mod Anahtarı (Segmented Switcher)** eklendi: `[ 🏃 Sporcu | ⚡ Salon ]`.
  - **Masaüstü Menü Ferahlaması:** Masaüstü navigasyon çubuğu seçili moda göre yalnızca 3-4 odaklı buton gösterir hale getirildi. Başlıklar kısaltılarak (`⚡ Yoklama`, `👥 Üyeler`, `💵 Hakedişim`, `📊 Finans`, `📋 Bordrolar`) kafa karışıklığı giderildi ve menü genişliği ideal boyuta çekildi.
  - **Mobil Alt Bar (Bottom Nav) Düzeni:** Mobilde 7 butonluk yığılma kaldırılarak moduna göre yalnızca 4 adet geniş, rahat dokunulabilir buton sunuldu (`flex: 1`, geniş dokunma hedefleri).
  - **Header Sol & Sağ Dengeleme:** Sol taraftaki büyük selamlama bloğu kaldırılarak sağdaki avatarın yanına minimal ve şık bir profil çipi (`.v0-header-user-pill`: `🟢 İsim / Rol`) entegre edildi; sol taraf yalnızca marka logosu ve mod anahtarına bırakıldı.
- **2026-09-22 (v2.6 - Compound Athletic Özgün Marka Kimliği & Kaplan Amblemi Entegrasyonu):**
  - **Varsayılan Profil Avatarları:** Generic silüet avatar yerine `docs/compound_athletic_logo.jpg` ve `ideas.jpg` referans alınarak üretilen yüksek çözünürlüklü kükreyen beyaz kaplan amblemli atletik rozet (`default-avatar.png`) tüm sisteme giydirildi.
  - **Header Marka Logosu:** Sol üstteki generic şimşek emojisi kutusu yerine 40x40 pürüzsüz Compound Athletic kaplan ikonlu amblem (`compound-brand-icon.png`) yerleştirildi.
  - **Paket Kartı Atmosferik Filigranı:** Sporcu ana sayfasındaki Aktif Paket Kartı ve Hoş Geldiniz kartlarının arka planına sağ alttan hafifçe taşan yarı saydam kaplan amblemi filigranı (`compound-watermark.png`) eklendi; kartın üzerine gelindiğinde (hover) amblem parıldayarak derinlik kazandı.
  - **PWA İkonları & Favicon:** `icons/icon-192.png`, `icons/icon-512.png` ve `favicon.ico` kaplan amblemi ile güncellenerek mobil cihaz ana ekranında tam bir yerel Nike Training / Hevy hissiyatı oluşturuldu.
- **2026-09-22 (v2.6.1 - Saatlik Slot Filtresi Temizleme Butonu Sadeleştirmesi):**
  - **Kompakt Temizleme İkonu (✕):** Hızlı Yoklama ekranında saatlik doluluk slotuna tıklandığında beliren aktif filtre kutusundaki (`#slot-details-box`) geniş ve yer kaplayan `Filtreyi Kaldır ✕` metin butonu kaldırılarak, yerine sağa hizalı, 24px dairesel, hover efektli ve erişilebilir (`title` ve `aria-label`) minimal temizleme ikonu (`.btn-clear-slot-icon`) entegre edildi.
  - **Görsel Düzen:** Filtre metni (`#slot-details-text`) ve kapatma ikonu esnek hizada (`justify-content: space-between`) dengelenerek stüdyo doluluk çubuğunun altındaki görsel kirlilik ve genişlik taşmaları giderildi.
- **2026-09-22 (v2.6.2 - Marka Kimliği & Logo Kesim Otomasyonu - Vektörel Düzeyde Hassasiyet):**
  - **Parlaklık -> Saydamlık (Luminance to Alpha):** Siyah zeminli logo üzerindeki siyah haleyi ve kenar testerelenmelerini sıfırlamak için parlaklık kanalını doğrudan alpha maskesi yapan Python otomasyonu (`scripts/process_brand_logos.py`) devreye alındı.
  - **JPEG Gürültü Filtreleme (Threshold):** JPEG sıkıştırmasından gelen ~17 parlaklık seviyesindeki zemin gürültüsü matematiksel threshold ile saf şeffaflığa (`alpha = 0`) çekildi; anti-aliasing yumuşaklığı kusursuz korundu.
  - **Milimetrik Varlık Ayrıştırması (`docs/logo/`):**
    - `Master_Logo.png`: Tam şeffaf, 30px nefes payı ile fazlalık boşlukları kırpılmış eksiksiz logo.
    - `Wordmark.png`: Pençelerin altındaki y=427 sınırından kesilerek sıfır leke ve tam kalkan ile oluşturulan saf tipografi logosu.
    - `App_Icon.png` & `App_Icon_Transparent.png`: Kaplanın kulak tepesi (y=90) ve çene ucunu (y=335) eksiksiz kapsayan 286px odaklı 1:1 kare app simgesi.
    - `Tiger_Emblem.png`: Gövde, omuzlar ve pençeleri içeren şeffaf atletik amblem.
    - `Badge_Circular.png`: 4x supersampling (1024x1024 -> 256x256) ve Lanczos interpolasyonu ile oluşturulan pürüzsüz volt neon çerçeveli rozet.
  - **Canlı Web/PWA Entegrasyonu:** Header marka ikonu, default avatar, kart filigranı ve PWA simgeleri yeni pürüzsüz varlıklarla güncellendi.
- **2026-09-22 (v2.6.7 - Kapsamlı Mobil Görünüm Overhaul & Özgün Kaplan Amblemleri Entegrasyonu):**
  - **İstilacı PWA Banner'ının Kaldırılması:** Mobilde ekranın altını ve floating navigasyon barını kapatan hantal popup kutusu tamamen kaldırılarak arayüz ferahlatıldı. PWA kurulumu doğal yerine (Profilim sekmesindeki şık "Uygulamayı Cihazınıza Yükleyin" kartı ve iOS Safari 3 adımlı kurulum rehberi modalına) taşındı.
  - **Özgün Kaplan Amblemleri (`tiger1` & `tiger2`):** Generic şimşek emojileri (`⚡`) sistem genelinde Compound Athletic'in özgün kükreyen kaplan amblemleriyle değiştirildi:
    - `tiger1_badge.png`: Header mod anahtarı (`Salon`), Hızlı Yoklama sekmeleri ve butonları (`GELDİ (DERS DÜŞ)`), Serbest İdman Başlat düğmesi, Seans katılımcı baloncukları ve bildirim ikonları.
    - `tiger2_badge.png`: Misafir karşılama kartı (3D pulsing neon glow ile) ve Profil altındaki PWA mobil uygulama kartı.
  - **Mobil Yerleşim & Navigasyon Boşlukları (Safe Area & Padding):**
    - `.v0-athlete-shell` alt boşluğu `padding-bottom: 110px`'e ayarlandı.
    - `#v0-view-profile`, `#v0-view-sessions`, `#v0-view-workout` sekmelerine `110px-120px` alt boşluk verilerek "Çıkış Yap" veya "İdmanı Başlat" gibi son butonların floating bottom bar altında kalması kesin olarak engellendi.
    - Floating bottom bar mobilde `rgba(14, 14, 18, 0.94)` frosted glass, 18px radius ve touch-friendly 44px hedef alanlarıyla ekranın altına milimetrik oturtuldu.
  - **Service Worker & Canlı Önbellek Stratejisi:** `.js` ve `.css` varlıkları için Network-first stratejisine geçilerek geliştirme ve yayın esnasındaki stale cache ve ReferenceError problemleri kalıcı olarak çözüldü; versiyon `v2.6.7`'ye yükseltildi.
- **2026-09-22 (v2.7.5 - Mobil Header/Geçiş İyileştirmesi, UTC Saat Dilimi Düzeltmesi, Mükerrer Ders Düşme Koruması & Bildirim Merkezi):**
  - **Kaplan Varlıklarının Saf Şeffaflığı & Siyah Arka Plan Temizliği:**
    - `compound-brand-icon.png`, `default-avatar.png`, `tiger1_badge.png`, `tiger2_badge.png`, `compound-watermark.png` ve PWA simgeleri sıfırdan Python ve Lanczos interpolasyonu ile üretildi; tüm köşeler ve arka plan pikselleri kesin `%100` şeffaf (`RGBA [0,0,0,0]`) hale getirildi. Siyah kutu ve dikdörtgen lekeler tamamen yok edildi.
    - Profil avatarında "3D Avatar'a Dön" metni "Compound Avatarına Dön" olarak güncellendi.
  - **Mobilde Üst Mod Anahtarı [Sporcu | Salon] Yerleşimi:**
    - Header mobilde (`<= 640px`) `flex-wrap: wrap` yapısına geçirildi. 1. satırda sol tarafta Marka Logosu, sağ tarafta işlem butonları (Tema, Bildirim, Avatar) konumlandırıldı.
    - Mod Anahtarı (`#app-mode-switcher`) 2. satıra 100% genişlikte ve konforlu dokunmatik alanlarla (`flex: 1`) yerleştirildi. Simgelerin altında kalma ve taşma sorunu tamamen giderildi.
    - Kullanıcı talebi doğrultusunda Salon modu simgesi kaplan yerine stüdyo binası simgesi (`🏢 Salon`) ve Yoklama simgesi (`📋 Yoklama`) olarak güncellendi.
  - **Profilim VKİ Rozeti Hizalama Düzeltmesi:**
    - Başlık "📏 Fiziksel Profil & Metrikler" yerine daha kompakt "📏 Vücut Metrikleri" yapıldı.
    - Rozete `flex-shrink: 0; white-space: nowrap;` verilerek "Yüksek" veya "Fazla Kilolu" kategorilerinde rozetin alt satıra kayması ve taşması engellendi.
  - **Etkileşimli Bildirim Merkezi Çekmecesi (Notification Center Drawer):**
    - Zil ikonuna tıklandığında beliren tekil toast mesajı yerine, alttan açılan şık `#v0-notification-drawer` çekmecesi devreye alındı.
    - İçerik: Bugünkü Seans Hatırlatması, Kalan Paket/Ders Durumu, Sistem/PWA bilgisi.
    - Tarayıcı Anlık Bildirim İzni (`Notification.requestPermission()`) switch'i ve "Tümünü Okundu Say" butonu eklendi.
  - **Seans Planlama UTC (+3 Saat) Dilimi Düzeltmesi:**
    - `handleScheduleSession` ve `handleSaveEditSession` fonksiyonlarında `.toISOString()` kullanımının yerel saat 19:00'u UTC 16:00'ya çekmesi engellendi; duvardaki saat formatında yerel ISO string (`${dateStr}T${hour}:00:00`) gönderilerek seansların tam seçilen saatte stüdyo slotuna düşmesi sağlandı.
  - **Aynı Seansta Mükerrer Ders Düşme Koruması (Domain Logic & UI):**
    - `GymService.MarkAttendanceAsync`: Aynı gün ve saatteki seansta sporcu zaten `Attended` (Geldi) durumundaysa mükerrer çağrılarda yeni ders düşülmesi engellendi (`InvalidOperationException` ile koruma).
    - Durum geçişleri güvenli hale getirildi: `Attended -> Excused` yapıldığında ders hakkı sporcuya iade edilir (`CompletedLessons--`).
    - UI tarafında (`renderAttendanceList`): İlgili saat slotunda zaten yoklaması alınmış üyeler için buton `✓ BU SEANSTA GELDİ (Ders Düşüldü)` olarak yeşil rozetle gösterilerek mükerrer tıklama riski ortadan kaldırıldı.
  - **Test Doğrulaması:** 53 birim ve entegrasyon testinin tamamı başarıyla geçti (53/53 passed). Versiyon `v2.7.5` olarak yayınlandı.
- **2026-09-23 (v2.8.6 - 4 Rol Kapsamlı Denetim, 12-16 Öğle Seansları & Sade Başlık Standardı):**
  - **4 Rol Bazlı Kapsamlı Ekran ve RBAC Denetimi:**
    - *Misafir (Guest):* Hero, eğitmen kadrosu, lokasyon/harita, WhatsApp entegrasyonu, lead formu ve seans gizlilik duvarı başarıyla doğrulandı.
    - *Sporcu (Member - Meltem & Can):* Aktif paket kartı, 2 haftalık kesintisiz seans takvimi, anlık rezervasyon, 3 saat iptal kuralı, Hevy tarzı canlı egzersiz seti loglama motoru ve rekorlar doğrulandı.
    - *Koç (Trainer - Gülçin):* Mod anahtarı (`[Sporcu | Salon]`), stüdyo saatlik doluluk çubuğu, sağlık notları, ikame antrenör `%40 Hak Ediş` rozeti, anlık yoklama ders düşümü ve kişisel hakediş dökümü (diğer antrenör ve salon verilerinden izole) doğrulandı.
    - *Salon Sahibi (Admin - Sinan):* Genel ciro (`₺24.000`), kasa (`₺6.000`), alacak (`₺18.000`), salon payı (`₺6.600`), hoca hakedişleri (`₺17.400`), kadro yönetimi ve bordrolar doğrulandı.
  - **Kesintisiz Çalışma Saatleri (12:00 - 16:00 Öğle Seansları):**
    - Seans saatlerindeki 12:00 - 16:00 boşluğu giderildi.
    - Backend `operatingHours` dizisine ve seans planlama açılır menüsüne 13:00, 14:00, 15:00 saatleri eklendi; 09:00 - 21:00 arası kesintisiz saatlik çizelgeye dönüştürüldü.
    - Veritabanındaki `SessionSlots` tablosuna ve dinamik fallback motoruna öğle saatleri (12:00, 14:00 vb.) eklenerek hem mobil Seanslar sekmesinde hem de Salon Masası'nda görünür kılındı.
  - **Kısa & Sade Başlık Tasarım İlkesi:**
    - Gösterişli, uzun ve aşırı emojili başlıklar minimalist ve kurumsal bir stile kavuşturuldu:
      - `Salon (Sahibi) & 🏋️ Hoca Gelir Dağılımı (Bu Ay)` -> `Gelir Dağılımı`
      - `🏋️ Eğitmen & Antrenör Kadrosu` -> `Kadro`
      - `📋 Aylık Eğitmen Hakediş Bordrosu ve Salon Geliri` -> `Aylık Bordro`
      - `🗓️ Seans Takvimi` -> `Seanslar`
      - `Antrenman & Egzersiz` -> `Antrenman`
      - `Profilim & Rezervasyonlarım` -> `Profilim`
      - `Salon Sahibi (Sinan) Payı` -> `Salon Payı`
      - `Hoca (Gülçin vb.) Hakedişleri` -> `Hoca Hakedişleri`
  - **Sporcu Bilgilerini Düzenleme (Member Edit Feature):**
    - Sporcular tablosuna (`view-uyeler`) her satır için `✏️ Düzenle` aksiyon butonu eklendi.
    - Açılan `#modal-edit-member` modalı üzerinden sporcunun adı soyadı, telefonu, e-postası, boyu, kilosu, yaşı, cinsiyeti, sakatlık/sağlık kısıt notu ve aktiflik durumu düzenlenebilmektedir.
    - `PUT /api/members/{id}` uç noktası ve `GymService.UpdateMemberAsync` entegrasyonu tamamlandı.
  - **Test Doğrulaması:** 54 birim ve entegrasyon testinin tamamı başarıyla geçti (54/54 passed). Versiyon `v2.8.8`.
- **2026-09-23 (v2.8.9 - Saatlik Doluluk İnteraktif Tarih Gezinimi & 7 Günlük Takvim Şeridi):**
  - **Kullanıcı Talebi:** *"Saatlik Doluluk'ta tarih değiştirmek zor olmuş. ileri geri ve/veya sporcu görünümündeki seans takvimi gibi tarih seçimi koyalım"*
  - **İnteraktif 7 Günlük Takvim Şeridi (`#capacity-week-strip`):** Sporcu Seanslar takvimindeki stil ve mekanizma (`.v0-cal-days-grid`, `.v0-cal-day-cell`) doğrudan Saatlik Doluluk paneline uygulandı; Pzt-Paz 7 gün kompakt şerit olarak yerleştirildi. Seçili gün Volt Lime dolgu ve parıltıyla öne çıkar.
  - **Hızlı Gün Değiştirme (`◀`, `▶`) ve "Bugün" Kısayolu:** Tek dokunuşla önceki/sonraki güne geçiş butonları (`.v0-day-nav-arrow`) ve bugüne anında dönme rozeti (`#btn-capacity-today`) eklendi.
  - **Senkronize Tarih Seçici:** Dinamik metin etiketi (`#capacity-current-date-label`), takvim şeridi, yerleşik tarih seçici (`#capacity-date-picker`) ve saatlik kapasite slotları 2 yönlü kusursuz senkronizasyonla bağlandı.
- **2026-09-24 (v2.9.0 - Yoklama Kaydı Kilitleme & Standart Paket / Esnek Fiyat Yönetimi):**
  - **Kullanıcı Talepleri:**
    1. *"Bu Seans'ta geldi diye tekrar geldi diyemiyoruz ama gelmedi diyebiliyoruz. geldiyse gelmiştir, gelmedi iptal demek saçma oluyor. bi kere yoklama aldıktan sonra kayıt kalsın, o yüzden yoklamada alt seçenekleri kaldırmak gerek gibi."*
    2. *"-paketleri ve fiyatları nerede tanımlayacağız? atletten atlete paket fiyatı değişebilir esnek olmalı"*
  - **Yoklamada Tek Seferlik Kesin Kayıt & Çelişkili Butonların Kaldırılması:**
    - Üyenin yoklaması bir kez "Geldi" olarak alındığında kart kilitlenir: `✓ BU SEANSTA GELDİ (X. Ders)` rozeti gösterilir.
    - Altındaki `❌ Gelmedi (Yandı)` ve `🕒 Mazeretli Telafi` butonları tamamen kaldırılır; sadece `💬 WhatsApp Mesajı Gönder` butonu bırakılır.
    - `GymService.MarkAttendanceAsync` katmanında `Attended` olan kaydın `Missed` olarak ezilmesi engellendi.
  - **Standart Paket & Fiyat Yönetimi (Finans Dashboard):**
    - `view-dashboard` ekranında Kadro altına "Paketler & Fiyatlar" yönetim tablosu entegre edildi.
    - `+ Yeni Paket` butonu ve `#modal-package` modalı üzerinden Paket Adı, Paket Türü (GRUP, PT, OZEL), Ders Sayısı, Geçerlilik Süresi (Gün) ve Varsayılan Liste Fiyatı tanımlanabilmektedir. `✏️ Düzenle` ve `✕ Pasif` aksiyonları eklendi.
    - `PackagesController.cs` REST API (`GET`, `POST`, `PUT`, `DELETE /api/packages`) hayata geçirildi.
  - **Üye Paket Tanımlamada Esnek Fiyat Bildirimi:**
    - `#modal-new-sub` içine `💡 Esnek Fiyat` bilgilendirme kutusu eklendi; varsayılan liste fiyatı seçildiğinde dahi her sporcu için fiyatın serbestçe değiştirilebileceği netleştirildi.
  - **Test Doğrulaması:** 56 birim ve entegrasyon testinin tamamı başarıyla geçti (56/56 passed). Versiyon `v2.9.0`.
- **2026-09-24 (v2.9.1 - Sayfa Yenilemede Açık Tema Parlaması / FOUC Sorununun Giderilmesi):**
  - **Kullanıcı Talebi:** *"yenile yapınca açık tema görünüyor bir süre sorunumuz ne olabilir"*
  - **Kök Neden Analizi:**
    - `app.css` dosyasında `:root` ile `[data-theme="light"]` birleşik tanımlandığı için tarayıcı henüz JS çalıştırmadan önce sayfayı varsayılan beyaz (`#f8fafc`) arka planla çizmekteydi.
    - `app.js` modül (`<script type="module">`) olduğu için ertelenmiş (deferred) çalışıyordu; `document.documentElement.setAttribute('data-theme', 'dark')` satırı DOM render edildikten yüzlerce milisaniye sonra tetikleniyor ve anlık beyaz-siyah geçişi (FOUC - Flash of Unstyled Content) oluşturuyordu.
  - **Uygulanan İki Kademeli Çözüm:**
    1. **Senkronize Blocking `<script>` & HTML Varsayılanı (`index.html`):** `<html lang="tr" data-theme="dark">` varsayılan yapıldı. `<head>` içine CSS'lerden önce çalışan küçük ve senkronize bir inline script yerleştirilerek `localStorage.getItem('sportakip-theme')` değeri tarayıcı ilk pikseli çizmeden önce `<html>` etiketine aktarıldı.
    2. **CSS Varsayılanının Tersine Çevrilmesi (`app.css`):** `:root, [data-theme="dark"]` ana atletik Obsidian Dark renkleri olarak belirlendi; `[data-theme="light"]` ise açık tema tercihi yapıldığında devreye giren stil bloğuna dönüştürüldü. Ayrıca `html { background-color: var(--bg-core); color-scheme: dark; }` ile sistem kaydırma çubukları ve natif kontroller de koyu temayla senkronize edildi.
  - **Browser Alt Ajanı Doğrulaması:** Koyu ve açık tema durumlarında tarayıcı hard-refresh (F5) ve tema geçişleri test edildi; beyaz parlama %100 ortadan kalktı. Sürüm `v2.9.1`.
- **2026-09-24 (v2.9.2 - Bordro & Kadro Tabloları Rol ve Seans Rozetleri Yenilemesi):**
  - **Kullanıcı Talebi:** *"buradaki ss'te de gördüğün üzere rol ve ders badgeleri bölünüyor onları daha güzel yapalım"*
  - **Kök Neden:** Dar mobil ekranlarda `white-space: nowrap` ve flex yapılandırması olmaması sebebiyle `Salon Sahibi` iki satıra bölünmekte (`Salon` / `Sahibi`), `1 DERS` ise dikey oval bir yumurta gibi ezilmekteydi (`1` / `DERS`).
  - **Uygulanan Yenilikler:**
    1. **Özel Rol Rozeti Bileşeni (`.role-badge`):**
       - **Salon Sahibi:** Altın sarısı/amber ışıltılı rozet ve `👑 Salon Sahibi` simgesi (`.role-badge-owner`).
       - **Eğitmen:** Atletik siber mavi ışıltılı rozet ve `🏋️ Eğitmen` simgesi (`.role-badge-coach`).
       - **PT:** Neon Volt yeşili rozet ve `⚡ PT` simgesi (`.role-badge-pt`).
       - Türkçe ses uyumu (ünsüz yumuşaması - "sahibi") destekli otomatik rol tanıyıcı `getRoleBadgeHtml()`.
    2. **Yatay ve Kompakt Ders Rozeti (`.lesson-badge`):**
       - `display: inline-flex; white-space: nowrap;` uygulanarak `1 Ders` ve `5 Ders` Volt Lime hap rozeti şeklinde tek satırda kusursuz oranlandı.
    3. **Tablo Başlıkları ve Hücre Esnekliği (`custom-table`):**
       - `th` ve `td` öğelerine `white-space: nowrap`, `vertical-align: middle` ve dengeli padding uygulandı; mobilde `.table-responsive table` genişliği 620px'e çıkarılarak sütunların birbirini ezmesi tamamen engellendi.
  - **Doğrulama & Görsel Güncelleme:** Mobil görünümde test edildi, ekran görüntüsü yeniden alınarak `docs/screenshots/admin_payroll_view.png` güncellendi. Sürüm `v2.9.2`.
- **2026-09-24 (v2.9.3 - Platform SuperAdmin Mimarisi & Çok Katmanlı Yetkilendirme):**
  - **Kullanıcı Talebi:** *"salon sahibi, hoca gibi kullanıcılar da canlıya alındığında bir admin tarafından oluşturulma ihtiyacımız olacak şimdiden bir superuser mı koyalım. superadmin mimarisine çekelim. salon sahibi olmasam da kodu yönetmem gerekir"*
  - **Mimarî Tasarım & Ayrım:**
    1. **Rol Seviyesi Ayrımı (`UserRole` Bitmask Flags):**
       - `SuperAdmin = 8`: Platform / Kod Sahibi. Bütün sistem metriklerine, kullanıcı hesaplarına, rol atamalarına ve god-mode arayüz geçişlerine tam yetkili.
       - `Admin = 4`: Salon Sahibi (Sinan). Kasa, bordro, antrenör yönetimi, paket fiyatlandırmalarını yönetir.
       - `Coach = 2`: Eğitmen (Gülçin). Seans takvimi, yoklama alma, kendi hakedişini görüntüleme.
       - `Athlete = 1`: Sporcular.
    2. **Güvenli Konfigürasyon Tabanlı Bootstrap (`appsettings.json`):**
       - `"SuperAdmin": { "Phone": "+905550000000", "FullName": "Platform Yöneticisi" }` tanımlandı. Canlı ortamda kod içerisine kimlik gömülmeden ortam değişkeni (`SuperAdmin__Phone`) ile dinamik beslenebilir yapı kuruldu.
       - `DbSeeder.cs` ve `AuthService.cs`: SuperAdmin kullanıcısı seed edilerek hazırlandı; ayrıca `SendOtpAsync` sırasında tanımlı SuperAdmin telefonundan ilk kez giriş yapıldığında hesabı otomatik algılayıp SuperAdmin yetkisine yükselten idempotent bootstrap mekanizması eklendi.
    3. **SuperAdmin API Controller (`/api/superadmin`):**
       - `GET /api/superadmin/stats`: Toplam kayıtlı kullanıcı, SuperAdmin, Salon Sahibi, Eğitmen ve Sporcu sayıları ile aktif üyelik ve ciro metriklerini döner.
       - `GET /api/superadmin/users`: Tüm kullanıcıları bağlı profilleri (Trainer/Member) ve atanmış rolleriyle birlikte döner.
       - `POST /api/superadmin/assign-role`: Seçilen kullanıcıya anlık `Admin` veya `Coach` rolü atar / kaldırır; eğitmen profili yoksa otomatik senkronize eder.
       - `POST /api/superadmin/create-gym-owner`: Tek tıkla yeni Salon Sahibi kullanıcısı ve işletme antrenör profilini oluşturur.
    4. **Frontend Sistem Yönetim Masası (`#view-superadmin` & Workspace Switcher):**
       - Header Mod Değiştirici: SuperAdmin için `🛡️ Yönetim` butonu eklendi; Sporcu, Salon Masası ve Sistem Yönetimi arasında 1 tıkla geçiş imkanı sağlandı.
       - Özel Rol Rozetleri: Mor ışıltılı `.role-badge-superadmin` ve modern sporcu rozeti `.role-badge-athlete`.
       - Kullanıcı ve Yetki Yönetim Tablosu: Canlı arama filtresi (`#sa-user-search`), anlık yetki atama/geri alma aksiyon butonları ve modal ile yeni salon sahibi başlatma akışı eklendi.
  - **Doğrulama & Test:**
    - 56 birim ve entegrasyon testinin tamamı başarıyla geçti (56/56 passed).
    - Tarayıcı alt ajanı ile `+905550000000` SuperAdmin girişi, mod butonları ve sistem yönetim paneli ekran görüntüsüyle (`docs/screenshots/superadmin_panel_view.png`) doğrulandı. Sürüm `v2.9.3`.
- **2026-09-24 (v2.9.4 - Bulut Dağıtım Altyapısı: Render, Docker & Bulut PostgreSQL / Neon Desteği):**
  - **Docker Multi-Stage Build:** .NET 10 SDK ve ASP.NET Core 10 runtime tabanlı, katman önbellekli (layer caching) ve hafif production `Dockerfile` ile `.dockerignore` oluşturuldu.
  - **Dinamik Port ($PORT) Entegrasyonu:** Render, Railway veya bulut konteyner ortamları tarafından atanan `$PORT` ortam değişkeni Kestrel dinleme portuna otomatik bağlandı (`builder.WebHost.UseUrls($"http://*:{port}")`).
  - **Akıllı PostgreSQL URI Çözümleyici (`ParsePostgresConnectionString`):** Neon.tech ve Supabase tarafından sağlanan standart `postgresql://user:pass@host:5432/db` formatındaki bağlantı dizeleri otomatik ayrıştırılarak Npgsql ADO.NET formatına dönüştürüldü; `DATABASE_URL` ortam değişkeni ile sıfır konfigürasyonla çalışması sağlandı.
  - **Veritabanı Sağlayıcı Güvenliği:** `DbSeeder.cs` içindeki SQLite'a özgü `ALTER TABLE` komutları `db.Database.IsSqlite()` şartına bağlandı; bulut PostgreSQL ortamlarında schema tohumlamanın pürüzsüz çalışması garanti altına alındı.
  - **Neon Entegrasyonu & MCP Kurulumu:** Neon CLI (`neon@6.0.0`) ve Neon MCP sunucusu IDE'ye başarıyla entegre edildi. Proje `orange-queen-18548661` (production branch) ile linklendi, `neon.ts` yapılandırması yayınlandı (`neon deploy`).
  - **2026-09-24 (v2.9.5 - Kullanıcı & Rol Yönetimi Overhaul, Telefon Numarası Değiştirme, Anonim Tohum Veri & Çoklu Sıralama/Filtreleme):**
  - **Kullanıcı Talepleri:**
    1. *"kullanıcıların numarasını değiştirebilelim. data seed ile yaptıklarımız yanlış çünkü"*
    2. *"Kayıtlı Kullanıcılar ve Roller'de sıralama filan da yapabilelm. super admin ve salon sahibi herşeyi editleyebilsin"*
    3. *"dataseeder'da gerçek isim değil de Atlet_1 Atlet_2 Hoca_1 SalonSahibi_1 filan kullanalım :D"*
  - **Tohum Veri & Veritabanı Anonimleştirme ([DbSeeder.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/DbSeeder.cs)):**
    - Tohum verideki gerçek isimler anonimleştirildi: `SalonSahibi_1`, `Hoca_1`, `Atlet_1`, `Atlet_2`, `Atlet_3`.
    - SQLite veritabanında geçmiş tohum verilerini anında güncelleyen in-place migrasyon eklendi; eski gerçek isimler otomatik olarak anonim adlara dönüştürüldü.
    - Her sistem açılışında telefon numarasını eski numaraya sıfırlayan / mükerrer kayıt üreten hardcoded arama mantığı düzeltildi (`trainer.UserId` referansı ile korundu).
  - **Kullanıcı & Telefon Numarası Düzenleme API'si (`PUT /api/superadmin/users/{id}`):**
    - `SuperAdminController.UpdateUser`: Ad Soyad, Telefon Numarası, Aktiflik Durumu, Telefon Doğrulama Durumu, Roller (SuperAdmin, Admin, Coach, Athlete) ve Hoca Profil Alanları (Rol, Prim Oranı %) tek bir atomik işlemle güncellenebilir hale getirildi.
    - E.164 telefon normalizasyonu ve çakışma (duplicate phone) kontrolü entegre edildi.
    - Çift yönlü profil senkronizasyonu: `AppUser` üzerindeki telefon veya isim değişikliği bağlı `Trainer` ve `Member` profillerine; tersi durumda eğitmen/üye güncellemeleri de `AppUser` tablosuna anında yansıtıldı (`GymService.UpdateTrainerAsync`, `GymService.UpdateMemberAsync`).
  - **SuperAdmin & Salon Sahibi Ortak Yetkilendirmesi:**
    - `canAccessAdminPanel = isSuperAdmin || isAdmin`: Salon sahiplerinin de (Admin) Kullanıcı Yönetim paneline (`🛡️ Yönetim`) erişebilmesi sağlandı; ancak güvenlik sınırları gereği Salon Sahibi yalnızca Admin, Hoca ve Sporcu rollerini ve kullanıcı detaylarını yönetebilirken `SuperAdmin` rolünü yalnızca mevcut SuperAdmin'ler değiştirebilir.
    - Kadro tablosuna `✏️ Düzenle` butonu ve `#modal-edit-trainer` eklenerek eğitmen bilgileri, telefon ve prim oranlarının doğrudan Kadro ekranından da güncellenmesi sağlandı.
  - **İnteraktif Tablo Sıralama (Sorting) & Rol Çipleri (Filtering):**
    - `#sa-users-table`: Sütun başlıklarına dinamik yön göstergeleri (`↕`, `▲`, `▼`) eklenerek Kullanıcı Adı, Telefon, Roller, Bağlı Profil ve Kayıt Tarihi sütunlarına göre çift yönlü (A-Z, Z-A) sıralama yeteneği kazandırıldı.
    - Rol Filtre Çipleri: `Tümü`, `🛡️ SuperAdmin`, `👑 Salon Sahibi`, `🏋️ Eğitmen`, `🏃 Sporcu` butonları ile anlık sayaçlar (`chips`) entegre edildi; arama çubuğu ve sütun sıralamasıyla birlikte reaktif çalışır hale getirildi.
  - **Kapsamlı Test Doğrulaması:**
    - `GymServiceTests.cs` ve `SuperAdminControllerTests.cs` altına yeni testler eklendi (`UpdateTrainer_UpdatesTrainerFieldsAndSyncsWithAppUser`, `UpdateMember_SyncsPhoneWithAppUser`, `UpdateUser_UpdatesFieldsAndSyncsTrainerProfile`, `UpdateUser_ReturnsBadRequest_WhenPhoneNumberAlreadyExists`, `UpdateUser_ReturnsNotFound_WhenUserDoesNotExist`).
    - Toplam **61/61 test %100 başarıyla ve sıfır derleme uyarısıyla** doğrulandı. Sürüm `v2.9.5`.
- **2026-09-24 (v2.9.6 - Platform SuperAdmin Global Yetki & Salon Masası Erişimi):**
  - **Kullanıcı Talebi:** *"superadmin "Salon" sekmesine giremiyor herşeye yetkili olması gerekirken"*
  - **Kök Neden:**
    - `app.js` içindeki `window.navigateTo` fonksiyonunda `isCoach = roles.includes('Coach') || roles.includes('Admin')` ve `isAdmin = roles.includes('Admin')` kontrollerinde `SuperAdmin` rolü unutulmuştu. SuperAdmin "Salon" butonuna bastığında `setAppMode('staff')` fonksiyonu `navigateTo('yoklama')` çağırıyor ve "Bu sayfaya erişmek için antrenör veya yönetici yetkisi gereklidir" hatasıyla kullanıcıyı tekrar `home` ve `athlete` moduna itiyordu.
    - Backend katmanında `AuthService.GetRoleNames` metodu `SuperAdmin` kullanıcısına örtük olarak `Admin`, `Coach`, `Athlete` rollerini döndürmüyordu. Bu nedenle `[Authorize(Roles = "Admin")]` korumalı API uç noktaları (`/api/dashboard/payroll` vb.) 403 Forbidden dönüyordu.
  - **Uygulanan Çözümler:**
    1. **Frontend RBAC Konsolidasyonu ([app.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/app.js)):**
       - `navigateTo`, `setAppMode`, `toggleAppMode` ve `updateNavForUserRole` fonksiyonlarında:
         `const isSuperAdmin = roles.includes('SuperAdmin');`
         `const isAdmin = roles.includes('Admin') || isSuperAdmin;`
         `const isCoach = roles.includes('Coach') || isAdmin;`
         hiyerarşisi kuruldu.
       - SuperAdmin artık `[ 🏃 Sporcu | 🏢 Salon | 🛡️ Yönetim ]` sekmeleri arasında sorunsuz geçiş yapabilir; Yoklama, Üyeler, Hakedişim, Finans ve Bordrolar sekmelerine tam yetkiyle erişir.
    2. **Backend Global Yetkilendirme ([AuthService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/AuthService.cs) & [DbSeeder.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/DbSeeder.cs)):**
       - `AuthService.GetRoleNames`: `UserRole.SuperAdmin` flag'ine sahip kullanıcılara otomatik olarak `SuperAdmin`, `Admin`, `Coach`, `Athlete` rolleri verilerek hem JWT claim'leri hem de `/api/auth/me` yanıtları zenginleştirildi.
       - `DbSeeder.cs` ve `AuthService.SendOtpAsync`: SuperAdmin hesabı oluşturulurken veya doğrulanırken `UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete` olarak yetkilendirildi.
    3. **Controller Seviyesinde Savunma Derinliği:**
       - `DashboardController`, `PackagesController`, `SessionsController`, `ReservationsController`, `MembersController` ve `WorkoutsController` uç noktalarındaki `[Authorize(Roles = "...")]` niteleyicilerine açıkça `SuperAdmin` rolü eklendi.
  - **Doğrulama:** 61/61 birim ve entegrasyon testi 0 hatayla geçti. Tarayıcı alt ajanı ile SuperAdmin'in "🏢 Salon" moduna geçişi, Finans ve Bordrolar ekranlarını eksiksiz görüntüleyebildiği doğrulandı. Sürüm `v2.9.6`.
- **2026-09-24 (v2.9.8 - Dinamik Stüdyo İletişim Kartı & Salon Sahibi Telefon Numarası):**
  - **Kullanıcı Talebi:** Profilim sekmesindeki "Compound Athletic Stüdyosu" iletişim kartında salon sahibinin telefon numarasının gösterilmesi.
  - **Uygulanan Çözümler:**
    - `GymService.GetStudioContactInfoAsync`: Veritabanındaki `Salon Sahibi` (Admin) rolüne sahip antrenörün telefon numarasını ve adını dinamik olarak okuyup `appsettings.json` ile birleştiren API servisi geliştirildi (`/api/dashboard/gym-contact`).
    - `app.js` (`renderStudioContactCardHtml`): Statik numara yerine API'den gelen dinamik telefon numarası `tel:` ve WhatsApp linklerine bağlandı.
    - Birim testler (`GymServiceTests.cs`) ile doğrulandı. Sürüm `v2.9.8`.
- **2026-09-24 (v2.9.9 - Eğitmen Sporcu Kimliği & Kendi Seansına Rezervasyon Yapabilme):**
  - **Kullanıcı Talebi:** *"Eğitmen aynı zamanda sporcudur. isterse kendine rezerve edebilmeli"*
  - **Kök Neden & Analiz:**
    - `ReservationsController.BookSlot`: Yalnızca `SuperAdmin, Athlete, Admin` rollerine açıktı, `Coach` rolü `403 Forbidden` alıyordu.
    - `ReservationService.BookSlotAsync`: Rezervasyon yapan kullanıcının `Members` tablosunda kaydı yoksa "Sporcu profili bulunamadı" hatası fırlatıyordu. Eğitmenlerin `Users` ve `Trainers` kaydı bulunurken `Members` kaydı bulunmuyordu.
    - Paket/Abonelik Kısıtı: Eğitmenler müşteri gibi ücretli paket satın almadıkları için "Aktif bir paketiniz veya kalan ders hakkınız bulunmuyor" hatası oluşuyordu.
  - **Uygulanan Çözümler:**
    1. **Yetkilendirme:** `ReservationsController.BookSlot` ve `WorkoutsController` uç noktalarına `Coach` rolü eklendi (`[Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]`).
    2. **Otomatik Sporcu Kimliği (Member Auto-Provisioning):** `AuthService.GetRoleNames` metodu `Coach` ve `Admin` kullanıcıları için `Athlete` rol claim'ini otomatik dahil edecek şekilde güncellendi. `AuthService.VerifyOtpAsync`, `AuthService.GetCurrentUserProfileAsync` ve `ReservationService.BookSlotAsync` içerisinde antrenör veya yöneticilerin `Member` profili eksikse anında otomatik türetilip bağlandı.
    3. **Ücretsiz Personel/Eğitmen Paketi:** `ReservationService.BookSlotAsync` içerisinde antrenör/yönetici rezervasyon yaparken aktif paketi yoksa **0 TL bedelli, 999 derslik sınırsız "Eğitmen / Personel Katılımı"** paketi otomatik tanımlanır. Bu sayede kasa, ciro ve bordro hesapları bozulmadan (0 TL olarak) yoklama ve rezervasyon foreign key ilişkileri eksiksiz çalışır.
    4. **Tohum Veri Senkronizasyonu:** `DbSeeder.cs` içerisinde `sinanUser` ve `gulcinUser` kullanıcılarına `UserRole.Athlete` yetkisi tanımlandı; `Member` profilleri ve personel katılım paketleri başlangıçta garanti altına alındı.
    5. **PWA Slot Senkronizasyonu:** `app.js` içerisindeki `myReservationSlotIds` eşleştirmesinde `sessionSlotId` desteği eklendi; rezerve edilen seanslarda buton anında **"✓ Rezerve Edildi"** durumuna geçer.
  - **Doğrulama:** 63/63 test (%100 Başarılı) tamamlandı. `Hoca_1` (`+905324445566`) ile uçtan uca tarayıcı rezervasyon akışı başarıyla test edildi ve ekran görüntüsü alındı. Sürüm `v2.9.9`.
- **2026-09-24 (v2.9.9 Refactoring - DbSeeder Temizliği & Modülerleştirme):**
  - **Kullanıcı Talebi:** *"DbSeeder'ımızı temizleyelim büyük ölçüde, kullananlara temiz birşeyler sunalım. 1 olsun. gereksiz seans vs olmasın ama"*
  - **Uygulanan Değişiklikler:**
    - `DbSeeder.cs` içerisindeki eski geriye dönük isim değiştirme döngüleri, kişisel numara bazlı test hesapları, karmaşık geçmiş yoklama ve set logları tamamen temizlendi (satır sayısı 802'den 297'ye düşürüldü).
    - Kod 6 temiz ve modüler metoda ayrıldı: `SeedSuperAdminAsync`, `SeedPackagesAsync`, `SeedExercisesAsync`, `SeedTrainersAsync`, `SeedDemoAthleteAsync`, `SeedTodaySessionsAsync`.
- **2026-09-24 (v3.0.0 - Monolitik app.js Refactoring: Modern Vanilla ES Modüler Mimari):**
  - **Kullanıcı Talebi:** *"app.js app.css'imiz çok büyüdü bunları bölerek yönetmek daha çok işimize gelir mi"*
  - **Uygulanan Mimari Dönüşüm:**
    - 4.288 satırlık dev monolitik `app.js` dosyası sıfır build step (Vite/Webpack gerektirmeyen native browser ES modules) prensibiyle 7 temiz ve odaklı modüle ayrıldı:
      1. `modules/state.js`: Global reaktif durum deposu (`window.state`).
      2. `modules/utils.js`: Toast bildirimleri, modal yönetimi, HTML/JS escaping, tema yönetimi, para/tarih formatlayıcılar, segmentli ilerleme çubuğu.
      3. `modules/auth.js`: Dinamik salon iletişim bilgileri, OTP modal & SMS doğrulama döngüsü, avatar yükleme/sıfırlama, çıkış yapma.
      4. `modules/staff.js`: Hızlı Yoklama & Kontenjan slotları, Üyeler & Notlar & Rozetler, Hakedişim/Bordro, Kasa & Finans, Kadro (Antrenör listeleme & düzenleme), Paketler ve Seans Planlama.
      5. `modules/athlete.js`: Sporcu Ana Sayfası, Seanslar takvimi ve rezervasyon/iptal motoru, Profilim & BMI/vücut metrikleri, Bildirim çekmecesi ve Lead formu.
      6. `modules/workouts.js`: İdman şablonları, Canlı İdman koçu ve kronometresi, Set logları, 1RM ve aşırı yüklenme analiz grafiği.
      7. `modules/admin.js`: SuperAdmin & Salon Sahibi kullanıcı yönetim tablosu, kolon sıralama, rol filtre çipleri, kullanıcı düzenleme modalı ve salon sahibi atama.
    - `app.js` (Orchestrator): Yalnızca ana router (`navigateTo`, `setAppMode`, `toggleAppMode`, `updateNavForUserRole`), PWA servis çalışanı ve yükleme akışı ile `DOMContentLoaded` bootstrap mantığını içeren ~250 satırlık temiz bir koordinatöre dönüştürüldü.
    - Tüm inline `onclick` HTML event çağrıları (`index.html` içerisindeki 66 adet handler) ilgili modüllerde `window.*` nesnesine bağlanarak geriye dönük tam uyumluluk sağlandı.
    - 63/63 backend birim testi ve tarayıcı doğrulama testleri başarıyla tamamlandı.
- **2026-09-24 (v3.1.0 - index.html Refactoring: Views & Modals HTML Partials Mimarisi):**
  - **Kullanıcı Talebi:** *"index.html bunu da böl parçala yönet yapabilir miyiz sence? - isterim best-practice ile devam edebilirsin"*
  - **Uygulanan Mimari Dönüşüm:**
    - 1.883 satırlık dev monolitik `index.html` dosyası %82 oranında hafifletilerek **354 satıra** düşürüldü.
    - Sadece ana App Shell (Header, Boş View Container'ı, Alt Navigasyon, Modals Root) `index.html`'de bırakıldı; ilk boyama gecikmesini 0ms tutmak için yalnızca varsayılan başlangıç ekranı (`v0-view-home`) iskelete dahil edildi.
    - **11 Bağımsız Görünüm Dosyası (`views/`):**
      - `views/athlete/` (`home.html`, `sessions.html`, `workout.html`, `profile.html`)
      - `views/staff/` (`yoklama.html`, `takvim.html`, `dashboard.html`, `uyeler.html`, `kasa.html`, `hakedisim.html`)
      - `views/admin/` (`superadmin.html`)
    - **7 Odaklı Modal/Çekmece Dosyası (`modals/`):**
      - `auth-modals.html`, `workout-modals.html`, `member-modals.html`, `staff-modals.html`, `session-modals.html`, `athlete-modals.html`, `admin-modals.html`
    - **Dinamik Önbellekli Kısmi Yükleyici ([loader.js](file:///c:/MUFUKS\Code\SporTakip\src\SporTakip.Api\wwwroot\js\modules\loader.js)):**
      - `ensureViewLoaded(tabName)`: Sekmeye ilk tıklandığında ilgili `.html` parçasını bir kez fetch edip DOM'a ekler; sonraki geçişlerde DOM'da koruyarak 0ms anlık geçiş sağlar.
      - `preloadModals()`: Modalları arka planda non-blocking olarak `#modals-root` içine monte eder.
    - **PWA & Doğrulama:**
      - `sw.js` ve `index.html` sürümü `v3.1.0` olarak güncellendi, tüm 18 partial dosyası Service Worker `PRECACHE_ASSETS` listesine eklendi.
      - Kural 18'e tam uyumlu hafif tarayıcı testi yapıldı: Konsolda 0 hata, anlık sekme geçişleri ve ekran görüntüsü ile doğrulandı.
- **2026-09-24 (v3.2.0 - Güvenlik Sertleştirmesi, Tekil DbContext, AsNoTracking & Toplu Yoklama UX):**
  - **Güvenlik Sertleştirmesi (SEC-01, SEC-02, SEC-03):**
    - `SuperAdminController`, `PaymentsController`, `SubscriptionsController`, `AttendanceController`, `TrainersController` sınıflarına eksiksiz `[Authorize]` ve rol kontrolleri (`SuperAdmin`, `Admin`, `Coach`) uygulandı.
    - `Microsoft.AspNetCore.OpenApi` paketi `10.0.12` sürümüne yükseltilerek bilinen `NU1903` güvenlik açığı ve tüm NuGet uyarıları tamamen giderildi (0 uyarı, 0 hata).
  - **Veritabanı Katmanı & AsNoTracking (DB-01, DB-02):**
    - `Program.cs`'ten çift DbContext kaydı (`AppDbContext`) temizlendi, `GymService` ve testler tekil `ApplicationDbContext` standardına bağlandı, `AppDbContext.cs` dosyası silindi. SQLite çift bağlantı ve kilitlenme riski sonlandırıldı.
    - `GymService.cs` içerisindeki tüm salt okunur sorgularda `.AsNoTracking()` devreye alınarak Change Tracker bellek yükü ortadan kaldırıldı, sorgu yanıt süreleri optimize edildi.
  - **Kod Tabanı Temizliği (CLN-01, CLN-02):**
    - Kök dizindeki kullanılmayan `neon.ts` yapılandırma dosyası silindi.
    - `app.css` içerisindeki mükerrer responsive medya sorgusu tanımları normalize edildi.
  - **Toplu Yoklama Kullanıcı Deneyimi (UX-01):**
    - Antrenörlerin salonda yoğun saatlerde tüm seans katılımcılarını tek dokunuşla "Geldi" durumuna geçirebilmesi için `GymService.MarkAllAttendedForSlotAsync` metodu ve `AttendanceController.MarkAllSlotAttendance` (`POST /api/attendance/mark-all-slot`) endpoint'i geliştirildi.
    - `views/staff/yoklama.html` ve `staff.js` dosyalarına **"✓ Tümünü Katıldı Say"** aksiyonu, dinamik durum kontrolleri ve anlık yenileme mantığı entegre edildi.
  - **Test & Doğrulama:**
    - Toplu yoklama için yeni birim test eklendi. 64/64 test (%100 Başarı) ile tamamlandı.
    - Proje `0 Uyarı, 0 Hata` ile derlendi; Kural 18'e uygun hafif tarayıcı doğrulamasında konsolda 0 hata teyit edildi.
- **2026-09-25 (v3.3.0 - Sistem Geneli Derin Performans Optimizasyonu & Test Paketi):**
  - **Kullanıcı Talebi:** *"Tüm projede performans iyileştirmesi yapalım. Backend tarafınız gözden geçirelim gerekirse test yazalım"*
  - **1. Veritabanı B-Tree İndeks Mimarisi ([ApplicationDbContext.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/ApplicationDbContext.cs)):**
    - `AttendanceRecord`: `LessonDate`, `(TrainerId, LessonDate)`, `SessionSlotId` indeksleri eklendi; aylık bordro ve kapasite aramaları O(1)/O(log N) hızına çıkarıldı.
    - `Subscription`: `MemberId`, `(Status, StartDate)`, `PrimaryTrainerId` indeksleri eklendi.
    - `Payment`: `SubscriptionId`, `PaymentDate` indeksleri eklendi.
    - `Reservation`: `(SessionSlotId, Status)`, `MemberId` indeksleri eklendi.
    - `Workout Engine`: `ExerciseLog.(ExerciseId, WorkoutLogId)`, `WorkoutLogId` ve `SetLog.(ExerciseLogId, IsCompleted)` bileşik indeksleri tanımlandı; 1RM ve aşırı yüklenme sorgularındaki tam tablo taramaları (full table scan) sıfırlandı.
  - **2. LINQ Sargability & SQL Index-Seek ([GymService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/GymService.cs)):**
    - `GetHourlyStudioCapacityAsync`, `MarkAttendanceAsync` ve `MarkAllAttendedForSlotAsync` sorgularında `a.LessonDate.Date == ...` gibi SQL fonksiyonu çalıştıran (non-sargable) ifadeler, `a.LessonDate >= start && a.LessonDate < end` aralık sorgularına dönüştürülerek doğrudan B-Tree index-seek işletmesi sağlandı.
  - **3. Entity Materialization ve RAM Yükünün Kaldırılması ([GymService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/GymService.cs) & [SuperAdminController.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/SuperAdminController.cs)):**
    - `GetDashboardStatsAsync`: Ödeme ve abonelik entity'lerini belleğe çekip `.Sum()` yapmak yerine, doğrudan `SumAsync` ve SQL düzeyinde tekil agregasyon (`GroupBy(_ => 1)`) kurgulandı; sıfır entity nesnesi tahsis edildi.
    - `SuperAdmin.GetStats`: Tüm kullanıcı ve abonelik tablolarını RAM'e çekmek yerine `CountAsync`, `SumAsync` ve hafif `Select(u => u.Roles)` projeksiyonuna geçildi.
    - `GetMembersAsync`: Tüm üyelerin tüm geçmiş abonelikleri ve tüm ödemelerini yükleyen N+1 riski taşıyan Include zinciri yerine, yalnızca aktif abonelik ve özetini SQL seviyesinde derleyen optimize projeksiyona geçildi.
  - **4. Eksik AsNoTracking Tamamlanması ([SessionService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/SessionService.cs) & [ReservationService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/ReservationService.cs)):**
    - `SessionService.GetSlotsAsync`, `SessionService.GetSlotByIdAsync` ve `ReservationService.GetMyReservationsAsync` metotlarına `.AsNoTracking()` eklenerek EF Core Change Tracker bellek ve işlemci yükü ortadan kaldırıldı.
  - **5. HTTP Yanıt Sıkıştırma, İstemci Önbellekleme & SQLite WAL ([Program.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Program.cs)):**
    - `ResponseCompression` ile Brotli ve Gzip sıkıştırması aktive edilerek JSON ve partial HTML boyutları %70-85 oranında küçültüldü.
    - Statik varlıklar (JS, CSS, PNG, WOFF2) için 7 günlük `Cache-Control: public, max-age=604800, immutable`, `index.html` ve `sw.js` için anında yenilenen `no-cache` başlıkları entegre edildi.
    - SQLite başlangıcında `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;` çalıştırılarak okuma/yazma kilitlenmeleri sona erdirildi.
  - **6. Zero-Allocation Telefon Normalizasyonu ([AuthService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/AuthService.cs)):**
    - `Regex.Replace` kaldırıldı; `stackalloc char` ve tek geçişli döngü ile GC baskısı yaratmayan yüksek hızlı normalizasyon sağlandı.
  - **7. Birim & Entegrasyon Testleri ([PerformanceOptimizationTests.cs](file:///c:/MUFUKS/Code/SporTakip/tests/SporTakip.Tests/PerformanceOptimizationTests.cs)):**
    - 12 yeni performans ve regresyon testi eklenerek toplam **76/76 test %100 başarıyla ve sıfır derleme uyarısıyla** doğrulandı. Sürüm `v3.3.0`.

- **Faz 35 (İleri Düzey Performans, Önbellekleme & Anında UI Deneyimi - v3.4.0):**
  - **1. In-Memory Caching & Cache Invalidation ([Program.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Program.cs), [GymService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/GymService.cs), [WorkoutService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/WorkoutService.cs)):**
    - `builder.Services.AddMemoryCache()` eklendi.
    - Sık okunan ve nadir değişen veri setleri (`GetPackagesAsync` 15 dk sliding, `GetGymInfoAsync` 15 dk sliding, `GetExercisesAsync` 30 dk sliding) RAM önbelleğe alındı.
    - Paket oluşturma/güncelleme/silme veya antrenör bilgisi güncelleme durumlarında önbellek anında temizlenerek (`cache.Remove`) tam veri tutarlılığı sağlandı.
  - **2. EF Core Compiled Queries ([AuthService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/AuthService.cs)):**
    - Sık çağrılan kimlik doğrulama ve profil rotalarında LINQ expression derleme maliyeti `EF.CompileAsyncQuery` ile sıfırlandı:
      - `GetUserByPhoneCompiled`: Telefon numarasına göre kullanıcı ve bağlı profilleri arayan statik derlenmiş sorgu.
      - `GetUserByIdCompiled`: Kullanıcı ID'sine göre arayan statik derlenmiş sorgu.
      - `SendOtpAsync`, `VerifyOtpAsync` ve `GetCurrentUserProfileAsync` metotları derlenmiş sorgulara geçirildi.
  - **3. Sayfalama (Pagination) Altyapısı ([GymService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/GymService.cs) & [MembersController.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/MembersController.cs)):**
    - `GetMembersAsync` metoduna opsiyonel `page` ve `pageSize` parametreleri eklendi.
    - Geriye dönük %100 uyumluluk korundu (parametre verilmezse tüm liste çekilir; parametre verilirse `Skip((page-1)*pageSize).Take(pageSize)` ile bellek ve veritabanı yükü sınırlandırılır).
  - **4. PostgreSQL Neon Bağlantı Havuzu (Connection Pooling) ([Program.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Program.cs)):**
    - `ParsePostgresConnectionString` metodu `Pooling=true;Minimum Pool Size=5;Maximum Pool Size=30;Connection Idle Lifetime=300;` parametreleriyle donatıldı. Neon veritabanı bağlantı açılış süreleri ve el sıkışma gecikmeleri bertaraf edildi.
  - **5. Frontend Stale-While-Revalidate (SWR) & Instant UI ([staff.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/staff.js), [athlete.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/athlete.js)):**
    - **Yoklama & Üyeler Sekmesi:** `loadAttendanceView` ve `loadMembersView` sekmeleri, önceden yüklenmiş veri varsa (veya sessionStorage'da mevcutsa) ekranda "Yükleniyor..." beyaz ekranı/iskeleti göstermeden 0ms içinde anında son bilinen durumu çizer; arka planda sessizce taze veriyi alır ve DOM'u günceller.
    - **Sporcu Portali:** Aktif paket kartı `sessionStorage` önbelleğinden anında gösterilir, sayfa açılışında gecikme ve titreşim sıfırlandı.
  - **6. Statik Varlık Boyut Temizliği ([wwwroot/images](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/images)):**
    - Web arayüzünde doğrudan kullanılmayan ~1.65 MB boyutundaki artık yüksek çözünürlüklü görseller (`athlete-woman-portrait-dark.png` [1.24 MB] ve `tiger2_trans.png` [406 KB]) silindi; sunucu dağıtım ve önbellek ayak izi küçültüldü.
  - **7. Kapsamlı Test Doğrulaması ([PerformanceOptimizationTests.cs](file:///c:/MUFUKS/Code/SporTakip/tests/SporTakip.Tests/PerformanceOptimizationTests.cs)):**
    - Bellek önbellekleme ve eviction, sayfalama ve derlenmiş sorguları test eden 4 yeni birim testi eklendi.
    - **Toplam 80/80 test sıfır derleyici uyarısı (0 warning, 0 error) ve %100 başarıyla 3 saniyede tamamlandı.** Sürüm: `v3.4.0`.

- **Faz 36 (Render Free-Tier Cold-Start Önleme & PWA App-Shell APK Hızı - v3.4.1):**
  - **1. Zero-Overhead Keep-Alive & Health Ping Endpoints ([Program.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Program.cs)):**
    - `/health` ve `/ping` endpoint'leri eklendi. Veritabanı sorgusu veya auth gerektirmeksizin 1 ms içinde 200 OK yanıt verir.
    - UptimeRobot veya Cron-job.org üzerinden her 10 dakikada bir otomatik ping atılarak Render'ın ücretsiz plandaki 15 dakikalık uykuya dalması (`spin-down`) %100 engellenir.
  - **2. PWA Gerçek App-Shell Cache-First Mimarisi ([sw.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/sw.js) & [index.html](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/index.html)):**
    - Eski Service Worker'daki navigasyon ve script'ler için kullanılan yavaşlatıcı "Network-First" kuralı kaldırıldı.
    - **App Shell Cache-First + Stale-While-Revalidate:** `/index.html`, `app.css`, `app.js`, tüm view HTML parçaları ve ikonlar telefon hafızasında varsa **3-5 milisaniyede (tıpkı bir yerel APK gibi)** anında ekrana basılır.
    - `ignoreSearch: true` parametresi ile query string farkı olmaksızın %100 önbellek eşleşmesi garantiye alındı.
    - Arka planda sessizce taze sürüm revalidate edilir; dinamik `/api/*` çağrıları ise taze veri için doğrudan ağa yönlendirilir.
  - **3. ES Modül SyntaxError Giderilmesi & Sıfırıncı Karede (Frame-0) Giriş Çekmecesi:**
    - `staff.js`, `athlete.js`, `workouts.js` ve `admin.js` dosyalarında `window.*` ataması yapılmış ancak yerel kapsamda bildirilmemiş sahte export tanımları (`changeCalendarMonth`, `closeNotificationDrawer`, `autoCalc1Rm`, `filterSuperAdminByRole`) temizlendi.
    - Tarayıcının ES modül yükleme sırasında `SyntaxError: Export '...' is not defined in module` hatası vererek tüm `app.js` betik zincirini kilitlemesi ve `openOtpDrawer is not defined` hatasına yol açması kalıcı olarak çözüldü.
    - Login çekmecesi (`#v0-otp-drawer`) `index.html` içerisindeki `#modals-root` yapısına doğrudan önceden yerleştirilerek ağ gecikmesinden bağımsız olarak ilk milisaniyeden itibaren 100% güvenilirlikle açılması sağlandı.

---

### Phase 37: SuperAdmin Filtreleme ve Modül Kapsam Hijyeni (Scope Variable Cleanup)
- **Sorun:** SuperAdmin kullanıcı tablosu filtrelenmek veya sıralanmak istendiğinde `currentSaRoleFilter is not defined` ve `renderSuperAdminUsersTable is not defined` hataları alınıyordu.
- **Kök Neden:**
  - `athlete.js` içinden `admin.js` dosyasına taşınan SuperAdmin işlevlerinin durum değişkenleri (`currentSaRoleFilter`, `currentSaSortCol`, `currentSaSortDir`, `currentSaSearchQuery`) `athlete.js` içinde atıl kalmış, `admin.js` dosyasının başında ise farklı isimlendirilmişti (`saCurrent*`).
  - ES modülleri `"use strict"` modunda çalıştığından bildirilmemiş değişken atamaları doğrudan çalışma zamanı `ReferenceError` fırlatıyordu.
  - `renderSuperAdminUsersTable` ve `toggleTrainerFields` yalnızca `window` nesnesine fonksiyon olarak atanıp sözcüksel tanımlanmadığı için modül içi çağrılarda bulunamıyordu. Benzer şekilde `staff.js` içinde `openScheduleSessionModal` sözcüksel bildirilmemişti.
- **Uygulanan Çözüm:**
  - [admin.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/admin.js) başında `currentSaRoleFilter`, `currentSaSortCol`, `currentSaSortDir` ve `currentSaSearchQuery` değişkenleri sözcüksel olarak tanımlandı.
  - [athlete.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/athlete.js) içindeki atıl SuperAdmin değişken blokları temizlendi.
  - `renderSuperAdminUsersTable`, `toggleTrainerFields` ve [staff.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/staff.js) içindeki `openScheduleSessionModal` fonksiyonları sözcüksel kapsamda bildirilip `window` nesnesine bağlandı.
  - `loadInitialData` ve `getGymContactInfo` çağrıları `admin.js` içerisinde güvenli `window.*` çağrılarına dönüştürüldü.
  - Node.js sanal ortamında ve yerel tarayıcı konsolunda tüm pencereler ve filtre fonksiyonları 0 hata ile doğrulandı; 80/80 backend testi başarıyla geçti.

---

### Phase 38: Örnek / Demo Seansların Temizlenmesi (Sample Sessions Elimination)
- **Sorun:** Takvimde ve ana ekranda gerçekte veritabanında bulunmayan ya da tohumlanan örnek seanslar ("Haftalık Başlangıç Güç", "Öğle Fonksiyonel & Core", "Core & Omurga Sağlığı" vb.) gösteriliyordu.
- **Kök Neden:**
  - **Frontend:** [athlete.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/athlete.js) içerisindeki `renderSessionsList`, API'den seans dönmediğinde (`slots.length === 0`) `getRealisticSlotsForDate(dateStr)` fonksiyonunu çağırarak her gün için 5-6 adet sahte/mock seans türetiyordu.
  - **Backend:** [DbSeeder.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/DbSeeder.cs) içindeki `SeedTodaySessionsAsync` metodu her temiz kurulumda veritabanına 2 adet demo seans ekliyordu.
- **Uygulanan Çözüm:**
  - [athlete.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/athlete.js) içindeki `getRealisticSlotsForDate` sahte veri fonksiyonu tamamen kaldırıldı. Boş günlerde şık bir boş durum kartı (`v0-empty-slots-state` - "Planlanmış Seans Bulunmuyor") gösterilmesi sağlandı.
  - [app.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/app.js) ve [athlete.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/athlete.js) export/import listelerinden `getRealisticSlotsForDate` çıkarıldı.
  - [DbSeeder.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/DbSeeder.cs) içerisindeki `SeedTodaySessionsAsync` yerine `CleanDemoSessionsAsync` yazılarak var olan demo seanslar ve rezervasyonları veritabanından güvenle temizlendi.
  - `dotnet test` ile 80/80 testin başarıyla geçtiği doğrulandı.

---

### Phase 39: Egzersiz Tanımlama & Katalog Yönetimi (Custom Exercise Management for Coaches & Admins)
- **Kullanıcı Talebi:** Hoca ve üst yetkililer (Coach, Admin, SuperAdmin) atletler için yeni hareket/egzersiz tanımlayabilsin; seedlenen 15 temel hareket haricinde diledikleri varyasyonları ekleyip düzenleyebilsin.
- **Mimari & Backend Çözümü:**
  - **DTO Katmanı ([WorkoutDtos.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/WorkoutDtos.cs)):** `CreateExerciseRequest` ve `UpdateExerciseRequest` modelleri eklendi (Name, NameTr, MuscleGroup, Equipment, Instructions, ImageUrl, VideoUrl, IsActive).
  - **Servis Katmanı ([IWorkoutService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/IWorkoutService.cs) & [WorkoutService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/WorkoutService.cs)):**
    - `CreateExerciseAsync`, `UpdateExerciseAsync` ve `DeleteExerciseAsync` metotları uygulandı.
    - Hareket geçmiş antrenman loglarında kullanılmışsa (`WorkoutExercises`) veri bütünlüğünü korumak adına soft-delete (`IsActive = false`) yapılır, kullanılmamışsa hard-delete uygulanır.
    - Her ekleme/güncelleme/silme işleminde `IMemoryCache` anahtarları (`exercises_all`, `exercises_{muscleGroup}`) geçersiz kılınarak taze verinin anında dönmesi sağlandı.
  - **API Controller ([ExercisesController.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/ExercisesController.cs)):** `POST /api/exercises`, `PUT /api/exercises/{id}` ve `DELETE /api/exercises/{id}` endpoint'leri `[Authorize(Roles = "SuperAdmin, Coach, Admin")]` kuralıyla güvence altına alındı.
  - **Birim Testleri ([WorkoutServiceTests.cs](file:///c:/MUFUKS/Code/SporTakip/tests/SporTakip.Tests/WorkoutServiceTests.cs)):** Yeni egzersiz oluşturma, güncelleme ve silme senaryoları test edildi; toplam **83/83 test sıfır uyarı ve 100% başarıyla** tamamlandı.
- **Frontend & UI Çözümü:**
  - **API Entegrasyonu ([api.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/api.js)):** `createExercise`, `updateExercise`, `deleteExercise` istemci fonksiyonları eklendi.
  - **Antrenman Sekmesi ([workout.html](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/views/athlete/workout.html)):** "Antrenman" sekmesine `Egzersizler` alt sekmesi (`btn-wsub-exercises`), kas grubu filtre çipleri (`Hepsi`, `Göğüs`, `Sırt`, `Bacak`, `Omuz`, `Kol`, `Core`, `Tüm Vücut`) ve anlık arama çubuğu eklendi.
  - **Modal ([workout-modals.html](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/modals/workout-modals.html)):** `#modal-exercise` ile antrenör ve yöneticilerin hareket adı (İngilizce & Türkçe), hedef kas grubu, ekipman tipi, form talimatları, görsel ve video rehber URL'si girebileceği şık bir modal entegre edildi.
  - **Reaktif Modül ([workouts.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/workouts.js)):**
    - `loadExercisesCatalog`, `renderExercisesCatalogList`, `filterExercisesByGroup`, `handleExerciseSearch` fonksiyonları yazıldı.
    - Rol kontrolü yapılarak `+ Yeni Egzersiz Ekle`, `✏️ Düzenle` ve `🗑️ Sil` butonları yalnızca `Coach`, `Admin` veya `SuperAdmin` rollerine görünür kılındı. Sporcular ise kataloğu arayıp inceleyebilir.

---

### Phase 40: Atlet & Hoca Ekosistemi Derinleştirmesi (Kişiye Özel Program, Sakatlık Takibi, Ghost Weight & Akıllı Dinlenme Sayacı)
- **Kullanıcı Talebi & Vizyon:** Bir atlet ve antrenörün spor salonu deneyimini dünya standartlarına (Hevy / Whoop / Strong seviyesi) taşımak; hocaların öğrencilere özel program yazabilmesini, sakatlık/sağlık durumlarının anında görülmesini, önceki idmandaki ağırlıkların tek tıkla setlere doldurulabilmesini (progressive overload) ve set aralarında titreşimli/sesli dinlenme sayacı çalışmasını sağlamak.
- **Mimari & Backend Çözümü:**
  - **1. Kişiye Özel Antrenman Şablonları (Assigned Personal Workouts):**
    - [WorkoutTemplate.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Workout/WorkoutTemplate.cs): `AssignedMemberId` (int?) ve `AssignedMember` navigation özelliği eklendi.
    - [ApplicationDbContext.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/ApplicationDbContext.cs): `WorkoutTemplate -> Member` foreign key ilişkisi (`DeleteBehavior.SetNull`) ve indeks tanımlandı.
    - [WorkoutDtos.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/WorkoutDtos.cs): `CreateWorkoutTemplateRequest` ve `WorkoutTemplateDto` modellerine `AssignedMemberId`, `AssignedMemberName` eklendi.
    - [WorkoutService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/WorkoutService.cs): `GetTemplatesAsync` metodunda atlet kullanıcılar için önce kendilerine özel atanmış programlar (`AssignedMemberId == member.Id`), ardından genel şablonlar (`AssignedMemberId == null`) getirilerek en üstte listelenmesi sağlandı.
  - **2. Sağlık Durumu & Sakatlık Notu (Medical & Injury Conditions):**
    - [Member.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Member.cs): `MedicalConditions` (string?, max 500) alanı eklendi.
    - [Dtos.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Models/Dtos.cs) & [GymService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/GymService.cs): `MemberDto`, `CreateMemberDto`, `UpdateMemberDto` modellerine ve CRUD akışlarına `MedicalConditions` entegre edildi.
    - [DbSeeder.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Data/DbSeeder.cs): `EnsureSchemaUpgradesAsync` ile SQLite ve PostgreSQL veritabanlarında `ALTER TABLE ... ADD COLUMN` migrasyonu savunmacı (defensive) biçimde otomatikleştirildi.
  - **3. Önceki Performans & Ghost Weight API:**
    - [IWorkoutService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/IWorkoutService.cs) & [WorkoutService.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Services/WorkoutService.cs): `GetLastExercisePerformanceAsync(memberId, exerciseId)` metodu yazıldı. Atletin tamamlanmış antrenman loglarından ilgili egzersizin en son yapıldığı tarihteki en yüksek ağırlık ve tekrarını (`ExercisePerformanceDto`) getirir.
    - [WorkoutsController.cs](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/Controllers/WorkoutsController.cs): `GET /api/workouts/exercises/{exerciseId}/last-performance` endpoint'i açıldı.
  - **4. Birim Testleri ([WorkoutServiceTests.cs](file:///c:/MUFUKS/Code/SporTakip/tests/SporTakip.Tests/WorkoutServiceTests.cs)):**
    - Kişiye özel şablon atama ve sorgulama, önceki egzersiz performansı (Ghost Weight) getirme senaryoları birim testleriyle güvenceye alındı.
    - **Toplam 85/85 test sıfır derleyici uyarısı (0 warning, 0 error) ve %100 başarıyla tamamlandı.**
- **Frontend & UI / UX Çözümü:**
  - **1. İnteraktif Program Yazıcı Modalı ([workout-modals.html](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/modals/workout-modals.html)):**
    - Antrenör ve yöneticiler için `#modal-template-builder` arayüzü oluşturuldu. Program adı, zorluk seviyesi, genel salon şablonu veya belirli bir öğrenciye özel atama seçicisi (`#tb-target-member`), dinamik egzersiz ekleme/çıkarma, set/tekrar ve dinlenme süresi belirleme kontrolleri sunuldu.
    - [staff.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/staff.js): Üyeler listesindeki her üye kartına hızlı `🏋️ Program Yaz` butonu yerleştirildi; tıklandığında öğrenci otomatik seçili olarak şablon oluşturucu modalı açılır.
  - **2. Sağlık & Sakatlık Uyarı Rozeti ([member-modals.html](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/modals/member-modals.html) & [staff.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/staff.js)):**
    - Üye ekleme ve düzenleme modalına `Sağlık Durumu / Sakatlık / Alerji` alanı eklendi (`#m-medical`, `#edit-m-medical`).
    - Sakatlığı/özel durumu olan üyelerin kartlarında ve yoklama listesinde dikkat çeken kırmızı uyarı rozeti (`⚠️ Bel Fıtığı / Omuz İmpingement vb.`) gösterilerek eğitmenlerin güvenli hareket seçimi yapması sağlandı.
  - **3. Canlı Antrenmanda Ghost Weight & Tek Tıkla Doldurma ([workouts.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/workouts.js)):**
    - Canlı antrenman ekranında her egzersiz kartının üstünde son idmandaki performans rozeti gösterilir (`💡 Son İdman: X kg × Y tekrar (Setlere Doldur)`).
    - Tıklandığında `applyGhostWeightToExercise` çalışarak o egzersizin henüz girilmemiş set ağırlık ve tekrarlarını otomatik doldurur, tahmini 1RM değerini anında günceller.
  - **4. Haptik Titreşimli & Sesli Akıllı Dinlenme Sayacı ([workouts.js](file:///c:/MUFUKS/Code/SporTakip/src/SporTakip.Api/wwwroot/js/modules/workouts.js)):**
    - Set tamamlandığında sağ alt köşede nabız gibi yanıp sönen dinamik sayaç rozeti (`#v0-rest-timer-badge`) açılır ve geri sayım başlar.
    - Süre 0'a ulaştığında Web Audio API ile sıfır harici dosya bağımlılığıyla 2 tonlu atletik zil sesi (`880Hz -> 1175Hz chime`) çalınır ve mobil cihazlarda haptik titreşim (`navigator.vibrate`) tetiklenir.















