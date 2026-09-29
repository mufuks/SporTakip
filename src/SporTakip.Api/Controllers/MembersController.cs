using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MembersController(GymService gymService) : ControllerBase
{
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpGet]
    public async Task<ActionResult<List<MemberDto>>> GetMembers(
        [FromQuery] string? search,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var members = await gymService.GetMembersAsync(search, page, pageSize, ct);
        return Ok(members);
    }

    /// <summary>
    /// Giriş yapmış sporcunun kendi üye profilini döner.
    /// </summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<MemberDto>> GetMyProfile(CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId <= 0) return Unauthorized("Oturum doğrulanamadı.");

        var member = await gymService.GetMemberByUserIdAsync(userId, ct);
        if (member == null) return NotFound("Giriş yapan kullanıcıya ait sporcu profili bulunamadı.");
        return Ok(member);
    }

    [Authorize]
    [HttpGet("{id:int}")]
    public async Task<ActionResult<MemberDto>> GetMember(int id, CancellationToken ct)
    {
        var member = await gymService.GetMemberByIdAsync(id, ct);
        if (member == null) return NotFound("Müşteri bulunamadı.");

        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");
        if (!isStaff && member.UserId != GetCurrentUserId())
        {
            return Forbid();
        }

        return Ok(member);
    }

    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPost]
    public async Task<ActionResult<MemberDto>> CreateMember([FromBody] CreateMemberDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            return BadRequest("Ad Soyad zorunludur.");

        var member = await gymService.CreateMemberAsync(dto, ct);
        return CreatedAtAction(nameof(GetMember), new { id = member.Id }, member);
    }

    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<MemberDto>> UpdateMember(int id, [FromBody] UpdateMemberDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            return BadRequest("Ad Soyad zorunludur.");

        var member = await gymService.UpdateMemberAsync(id, dto, ct);
        if (member == null) return NotFound("Müşteri bulunamadı.");
        return Ok(member);
    }

    [Authorize]
    [HttpPut("{id:int}/metrics")]
    public async Task<ActionResult<AthleteMetricsDto>> UpdateMetrics(int id, [FromBody] UpdateAthleteMetricsDto dto, CancellationToken ct)
    {
        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");
        if (!isStaff)
        {
            var member = await gymService.GetMemberByIdAsync(id, ct);
            if (member == null) return NotFound("Sporcu bulunamadı.");
            if (member.UserId != GetCurrentUserId())
            {
                return Forbid();
            }
        }

        var result = await gymService.UpdateAthleteMetricsAsync(id, dto, ct);
        if (result == null) return NotFound("Sporcu bulunamadı.");
        return Ok(result);
    }

    /// <summary>
    /// Antrenör, Salon Sahibi ve SuperAdmin için sporcu sağlık kısıtı / sakatlık notunu günceller.
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPut("{id:int}/notes")]
    public async Task<ActionResult<MemberDto>> UpdateNotes(int id, [FromBody] UpdateMemberNotesDto dto, CancellationToken ct)
    {
        var result = await gymService.UpdateMemberNotesAsync(id, dto.Notes, ct);
        if (result == null) return NotFound("Sporcu bulunamadı.");
        return Ok(result);
    }

    /// <summary>
    /// Sporcunun kilo, yağ oranı ve gelişim geçmişini (Progress Timeline) döner.
    /// </summary>
    [Authorize]
    [HttpGet("{id:int}/metrics/progress")]
    public async Task<ActionResult<BodyMetricsProgressDto>> GetMetricsProgress(int id, CancellationToken ct)
    {
        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");
        if (!isStaff)
        {
            var member = await gymService.GetMemberByIdAsync(id, ct);
            if (member == null) return NotFound("Sporcu bulunamadı.");
            if (member.UserId != GetCurrentUserId())
            {
                return Forbid();
            }
        }

        var progress = await gymService.GetMemberBodyMetricsProgressAsync(id, ct);
        if (progress == null) return NotFound("Sporcu bulunamadı.");
        return Ok(progress);
    }

    /// <summary>
    /// Sporcuya yeni bir tartı / vücut ölçüm kaydı ekler.
    /// </summary>
    [Authorize]
    [HttpPost("{id:int}/metrics/logs")]
    public async Task<ActionResult<BodyMetricLogDto>> AddMetricLog(int id, [FromBody] CreateBodyMetricLogDto dto, CancellationToken ct)
    {
        if (dto.WeightKg <= 0 || dto.WeightKg > 400)
        {
            return BadRequest("Geçerli bir kilo değeri giriniz.");
        }

        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");
        if (!isStaff)
        {
            var member = await gymService.GetMemberByIdAsync(id, ct);
            if (member == null) return NotFound("Sporcu bulunamadı.");
            if (member.UserId != GetCurrentUserId())
            {
                return Forbid();
            }
        }

        var log = await gymService.AddBodyMetricLogAsync(id, dto, ct);
        if (log == null) return NotFound("Sporcu bulunamadı.");
        return Ok(log);
    }

    /// <summary>
    /// Sporcunun hatalı girilen bir ölçüm kaydını siler.
    /// </summary>
    [Authorize]
    [HttpDelete("{id:int}/metrics/logs/{logId:int}")]
    public async Task<IActionResult> DeleteMetricLog(int id, int logId, CancellationToken ct)
    {
        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");
        if (!isStaff)
        {
            var member = await gymService.GetMemberByIdAsync(id, ct);
            if (member == null) return NotFound("Sporcu bulunamadı.");
            if (member.UserId != GetCurrentUserId())
            {
                return Forbid();
            }
        }

        var success = await gymService.DeleteBodyMetricLogAsync(id, logId, ct);
        if (!success) return NotFound("Ölçüm kaydı bulunamadı.");
        return NoContent();
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}


