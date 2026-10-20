using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public partial class GymService
{
    public async Task<List<SubscriptionSummaryDto>> GetActiveSubscriptionsAsync(CancellationToken cancellationToken = default)
    {
        var subs = await db.Subscriptions
            .AsNoTracking()
            .Include(s => s.Member)
            .Include(s => s.Package)
            .Include(s => s.Payments)
            .Include(s => s.FreezeRecords)
            .Where(s => s.Status == "Active" || s.Status == "Frozen")
            .OrderBy(s => s.TotalLessons - s.CompletedLessons)
            .ToListAsync(cancellationToken);

        return subs.Select(MapToSubscriptionSummary).ToList();
    }

    public async Task<SubscriptionSummaryDto> CreateSubscriptionAsync(CreateSubscriptionDto dto, CancellationToken cancellationToken = default)
    {
        var package = await db.Packages.FindAsync([dto.PackageId], cancellationToken)
            ?? throw new InvalidOperationException("Paket bulunamadı.");

        var member = await db.Members.FindAsync([dto.MemberId], cancellationToken)
            ?? throw new InvalidOperationException("Müşteri bulunamadı.");

        var price = dto.Price > 0 ? dto.Price : package.DefaultPrice;
        var salonShare = price * dto.SalonShareRate;
        var trainerShare = Math.Max(0, price - salonShare);

        Trainer? primaryTrainer = null;
        if (dto.PrimaryTrainerId.HasValue)
        {
            primaryTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.Id == dto.PrimaryTrainerId.Value && t.IsActive, cancellationToken);
        }

        if (primaryTrainer == null)
        {
            primaryTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.Role == "Eğitmen", cancellationToken);
        }

        var subscription = new Subscription
        {
            MemberId = member.Id,
            PackageId = package.Id,
            PrimaryTrainerId = primaryTrainer?.Id,
            Price = price,
            TotalLessons = package.LessonCount,
            CompletedLessons = 0,
            StartDate = dto.StartDate.Date,
            EndDate = dto.StartDate.Date.AddDays(package.ValidityDays),
            Status = "Active",
            Notes = dto.Notes,
            SalonShareRate = dto.SalonShareRate,
            SalonShareAmount = salonShare,
            TrainerShareAmount = trainerShare
        };

        db.Subscriptions.Add(subscription);
        await db.SaveChangesAsync(cancellationToken);

        if (dto.InitialPaymentAmount > 0)
        {
            var payment = new Payment
            {
                SubscriptionId = subscription.Id,
                Amount = dto.InitialPaymentAmount,
                PaymentDate = dto.StartDate,
                PaymentMethod = string.IsNullOrWhiteSpace(dto.PaymentMethod) ? "Nakit" : dto.PaymentMethod,
                Notes = "İlk ödeme / Peşinat"
            };
            db.Payments.Add(payment);
            await db.SaveChangesAsync(cancellationToken);
        }

        await db.Entry(subscription).Reference(s => s.Member).LoadAsync(cancellationToken);
        await db.Entry(subscription).Reference(s => s.Package).LoadAsync(cancellationToken);
        await db.Entry(subscription).Collection(s => s.Payments).LoadAsync(cancellationToken);

        return MapToSubscriptionSummary(subscription);
    }

    public async Task<SubscriptionSummaryDto> FreezeSubscriptionAsync(
        int subscriptionId,
        FreezeSubscriptionRequest request,
        int requestingUserId,
        bool isStaff,
        CancellationToken cancellationToken = default)
    {
        if (request.Days < 1 || request.Days > 90)
        {
            throw new ArgumentException("Dondurma süresi 1 ile 90 gün arasında olmalıdır.");
        }

        var subscription = await db.Subscriptions
            .Include(s => s.Member)
            .Include(s => s.Package)
            .Include(s => s.Payments)
            .Include(s => s.FreezeRecords)
            .FirstOrDefaultAsync(s => s.Id == subscriptionId, cancellationToken)
            ?? throw new KeyNotFoundException("Abonelik bulunamadı.");

        if (!isStaff && subscription.Member.UserId != requestingUserId)
        {
            throw new UnauthorizedAccessException("Yalnızca kendi aboneliğinizi dondurabilirsiniz.");
        }

        if (subscription.Status == "Frozen")
        {
            throw new InvalidOperationException("Bu abonelik zaten dondurulmuş durumdadır.");
        }

        if (subscription.Status != "Active")
        {
            throw new InvalidOperationException("Yalnızca aktif durumdaki abonelikler dondurulabilir.");
        }

        var startDate = (request.StartDate ?? DateTime.UtcNow).Date;
        var endDate = startDate.AddDays(request.Days);

        var freezeRecord = new FreezeRecord
        {
            SubscriptionId = subscription.Id,
            FreezeStart = startDate,
            FreezeEnd = endDate,
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? "Kişisel / Tatil" : request.Reason.Trim(),
            Notes = request.Notes?.Trim(),
            DaysAdded = request.Days,
            CreatedAt = DateTime.UtcNow
        };

        subscription.FreezeRecords.Add(freezeRecord);
        subscription.Status = "Frozen";

        if (subscription.EndDate.HasValue)
        {
            subscription.EndDate = subscription.EndDate.Value.AddDays(request.Days);
        }

        await db.SaveChangesAsync(cancellationToken);

        if (notificationService != null && subscription.Member.UserId.HasValue)
        {
            try
            {
                await notificationService.CreateNotificationAsync(
                    subscription.Member.UserId.Value,
                    "Paketiniz Donduruldu",
                    $"{subscription.Package.Name} paketiniz {startDate:dd.MM.yyyy} - {endDate:dd.MM.yyyy} tarihleri arasında donduruldu ({request.Days} gün).",
                    type: "Package",
                    icon: "❄️",
                    actionUrl: "profile",
                    ct: cancellationToken);
            }
            catch
            {
                // Bildirim hatası ana dondurma akışını engellemez
            }
        }

        return MapToSubscriptionSummary(subscription);
    }

    public async Task<SubscriptionSummaryDto> UnfreezeSubscriptionAsync(
        int subscriptionId,
        int requestingUserId,
        bool isStaff,
        CancellationToken cancellationToken = default)
    {
        var subscription = await db.Subscriptions
            .Include(s => s.Member)
            .Include(s => s.Package)
            .Include(s => s.Payments)
            .Include(s => s.FreezeRecords)
            .FirstOrDefaultAsync(s => s.Id == subscriptionId, cancellationToken)
            ?? throw new KeyNotFoundException("Abonelik bulunamadı.");

        if (!isStaff && subscription.Member.UserId != requestingUserId)
        {
            throw new UnauthorizedAccessException("Yalnızca kendi aboneliğinizin dondurmasını kaldırabilirsiniz.");
        }

        if (subscription.Status != "Frozen")
        {
            throw new InvalidOperationException("Bu abonelik dondurulmuş durumda değil.");
        }

        var activeFreeze = subscription.FreezeRecords
            .OrderByDescending(f => f.CreatedAt)
            .FirstOrDefault(f => f.FreezeEnd == null || f.FreezeEnd >= DateTime.UtcNow.Date);

        var today = DateTime.UtcNow.Date;
        if (activeFreeze != null)
        {
            var actualFrozenDays = Math.Max(1, (today - activeFreeze.FreezeStart.Date).Days);
            if (actualFrozenDays < activeFreeze.DaysAdded)
            {
                var diffDays = activeFreeze.DaysAdded - actualFrozenDays;
                if (subscription.EndDate.HasValue)
                {
                    subscription.EndDate = subscription.EndDate.Value.AddDays(-diffDays);
                }
                activeFreeze.DaysAdded = actualFrozenDays;
            }
            activeFreeze.FreezeEnd = today;
        }

        subscription.Status = "Active";
        await db.SaveChangesAsync(cancellationToken);

        if (notificationService != null && subscription.Member.UserId.HasValue)
        {
            try
            {
                await notificationService.CreateNotificationAsync(
                    subscription.Member.UserId.Value,
                    "Paket Dondurması Kaldırıldı",
                    $"{subscription.Package.Name} paketinizin dondurması çözüldü ve paketiniz tekrar aktif hale getirildi.",
                    type: "Package",
                    icon: "🔥",
                    actionUrl: "profile",
                    ct: cancellationToken);
            }
            catch
            {
                // Bildirim hatası ana çözme akışını engellemez
            }
        }

        return MapToSubscriptionSummary(subscription);
    }

    public async Task<List<FreezeRecordDto>> GetSubscriptionFreezeRecordsAsync(
        int subscriptionId,
        int requestingUserId,
        bool isStaff,
        CancellationToken cancellationToken = default)
    {
        var subscription = await db.Subscriptions
            .Include(s => s.Member)
            .Include(s => s.FreezeRecords)
            .FirstOrDefaultAsync(s => s.Id == subscriptionId, cancellationToken)
            ?? throw new KeyNotFoundException("Abonelik bulunamadı.");

        if (!isStaff && subscription.Member.UserId != requestingUserId)
        {
            throw new UnauthorizedAccessException("Yalnızca kendi aboneliğinizin dondurma geçmişini görüntüleyebilirsiniz.");
        }

        return subscription.FreezeRecords
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new FreezeRecordDto(
                f.Id,
                f.SubscriptionId,
                f.FreezeStart,
                f.FreezeEnd,
                f.Reason,
                f.Notes,
                f.DaysAdded,
                f.CreatedAt
            ))
            .ToList();
    }
}
