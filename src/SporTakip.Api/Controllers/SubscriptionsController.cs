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
}
