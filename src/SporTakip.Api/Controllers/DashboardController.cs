using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController(GymService gymService) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<ActionResult<DashboardStatsDto>> GetStats(CancellationToken ct)
    {
        var stats = await gymService.GetDashboardStatsAsync(ct);
        return Ok(stats);
    }

    /// <summary>
    /// Stüdyo genel bilgilerini ve aktif Salon Sahibi'nin iletişim numarasını döner (Herkese açık).
    /// </summary>
    [HttpGet("gym-info")]
    public async Task<ActionResult<GymInfoDto>> GetGymInfo(CancellationToken ct)
    {
        var info = await gymService.GetGymInfoAsync(ct);
        return Ok(info);
    }

    /// <summary>
    /// Salon geneli hakediş ve ciro bordrosu (Yalnızca Salon Sahibi / Admin ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Admin")]
    [HttpGet("payroll")]
    public async Task<ActionResult<List<TrainerShareSummaryDto>>> GetPayroll(
        [FromQuery] int? year,
        [FromQuery] int? month,
        CancellationToken ct)
    {
        var y = year ?? DateTime.UtcNow.Year;
        var m = month ?? DateTime.UtcNow.Month;
        var payroll = await gymService.GetTrainerPayrollAsync(y, m, ct);
        return Ok(payroll);
    }

    /// <summary>
    /// Giriş yapan antrenörün yalnızca kendi girdiği dersleri ve hak ettiği prim dökümünü döner (Gizli/Şeffaf bordro).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpGet("my-earnings")]
    public async Task<ActionResult<TrainerPersonalEarningsDto>> GetMyEarnings(
        [FromQuery] int? year,
        [FromQuery] int? month,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId <= 0) return Unauthorized("Oturum doğrulanamadı.");

        var y = year ?? DateTime.UtcNow.Year;
        var m = month ?? DateTime.UtcNow.Month;
        var earnings = await gymService.GetTrainerPersonalEarningsAsync(userId, y, m, ct);
        if (earnings == null) return NotFound("Giriş yapan kullanıcıya ait antrenör kaydı bulunamadı.");
        return Ok(earnings);
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}

