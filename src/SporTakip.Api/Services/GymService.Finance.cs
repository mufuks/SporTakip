using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public partial class GymService
{
    public async Task<List<PackageDto>> GetPackagesAsync(bool includeInactive = false, CancellationToken cancellationToken = default)
    {
        var cacheKey = includeInactive ? "packages_all" : "packages_active";
        if (cache != null && cache.TryGetValue(cacheKey, out List<PackageDto>? cached) && cached != null)
        {
            return cached;
        }

        var query = db.Packages.AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive);
        }

        var list = await query
            .OrderBy(p => p.PackageType)
            .ThenBy(p => p.LessonCount)
            .Select(p => new PackageDto(p.Id, p.Name, p.PackageType, p.LessonCount, p.DefaultPrice, p.ValidityDays, p.IsActive))
            .ToListAsync(cancellationToken);

        if (cache != null)
        {
            cache.Set(cacheKey, list, new MemoryCacheEntryOptions
            {
                SlidingExpiration = TimeSpan.FromMinutes(15)
            });
        }

        return list;
    }

    public async Task<PackageDto> CreatePackageAsync(CreatePackageDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Paket adı zorunludur.");
        if (dto.LessonCount <= 0)
            throw new ArgumentException("Ders sayısı en az 1 olmalıdır.");
        if (dto.DefaultPrice < 0)
            throw new ArgumentException("Paket fiyatı 0 veya daha büyük olmalıdır.");

        var package = new Package
        {
            Name = dto.Name.Trim(),
            PackageType = string.IsNullOrWhiteSpace(dto.PackageType) ? "GRUP" : dto.PackageType.Trim().ToUpperInvariant(),
            LessonCount = dto.LessonCount,
            DefaultPrice = dto.DefaultPrice,
            ValidityDays = dto.ValidityDays > 0 ? dto.ValidityDays : 35,
            IsActive = true
        };

        db.Packages.Add(package);
        await db.SaveChangesAsync(cancellationToken);

        cache?.Remove("packages_active");
        cache?.Remove("packages_all");

        return new PackageDto(package.Id, package.Name, package.PackageType, package.LessonCount, package.DefaultPrice, package.ValidityDays, package.IsActive);
    }

    public async Task<PackageDto> UpdatePackageAsync(int packageId, UpdatePackageDto dto, CancellationToken cancellationToken = default)
    {
        var package = await db.Packages.FindAsync([packageId], cancellationToken)
            ?? throw new InvalidOperationException("Güncellenecek paket bulunamadı.");

        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new ArgumentException("Paket adı zorunludur.");
        if (dto.LessonCount <= 0)
            throw new ArgumentException("Ders sayısı en az 1 olmalıdır.");
        if (dto.DefaultPrice < 0)
            throw new ArgumentException("Paket fiyatı 0 veya daha büyük olmalıdır.");

        package.Name = dto.Name.Trim();
        package.PackageType = string.IsNullOrWhiteSpace(dto.PackageType) ? "GRUP" : dto.PackageType.Trim().ToUpperInvariant();
        package.LessonCount = dto.LessonCount;
        package.DefaultPrice = dto.DefaultPrice;
        package.ValidityDays = dto.ValidityDays > 0 ? dto.ValidityDays : 35;
        package.IsActive = dto.IsActive;

        await db.SaveChangesAsync(cancellationToken);

        cache?.Remove("packages_active");
        cache?.Remove("packages_all");

        return new PackageDto(package.Id, package.Name, package.PackageType, package.LessonCount, package.DefaultPrice, package.ValidityDays, package.IsActive);
    }

    public async Task<bool> DeletePackageAsync(int packageId, CancellationToken cancellationToken = default)
    {
        var package = await db.Packages
            .Include(p => p.Subscriptions)
            .FirstOrDefaultAsync(p => p.Id == packageId, cancellationToken)
            ?? throw new InvalidOperationException("Silinecek paket bulunamadı.");

        if (package.Subscriptions.Count > 0)
        {
            // Kullanımda olan paketleri güvenle pasife al (soft delete)
            package.IsActive = false;
        }
        else
        {
            db.Packages.Remove(package);
        }

        await db.SaveChangesAsync(cancellationToken);

        cache?.Remove("packages_active");
        cache?.Remove("packages_all");

        return true;
    }

    public async Task<PaymentDto> AddPaymentAsync(CreatePaymentDto dto, CancellationToken cancellationToken = default)
    {
        var sub = await db.Subscriptions
            .Include(s => s.Member)
            .FirstOrDefaultAsync(s => s.Id == dto.SubscriptionId, cancellationToken)
            ?? throw new InvalidOperationException("Abonelik bulunamadı.");

        var payment = new Payment
        {
            SubscriptionId = sub.Id,
            Amount = dto.Amount,
            PaymentDate = dto.PaymentDate ?? DateTime.UtcNow,
            PaymentMethod = dto.PaymentMethod,
            Notes = dto.Notes
        };

        db.Payments.Add(payment);
        await db.SaveChangesAsync(cancellationToken);

        return new PaymentDto(
            payment.Id,
            payment.SubscriptionId,
            sub.Member.FullName,
            payment.Amount,
            payment.PaymentDate,
            payment.PaymentMethod,
            payment.Notes
        );
    }

    public async Task<List<TrainerDto>> GetTrainersAsync(CancellationToken cancellationToken = default)
    {
        return await db.Trainers
            .AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.Role == "Salon Sahibi" ? 0 : 1)
            .Select(t => new TrainerDto(t.Id, t.FullName, t.Role, t.Phone, t.DefaultShareRate, t.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<TrainerDto?> GetTrainerByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var t = await db.Trainers.AsNoTracking().FirstOrDefaultAsync(tr => tr.Id == id && tr.IsActive, cancellationToken);
        if (t == null) return null;
        return new TrainerDto(t.Id, t.FullName, t.Role, t.Phone, t.DefaultShareRate, t.IsActive);
    }

    public async Task<TrainerDto> CreateTrainerAsync(CreateTrainerDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            throw new ArgumentException("Eğitmen adı boş olamaz.", nameof(dto));

        var trainer = new Trainer
        {
            FullName = dto.FullName.Trim(),
            Role = string.IsNullOrWhiteSpace(dto.Role) ? "Eğitmen" : dto.Role.Trim(),
            Phone = string.IsNullOrWhiteSpace(dto.Phone) ? null : dto.Phone.Trim(),
            DefaultShareRate = dto.DefaultShareRate > 0 ? dto.DefaultShareRate : 0.40m,
            IsActive = true
        };

        db.Trainers.Add(trainer);
        await db.SaveChangesAsync(cancellationToken);

        return new TrainerDto(trainer.Id, trainer.FullName, trainer.Role, trainer.Phone, trainer.DefaultShareRate, trainer.IsActive);
    }

    public async Task<TrainerDto?> UpdateTrainerAsync(int id, UpdateTrainerDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            throw new ArgumentException("Eğitmen adı boş olamaz.", nameof(dto));

        var trainer = await db.Trainers.FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
        if (trainer == null) return null;

        var normalizedPhone = !string.IsNullOrWhiteSpace(dto.Phone) ? AuthService.NormalizePhoneNumber(dto.Phone) : null;
        trainer.FullName = dto.FullName.Trim();
        trainer.Role = string.IsNullOrWhiteSpace(dto.Role) ? "Eğitmen" : dto.Role.Trim();
        trainer.Phone = normalizedPhone;
        if (dto.DefaultShareRate >= 0)
            trainer.DefaultShareRate = dto.DefaultShareRate;
        trainer.IsActive = dto.IsActive;

        if (trainer.UserId.HasValue)
        {
            var user = await db.Users.FindAsync(new object[] { trainer.UserId.Value }, cancellationToken);
            if (user != null)
            {
                user.FullName = trainer.FullName;
                user.IsActive = trainer.IsActive;
                if (!string.IsNullOrWhiteSpace(normalizedPhone))
                {
                    var conflict = await db.Users.AnyAsync(u => u.Id != user.Id && u.PhoneNumber == normalizedPhone, cancellationToken);
                    if (!conflict)
                    {
                        user.PhoneNumber = normalizedPhone;
                    }
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        cache?.Remove("gym_info");
        return new TrainerDto(trainer.Id, trainer.FullName, trainer.Role, trainer.Phone, trainer.DefaultShareRate, trainer.IsActive);
    }

    public async Task<TrainerPersonalEarningsDto?> GetTrainerPersonalEarningsAsync(int userId, int year, int month, CancellationToken cancellationToken = default)
    {
        var trainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == userId && t.IsActive, cancellationToken);
        if (trainer == null)
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user != null)
            {
                var cleanPhone = user.PhoneNumber?.Replace("+90", "").Trim();
                trainer = await db.Trainers.FirstOrDefaultAsync(t => 
                    t.IsActive && (
                        (t.Phone != null && cleanPhone != null && t.Phone.Contains(cleanPhone)) ||
                        t.FullName.ToLower() == user.FullName.ToLower()
                    ), cancellationToken);
            }
        }

        if (trainer == null) return null;

        var startOfMonth = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        var endOfMonth = startOfMonth.AddMonths(1).AddTicks(-1);

        var attendances = await db.AttendanceRecords
            .AsNoTracking()
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Member)
            .Include(a => a.Subscription)
                .ThenInclude(s => s.Package)
            .Where(a => a.TrainerId == trainer.Id && a.LessonDate >= startOfMonth && a.LessonDate <= endOfMonth && (a.Status == "Attended" || a.Status == "Missed"))
            .OrderByDescending(a => a.LessonDate)
            .ToListAsync(cancellationToken);

        int totalLessons = attendances.Count;
        int ownStudentLessons = attendances.Count(a => a.Subscription.PrimaryTrainerId == trainer.Id && !a.IsSubstitute);
        int substituteLessons = attendances.Count(a => a.Subscription.PrimaryTrainerId != trainer.Id || a.IsSubstitute);

        decimal lessonEarnings = attendances.Sum(a => a.TrainerShareAmount);

        decimal packageShare = 0m;
        if (trainer.Role == "Salon Sahibi")
        {
            var subsThisMonth = await db.Subscriptions
                .AsNoTracking()
                .Where(s => s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
                .ToListAsync(cancellationToken);
            packageShare = subsThisMonth.Sum(s => s.SalonShareAmount);
        }
        else
        {
            var myPrimarySubs = await db.Subscriptions
                .AsNoTracking()
                .Where(s => s.PrimaryTrainerId == trainer.Id && s.StartDate >= startOfMonth && s.StartDate <= endOfMonth)
                .ToListAsync(cancellationToken);
            packageShare = myPrimarySubs.Sum(s => s.TrainerShareAmount);
        }

        var lessonHistory = attendances.Select(a => new TrainerLessonHistoryItemDto(
            AttendanceId: a.Id,
            LessonDate: a.LessonDate,
            MemberName: a.Subscription?.Member?.FullName ?? "Bilinmiyor",
            PackageName: a.Subscription?.Package?.Name ?? "Standart",
            LessonNumber: a.LessonNumber,
            IsSubstitute: a.Subscription?.PrimaryTrainerId != trainer.Id || a.IsSubstitute,
            EarnedAmount: a.TrainerShareAmount,
            Status: a.Status,
            Notes: a.Notes
        )).ToList();

        return new TrainerPersonalEarningsDto(
            TrainerId: trainer.Id,
            TrainerName: trainer.FullName,
            Role: trainer.Role,
            Year: year,
            Month: month,
            TotalLessonsGiven: totalLessons,
            OwnStudentLessons: ownStudentLessons,
            SubstituteLessons: substituteLessons,
            TotalLessonEarnings: lessonEarnings,
            TotalPackageShare: packageShare,
            TotalEarnings: lessonEarnings + packageShare,
            LessonHistory: lessonHistory
        );
    }
}
