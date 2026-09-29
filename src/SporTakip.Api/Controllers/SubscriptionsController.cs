using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SubscriptionsController(GymService gymService) : ControllerBase
{
    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpGet("active")]
    public async Task<ActionResult<List<SubscriptionSummaryDto>>> GetActiveSubscriptions(CancellationToken ct)
    {
        var subs = await gymService.GetActiveSubscriptionsAsync(ct);
        return Ok(subs);
    }

    [HttpGet("packages")]
    public async Task<ActionResult<List<PackageDto>>> GetPackages(CancellationToken ct)
    {
        var packages = await gymService.GetPackagesAsync(cancellationToken: ct);
        return Ok(packages);
    }

    [HttpPost]
    [Authorize(Roles = "SuperAdmin,Admin")]
    public async Task<ActionResult<SubscriptionSummaryDto>> CreateSubscription([FromBody] CreateSubscriptionDto dto, CancellationToken ct)
    {
        var sub = await gymService.CreateSubscriptionAsync(dto, ct);
        return Ok(sub);
    }

    [HttpPost("{id:int}/freeze")]
    public async Task<ActionResult<SubscriptionSummaryDto>> FreezeSubscription(
        int id,
        [FromBody] FreezeSubscriptionRequest request,
        CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");

        try
        {
            var result = await gymService.FreezeSubscriptionAsync(id, request, userId, isStaff, ct);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("{id:int}/unfreeze")]
    public async Task<ActionResult<SubscriptionSummaryDto>> UnfreezeSubscription(int id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");

        try
        {
            var result = await gymService.UnfreezeSubscriptionAsync(id, userId, isStaff, ct);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("{id:int}/freezes")]
    public async Task<ActionResult<List<FreezeRecordDto>>> GetSubscriptionFreezes(int id, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var isStaff = User.IsInRole("SuperAdmin") || User.IsInRole("Admin") || User.IsInRole("Coach");

        try
        {
            var result = await gymService.GetSubscriptionFreezeRecordsAsync(id, userId, isStaff, ct);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("uid");
        return int.TryParse(claim, out var id) ? id : 0;
    }
}
