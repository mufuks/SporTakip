using SporTakip.Api.Models;

namespace SporTakip.Api.Services;

public interface ISessionService
{
    Task<SessionSlotDto> CreateSlotAsync(int trainerOrAdminUserId, CreateSessionSlotRequest request, CancellationToken ct = default);
    Task<List<SessionSlotDto>> GetSlotsAsync(DateTime startDate, DateTime endDate, int? trainerId = null, CancellationToken ct = default);
    Task<SessionSlotDto?> GetSlotByIdAsync(int slotId, CancellationToken ct = default);
    Task<bool> CancelSlotAsync(int trainerOrAdminUserId, int slotId, CancellationToken ct = default);
}
