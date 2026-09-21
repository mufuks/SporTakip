using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/exercises")]
public class ExercisesController(IWorkoutService workoutService) : ControllerBase
{
    /// <summary>
    /// Evrensel egzersiz kataloğunu listeler. İsteğe bağlı olarak kas grubuna göre filtrelenebilir.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(List<ExerciseDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetExercises([FromQuery] string? muscleGroup, CancellationToken ct)
    {
        var exercises = await workoutService.GetExercisesAsync(muscleGroup, ct);
        return Ok(exercises);
    }

    /// <summary>
    /// Tekil egzersiz detayını getirir.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ExerciseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetExerciseById(int id, CancellationToken ct)
    {
        var exercise = await workoutService.GetExerciseByIdAsync(id, ct);
        if (exercise == null)
            return NotFound(new { message = $"Egzersiz bulunamadı: Id={id}" });

        return Ok(exercise);
    }
}
