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

