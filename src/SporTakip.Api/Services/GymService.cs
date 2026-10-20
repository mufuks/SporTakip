using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;

namespace SporTakip.Api.Services;

/// <summary>
/// Spor salonu ana servis koordinatörü.
/// Modüler mimari prensibiyle domain parçalarına (partial classes) ayrılmıştır:
/// - GymService.Dashboard.cs (Metrikler, Aylık Bordro & Takvim)
/// - GymService.Members.cs (Sporcu CRUD, Notlar & Boy/Kilo Metrikleri)
/// - GymService.Subscriptions.cs (Paket Satış, Dondurma & Çözme)
/// - GymService.Attendance.cs (Yoklama, Seans Slotları & Kapasite)
/// - GymService.Finance.cs (Standart Paketler, Ödemeler & Eğitmen Hakedişleri)
/// </summary>
public partial class GymService(
    ApplicationDbContext db,
    IMemoryCache? cache = null,
    INotificationService? notificationService = null)
{
    public static (decimal? Bmi, string? Category) CalculateBmi(int? heightCm, decimal? weightKg)
    {
        if (heightCm is null or <= 0 || weightKg is null or <= 0)
            return (null, null);

        var heightMeters = heightCm.Value / 100.0m;
        var bmi = Math.Round(weightKg.Value / (heightMeters * heightMeters), 1);
        var category = bmi switch
        {
            < 18.5m => "Zayıf",
            <= 24.9m => "Normal / Fit",
            <= 29.9m => "Fazla Kilolu",
            _ => "Yüksek (Obezite Sınırı)"
        };
        return (bmi, category);
    }

    public static SubscriptionSummaryDto MapToSubscriptionSummary(Subscription s)
    {
        FreezeRecordDto? freezeDto = null;
        if (s.FreezeRecords != null && s.FreezeRecords.Count > 0)
        {
            var active = s.FreezeRecords
                .OrderByDescending(f => f.CreatedAt)
                .FirstOrDefault();

            if (active != null)
            {
                freezeDto = new FreezeRecordDto(
                    active.Id,
                    active.SubscriptionId,
                    active.FreezeStart,
                    active.FreezeEnd,
                    active.Reason,
                    active.Notes,
                    active.DaysAdded,
                    active.CreatedAt
                );
            }
        }

        return new SubscriptionSummaryDto(
            s.Id,
            s.MemberId,
            s.Member?.FullName ?? "Bilinmiyor",
            s.Member?.Phone,
            s.Member?.Notes,
            s.PackageId,
            s.Package?.Name ?? "Standart Paket",
            s.Price,
            s.TotalLessons,
            s.CompletedLessons,
            s.RemainingLessons,
            s.StartDate,
            s.EndDate,
            s.Status,
            s.PaidAmount,
            s.RemainingBalance,
            s.IsFullyPaid,
            s.SalonShareAmount,
            s.TrainerShareAmount,
            freezeDto,
            s.Member?.MedicalConditions
        );
    }

    /// <summary>
    /// Stüdyo genel iletişim ve adres bilgilerini döner. Telefon numarası sistemdeki aktif Salon Sahibi'nden (Admin) dinamik olarak çekilir.
    /// </summary>
    public async Task<GymInfoDto> GetGymInfoAsync(CancellationToken cancellationToken = default)
    {
        const string cacheKey = "gym_info";
        if (cache != null && cache.TryGetValue(cacheKey, out GymInfoDto? cached) && cached != null)
        {
            return cached;
        }

        // 1. Rolü "Salon Sahibi" olan aktif antrenörü bul
        var ownerTrainer = await db.Trainers
            .AsNoTracking()
            .Where(t => t.IsActive && (t.Role == "Salon Sahibi" || t.Role.Contains("Sahip")))
            .OrderBy(t => t.Id)
            .FirstOrDefaultAsync(cancellationToken);

        string? ownerPhone = ownerTrainer?.Phone;
        string? ownerName = ownerTrainer?.FullName;

        // Trainer üzerinde telefon yoksa bağlı AppUser'dan al
        if (string.IsNullOrWhiteSpace(ownerPhone) && ownerTrainer?.UserId != null)
        {
            var user = await db.Users.FindAsync([ownerTrainer.UserId.Value], cancellationToken);
            if (user != null)
            {
                ownerPhone = user.PhoneNumber;
                ownerName ??= user.FullName;
            }
        }

        // 2. Trainer kaydında bulunamadıysa Admin rolüne sahip aktif ilk kullanıcıdan al
        if (string.IsNullOrWhiteSpace(ownerPhone))
        {
            var adminUser = await db.Users
                .AsNoTracking()
                .Where(u => u.IsActive && u.Roles.HasFlag(UserRole.Admin) && !u.Roles.HasFlag(UserRole.SuperAdmin))
                .OrderBy(u => u.Id)
                .FirstOrDefaultAsync(cancellationToken)
                ?? await db.Users.AsNoTracking().Where(u => u.IsActive && u.Roles.HasFlag(UserRole.Admin)).FirstOrDefaultAsync(cancellationToken);

            if (adminUser != null)
            {
                ownerPhone = adminUser.PhoneNumber;
                ownerName ??= adminUser.FullName;
            }
        }

        // Güvenli varsayılan
        ownerPhone ??= "+905321112233";
        ownerName ??= "Salon Sahibi";

        var cleanDigits = new string(ownerPhone.Where(char.IsDigit).ToArray());
        var cleanPhone = cleanDigits.StartsWith("0") ? "90" + cleanDigits[1..] : (cleanDigits.StartsWith("90") ? cleanDigits : "90" + cleanDigits);
        var formatted = FormatPhoneDisplay(ownerPhone);

        var result = new GymInfoDto(
            StudioName: "Compound Athletic Stüdyosu",
            Address: "İhsaniye, Erkal Sk. No:5A, 16600 Nilüfer / Bursa",
            MapsUrl: "https://maps.google.com/?q=%C4%B0hsaniye,+Erkal+Sk.+No:5A,+16600+Nil%C3%BCfer/Bursa",
            WorkingHours: "Hafta İçi: 07:00 – 22:00 | Hafta Sonu: 09:00 – 18:00",
            OwnerName: ownerName,
            OwnerPhone: ownerPhone,
            FormattedPhone: formatted,
            CleanPhone: cleanPhone
        );

        if (cache != null)
        {
            cache.Set(cacheKey, result, new MemoryCacheEntryOptions
            {
                SlidingExpiration = TimeSpan.FromMinutes(15)
            });
        }

        return result;
    }

    private static string FormatPhoneDisplay(string phone)
    {
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        if (digits.StartsWith("90") && digits.Length == 12)
        {
            return $"+90 {digits.Substring(2, 3)} {digits.Substring(5, 3)} {digits.Substring(8, 2)} {digits.Substring(10, 2)}";
        }
        if (digits.StartsWith("0") && digits.Length == 11)
        {
            return $"+90 {digits.Substring(1, 3)} {digits.Substring(4, 3)} {digits.Substring(7, 2)} {digits.Substring(9, 2)}";
        }
        if (digits.Length == 10)
        {
            return $"+90 {digits.Substring(0, 3)} {digits.Substring(3, 3)} {digits.Substring(6, 2)} {digits.Substring(8, 2)}";
        }
        return phone;
    }
}
