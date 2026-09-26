using Microsoft.AspNetCore.Authorization;
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

    /// <summary>
    /// Yeni bir egzersiz tanımlar (Yalnızca Antrenör, Salon Sahibi ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPost]
    [ProducesResponseType(typeof(ExerciseDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateExercise([FromBody] CreateExerciseRequest request, CancellationToken ct)
    {
        try
        {
            var exercise = await workoutService.CreateExerciseAsync(request, ct);
            return Created($"/api/exercises/{exercise.Id}", exercise);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Egzersiz bilgilerini günceller (Yalnızca Antrenör, Salon Sahibi ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ExerciseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateExercise(int id, [FromBody] UpdateExerciseRequest request, CancellationToken ct)
    {
        try
        {
            var exercise = await workoutService.UpdateExerciseAsync(id, request, ct);
            return Ok(exercise);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Egzersizi siler veya pasife alır (Yalnızca Antrenör, Salon Sahibi ve SuperAdmin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteExercise(int id, CancellationToken ct)
    {
        var success = await workoutService.DeleteExerciseAsync(id, ct);
        if (!success)
            return NotFound(new { message = $"Egzersiz bulunamadı: Id={id}" });

        return Ok(new { success = true, message = "Egzersiz başarıyla kaldırıldı." });
    }
}
