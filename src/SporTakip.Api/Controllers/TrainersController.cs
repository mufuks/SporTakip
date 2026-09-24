using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TrainersController(GymService gymService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<TrainerDto>>> GetTrainers(CancellationToken ct)
    {
        var trainers = await gymService.GetTrainersAsync(ct);
        return Ok(trainers);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TrainerDto>> GetTrainerById(int id, CancellationToken ct)
    {
        var trainer = await gymService.GetTrainerByIdAsync(id, ct);
        if (trainer == null) return NotFound();
        return Ok(trainer);
    }

    [HttpPost]
    [Authorize(Roles = "SuperAdmin,Admin")]
    public async Task<ActionResult<TrainerDto>> CreateTrainer([FromBody] CreateTrainerDto dto, CancellationToken ct)
    {
        try
        {
            var trainer = await gymService.CreateTrainerAsync(dto, ct);
            return Ok(trainer);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    public async Task<ActionResult<TrainerDto>> UpdateTrainer(int id, [FromBody] UpdateTrainerDto dto, CancellationToken ct)
    {
        try
        {
            var trainer = await gymService.UpdateTrainerAsync(id, dto, ct);
            if (trainer == null) return NotFound(new { error = "Eğitmen bulunamadı." });
            return Ok(trainer);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}


