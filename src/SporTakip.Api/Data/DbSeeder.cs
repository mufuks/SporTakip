using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;
using SporTakip.Api.Models.Workout;

namespace SporTakip.Api.Data;

/// <summary>
/// Veritabanı başlangıç tohumlayıcısı (Minimal & Temiz Kurulum).
/// Sistem yöneticisi, salon kadrosu, egzersiz kataloğu ve 1 adet örnek sporcu oluşturur.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(ApplicationDbContext db, IConfiguration? configuration = null)
    {
        await db.Database.EnsureCreatedAsync();

        // 1. Platform SuperAdmin
        await SeedSuperAdminAsync(db, configuration);

        // 2. Paketler (Standart Paketler + Eğitmen/Personel Katılımı)
        await SeedPackagesAsync(db);

        // 3. Egzersiz Kataloğu (15 Temel Egzersiz)
        await SeedExercisesAsync(db);

        // 4. Kadro (Salon Sahibi ve Eğitmen)
        await SeedTrainersAsync(db);

        // 5. Tek Örnek Sporcu (Atlet_1)
        await SeedDemoAthleteAsync(db);

        // 6. Örnek Seansları Temizle
        await CleanDemoSessionsAsync(db);
    }

    // ── 1. SuperAdmin ────────────────────────────────────────────────────────────
    private static async Task SeedSuperAdminAsync(ApplicationDbContext db, IConfiguration? configuration)
    {
        var phone = configuration?["SuperAdmin:Phone"] ?? "+905550000000";
        var name = configuration?["SuperAdmin:FullName"] ?? "Platform Yöneticisi";

        var superAdmin = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == phone);
        if (superAdmin == null)
        {
            superAdmin = new AppUser
            {
                PhoneNumber = phone,
                FullName = name,
                Roles = UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.Add(superAdmin);
            await db.SaveChangesAsync();
        }
        else if (!superAdmin.Roles.HasFlag(UserRole.SuperAdmin))
        {
            superAdmin.Roles |= (UserRole.SuperAdmin | UserRole.Admin | UserRole.Coach | UserRole.Athlete);
            await db.SaveChangesAsync();
        }
    }

    // ── 2. Paketler ──────────────────────────────────────────────────────────────
    private static async Task SeedPackagesAsync(ApplicationDbContext db)
    {
        if (!await db.Packages.AnyAsync())
        {
            db.Packages.AddRange(
                new Package { Name = "Grup 8 Ders", PackageType = "GRUP", LessonCount = 8, DefaultPrice = 3000m, ValidityDays = 35, IsActive = true },
                new Package { Name = "Grup 12 Ders", PackageType = "GRUP", LessonCount = 12, DefaultPrice = 3500m, ValidityDays = 45, IsActive = true },
                new Package { Name = "Bireysel (Özel Ders / PT)", PackageType = "PT", LessonCount = 10, DefaultPrice = 12000m, ValidityDays = 45, IsActive = true }
            );
            await db.SaveChangesAsync();
        }

        // Eğitmen / Personel Katılım Paketi (0 TL, 999 ders)
        var staffPackage = await db.Packages.FirstOrDefaultAsync(p => p.PackageType == "STAFF" || p.Name == "Eğitmen / Personel Katılımı");
        if (staffPackage == null)
        {
            db.Packages.Add(new Package
            {
                Name = "Eğitmen / Personel Katılımı",
                PackageType = "STAFF",
                LessonCount = 999,
                DefaultPrice = 0m,
                ValidityDays = 3650,
                IsActive = true
            });
            await db.SaveChangesAsync();
        }
    }

    // ── 3. Egzersiz Kataloğu ─────────────────────────────────────────────────────
    private static async Task SeedExercisesAsync(ApplicationDbContext db)
    {
        if (await db.Exercises.AnyAsync()) return;

        db.Exercises.AddRange(
            new Exercise { Name = "Barbell Squat", NameTr = "Barbell Squat (Çömelme)", MuscleGroup = "Legs", Equipment = "Barbell", Instructions = "Barı trapezlere yerleştirin, göğsü dik tutarak kalçayı diz hizasına kadar indirin ve topuklardan iterek kalkın." },
            new Exercise { Name = "Barbell Deadlift", NameTr = "Barbell Deadlift (Yerden Kaldırma)", MuscleGroup = "Back", Equipment = "Barbell", Instructions = "Ayaklar omuz genişliğinde, sırt düz, kalçayı geriye iterek barı bacaklara yakın şekilde yukarı çekin." },
            new Exercise { Name = "Barbell Bench Press", NameTr = "Barbell Bench Press (Yatarak Göğüs İtiş)", MuscleGroup = "Chest", Equipment = "Barbell", Instructions = "Düz sehpaya uzanın, omuz bıçaklarını sıkıştırın, barı göğüs ortasına kontrollü indirip yukarı itin." },
            new Exercise { Name = "Pull-Up", NameTr = "Barfiks (Geniş Tutuş)", MuscleGroup = "Back", Equipment = "Bodyweight", Instructions = "Barı omuzdan geniş tutun, göğsü bara yaklaştıracak şekilde çekin ve kontrollü inin." },
            new Exercise { Name = "Push-Up", NameTr = "Şınav", MuscleGroup = "Chest", Equipment = "Bodyweight", Instructions = "Vücut düz bir çizgi halinde, dirsekleri 45 derece açıyla kırarak göğsü yere yaklaştırın ve itin." },
            new Exercise { Name = "Dumbbell Overhead Press", NameTr = "Dumbbell Omuz Presi", MuscleGroup = "Shoulders", Equipment = "Dumbbell", Instructions = "Dumbbell'ları omuz hizasında tutun, merkez bölgeyi sıkarak baş üstüne doğru kontrollü itin." },
            new Exercise { Name = "Barbell Bent-Over Row", NameTr = "Barbell Sırt Çekiş (Row)", MuscleGroup = "Back", Equipment = "Barbell", Instructions = "Gövdeyi 45 derece eğin, beli koruyarak barı göbeğe doğru çekin, kürek kemiklerini sıkıştırın." },
            new Exercise { Name = "Dumbbell Walking Lunge", NameTr = "Dumbbell Yürüyen Lunge", MuscleGroup = "Legs", Equipment = "Dumbbell", Instructions = "İki ele dumbbell alarak öne doğru adım atın, arka diz yere yaklaşana kadar inin." },
            new Exercise { Name = "Plank", NameTr = "Plank (Statik Core Tutuşu)", MuscleGroup = "Core", Equipment = "Bodyweight", Instructions = "Ön kollar üzerinde durun, karın ve kalçayı sıkarak vücudu düz bir hat halinde tutun." },
            new Exercise { Name = "Kettlebell Swing", NameTr = "Kettlebell Salınımı", MuscleGroup = "FullBody", Equipment = "Kettlebell", Instructions = "Kalça menteşesi hareketiyle kalçayı geriye itip patlayıcı şekilde öne itin." },
            new Exercise { Name = "Dumbbell Bicep Curl", NameTr = "Dumbbell Pazı Büküş", MuscleGroup = "Arms", Equipment = "Dumbbell", Instructions = "Dirsekleri sabit tutarak dumbbell'ları omuza doğru bükün, tepe noktada sıkıştırın." },
            new Exercise { Name = "Cable Tricep Pushdown", NameTr = "Makaralı Arka Kol İtişi", MuscleGroup = "Arms", Equipment = "Cable", Instructions = "Dirsekleri gövdeye sabitleyin, barı aşağı doğru iterek triceps'i tam uzatın." },
            new Exercise { Name = "Hanging Leg Raise", NameTr = "Asılarak Bacak Kaldırma", MuscleGroup = "Core", Equipment = "Bodyweight", Instructions = "Bara asılın, sallanmadan karın kaslarını sıkarak bacakları paralel konuma kaldırın." },
            new Exercise { Name = "Leg Press", NameTr = "Bacak Presi (Makine)", MuscleGroup = "Legs", Equipment = "Machine", Instructions = "Ayakları platforma yerleştirin, dizleri 90 derece bükene kadar indirin ve itin." },
            new Exercise { Name = "Dumbbell Lateral Raise", NameTr = "Dumbbell Yana Açış", MuscleGroup = "Shoulders", Equipment = "Dumbbell", Instructions = "Dumbbell'ları yanlara omuz hizasına kadar kaldırın, omuz başlarını izole edin." }
        );
        await db.SaveChangesAsync();
    }

    // ── 4. Kadro (Salon Sahibi & Eğitmen) ─────────────────────────────────────────
    private static async Task SeedTrainersAsync(ApplicationDbContext db)
    {
        // 1. Salon Sahibi (Admin + Coach + Athlete)
        var sinanUser = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905321112233");
        if (sinanUser == null)
        {
            sinanUser = new AppUser
            {
                PhoneNumber = "+905321112233",
                FullName = "SalonSahibi_1",
                Roles = UserRole.Coach | UserRole.Admin | UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.Add(sinanUser);
            await db.SaveChangesAsync();
        }

        var sinanTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == sinanUser.Id || t.Phone == sinanUser.PhoneNumber);
        if (sinanTrainer == null)
        {
            sinanTrainer = new Trainer
            {
                FullName = sinanUser.FullName,
                Role = "Salon Sahibi",
                DefaultShareRate = 0.30m,
                Phone = sinanUser.PhoneNumber,
                UserId = sinanUser.Id,
                IsActive = true
            };
            db.Trainers.Add(sinanTrainer);
            await db.SaveChangesAsync();
        }

        // 2. Eğitmen (Coach + Athlete)
        var gulcinUser = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905324445566");
        if (gulcinUser == null)
        {
            gulcinUser = new AppUser
            {
                PhoneNumber = "+905324445566",
                FullName = "Hoca_1",
                Roles = UserRole.Coach | UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.Add(gulcinUser);
            await db.SaveChangesAsync();
        }

        var gulcinTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == gulcinUser.Id || t.Phone == gulcinUser.PhoneNumber);
        if (gulcinTrainer == null)
        {
            gulcinTrainer = new Trainer
            {
                FullName = gulcinUser.FullName,
                Role = "Eğitmen",
                DefaultShareRate = 0.40m,
                Phone = gulcinUser.PhoneNumber,
                UserId = gulcinUser.Id,
                IsActive = true
            };
            db.Trainers.Add(gulcinTrainer);
            await db.SaveChangesAsync();
        }

        // Eğitmenlerin de sporcu profili (Member) ve ücretsiz katılım paketi olmasını sağla
        var staffPackage = await db.Packages.FirstOrDefaultAsync(p => p.PackageType == "STAFF" || p.Name == "Eğitmen / Personel Katılımı");
        foreach (var staffUser in new[] { sinanUser, gulcinUser })
        {
            var staffMember = await db.Members.FirstOrDefaultAsync(m => m.UserId == staffUser.Id || m.Phone == staffUser.PhoneNumber);
            if (staffMember == null)
            {
                staffMember = new Member
                {
                    FullName = staffUser.FullName,
                    Phone = staffUser.PhoneNumber,
                    UserId = staffUser.Id,
                    IsActive = true,
                    Notes = "Eğitmen / Personel Sporcu Profili"
                };
                db.Members.Add(staffMember);
                await db.SaveChangesAsync();
            }

            if (staffPackage != null)
            {
                var hasActiveSub = await db.Subscriptions
                    .AnyAsync(s => s.MemberId == staffMember.Id && s.Status == "Active" && (s.TotalLessons - s.CompletedLessons) > 0);

                if (!hasActiveSub)
                {
                    db.Subscriptions.Add(new Subscription
                    {
                        MemberId = staffMember.Id,
                        PackageId = staffPackage.Id,
                        Price = 0m,
                        TotalLessons = 999,
                        CompletedLessons = 0,
                        StartDate = DateTime.UtcNow.Date,
                        EndDate = DateTime.UtcNow.Date.AddYears(10),
                        Status = "Active",
                        Notes = "Eğitmen / Personel sınırsız seans katılım hakkı"
                    });
                    await db.SaveChangesAsync();
                }
            }
        }
    }

    // ── 5. Tek Örnek Sporcu ──────────────────────────────────────────────────────
    private static async Task SeedDemoAthleteAsync(ApplicationDbContext db)
    {
        if (await db.Members.AnyAsync(m => m.Notes != "Eğitmen / Personel Sporcu Profili"))
            return;

        var athleteUser = await db.Users.FirstOrDefaultAsync(u => u.PhoneNumber == "+905551234567");
        if (athleteUser == null)
        {
            athleteUser = new AppUser
            {
                PhoneNumber = "+905551234567",
                FullName = "Atlet_1",
                Roles = UserRole.Athlete,
                PhoneVerified = true
            };
            db.Users.Add(athleteUser);
            await db.SaveChangesAsync();
        }

        var athleteMember = new Member
        {
            FullName = athleteUser.FullName,
            Phone = athleteUser.PhoneNumber,
            Email = "atlet1@example.com",
            UserId = athleteUser.Id,
            IsActive = true,
            HeightCm = 175,
            WeightKg = 72m,
            Age = 28,
            Gender = "Kadın"
        };
        db.Members.Add(athleteMember);
        await db.SaveChangesAsync();

        var pkg8 = await db.Packages.FirstOrDefaultAsync(p => p.PackageType == "GRUP" && p.LessonCount == 8);
        var trainer = await db.Trainers.FirstOrDefaultAsync(t => t.Role == "Eğitmen")
                      ?? await db.Trainers.FirstOrDefaultAsync();

        if (pkg8 != null)
        {
            var sub = new Subscription
            {
                MemberId = athleteMember.Id,
                PackageId = pkg8.Id,
                PrimaryTrainerId = trainer?.Id,
                StartDate = DateTime.UtcNow.Date.AddDays(-7),
                EndDate = DateTime.UtcNow.Date.AddDays(28),
                Price = pkg8.DefaultPrice,
                TotalLessons = 8,
                CompletedLessons = 3,
                Status = "Active",
                SalonShareRate = 0.30m,
                SalonShareAmount = 900m,
                TrainerShareAmount = 2100m
            };
            db.Subscriptions.Add(sub);
            await db.SaveChangesAsync();

            db.Payments.Add(new Payment
            {
                SubscriptionId = sub.Id,
                Amount = 3000m,
                PaymentDate = DateTime.UtcNow.Date.AddDays(-7),
                PaymentMethod = "Kredi Kartı",
                Notes = "Tam paket ödemesi"
            });
            await db.SaveChangesAsync();
        }
    }

    // ── 6. Örnek Seansları Temizleme ─────────────────────────────────────────────
    private static async Task CleanDemoSessionsAsync(ApplicationDbContext db)
    {
        var demoTitles = new[] { "Core & Omurga Sağlığı", "Fonksiyonel Güç & Kondisyon" };
        var demoSlots = await db.SessionSlots
            .Include(s => s.Reservations)
            .Where(s => demoTitles.Contains(s.Title))
            .ToListAsync();

        if (demoSlots.Count > 0)
        {
            foreach (var slot in demoSlots)
            {
                if (slot.Reservations.Count > 0)
                {
                    db.Reservations.RemoveRange(slot.Reservations);
                }
            }
            db.SessionSlots.RemoveRange(demoSlots);
            await db.SaveChangesAsync();
        }
    }
}
