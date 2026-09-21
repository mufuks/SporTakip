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
}
