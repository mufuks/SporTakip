using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public interface IReservationService
{
    Task<ReservationDto> BookSlotAsync(int athleteUserId, int slotId, CancellationToken ct = default);
    Task<CancelReservationResponse> CancelReservationAsync(int requestingUserId, int reservationId, string? reason = null, CancellationToken ct = default);
    Task<CheckInResponse> CheckInReservationAsync(int coachOrAdminUserId, int reservationId, CancellationToken ct = default);
    Task<List<ReservationDto>> GetMyReservationsAsync(int athleteUserId, bool includePast = false, CancellationToken ct = default);
}
