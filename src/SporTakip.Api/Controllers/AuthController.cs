using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SporTakip.Api.Models;
using SporTakip.Api.Services;

namespace SporTakip.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService) : ControllerBase
{
    /// <summary>
    /// Telefon numarasına 6 haneli OTP kodu gönderir (SMS simülasyonu konsola basılır).
    /// Eski üye veya antrenör ise otomatik AppUser ile eşleştirilir.
    /// </summary>
    [HttpPost("send-otp")]
    [ProducesResponseType(typeof(SendOtpResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(SendOtpResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SendOtp([FromBody] SendOtpRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Phone))
        {
            return BadRequest(new SendOtpResponse(false, "Telefon numarası zorunludur.", request.Phone ?? string.Empty, DateTime.UtcNow));
        }

        var result = await authService.SendOtpAsync(request, ct);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// 6 haneli OTP kodunu doğrular. Başarılı ise JWT Access Token ve Refresh Token döner.
    /// </summary>
    [HttpPost("verify-otp")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Phone) || string.IsNullOrWhiteSpace(request.Code))
        {
            return BadRequest(new AuthResponse(false, "Telefon numarası ve doğrulama kodu zorunludur.", null, null, 0, null));
        }

        var result = await authService.VerifyOtpAsync(request, ct);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Refresh Token kullanarak yeni bir JWT Access Token ve yeni Refresh Token üretir.
    /// </summary>
    [HttpPost("refresh-token")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            return BadRequest(new AuthResponse(false, "Yenileme token'ı zorunludur.", null, null, 0, null));
        }

        var result = await authService.RefreshTokenAsync(request, ct);
        if (!result.Success)
        {
            return BadRequest(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Oturumu açık olan kullanıcının kimlik ve profil bilgilerini döner (JWT korumalı).
    /// </summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(AuthUserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetCurrentUser(CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("uid");

        if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Geçersiz kullanıcı oturumu." });
        }

        var profile = await authService.GetCurrentUserProfileAsync(userId, ct);
        if (profile == null)
        {
            return NotFound(new { message = "Kullanıcı profili bulunamadı." });
        }

        return Ok(profile);
    }
}
