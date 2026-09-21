using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MembersController(GymService gymService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<MemberDto>>> GetMembers([FromQuery] string? search, CancellationToken ct)
    {
        var members = await gymService.GetMembersAsync(search, ct);
        return Ok(members);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MemberDto>> GetMember(int id, CancellationToken ct)
    {
        var member = await gymService.GetMemberByIdAsync(id, ct);
        if (member == null) return NotFound("Müşteri bulunamadı.");
        return Ok(member);
    }

    [HttpPost]
    public async Task<ActionResult<MemberDto>> CreateMember([FromBody] CreateMemberDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.FullName))
            return BadRequest("Ad Soyad zorunludur.");

        var member = await gymService.CreateMemberAsync(dto, ct);
        return CreatedAtAction(nameof(GetMember), new { id = member.Id }, member);
    }

    [HttpPut("{id}/metrics")]
    public async Task<ActionResult<AthleteMetricsDto>> UpdateMetrics(int id, [FromBody] UpdateAthleteMetricsDto dto, CancellationToken ct)
    {
        var result = await gymService.UpdateAthleteMetricsAsync(id, dto, ct);
        if (result == null) return NotFound("Sporcu bulunamadı.");
        return Ok(result);
    }
}
