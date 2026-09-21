namespace SporTakip.Api.Models;

public record CreateSessionSlotRequest(
    DateTime StartTime,
    DateTime EndTime,
    int Capacity = 6,
    string SessionType = "GRUP",
    string? Title = null,
    string? Notes = null,
    int? TrainerId = null
);

public record UpdateSessionSlotRequest(
    DateTime? StartTime = null,
    DateTime? EndTime = null,
    int? Capacity = null,
    string? SessionType = null,
    string? Title = null,
    string? Notes = null,
    int? TrainerId = null,
    string? Status = null
);

public record SessionSlotDto(
    int Id,
    int TrainerId,
    string TrainerName,
    DateTime StartTime,
    DateTime EndTime,
    int Capacity,
    int ConfirmedCount,
    int WaitlistCount,
    int RemainingCapacity,
    string CapacityStatus, // "Comfortable" (0-3), "Filling" (4-5), "Critical" (6+)
    string SessionType,
    string? Title,
    string? Notes,
    string Status,
    List<ReservationSummaryDto> Reservations
);

public record ReservationSummaryDto(
    int ReservationId,
    int MemberId,
    string MemberName,
    string? MemberPhone,
    string Status,
    int WaitlistPosition,
    DateTime CreatedAt
);
