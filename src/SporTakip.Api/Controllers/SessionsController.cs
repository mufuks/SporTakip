using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/sessions")]
public class SessionsController(ISessionService sessionService) : ControllerBase
{
    /// <summary>
    /// Yeni seans slotu açar (Yalnızca Antrenör ve Salon Sahibi).
    /// </summary>
    [Authorize(Roles = "Coach, Admin")]
    [HttpPost]
    [ProducesResponseType(typeof(SessionSlotDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateSlot([FromBody] CreateSessionSlotRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var slot = await sessionService.CreateSlotAsync(userId, request, ct);
            return Created($"/api/sessions/{slot.Id}", slot);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Belirtilen tarih aralığındaki seansları ve anlık doluluk oranlarını listeler (Herkese açık).
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<SessionSlotDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSlots(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        [FromQuery] int? trainerId,
        CancellationToken ct)
    {
        var start = startDate ?? DateTime.UtcNow.Date;
        var end = endDate.HasValue
            ? (endDate.Value.TimeOfDay == TimeSpan.Zero ? endDate.Value.Date.AddDays(1).AddTicks(-1) : endDate.Value)
            : start.AddDays(7);

        var slots = await sessionService.GetSlotsAsync(start, end, trainerId, ct);
        return Ok(slots);
    }

    /// <summary>
    /// Tekil seans detayını ve kayıtlı sporcuları döner.
    /// </summary>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(SessionSlotDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSlotById(int id, CancellationToken ct)
    {
        var slot = await sessionService.GetSlotByIdAsync(id, ct);
        if (slot == null) return NotFound(new { message = "Seans bulunamadı." });
        return Ok(slot);
    }

    /// <summary>
    /// Var olan seansın saatini, antrenörünü, kapasitesini veya başlığını günceller (Yalnızca Antrenör ve Salon Sahibi).
    /// </summary>
    [Authorize(Roles = "Coach, Admin")]
    [HttpPut("{id}")]
    [ProducesResponseType(typeof(SessionSlotDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateSlot(int id, [FromBody] UpdateSessionSlotRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var slot = await sessionService.UpdateSlotAsync(userId, id, request, ct);
            return Ok(slot);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Seansı iptal eder ve kayıtlı tüm sporcuları haberdar eder (Yalnızca Antrenör ve Salon Sahibi).
    /// </summary>
    [Authorize(Roles = "Coach, Admin")]
    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CancelSlot(int id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var success = await sessionService.CancelSlotAsync(userId, id, ct);
        if (!success) return NotFound(new { message = "Seans bulunamadı." });
        return Ok(new { success = true, message = "Seans başarıyla iptal edildi." });
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}
