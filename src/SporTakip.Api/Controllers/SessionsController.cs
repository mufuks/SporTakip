using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/sessions")]
public class SessionsController(ISessionService sessionService, IWorkoutService? workoutService = null) : ControllerBase
{
    /// <summary>
    /// Yeni seans slotu açar (Yalnızca Antrenör, Salon Sahibi ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
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

        var isStaff = User.Identity?.IsAuthenticated == true && 
            (User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach"));

        var slots = await sessionService.GetSlotsAsync(start, end, trainerId, ct);
        if (!isStaff)
        {
            slots = slots.Select(s => s with
            {
                Reservations = s.Reservations.Select(r => r with { MemberPhone = null }).ToList()
            }).ToList();
        }
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
        var isStaff = User.Identity?.IsAuthenticated == true && 
            (User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach"));

        var slot = await sessionService.GetSlotByIdAsync(id, ct);
        if (slot == null) return NotFound(new { message = "Seans bulunamadı." });

        if (!isStaff)
        {
            slot = slot with
            {
                Reservations = slot.Reservations.Select(r => r with { MemberPhone = null }).ToList()
            };
        }
        return Ok(slot);
    }

    /// <summary>
    /// Var olan seansın saatini, antrenörünü, kapasitesini veya başlığını günceller (Yalnızca Antrenör, Salon Sahibi ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
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
    /// Seansı iptal eder ve kayıtlı tüm sporcuları haberdar eder (Yalnızca Antrenör, Salon Sahibi ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
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

    /// <summary>
    /// Seansa tanımlı günün antrenman programını (WOD) ve sıralı egzersiz detaylarını döner.
    /// </summary>
    [HttpGet("{id:int}/wod")]
    [ProducesResponseType(typeof(WorkoutTemplateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSessionWod(int id, CancellationToken ct)
    {
        var slot = await sessionService.GetSlotByIdAsync(id, ct);
        if (slot == null) return NotFound(new { message = "Seans bulunamadı." });

        if (!slot.WorkoutTemplateId.HasValue)
        {
            return NotFound(new { message = "Bu seansa tanımlı bir antrenman programı (WOD) bulunmuyor." });
        }

        if (workoutService == null)
        {
            return NotFound(new { message = "Antrenman servisi aktif değil." });
        }

        var wod = await workoutService.GetTemplateByIdAsync(slot.WorkoutTemplateId.Value, ct);
        if (wod == null)
        {
            return NotFound(new { message = "Bağlı antrenman programı bulunamadı." });
        }

        return Ok(wod);
    }

    /// <summary>
    /// Seans için standart iCalendar (.ics) takvim dosyası üretir.
    /// iOS/Apple Calendar, Google Calendar, Outlook ve Android takvimleriyle tam uyumludur.
    /// </summary>
    [HttpGet("{id:int}/ics")]
    [Produces("text/calendar")]
    public async Task<IActionResult> GetSessionIcs(int id, CancellationToken ct)
    {
        var slot = await sessionService.GetSlotByIdAsync(id, ct);
        if (slot == null) return NotFound(new { message = "Seans bulunamadı." });

        var title = string.IsNullOrWhiteSpace(slot.Title) ? "Grup Seansı" : slot.Title;
        var trainer = string.IsNullOrWhiteSpace(slot.TrainerName) ? "Compound Athletic Eğitmeni" : slot.TrainerName;
        var startUtc = slot.StartTime.ToUniversalTime();
        var endUtc = slot.EndTime.ToUniversalTime();
        var nowUtc = DateTime.UtcNow;

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("BEGIN:VCALENDAR");
        sb.AppendLine("VERSION:2.0");
        sb.AppendLine("PRODID:-//Compound Athletic//SporTakip//TR");
        sb.AppendLine("CALSCALE:GREGORIAN");
        sb.AppendLine("METHOD:PUBLISH");
        sb.AppendLine("BEGIN:VEVENT");
        sb.AppendLine($"UID:session-{slot.Id}-{startUtc:yyyyMMddTHHmmssZ}@compoundathletic.com");
        sb.AppendLine($"DTSTAMP:{nowUtc:yyyyMMddTHHmmssZ}");
        sb.AppendLine($"DTSTART:{startUtc:yyyyMMddTHHmmssZ}");
        sb.AppendLine($"DTEND:{endUtc:yyyyMMddTHHmmssZ}");
        sb.AppendLine($"SUMMARY:Compound Athletic - {title}");
        sb.AppendLine($"DESCRIPTION:Eğitmen: {trainer}\\nSeans Tipi: {slot.SessionType}\\nKontenjan: {slot.Capacity} Kişi\\n\\nCompound Athletic SporTakip üzerinden rezerve edildi.");
        sb.AppendLine("LOCATION:Compound Athletic Stüdyo");
        sb.AppendLine("STATUS:CONFIRMED");
        
        // 60 dakika önce hatırlatıcı alarm (RFC 5545 VALARM)
        sb.AppendLine("BEGIN:VALARM");
        sb.AppendLine("TRIGGER:-PT60M");
        sb.AppendLine("ACTION:DISPLAY");
        sb.AppendLine($"DESCRIPTION:1 saat sonra {title} idmanınız var! Çantanızı hazırlayın.");
        sb.AppendLine("END:VALARM");

        sb.AppendLine("END:VEVENT");
        sb.AppendLine("END:VCALENDAR");

        var icsBytes = System.Text.Encoding.UTF8.GetBytes(sb.ToString());
        return File(icsBytes, "text/calendar; charset=utf-8", $"compound-session-{slot.Id}.ics");
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}
