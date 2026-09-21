using Microsoft.EntityFrameworkCore;
using SporTakip.Api.Data;
using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public class SessionService(
    ApplicationDbContext db,
    ILogger<SessionService> logger) : ISessionService
{
    public async Task<SessionSlotDto> CreateSlotAsync(int trainerOrAdminUserId, CreateSessionSlotRequest request, CancellationToken ct = default)
    {
        if (request.EndTime <= request.StartTime)
        {
            throw new ArgumentException("Bitiş saati başlangıç saatinden sonra olmalıdır.");
        }

        Trainer? trainer = null;
        if (request.TrainerId.HasValue)
        {
            trainer = await db.Trainers.FindAsync([request.TrainerId.Value], ct);
        }
        else
        {
            trainer = await db.Trainers.FirstOrDefaultAsync(t => t.UserId == trainerOrAdminUserId, ct);
        }

        if (trainer == null)
        {
            // Eğer hoca profili yoksa sistemdeki ilk antrenörü veya salon sahibini seç
            trainer = await db.Trainers.FirstOrDefaultAsync(ct)
                ?? throw new InvalidOperationException("Slot oluşturmak için geçerli bir antrenör bulunamadı.");
        }

        var slot = new SessionSlot
        {
            TrainerId = trainer.Id,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Capacity = request.Capacity > 0 ? request.Capacity : 6,
            SessionType = string.IsNullOrWhiteSpace(request.SessionType) ? "GRUP" : request.SessionType,
            Title = request.Title,
            Notes = request.Notes,
            Status = "Open",
            CreatedAt = DateTime.UtcNow
        };

        db.SessionSlots.Add(slot);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("📅 [SESSION CREATED] Slot #{SlotId}: {TrainerName} | {StartTime:yyyy-MM-dd HH:mm} - {EndTime:HH:mm} (Kapasite: {Capacity})",
            slot.Id, trainer.FullName, slot.StartTime, slot.EndTime, slot.Capacity);

        return MapToDto(slot, trainer.FullName);
    }

    public async Task<List<SessionSlotDto>> GetSlotsAsync(DateTime startDate, DateTime endDate, int? trainerId = null, CancellationToken ct = default)
    {
        var query = db.SessionSlots
            .Include(s => s.Trainer)
            .Include(s => s.Reservations)
                .ThenInclude(r => r.Member)
            .Where(s => s.StartTime >= startDate && s.StartTime <= endDate);

        if (trainerId.HasValue)
        {
            query = query.Where(s => s.TrainerId == trainerId.Value);
        }

        var slots = await query.OrderBy(s => s.StartTime).ToListAsync(ct);
        return slots.Select(s => MapToDto(s, s.Trainer.FullName)).ToList();
    }

    public async Task<SessionSlotDto?> GetSlotByIdAsync(int slotId, CancellationToken ct = default)
    {
        var slot = await db.SessionSlots
            .Include(s => s.Trainer)
            .Include(s => s.Reservations)
                .ThenInclude(r => r.Member)
            .FirstOrDefaultAsync(s => s.Id == slotId, ct);

        if (slot == null) return null;

        return MapToDto(slot, slot.Trainer.FullName);
    }

    public async Task<bool> CancelSlotAsync(int trainerOrAdminUserId, int slotId, CancellationToken ct = default)
    {
        var slot = await db.SessionSlots
            .Include(s => s.Reservations)
            .FirstOrDefaultAsync(s => s.Id == slotId, ct);

        if (slot == null) return false;

        slot.Status = "Cancelled";

        foreach (var res in slot.Reservations.Where(r => r.Status == "Confirmed" || r.Status == "Waitlisted"))
        {
            res.Status = "CancelledByCoach";
            res.CancellationReason = "Seans antrenör tarafından iptal edildi.";
            res.CancelledAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        logger.LogInformation("❌ [SESSION CANCELLED] Slot #{SlotId} antrenör/admin tarafından iptal edildi.", slotId);
        return true;
    }

    // ── Helper Metotlar ──

    private static SessionSlotDto MapToDto(SessionSlot slot, string trainerName)
    {
        var confirmedCount = slot.Reservations.Count(r => r.Status == "Confirmed" || r.Status == "CheckedIn");
        var waitlistCount = slot.Reservations.Count(r => r.Status == "Waitlisted");
        var remainingCapacity = Math.Max(0, slot.Capacity - confirmedCount);

        var capacityStatus = confirmedCount switch
        {
            <= 3 => "Comfortable", // 🟢 Rahat (0-3 kişi)
            <= 5 => "Filling",     // 🟡 Doluyor (4-5 kişi)
            _    => "Critical"     // 🔴 Kritik Dolu (6+ kişi)
        };

        var reservationDtos = slot.Reservations
            .OrderBy(r => r.WaitlistPosition)
            .ThenBy(r => r.CreatedAt)
            .Select(r => new ReservationSummaryDto(
                r.Id,
                r.MemberId,
                r.Member?.FullName ?? "Bilinmeyen Sporcu",
                r.Member?.Phone,
                r.Status,
                r.WaitlistPosition,
                r.CreatedAt
            ))
            .ToList();

        return new SessionSlotDto(
            slot.Id,
            slot.TrainerId,
            trainerName,
            slot.StartTime,
            slot.EndTime,
            slot.Capacity,
            confirmedCount,
            waitlistCount,
            remainingCapacity,
            capacityStatus,
            slot.SessionType,
            slot.Title,
            slot.Notes,
            slot.Status,
            reservationDtos
        );
    }
}
