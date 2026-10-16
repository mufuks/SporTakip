using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AttendanceController(GymService gymService) : ControllerBase
{
    [HttpPost("mark")]
    [Authorize(Roles = "SuperAdmin,Admin,Coach")]
    public async Task<ActionResult<AttendanceDto>> MarkAttendance([FromBody] MarkAttendanceDto dto, CancellationToken ct)
    {
        try
        {
            var attendance = await gymService.MarkAttendanceAsync(dto, ct);
            return Ok(attendance);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("mark-all-slot")]
    [Authorize(Roles = "SuperAdmin,Admin,Coach")]
    public async Task<ActionResult<MarkAllSlotResultDto>> MarkAllSlotAttendance([FromBody] MarkAllSlotAttendanceDto dto, CancellationToken ct)
    {
        try
        {
            var result = await gymService.MarkAllAttendedForSlotAsync(dto, ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("capacity")]
    [Authorize]
    public async Task<ActionResult<List<HourlySlotCapacityDto>>> GetCapacity([FromQuery] DateTime? date, CancellationToken ct)
    {
        var targetDate = date ?? DateTime.UtcNow;
        var capacity = await gymService.GetHourlyStudioCapacityAsync(targetDate, ct);
        return Ok(capacity);
    }

    [HttpPost("schedule")]
    [Authorize(Roles = "SuperAdmin,Admin,Coach")]
    public async Task<ActionResult<AttendanceDto>> ScheduleSession([FromBody] ScheduleSessionDto dto, CancellationToken ct)
    {
        try
        {
            var session = await gymService.ScheduleSessionAsync(dto, ct);
            return Ok(session);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("calendar-month")]
    [Authorize]
    public async Task<ActionResult<MonthCalendarDto>> GetMonthCalendar([FromQuery] string? year, [FromQuery] string? month, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        int targetYear = int.TryParse(year, out var y) && y > 1900 && y < 3000 ? y : now.Year;
        int targetMonth = int.TryParse(month, out var m) && m >= 1 && m <= 12 ? m : now.Month;

        var calendar = await gymService.GetMonthlyCalendarAsync(targetYear, targetMonth, ct);
        return Ok(calendar);
    }
}

