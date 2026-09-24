using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/workouts")]
public class WorkoutsController(IWorkoutService workoutService) : ControllerBase
{
    #region Antrenör Şablon Endpoint'leri

    /// <summary>
    /// Yeni bir antrenman şablonu ve sıralı egzersizlerini oluşturur (Antrenör veya Admin).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPost("templates")]
    [ProducesResponseType(typeof(WorkoutTemplateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateTemplate([FromBody] CreateWorkoutTemplateRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var template = await workoutService.CreateTemplateAsync(userId, request, ct);
            return Ok(template);
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
    /// Yayınlanmış veya tüm antrenman şablonlarını listeler.
    /// </summary>
    [HttpGet("templates")]
    [ProducesResponseType(typeof(List<WorkoutTemplateDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTemplates([FromQuery] bool onlyPublished = true, CancellationToken ct = default)
    {
        var templates = await workoutService.GetTemplatesAsync(onlyPublished, ct);
        return Ok(templates);
    }

    /// <summary>
    /// Belirtilen şablonun egzersiz ve hedef set/tekrar detaylarını getirir.
    /// </summary>
    [HttpGet("templates/{id:int}")]
    [ProducesResponseType(typeof(WorkoutTemplateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetTemplateById(int id, CancellationToken ct)
    {
        var template = await workoutService.GetTemplateByIdAsync(id, ct);
        if (template == null)
            return NotFound(new { message = $"Şablon bulunamadı: Id={id}" });

        return Ok(template);
    }

    #endregion

    #region Sporcu Canlı İdman Endpoint'leri (Hevy / Nike Training Tarzı)

    /// <summary>
    /// Canlı idmanı başlatır. TemplateId verilirse şablondaki hedef set kadar boş SetLog kutucukları otomatik türetilir.
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]
    [HttpPost("start")]
    [ProducesResponseType(typeof(WorkoutLogDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> StartWorkout([FromBody] StartWorkoutRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var workoutLog = await workoutService.StartWorkoutAsync(userId, request, ct);
            return Ok(workoutLog);
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
    /// Canlı idman esnasında tek bir seti loglar (ağırlık, tekrar, süre, tamamlandı durumu).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]
    [HttpPut("sets/{setLogId:int}")]
    [ProducesResponseType(typeof(SetLogDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateSet(int setLogId, [FromBody] UpdateSetRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var setDto = await workoutService.UpdateSetAsync(userId, setLogId, request, ct);
            return Ok(setDto);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Canlı idman oturumunu tamamlar (süreyi hesaplar, puan ve antrenman notlarını kaydeder).
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]
    [HttpPost("{workoutLogId:int}/finish")]
    [ProducesResponseType(typeof(WorkoutLogDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> FinishWorkout(int workoutLogId, [FromBody] FinishWorkoutRequest request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var finishedWorkout = await workoutService.FinishWorkoutAsync(userId, workoutLogId, request, ct);
            return Ok(finishedWorkout);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Tekil bir idman oturumunun set bazlı tüm detaylarını getirir.
    /// </summary>
    [Authorize]
    [HttpGet("{workoutLogId:int}")]
    [ProducesResponseType(typeof(WorkoutLogDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetWorkoutLog(int workoutLogId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var workout = await workoutService.GetWorkoutLogByIdAsync(userId, workoutLogId, ct);
        if (workout == null)
            return NotFound(new { message = $"İdman oturumu bulunamadı: Id={workoutLogId}" });

        return Ok(workout);
    }

    /// <summary>
    /// Giriş yapan sporcunun geçmiş idman oturumlarını listeler.
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]
    [HttpGet("history")]
    [ProducesResponseType(typeof(List<WorkoutLogDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyWorkoutHistory([FromQuery] int take = 20, CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        var history = await workoutService.GetMemberWorkoutHistoryAsync(userId, take, ct);
        return Ok(history);
    }

    #endregion

    #region Progressive Overload & 1RM Endpoint'leri

    /// <summary>
    /// Belirtilen egzersiz için sporcunun kişisel rekorunu (PR), tahmini 1RM değerini ve geçmiş tamamlanan setlerini döner.
    /// </summary>
    [Authorize(Roles = "SuperAdmin, Athlete, Admin, Coach")]
    [HttpGet("progress/exercises/{exerciseId:int}")]
    [ProducesResponseType(typeof(ExerciseProgressDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetExerciseProgress(int exerciseId, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        try
        {
            var progress = await workoutService.GetExerciseProgressAsync(userId, exerciseId, ct);
            return Ok(progress);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    #endregion

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}
