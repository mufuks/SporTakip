using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AttendanceController(GymService gymService) : ControllerBase
{
    [HttpPost("mark")]
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

    [HttpGet("capacity")]
    public async Task<ActionResult<List<HourlySlotCapacityDto>>> GetCapacity([FromQuery] DateTime? date, CancellationToken ct)
    {
        var targetDate = date ?? DateTime.UtcNow;
        var capacity = await gymService.GetHourlyStudioCapacityAsync(targetDate, ct);
        return Ok(capacity);
    }

    [HttpPost("schedule")]
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
    public async Task<ActionResult<MonthCalendarDto>> GetMonthCalendar([FromQuery] int? year, [FromQuery] int? month, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        int targetYear = year ?? now.Year;
        int targetMonth = month ?? now.Month;

        if (targetMonth < 1 || targetMonth > 12)
            return BadRequest(new { error = "Geçersiz ay parametresi." });

        var calendar = await gymService.GetMonthlyCalendarAsync(targetYear, targetMonth, ct);
        return Ok(calendar);
    }
}

