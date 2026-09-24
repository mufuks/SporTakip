using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/reservations")]
public class ReservationsController(IReservationService reservationService) : ControllerBase
{
    /// <summary>
    /// Seans için yer ayırtır. Kontenjan dolduysa otomatik olarak yedek listeye (Waitlist) alır.
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]
    [HttpPost("book")]
    [ProducesResponseType(typeof(ReservationDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> BookSlot([FromBody] BookSlotRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var reservation = await reservationService.BookSlotAsync(userId, request.SlotId, ct);
            return Ok(reservation);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Rezervasyonu iptal eder. 3 saatten az kaldıysa salon kuralı gereği ders hakkı düşülür.
    /// </summary>
    [Authorize]
    [HttpPost("cancel")]
    [ProducesResponseType(typeof(CancelReservationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CancelReservation([FromBody] CancelReservationRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var response = await reservationService.CancelReservationAsync(userId, request.ReservationId, request.Reason, ct);
            return Ok(response);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Salona gelen sporcunun yoklamasını onaylar (Check-in). V1 %40 İkame hoca primi ve hakediş işletilir.
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPost("check-in")]
    [ProducesResponseType(typeof(CheckInResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CheckIn([FromBody] CheckInReservationRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var response = await reservationService.CheckInReservationAsync(userId, request.ReservationId, ct);
            return Ok(response);
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
    /// Giriş yapmış sporcunun aktif veya geçmiş rezervasyonlarını listeler.
    /// </summary>
    [Authorize]
    [HttpGet("my")]
    [ProducesResponseType(typeof(List<ReservationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyReservations([FromQuery] bool includePast, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var list = await reservationService.GetMyReservationsAsync(userId, includePast, ct);
        return Ok(list);
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}
