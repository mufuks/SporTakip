namespace SporTakip.Api.Models;

public record BookSlotRequest(
    int SlotId
);

public record CancelReservationRequest(
    int ReservationId,
    string? Reason = null
);

public record CheckInReservationRequest(
    int ReservationId
);

public record ReservationDto(
    int Id,
    int SessionSlotId,
    int MemberId,
    string MemberName,
    int SubscriptionId,
    string Status, // Confirmed, Waitlisted, CancelledByAthlete, CancelledByCoach, NoShow, CheckedIn
    int WaitlistPosition,
    DateTime StartTime,
    DateTime EndTime,
    string TrainerName,
    string? CancellationReason,
    DateTime? CancelledAt
);

public record CancelReservationResponse(
    bool Success,
    string Message,
    bool PenaltyApplied,
    int RemainingLessons,
    ReservationDto Reservation
);

public record CheckInResponse(
    bool Success,
    string Message,
    int AttendanceRecordId,
    decimal UnitLessonPrice,
    decimal TrainerShareAmount,
    bool IsSubstitute,
    decimal SubstituteShareAmount,
    int RemainingLessons
);
