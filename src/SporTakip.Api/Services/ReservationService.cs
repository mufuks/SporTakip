using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;
using SporTakip.Api.Models.Identity;

namespace SporTakip.Api.Services;

public class ReservationService(
    ApplicationDbContext db,
    ILogger<ReservationService> logger) : IReservationService
{
    public async Task<ReservationDto> BookSlotAsync(int athleteUserId, int slotId, CancellationToken ct = default)
    {
        // 1. Sporcu profilini bul
        var member = await db.Members
            .FirstOrDefaultAsync(m => m.UserId == athleteUserId, ct)
            ?? await db.Members.FindAsync([athleteUserId], ct)
            ?? throw new InvalidOperationException("Sporcu profili bulunamadı.");

        // 2. Aktif ve kalan ders hakkı olan paketi bul
        var subscription = await db.Subscriptions
            .Include(s => s.Attendances)
            .Where(s => s.MemberId == member.Id && s.Status == "Active")
            .OrderByDescending(s => s.StartDate)
            .FirstOrDefaultAsync(ct);

        if (subscription == null || subscription.RemainingLessons <= 0)
        {
            throw new InvalidOperationException("Aktif bir paketiniz veya kalan ders hakkınız bulunmuyor.");
        }

        // 3. Seans slotunu bul
        var slot = await db.SessionSlots
            .Include(s => s.Trainer)
            .FirstOrDefaultAsync(s => s.Id == slotId, ct)
            ?? throw new InvalidOperationException("Seans bulunamadı.");

        if (slot.Status == "Cancelled")
        {
            throw new InvalidOperationException("İptal edilmiş bir seansa rezervasyon yapılamaz.");
        }

        if (slot.StartTime <= DateTime.UtcNow)
        {
            throw new InvalidOperationException("Geçmiş bir seansa rezervasyon yapılamaz.");
        }

        // 4. Mükerrer rezervasyon kontrolü
        var existingBooking = await db.Reservations
            .AnyAsync(r => r.SessionSlotId == slotId && r.MemberId == member.Id && 
                (r.Status == "Confirmed" || r.Status == "Waitlisted"), ct);

        if (existingBooking)
        {
            throw new InvalidOperationException("Bu seansa zaten aktif bir rezervasyonunuz bulunmaktadır.");
        }

        // 5. Concurrency & Transaction Güvenliği
        using var tx = await db.Database.BeginTransactionAsync(ct);

        var confirmedCount = await db.Reservations
            .CountAsync(r => r.SessionSlotId == slotId && (r.Status == "Confirmed" || r.Status == "CheckedIn"), ct);

        string status;
        int waitlistPosition;

        if (confirmedCount < slot.Capacity)
        {
            // Kapasitede yer var -> Onaylı rezervasyon
            status = "Confirmed";
            waitlistPosition = 0;
        }
        else
        {
            // Kapasite dolu -> Yedek listeye (Waitlist) al
            status = "Waitlisted";
            var currentMaxWaitlist = await db.Reservations
                .Where(r => r.SessionSlotId == slotId && r.Status == "Waitlisted")
                .MaxAsync(r => (int?)r.WaitlistPosition, ct) ?? 0;

            waitlistPosition = currentMaxWaitlist + 1;
        }

        var reservation = new Reservation
        {
            SessionSlotId = slotId,
            MemberId = member.Id,
            SubscriptionId = subscription.Id,
            BookedBy = "Athlete",
            Status = status,
            WaitlistPosition = waitlistPosition,
            CreatedAt = DateTime.UtcNow
        };

        db.Reservations.Add(reservation);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        logger.LogInformation("🎟️ [BOOKING] Member #{MemberId} ({MemberName}) -> Slot #{SlotId} ({Status}, Sıra: #{Pos})",
            member.Id, member.FullName, slotId, status, waitlistPosition);

        return MapToDto(reservation, slot, member.FullName, slot.Trainer?.FullName ?? "Eğitmen");
    }

    public async Task<CancelReservationResponse> CancelReservationAsync(int requestingUserId, int reservationId, string? reason = null, CancellationToken ct = default)
    {
        var reservation = await db.Reservations
            .Include(r => r.SessionSlot)
                .ThenInclude(s => s.Trainer)
            .Include(r => r.Subscription)
            .Include(r => r.Member)
            .FirstOrDefaultAsync(r => r.Id == reservationId, ct)
            ?? throw new KeyNotFoundException("Rezervasyon bulunamadı.");

        // Yetki kontrolü: Kendi rezervasyonu veya Eğitmen/Admin olmalı
        if (reservation.Member.UserId != requestingUserId && reservation.MemberId != requestingUserId)
        {
            var isStaff = await db.Users.AnyAsync(u => u.Id == requestingUserId && 
                (u.Roles.HasFlag(UserRole.Coach) || u.Roles.HasFlag(UserRole.Admin)), ct);

            if (!isStaff)
            {
                throw new UnauthorizedAccessException("Bu rezervasyonu iptal etme yetkiniz bulunmamaktadır.");
            }
        }

        if (reservation.Status != "Confirmed" && reservation.Status != "Waitlisted")
        {
            throw new InvalidOperationException("Bu rezervasyon zaten iptal edilmiş veya tamamlanmış.");
        }

        using var tx = await db.Database.BeginTransactionAsync(ct);

        var hoursUntilStart = (reservation.SessionSlot.StartTime - DateTime.UtcNow).TotalHours;
        bool penaltyApplied = false;
        string message;

        if (reservation.Status == "Confirmed")
        {
            if (hoursUntilStart > 3)
            {
                // 3 Saat Öncesi: Cezasız İptal
                reservation.Status = "CancelledByAthlete";
                reservation.CancelledAt = DateTime.UtcNow;
                reservation.CancellationReason = reason ?? "3 saat öncesi haberli iptal";
                message = "Rezervasyonunuz cezasız olarak iptal edildi.";
            }
            else
            {
                // 3 Saat Kuralı İhlali: Ceza / Hak Düşer
                reservation.Status = "NoShow";
                reservation.CancelledAt = DateTime.UtcNow;
                reservation.CancellationReason = reason ?? "3 saat kuralı ihlali (hak düştü)";
                penaltyApplied = true;
                message = "Seansa 3 saatten az bir süre kaldığı için salon kuralı gereği ders hakkınız düşülmüştür.";

                // V1 Yoklama Köprüsü: "Missed" statüsünde AttendanceRecord oluştur
                var sub = reservation.Subscription;
                var unitPrice = sub.TotalLessons > 0 ? (sub.Price / sub.TotalLessons) : 0m;
                var trainer = reservation.SessionSlot.Trainer;
                var trainerShare = unitPrice * (trainer?.DefaultShareRate ?? 0.40m);

                var attendance = new AttendanceRecord
                {
                    SubscriptionId = sub.Id,
                    LessonNumber = sub.CompletedLessons + 1,
                    LessonDate = reservation.SessionSlot.StartTime,
                    TrainerId = trainer?.Id,
                    Status = "Missed",
                    IsSubstitute = false,
                    SubstituteShareAmount = 0m,
                    UnitLessonPrice = unitPrice,
                    TrainerShareAmount = trainerShare,
                    Notes = "3 saat kuralı gereği geç iptal / hak düştü",
                    SessionSlotId = reservation.SessionSlotId,
                    ReservationId = reservation.Id
                };

                db.AttendanceRecords.Add(attendance);

                sub.CompletedLessons++;
                if (sub.CompletedLessons >= sub.TotalLessons)
                {
                    sub.Status = "Completed";
                }
            }

            // WAITLIST AUTO-PROMOTION: 1 kişilik yer açıldı, 1. yedeği onaya çıkar
            var waitlist = await db.Reservations
                .Include(r => r.Member)
                .Where(r => r.SessionSlotId == reservation.SessionSlotId && r.Status == "Waitlisted")
                .OrderBy(r => r.WaitlistPosition)
                .ToListAsync(ct);

            if (waitlist.Count > 0)
            {
                var firstWaitlist = waitlist[0];
                firstWaitlist.Status = "Confirmed";
                firstWaitlist.WaitlistPosition = 0;

                // Diğer yedeklerin pozisyonunu 1 adım öne çek (-1)
                for (int i = 1; i < waitlist.Count; i++)
                {
                    waitlist[i].WaitlistPosition--;
                }

                logger.LogInformation("🔄 [WAITLIST PROMOTION] Slot #{SlotId}: Rezervasyon #{ResId} ({MemberName}) yedekten onaya terfi ettirildi.",
                    reservation.SessionSlotId, firstWaitlist.Id, firstWaitlist.Member?.FullName);
            }
        }
        else // Status == "Waitlisted"
        {
            var oldPos = reservation.WaitlistPosition;
            reservation.Status = "CancelledByAthlete";
            reservation.WaitlistPosition = 0;
            reservation.CancelledAt = DateTime.UtcNow;
            reservation.CancellationReason = reason ?? "Yedek liste iptali";
            message = "Yedek liste rezervasyonunuz iptal edildi.";

            // Arkadaki yedekleri 1 adım öne kaydır
            var subsequentWaitlist = await db.Reservations
                .Where(r => r.SessionSlotId == reservation.SessionSlotId && r.Status == "Waitlisted" && r.WaitlistPosition > oldPos)
                .ToListAsync(ct);

            foreach (var w in subsequentWaitlist)
            {
                w.WaitlistPosition--;
            }
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        logger.LogInformation("🚫 [CANCELLATION] Res #{ResId} iptal edildi. Ceza: {Penalty}, Kalan Ders: {Remaining}",
            reservation.Id, penaltyApplied, reservation.Subscription.RemainingLessons);

        var dto = MapToDto(reservation, reservation.SessionSlot, reservation.Member.FullName, reservation.SessionSlot.Trainer?.FullName ?? "Eğitmen");
        return new CancelReservationResponse(true, message, penaltyApplied, reservation.Subscription.RemainingLessons, dto);
    }

    public async Task<CheckInResponse> CheckInReservationAsync(int coachOrAdminUserId, int reservationId, CancellationToken ct = default)
    {
        var reservation = await db.Reservations
            .Include(r => r.SessionSlot)
                .ThenInclude(s => s.Trainer)
            .Include(r => r.Subscription)
                .ThenInclude(s => s.PrimaryTrainer)
            .Include(r => r.Member)
            .FirstOrDefaultAsync(r => r.Id == reservationId, ct)
            ?? throw new KeyNotFoundException("Rezervasyon bulunamadı.");

        if (reservation.Status != "Confirmed")
        {
            throw new InvalidOperationException("Yalnızca 'Confirmed' (onaylı) rezervasyonlar için yoklama alınabilir.");
        }

        // Derse fiilen giren antrenörü bul
        var attendingTrainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == coachOrAdminUserId, ct)
            ?? reservation.SessionSlot.Trainer;

        using var tx = await db.Database.BeginTransactionAsync(ct);

        reservation.Status = "CheckedIn";

        // V1 Hakediş ve %40 İkame Kuralı Hesabı
        var sub = reservation.Subscription;
        var unitPrice = sub.TotalLessons > 0 ? (sub.Price / sub.TotalLessons) : 0m;

        bool isSubstitute = false;
        decimal substituteShare = 0m;
        decimal trainerShare = 0m;

        if (attendingTrainer != null && sub.PrimaryTrainerId.HasValue && attendingTrainer.Id != sub.PrimaryTrainerId)
        {
            // İkame Hoca %40 alır
            isSubstitute = true;
            substituteShare = unitPrice * 0.40m;
            trainerShare = substituteShare;
        }
        else
        {
            // Asıl hoca derse girdiyse
            trainerShare = unitPrice * (attendingTrainer?.DefaultShareRate ?? 0.40m);
        }

        var attendance = new AttendanceRecord
        {
            SubscriptionId = sub.Id,
            LessonNumber = sub.CompletedLessons + 1,
            LessonDate = reservation.SessionSlot.StartTime,
            TrainerId = attendingTrainer?.Id,
            Status = "Attended",
            IsSubstitute = isSubstitute,
            SubstituteShareAmount = substituteShare,
            UnitLessonPrice = unitPrice,
            TrainerShareAmount = trainerShare,
            SessionSlotId = reservation.SessionSlotId,
            ReservationId = reservation.Id,
            Notes = isSubstitute ? $"İkame Hoca: {attendingTrainer?.FullName}" : null
        };

        db.AttendanceRecords.Add(attendance);

        // Kalan dersi düş
        sub.CompletedLessons++;
        if (sub.CompletedLessons >= sub.TotalLessons)
        {
            sub.Status = "Completed";
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        logger.LogInformation("✅ [CHECK-IN] Res #{ResId} -> Yoklama alındı (Attended). İkame: {IsSub}, Birim: {Unit:N2} TL, Hoca Payı: {Trainer:N2} TL",
            reservation.Id, isSubstitute, unitPrice, trainerShare);

        return new CheckInResponse(
            true,
            "Yoklama başarıyla alındı.",
            attendance.Id,
            unitPrice,
            trainerShare,
            isSubstitute,
            substituteShare,
            sub.RemainingLessons
        );
    }

    public async Task<List<ReservationDto>> GetMyReservationsAsync(int athleteUserId, bool includePast = false, CancellationToken ct = default)
    {
        var member = await db.Members
            .FirstOrDefaultAsync(m => m.UserId == athleteUserId, ct)
            ?? await db.Members.FindAsync([athleteUserId], ct);

        if (member == null) return [];

        var query = db.Reservations
            .Include(r => r.SessionSlot)
                .ThenInclude(s => s.Trainer)
            .Include(r => r.Member)
            .Where(r => r.MemberId == member.Id);

        if (!includePast)
        {
            query = query.Where(r => r.SessionSlot.EndTime >= DateTime.UtcNow);
        }

        var list = await query
            .OrderBy(r => r.SessionSlot.StartTime)
            .ToListAsync(ct);

        return list.Select(r => MapToDto(r, r.SessionSlot, member.FullName, r.SessionSlot.Trainer?.FullName ?? "Eğitmen")).ToList();
    }

    // ── Helper ──

    private static ReservationDto MapToDto(Reservation r, SessionSlot slot, string memberName, string trainerName)
    {
        return new ReservationDto(
            r.Id,
            r.SessionSlotId,
            r.MemberId,
            memberName,
            r.SubscriptionId,
            r.Status,
            r.WaitlistPosition,
            slot.StartTime,
            slot.EndTime,
            trainerName,
            r.CancellationReason,
            r.CancelledAt
        );
    }
}
