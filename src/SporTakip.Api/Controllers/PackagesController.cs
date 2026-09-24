using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PackagesController(GymService gymService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<PackageDto>>> GetPackages([FromQuery] bool all = false, CancellationToken ct = default)
    {
        var packages = await gymService.GetPackagesAsync(includeInactive: all, cancellationToken: ct);
        return Ok(packages);
    }

    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPost]
    public async Task<ActionResult<PackageDto>> CreatePackage([FromBody] CreatePackageDto dto, CancellationToken ct)
    {
        try
        {
            var package = await gymService.CreatePackageAsync(dto, ct);
            return Ok(package);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [Authorize(Roles = "SuperAdmin, Coach, Admin")]
    [HttpPut("{id}")]
    public async Task<ActionResult<PackageDto>> UpdatePackage(int id, [FromBody] UpdatePackageDto dto, CancellationToken ct)
    {
        try
        {
            var package = await gymService.UpdatePackageAsync(id, dto, ct);
            return Ok(package);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [Authorize(Roles = "SuperAdmin, Admin")]
    [HttpDelete("{id}")]
    public async Task<ActionResult> DeletePackage(int id, CancellationToken ct)
    {
        try
        {
            await gymService.DeletePackageAsync(id, ct);
            return Ok(new { message = "Paket başarıyla silindi veya pasife alındı." });
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }
}
